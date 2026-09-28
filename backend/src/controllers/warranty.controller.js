import Warranty from "../models/warranty.model.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

// Generate the next sequential human-friendly ID like WR-1042, WR-1043, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateWarrantyId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every warranty ID in the collection.
    const lastDoc = await Warranty.findOne({ warrantyId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("warrantyId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.warrantyId) {
        const m = lastDoc.warrantyId.match(/^WR-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `WR-${String(max + 1).padStart(4, "0")}`;
};

export const createWarranty = async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.installed && data.periodYears) {
            const expires = new Date(data.installed);
            expires.setFullYear(expires.getFullYear() + data.periodYears);
            data.expires = expires;
        }
        // Retry on duplicate-key so two simultaneous creates don't collide on the same ID
        let warranty;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.warrantyId = await generateWarrantyId();
                warranty = await Warranty.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Warranty registered successfully", data: warranty });
    } catch (error) {
        console.error("Create Warranty Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllWarranties = async (req, res) => {
    try {
        const { search, status, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "all") filter.status = status;
        if (search) {
            filter.$or = [
                { serial: { $regex: search, $options: "i" } },
                { customer: { $regex: search, $options: "i" } },
                { model: { $regex: search, $options: "i" } },
                { component: { $regex: search, $options: "i" } }
            ];
        }
        // Customers see only their own warranties.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customer: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Warranty.countDocuments(filter);
        const warranties = await Warranty.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: warranties, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Warranties Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getWarrantyById = async (req, res) => {
    try {
        const warranty = await Warranty.findById(req.params.id);
        if (!warranty) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Warranty not found" });
        // Customers may only view their own warranties.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(warranty, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this warranty does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: warranty });
    } catch (error) {
        console.error("Get Warranty By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateWarranty = async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.installed && data.periodYears) {
            const expires = new Date(data.installed);
            expires.setFullYear(expires.getFullYear() + data.periodYears);
            data.expires = expires;
        }
        const warranty = await Warranty.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!warranty) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Warranty not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Warranty updated successfully", data: warranty });
    } catch (error) {
        console.error("Update Warranty Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteWarranty = async (req, res) => {
    try {
        const warranty = await Warranty.findByIdAndDelete(req.params.id);
        if (!warranty) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Warranty not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Warranty deleted successfully" });
    } catch (error) {
        console.error("Delete Warranty Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
