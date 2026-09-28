import Joi from "joi";
import { notPastDate } from "../utils/dateValidation.js";

// Latitude must be a numeric string within the valid geographic range.
const isValidLatitude = (value, helpers) => {
    const num = Number(value);
    if (String(value).trim() === "" || isNaN(num) || num < -90 || num > 90) {
        return helpers.error("any.invalid");
    }
    return value;
};

// Longitude must be a numeric string within the valid geographic range.
const isValidLongitude = (value, helpers) => {
    const num = Number(value);
    if (String(value).trim() === "" || isNaN(num) || num < -180 || num > 180) {
        return helpers.error("any.invalid");
    }
    return value;
};

export const createSiteSurveySchema = Joi.object({
    customerName: Joi.string().trim().allow("").max(50),
    projectName: Joi.string().trim().min(3).max(100).pattern(/^[A-Za-z0-9\s\-\/]+$/).required().messages({
        "string.empty": "Project name is required",
        "string.min": "Project name must be at least 3 characters",
        "string.max": "Project name cannot exceed 100 characters",
        "string.pattern.base": "Only letters, numbers, spaces, - and / are allowed"
    }),

    projectType: Joi.string().valid("Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO").default("Residential"),
    leadId: Joi.string().trim().max(50).required().messages({
        "any.required": "Please select a lead",
        "string.empty": "Please select a lead",
        "string.max": "Lead ID cannot exceed 50 characters"
    }),
    customerId: Joi.string().trim().allow("").max(50).default("").messages({
        "string.max": "Customer ID cannot exceed 50 characters"
    }),
    technicianId: Joi.string().max(50).required(),
    technicianName: Joi.string().allow("").max(50).default("").messages({
        "string.max": "Technician name cannot exceed 50 characters"
    }),
    visitDate: Joi.date().custom(notPastDate).required().messages({
        "date.base": "Please enter a valid visit date",
        "date.min": "Visit date cannot be in the past"
    }),
    visitTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(\s?[AP]M)?$/i).required().messages({
        "string.pattern.base": "Please select a valid visit time"
    }),
    visitStatus: Joi.string().valid("Scheduled", "Completed", "Cancelled").default("Scheduled"),
    notes: Joi.string().allow("").max(200).default("").messages({
        "string.max": "Notes cannot exceed 500 characters"
    }),
    roofType: Joi.string().trim().max(50).required().messages({
        "string.empty": "Roof type is required",
        "string.max": "Roof type cannot exceed 50 characters"
    }),
    customRoofType: Joi.string().allow("").max(50).default("").messages({
        "string.max": "Custom roof type cannot exceed 50 characters"
    }),
    roofLength: Joi.number().greater(0).max(100).required().messages({
        "any.required": "Roof length is required",
        "number.base": "Roof length must be a number",
        "number.greater": "Roof length must be greater than 0",
        "number.max": "Roof length must not exceed 100 meters"
    }),
    roofWidth: Joi.number().greater(0).max(100).required().messages({
        "any.required": "Roof width is required",
        "number.base": "Roof width must be a number",
        "number.greater": "Roof width must be greater than 0",
        "number.max": "Roof width must not exceed 100 meters"
    }),
    roofArea: Joi.number().min(0).max(1000000).default(0).messages({
        "number.min": "Roof area cannot be negative",
        "number.max": "Roof area cannot exceed 1,000,000 sq meters"
    }),
    roofAngle: Joi.number().min(0).max(90).required().messages({
        "any.required": "Roof angle is required",
        "number.base": "Roof angle must be a number",
        "number.min": "Roof angle cannot be less than 0°",
        "number.max": "Roof angle cannot exceed 90°"
    }),
    shadowAnalysis: Joi.string().valid("No Shadow", "Partial Shadow", "Heavy Shadow").required(),
    shadowNotes: Joi.string().allow("").max(200).default("").messages({
        "string.max": "Shadow notes cannot exceed 200 characters"
    }),
    monthlyUnits: Joi.number().greater(0).max(10000).default(0).required().custom((val, helpers) => {
        const s = String(val);
        const dec = s.includes(".") ? s.split(".")[1].length : 0;
        if (dec > 2) {
            return helpers.error("number.precision");
        }
        return val;
    }).messages({
        "any.required": "Monthly electricity units are required",
        "number.base": "Maximum 2 decimal places allowed",
        "number.greater": "Monthly electricity units must be greater than 0",
        "number.max": "Monthly electricity units cannot exceed 10,000 kWh",
        "number.precision": "Maximum 2 decimal places allowed"
    }),
    latitude: Joi.string().trim().required().custom(isValidLatitude).messages({
        "any.invalid": "Latitude must be a number between -90 and 90"
    }),
    longitude: Joi.string().trim().required().custom(isValidLongitude).messages({
        "any.invalid": "Longitude must be a number between -180 and 180"
    }),
    electricityBill: Joi.any().default(null),
    // Matches the route's MAX_PHOTOS = 5 upload cap.
    sitePhotos: Joi.array().max(5).default([]),
    sitePhotosKeep: Joi.any(),
    billKeep: Joi.any(),
    surveyNotes: Joi.string().allow("").max(200).default("").messages({
        "string.max": "Additional survey notes cannot exceed 200 characters"
    })
});

