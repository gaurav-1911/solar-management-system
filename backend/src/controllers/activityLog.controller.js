import mongoose from "mongoose";
import ActivityLog from "../models/activityLog.model.js";
import FollowUp from "../models/followUp.model.js";

/**
 * Filter out duplicate activity logs occurring within the same minute window for the same entity
 */
const dedupeLogs = (logs = []) => {
    const seen = new Set();
    return logs.filter((log) => {
        const timeKey = log.createdAt ? new Date(log.createdAt).toISOString().slice(0, 16) : ""; // YYYY-MM-DDTHH:mm
        const moduleKey = log.module || "";
        const actionKey = log.action || "";
        const userKey = log.userName || "";
        // Disregard slight differences in summary wording if time, module, user, and action match
        const dedupeKey = `${timeKey}_${moduleKey}_${actionKey}_${userKey}`;

        if (seen.has(dedupeKey)) {
            return false;
        }
        seen.add(dedupeKey);
        return true;
    });
};

/**
 * GET /api/activity-logs
 * Paginated, filterable list of all activity logs.
 */
export const getActivityLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            module,
            action,
            userId,
            search,
            startDate,
            endDate,
            sortField = "createdAt",
            sortDir = -1
        } = req.query;

        const filter = {};

        if (module) filter.module = module;
        if (action) filter.action = action;
        if (userId) filter.userId = userId;

        if (search) {
            filter.$or = [
                { summary: { $regex: search, $options: "i" } },
                { recordLabel: { $regex: search, $options: "i" } },
                { userName: { $regex: search, $options: "i" } },
                { module: { $regex: search, $options: "i" } }
            ];
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortField] = parseInt(sortDir, 10);

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);

        const uniqueLogs = dedupeLogs(logs);

        res.status(200).json({
            success: true,
            message: "Activity logs fetched successfully",
            data: uniqueLogs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: uniqueLogs.length,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/activity-logs/stats
 * Summary counts for dashboard stat cards.
 */
export const getActivityStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalLogs,
            todayCreated,
            todayUpdated,
            todayDeleted,
            byModule,
            byAction
        ] = await Promise.all([
            ActivityLog.countDocuments(),
            ActivityLog.countDocuments({ action: "created", createdAt: { $gte: today } }),
            ActivityLog.countDocuments({ action: "updated", createdAt: { $gte: today } }),
            ActivityLog.countDocuments({ action: "deleted", createdAt: { $gte: today } }),
            ActivityLog.aggregate([
                { $group: { _id: "$module", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 15 }
            ]),
            ActivityLog.aggregate([
                { $group: { _id: "$action", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        res.status(200).json({
            success: true,
            message: "Activity stats fetched successfully",
            data: {
                totalLogs,
                todayCreated,
                todayUpdated,
                todayDeleted,
                todayTotal: todayCreated + todayUpdated + todayDeleted,
                byModule,
                byAction
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/activity-logs/record/:id
 * All activity logs for a specific record.
 */
export const getActivityLogsByRecord = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const recordId = req.params.id;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Try finding active record in FollowUp / Lead / Customer to get exact contact name & _id
        let activeRecord = null;
        if (mongoose.isValidObjectId(recordId)) {
            activeRecord = await FollowUp.findById(recordId).lean().catch(() => null);
        }
        if (!activeRecord) {
            activeRecord = await FollowUp.findOne({ followUpId: recordId }).lean().catch(() => null);
        }

        let filter = { recordId: String(recordId) };

        if (activeRecord) {
            const mongoId = activeRecord._id.toString();
            const fuId = activeRecord.followUpId;
            const contact = (activeRecord.contactName || "").trim();

            const matchConditions = [
                { recordId: mongoId }
            ];
            if (fuId) {
                if (contact) {
                    matchConditions.push({
                        recordId: fuId,
                        recordLabel: { $regex: contact, $options: "i" }
                    });
                } else {
                    matchConditions.push({ recordId: fuId });
                }
            }

            filter = { $or: matchConditions };
        }

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);

        const uniqueLogs = dedupeLogs(logs);

        res.status(200).json({
            success: true,
            message: "Record activity logs fetched successfully",
            data: uniqueLogs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: uniqueLogs.length,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/activity-logs
 * Create a new activity log record.
 */
export const createActivityLog = async (req, res) => {
    try {
        res.locals.activityLogged = true;
        const { module, action, recordId, recordLabel, summary, changes } = req.body;
        const validAction = action === "status_changed" ? "status_change" : action || "updated";

        const log = await ActivityLog.create({
            module: module || "leads",
            action: validAction,
            recordId: recordId ? String(recordId) : null,
            recordLabel: recordLabel || "",
            userId: req.user?.userId || req.user?.id || req.user?._id || null,
            userName: req.user?.name || req.user?.email || "Super Admin",
            userRole: req.user?.role || "super_admin",
            changes: Array.isArray(changes) ? changes : [],
            summary: summary || "Activity logged",
            ipAddress: req.headers["x-forwarded-for"] || req.ip || "",
            userAgent: req.headers["user-agent"] || ""
        });

        res.status(201).json({
            success: true,
            message: "Activity log created successfully",
            data: log
        });
    } catch (error) {
        console.error("Create activity log error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
