import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import DailyProgressLog from "../models/dailyProgressLog.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import Installation from "../models/installation.model.js";
import { isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import TaskAssignment from "../models/taskAssignment.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { uploadFileToCloudinary, deleteCloudinaryFile, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "daily-progress");

// Generate the next sequential log ID like LOG-001, LOG-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse
// a number (count-based generation would collide after a record is deleted).
const generateLogId = async () => {
    const lastDoc = await DailyProgressLog.findOne({ logId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("logId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.logId) {
        const m = lastDoc.logId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `LOG-${String(max + 1).padStart(3, "0")}`;
};

/** Escape a string so it can be used safely inside a RegExp literal. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Material budget for a project, taken from the Installation's material
 * checklist. The daily log's project name is matched to an Installation via
 * the Project Approval's customer name so the two modules stay consistent.
 * Returns { lowerCaseName: { name, allowed } }.
 */
const getProjectMaterialAllowances = async (project) => {
    if (!project) return {};
    const approvals = await ProjectApproval.find({
        projectName: { $regex: new RegExp(`^${escapeRegExp(project)}$`, "i") }
    }).select("customerName").lean();
    const customers = [...new Set(approvals.map((a) => a.customerName).filter(Boolean))];
    let installations = [];
    if (customers.length) {
        installations = await Installation.find({ customerName: { $in: customers } }).lean();
    }
    const allowances = {};
    installations.forEach((inst) =>
        (inst.materials || []).forEach((m) => {
            // Installation materials store the product name under `productName`;
            // older/legacy entries may use `name`. "Not Available" items are
            // excluded from the budget — you can only use what's available.
            if (
                m &&
                typeof m === "object" &&
                (m.productName || m.name) &&
                Number(m.quantity) > 0 &&
                m.status !== "Not Available"
            ) {
                const matName = m.productName || m.name;
                const key = String(matName).toLowerCase();
                allowances[key] = {
                    name: matName,
                    allowed: (allowances[key]?.allowed || 0) + (Number(m.quantity) || 0)
                };
            }
        })
    );
    return allowances;
};

/** Sum the materialUsage already logged for a project (optionally excluding one log). */
const getProjectUsedMaterials = async (project, excludeLogId) => {
    const filter = { project: { $regex: new RegExp(`^${escapeRegExp(project)}$`, "i") } };
    // Only exclude when a valid Mongo id is supplied — a missing/malformed
    // excludeLogId (e.g. "undefined") must never crash the query with a CastError.
    if (excludeLogId && mongoose.isValidObjectId(excludeLogId)) {
        filter._id = { $ne: excludeLogId };
    }
    const logs = await DailyProgressLog.find(filter).select("materialUsage").lean();
    const used = {};
    logs.forEach((log) =>
        (log.materialUsage || []).forEach((u) => {
            if (u?.name) {
                const key = String(u.name).toLowerCase();
                used[key] = (used[key] || 0) + (Number(u.qty) || 0);
            }
        })
    );
    return used;
};

/**
 * Enforce the project's installation material budget: a technician may not log
 * more than the Installation allows for a material across ALL logs of the
 * project. Returns an error message when the limit would be exceeded.
 */
const validateProjectMaterialLimit = async (project, materialUsage, excludeLogId) => {
    if (!project || !Array.isArray(materialUsage) || !materialUsage.length) return null;
    const allowances = await getProjectMaterialAllowances(project);
    if (!Object.keys(allowances).length) return null; // no installation budget → no cap
    const used = await getProjectUsedMaterials(project, excludeLogId);
    for (const entry of materialUsage) {
        const key = String(entry?.name).toLowerCase();
        const allowance = allowances[key];
        if (!allowance) continue; // not in the installation budget
        const total = (used[key] || 0) + (Number(entry.qty) || 0);
        if (total > allowance.allowed) {
            const remaining = Math.max(0, allowance.allowed - (used[key] || 0));
            return `Only ${remaining} more unit(s) of "${allowance.name}" can be logged for this project (installation limit: ${allowance.allowed}).`;
        }
    }
    return null;
};

/** Derive the human-readable materials summary + total qty from structured usage. */
const deriveMaterialSummary = (body) => {
    const usage = Array.isArray(body?.materialUsage) ? body.materialUsage : [];
    if (!usage.length) return body;
    return {
        ...body,
        materials: usage.map((u) => `${u.name} ×${u.qty}`).join(", "),
        qty: usage.reduce((sum, u) => sum + (Number(u.qty) || 0), 0)
    };
};

/**
 * Sync the matching ProjectProgress record from the latest daily log of a project.
 * Called after create / update / delete so the project board always reflects
 * the most recent field report (progress %, installation milestone, delay).
 */
const syncProjectProgress = async (projectName) => {
    if (!projectName) return;
    try {
        const progress = await ProjectProgress.findOne({
            projectName: { $regex: new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
        });
        if (!progress) return;
        const latest = await DailyProgressLog.findOne({ project: projectName }).sort({ date: -1 });
        if (!latest) return;

        // The Installation module is the source of truth for the Installation
        // Started milestone: once an installation exists for the lead it is
        // Completed (the installation controller marks it so). A daily field
        // report must never downgrade it back to "In Progress" just because
        // its progress % is below 100.
        const hasInstallation = progress.leadId
            ? await Installation.exists({ leadId: progress.leadId })
            : false;
        const updates = {
            completionPercentage: latest.progress || 0,
            "milestones.installationStarted": hasInstallation
                ? "Completed"
                : latest.progress >= 100
                ? "Completed"
                : "In Progress"
        };
        if (latest.delayStatus === "Yes") {
            updates.delayStatus = "Yes";
            updates.delayReason = latest.delayReason || progress.delayReason;
        } else {
            updates.delayStatus = "No";
        }
        await ProjectProgress.updateOne({ _id: progress._id }, updates);
    } catch (error) {
        console.error("Sync Project Progress Error:", error);
    }
};

/** Collect the file entries (images + videos) referenced by a log. */
const collectFileEntries = (log) => {
    if (!log) return [];
    return [...(log.images || []), ...(log.videos || [])]
        .filter((f) => f && (typeof f === "string" || f?.url));
};

/** Collect the stored file URLs (images + videos) referenced by a log. */
const collectFileUrls = (log) => {
    if (!log) return [];
    return [...(log.images || []), ...(log.videos || [])]
        .map((f) => (typeof f === "string" ? f : f?.url))
        .filter(Boolean);
};

/** Normalize an update body's image/video entries into URL strings. */
const bodyFileUrls = (body) => {
    const items = [...(body?.images || []), ...(body?.videos || [])];
    return new Set(items.map((f) => (typeof f === "string" ? f : f?.url)).filter(Boolean));
};

/**
 * Delete uploaded files referenced by a log. New Cloudinary files are removed
 * from Cloudinary via their publicId; legacy on-disk files (pre-Cloudinary
 * uploads) are unlinked from the disk directory.
 */
const removeStoredFiles = (log) => {
    const removed = [];
    collectFileEntries(log).forEach((f) => {
        const entry = typeof f === "string" ? { url: f } : f;
        if (entry?.publicId) {
            removed.push(entry);
        } else if (entry?.url) {
            try {
                const name = entry.url.split("/").pop();
                if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return;
                const filePath = path.join(UPLOAD_DIR, name);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (error) {
                console.error("Remove stored file error:", error);
            }
        }
    });
    return removed;
};

export const createDailyProgressLog = async (req, res) => {
    try {
        let logId = await generateLogId();
        let body = deriveMaterialSummary({ ...req.body, logId });
        // Enforce the project's installation material budget before saving.
        const limitError = await validateProjectMaterialLimit(body.project, body.materialUsage);
        if (limitError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: limitError });
        }
        let log;
        try {
            log = await DailyProgressLog.create(body);
        } catch (error) {
            if (error?.code !== 11000) throw error;
            logId = await generateLogId();
            body = deriveMaterialSummary({ ...req.body, logId });
            log = await DailyProgressLog.create(body);
        }
        await syncProjectProgress(log.project);
        const initialChanges = Object.entries(log.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "daily-progress", action: "created", recordId: log._id, recordLabel: log.logId, summary: `Daily progress log ${log.logId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Daily progress log created successfully",
            data: log
        });
    } catch (error) {
        console.error("Create Daily Progress Log Error:", error);

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

export const getAllDailyProgressLogs = async (req, res) => {
    try {
        const { search, project, technician, status, approvalStatus, date, startDate, endDate, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (project) filter.project = { $regex: project, $options: "i" };
        if (technician) filter.technician = { $regex: technician, $options: "i" };
        if (req.user?.role === "technician") {
            if (req.user?.name) {
                filter.technician = { $regex: new RegExp(`^${escapeRegExp(req.user.name)}$`, "i") };
            } else {
                filter._id = { $exists: false };
            }
        }
        if (status && status !== "All") filter.status = status;
        if (approvalStatus && approvalStatus !== "All") filter.approvalStatus = approvalStatus;
        if (date) {
            const start = new Date(`${date}T00:00:00.000Z`);
            const end = new Date(`${date}T23:59:59.999Z`);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                filter.date = { $gte: start, $lte: end };
            }
        } else if (startDate || endDate) {
            filter.date = {};
            if (startDate) {
                const start = new Date(`${startDate}T00:00:00.000Z`);
                if (!isNaN(start.getTime())) filter.date.$gte = start;
            }
            if (endDate) {
                const end = new Date(`${endDate}T23:59:59.999Z`);
                if (!isNaN(end.getTime())) filter.date.$lte = end;
            }
        }
        if (search) {
            filter.$or = [
                { logId: { $regex: search, $options: "i" } },
                { project: { $regex: search, $options: "i" } },
                { technician: { $regex: search, $options: "i" } },
                { supervisorName: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "logId", "date", "project", "technician", "status", "progress", "approvalStatus"];
        const sortObj = {};
        // Default to createdAt descending so the newest logs appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await DailyProgressLog.countDocuments(filter);
        const logs = await DailyProgressLog.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean();
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: logs,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Daily Progress Logs Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getDailyProgressLogById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid daily progress log id" });
        }
        const log = await DailyProgressLog.findById(req.params.id).lean();
        if (!log) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Daily progress log not found" });
        if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(log, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this daily progress log does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: log });
    } catch (error) {
        console.error("Get Daily Progress Log By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateDailyProgressLog = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid daily progress log id" });
        }
        const existing = await DailyProgressLog.findById(req.params.id);
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Daily progress log not found" });
        const { logId, ...rawBody } = req.body;
        const body = deriveMaterialSummary(rawBody);
        const updateChanges = computeChanges(existing, rawBody);
        // Enforce the material budget against the project's installation
        // (excluding this log's own previous usage).
        const limitError = await validateProjectMaterialLimit(
            body.project || existing.project,
            body.materialUsage,
            existing._id
        );
        if (limitError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: limitError });
        }
        const log = await DailyProgressLog.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
        if (!log) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Daily progress log not found" });
        // Remove files that were dropped from the log during this update
        // (Cloudinary assets deleted after the save succeeds).
        const oldUrls = collectFileUrls(existing);
        const keptUrls = bodyFileUrls(body);
        const removedEntries = collectFileEntries(existing).filter(
            (f) => !keptUrls.has(typeof f === "string" ? f : f?.url)
        );
        if (removedEntries.length) {
            const toDelete = removedEntries.filter((f) => typeof f !== "string" && f?.publicId);
            removeStoredFiles({ images: removedEntries, videos: [] });
            await deleteCloudinaryFiles(toDelete);
        }
        // Re-sync the new project and (if the project changed) the old one too.
        await syncProjectProgress(log.project);
        if (existing.project && existing.project !== log.project) {
            await syncProjectProgress(existing.project);
        }
        await logActivity({ req, module: "daily-progress", action: "updated", recordId: log._id, recordLabel: log.logId, summary: "Daily progress log updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;
        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Daily progress log updated successfully", data: log });
    } catch (error) {
        console.error("Update Daily Progress Log Error:", error);

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

export const deleteDailyProgressLog = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid daily progress log id" });
        }
        const log = await DailyProgressLog.findByIdAndDelete(req.params.id);
        if (!log) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Daily progress log not found" });
        // Remove Cloudinary assets + any legacy on-disk files.
        const removed = removeStoredFiles(log);
        await deleteCloudinaryFiles(removed);
        await syncProjectProgress(log.project);
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Daily progress log deleted successfully" });
    } catch (error) {
        console.error("Delete Daily Progress Log Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

/**
 * Returns the project names assigned to a technician, so the Daily Progress
 * form can filter its project dropdown once a technician is selected.
 * Combines three sources (deduped):
 *   1. Projects this technician already reported logs for
 *   2. Installations assigned to this technician → their customers → projects
 *   3. ProjectProgress records that list the technician as a resource
 */
export const getTechnicianProjects = async (req, res) => {
    try {
        const { technician } = req.query;
        if (!technician || !technician.trim()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Technician name is required" });
        }
        const name = technician.trim();
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const nameRegex = new RegExp(`^${escaped}$`, "i");

        const [logProjects, installationCustomers, taskCustomers, resourceProjects] = await Promise.all([
            DailyProgressLog.find({ technician: nameRegex }).distinct("project"),
            Installation.find({ technicianName: nameRegex }).distinct("customerName"),
            TaskAssignment.find({ technicianName: nameRegex }).distinct("customerName"),
            ProjectProgress.find({ "resources.name": nameRegex }).distinct("projectName")
        ]);

        const assignedCustomers = [...new Set([...installationCustomers, ...taskCustomers].filter(Boolean))];
        const projects = new Set(logProjects.filter(Boolean));

        if (assignedCustomers.length) {
            // Case-insensitive $in so customer names differing only in case still match.
            const customerFilter = {
                customerName: {
                    $in: assignedCustomers.map((c) => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"))
                }
            };
            const byApproval = await ProjectApproval.find(customerFilter).distinct("projectName");
            byApproval.filter(Boolean).forEach((p) => projects.add(p));
        }

        resourceProjects.filter(Boolean).forEach((p) => projects.add(p));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                technician: name,
                projects: [...projects].sort((a, b) => String(a).localeCompare(String(b)))
            }
        });
    } catch (error) {
        console.error("Get Technician Projects Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

/**
 * Material budget + remaining usage for a project (from its Installation), so
 * the Daily Progress form can show how much of each material is left.
 */
export const getProjectMaterials = async (req, res) => {
    try {
        const { project, excludeLogId } = req.query;
        if (!project || !project.trim()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Project name is required" });
        }
        const name = project.trim();
        const allowances = await getProjectMaterialAllowances(name);
        // In edit mode the current log's own usage is excluded so the shown
        // "remaining" matches what the update validation will allow.
        const used = await getProjectUsedMaterials(name, excludeLogId);
        const materials = Object.values(allowances)
            .map((a) => ({
                name: a.name,
                allowed: a.allowed,
                used: used[a.name.toLowerCase()] || 0,
                remaining: Math.max(0, a.allowed - (used[a.name.toLowerCase()] || 0))
            }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: { project: name, materials }
        });
    } catch (error) {
        console.error("Get Project Materials Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

/**
 * Handles multer-uploaded images/videos. Uploads each file to Cloudinary and
 * returns file metadata (with CDN URL + publicId) that the frontend stores
 * inside the log's `images` / `videos` arrays.
 */
export const uploadDailyProgressFiles = async (req, res) => {
    try {
        const files = req.files || [];
        const data = await Promise.all(files.map((f) => uploadFileToCloudinary(f, "daily-progress")));
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: data.map((m) => ({
                name: m?.originalName || "",
                url: m?.url || "",
                size: m?.size || 0,
                type: m?.mimeType || "",
                publicId: m?.publicId || ""
            }))
        });
    } catch (error) {
        console.error("Upload Daily Progress Files Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};
