import Joi from "joi";
import { notFutureDate } from "../utils/dateValidation.js";

// Amounts are capped at ₹1000 crore — far beyond any realistic credit.
const MAX_AMOUNT = 10000000000;

export const createCreditNoteSchema = Joi.object({
    // Optional: when omitted, the controller auto-generates the next number
    creditNoteNumber: Joi.string().trim().allow("").default("").max(50),

    invoiceNumber: Joi.string().trim().max(50).required()
        .messages({ "string.empty": "Invoice number is required" }),

    customerName: Joi.string().trim().allow("").default("").max(100),

    creditAmount: Joi.number().min(0).max(MAX_AMOUNT).required()
        .messages({ "number.base": "Credit amount is required" }),

    reason: Joi.string().trim().min(2).max(500).required()
        .messages({ "string.empty": "Reason is required" }),

    // A credit note cannot be dated in the future — past dates stay allowed
    // because notes are often raised after the fact.
    date: Joi.date().required()
        .custom(notFutureDate, "not future date")
        .messages({
            "date.base": "Date is required",
            "date.max": "Date cannot be in the future"
        })
});

export const updateCreditNoteSchema = Joi.object({
    creditNoteNumber: Joi.string().trim().allow("").max(50),

    invoiceNumber: Joi.string().trim().max(50),

    customerName: Joi.string().trim().allow("").max(100),

    creditAmount: Joi.number().min(0).max(MAX_AMOUNT),

    reason: Joi.string().trim().max(500),

    date: Joi.date()
}).min(1);
