import Joi from "joi";

export const createProductSchema = Joi.object({
    name: Joi.string().trim().min(2).required()
        .messages({ "string.empty": "Product name is required" }),

    brand: Joi.string().trim().required()
        .messages({ "string.empty": "Brand is required" }),

    category: Joi.string().trim().required()
        .messages({ "string.empty": "Category is required" }),

    costPrice: Joi.number().min(0).optional(),

    price: Joi.number().positive().required()
        .messages({ "number.base": "Valid price is required" }),

    stock: Joi.number().integer().min(0).required()
        .messages({ "number.base": "Valid stock quantity is required" }),

    minStock: Joi.number().integer().min(0).required()
        .messages({ "number.base": "Valid min stock level is required" }),

    warranty: Joi.number().integer().min(0).required()
        .messages({ "number.base": "Valid warranty period is required" }),

    inventoryItemId: Joi.string().allow("", null).trim(),

    specs: Joi.object().unknown().default({})
});

export const updateProductSchema = Joi.object({
    name: Joi.string().trim().min(2),

    brand: Joi.string().trim(),

    category: Joi.string().trim(),

    costPrice: Joi.number().min(0),

    price: Joi.number().positive(),

    stock: Joi.number().integer().min(0),

    minStock: Joi.number().integer().min(0),

    warranty: Joi.number().integer().min(0),

    inventoryItemId: Joi.string().allow("", null).trim(),

    specs: Joi.object().unknown()
});

export const adjustStockSchema = Joi.object({
    quantity: Joi.number().integer().min(0).required()
        .messages({
            "number.base": "Valid stock quantity is required",
            "number.min": "Stock cannot be negative"
        })
});
