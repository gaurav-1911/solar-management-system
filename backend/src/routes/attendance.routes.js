import express from "express";
import {
    createAttendance,
    getAllAttendance,
    getAttendanceById,
    updateAttendance,
    deleteAttendance
} from "../controllers/attendance.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createAttendanceSchema,
    updateAttendanceSchema
} from "../validations/attendance.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllAttendance)
    .post(checkPermission("attendance", "create"), validate(createAttendanceSchema), createAttendance);

router
    .route("/:id")
    .get(getAttendanceById)
    .put(checkPermission("attendance", "edit"), validate(updateAttendanceSchema), updateAttendance)
    .delete(checkPermission("attendance", "delete"), deleteAttendance);

export default router;
