import Joi from "joi";

export const validateCreateDocumentCategory = Joi.object({
    key: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .required()
        .messages({
            "string.empty": "Category key is required",
            "any.required": "Category key is required",
            "string.pattern.base": "Key must be a slug (e.g. customer-documents)"
        }),
    label: Joi.string().trim().required().messages({
        "string.empty": "Category label is required",
        "any.required": "Category label is required"
    }),
    description: Joi.string().trim().allow("").optional(),
    color: Joi.string().trim().allow("").optional(),
    icon: Joi.string().trim().allow("").optional(),
    isSystem: Joi.boolean().optional()
});

export const validateUpdateDocumentCategory = Joi.object({
    key: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .optional()
        .messages({
            "string.pattern.base": "Key must be a slug (e.g. customer-documents)"
        }),
    label: Joi.string().trim().optional(),
    description: Joi.string().trim().allow("").optional(),
    color: Joi.string().trim().allow("").optional(),
    icon: Joi.string().trim().allow("").optional(),
    isSystem: Joi.boolean().optional()
});
