import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getSettings,
    updateSettings
} from "../controllers/settings.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getSettings);
router.put("/", checkPermission("settings", "edit"), updateSettings);

export default router;
