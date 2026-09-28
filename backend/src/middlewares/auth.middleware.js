import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Customer from "../models/customer.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { DEFAULT_JWT_SECRET } from "../constants/jwt.js";
import logger from "../utils/logger.js";

const authMiddleware = async (req, res, next) => {
    // Prevent duplicate authentication if authMiddleware was already executed upstream
    if (req.user && req.user.userId) {
        return next();
    }

    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }
        if (!token) {
            token = req.cookies?.accessToken || req.cookies?.adminToken;
        }
        if (!token && req.query?.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGE.TOKEN_NOT_PROVIDED
            });
        }

        // Same fallback as the login controller (constants/jwt.js), so that
        // when JWT_SECRET is missing from .env, tokens still verify instead
        // of every protected request failing with 401.
        const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

        const decoded = jwt.verify(
            token,
            jwtSecret
        );

        req.user = decoded;

        const userId = decoded.userId || decoded.id || decoded._id;
        if (!userId) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGE.INVALID_TOKEN
            });
        }

        const userDoc = await User.findById(userId)
            .select("status tokenVersion name")
            .lean();

        if (!userDoc) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: "User account no longer exists. Please sign in again."
            });
        }

        if (userDoc.status !== "active") {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Account is inactive. Please contact administrator."
            });
        }

        const tokenVersion = decoded.tokenVersion ?? 0;
        const userVersion = userDoc.tokenVersion ?? 0;
        if (tokenVersion !== userVersion) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGE.INVALID_TOKEN
            });
        }
        req.user.userId = userDoc._id;
        req.user.name = userDoc.name || req.user.email || "";

        if (decoded.role === "customer") {
            try {
                const customerDoc = await Customer.findOne({ email: decoded.email })
                    .select("customerId name")
                    .lean();
                if (customerDoc) {
                    req.customerId   = customerDoc.customerId || "";
                    req.customerName = customerDoc.name || "";
                }
            } catch (custErr) {
                logger.warn("Customer scope lookup failed:", custErr.message);
            }
        }

        next();
    } catch (error) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: MESSAGE.INVALID_TOKEN
        });
    }
};

export default authMiddleware;