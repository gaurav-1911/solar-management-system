import express from "express";
import {
    createDailyProgressLog,
    getAllDailyProgressLogs,
    getDailyProgressLogById,
    updateDailyProgressLog,
    deleteDailyProgressLog,
    uploadDailyProgressFiles,
    getTechnicianProjects,
    getProjectMaterials,
    UPLOAD_DIR
} from "../controllers/dailyProgressLog.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createDailyProgressLogSchema, updateDailyProgressLogSchema } from "../validations/dailyProgressLog.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();
router.use(authMiddleware);

const uploadMany = createUploadMiddleware({ name: "files", maxCount: 10 }, { maxFileSize: 25 * 1024 * 1024 });

router.post("/upload", checkPermission("daily-progress", "create"), uploadMany, uploadDailyProgressFiles);

// Project names assigned to a technician (for the form's project dropdown).
// MUST stay above the "/:id" route below so it is not shadowed by it.
router.get("/technician-projects", getTechnicianProjects);

// Material budget + remaining usage for a project (from its Installation).
// MUST stay above the "/:id" route below so it is not shadowed by it.
router.get("/project-materials", getProjectMaterials);

router.route("/")
    .get(getAllDailyProgressLogs)
    .post(checkPermission("daily-progress", "create"), validate(createDailyProgressLogSchema), createDailyProgressLog);

router.route("/:id")
    .get(getDailyProgressLogById)
    .put(checkPermission("daily-progress", "edit"), validate(updateDailyProgressLogSchema), updateDailyProgressLog)
    .delete(checkPermission("daily-progress", "delete"), deleteDailyProgressLog);

export default router;
