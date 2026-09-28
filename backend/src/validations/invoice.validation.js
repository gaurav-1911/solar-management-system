import Joi from "joi";
import { notPastDate, notFutureDate } from "../utils/dateValidation.js";

// Amounts are capped at ₹1000 crore — far beyond any realistic invoice.
const MAX_AMOUNT = 10000000000;

export const createInvoiceSchema = Joi.object({
    // Optional: when omitted, the controller auto-generates the next number
    invoiceNumber: Joi.string().trim().allow("").default("").max(50),

    // Issue date: past dates are already blocked at the UI level, and
    // future-dating an invoice is not meaningful — both enforced here on create.
    invoiceDate: Joi.date().required()
        .custom(notPastDate, "not past date")
        .custom(notFutureDate, "not future date")
        .messages({
            "date.base": "Invoice date is required",
            "date.min": "Invoice date cannot be in the past",
            "date.max": "Invoice date cannot be in the future"
        }),

    dueDate: Joi.date().allow(null, ""),

    customerName: Joi.string().trim().min(2).max(100).required()
        .messages({ "string.empty": "Customer name is required" }),

    customerId: Joi.string().trim().allow("").default("").max(50),

    invoiceType: Joi.string().valid("Installation", "Product", "Service", "Other").default("Other"),

    projectName: Joi.string().trim().allow("").default("").max(100),

    invoiceAmount: Joi.number().min(0).max(MAX_AMOUNT).required()
        .messages({ "number.base": "Invoice amount is required" }),

    taxAmount: Joi.number().min(0).max(MAX_AMOUNT).default(0),

    totalAmount: Joi.number().min(0).max(MAX_AMOUNT).required()
        .messages({ "number.base": "Total amount is required" }),

    gstNumber: Joi.string().trim().allow("").default("").max(20),

    gstPercentage: Joi.number().min(0).max(100).default(0),

    taxableAmount: Joi.number().min(0).max(MAX_AMOUNT).default(0),

    gstAmount: Joi.number().min(0).max(MAX_AMOUNT).default(0),

    paymentStatus: Joi.string().valid("Pending", "Partially Paid", "Paid").default("Pending"),

    notes: Joi.string().trim().allow("").default("").max(500)
});

export const updateInvoiceSchema = Joi.object({
    invoiceNumber: Joi.string().trim().max(50),

    invoiceDate: Joi.date(),

    dueDate: Joi.date().allow(null, ""),

    customerName: Joi.string().trim().max(100),

    customerId: Joi.string().trim().allow("").max(50),

    invoiceType: Joi.string().valid("Installation", "Product", "Service", "Other"),

    projectName: Joi.string().trim().allow("").max(100),

    invoiceAmount: Joi.number().min(0).max(MAX_AMOUNT),

    taxAmount: Joi.number().min(0).max(MAX_AMOUNT),

    totalAmount: Joi.number().min(0).max(MAX_AMOUNT),

    gstNumber: Joi.string().trim().allow("").max(20),

    gstPercentage: Joi.number().min(0).max(100),

    taxableAmount: Joi.number().min(0).max(MAX_AMOUNT),

    gstAmount: Joi.number().min(0).max(MAX_AMOUNT),

    paymentStatus: Joi.string().valid("Pending", "Partially Paid", "Paid"),

    notes: Joi.string().trim().allow("").max(500)
}).min(1);
