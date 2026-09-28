import Joi from "joi";
import {
    NAME_REGEX,
    EMAIL_REGEX,
    PHONE_REGEX,
    PASSWORD_REGEX
} from "./constants.js";

export { NAME_REGEX, EMAIL_REGEX, PHONE_REGEX, PASSWORD_REGEX };

// Human-friendly messages — identical wording to the frontend messages.
const NAME_REQUIRED_MSG = "Full name is required";
const NAME_MIN_MSG = "Name must be at least 2 characters";
const NAME_PATTERN_MSG = "Name must start with a letter and be 2-50 characters";
const EMAIL_PATTERN_MSG = "Please enter a valid email address";
const PHONE_PATTERN_MSG = "Please enter a valid 10-digit phone number";
const PASSWORD_PATTERN_MSG =
    "Password must be 8-32 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.";

// Note: `role` is intentionally NOT constrained to a fixed list — admins can
// create custom roles (e.g. "tesing") in the Role & Permissions module, so
// any non-empty role key is accepted. The same applies to `department`
// (custom departments come from the DB), so both stay unconstrained.
const statuses = ["active", "inactive"];

// ── Shared field definitions (Create/Update can never drift apart) ──────────
// Name: validated with the Google-level pattern whenever it is provided
// (optional in both Create and Update so partial payloads never fail).
// `string.empty` is mapped to a friendly message so raw Joi errors like
// `"name" is not allowed to be empty` can never reach the client.
const nameField = Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(NAME_REGEX)
    .messages({
        "string.empty": NAME_REQUIRED_MSG,
        "string.min": NAME_MIN_MSG,
        "string.max": NAME_PATTERN_MSG,
        "string.pattern.base": NAME_PATTERN_MSG
    });

const usernameField = Joi.string()
    .trim()
    .lowercase()
    .min(3)
    .max(30)
    .pattern(/^[a-z0-9._-]+$/)
    .allow("", null)
    .optional()
    .messages({
        "string.pattern.base": "Username can only contain lowercase letters, numbers, dots, underscores and hyphens",
        "string.min": "Username must be at least 3 characters",
        "string.max": "Username cannot exceed 30 characters"
    });

const emailField = Joi.string()
    .trim()
    .lowercase()
    .pattern(EMAIL_REGEX)
    .allow("", null)
    .optional()
    .messages({
        "string.pattern.base": EMAIL_PATTERN_MSG
    });

// Phone is optional at the API level (bulk imports / legacy records may omit
// it), but whenever a value is present it must match the same pattern the UI
// enforces. Like the frontend (isValidPhone), separators such as spaces,
// dashes and parentheses are stripped BEFORE validation, and the normalized
// value (digits + optional leading +) is what gets stored.
const phoneField = Joi.string()
    .trim()
    .custom((value, helpers) => {
        if (value === "" || value == null) return value;
        const cleaned = String(value).replace(/[\s-()]/g, "");
        if (!PHONE_REGEX.test(cleaned)) {
            return helpers.error("string.pattern.base");
        }
        return cleaned;
    }, "phone normalization + pattern")
    .allow("")
    .optional()
    .messages({
        "string.pattern.base": PHONE_PATTERN_MSG
    });

export const validateCreateUser = Joi.object({
    // The Add User form always sends a name and the UI requires it, so the
    // name must be valid whenever it is provided. It is kept optional here
    // purely as a safety net — the controller derives a valid display name
    // from the login identifier when it is absent.
    name: nameField.optional(),
    username: usernameField,
    // Email OR username is required (checked in the controller) — the admin
    // provides a single login identifier and the missing field is derived.
    email: emailField,
    // Optional — when omitted the controller hashes a default password.
    // When provided it must satisfy the full password policy.
    password: Joi.string()
        .pattern(PASSWORD_REGEX)
        .optional()
        .messages({
            "string.pattern.base": PASSWORD_PATTERN_MSG
        }),
    phone: phoneField,
    role: Joi.string()
        .required()
        .messages({
            "any.required": "Role is required",
            "string.empty": "Role is required"
        }),
    department: Joi.string()
        .trim()
        .allow("", null)
        .optional(),
    designation: Joi.string().trim().optional(),
    status: Joi.string()
        .valid(...statuses)
        .optional(),
    joinDate: Joi.date().allow(null).optional(),
    employeeId: Joi.string().trim().allow("").optional(),
    reportsTo: Joi.string().trim().allow("").optional(),
    photo: Joi.string().allow(null).optional(),
    permissions: Joi.array().items(Joi.string()).optional(),
    modules: Joi.array().items(Joi.string()).optional()
}).unknown(true);

export const validateUpdateUser = Joi.object({
    // Name is OPTIONAL on update: status toggles and bulk role/department
    // syncs send partial payloads (e.g. only { status }), so requiring the
    // name here would reject them with "Full name is required". Whenever a
    // name IS provided (e.g. the Edit User form) it is still validated below.
    name: nameField.optional().messages({
        "string.empty": NAME_REQUIRED_MSG,
        "string.min": NAME_MIN_MSG,
        "string.max": NAME_PATTERN_MSG,
        "string.pattern.base": NAME_PATTERN_MSG
    }),
    username: usernameField,
    email: emailField,
    phone: phoneField,
    role: Joi.string()
        .optional()
        .messages({
            "string.empty": "Role is required"
        }),
    // Department is NOT restricted to the static default list: admins can
    // create custom departments in the Departments tab (stored in the DB),
    // so any non-empty value is accepted — same rule as validateCreateUser.
    department: Joi.string()
        .trim()
        .allow("", null)
        .optional(),
    designation: Joi.string().trim().optional(),
    status: Joi.string()
        .valid(...statuses)
        .optional(),
    joinDate: Joi.date().allow(null).optional(),
    employeeId: Joi.string().trim().allow("").optional(),
    reportsTo: Joi.string().trim().allow("").optional(),
    photo: Joi.string().allow(null).optional(),
    permissions: Joi.array().items(Joi.string()).optional(),
    modules: Joi.array().items(Joi.string()).optional()
}).unknown(true);

export const validateCreateActivity = Joi.object({
    userId: Joi.string().trim().required().messages({
        "any.required": "User ID is required"
    }),
    user: Joi.string().trim().allow("").optional(),
    action: Joi.string()
        .valid(
            "Login",
            "Profile Update",
            "Role Change",
            "User Created",
            "Permission Change",
            "Password Reset",
            "Document Upload"
        )
        .required()
        .messages({
            "any.required": "Action is required"
        }),
    detail: Joi.string().trim().allow("").optional(),
    device: Joi.string().trim().allow("").optional()
});
