import express from "express";
import {
    createTechnicianTask,
    getAllTechnicianTasks,
    getTechnicianTaskById,
    updateTechnicianTask,
    deleteTechnicianTask
} from "../controllers/technicianTask.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createTechnicianTaskSchema,
    updateTechnicianTaskSchema
} from "../validations/technicianTask.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllTechnicianTasks)
    .post(checkPermission("technicians", "create"), validate(createTechnicianTaskSchema), createTechnicianTask);

router
    .route("/:id")
    .get(getTechnicianTaskById)
    .put(checkPermission("technicians", "edit"), validate(updateTechnicianTaskSchema), updateTechnicianTask)
    .delete(checkPermission("technicians", "delete"), deleteTechnicianTask);

export default router;
