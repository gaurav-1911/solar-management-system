import Joi from "joi";
import { notPastDate } from "../utils/dateValidation.js";

const itemSchema = Joi.object({
    qty: Joi.number()
        .min(0)
        .max(1000000)
        .default(1)
        .messages({
            "number.base": "Quantity must be a number",
            "number.min": "Quantity cannot be negative",
            "number.max": "Quantity cannot exceed 1,000,000"
        }),
    price: Joi.number()
        .min(0)
        .max(100000000)
        .default(0)
        .messages({
            "number.base": "Price must be a number",
            "number.min": "Price cannot be negative",
            "number.max": "Price cannot exceed ₹10 crore per item"
        }),
    label: Joi.string()
        .trim()
        .allow("")
        .max(100)
        .default("")
        .messages({
            "string.max": "Item label cannot exceed 100 characters"
        })
});

export const createQuotationSchema = Joi.object({
    leadId: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .default("")
        .messages({
            "string.max": "Lead ID cannot exceed 50 characters"
        }),

    designId: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .default("")
        .messages({
            "string.max": "Design ID cannot exceed 50 characters"
        }),

    client: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            "string.empty": "Client name is required",
            "string.min": "Client name must be at least 2 characters"
        }),

    projectName: Joi.string()
        .trim()
        .max(100)
        .allow("")
        .default(""),

    status: Joi.string()
        .valid(
            "Draft",
            "Pending Approval",
            "Sent",
            "Negotiating",
            "Approved",
            "Rejected"
        )
        .default("Draft")
        .messages({
            "any.only": "Please select a valid status"
        }),

    total: Joi.number()
        .min(0)
        .max(10000000000)
        .default(0)
        .messages({
            "number.base": "Total must be a number",
            "number.min": "Total cannot be negative"
        }),

    gst: Joi.number()
        .min(0)
        .max(10000000000)
        .default(0)
        .messages({
            "number.base": "GST must be a number",
            "number.min": "GST cannot be negative"
        }),

    grandTotal: Joi.number()
        .min(0)
        .max(10000000000)
        .default(0)
        .messages({
            "number.base": "Grand total must be a number",
            "number.min": "Grand total cannot be negative"
        }),

    validUntil: Joi.date()
        .allow(null)
        .custom(notPastDate)
        .default(null)
        .messages({
            "date.base": "Please enter a valid date",
            "date.min": "Valid until date cannot be in the past"
        }),

    version: Joi.number()
        .min(1)
        .max(1000)
        .default(1)
        .messages({
            "number.base": "Version must be a number",
            "number.min": "Version must be at least 1"
        }),

    approvedBy: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .default("Pending")
        .messages({
            "string.max": "Approved by cannot exceed 50 characters"
        }),

    items: Joi.object()
        .pattern(
            Joi.string().max(100),
            itemSchema
        )
        .min(1)
        .required()
        .messages({
            "object.min": "Add at least one component (component-wise pricing is required)",
            "any.required": "Add at least one component (component-wise pricing is required)"
        })
});

export const updateQuotationSchema = Joi.object({
    leadId: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .messages({
            "string.max": "Lead ID cannot exceed 50 characters"
        }),

    designId: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .messages({
            "string.max": "Design ID cannot exceed 50 characters"
        }),

    client: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .messages({
            "string.min": "Client name must be at least 2 characters"
        }),

    projectName: Joi.string()
        .trim()
        .max(100)
        .allow(""),

    status: Joi.string()
        .valid(
            "Draft",
            "Pending Approval",
            "Sent",
            "Negotiating",
            "Approved",
            "Rejected"
        )
        .messages({
            "any.only": "Please select a valid status"
        }),

    total: Joi.number()
        .min(0)
        .max(10000000000)
        .messages({
            "number.base": "Total must be a number",
            "number.min": "Total cannot be negative"
        }),

    gst: Joi.number()
        .min(0)
        .max(10000000000)
        .messages({
            "number.base": "GST must be a number",
            "number.min": "GST cannot be negative"
        }),

    grandTotal: Joi.number()
        .min(0)
        .max(10000000000)
        .messages({
            "number.base": "Grand total must be a number",
            "number.min": "Grand total cannot be negative"
        }),

    validUntil: Joi.date()
        .allow(null)
        .messages({
            "date.base": "Please enter a valid date"
        }),

    version: Joi.number()
        .min(1)
        .max(1000)
        .messages({
            "number.base": "Version must be a number",
            "number.min": "Version must be at least 1"
        }),

    approvedBy: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .messages({
            "string.max": "Approved by cannot exceed 50 characters"
        }),

    items: Joi.object()
        .pattern(
            Joi.string().max(100),
            itemSchema
        )
}).min(1).messages({
    "object.min": "At least one field must be provided for update"
});

export const updateQuotationStatusSchema = Joi.object({
    status: Joi.string()
        .trim()
        .valid(
            "Draft",
            "Pending Approval",
            "Sent",
            "Negotiating",
            "Approved",
            "Rejected"
        )
        .required()
        .messages({
            "any.required": "Status is required",
            "any.only": "Invalid status. Must be one of: Draft, Pending Approval, Sent, Negotiating, Approved, Rejected"
        })
});
