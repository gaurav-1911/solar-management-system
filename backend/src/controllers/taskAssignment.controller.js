import TaskAssignment from "../models/taskAssignment.model.js";
import TechnicianTask from "../models/technicianTask.model.js";
import { generateTaskId } from "./technicianTask.controller.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { isDocOwnedByTechnician } from "../utils/ownershipScope.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Map a job's status onto the technician-task status vocabulary.
const JOB_TO_TASK_STATUS = {
    "Pending": "Not Started",
    "In Progress": "In Progress",
    "Completed": "Completed"
};

// Task statuses ordered by progress so a job edit never downgrades a task the
// technician has already moved forward (e.g. marking it Completed in Task
// Tracking while the job still shows Pending).
const TASK_STATUS_RANK = {
    "Not Started": 0,
    "In Progress": 1,
    "Completed": 2
};

// Keep the Technician Task module in sync with this job: create the linked task
// when a job is created (or when editing a legacy job that has no linked task),
// and update it when the job changes. Each job maps to exactly one task via
// sourceAssignmentId, so edits never create duplicates.
//
// Exported so one-time backfill scripts can create missing tasks for legacy jobs.
export const syncLinkedTechnicianTask = async (assignment) => {
    const data = {
        technicianName: assignment.technicianName,
        technicianId: assignment.technicianId,
        taskName: assignment.jobTitle,
        status: JOB_TO_TASK_STATUS[assignment.status] || "Not Started",
        sourceAssignmentId: String(assignment._id)
    };

    const existing = await TechnicianTask.findOne({ sourceAssignmentId: String(assignment._id) });
    if (existing) {
        // Only advance the task's status when the job represents equal-or-greater
        // progress; keep the technician's manual status updates intact otherwise.
        const currentRank = TASK_STATUS_RANK[existing.status] ?? 0;
        const newRank = TASK_STATUS_RANK[data.status] ?? 0;
        if (newRank < currentRank) delete data.status;
        return TechnicianTask.findByIdAndUpdate(existing._id, data, { new: true, runValidators: true });
    }

    // No linked task yet — create one (with retry on duplicate taskId collision)
    let task;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            task = await TechnicianTask.create({ ...data, taskId: await generateTaskId() });
            break;
        } catch (error) {
            if (error.code === 11000 && attempt < 2) continue;
            throw error;
        }
    }
    return task;
};

// Remove the linked technician task when its job is deleted.
const removeLinkedTechnicianTask = async (assignmentId) => {
    await TechnicianTask.deleteMany({ sourceAssignmentId: String(assignmentId) });
};

export const createTaskAssignment = async (req, res) => {
    try {
        const task = await TaskAssignment.create(req.body);

        // Auto-create the matching task in the Task Tracking module.
        try {
            await syncLinkedTechnicianTask(task);
        } catch (syncError) {
            console.error("Auto-create technician task error:", syncError);
        }

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Task assignment created successfully",
            data: task
        });
    } catch (error) {
        console.error("Create Task Assignment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllTaskAssignments = async (req, res) => {
    try {
        const {
            search,
            status,
            technicianName,
            priority,
            startDate,
            endDate,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};
        applyCustomerScope(filter, req);

        if (status && status !== "All") {
            filter.status = status;
        }
        if (technicianName && technicianName !== "All") {
            filter.technicianName = technicianName;
        }
        if (priority && priority !== "All") {
            filter.priority = priority;
        }
        if (startDate || endDate) {
            filter.assignedDate = {};
            if (startDate) {
                filter.assignedDate.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.assignedDate.$lte = new Date(endDate);
            }
        }
        // Technicians only ever see their OWN task assignments — enforced
        // server-side regardless of query params.
        if (req.user?.role === "technician") {
            if (req.user?.name) filter.technicianName = req.user.name;
            else filter._id = { $exists: false };
        }
        if (search) {
            filter.$or = [
                { jobTitle: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { technicianName: { $regex: search, $options: "i" } },
                { technicianId: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TaskAssignment.countDocuments(filter);
        const tasks = await TaskAssignment.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: tasks,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Task Assignments Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getTaskAssignmentById = async (req, res) => {
    try {
        const task = await TaskAssignment.findById(req.params.id).lean();

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task assignment not found"
            });
        }

        // Technicians may only view their own task assignments.
        if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(task, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this task assignment does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: task
        });
    } catch (error) {
        console.error("Get Task Assignment By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateTaskAssignment = async (req, res) => {
    try {
        const task = await TaskAssignment.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task assignment not found"
            });
        }

        // Keep the linked technician task in sync with the updated job.
        try {
            await syncLinkedTechnicianTask(task);
        } catch (syncError) {
            console.error("Sync technician task error:", syncError);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Task assignment updated successfully",
            data: task
        });
    } catch (error) {
        console.error("Update Task Assignment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteTaskAssignment = async (req, res) => {
    try {
        const task = await TaskAssignment.findByIdAndDelete(req.params.id);

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task assignment not found"
            });
        }

        // Remove the linked technician task so the Task Tracking module stays clean.
        try {
            await removeLinkedTechnicianTask(task._id);
        } catch (syncError) {
            console.error("Remove technician task error:", syncError);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Task assignment deleted successfully"
        });
    } catch (error) {
        console.error("Delete Task Assignment Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
