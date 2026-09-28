import VendorEscalation from "../models/vendorEscalation.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";

// Generate the next sequential human-friendly ID like ESC-210, ESC-211, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateEscalationId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every escalation ID in the collection.
    const lastDoc = await VendorEscalation.findOne({ escalationId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("escalationId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.escalationId) {
        const m = lastDoc.escalationId.match(/^ESC-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `ESC-${String(max + 1).padStart(3, "0")}`;
};

export const createVendorEscalation = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same ID
        let escalation;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.escalationId = await generateEscalationId();
                escalation = await VendorEscalation.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Escalation created successfully", data: escalation });
    } catch (error) {
        console.error("Create Vendor Escalation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllVendorEscalations = async (req, res) => {
    try {
        const { search, status, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "all") filter.status = status;
        if (search) {
            filter.$or = [
                { claimId: { $regex: search, $options: "i" } },
                { manufacturer: { $regex: search, $options: "i" } }
            ];
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await VendorEscalation.countDocuments(filter);
        const escalations = await VendorEscalation.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: escalations, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All Vendor Escalations Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getVendorEscalationById = async (req, res) => {
    try {
        const escalation = await VendorEscalation.findById(req.params.id);
        if (!escalation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Escalation not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: escalation });
    } catch (error) {
        console.error("Get Vendor Escalation By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateVendorEscalation = async (req, res) => {
    try {
        const escalation = await VendorEscalation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!escalation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Escalation not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Escalation updated successfully", data: escalation });
    } catch (error) {
        console.error("Update Vendor Escalation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteVendorEscalation = async (req, res) => {
    try {
        const escalation = await VendorEscalation.findByIdAndDelete(req.params.id);
        if (!escalation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Escalation not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Escalation deleted successfully" });
    } catch (error) {
        console.error("Delete Vendor Escalation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
