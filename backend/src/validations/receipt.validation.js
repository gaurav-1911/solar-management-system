import Joi from "joi";
import { notFutureDate } from "../utils/dateValidation.js";

const PAYMENT_METHODS = ["Bank Transfer", "UPI", "Cheque", "Cash", "Card", "NEFT", "RTGS"];

// Amounts are capped at ₹1000 crore — far beyond any realistic payment.
const MAX_AMOUNT = 10000000000;

export const createReceiptSchema = Joi.object({
    // Optional: when omitted, the controller auto-generates the next number
    receiptNumber: Joi.string().trim().allow("").default("").max(50),

    invoiceNumber: Joi.string().trim().max(50).required()
        .messages({ "string.empty": "Invoice number is required" }),

    customerName: Joi.string().trim().allow("").default("").max(100),

    // A payment cannot happen in the future — past dates stay allowed because
    // receipts are often recorded a day or two after the money arrives.
    paymentDate: Joi.date().required()
        .custom(notFutureDate, "not future date")
        .messages({
            "date.base": "Payment date is required",
            "date.max": "Payment date cannot be in the future"
        }),

    paymentAmount: Joi.number().min(0).max(MAX_AMOUNT).required()
        .messages({ "number.base": "Payment amount is required" }),

    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).default("Bank Transfer")
});

export const updateReceiptSchema = Joi.object({
    receiptNumber: Joi.string().trim().allow("").max(50),

    invoiceNumber: Joi.string().trim().max(50),

    customerName: Joi.string().trim().allow("").max(100),

    paymentDate: Joi.date(),

    paymentAmount: Joi.number().min(0).max(MAX_AMOUNT),

    paymentMethod: Joi.string().valid(...PAYMENT_METHODS)
}).min(1);
