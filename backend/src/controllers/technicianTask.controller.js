import TechnicianTask from "../models/technicianTask.model.js";
import TaskAssignment from "../models/taskAssignment.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { applyCustomerScope } from "../utils/customerScope.js";

// Map a task's status onto the job status vocabulary.
const TASK_TO_JOB_STATUS = {
    "Not Started": "Pending",
    "In Progress": "In Progress",
    "Completed": "Completed"
};

// Job statuses ordered by progress so a task edit never downgrades a job the
// admin has already moved forward (mirrors the rank guard used on the task side).
const JOB_STATUS_RANK = {
    "Pending": 0,
    "In Progress": 1,
    "Completed": 2
};

// Keep the Task Assignment module in sync with this task (reverse flow of
// job → task auto-creation): create the linked job when a task is created
// with job details, and update it when the task changes. A task maps to its
// job either via sourceTaskId (task created the job) or via sourceAssignmentId
// (job created the task) — never both, so edits never create duplicates.
const syncLinkedJob = async (task, body) => {
    const jobData = {
        technicianName: task.technicianName,
        technicianId: task.technicianId,
        jobTitle: task.taskName,
        status: TASK_TO_JOB_STATUS[task.status] || "Pending",
        customerName: (body.customerName || "").trim(),
        leadId: (body.leadId || "").trim(),
        installationId: (body.installationId || "").trim(),
        sourceTaskId: String(task._id)
    };

    // The task's linked job, found either as the job this task created
    // (sourceTaskId) or as the job this task was auto-created from
    // (sourceAssignmentId on the task = the job's _id).
    let existing = await TaskAssignment.findOne({ sourceTaskId: String(task._id) });
    let foundViaSourceAssignment = false;
    if (!existing && task.sourceAssignmentId) {
        existing = await TaskAssignment.findById(task.sourceAssignmentId);
        foundViaSourceAssignment = true;
    }

    if (existing) {
        // Only advance the job's status when the task represents equal-or-greater
        // progress; keep manual job status updates intact otherwise.
        const currentRank = JOB_STATUS_RANK[existing.status] ?? 0;
        const newRank = JOB_STATUS_RANK[jobData.status] ?? 0;
        if (newRank < currentRank) delete jobData.status;
        // Don't stamp sourceTaskId onto a job the task was auto-created FROM —
        // that would later let deleting this task cascade to the original job.
        if (foundViaSourceAssignment) delete jobData.sourceTaskId;
        return TaskAssignment.findByIdAndUpdate(existing._id, jobData, { new: true, runValidators: true });
    }

    // No linked job yet — only create one when the user supplied full job details.
    if (!jobData.customerName || !jobData.leadId || !jobData.installationId) return null;

    return TaskAssignment.create({
        ...jobData,
        assignedDate: new Date()
    });
};

// Remove the linked job when its task is deleted.
const removeLinkedJob = async (taskId) => {
    await TaskAssignment.deleteMany({ sourceTaskId: String(taskId) });
};

// Generate the next sequential human-friendly ID like TSK-001, TSK-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a number.
export const generateTaskId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every task ID in the collection.
    const lastDoc = await TechnicianTask.findOne({ taskId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("taskId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.taskId) {
        const m = lastDoc.taskId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `TSK-${String(max + 1).padStart(3, "0")}`;
};

export const createTechnicianTask = async (req, res) => {
    try {
        const data = { ...req.body };
        // Retry on duplicate-key so two simultaneous creates don't collide on the same TSK-XXX
        let task;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.taskId = await generateTaskId();
                task = await TechnicianTask.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        // Auto-create the matching job in the Task Assignment module when the
        // task carries job details. Failures here don't block the task itself.
        try {
            await syncLinkedJob(task, data);
        } catch (syncError) {
            console.error("Auto-create job from task error:", syncError);
        }

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Task created successfully",
            data: task
        });
    } catch (error) {
        console.error("Create Technician Task Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllTechnicianTasks = async (req, res) => {
    try {
        const {
            search,
            status,
            technicianName,
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
        if (search) {
            filter.$or = [
                { taskId: { $regex: search, $options: "i" } },
                { technicianName: { $regex: search, $options: "i" } },
                { taskName: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await TechnicianTask.countDocuments(filter);
        const tasks = await TechnicianTask.find(filter)
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
        console.error("Get All Technician Tasks Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getTechnicianTaskById = async (req, res) => {
    try {
        const task = await TechnicianTask.findById(req.params.id).lean();

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: task
        });
    } catch (error) {
        console.error("Get Technician Task By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateTechnicianTask = async (req, res) => {
    try {
        const data = { ...req.body };
        // taskId is system-generated; never allow clients to overwrite it
        delete data.taskId;
        const task = await TechnicianTask.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task not found"
            });
        }

        // Keep the linked job in sync with the updated task.
        try {
            await syncLinkedJob(task, data);
        } catch (syncError) {
            console.error("Sync job from task error:", syncError);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Task updated successfully",
            data: task
        });
    } catch (error) {
        console.error("Update Technician Task Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteTechnicianTask = async (req, res) => {
    try {
        const task = await TechnicianTask.findByIdAndDelete(req.params.id);

        if (!task) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Task not found"
            });
        }

        // Remove the linked job so the Task Assignment module stays clean.
        try {
            await removeLinkedJob(task._id);
        } catch (syncError) {
            console.error("Remove job from task error:", syncError);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Task deleted successfully"
        });
    } catch (error) {
        console.error("Delete Technician Task Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
