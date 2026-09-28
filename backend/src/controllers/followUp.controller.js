import mongoose from "mongoose";
import FollowUp from "../models/followUp.model.js";
import Lead from "../models/lead.model.js";
import Customer from "../models/customer.model.js";
import Activity from "../models/activity.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { formatFollowUp, generateFollowUpId } from "../utils/followUpHelpers.js";
import { computeChanges, logActivity } from "../utils/activityLogger.js";
import { sendNotification, findUserIdByName } from "../utils/notify.js";

//#region Get All Follow-Ups
export const getAllFollowUps = async (req, res) => {
    try {
        const {
            search,
            status,
            type,
            priority,
            assignedTo,
            leadId,
            customerId,
            dateFrom,
            dateTo,
            page = 1,
            limit = 10,
            sortField = "createdAt",
            sortDir = "desc"
        } = req.query;

        const filter = {};

        // Sales Manager scoping: restrict to records assigned to req.user.name
        if (req.user?.role === "sales_manager") {
            filter.assignedTo = req.user.name;
        } else if (assignedTo && assignedTo !== "All") {
            filter.assignedTo = assignedTo;
        }

        if (status && status !== "All") {
            filter.status = status;
        }

        if (type && type !== "All") {
            filter.type = type;
        }

        if (priority && priority !== "All") {
            filter.priority = priority;
        }

        if (leadId) {
            filter.leadId = leadId;
        }

        if (customerId) {
            filter.customerId = customerId;
        }

        if (dateFrom || dateTo) {
            filter.scheduledDate = {};
            if (dateFrom) {
                const start = new Date(dateFrom);
                start.setHours(0, 0, 0, 0);
                filter.scheduledDate.$gte = start;
            }
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.scheduledDate.$lte = end;
            }
        }

        if (search) {
            const regex = new RegExp(search.trim(), "i");
            filter.$or = [
                { followUpId: regex },
                { contactName: regex },
                { contactPhone: regex },
                { contactEmail: regex },
                { leadId: regex },
                { customerId: regex },
                { notes: regex }
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 10);
        const skip = (pageNum - 1) * limitNum;

        const sortOrder = sortDir === "desc" ? -1 : 1;
        const sortOptions = {};
        if (sortField === "contactName") sortOptions.contactName = sortOrder;
        else if (sortField === "status") sortOptions.status = sortOrder;
        else if (sortField === "priority") sortOptions.priority = sortOrder;
        else if (sortField === "createdAt") sortOptions.createdAt = sortOrder;
        else sortOptions.scheduledDate = sortOrder;

        const [records, total] = await Promise.all([
            FollowUp.find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            FollowUp.countDocuments(filter)
        ]);

        const formatted = records.map(formatFollowUp);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formatted,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum) || 1
            },
            total,
            page: pageNum,
            limit: limitNum
        });
    } catch (error) {
        console.error("Get All Follow-Ups Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Get Follow-Up By ID
export const getFollowUpById = async (req, res) => {
    try {
        const { id } = req.params;

        let record = null;
        if (mongoose.isValidObjectId(id)) {
            record = await FollowUp.findById(id).lean();
        }
        if (!record) {
            record = await FollowUp.findOne({ followUpId: id }).lean();
        }

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.FOLLOWUP_NOT_FOUND || "Follow-Up record not found"
            });
        }

        if (req.user?.role === "sales_manager" && record.assignedTo !== req.user.name) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Access denied: this follow-up is not assigned to you"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: formatFollowUp(record)
        });
    } catch (error) {
        console.error("Get Follow-Up By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Create Follow-Up
export const createFollowUp = async (req, res) => {
    try {
        const payload = { ...req.body };

        // Backfill contact details from Lead or Customer if missing
        if (payload.leadId && (!payload.contactName || !payload.contactPhone || !payload.contactEmail)) {
            const lead = await Lead.findOne({
                $or: [
                    { leadId: payload.leadId },
                    ...(mongoose.isValidObjectId(payload.leadId) ? [{ _id: payload.leadId }] : [])
                ]
            }).lean();
            if (lead) {
                if (!payload.contactName) payload.contactName = lead.name || "";
                if (!payload.contactPhone) payload.contactPhone = lead.phone || "";
                if (!payload.contactEmail) payload.contactEmail = lead.email || "";
            }
        }

        if (payload.customerId && (!payload.contactName || !payload.contactPhone || !payload.contactEmail)) {
            const customer = await Customer.findOne({
                $or: [
                    { customerId: payload.customerId },
                    ...(mongoose.isValidObjectId(payload.customerId) ? [{ _id: payload.customerId }] : [])
                ]
            }).lean();
            if (customer) {
                if (!payload.contactName) payload.contactName = customer.name || "";
                if (!payload.contactPhone) payload.contactPhone = customer.phone || "";
                if (!payload.contactEmail) payload.contactEmail = customer.email || "";
            }
        }

        // Retry loop for unique followUpId generation to handle concurrent writes
        let followUp = null;
        let retries = 3;

        while (retries > 0) {
            try {
                if (!payload.followUpId) {
                    payload.followUpId = await generateFollowUpId(FollowUp);
                }
                followUp = await FollowUp.create(payload);
                break;
            } catch (err) {
                if (err.code === 11000 && retries > 1) {
                    delete payload.followUpId;
                    retries--;
                } else {
                    throw err;
                }
            }
        }

        // Create ActivityLog entry with created field details
        const createdObj = followUp.toObject ? followUp.toObject() : followUp;
        const changes = computeChanges({}, createdObj);

        await logActivity({
            module: "follow-ups",
            action: "created",
            recordId: followUp._id.toString(),
            recordLabel: `${followUp.followUpId} - ${followUp.contactName}`,
            req,
            changes,
            summary: `Created ${followUp.type || "Follow-Up"} ${followUp.followUpId} for ${followUp.contactName || "Contact"} (Priority: ${followUp.priority || "Medium"}, Scheduled: ${followUp.scheduledDate ? new Date(followUp.scheduledDate).toLocaleDateString() : "N/A"})`
        });

        // If linked to Lead, log Lead Activity
        if (payload.leadId) {
            const leadDoc = await Lead.findOne({
                $or: [
                    { leadId: payload.leadId },
                    ...(mongoose.isValidObjectId(payload.leadId) ? [{ _id: payload.leadId }] : [])
                ]
            });
            if (leadDoc) {
                await Activity.create({
                    leadId: leadDoc._id,
                    type: "note",
                    message: `Scheduled ${followUp.type} follow-up (${followUp.followUpId}) for ${followUp.contactName} on ${new Date(followUp.scheduledDate).toLocaleDateString()} (Priority: ${followUp.priority}, Status: ${followUp.status})`,
                    user: req.user?.name || "System"
                }).catch((err) => console.warn("Failed to create Lead activity for follow-up:", err.message));
            }
        }



        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: MESSAGE.FOLLOWUP_CREATED_SUCCESS || "Follow-Up created successfully.",
            data: formatFollowUp(followUp.toObject())
        });
    } catch (error) {
        console.error("Create Follow-Up Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Update Follow-Up
export const updateFollowUp = async (req, res) => {
    try {
        const { id } = req.params;

        let record = null;
        if (mongoose.isValidObjectId(id)) {
            record = await FollowUp.findById(id);
        }
        if (!record) {
            record = await FollowUp.findOne({ followUpId: id });
        }

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.FOLLOWUP_NOT_FOUND || "Follow-Up record not found"
            });
        }

        if (req.user?.role === "sales_manager" && record.assignedTo !== req.user.name) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Access denied: this follow-up is not assigned to you"
            });
        }

        const oldData = record.toObject();
        const changes = computeChanges(oldData, req.body);

        Object.assign(record, req.body);
        await record.save();

        // Audit log
        await logActivity({
            module: "follow-ups",
            action: "updated",
            recordId: record._id.toString(),
            recordLabel: `${record.followUpId} - ${record.contactName}`,
            req,
            changes,
            summary: `Updated follow-up ${record.followUpId}`
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.FOLLOWUP_UPDATED_SUCCESS || "Follow-Up updated successfully.",
            data: formatFollowUp(record.toObject())
        });
    } catch (error) {
        console.error("Update Follow-Up Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Update Status
export const updateFollowUpStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, outcome } = req.body;

        let record = null;
        if (mongoose.isValidObjectId(id)) {
            record = await FollowUp.findById(id);
        }
        if (!record) {
            record = await FollowUp.findOne({ followUpId: id });
        }

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.FOLLOWUP_NOT_FOUND || "Follow-Up record not found"
            });
        }

        if (req.user?.role === "sales_manager" && record.assignedTo !== req.user.name) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Access denied: this follow-up is not assigned to you"
            });
        }

        const oldStatus = record.status;
        record.status = status;
        if (outcome !== undefined) {
            record.outcome = outcome;
        }

        await record.save();

        await logActivity({
            module: "follow-ups",
            action: "status_change",
            recordId: record._id.toString(),
            recordLabel: `${record.followUpId} - ${record.contactName}`,
            req,
            changes: [
                { field: "status", oldValue: oldStatus, newValue: status },
                ...(outcome ? [{ field: "outcome", oldValue: record.outcome, newValue: outcome }] : [])
            ],
            summary: `Changed status of follow-up ${record.followUpId} to '${status}'`
        });

        // [FLOW-04] Notify the assigned sales user when a follow-up gets a response
        if (status && oldStatus !== status && record.assignedTo) {
            const assignedUserId = await findUserIdByName(record.assignedTo);
            if (assignedUserId) {
                sendNotification({
                    recipientId: assignedUserId,
                    recipientRole: "sales_manager",
                    type: "follow_up_response",
                    title: `Follow-up ${status}: ${record.followUpId}`,
                    message: `${record.contactName} — follow-up status changed from "${oldStatus}" to "${status}"${outcome ? ` (Outcome: ${outcome})` : ""}.`,
                    link: `/admin/follow-ups`,
                    sourceModule: "follow-ups",
                    sourceId: String(record._id),
                    triggeredBy: req.user?.name || "System",
                }).catch(() => {}); // fire-and-forget
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.FOLLOWUP_STATUS_UPDATED_SUCCESS || "Follow-Up status updated successfully.",
            data: formatFollowUp(record.toObject())
        });
    } catch (error) {
        console.error("Update Follow-Up Status Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Delete Follow-Up
export const deleteFollowUp = async (req, res) => {
    try {
        const { id } = req.params;

        let record = null;
        if (mongoose.isValidObjectId(id)) {
            record = await FollowUp.findById(id);
        }
        if (!record) {
            record = await FollowUp.findOne({ followUpId: id });
        }

        if (!record) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.FOLLOWUP_NOT_FOUND || "Follow-Up record not found"
            });
        }

        if (req.user?.role === "sales_manager" && record.assignedTo !== req.user.name) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Access denied: this follow-up is not assigned to you"
            });
        }

        await FollowUp.deleteOne({ _id: record._id });

        await logActivity({
            module: "follow-ups",
            action: "deleted",
            recordId: record._id.toString(),
            recordLabel: `${record.followUpId} - ${record.contactName}`,
            req,
            summary: `Deleted follow-up ${record.followUpId}`
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.FOLLOWUP_DELETED_SUCCESS || "Follow-Up deleted successfully."
        });
    } catch (error) {
        console.error("Delete Follow-Up Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Get Overdue Follow-Ups
export const getOverdueFollowUps = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const filter = {
            scheduledDate: { $lt: todayStart },
            status: { $nin: ["Completed", "Cancelled"] }
        };

        if (req.user?.role === "sales_manager") {
            filter.assignedTo = req.user.name;
        }

        const records = await FollowUp.find(filter).sort({ scheduledDate: 1 }).lean();

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: records.map(formatFollowUp)
        });
    } catch (error) {
        console.error("Get Overdue Follow-Ups Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion

//#region Get Follow-Up Analytics
export const getFollowUpAnalytics = async (req, res) => {
    try {
        const filter = {};
        if (req.user?.role === "sales_manager") {
            filter.assignedTo = req.user.name;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const [
            total,
            dueToday,
            overdue,
            completed7Days,
            statusCounts,
            typeCounts,
            priorityCounts
        ] = await Promise.all([
            FollowUp.countDocuments(filter),
            FollowUp.countDocuments({
                ...filter,
                scheduledDate: { $gte: todayStart, $lte: todayEnd }
            }),
            FollowUp.countDocuments({
                ...filter,
                scheduledDate: { $lt: todayStart },
                status: { $nin: ["Completed", "Cancelled"] }
            }),
            FollowUp.countDocuments({
                ...filter,
                status: "Completed",
                updatedAt: { $gte: sevenDaysAgo }
            }),
            FollowUp.aggregate([
                { $match: filter },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),
            FollowUp.aggregate([
                { $match: filter },
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),
            FollowUp.aggregate([
                { $match: filter },
                { $group: { _id: "$priority", count: { $sum: 1 } } }
            ])
        ]);

        const byStatus = {
            Pending: 0,
            Completed: 0,
            Rescheduled: 0,
            Cancelled: 0,
            Missed: 0
        };
        statusCounts.forEach((item) => {
            if (item._id) byStatus[item._id] = item.count;
        });

        const byType = {};
        typeCounts.forEach((item) => {
            if (item._id) byType[item._id] = item.count;
        });

        const byPriority = {};
        priorityCounts.forEach((item) => {
            if (item._id) byPriority[item._id] = item.count;
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total,
                dueToday,
                overdue,
                completed7Days,
                byStatus,
                byType,
                byPriority
            }
        });
    } catch (error) {
        console.error("Get Follow-Up Analytics Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
//#endregion
