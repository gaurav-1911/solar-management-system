import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import logger from "../utils/logger.js";

const errorMiddleware = (
    err,
    req,
    res,
    next
) => {
    logger.error("Unhandled Application Error:", err);

    let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    let message = err.message || MESSAGE.INTERNAL_SERVER_ERROR;
    let errors = err.errors || null;

    if (err.name === "ValidationError" && err.errors) {
        statusCode = HTTP_STATUS.BAD_REQUEST;
        const details = Object.values(err.errors).map((e) => e.message);
        message = details.join(". ") || "Validation error";
        errors = details;
    }

    const formattedErrors = Array.isArray(errors)
        ? errors
        : (errors ? [errors] : [message]);

    return res.status(statusCode).json({
        success: false,
        message,
        errors: formattedErrors,
        data: null
    });
};

export default errorMiddleware;