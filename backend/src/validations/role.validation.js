import Joi from "joi";

const colors = [
    "slate", "blue", "green", "purple", "orange",
    "red", "cyan", "pink", "yellow", "teal", "indigo",
    "gold", "rose", "emerald"
];

const permissionObject = Joi.object({
    view: Joi.boolean().optional(),
    create: Joi.boolean().optional(),
    edit: Joi.boolean().optional(),
    delete: Joi.boolean().optional(),
    export: Joi.boolean().optional()
});

export const validateCreateRole = Joi.object({
    name: Joi.string().trim().required().messages({
        "string.empty": "Role name is required",
        "any.required": "Role name is required"
    }),
    description: Joi.string().trim().required().messages({
        "string.empty": "Description is required",
        "any.required": "Description is required"
    }),
    color: Joi.string()
        .valid(...colors)
        .optional(),
    isSystem: Joi.boolean().optional(),
    status: Joi.string().valid("active", "inactive").optional(),
    userCount: Joi.number().integer().min(0).optional(),
    permissions: Joi.object()
        .pattern(Joi.string(), permissionObject)
        .optional()
});

export const validateUpdateRole = Joi.object({
    name: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
    color: Joi.string()
        .valid(...colors)
        .optional(),
    isSystem: Joi.boolean().optional(),
    status: Joi.string().valid("active", "inactive").optional(),
    userCount: Joi.number().integer().min(0).optional(),
    permissions: Joi.object()
        .pattern(Joi.string(), permissionObject)
        .optional()
});
