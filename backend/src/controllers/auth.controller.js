import mongoose from "mongoose";
import User from "../models/user.model.js";
import UserActivity from "../models/userActivity.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../services/mail.service.js";
import resetPasswordTemplate from "../templates/resetPassword.template.js";

import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import {
    DEFAULT_JWT_SECRET,
    DEFAULT_JWT_EXPIRE,
    DEFAULT_JWT_REFRESH_SECRET,
    DEFAULT_JWT_REFRESH_EXPIRE,
    getJwtExpire,
    getJwtRefreshExpire
} from "../constants/jwt.js";
import Role from "../models/role.model.js";
import logger from "../utils/logger.js";

export const setAuthCookies = (res, accessToken, refreshToken) => {
    const isProduction = process.env.NODE_ENV === "production";

    const commonCookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/"
    };

    // Access token cookie (1 day limit)
    if (accessToken) {
        res.cookie("accessToken", accessToken, {
            ...commonCookieOptions,
            maxAge: 1 * 24 * 60 * 60 * 1000 // 1 day
        });

        res.cookie("adminToken", accessToken, {
            ...commonCookieOptions,
            maxAge: 1 * 24 * 60 * 60 * 1000 // 1 day
        });
    }

    // Refresh token cookie (7 days limit)
    if (refreshToken) {
        res.cookie("refreshToken", refreshToken, {
            ...commonCookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
    }
};

export const clearAuthCookies = (res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const options = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/"
    };
    res.clearCookie("accessToken", options);
    res.clearCookie("adminToken", options);
    res.clearCookie("refreshToken", options);
};

const getRolePermissionsMap = async (roleName) => {
    try {
        const query = roleName || "super_admin";
        let roleDoc = null;
        if (mongoose.isValidObjectId(query)) {
            roleDoc = await Role.findById(query);
        } else {
            roleDoc = await Role.findOne({
                $or: [
                    { name: { $regex: new RegExp(`^${query.replace(/_/g, " ")}$`, "i") } },
                    { name: { $regex: new RegExp(`^${query}$`, "i") } }
                ]
            });
        }
        if (roleDoc) {
            if (roleDoc.status === "inactive") {
                return { roleLabel: roleDoc.name, permissions: {} };
            }
            if (roleDoc.permissions) {
                const permsObj = {};
                if (typeof roleDoc.permissions.forEach === "function") {
                    roleDoc.permissions.forEach((val, key) => {
                        permsObj[key] = val;
                    });
                } else if (typeof roleDoc.permissions === "object") {
                    Object.assign(permsObj, roleDoc.permissions);
                }
                return { roleLabel: roleDoc.name, permissions: permsObj };
            }
        }
    } catch (e) {
        console.warn("Error fetching role permissions:", e.message);
    }
    return { roleLabel: roleName || "Super Admin", permissions: {} };
};

