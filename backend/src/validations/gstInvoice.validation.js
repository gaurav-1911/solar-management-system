import Joi from "joi";

// Amounts are capped at ₹1000 crore — far beyond any realistic invoice.
const MAX_AMOUNT = 10000000000;

export const createGstInvoiceSchema = Joi.object({
    invoiceNumber: Joi.string().trim().max(50).required()
        .messages({ "string.empty": "Invoice number is required" }),

    customerName: Joi.string().trim().allow("").default("").max(100),

    gstNumber: Joi.string().trim().length(15).required()
        .messages({
            "string.empty": "GST number is required",
            "string.length": "GST number must be 15 characters"
        }),

    gstPercentage: Joi.number().positive().max(100).required()
        .messages({ "number.base": "GST percentage is required" }),

    taxableAmount: Joi.number().positive().max(MAX_AMOUNT).required()
        .messages({ "number.base": "Taxable amount is required" }),

    gstAmount: Joi.number().min(0).max(MAX_AMOUNT).default(0)
});

export const updateGstInvoiceSchema = Joi.object({
    invoiceNumber: Joi.string().trim().max(50),
    customerName: Joi.string().trim().allow("").max(100),
    gstNumber: Joi.string().trim().length(15),
    gstPercentage: Joi.number().min(0).max(100),
    taxableAmount: Joi.number().min(0).max(MAX_AMOUNT),
    gstAmount: Joi.number().min(0).max(MAX_AMOUNT)
}).min(1);
