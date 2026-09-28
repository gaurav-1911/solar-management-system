import Joi from "joi";
import {
    WAREHOUSE_NAME_REGEX as NAME_PATTERN,
    PHONE_REGEX as PHONE_PATTERN
} from "./constants.js";

const WAREHOUSE_STATUSES = ["Active", "Inactive"];

export const createWarehouseSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required()
        .pattern(NAME_PATTERN)
        .messages({
            "string.empty": "Warehouse name is required",
            "string.min": "Warehouse name must be at least 2 characters",
            "string.max": "Warehouse name cannot exceed 100 characters",
            "string.pattern.base": "Warehouse name can only contain letters, numbers, spaces and & ' ( ) . - /"
        }),

    address: Joi.string().trim().allow("").min(3).max(200)
        .messages({
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 200 characters"
        }),

    city: Joi.string().trim().allow("").min(2).max(100)
        .messages({
            "string.min": "City must be at least 2 characters",
            "string.max": "City cannot exceed 100 characters"
        }),

    contactPerson: Joi.string().trim().allow("").min(2).max(100)
        .messages({
            "string.min": "Contact person must be at least 2 characters",
            "string.max": "Contact person cannot exceed 100 characters"
        }),

    contactPhone: Joi.string().trim().allow("").pattern(PHONE_PATTERN)
        .messages({
            "string.pattern.base": "Please enter a valid 10-digit phone number"
        }),

    capacity: Joi.number().min(0).max(99999999).default(0)
        .messages({
            "number.min": "Capacity cannot be negative",
            "number.max": "Capacity seems too large"
        }),

    status: Joi.string().valid(...WAREHOUSE_STATUSES).default("Active")
        .messages({ "any.only": "Status must be Active or Inactive" }),

    description: Joi.string().trim().allow("").min(5).max(500)
        .messages({
            "string.min": "Description must be at least 5 characters",
            "string.max": "Description cannot exceed 500 characters"
        })
});

export const updateWarehouseSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100)
        .pattern(NAME_PATTERN)
        .messages({
            "string.empty": "Warehouse name is required",
            "string.min": "Warehouse name must be at least 2 characters",
            "string.max": "Warehouse name cannot exceed 100 characters",
            "string.pattern.base": "Warehouse name can only contain letters, numbers, spaces and & ' ( ) . - /"
        }),

    address: Joi.string().trim().allow("").min(3).max(200)
        .messages({
            "string.min": "Address must be at least 3 characters",
            "string.max": "Address cannot exceed 200 characters"
        }),

    city: Joi.string().trim().allow("").min(2).max(100)
        .messages({
            "string.min": "City must be at least 2 characters",
            "string.max": "City cannot exceed 100 characters"
        }),

    contactPerson: Joi.string().trim().allow("").min(2).max(100)
        .messages({
            "string.min": "Contact person must be at least 2 characters",
            "string.max": "Contact person cannot exceed 100 characters"
        }),

    contactPhone: Joi.string().trim().allow("").pattern(PHONE_PATTERN)
        .messages({
            "string.pattern.base": "Please enter a valid 10-digit phone number"
        }),

    capacity: Joi.number().min(0).max(99999999)
        .messages({
            "number.min": "Capacity cannot be negative",
            "number.max": "Capacity seems too large"
        }),

    status: Joi.string().valid(...WAREHOUSE_STATUSES)
        .messages({ "any.only": "Status must be Active or Inactive" }),

    description: Joi.string().trim().allow("").min(5).max(500)
        .messages({
            "string.min": "Description must be at least 5 characters",
            "string.max": "Description cannot exceed 500 characters"
        })
});
