import mongoose from "mongoose";
import ProjectProgress from "../models/projectProgress.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Generate the next sequential human-friendly ID like PRJ-001, PRJ-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a
// number and the sequence is safe beyond 999 (lexicographic string sort is not
// reliable here).
export const generateProjectId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every project ID in the collection.
    const lastDoc = await ProjectProgress.findOne({ projectId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("projectId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.projectId) {
        const m = lastDoc.projectId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `PRJ-${String(max + 1).padStart(3, "0")}`;
};

export const createProjectProgress = async (req, res) => {
    try {
        // One Project Progress entry per lead (falling back to a name match
        // when the payload has no lead id) — a duplicate for the same project
        // must not be created a second time.
        const dup = req.body.leadId
            ? await ProjectProgress.findOne({ leadId: req.body.leadId }).lean()
            : await ProjectProgress.findOne({
                  projectName: req.body.projectName,
                  customerName: req.body.customerName
              }).lean();
        if (dup) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: `A project progress entry (${dup.projectId || dup._id}) already exists${req.body.leadId ? ` for lead ${req.body.leadId}` : ""}. Edit that entry instead of creating a duplicate.`
            });
        }
        let projectId = await generateProjectId();
        let body = { ...req.body, projectId };
        let progress;
        try {
            progress = await ProjectProgress.create(body);
        } catch (error) {
            // Extremely rare race: two creates picked the same number. Retry once.
            if (error?.code !== 11000) throw error;
            projectId = await generateProjectId();
            body = { ...req.body, projectId };
            progress = await ProjectProgress.create(body);
        }
        const initialChanges = Object.entries(progress.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "project-progress", action: "created", recordId: progress._id, recordLabel: progress.projectId, summary: `Project progress ${progress.projectId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Project progress created successfully",
            data: progress
        });
    } catch (error) {
        console.error("Create Project Progress Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllProjectProgress = async (req, res) => {
    try {
        const { search, status, health, risk, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (status && status !== "All") filter.projectStatus = status;
        if (health && health !== "All") filter.healthScore = health;
        if (risk && risk !== "All") filter.riskLevel = risk;
        if (search) {
            filter.$or = [
                { projectName: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "projectId", "projectName", "customerName", "startDate", "expectedEndDate", "completionPercentage", "projectStatus", "healthScore", "riskLevel"];
        const sortObj = {};
        // Default to createdAt descending so the newest projects appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await ProjectProgress.countDocuments(filter);
        const projects = await ProjectProgress.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: projects,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Project Progress Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getProjectProgressById = async (req, res) => {
    try {
        const progress = await ProjectProgress.findById(req.params.id).lean();
        if (!progress) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project progress not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, data: progress });
    } catch (error) {
        console.error("Get Project Progress By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateProjectProgress = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid project progress id"
            });
        }
        const existing = await ProjectProgress.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project progress not found" });
        const updateChanges = computeChanges(existing, req.body);
        const progress = await ProjectProgress.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!progress) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project progress not found" });
        await logActivity({ req, module: "project-progress", action: "updated", recordId: progress._id, recordLabel: progress.projectId, summary: "Project progress updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Project progress updated successfully", data: progress });
    } catch (error) {
        console.error("Update Project Progress Error:", error);

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const deleteProjectProgress = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid project progress id"
            });
        }
        const progress = await ProjectProgress.findByIdAndDelete(req.params.id);
        if (!progress) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Project progress not found" });
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Project progress deleted successfully" });
    } catch (error) {
        console.error("Delete Project Progress Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
