import WarrantyClaim from "../models/warrantyClaim.model.js";
import { getCustomerScope, mergeOwnershipFilter } from "../utils/ownershipScope.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

// Generate the next sequential human-friendly ID like CLM-3301, CLM-3302, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateClaimId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every claim ID in the collection.
    const lastDoc = await WarrantyClaim.findOne({ claimId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("claimId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.claimId) {
        const m = lastDoc.claimId.match(/^CLM-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `CLM-${String(max + 1).padStart(4, "0")}`;
};

export const createWarrantyClaim = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same ID
        let claim;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.claimId = await generateClaimId();
                claim = await WarrantyClaim.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Claim submitted successfully", data: claim });
    } catch (error) {
        console.error("Create Warranty Claim Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllWarrantyClaims = async (req, res) => {
    try {
        const { search, priority, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (priority && priority !== "all") filter.priority = priority;
        if (search) {
            filter.$or = [
                { warrantyId: { $regex: search, $options: "i" } },
                { customer: { $regex: search, $options: "i" } },
                { serial: { $regex: search, $options: "i" } }
            ];
        }
        // Customers see only their own warranty claims.
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
        const total = await WarrantyClaim.countDocuments(filter);
        const claims = await WarrantyClaim.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: claims, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Warranty Claims Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getWarrantyClaimById = async (req, res) => {
    try {
        const claim = await WarrantyClaim.findById(req.params.id);
        if (!claim) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Claim not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: claim });
    } catch (error) {
        console.error("Get Warranty Claim By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateWarrantyClaim = async (req, res) => {
    try {
        const claim = await WarrantyClaim.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!claim) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Claim not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Claim updated successfully", data: claim });
    } catch (error) {
        console.error("Update Warranty Claim Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteWarrantyClaim = async (req, res) => {
    try {
        const claim = await WarrantyClaim.findByIdAndDelete(req.params.id);
        if (!claim) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Claim not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Claim deleted successfully" });
    } catch (error) {
        console.error("Delete Warranty Claim Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
