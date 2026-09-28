import HTTP_STATUS from "../constants/httpStatus.js";

const notFoundMiddleware = (req, res) => {
    const msg = `Route not found - ${req.originalUrl}`;
    return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: msg,
        errors: [msg],
        data: null
    });
};

export default notFoundMiddleware;