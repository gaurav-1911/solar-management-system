import Joi from "joi";

export const createTechnicianLocationSchema = Joi.object({
    technicianName: Joi.string().trim().required()
        .messages({ "string.empty": "Technician name is required" }),

    technicianId: Joi.string().trim().required()
        .messages({ "string.empty": "Technician ID is required" }),

    latitude: Joi.string().trim().required()
        .messages({ "string.empty": "Latitude is required" }),

    longitude: Joi.string().trim().required()
        .messages({ "string.empty": "Longitude is required" })
});

export const updateTechnicianLocationSchema = Joi.object({
    technicianName: Joi.string().trim(),

    technicianId: Joi.string().trim(),

    latitude: Joi.string().trim(),

    longitude: Joi.string().trim()
});
