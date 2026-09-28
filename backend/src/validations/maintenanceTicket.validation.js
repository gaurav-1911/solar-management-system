import Joi from "joi";

const historySchema = Joi.array().items(
    Joi.object({
        action: Joi.string().trim().allow(""),
        detail: Joi.string().trim().allow(""),
        date: Joi.date().allow(null)
    })
).allow(null);

export const createMaintenanceTicketSchema = Joi.object({
    ticketId: Joi.string().trim().allow(""),

    type: Joi.string().valid("Maintenance", "Service", "Complaint").required(),

    customer: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Customer name is required" }),

    phone: Joi.string().trim().allow("").default(""),

    system: Joi.string().trim().required()
        .messages({ "string.empty": "System name is required" }),

    priority: Joi.string().valid("Low", "Medium", "High", "Urgent").default("Medium"),

    status: Joi.string().valid("Open", "Scheduled", "In Progress", "Resolved", "Closed").default("Open"),

    assignedTech: Joi.string().default("Unassigned"),

    scheduledDate: Joi.date().allow(null).default(null),

    description: Joi.string().trim().allow("").default(""),

    resolutionNotes: Joi.string().trim().allow("").default(""),

    resolvedDate: Joi.date().allow(null).default(null),

    history: historySchema
});

export const updateMaintenanceTicketSchema = Joi.object({
    ticketId: Joi.string().trim().allow(""),

    type: Joi.string().valid("Maintenance", "Service", "Complaint"),

    customer: Joi.string().trim().min(2),

    phone: Joi.string().trim().allow(""),

    system: Joi.string().trim(),

    priority: Joi.string().valid("Low", "Medium", "High", "Urgent"),

    status: Joi.string().valid("Open", "Scheduled", "In Progress", "Resolved", "Closed"),

    assignedTech: Joi.string(),

    scheduledDate: Joi.date().allow(null),

    description: Joi.string().trim().allow(""),

    resolutionNotes: Joi.string().trim().allow(""),

    resolvedDate: Joi.date().allow(null),

    history: historySchema
});
