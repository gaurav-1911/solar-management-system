import Joi from "joi";

const SHIFT_TYPES = ["Morning", "Afternoon", "Night", "Full Day"];
const SCHEDULE_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];

export const createTeamScheduleSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    date: Joi.date().required()
        .messages({ "date.base": "Date is required" }),

    shift: Joi.string().valid(...SHIFT_TYPES).default("Morning"),

    shiftStart: Joi.string().default("08:00"),

    shiftEnd: Joi.string().default("16:00"),

    jobAssignment: Joi.string().trim().required().max(100)
        .messages({
            "string.empty": "Job assignment is required",
            "string.max": "Job assignment cannot exceed 100 characters"
        }),

    siteLocation: Joi.string().trim().required().max(150)
        .messages({
            "string.empty": "Site location is required",
            "string.max": "Site location cannot exceed 150 characters"
        }),

    status: Joi.string().valid(...SCHEDULE_STATUSES).default("Scheduled"),

    notes: Joi.string().trim().allow("").default("").max(500)
        .messages({ "string.max": "Notes cannot exceed 500 characters" })
});

export const updateTeamScheduleSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    date: Joi.date(),

    shift: Joi.string().valid(...SHIFT_TYPES),

    shiftStart: Joi.string(),

    shiftEnd: Joi.string(),

    jobAssignment: Joi.string().trim().max(100)
        .messages({ "string.max": "Job assignment cannot exceed 100 characters" }),

    siteLocation: Joi.string().trim().max(150)
        .messages({ "string.max": "Site location cannot exceed 150 characters" }),

    status: Joi.string().valid(...SCHEDULE_STATUSES),

    notes: Joi.string().trim().allow("").max(500)
        .messages({ "string.max": "Notes cannot exceed 500 characters" })
});