//#region UserLogin
export const UserLogin = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        // Validation
        if (!email || !password) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.EMAIL_PASSWORD_REQUIRED
            });
        }

        const identifier = email.trim().toLowerCase();

        // Find user by email OR username
        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        });

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.ADMIN_NOT_FOUND
            });
        }

        // Compare password
        const isPasswordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordMatch) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGE.INVALID_PASSWORD
            });
        }

        // Check account status — fail-closed: only "active" accounts can sign in.
        // Only Active / Inactive exist (user.model.js enum), so anything else is blocked.
        if (user.status !== "active") {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: "Account is inactive. Please contact administrator."
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        // Record Activity Log entry in MongoDB
        try {
            await UserActivity.create({
                userId: String(user._id),
                user: user.name || user.email,
                action: "Login",
                detail: `Logged in successfully via ${user.email}`,
                device: req.headers["user-agent"] || "Web Browser"
            });
        } catch (actErr) {
            console.warn("Failed to create login activity log:", actErr.message);
        }

        // Fetch DB Role & Permissions
        const { roleLabel, permissions } = await getRolePermissionsMap(user.role);

        // Generate JWT Tokens (Access Token: 7 days default, Refresh Token: 7 days)
        const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
        const jwtExpire = getJwtExpire();
        const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || DEFAULT_JWT_REFRESH_SECRET;
        const jwtRefreshExpire = getJwtRefreshExpire();

        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                role: user.role || "super_admin",
                tokenVersion: user.tokenVersion || 0
            },
            jwtSecret,
            {
                expiresIn: jwtExpire
            }
        );

        const refreshToken = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                tokenVersion: user.tokenVersion || 0
            },
            jwtRefreshSecret,
            {
                expiresIn: jwtRefreshExpire
            }
        );

        // Set HttpOnly cookies (accessToken 1d, refreshToken 7d)
        setAuthCookies(res, token, refreshToken);

        // Success Response
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.LOGIN_SUCCESS,
            token,
            refreshToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                username: user.username || "",
                role: user.role || "super_admin",
                roleLabel,
                phone: user.phone || "",
                department: user.department || "",
                permissions,
                photo: user.photo || null
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const refreshUserToken = async (req, res) => {
    try {
        const token = req.body?.refreshToken || req.cookies?.refreshToken;

        if (!token) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: "Refresh token not provided"
            });
        }

        const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || DEFAULT_JWT_REFRESH_SECRET;
        let decoded;
        try {
            decoded = jwt.verify(token, jwtRefreshSecret);
        } catch {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: "Invalid or expired refresh token"
            });
        }

        const user = await User.findById(decoded.userId);
        if (!user || user.status !== "active") {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: "User inactive or not found"
            });
        }

        const tokenVersion = decoded.tokenVersion ?? 0;
        const userVersion = user.tokenVersion ?? 0;
        if (tokenVersion !== userVersion) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: "Token has been invalidated"
            });
        }

        // Issue new Access Token
        const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
        const jwtExpire = getJwtExpire();

        const newAccessToken = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                role: user.role || "super_admin",
                tokenVersion: user.tokenVersion || 0
            },
            jwtSecret,
            { expiresIn: jwtExpire }
        );

        setAuthCookies(res, newAccessToken, null);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Token refreshed successfully",
            token: newAccessToken
        });
    } catch (error) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const UserLogout = async (req, res) => {
    try {
        clearAuthCookies(res);
        const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
        const authHeader = req.headers.authorization || "";
        const token = (authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null) || req.cookies?.accessToken;

        // Send 200 OK immediately so frontend is never blocked
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Logged out successfully"
        });

        // Perform async DB version invalidation & activity logging non-blockingly
        if (token) {
            try {
                let decoded;
                try {
                    decoded = jwt.verify(token, jwtSecret);
                } catch {
                    decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true });
                }
                const userId = decoded?.userId || decoded?.id;
                const userEmail = decoded?.email || "";
                if (userId) {
                    await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
                    await UserActivity.create({
                        userId: String(userId),
                        user: userEmail,
                        action: "Logout",
                        detail: "User logged out",
                        device: req.headers["user-agent"] || "Web Browser"
                    }).catch(() => {});
                }
            } catch (err) {}
        }
    } catch (error) {
        logger.error("UserLogout Error:", error);
    }
};

