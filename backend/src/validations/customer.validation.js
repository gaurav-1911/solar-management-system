import Joi from "joi";
import { PHONE_REGEX } from "./constants.js";

export const createCustomerSchema = Joi.object({
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

    type: Joi.string()
        .valid("Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO")
        .required()
        .messages({
            "any.only": "Please select a valid customer type"
        }),

    address: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .required()
        .messages({
            "string.empty": "Address is required",
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 200 characters"
        }),

    capacity: Joi.string()
        .trim()
        .allow("")
        .pattern(/^\d+(\.\d+)?\s*(kW|kw|KW)?$/)
        .max(20)
        .custom((val, helpers) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num > 50) {
                return helpers.error("number.max");
            }
            return val;
        })
        .default("")
        .messages({
            "string.pattern.base": "Enter valid solar capacity (e.g. 5kW or 5.5)",
            "string.max": "Capacity cannot exceed 20 characters",
            "number.max": "Maximum number is 50"
        }),

    status: Joi.string()
        .valid("Active", "Inactive")
        .default("Active")
        .messages({
            "any.only": "Please select a valid status"
        }),

    notes: Joi.string()
        .trim()
        .allow("")
        .max(500)
        .default("")
        .messages({
            "string.max": "Notes cannot exceed 500 characters"
        }),

    totalProjects: Joi.number()
        .min(0)
        .max(1000)
        .default(0)
        .messages({
            "number.base": "Total projects must be a number",
            "number.min": "Total projects cannot be negative",
            "number.max": "Total projects cannot exceed 1000"
        }),

    lastService: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .default("—")
        .messages({
            "string.max": "Last service cannot exceed 50 characters"
        }),

    joinDate: Joi.date()
        .max("now")
        .default(Date.now)
        .messages({
            "date.base": "Please enter a valid date",
            "date.max": "Join date cannot be in the future"
        })
});

export const updateCustomerSchema = Joi.object({
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

    type: Joi.string()
        .valid("Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO")
        .messages({
            "any.only": "Please select a valid customer type"
        }),

    address: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .messages({
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 200 characters"
        }),

    capacity: Joi.string()
        .trim()
        .allow("")
        .pattern(/^\d+(\.\d+)?\s*(kW|kw|KW)?$/)
        .max(20)
        .custom((val, helpers) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num > 50) {
                return helpers.error("number.max");
            }
            return val;
        })
        .messages({
            "string.pattern.base": "Enter valid solar capacity (e.g. 5kW or 5.5)",
            "string.max": "Capacity cannot exceed 20 characters",
            "number.max": "Maximum number is 50"
        }),

    status: Joi.string()
        .valid("Active", "Inactive")
        .messages({
            "any.only": "Please select a valid status"
        }),

    notes: Joi.string()
        .trim()
        .allow("")
        .max(500)
        .messages({
            "string.max": "Notes cannot exceed 500 characters"
        }),

    totalProjects: Joi.number()
        .min(0)
        .max(1000)
        .messages({
            "number.base": "Total projects must be a number",
            "number.min": "Total projects cannot be negative",
            "number.max": "Total projects cannot exceed 1000"
        }),

    lastService: Joi.string()
        .trim()
        .allow("")
        .max(50)
        .messages({
            "string.max": "Last service cannot exceed 50 characters"
        }),

    joinDate: Joi.date()
        .max("now")
        .messages({
            "date.base": "Please enter a valid date",
            "date.max": "Join date cannot be in the future"
        })
}).min(1).messages({
    "object.min": "At least one field must be provided for update"
});

export const updateCustomerStatusSchema = Joi.object({
    status: Joi.string()
        .trim()
        .valid("Active", "Inactive")
        .required()
        .messages({
            "any.required": "Status is required",
            "any.only": "Invalid status. Must be one of: Active, Inactive"
        })
});
