import Joi from "joi";
import { notFutureDate } from "../utils/dateValidation.js";

const GRID_STATUSES = ["Pending", "In Progress", "Connected"];
const YES_NO_PENDING = ["Pending", "Installed", "Delivered", "Signed"];
const DISCOM_STATUSES = ["Pending", "Approved", "Rejected"];

const baseFields = {
    leadId: Joi.string().trim().min(2).max(50).required(),
    customerName: Joi.string().allow("").trim().max(100).default(""),
    projectName: Joi.string().allow("").trim().max(100).default(""),
    // Only create blocks future dates; null stays allowed (pending status)
    // and past dates are valid since records are often created after the fact.
    // The notFutureDate custom is skipped for the explicitly allowed null.
    commissioningDate: Joi.date().allow(null).custom(notFutureDate).default(null).messages({
        "date.base": "Please enter a valid commissioning date",
        "date.max": "Commissioning date cannot be in the future"
    }),
    gridConnected: Joi.string().valid(...GRID_STATUSES).default("Pending"),
    netMeterInstalled: Joi.string().valid(...YES_NO_PENDING.slice(0, 2)).default("Pending"),
    discomApproval: Joi.string().valid(...DISCOM_STATUSES).default("Pending"),
    handoverDate: Joi.date().allow(null).custom(notFutureDate).default(null).messages({
        "date.base": "Please enter a valid handover date",
        "date.max": "Handover date cannot be in the future"
    }),
    customerSigned: Joi.string().valid("Pending", "Signed").default("Pending"),
    documentsDelivered: Joi.string().valid("Pending", "Delivered").default("Pending"),
    trainingProvided: Joi.boolean().default(false),
    warrantyRegistered: Joi.boolean().default(false),
    remarks: Joi.string().allow("").trim().max(500).default("").messages({
        "string.max": "Remarks cannot exceed 500 characters"
    })
};

export const createCommissioningSchema = Joi.object(baseFields);

export const updateCommissioningSchema = Joi.object(
    Object.fromEntries(
        Object.entries(baseFields).map(([k, v]) => {
            // No future-date restriction on update: the existing (possibly
            // future if scheduled ahead) date must stay editable.
            if (k === "commissioningDate" || k === "handoverDate") {
                return [k, Joi.date().allow(null).messages({
                    "date.base": `Please enter a valid ${k === "commissioningDate" ? "commissioning" : "handover"} date`
                })];
            }
            return [k, v.optional()];
        })
    )
);
