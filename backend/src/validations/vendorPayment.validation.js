import Joi from "joi";

const PAYMENT_STATUSES = ["Paid", "Pending", "Overdue"];

export const createVendorPaymentSchema = Joi.object({
    paymentId: Joi.string().trim().allow("").default(""),

    poRef: Joi.string().trim().allow("").default(""),

    vendorId: Joi.string().trim().allow("", null).default(null),

    vendor: Joi.string().trim().required()
        .messages({ "string.empty": "Vendor name is required" }),

    leadId: Joi.string().trim().allow("").default(""),

    customerName: Joi.string().trim().allow("").default(""),

    projectName: Joi.string().trim().allow("").default(""),

    amount: Joi.number().min(0).required()
        .messages({ "number.base": "Payment amount is required", "number.min": "Payment amount cannot be negative" }),

    dueDate: Joi.string().trim().allow("").default(""),

    paidDate: Joi.string().trim().allow("", null).default(""),

    status: Joi.string().valid(...PAYMENT_STATUSES).default("Pending")
});

export const updateVendorPaymentSchema = Joi.object({
    paymentId: Joi.string().trim().allow(""),

    poRef: Joi.string().trim().allow(""),

    vendorId: Joi.string().trim().allow("", null),

    vendor: Joi.string().trim(),

    leadId: Joi.string().trim().allow(""),

    customerName: Joi.string().trim().allow(""),

    projectName: Joi.string().trim().allow(""),

    amount: Joi.number().min(0),

    dueDate: Joi.string().trim().allow(""),

    paidDate: Joi.string().trim().allow("", null),

    status: Joi.string().valid(...PAYMENT_STATUSES)
});
