import AMC from "../models/amc.model.js";
import ServiceVisit from "../models/serviceVisit.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Generate the next sequential human-friendly ID like AMC-501, AMC-502, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
const generateAmcId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every AMC ID in the collection.
    const lastDoc = await AMC.findOne({ amcId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("amcId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.amcId) {
        const m = lastDoc.amcId.match(/^AMC-(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `AMC-${String(max + 1).padStart(3, "0")}`;
};

export const createAMC = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same AMC ID
        let amc;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.amcId = await generateAmcId();
                amc = await AMC.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }
        try { logActivity({ module: "amc", action: "created", recordId: amc._id, recordLabel: amc.amcId || amc.customer, req, summary: `AMC ${amc.amcId} created for ${amc.customer || "customer"}` }); } catch (_) {}
        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "AMC created successfully", data: amc });
    } catch (error) {
        console.error("Create AMC Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllAMCs = async (req, res) => {
    try {
        const { search, status, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (status && status !== "All") filter.status = status;
        if (search) {
            filter.$or = [
                { customer: { $regex: search, $options: "i" } }
            ];
        }
        const sortObj = {};
        if (sortField) sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        else sortObj.createdAt = -1;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await AMC.countDocuments(filter);
        const amcs = await AMC.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit));
        return res.status(HTTP_STATUS.OK).json({ success: true, data: amcs, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error("Get All AMCs Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAMCById = async (req, res) => {
    try {
        const amc = await AMC.findById(req.params.id);
        if (!amc) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "AMC not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: amc });
    } catch (error) {
        console.error("Get AMC By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateAMC = async (req, res) => {
    try {
        const oldDoc = await AMC.findById(req.params.id).lean();
        if (!oldDoc) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "AMC not found" });

        // Validate status transition if status is being changed
        if (req.body.status && req.body.status !== oldDoc.status) {
            const transitionError = validateStatusTransition("amc", oldDoc.status, req.body.status);
            if (transitionError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: transitionError
                });
            }
        }

        const amc = await AMC.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        try { const changes = computeChanges(oldDoc, req.body); logActivity({ module: "amc", action: "updated", recordId: amc._id, recordLabel: amc.amcId || amc.customer, req, changes, summary: `AMC ${amc.amcId || amc._id} updated` }); } catch (_) {}
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "AMC updated successfully", data: amc });
    } catch (error) {
        console.error("Update AMC Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const logAmcVisit = async (req, res) => {
    try {
        const { date, technician, notes } = req.body;
        const amc = await AMC.findById(req.params.id);
        if (!amc) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "AMC not found" });

        // Generate visit ID
        const lastDoc = await ServiceVisit.findOne({ visitId: { $exists: true, $ne: null } })
            .sort({ _id: -1 }).select("visitId").lean();
        let max = 0;
        if (lastDoc?.visitId) {
            const m = lastDoc.visitId.match(/^VS-(\d+)$/);
            if (m) max = parseInt(m[1], 10);
        }
        const visitId = `VS-${String(max + 1).padStart(3, "0")}`;

        // Create the service visit linked to this AMC
        const visit = await ServiceVisit.create({
            visitId,
            date: date || new Date(),
            customer: amc.customer,
            technician: technician || req.user?.name || "",
            linkType: "AMC",
            linkId: amc.amcId || String(amc._id),
            status: "completed",
            notes: notes || "",
        });

        // Increment visitsUsed on the AMC
        const updatedAmc = await AMC.findByIdAndUpdate(
            amc._id,
            { $inc: { visitsUsed: 1 }, lastService: new Date() },
            { new: true, runValidators: true }
        );

        try { logActivity({ module: "amc", action: "visit_logged", recordId: amc._id, recordLabel: amc.amcId || amc.customer, req, summary: `Visit ${visitId} logged for AMC ${amc.amcId || amc._id} by ${technician || req.user?.name || "technician"}` }); } catch (_) {}

        return res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Visit logged successfully", data: { visit, amc: updatedAmc } });
    } catch (error) {
        console.error("Log AMC Visit Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteAMC = async (req, res) => {
    try {
        const amc = await AMC.findByIdAndDelete(req.params.id);
        if (!amc) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "AMC not found" });
        try { logActivity({ module: "amc", action: "deleted", recordId: amc._id, recordLabel: amc.amcId || amc.customer, req, summary: `AMC ${amc.amcId || amc._id} deleted` }); } catch (_) {}
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "AMC deleted successfully" });
    } catch (error) {
        console.error("Delete AMC Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
