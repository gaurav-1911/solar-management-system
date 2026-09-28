import Joi from "joi";

export const createDailyReportSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    date: Joi.date().required()
        .messages({ "date.base": "Date is required" }),

    assignedJob: Joi.string().trim().allow("").default(""),

    workSummary: Joi.string().trim().min(3).max(500).required()
        .messages({
            "string.empty": "Work summary is required",
            "string.max": "Work summary cannot exceed 500 characters"
        }),

    hoursWorked: Joi.number().min(0).max(12).required()
        .messages({
            "number.base": "Hours worked must be a number",
            "number.min": "Hours worked cannot be negative",
            "number.max": "Hours worked cannot be more than 12"
        })
});

export const updateDailyReportSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    date: Joi.date(),

    assignedJob: Joi.string().trim().allow(""),

    workSummary: Joi.string().trim().min(3).max(500),

    hoursWorked: Joi.number().min(0).max(12)
});
