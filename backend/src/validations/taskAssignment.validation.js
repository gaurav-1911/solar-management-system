import Joi from "joi";

const JOB_PRIORITIES = ["Low", "Medium", "High"];
const JOB_STATUSES = ["Pending", "In Progress", "Completed"];

export const createTaskAssignmentSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    customerName: Joi.string().trim().min(2).max(50).required()
        .messages({ "string.empty": "Customer name is required" }),

    leadId: Joi.string().trim().required()
        .messages({ "string.empty": "Lead ID is required" }),

    installationId: Joi.string().trim().required()
        .messages({ "string.empty": "Installation ID is required" }),

    jobTitle: Joi.string().trim().required().max(150)
        .messages({ "string.empty": "Job title is required", "string.max": "Job title cannot exceed 150 characters" }),

    jobDescription: Joi.string().trim().allow("").default("").max(1000)
        .messages({ "string.max": "Job description cannot exceed 1000 characters" }),

    assignedDate: Joi.date().required()
        .messages({ "date.base": "Assigned date is required" }),

    dueDate: Joi.date().allow(null).min(Joi.ref("assignedDate"))
        .messages({ "date.min": "Due date cannot be earlier than assigned date" }),

    priority: Joi.string().valid(...JOB_PRIORITIES).default("Medium"),

    status: Joi.string().valid(...JOB_STATUSES).default("Pending")
});

export const updateTaskAssignmentSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    customerName: Joi.string().trim().min(2).max(50),

    leadId: Joi.string().trim(),

    installationId: Joi.string().trim(),

    jobTitle: Joi.string().trim().max(150)
        .messages({ "string.max": "Job title cannot exceed 150 characters" }),

    jobDescription: Joi.string().trim().allow("").max(1000)
        .messages({ "string.max": "Job description cannot exceed 1000 characters" }),

    assignedDate: Joi.date(),

    dueDate: Joi.date().allow(null),

    priority: Joi.string().valid(...JOB_PRIORITIES),

    status: Joi.string().valid(...JOB_STATUSES)
});
