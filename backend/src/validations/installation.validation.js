import Joi from "joi";
import { notPastDate } from "../utils/dateValidation.js";

// Material entries come from the Product Catalog as objects. Plain strings are
// still allowed so older records ("Available"/"Not Available" arrays) can be
// updated without breaking.
const materialItemSchema = Joi.object({
    productId: Joi.string().allow("").max(50).default(""),
    productName: Joi.string().allow("").max(100).default(""),
    category: Joi.string().allow("").max(50).default(""),
    // Snapshot fields from the Product Catalog so the checklist can show the
    // brand, the supplier (vendor), the unit price, and the available stock at
    // save time.
    brand: Joi.string().allow("").max(100).default(""),
    vendorName: Joi.string().allow("").max(100).default(""),
    price: Joi.number().min(0).max(10000000000).allow(null).default(null),
    stock: Joi.number().min(0).max(1000000).allow(null).default(0),
    quantity: Joi.number().min(0).max(10000).default(1)
        .custom((val, helpers) => {
            const s = String(val);
            const dec = s.includes(".") ? s.split(".")[1].length : 0;
            if (dec > 2) return helpers.error("number.precision");
            return val;
        })
        .messages({
            "number.max": "Quantity cannot exceed 10,000",
            "number.precision": "Maximum 2 decimal places allowed"
        }),
    status: Joi.string().valid("Available", "Not Available").default("Not Available"),
    quotedQty: Joi.number().min(0).max(10000).default(0),
    requested: Joi.boolean().default(false)
});

const materialsSchema = Joi.array().items(Joi.alternatives().try(materialItemSchema, Joi.string())).max(200).default([]);

// Material request schema: technician requests an additional material not in the quotation.
const materialRequestSchema = Joi.object({
    productName: Joi.string().trim().min(1).max(100).required(),
    category: Joi.string().allow("").max(50).default(""),
    brand: Joi.string().allow("").max(100).default(""),
    quantity: Joi.number().min(1).max(10000).required(),
    reason: Joi.string().trim().max(500).allow("").default(""),
    status: Joi.string().valid("Pending", "Sent", "Approved", "Rejected").default("Pending")
});
const materialRequestsSchema = Joi.array().items(materialRequestSchema).max(50).default([]);

export const createInstallationSchema = Joi.object({
    installationId: Joi.string().forbidden(),
    customerName: Joi.string().trim().min(2).max(50).required(),
    leadId: Joi.string().trim().max(50).required(),
    projectName: Joi.string().trim().max(100).allow("").default(""),
    // Only create blocks past dates; updates keep allowing the existing
    // (possibly past) date so completed installations stay editable.
    installationDate: Joi.date().custom(notPastDate).required().messages({
        "date.base": "Please enter a valid installation date",
        "date.min": "Installation date cannot be in the past"
    }),
    installationTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(\s?[AP]M)?$/i).required().messages({
        "string.pattern.base": "Please select a valid installation time"
    }),
    installationAddress: Joi.string().trim().min(3).max(200).required(),
    installationStatus: Joi.string().valid(
        "Pending", "Scheduled", "In Progress", "Completed", "On Hold"
    ).required(),
    notes: Joi.string().allow("").max(100).default("").messages({
        "string.max": "Notes cannot exceed 100 characters"
    }),
    technicianName: Joi.string().allow("").max(50).default("").messages({
        "string.max": "Technician name cannot exceed 50 characters"
    }),
    technicianId: Joi.string().allow("").max(50).default("").messages({
        "string.max": "Technician ID cannot exceed 50 characters"
    }),
    checklist: Joi.array().items(Joi.boolean()).max(50).default([]),
    // Dynamic tasks: each has a name, status, and daily log entries.
    tasks: Joi.array().items(
        Joi.object({
            name: Joi.string().trim().min(1).max(100).required(),
            status: Joi.string().valid("To Do", "In Progress", "Completed").default("To Do"),
            dailyLogs: Joi.array().items(
                Joi.object({
                    date: Joi.date().required(),
                    description: Joi.string().trim().max(500).required()
                })
            ).max(365).default([])
        })
    ).max(50).default([]),
    materials: materialsSchema,
    materialRequests: materialRequestsSchema,
    // Matches the route's MAX_PHOTOS = 10 upload cap.
    sitePhotos: Joi.array().max(10).default([]),
    sitePhotosKeep: Joi.any(),
    verificationStatus: Joi.string().valid("Verified", "Not Verified"),
    verificationNotes: Joi.string().allow("").max(200).default("").messages({
        "string.max": "Verification notes cannot exceed 200 characters"
    })
});

export const updateInstallationSchema = Joi.object({
    installationId: Joi.string().forbidden(),
    customerName: Joi.string().trim().min(2).max(50),
    leadId: Joi.string().trim().max(50),
    projectName: Joi.string().trim().max(100).allow(""),
    // No past-date restriction on update: the original (possibly past)
    // installation date must stay selectable when editing.
    installationDate: Joi.date().messages({
        "date.base": "Please enter a valid installation date"
    }),
    installationTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(\s?[AP]M)?$/i).messages({
        "string.pattern.base": "Please select a valid installation time"
    }),
    installationAddress: Joi.string().trim().min(3).max(200),
    installationStatus: Joi.string().valid(
        "Pending", "Scheduled", "In Progress", "Completed", "On Hold"
    ),
    notes: Joi.string().allow("").max(100).messages({
        "string.max": "Notes cannot exceed 100 characters"
    }),
    technicianName: Joi.string().allow("").max(50).messages({
        "string.max": "Technician name cannot exceed 50 characters"
    }),
    technicianId: Joi.string().allow("").max(50).messages({
        "string.max": "Technician ID cannot exceed 50 characters"
    }),
    checklist: Joi.array().items(Joi.boolean()).max(50),
    tasks: Joi.array().items(
        Joi.object({
            name: Joi.string().trim().min(1).max(100),
            status: Joi.string().valid("To Do", "In Progress", "Completed"),
            dailyLogs: Joi.array().items(
                Joi.object({
                    date: Joi.date(),
                    description: Joi.string().trim().max(500)
                })
            ).max(365)
        })
    ).max(50),
    materials: materialsSchema,
    materialRequests: materialRequestsSchema,
    // Matches the route's MAX_PHOTOS = 10 upload cap.
    sitePhotos: Joi.array().max(10),
    sitePhotosKeep: Joi.any(),
    verificationStatus: Joi.string().valid("Verified", "Not Verified"),
    verificationNotes: Joi.string().allow("").max(200).messages({
        "string.max": "Verification notes cannot exceed 200 characters"
    })
});