export const updateSiteSurveySchema = Joi.object({
    customerName: Joi.string().trim().allow("").max(50),
    projectName: Joi.string().trim().min(3).max(100).pattern(/^[A-Za-z0-9\s\-\/]+$/).messages({
        "string.min": "Project name must be at least 3 characters",
        "string.max": "Project name cannot exceed 100 characters",
        "string.pattern.base": "Only letters, numbers, spaces, - and / are allowed"
    }),

    projectType: Joi.string().valid("Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"),
    leadId: Joi.string().trim().max(50),
    customerId: Joi.string().trim().allow("").max(50).default(""),
    technicianId: Joi.string().max(50),
    technicianName: Joi.string().allow("").max(50),
    visitDate: Joi.date().messages({
        "date.base": "Please enter a valid visit date"
    }),
    visitTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(\s?[AP]M)?$/i).messages({
        "string.pattern.base": "Please select a valid visit time"
    }),
    visitStatus: Joi.string().valid("Scheduled", "Completed", "Cancelled"),
    notes: Joi.string().allow("").max(200).messages({
        "string.max": "Notes cannot exceed 500 characters"
    }),
    roofType: Joi.string().trim().max(50).messages({
        "string.max": "Roof type cannot exceed 50 characters"
    }),
    customRoofType: Joi.string().allow("").max(50).messages({
        "string.max": "Custom roof type cannot exceed 50 characters"
    }),
    roofLength: Joi.number().greater(0).max(100).messages({
        "number.base": "Roof length must be a number",
        "number.greater": "Roof length must be greater than 0",
        "number.max": "Roof length must not exceed 100 meters"
    }),
    roofWidth: Joi.number().greater(0).max(100).messages({
        "number.base": "Roof width must be a number",
        "number.greater": "Roof width must be greater than 0",
        "number.max": "Roof width must not exceed 100 meters"
    }),
    roofArea: Joi.number().min(0).max(1000000).messages({
        "number.min": "Roof area cannot be negative",
        "number.max": "Roof area cannot exceed 1,000,000 sq meters"
    }),
    roofAngle: Joi.number().min(0).max(90).messages({
        "number.base": "Roof angle must be a number",
        "number.min": "Roof angle cannot be less than 0°",
        "number.max": "Roof angle cannot exceed 90°"
    }),
    shadowAnalysis: Joi.string().valid("No Shadow", "Partial Shadow", "Heavy Shadow"),
    shadowNotes: Joi.string().allow("").max(200).messages({
        "string.max": "Shadow notes cannot exceed 200 characters"
    }),
    monthlyUnits: Joi.number().greater(0).max(10000).custom((val, helpers) => {
        const s = String(val);
        const dec = s.includes(".") ? s.split(".")[1].length : 0;
        if (dec > 2) {
            return helpers.error("number.precision");
        }
        return val;
    }).messages({
        "number.base": "Maximum 2 decimal places allowed",
        "number.greater": "Monthly electricity units must be greater than 0",
        "number.max": "Monthly electricity units cannot exceed 10,000 kWh",
        "number.precision": "Maximum 2 decimal places allowed"
    }),
    latitude: Joi.string().trim().custom(isValidLatitude).messages({
        "any.invalid": "Latitude must be a number between -90 and 90"
    }),
    longitude: Joi.string().trim().custom(isValidLongitude).messages({
        "any.invalid": "Longitude must be a number between -180 and 180"
    }),
    electricityBill: Joi.any(),
    // Matches the route's MAX_PHOTOS = 5 upload cap.
    sitePhotos: Joi.array().max(5),
    sitePhotosKeep: Joi.any(),
    billKeep: Joi.any(),
    surveyNotes: Joi.string().allow("").max(200).messages({
        "string.max": "Additional survey notes cannot exceed 200 characters"
    })
});
