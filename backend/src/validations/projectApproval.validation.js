import Joi from "joi";
import { notFutureDate } from "../utils/dateValidation.js";

export const createProjectApprovalSchema = Joi.object({
    designId: Joi.string().trim().max(50).required(),
    projectName: Joi.string().trim().min(2).max(100).required(),
    customerName: Joi.string().trim().min(2).max(50).required(),
    customerId: Joi.string().trim().allow("").max(50).default(""),
    quotationId: Joi.string().trim().allow("").max(50).default(""),
    siteSurveyId: Joi.string().trim().allow("").max(50).default(""),
    leadId: Joi.string().trim().max(50).required(),
    capacity: Joi.number().min(0).max(100000).required().messages({
        "number.max": "Capacity cannot exceed 100,000 kW"
    }),
    estimatedCost: Joi.number().min(0).max(10000000000).required().messages({
        "number.max": "Estimated cost cannot exceed ₹1000 crore"
    }),
    // Optional: the controller auto-fills today's date when omitted.
    submittedDate: Joi.date().custom(notFutureDate).messages({
        "date.base": "Please enter a valid date",
        "date.max": "Submission date cannot be in the future"
    }),
    status: Joi.string().valid("Pending", "Under Review", "Approved", "Rejected").default("Pending"),
    reviewedBy: Joi.string().allow("").max(50).default("").messages({
        "string.max": "Reviewed by cannot exceed 50 characters"
    }),
    reviewedDate: Joi.date().allow(null).default(null),
    comments: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Comments cannot exceed 500 characters"
    }),
    sourceModule: Joi.string().trim().allow("").max(50).default("quotation").messages({
        "string.max": "Source module cannot exceed 50 characters"
    }),
    submittedBy: Joi.string().trim().allow("").max(50).default("System").messages({
        "string.max": "Submitted by cannot exceed 50 characters"
    })
});

export const updateProjectApprovalSchema = Joi.object({
    designId: Joi.string().trim().max(50),
    projectName: Joi.string().trim().min(2).max(100),
    customerName: Joi.string().trim().min(2).max(50),
    leadId: Joi.string().trim().max(50),
    capacity: Joi.number().min(0).max(100000).messages({
        "number.max": "Capacity cannot exceed 100,000 kW"
    }),
    estimatedCost: Joi.number().min(0).max(10000000000).messages({
        "number.max": "Estimated cost cannot exceed ₹1000 crore"
    }),
    submittedDate: Joi.date().custom(notFutureDate).messages({
        "date.base": "Please enter a valid date",
        "date.max": "Submission date cannot be in the future"
    }),
    status: Joi.string().valid("Pending", "Under Review", "Approved", "Rejected"),
    reviewedBy: Joi.string().allow("").max(50).messages({
        "string.max": "Reviewed by cannot exceed 50 characters"
    }),
    reviewedDate: Joi.date().allow(null),
    comments: Joi.string().allow("").max(500).messages({
        "string.max": "Comments cannot exceed 500 characters"
    }),
    customerId: Joi.string().trim().allow("").max(50),
    quotationId: Joi.string().trim().allow("").max(50),
    siteSurveyId: Joi.string().trim().allow("").max(50),
    sourceModule: Joi.string().trim().allow("").max(50),
    submittedBy: Joi.string().trim().allow("").max(50).messages({
        "string.max": "Submitted by cannot exceed 50 characters"
    })
}).min(1).messages({
    "object.min": "At least one field must be provided for update"
});
