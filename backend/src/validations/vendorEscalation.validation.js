import Joi from "joi";

export const createVendorEscalationSchema = Joi.object({
    escalationId: Joi.string().trim().allow(""),

    claimId: Joi.string().trim().required()
        .messages({ "string.empty": "Claim ID is required" }),

    manufacturer: Joi.string().trim().allow("").default(""),

    escalated: Joi.date().default(Date.now),

    expectedResponse: Joi.date().allow(null).default(null),

    status: Joi.string().valid("awaiting-vendor", "vendor-responded", "closed").default("awaiting-vendor"),

    note: Joi.string().trim().allow("").default("")
});

export const updateVendorEscalationSchema = Joi.object({
    escalationId: Joi.string().trim().allow(""),

    claimId: Joi.string().trim(),

    manufacturer: Joi.string().trim().allow(""),

    escalated: Joi.date(),

    expectedResponse: Joi.date().allow(null),

    status: Joi.string().valid("awaiting-vendor", "vendor-responded", "closed"),

    note: Joi.string().trim().allow("")
});
