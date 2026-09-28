import express from "express";
import {
    UserLogin,
    UserLogout,
    UserProfile,
    UpdateProfile,
    UploadProfilePhoto,
    RemoveProfilePhoto,
    ForgotPassword,
    ResetPassword,
    ChangePassword,
    refreshUserToken
} from "../controllers/auth.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { loginRateLimiter } from "../middlewares/rateLimiter.middleware.js";

import {
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
    updateProfileSchema
} from "../validations/auth.validation.js";

const router = express.Router();

// Login (Rate limited: 5 requests per 15 minutes per IP)
router.post(
    "/login",
    loginRateLimiter,
    validate(loginSchema),
    UserLogin
);

router.post(
    "/refresh-token",
    loginRateLimiter,
    refreshUserToken
);

router.post(
    "/logout",
    UserLogout
);

router.get(
    "/me",
    authMiddleware,
    UserProfile
);

// Profile (Protected Route)
router.get(
    "/profile",
    authMiddleware,
    UserProfile
);

// Update Profile (Protected Route)
router.put(
    "/profile",
    authMiddleware,
    validate(updateProfileSchema),
    UpdateProfile
);

// Forgot Password
router.post(
    "/forgot-password",
    validate(forgotPasswordSchema),
    ForgotPassword
);

// Reset Password
router.post(
    "/reset-password/:token",
    validate(resetPasswordSchema),
    ResetPassword
);

// Change Password (Protected Route)
router.post(
    "/change-password",
    authMiddleware,
    validate(changePasswordSchema),
    ChangePassword
);

// Upload Profile Photo (Protected Route)
const profilePhotoUpload = createUploadMiddleware("photo", {
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    allowedMime: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
    expandBody: false,
});

router.put(
    "/profile/photo",
    authMiddleware,
    profilePhotoUpload,
    UploadProfilePhoto
);

// Remove Profile Photo (Protected Route)
router.delete(
    "/profile/photo",
    authMiddleware,
    RemoveProfilePhoto
);

export default router;