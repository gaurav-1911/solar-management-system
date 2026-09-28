import express from "express";
import {
    createDailyReport,
    getAllDailyReports,
    getDailyReportById,
    updateDailyReport,
    deleteDailyReport
} from "../controllers/dailyReport.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createDailyReportSchema,
    updateDailyReportSchema
} from "../validations/dailyReport.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllDailyReports)
    .post(checkPermission("technicians", "create"), validate(createDailyReportSchema), createDailyReport);

router
    .route("/:id")
    .get(getDailyReportById)
    .put(checkPermission("technicians", "edit"), validate(updateDailyReportSchema), updateDailyReport)
    .delete(checkPermission("technicians", "delete"), deleteDailyReport);

export default router;
