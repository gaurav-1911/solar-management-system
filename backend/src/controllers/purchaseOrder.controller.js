import PurchaseOrder from "../models/purchaseOrder.model.js";
import Lead from "../models/lead.model.js";
import SolarDesign from "../models/solarDesign.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { resolveVendor, recomputeVendorStats } from "../utils/vendorStats.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// When a leadId reference is provided, denormalize the customer and project
// names so the display fields always match the linked project, even if the
// lead or design is later renamed. A bad leadId never blocks the save.
const resolveLead = async (data) => {
    const leadId = typeof data.leadId === "string" ? data.leadId.trim() : "";
    if (!leadId) {
        // Only force-clear when the client explicitly sent the field: a
        // partial update that omits leadId must not wipe the stored link
        // (creates rely on the model default instead).
        if (data.leadId !== undefined) {
            data.leadId = "";
            data.customerName = data.customerName || "";
            data.projectName = data.projectName || "";
        }
        return data;
    }
    data.leadId = leadId;
    const [lead, design] = await Promise.all([
        Lead.findOne({ leadId }).select("name").lean().catch(() => null),
        SolarDesign.findOne({ leadId }).select("customerName projectName").lean().catch(() => null)
    ]);
    data.customerName = (design && design.customerName) || (lead && lead.name) || data.customerName || "";
    data.projectName = (design && design.projectName) || data.projectName || "";
    return data;
};

// Generates the next sequential display id in the format PO-<year>-<seq>.
// The next sequence is derived from the largest existing suffix so deleted
// orders never cause a duplicate-key collision.
const generatePurchaseOrderId = async () => {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const last = await PurchaseOrder.findOne({ purchaseOrderId: { $regex: `^${prefix}` } })
        .sort({ purchaseOrderId: -1 })
        .select("purchaseOrderId");
    const lastSeq = last && last.purchaseOrderId
        ? parseInt(last.purchaseOrderId.split("-").pop(), 10) || 0
        : 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
};

export const createPurchaseOrder = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.purchaseOrderId) {
            data.purchaseOrderId = await generatePurchaseOrderId();
        }

        // Link the PO to its vendor by ObjectId (resolved from the id or the
        // plain name the UI sends) so vendor totals stay in sync.
        const vendor = await resolveVendor(data.vendorId, data.vendor);
        if (vendor) {
            data.vendorId = vendor._id;
            data.vendor = vendor.name;
        }
        await resolveLead(data);

        const purchaseOrder = await PurchaseOrder.create(data);

        // Keep the vendor's order count / spend / delivery score accurate.
        if (vendor) await recomputeVendorStats(vendor._id);

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Purchase order created successfully",
            data: purchaseOrder
        });
    } catch (error) {
        console.error("Create Purchase Order Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllPurchaseOrders = async (req, res) => {
    try {
        const {
            search,
            status,
            vendor,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};
        applyCustomerScope(filter, req);

        if (status && status !== "all") {
            filter.status = status;
        }
        if (vendor && vendor !== "all") {
            filter.vendor = vendor;
        }
        if (search) {
            filter.$or = [
                { purchaseOrderId: { $regex: search, $options: "i" } },
                { vendor: { $regex: search, $options: "i" } },
                { items: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { projectName: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await PurchaseOrder.countDocuments(filter);
        const purchaseOrders = await PurchaseOrder.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: purchaseOrders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Purchase Orders Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getPurchaseOrderById = async (req, res) => {
    try {
        const purchaseOrder = await PurchaseOrder.findById(req.params.id);

        if (!purchaseOrder) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Purchase order not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: purchaseOrder
        });
    } catch (error) {
        console.error("Get Purchase Order By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updatePurchaseOrder = async (req, res) => {
    try {
        const existing = await PurchaseOrder.findById(req.params.id);

        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Purchase order not found"
            });
        }

        const data = { ...req.body };
        const vendor = await resolveVendor(data.vendorId, data.vendor);
        if (vendor) {
            data.vendorId = vendor._id;
            data.vendor = vendor.name;
        }
        await resolveLead(data);

        const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        // Recompute totals for the previous vendor (if the PO moved) and for
        // the current one so rollup fields never drift out of date. Legacy POs
        // without a vendorId are resolved by name so they still roll up.
        let prevVendorId = existing.vendorId;
        if (!prevVendorId && existing.vendor) {
            const prevVendor = await resolveVendor(null, existing.vendor);
            prevVendorId = prevVendor ? prevVendor._id : null;
        }
        if (prevVendorId) await recomputeVendorStats(prevVendorId);
        if (vendor && (!prevVendorId || String(prevVendorId) !== String(vendor._id))) {
            await recomputeVendorStats(vendor._id);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Purchase order updated successfully",
            data: purchaseOrder
        });
    } catch (error) {
        console.error("Update Purchase Order Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deletePurchaseOrder = async (req, res) => {
    try {
        const purchaseOrder = await PurchaseOrder.findByIdAndDelete(req.params.id);

        if (!purchaseOrder) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Purchase order not found"
            });
        }

        // Reflect the deletion in the vendor's order count / spend. Legacy POs
        // without a vendorId are resolved by name so the totals still update.
        let vendorId = purchaseOrder.vendorId;
        if (!vendorId && purchaseOrder.vendor) {
            const vendorDoc = await resolveVendor(null, purchaseOrder.vendor);
            vendorId = vendorDoc ? vendorDoc._id : null;
        }
        if (vendorId) await recomputeVendorStats(vendorId);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Purchase order deleted successfully"
        });
    } catch (error) {
        console.error("Delete Purchase Order Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
