import Joi from "joi";

const fileTypes = ["pdf", "image", "spreadsheet", "word", "drawing", "other"];
const accessLevels = ["admin", "finance", "team", "all"];
const statuses = ["approved", "pending", "rejected", "draft"];

export const validateCreateDocument = Joi.object({
    // name may be omitted when the file is uploaded - the controller derives
    // it from the uploaded file's original filename.
    name: Joi.string().trim().allow("").optional().messages({
        "string.empty": "Document name is required"
    }),
    category: Joi.string().trim().required().messages({
        "string.empty": "Category is required",
        "any.required": "Category is required"
    }),
    entity: Joi.string().trim().allow("").optional(),
    entityType: Joi.string().trim().allow("").optional(),
    fileType: Joi.string()
        .valid(...fileTypes)
        .optional(),
    size: Joi.number().integer().min(0).optional(),
    uploadedBy: Joi.string().trim().allow("").optional(),
    access: Joi.string()
        .valid(...accessLevels)
        .optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    status: Joi.string()
        .valid(...statuses)
        .optional()
});

export const validateUpdateDocument = Joi.object({
    name: Joi.string().trim().optional(),
    category: Joi.string().trim().optional(),
    entity: Joi.string().trim().allow("").optional(),
    entityType: Joi.string().trim().allow("").optional(),
    fileType: Joi.string()
        .valid(...fileTypes)
        .optional(),
    size: Joi.number().integer().min(0).optional(),
    uploadedBy: Joi.string().trim().allow("").optional(),
    access: Joi.string()
        .valid(...accessLevels)
        .optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    status: Joi.string()
        .valid(...statuses)
        .optional()
});

// NOTE: verifiedBy/verifiedAt/rejectedBy/rejectedAt/rejectionReason are NOT
// accepted here on purpose. They can only be written by reviewDocument
// (PATCH /:id/status) via document.save(), so the audit trail can never be
// forged through the generic update route.
