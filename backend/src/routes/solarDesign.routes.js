import express from "express";
import {
    createSolarDesign,
    getAllSolarDesigns,
    getSolarDesignById,
    updateSolarDesign,
    deleteSolarDesign,
    getSolarDesignStats
} from "../controllers/solarDesign.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createSolarDesignSchema, updateSolarDesignSchema } from "../validations/solarDesign.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/")
    .get(getAllSolarDesigns)
    .post(checkPermission("solar-design", "create"), validate(createSolarDesignSchema), createSolarDesign);

router.get("/stats", getSolarDesignStats);

router.route("/:id")
    .get(getSolarDesignById)
    .put(checkPermission("solar-design", "edit"), validate(updateSolarDesignSchema), updateSolarDesign)
    .delete(checkPermission("solar-design", "delete"), deleteSolarDesign);

export default router;
