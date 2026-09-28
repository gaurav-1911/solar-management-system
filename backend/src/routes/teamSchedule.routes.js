import express from "express";
import {
    createTeamSchedule,
    getAllTeamSchedules,
    getTeamScheduleById,
    updateTeamSchedule,
    deleteTeamSchedule
} from "../controllers/teamSchedule.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createTeamScheduleSchema,
    updateTeamScheduleSchema
} from "../validations/teamSchedule.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllTeamSchedules)
    .post(checkPermission("team-schedule", "create"), validate(createTeamScheduleSchema), createTeamSchedule);

router
    .route("/:id")
    .get(getTeamScheduleById)
    .put(checkPermission("team-schedule", "edit"), validate(updateTeamScheduleSchema), updateTeamSchedule)
    .delete(checkPermission("team-schedule", "delete"), deleteTeamSchedule);

export default router;
