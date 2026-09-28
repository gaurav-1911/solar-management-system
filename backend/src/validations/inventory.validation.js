import Joi from "joi";

const CATEGORIES = [
    "Panels", "Inverters", "Batteries",
    "Accessories", "Mounting", "Wiring", "Controllers"
];

export const createInventorySchema = Joi.object({
    name: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Item name is required" }),

    category: Joi.string().valid(...CATEGORIES).required(),

    sku: Joi.string().trim().allow(""),

    quantity: Joi.number().integer().min(0).required()
        .messages({ "number.base": "Valid quantity is required" }),

    minStock: Joi.number().integer().min(0).required()
        .messages({ "number.base": "Valid min stock level is required" }),

    unitPrice: Joi.number().positive().required()
        .messages({ "number.base": "Valid unit price is required" }),

    supplierId: Joi.string().allow("", null).trim(),

    supplier: Joi.string().trim().required()
        .messages({ "string.empty": "Supplier is required" }),

    location: Joi.string().trim().required()
        .messages({ "string.empty": "Location is required" }),

    lastRestocked: Joi.date().allow(null).default(null)
});

export const updateInventorySchema = Joi.object({
    name: Joi.string().trim().min(2),

    category: Joi.string().valid(...CATEGORIES),

    sku: Joi.string().trim(),

    quantity: Joi.number().integer().min(0),

    minStock: Joi.number().integer().min(0),

    unitPrice: Joi.number().positive(),

    supplierId: Joi.string().allow("", null).trim(),

    supplier: Joi.string().trim(),

    location: Joi.string().trim(),

    lastRestocked: Joi.date().allow(null)
});
