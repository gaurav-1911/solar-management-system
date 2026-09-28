import Joi from "joi";
import { NAME_REGEX, EMAIL_REGEX, PHONE_REGEX } from "./constants.js";
import { notPastDate } from "../utils/dateValidation.js";

const FOLLOWUP_TYPES = ["Call", "Email", "Site Visit", "WhatsApp", "Meeting", "Other"];
const FOLLOWUP_STATUSES = ["Pending", "Completed", "Rescheduled", "Cancelled", "Missed"];
const FOLLOWUP_PRIORITIES = ["Low", "Medium", "High"];

export const createFollowUpSchema = Joi.object({
    followUpId: Joi.string().trim().allow(""),
    leadId: Joi.string().trim().allow("").default(""),
    customerId: Joi.string().trim().allow("").default(""),
    quotationId: Joi.string().trim().allow("").default(""),
    installationId: Joi.string().trim().allow("").default(""),

    contactName: Joi.string()
        .trim()
        .pattern(NAME_REGEX)
        .required()
        .messages({
            "string.empty": "Contact name is required",
            "string.pattern.base": "Contact name must start with a letter and contain only valid characters (2-50 chars)"
        }),

    contactPhone: Joi.string()
        .trim()
        .allow("")
        .custom((val, helpers) => {
            if (!val) return val;
            if (!PHONE_REGEX.test(val)) {
                return helpers.message("Invalid phone number format");
            }
            return val;
        }),

    contactEmail: Joi.string()
        .trim()
        .allow("")
        .custom((val, helpers) => {
            if (!val) return val;
            if (!EMAIL_REGEX.test(val)) {
                return helpers.message("Invalid email address format");
            }
            return val;
        }),

    type: Joi.string().valid(...FOLLOWUP_TYPES).default("Call"),

    scheduledDate: Joi.date()
        .custom(notPastDate)
        .required()
        .messages({
            "any.required": "Scheduled date is required",
            "date.min": "Scheduled date cannot be in the past"
        }),

    scheduledTime: Joi.string().trim().allow("").default(""),

    priority: Joi.string().valid(...FOLLOWUP_PRIORITIES).default("Medium"),

    assignedTo: Joi.string().trim().max(50).default("Unassigned"),

    notes: Joi.string().trim().max(1000).allow("").default(""),

    outcome: Joi.string().trim().max(1000).allow("").default(""),

    previousFollowUpId: Joi.string().trim().allow(null, ""),

    nextFollowUpDate: Joi.date().allow(null, "")
})
.or("leadId", "customerId")
.messages({
    "object.missing": "At least one of Lead ID or Customer ID must be provided"
});

export const updateFollowUpSchema = Joi.object({
    followUpId: Joi.string().trim().allow(""),
    leadId: Joi.string().trim().allow(""),
    customerId: Joi.string().trim().allow(""),
    quotationId: Joi.string().trim().allow(""),
    installationId: Joi.string().trim().allow(""),

    contactName: Joi.string().trim().pattern(NAME_REGEX).messages({
        "string.pattern.base": "Contact name must start with a letter and contain only valid characters (2-50 chars)"
    }),

    contactPhone: Joi.string()
        .trim()
        .allow("")
        .custom((val, helpers) => {
            if (!val) return val;
            if (!PHONE_REGEX.test(val)) {
                return helpers.message("Invalid phone number format");
            }
            return val;
        }),

    contactEmail: Joi.string()
        .trim()
        .allow("")
        .custom((val, helpers) => {
            if (!val) return val;
            if (!EMAIL_REGEX.test(val)) {
                return helpers.message("Invalid email address format");
            }
            return val;
        }),

    type: Joi.string().valid(...FOLLOWUP_TYPES),

    scheduledDate: Joi.date(),

    scheduledTime: Joi.string().trim().allow(""),

    status: Joi.string().valid(...FOLLOWUP_STATUSES),

    priority: Joi.string().valid(...FOLLOWUP_PRIORITIES),

    assignedTo: Joi.string().trim().max(50),

    notes: Joi.string().trim().max(1000).allow(""),

    outcome: Joi.string().trim().max(1000).allow(""),

    previousFollowUpId: Joi.string().trim().allow(null, ""),

    nextFollowUpDate: Joi.date().allow(null, "")
}).custom((obj, helpers) => {
    if (obj.status === "Completed" && (!obj.outcome || !obj.outcome.trim())) {
        return helpers.message("Outcome is required when status is Completed");
    }
    return obj;
});

export const updateFollowUpStatusSchema = Joi.object({
    status: Joi.string().valid(...FOLLOWUP_STATUSES).required().messages({
        "any.required": "Status is required",
        "any.only": "Invalid status value"
    }),
    outcome: Joi.string().trim().max(1000).allow("").default("")
}).custom((obj, helpers) => {
    if (obj.status === "Completed" && (!obj.outcome || !obj.outcome.trim())) {
        return helpers.message("Outcome is required when status is Completed");
    }
    return obj;
});
