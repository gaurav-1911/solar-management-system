import VendorPayment from "../models/vendorPayment.model.js";
import PurchaseOrder from "../models/purchaseOrder.model.js";
import Lead from "../models/lead.model.js";
import SolarDesign from "../models/solarDesign.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { resolveVendor } from "../utils/vendorStats.js";
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

// Generates the next sequential display id in the format INV-<year>-<seq>.
// The next sequence is derived from the largest existing suffix so deleted
// payments never cause a duplicate-key collision.
const generatePaymentId = async () => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const last = await VendorPayment.findOne({ paymentId: { $regex: `^${prefix}` } })
        .sort({ paymentId: -1 })
        .select("paymentId");
    const lastSeq = last && last.paymentId
        ? parseInt(last.paymentId.split("-").pop(), 10) || 0
        : 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
};

// Auto-derives the payment status from the given dates when a status is not
// explicitly provided: paid when a paid date exists, overdue when the due date
// has passed, otherwise pending.
const deriveStatus = (data) => {
    if (data.paidDate) return "Paid";
    if (data.status && data.status !== "Pending") return data.status;
    if (data.dueDate && data.dueDate < new Date().toISOString().slice(0, 10)) return "Overdue";
    return "Pending";
};

// Anchors a payment to a real purchase order + vendor. When a poRef is
// supplied it must exist; the payment then inherits the PO's vendor so the
// two records can never disagree. Returns { data, error } where error is a
// user-facing message when the link could not be established.
const resolvePaymentLinks = async (data) => {
    const poRef = typeof data.poRef === "string" ? data.poRef.trim() : "";

    if (poRef) {
        const po = await PurchaseOrder.findOne({ purchaseOrderId: poRef });
        if (!po) {
            return { data, error: `Purchase order ${poRef} not found` };
        }
        data.poRef = po.purchaseOrderId;
        data.vendorId = po.vendorId || (await resolveVendor(null, po.vendor))?._id || null;
        if (
            data.vendor &&
            typeof data.vendor === "string" &&
            data.vendor.trim() &&
            data.vendor.trim().toLowerCase() !== po.vendor.trim().toLowerCase()
        ) {
            return { data, error: `Purchase order ${po.purchaseOrderId} belongs to ${po.vendor}` };
        }
        data.vendor = po.vendor;
        // Inherit the project linkage from the purchase order so a payment can
        // never disagree with the PO it settles (and the actual project cost
        // rollup stays consistent).
        data.leadId = po.leadId || "";
        data.customerName = po.customerName || "";
        data.projectName = po.projectName || "";
        return { data, error: null };
    }

    const vendor = await resolveVendor(data.vendorId, data.vendor);
    data.vendorId = vendor ? vendor._id : null;
    if (vendor) data.vendor = vendor.name;
    await resolveLead(data);
    return { data, error: null };
};

export const createVendorPayment = async (req, res) => {
    try {
        let data = { ...req.body };
        if (!data.paymentId) {
            data.paymentId = await generatePaymentId();
        }
        if (data.paidDate) {
            data.status = "Paid";
        } else if (!data.status) {
            data.status = deriveStatus(data);
        }

        const linked = await resolvePaymentLinks(data);
        if (linked.error) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: linked.error
            });
        }
        data = linked.data;

        const payment = await VendorPayment.create(data);

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Payment recorded successfully",
            data: payment
        });
    } catch (error) {
        console.error("Create Vendor Payment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllVendorPayments = async (req, res) => {
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
                { paymentId: { $regex: search, $options: "i" } },
                { poRef: { $regex: search, $options: "i" } },
                { vendor: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await VendorPayment.countDocuments(filter);
        const payments = await VendorPayment.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: payments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Vendor Payments Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getVendorPaymentById = async (req, res) => {
    try {
        const payment = await VendorPayment.findById(req.params.id);

        if (!payment) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: payment
        });
    } catch (error) {
        console.error("Get Vendor Payment By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateVendorPayment = async (req, res) => {
    try {
        let data = { ...req.body };
        if (data.paidDate) {
            data.status = "Paid";
        } else if (!data.status) {
            data.status = deriveStatus(data);
        }

        const linked = await resolvePaymentLinks(data);
        if (linked.error) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: linked.error
            });
        }
        data = linked.data;

        const payment = await VendorPayment.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!payment) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Payment updated successfully",
            data: payment
        });
    } catch (error) {
        console.error("Update Vendor Payment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteVendorPayment = async (req, res) => {
    try {
        const payment = await VendorPayment.findByIdAndDelete(req.params.id);

        if (!payment) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Payment deleted successfully"
        });
    } catch (error) {
        console.error("Delete Vendor Payment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
