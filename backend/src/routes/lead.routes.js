import express from "express";
import {
    getAllLeads,
    getLeadById,
    createLead,
    updateLead,
    updateLeadStatus,
    convertLead,
    deleteLead,
    getLeadAnalytics,
    getLeadActivities,
    getOverdueFollowUps
} from "../controllers/lead.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createLeadSchema,
    updateLeadSchema,
    updateLeadStatusSchema
} from "../validations/lead.validation.js";

const router = express.Router();


// All lead routes are protected (require authentication)
router.use(authMiddleware);

// Analytics & Overview (must be before /:id routes)
router.get("/analytics", getLeadAnalytics);
router.get("/overdue", getOverdueFollowUps);

router.get("/", getAllLeads);
router.get("/:id", getLeadById);
router.post("/", checkPermission("leads", "create"), validate(createLeadSchema), createLead);
router.put("/:id", checkPermission("leads", "edit"), validate(updateLeadSchema), updateLead);

// Status Update
router.patch("/:id/status", checkPermission("leads", "edit"), validate(updateLeadStatusSchema), updateLeadStatus);

// Convert to Customer (creates/links a Customer and marks the lead Converted)
router.post("/:id/convert", checkPermission("leads", "edit"), convertLead);

// Activities
router.get("/:id/activities", getLeadActivities);

// Delete
router.delete("/:id", checkPermission("leads", "delete"), deleteLead);

export default router;