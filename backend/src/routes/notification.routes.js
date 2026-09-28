import express from "express";
import {
    getNotificationSummary,
    getUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} from "../controllers/notification.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

// Existing: lightweight summary for the bell badge
router.get("/summary", getNotificationSummary);

// [FLOW-04] Persistent user-specific notifications
router.get("/", getUserNotifications);
router.patch("/:id/read", markNotificationRead);
router.patch("/read-all", markAllNotificationsRead);

export default router;
