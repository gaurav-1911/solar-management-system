import express from "express";
import {
    createProjectProgress,
    getAllProjectProgress,
    getProjectProgressById,
    updateProjectProgress,
    deleteProjectProgress
} from "../controllers/projectProgress.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createProjectProgressSchema, updateProjectProgressSchema } from "../validations/projectProgress.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/")
    .get(getAllProjectProgress)
    .post(checkPermission("project-progress", "create"), validate(createProjectProgressSchema), createProjectProgress);

router.route("/:id")
    .get(getProjectProgressById)
    .put(checkPermission("project-progress", "edit"), validate(updateProjectProgressSchema), updateProjectProgress)
    .delete(checkPermission("project-progress", "delete"), deleteProjectProgress);

export default router;
