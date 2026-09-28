/**
 * Centralized validation error messages.
 *
 * Concise, clean messages that fit comfortably under input fields
 * without cluttering the UI.
 */

/* Name / Full Name */
export const NAME_REQUIRED_MSG = "Full name is required";
export const NAME_MIN_MSG = "Name must be at least 2 characters";
export const NAME_MAX_MSG = "Name cannot exceed 50 characters";
export const NAME_PATTERN_MSG = "Name can only contain letters, spaces, dots, apostrophes & hyphens (2-50 chars)";

/* Email */
export const EMAIL_REQUIRED_MSG = "Email address is required";
export const EMAIL_PATTERN_MSG = "Please enter a valid email address";
export const EMAIL_MAX_MSG = "Email address cannot exceed 100 characters";

/* Phone */
export const PHONE_REQUIRED_MSG = "Phone number is required";
export const PHONE_PATTERN_MSG = "Please enter a valid 10-digit phone number";

/* Password */
export const PASSWORD_PATTERN_MSG =
  "Must be 8-32 chars with uppercase, lowercase, number & symbol";
export const PASSWORD_MISMATCH_MSG = "Passwords do not match";

/* Address & Notes */
export const ADDRESS_REQUIRED_MSG = "Address is required";
export const ADDRESS_MIN_MSG = "Address must be at least 3 characters";
export const ADDRESS_MAX_MSG = "Address cannot exceed 250 characters";
export const NOTES_MAX_MSG = "Notes cannot exceed 500 characters";

/* Description */
export const DESCRIPTION_MIN_MSG = "Description must be at least 5 characters";
export const DESCRIPTION_MAX_MSG = "Description cannot exceed 500 characters";

/* Status */
export const STATUS_REQUIRED_MSG = "Status is required";

/* Capacity */
export const CAPACITY_REQUIRED_MSG = "Capacity is required";
export const CAPACITY_MIN_MSG = "Capacity cannot be negative";
export const CAPACITY_MAX_MSG = "Capacity cannot exceed 100,000 kW";

/* Numbers */
export const POSITIVE_NUMBER_MSG = "Must be a positive number";
export const VALID_NUMBER_MSG = "Please enter a valid number";
export const NON_NEGATIVE_MSG = "Cannot be negative";
export const WHOLE_NUMBER_MSG = "Must be a whole number";

/* Decimal / GPS */
export const DECIMAL_NUMBER_MSG = "Please enter a valid decimal number";

/* Percentage (0-100) */
export const PERCENT_RANGE_MSG = "Must be between 0 and 100";
