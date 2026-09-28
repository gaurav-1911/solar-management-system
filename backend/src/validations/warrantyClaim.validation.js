import Joi from "joi";

export const createWarrantyClaimSchema = Joi.object({
    claimId: Joi.string().trim().allow(""),

    warrantyId: Joi.string().trim().required()
        .messages({ "string.empty": "Warranty ID is required" }),

    component: Joi.string().trim().allow("").default(""),

    serial: Joi.string().trim().allow("").default(""),

    customer: Joi.string().trim().allow("").default(""),

    issue: Joi.string().trim().required()
        .messages({ "string.empty": "Issue description is required" }),

    submitted: Joi.date().default(Date.now),

    stageIndex: Joi.number().min(0).default(0),

    priority: Joi.string().valid("high", "medium", "low").default("medium"),

    resolution: Joi.string().trim().allow("").default("")
});

export const updateWarrantyClaimSchema = Joi.object({
    claimId: Joi.string().trim().allow(""),

    warrantyId: Joi.string().trim(),

    component: Joi.string().trim().allow(""),

    serial: Joi.string().trim().allow(""),

    customer: Joi.string().trim().allow(""),

    issue: Joi.string().trim(),

    submitted: Joi.date(),

    stageIndex: Joi.number().min(0),

    priority: Joi.string().valid("high", "medium", "low"),

    resolution: Joi.string().trim().allow("")
});
