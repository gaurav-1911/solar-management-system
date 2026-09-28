import Joi from "joi";

export const createVendorSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required()
        .messages({
            "string.empty": "Full name is required",
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters"
        }),

    category: Joi.string().trim().allow("").default(""),

    categories: Joi.array().items(Joi.string().trim().allow("")).default([]),

    country: Joi.string().trim().allow("").default(""),

    rating: Joi.number().min(0).max(5).default(0),

    totalOrders: Joi.number().integer().min(0).default(0),

    totalSpend: Joi.number().min(0).default(0),

    contactPerson: Joi.string().trim().allow("").default(""),

    contactEmail: Joi.string().trim().email().max(100).allow("").default("")
        .messages({
            "string.email": "Please enter a valid email address (e.g. name@domain.com)",
            "string.max": "Email address cannot exceed 100 characters"
        }),

    contactPhone: Joi.string().trim().allow("").default(""),

    address: Joi.string().trim().allow("").default(""),

    paymentTerms: Joi.string().trim().allow("").default(""),

    status: Joi.string().valid("Active", "Inactive").default("Active"),

    since: Joi.number().integer().allow(null).default(null),

    deliveryScore: Joi.number().min(0).max(100).default(0),

    qualityScore: Joi.number().min(0).max(100).default(0),

    responseTime: Joi.number().min(0).default(0)
});

export const updateVendorSchema = Joi.object({
    name: Joi.string().trim(),

    category: Joi.string().trim().allow(""),

    categories: Joi.array().items(Joi.string().trim().allow("")),

    country: Joi.string().trim().allow(""),

    rating: Joi.number().min(0).max(5),

    totalOrders: Joi.number().integer().min(0),

    totalSpend: Joi.number().min(0),

    contactPerson: Joi.string().trim().allow(""),

    contactEmail: Joi.string().trim().email().allow(""),

    contactPhone: Joi.string().trim().allow(""),

    address: Joi.string().trim().allow(""),

    paymentTerms: Joi.string().trim().allow(""),

    status: Joi.string().valid("Active", "Inactive"),

    since: Joi.number().integer().allow(null),

    deliveryScore: Joi.number().min(0).max(100),

    qualityScore: Joi.number().min(0).max(100),

    responseTime: Joi.number().min(0)
});
