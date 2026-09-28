import Joi from "joi";
import { PASSWORD_REGEX, EMAIL_REGEX } from "./constants.js";

export { PASSWORD_REGEX, EMAIL_REGEX };

const passwordValidation = Joi.string()
    .min(8)
    .max(32)
    .pattern(PASSWORD_REGEX)
    .required()
    .messages({
        "string.pattern.base": "Password must be 8-32 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
        "string.min": "Password must be at least 8 characters",
        "string.max": "Password cannot exceed 32 characters",
        "any.required": "Password is required"
    });

// Login accepts either an email address or a username in the `email` field.
export const loginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .lowercase()
        .required()
        .messages({
            "string.empty": "Email or username is required",
            "any.required": "Email or username is required"
        }),

    password: Joi.string()
        .required()
        .messages({
            "any.required": "Password is required"
        })
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string()
        .email()
        .trim()
        .lowercase()
        .required()
        .messages({
            "string.email": "Please enter a valid email address",
            "any.required": "Email address is required"
        })
});

export const resetPasswordSchema = Joi.object({
    password: passwordValidation,

    confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .optional()
        .messages({
            "any.only": "Passwords do not match"
        })
});

export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string()
        .required()
        .messages({
            "any.required": "Current password is required"
        }),

    newPassword: passwordValidation
        .invalid(Joi.ref('currentPassword'))
        .messages({
            "any.invalid": "New password must be different from your current password"
        }),

    confirmPassword: Joi.string()
        .valid(Joi.ref('newPassword'))
        .required()
        .messages({
            "any.only": "Passwords do not match",
            "any.required": "Please confirm your new password"
        })
});

export const updateProfileSchema = Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().allow("", null).optional(),
    department: Joi.string().allow("", null).optional(),
    location: Joi.string().allow("", null).optional(),
    bio: Joi.string().allow("", null).optional(),
    photo: Joi.string().allow("", null).optional()
});