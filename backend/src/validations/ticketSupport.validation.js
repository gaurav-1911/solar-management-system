import Joi from "joi";

export const createTicketSupportSchema = Joi.object({
    subject: Joi.string().trim().min(3).max(100).required()
        .messages({
            "string.empty": "Subject is required",
            "string.min": "Subject must be at least 3 characters",
            "string.max": "Subject cannot exceed 100 characters"
        }),

    description: Joi.string().trim().min(5).max(500).required()
        .messages({
            "string.empty": "Description is required",
            "string.min": "Description must be at least 5 characters",
            "string.max": "Description cannot exceed 500 characters"
        }),

    customer: Joi.string().trim().min(2).max(50).required()
        .messages({
            "string.empty": "Full name is required",
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters"
        }),

    email: Joi.string().trim().email().max(100).allow("").default("")
        .messages({
            "string.email": "Please enter a valid email address (e.g. name@domain.com)",
            "string.max": "Email address cannot exceed 100 characters"
        }),

    phone: Joi.string().trim().allow("").default(""),

    category: Joi.string().valid("Technical", "Billing", "Installation", "Warranty", "General").default("Technical"),

    priority: Joi.string().valid("Low", "Medium", "High", "Critical").default("Medium"),

    status: Joi.string().valid("Open", "In Progress", "Waiting on Customer", "Resolved", "Closed").default("Open"),

    assignedAgent: Joi.string().default("Unassigned"),

    comments: Joi.array().default([]),
    attachments: Joi.array().default([]),
    history: Joi.array().default([])
});

export const updateTicketSupportSchema = Joi.object({
    subject: Joi.string().trim().allow("").max(100),

    description: Joi.string().trim().allow("").max(500),

    customer: Joi.string().trim().allow("").max(50),

    email: Joi.string().trim().email().allow(""),

    phone: Joi.string().trim().allow(""),

    category: Joi.string().valid("Technical", "Billing", "Installation", "Warranty", "General"),

    priority: Joi.string().valid("Low", "Medium", "High", "Critical"),

    status: Joi.string().valid("Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"),

    assignedAgent: Joi.string(),

    comments: Joi.array(),
    attachments: Joi.array(),
    history: Joi.array()
}).unknown(true);
