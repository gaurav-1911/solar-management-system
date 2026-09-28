import HTTP_STATUS from "../constants/httpStatus.js";

const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const details = error.details.map((d) => d.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: details[0] || "Validation error",
                errors: details,
                data: null
            });
        }

        next();
    };
};

export default validate;