import Vendor from "../models/vendor.model.js";
import PurchaseOrder from "../models/purchaseOrder.model.js";
import VendorPayment from "../models/vendorPayment.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const createVendor = async (req, res) => {
    try {
        const vendor = await Vendor.create(req.body);

        logActivity({
            module: "vendors",
            action: "created",
            recordId: vendor.vendorId || String(vendor._id),
            recordLabel: vendor.name,
            req,
            changes: computeChanges({}, vendor.toObject ? vendor.toObject() : vendor),
            summary: `Vendor created: ${vendor.name}`
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Vendor created successfully",
            data: vendor
        });
    } catch (error) {
        console.error("Create Vendor Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllVendors = async (req, res) => {
    try {
        const {
            search,
            status,
            category,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (status && status !== "all") {
            filter.status = status === "active" ? "Active" : "Inactive";
        }
        if (category && category !== "all") {
            // Match the legacy single `category` OR any entry in the `categories`
            // array, so multi-category vendors are filterable by any category.
            filter.$or = [{ category }, { categories: category }];
        }
        if (search) {
            const searchOr = [
                { name: { $regex: search, $options: "i" } },
                { country: { $regex: search, $options: "i" } }
            ];
            if (filter.$or) {
                // Both category and search given: AND them together.
                filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
                delete filter.$or;
            } else {
                filter.$or = searchOr;
            }
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Vendor.countDocuments(filter);
        const vendors = await Vendor.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: vendors,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Vendors Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getVendorById = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.params.id);

        if (!vendor) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Vendor not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: vendor
        });
    } catch (error) {
        console.error("Get Vendor By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateVendor = async (req, res) => {
    try {
        const existing = await Vendor.findById(req.params.id);

        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Vendor not found"
            });
        }

        const vendor = await Vendor.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        logActivity({
            module: "vendors",
            action: "updated",
            recordId: vendor.vendorId || String(vendor._id),
            recordLabel: vendor.name,
            req,
            changes: computeChanges(existing.toObject ? existing.toObject() : existing, vendor.toObject ? vendor.toObject() : vendor),
            summary: `Updated vendor ${vendor.name}`
        });

        // Keep denormalized purchase order / payment records pointing at the
        // same vendor when it is renamed, so name-based links stay intact.
        if (existing.name !== vendor.name) {
            await Promise.all([
                PurchaseOrder.updateMany(
                    { vendor: existing.name },
                    { $set: { vendor: vendor.name, vendorId: vendor._id } }
                ),
                VendorPayment.updateMany(
                    { vendor: existing.name },
                    { $set: { vendor: vendor.name, vendorId: vendor._id } }
                )
            ]);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Vendor updated successfully",
            data: vendor
        });
    } catch (error) {
        console.error("Update Vendor Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteVendor = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.params.id);

        if (!vendor) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Vendor not found"
            });
        }

        // Once links are real, never allow deleting a vendor that still has
        // purchase orders or payments attached — that would orphan them.
        const linkedPOs = await PurchaseOrder.countDocuments({
            $or: [{ vendorId: vendor._id }, { vendor: vendor.name }]
        });
        const linkedPayments = await VendorPayment.countDocuments({
            $or: [{ vendorId: vendor._id }, { vendor: vendor.name }]
        });

        if (linkedPOs > 0 || linkedPayments > 0) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: `Cannot delete ${vendor.name}: ${linkedPOs} purchase order(s) and ${linkedPayments} payment(s) are still linked. Delete or reassign them first.`
            });
        }

        await Vendor.findByIdAndDelete(req.params.id);

        logActivity({
            module: "vendors",
            action: "deleted",
            recordId: vendor.vendorId || String(vendor._id),
            recordLabel: vendor.name,
            req,
            summary: `Deleted vendor ${vendor.name}`
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Vendor deleted successfully"
        });
    } catch (error) {
        console.error("Delete Vendor Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
