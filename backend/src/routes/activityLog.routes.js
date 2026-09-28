import express from "express";
import {
    getActivityLogs,
    getActivityStats,
    getActivityLogsByRecord,
    createActivityLog
} from "../controllers/activityLog.controller.js";

const router = express.Router();

// Stats must come before /:id so "stats" isn't treated as an id param
router.get("/stats", getActivityStats);
router.get("/record/:id", getActivityLogsByRecord);
router.get("/", getActivityLogs);
router.post("/", createActivityLog);

export default router;
