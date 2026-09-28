import Joi from "joi";

const ATTENDANCE_STATUSES = ["Present", "Absent", "Half Day", "Leave"];

export const createAttendanceSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    date: Joi.date().required()
        .messages({ "date.base": "Date is required" }),

    checkIn: Joi.string().allow("").default(""),

    checkOut: Joi.string().allow("").default(""),

    status: Joi.string().valid(...ATTENDANCE_STATUSES).default("Present")
});

export const updateAttendanceSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    date: Joi.date(),

    checkIn: Joi.string().allow(""),

    checkOut: Joi.string().allow(""),

    status: Joi.string().valid(...ATTENDANCE_STATUSES)
});
