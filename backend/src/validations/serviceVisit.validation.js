import Joi from "joi";

export const createServiceVisitSchema = Joi.object({
    visitId: Joi.string().trim().allow(""),

    date: Joi.date().required()
        .messages({ "date.base": "Visit date is required" }),

    customer: Joi.string().trim().required()
        .messages({ "string.empty": "Customer name is required" }),

    technician: Joi.string().trim().allow("").default(""),

    linkType: Joi.string().valid("Ticket", "AMC").default("Ticket"),

    linkId: Joi.string().trim().allow("").default(""),

    status: Joi.string().valid("upcoming", "completed", "missed").default("upcoming"),

    notes: Joi.string().trim().allow("").default("")
});

export const updateServiceVisitSchema = Joi.object({
    visitId: Joi.string().trim().allow(""),

    date: Joi.date(),

    customer: Joi.string().trim(),

    technician: Joi.string().trim().allow(""),

    linkType: Joi.string().valid("Ticket", "AMC"),

    linkId: Joi.string().trim().allow(""),

    status: Joi.string().valid("upcoming", "completed", "missed"),

    notes: Joi.string().trim().allow("")
});
