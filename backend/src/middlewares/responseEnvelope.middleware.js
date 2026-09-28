import { sendSuccess, sendError } from "../utils/apiResponse.js";

/**
 * Express middleware attaching res.success() and res.error() helpers to ensure
 * standardized response envelopes across all routes and controllers.
 */
const responseEnvelopeMiddleware = (req, res, next) => {
    res.success = (data = null, message = "", statusCode = 200, pagination = null) => {
        return sendSuccess(res, statusCode, message, data, pagination);
    };

    res.error = (message = "An error occurred", statusCode = 400, errors = null, data = null) => {
        return sendError(res, statusCode, message, errors, data);
    };

    next();
};

export default responseEnvelopeMiddleware;
