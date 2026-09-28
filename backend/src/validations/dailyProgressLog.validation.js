import Joi from "joi";
import { notPastDate, notFutureDate } from "../utils/dateValidation.js";

const STATUS_VALUES = ["Not Started", "In Progress", "Completed", "Delayed", "Blocked"];
const APPROVAL_VALUES = ["Approved", "Rejected", "Pending"];
const WEATHER_VALUES = ["Sunny", "Cloudy", "Rainy", "Windy", "Partly Cloudy", "Other"];
const DELAY_VALUES = ["Yes", "No"];

// GPS coordinates are numeric strings within the valid geographic ranges;
// empty stays allowed (location not captured). Mirrors the site survey check.
const isValidLatitude = (value, helpers) => {
    if (String(value).trim() === "") return value;
    const num = Number(value);
    if (isNaN(num) || num < -90 || num > 90) return helpers.error("any.invalid");
    return value;
};

const isValidLongitude = (value, helpers) => {
    if (String(value).trim() === "") return value;
    const num = Number(value);
    if (isNaN(num) || num < -180 || num > 180) return helpers.error("any.invalid");
    return value;
};

const materialUsageSchema = Joi.array()
    .items(
        Joi.object({
            name: Joi.string().trim().min(1).max(100).required(),
            qty: Joi.number().min(1).max(1000000).required().messages({
                "number.max": "Material quantity cannot exceed 1,000,000"
            })
        })
    )
    .max(200)
    .default([]);

export const createDailyProgressLogSchema = Joi.object({
    logId: Joi.string().forbidden(),
    // Only create blocks past AND future dates; updates keep allowing the
    // existing (possibly past) date so old logs stay editable.
    date: Joi.date().custom(notPastDate).custom(notFutureDate).required().messages({
        "date.base": "Please enter a valid date",
        "date.min": "Date cannot be in the past",
        "date.max": "Date cannot be in the future"
    }),
    project: Joi.string().trim().min(2).max(100).required(),
    technician: Joi.string().trim().min(2).max(50).required(),
    workPerformed: Joi.string().trim().min(1).max(1000).required().messages({
        "string.max": "Work performed cannot exceed 1000 characters"
    }),
    status: Joi.string().valid(...STATUS_VALUES).default("Not Started"),
    completedTasks: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Completed tasks cannot exceed 500 characters"
    }),
    pendingTasks: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Pending tasks cannot exceed 500 characters"
    }),
    materials: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Materials summary cannot exceed 500 characters"
    }),
    qty: Joi.number().min(0).max(1000000).allow(null).default(null).messages({
        "number.max": "Quantity cannot exceed 1,000,000"
    }),
    materialUsage: materialUsageSchema,
    delayStatus: Joi.string().valid(...DELAY_VALUES).default("No"),
    delayReason: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Delay reason cannot exceed 500 characters"
    }),
    weather: Joi.string().valid(...WEATHER_VALUES).required(),
    weatherDesc: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Weather description cannot exceed 500 characters"
    }),
    gpsLat: Joi.string().allow("").max(20).default("").custom(isValidLatitude).messages({
        "any.invalid": "Latitude must be a number between -90 and 90"
    }),
    gpsLng: Joi.string().allow("").max(20).default("").custom(isValidLongitude).messages({
        "any.invalid": "Longitude must be a number between -180 and 180"
    }),

    // Matches the upload route's 10-file cap.
    images: Joi.array().max(10).default([]),
    videos: Joi.array().max(10).default([]),
    nextDayPlan: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Next day plan cannot exceed 500 characters"
    }),
    issuesFound: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Issues found cannot exceed 500 characters"
    }),
    customerRemarks: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Customer remarks cannot exceed 500 characters"
    })
});

export const updateDailyProgressLogSchema = Joi.object({
    logId: Joi.string().forbidden(),
    // No date restriction on update: the existing (possibly past) date must
    // stay editable without friction.
    date: Joi.date().messages({
        "date.base": "Please enter a valid date"
    }),
    project: Joi.string().trim().min(2).max(100),
    technician: Joi.string().trim().min(2).max(50),
    workPerformed: Joi.string().trim().min(1).max(1000).messages({
        "string.max": "Work performed cannot exceed 1000 characters"
    }),
    status: Joi.string().valid(...STATUS_VALUES),
    completedTasks: Joi.string().allow("").max(500).messages({
        "string.max": "Completed tasks cannot exceed 500 characters"
    }),
    pendingTasks: Joi.string().allow("").max(500).messages({
        "string.max": "Pending tasks cannot exceed 500 characters"
    }),
    materials: Joi.string().allow("").max(500).messages({
        "string.max": "Materials summary cannot exceed 500 characters"
    }),
    qty: Joi.number().min(0).max(1000000).allow(null).messages({
        "number.max": "Quantity cannot exceed 1,000,000"
    }),
    materialUsage: materialUsageSchema,
    delayStatus: Joi.string().valid(...DELAY_VALUES),
    delayReason: Joi.string().allow("").max(500).messages({
        "string.max": "Delay reason cannot exceed 500 characters"
    }),
    weather: Joi.string().valid(...WEATHER_VALUES),
    weatherDesc: Joi.string().allow("").max(500).messages({
        "string.max": "Weather description cannot exceed 500 characters"
    }),
    gpsLat: Joi.string().allow("").max(20).custom(isValidLatitude).messages({
        "any.invalid": "Latitude must be a number between -90 and 90"
    }),
    gpsLng: Joi.string().allow("").max(20).custom(isValidLongitude).messages({
        "any.invalid": "Longitude must be a number between -180 and 180"
    }),

    images: Joi.array().max(10),
    videos: Joi.array().max(10),
    nextDayPlan: Joi.string().allow("").max(500).messages({
        "string.max": "Next day plan cannot exceed 500 characters"
    }),
    issuesFound: Joi.string().allow("").max(500).messages({
        "string.max": "Issues found cannot exceed 500 characters"
    }),
    customerRemarks: Joi.string().allow("").max(500).messages({
        "string.max": "Customer remarks cannot exceed 500 characters"
    })
});
