import express from "express";
import {
    getAllFollowUps,
    getFollowUpById,
    createFollowUp,
    updateFollowUp,
    updateFollowUpStatus,
    deleteFollowUp,
    getOverdueFollowUps,
    getFollowUpAnalytics
} from "../controllers/followUp.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
    createFollowUpSchema,
    updateFollowUpSchema,
    updateFollowUpStatusSchema
} from "../validations/followUp.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Specific named sub-routes before parametric /:id
router.get("/analytics", checkPermission("follow-ups", "view"), getFollowUpAnalytics);
router.get("/overdue", checkPermission("follow-ups", "view"), getOverdueFollowUps);

router
    .route("/")
    .get(checkPermission("follow-ups", "view"), getAllFollowUps)
    .post(checkPermission("follow-ups", "create"), validate(createFollowUpSchema), createFollowUp);

router
    .route("/:id")
    .get(checkPermission("follow-ups", "view"), getFollowUpById)
    .put(checkPermission("follow-ups", "edit"), validate(updateFollowUpSchema), updateFollowUp)
    .delete(checkPermission("follow-ups", "delete"), deleteFollowUp);

router.patch(
    "/:id/status",
    checkPermission("follow-ups", "edit"),
    validate(updateFollowUpStatusSchema),
    updateFollowUpStatus
);

export default router;
