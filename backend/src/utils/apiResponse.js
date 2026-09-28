/**
 * Standardized Unified Response Envelope Helpers
 * 
 * Standard Success Envelope:
 * {
 *   success: true,
 *   message: string,
 *   data: any,
 *   errors: null,
 *   pagination?: { page, limit, total, totalPages }
 * }
 * 
 * Standard Error Envelope:
 * {
 *   success: false,
 *   message: string,
 *   errors: Array<string|object> | null,
 *   data: null
 * }
 */

export const sendSuccess = (res, statusCode = 200, message = "", data = null, pagination = null) => {
    const payload = {
        success: true,
        message: message || "Operation completed successfully",
        data: data !== undefined ? data : null,
        errors: null
    };
    if (pagination) {
        payload.pagination = pagination;
    }
    return res.status(statusCode).json(payload);
};

export const sendError = (res, statusCode = 400, message = "An error occurred", errors = null, data = null) => {
    let formattedErrors = null;
    if (Array.isArray(errors)) {
        formattedErrors = errors;
    } else if (errors) {
        formattedErrors = [errors];
    }
    return res.status(statusCode).json({
        success: false,
        message: message || "An error occurred",
        errors: formattedErrors,
        data: data !== undefined ? data : null
    });
};
