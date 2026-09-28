import Joi from "joi";
import { notPastDate } from "../utils/dateValidation.js";
import { PHONE_REGEX } from "./constants.js";

export const createLeadSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            "string.empty": "Full name is required",
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters"
        }),

    email: Joi.string()
        .trim()
        .email()
        .max(100)
        .required()
        .messages({
            "string.empty": "Email address is required",
            "string.email": "Please enter a valid email address (e.g. name@domain.com)",
            "string.max": "Email address cannot exceed 100 characters"
        }),

    phone: Joi.string()
        .trim()
        .pattern(PHONE_REGEX)
        .required()
        .messages({
            "string.empty": "Phone number is required",
            "string.pattern.base": "Please enter a valid 10-digit phone number"
        }),

    source: Joi.string()
        .valid(
            "Website",
            "Referral",
            "Social Media",
            "Cold Call",
            "Walk-in",
            "Email Campaign"
        )
        .required()
        .messages({
            "any.only": "Please select a valid source"
        }),

    status: Joi.string()
        .valid(
            "New",
            "Contacted",
            "Interested",
            "Converted",
            "Lost"
        )
        .required()
        .messages({
            "any.only": "Please select a valid status"
        }),

    value: Joi.number()
        .positive()
        .max(100000000)
        .required()
        .messages({
            "number.base": "Lead value must be a number",
            "number.positive": "Lead value must be greater than 0",
            "number.max": "Lead value cannot exceed ₹10 crore"
        }),

    address: Joi.string()
        .trim()
        .min(3)
        .max(250)
        .required()
        .messages({
            "string.empty": "Address is required",
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 250 characters"
        }),

    assigned: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .default("Unassigned")
        .messages({
            "string.max": "Assigned name cannot exceed 50 characters"
        }),

    capacity: Joi.number()
        .min(0)
        .max(50)
        .required()
        .messages({
            "number.base": "Capacity must be a number",
            "number.min": "Capacity cannot be negative",
            "number.max": "Maximum number is 50",
            "any.required": "Capacity is required"
        }),

    notes: Joi.string()
        .trim()
        .max(500)
        .allow("")
        .default("")
        .messages({
            "string.max": "Notes cannot exceed 500 characters"
        }),

    followUp: Joi.date()
        .custom(notPastDate)
        .required()
        .messages({
            "date.base": "Please enter a valid date",
            "any.required": "Follow-up date is required",
            "date.min": "Follow-up date cannot be in the past"
        })
});

export const updateLeadSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .messages({
            "string.min": "Name must be at least 2 characters"
        }),

    email: Joi.string()
        .trim()
        .email()
        .messages({
            "string.email": "Please enter a valid email address"
        }),

    phone: Joi.string()
        .trim()
        .pattern(/^\+?[1-9]\d{9,14}$/)
        .messages({
            "string.pattern.base": "Please enter a valid 10-digit phone number"
        }),

    source: Joi.string()
        .valid(
            "Website",
            "Referral",
            "Social Media",
            "Cold Call",
            "Walk-in",
            "Email Campaign"
        )
        .messages({
            "any.only": "Please select a valid source"
        }),

    status: Joi.string()
        .valid(
            "New",
            "Contacted",
            "Interested",
            "Converted",
            "Lost"
        )
        .messages({
            "any.only": "Please select a valid status"
        }),

    value: Joi.number()
        .positive()
        .max(100000000)
        .messages({
            "number.base": "Lead value must be a number",
            "number.positive": "Lead value must be greater than 0",
            "number.max": "Lead value cannot exceed ₹10 crore"
        }),

    address: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .messages({
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 200 characters"
        }),

    assigned: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .messages({
            "string.max": "Assigned name cannot exceed 50 characters"
        }),

    capacity: Joi.number()
        .min(0)
        .max(50)
        .allow(null)
        .messages({
            "number.min": "Capacity cannot be negative",
            "number.max": "Maximum number is 50"
        }),

    notes: Joi.string()
        .trim()
        .allow("")
        .max(500)
        .messages({
            "string.max": "Notes cannot exceed 500 characters"
        }),

    followUp: Joi.date()
        .allow(null)
        .messages({
            "date.base": "Please enter a valid date"
        })
}).min(1).messages({
    "object.min": "At least one field must be provided for update"
});

export const updateLeadStatusSchema = Joi.object({
    status: Joi.string()
        .trim()
        .valid(
            "New",
            "Contacted",
            "Interested",
            "Converted",
            "Lost"
        )
        .required()
        .messages({
            "any.required": "Status is required",
            "any.only": "Invalid status. Must be one of: New, Contacted, Interested, Converted, Lost"
        }),
    statusReason: Joi.string()
        .trim()
        .max(500)
        .allow("", null)
        .default("")
});
