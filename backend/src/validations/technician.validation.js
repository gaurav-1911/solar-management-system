import Joi from "joi";

const TECH_SKILLS = [
    "Inverter Installation", "Panel Mounting", "Wiring & Cabling",
    "Battery Systems", "IoT & Monitoring", "Site Survey",
    "Maintenance", "Earthing & Safety"
];

const TECH_EXPERIENCE = ["0-1 Years", "1-3 Years", "3-5 Years", "5-10 Years", "10+ Years"];

export const createTechnicianSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required()
        .messages({
            "string.empty": "Full name is required",
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters"
        }),

    phone: Joi.string().trim().min(10).max(15).required()
        .messages({
            "string.empty": "Phone number is required"
        }),

    email: Joi.string().trim().email().max(100).required()
        .messages({
            "string.empty": "Email address is required",
            "string.email": "Please enter a valid email address (e.g. name@domain.com)",
            "string.max": "Email address cannot exceed 100 characters"
        }),

    skills: Joi.array().items(Joi.string().valid(...TECH_SKILLS)).default([]),

    experience: Joi.string().valid(...TECH_EXPERIENCE).required(),

    status: Joi.string().valid("Available", "Busy", "On Leave", "Inactive").default("Available"),

    joinDate: Joi.date().required()
        .messages({ "date.base": "Join date is required" }),

    photo: Joi.string().allow(null, "").default(null)
});

export const updateTechnicianSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50),

    phone: Joi.string().trim().min(10).max(15),

    email: Joi.string().trim().email().max(100)
        .messages({ "string.email": "Please enter a valid email address" }),

    skills: Joi.array().items(Joi.string().valid(...TECH_SKILLS)).default([]),

    experience: Joi.string().valid(...TECH_EXPERIENCE),

    status: Joi.string().valid("Available", "Busy", "On Leave", "Inactive"),

    joinDate: Joi.date(),

    photo: Joi.string().allow(null, "")
});
