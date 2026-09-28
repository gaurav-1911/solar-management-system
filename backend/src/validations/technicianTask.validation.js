import Joi from "joi";

const TASK_STATUSES = ["Not Started", "In Progress", "Completed"];

export const createTechnicianTaskSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    taskName: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Task name is required" }),

    status: Joi.string().valid(...TASK_STATUSES).default("Not Started"),

    // Job details passed through when a task should also auto-create a job in
    // the Task Assignment module (reverse flow of job → task auto-creation).
    customerName: Joi.string().trim().allow(""),

    leadId: Joi.string().trim().allow(""),

    installationId: Joi.string().trim().allow("")
});

export const updateTechnicianTaskSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    taskName: Joi.string().trim().min(2),

    status: Joi.string().valid(...TASK_STATUSES),

    customerName: Joi.string().trim().allow(""),

    leadId: Joi.string().trim().allow(""),

    installationId: Joi.string().trim().allow("")
});
