import express from "express";
import {
    createTaskAssignment,
    getAllTaskAssignments,
    getTaskAssignmentById,
    updateTaskAssignment,
    deleteTaskAssignment
} from "../controllers/taskAssignment.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createTaskAssignmentSchema,
    updateTaskAssignmentSchema
} from "../validations/taskAssignment.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllTaskAssignments)
    .post(checkPermission("task-assignment", "create"), validate(createTaskAssignmentSchema), createTaskAssignment);

router
    .route("/:id")
    .get(getTaskAssignmentById)
    .put(checkPermission("task-assignment", "edit"), validate(updateTaskAssignmentSchema), updateTaskAssignment)
    .delete(checkPermission("task-assignment", "delete"), deleteTaskAssignment);

export default router;
