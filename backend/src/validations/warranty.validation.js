import Joi from "joi";

const COMPONENTS = ["Solar Panel", "Inverter", "Battery", "Mounting Structure", "Charge Controller"];
const COVERAGES = ["Product Only", "Product + Labor", "Performance + Product"];

export const createWarrantySchema = Joi.object({
    warrantyId: Joi.string().trim().allow(""),

    component: Joi.string().valid(...COMPONENTS).required(),

    model: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Model is required" }),

    serial: Joi.string().trim().min(3).required()
        .messages({ "string.empty": "Serial number is required" }),

    customer: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Customer is required" }),

    site: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Site location is required" }),

    manufacturer: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Manufacturer is required" }),

    installed: Joi.date().required()
        .messages({ "date.base": "Installation date is required" }),

    periodYears: Joi.number().integer().min(1).required()
        .messages({ "number.base": "Valid warranty period is required" }),

    coverage: Joi.string().valid(...COVERAGES).default("Product Only"),

    status: Joi.string().valid("active", "expiring", "expired").default("active"),

    certificate: Joi.string().trim().allow("").default("")
});

export const updateWarrantySchema = Joi.object({
    warrantyId: Joi.string().trim().allow(""),

    component: Joi.string().valid(...COMPONENTS),

    model: Joi.string().trim().min(2),

    serial: Joi.string().trim().min(3),

    customer: Joi.string().trim().min(2),

    site: Joi.string().trim().min(2),

    manufacturer: Joi.string().trim().min(2),

    installed: Joi.date(),

    periodYears: Joi.number().integer().min(1),

    coverage: Joi.string().valid(...COVERAGES),

    status: Joi.string().valid("active", "expiring", "expired"),

    certificate: Joi.string().trim().allow("")
});
