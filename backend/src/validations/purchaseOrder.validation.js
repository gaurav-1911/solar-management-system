import Joi from "joi";

const PO_STATUSES = ["Pending", "Approved", "Dispatched", "Delivered", "Cancelled"];

export const createPurchaseOrderSchema = Joi.object({
    purchaseOrderId: Joi.string().trim().allow("").default(""),

    vendorId: Joi.string().trim().allow("", null).default(null),

    vendor: Joi.string().trim().required()
        .messages({ "string.empty": "Vendor name is required" }),

    leadId: Joi.string().trim().allow("").default(""),

    customerName: Joi.string().trim().allow("").default(""),

    projectName: Joi.string().trim().allow("").default(""),

    items: Joi.string().trim().required()
        .messages({ "string.empty": "Items description is required" }),

    total: Joi.number().min(0).required()
        .messages({ "number.base": "Order total is required", "number.min": "Order total cannot be negative" }),

    orderDate: Joi.string().trim().allow("").default(""),

    expectedDelivery: Joi.string().trim().allow("").default(""),

    actualDelivery: Joi.string().trim().allow("", null).default(""),

    status: Joi.string().valid(...PO_STATUSES).default("Pending")
});

export const updatePurchaseOrderSchema = Joi.object({
    purchaseOrderId: Joi.string().trim().allow(""),

    vendorId: Joi.string().trim().allow("", null),

    vendor: Joi.string().trim(),

    leadId: Joi.string().trim().allow(""),

    customerName: Joi.string().trim().allow(""),

    projectName: Joi.string().trim().allow(""),

    items: Joi.string().trim(),

    total: Joi.number().min(0),

    orderDate: Joi.string().trim().allow(""),

    expectedDelivery: Joi.string().trim().allow(""),

    actualDelivery: Joi.string().trim().allow("", null),

    status: Joi.string().valid(...PO_STATUSES)
});