//#region UserProfile
export const UserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId || req.user.id)
            .select("-password");

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.USER_NOT_FOUND
            });
        }

        const { roleLabel, permissions } = await getRolePermissionsMap(user.role);

        const userObj = user.toObject();
        userObj.roleLabel = roleLabel;
        userObj.permissions = permissions;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.PROFILE_FETCH_SUCCESS,
            user: userObj
        });

    } catch (error) {
        console.error(error);

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region ForgotPassword
export const ForgotPassword = async (req, res) => {
    try {
        const { email } = req.body || {};

        if (!email) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.EMAIL_REQUIRED
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // SECURITY: Always return the same response regardless of whether
        // the user exists, to prevent email enumeration attacks.
        const genericSuccessMessage = "If an account exists with that email, a password reset link has been sent.";

        // Check User Exists
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            // Still return 200 OK with success to avoid leaking user existence
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: genericSuccessMessage
            });
        }

        // Generate Reset Token
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Save Token In Database
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpire = Date.now() + 5 * 60 * 1000; // 5 mins

        await user.save({ validateBeforeSave: false });

        // Create Reset URL
        const resetUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/admin/reset-password/${resetToken}`;

        // Generate Email Template
        const emailTemplate = resetPasswordTemplate(resetUrl, {
            userName: user.name || "there",
            expiryMinutes: 5,
            supportEmail: process.env.EMAIL_USER,
        });

        // Send Email
        await sendEmail(
            user.email,
            "Password Reset Request – Solar Management System",
            {
                html: emailTemplate,
                text: `Hi ${user.name || "there"},\n\nYou requested a password reset for your Solar Management System account.\n\nReset your password here: ${resetUrl}\n\nThis link expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`
            }
        );

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: genericSuccessMessage
        });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region ResetPassword
export const ResetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password, confirmPassword } = req.body || {};

        // Validation
        if (!token || !password) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.TOKEN_AND_PASSWORD_REQUIRED
            });
        }

        if (confirmPassword && password !== confirmPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.PASSWORD_MISMATCH || "Passwords do not match"
            });
        }

        // Find user with valid token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpire: { $gt: Date.now() }
        });

        // Token invalid or expired
        if (!user) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.INVALID_OR_EXPIRED_TOKEN
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password & clear reset token fields
        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;

        await user.save({ validateBeforeSave: false });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.PASSWORD_RESET_SUCCESS
        });

    } catch (error) {
        console.error("Reset Password Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region ChangePassword
export const ChangePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword, confirmPassword } = req.body || {};

        if (!currentPassword || !newPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Current password and new password are required"
            });
        }

        if (confirmPassword && newPassword !== confirmPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.PASSWORD_MISMATCH || "New password and confirm password do not match"
            });
        }

        if (currentPassword === newPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGE.NEW_PASSWORD_MUST_DIFFER || "New password must be different from your current password"
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.USER_NOT_FOUND
            });
        }

        // Compare current password
        const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGE.CURRENT_PASSWORD_INCORRECT || "Current password is incorrect"
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;

        await user.save({ validateBeforeSave: false });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: MESSAGE.PASSWORD_CHANGE_SUCCESS || "Password changed successfully"
        });

    } catch (error) {
        console.error("Change Password Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region UpdateProfile
export const UpdateProfile = async (req, res) => {
    try {
        const { name, phone, department, location, bio, photo } = req.body || {};

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.USER_NOT_FOUND
            });
        }

        if (name) user.name = name.trim();
        if (phone !== undefined) user.phone = phone.trim();
        if (department) user.department = department.trim();
        if (location !== undefined) user.location = location.trim();
        if (bio !== undefined) user.bio = bio.trim();
        if (photo !== undefined) user.photo = photo;

        await user.save({ validateBeforeSave: false });

        const updatedUser = await User.findById(user._id).select("-password");

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Profile updated successfully.",
            user: updatedUser
        });

    } catch (error) {
        console.error("Update Profile Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region UploadProfilePhoto
export const UploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No image file provided."
            });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.USER_NOT_FOUND
            });
        }

        // Upload to Cloudinary
        const { uploadFileToCloudinary } = await import("../utils/cloudinaryStorage.js");
        const result = await uploadFileToCloudinary(req.file, "profile-photos");
        if (!result || !result.url) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: "Failed to upload image."
            });
        }

        user.photo = result.url;
        await user.save({ validateBeforeSave: false });

        const updatedUser = await User.findById(user._id).select("-password");

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Profile photo updated successfully.",
            user: updatedUser
        });

    } catch (error) {
        console.error("Upload Profile Photo Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region RemoveProfilePhoto
export const RemoveProfilePhoto = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: MESSAGE.USER_NOT_FOUND
            });
        }

        user.photo = null;
        await user.save({ validateBeforeSave: false });

        const updatedUser = await User.findById(user._id).select("-password");

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Profile photo removed.",
            user: updatedUser
        });

    } catch (error) {
        console.error("Remove Profile Photo Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};