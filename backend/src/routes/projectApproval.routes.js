import express from "express";
import {
    createProjectApproval,
    getAllProjectApprovals,
    getProjectApprovalById,
    updateProjectApproval,
    deleteProjectApproval,
    getProjectApprovalStats
} from "../controllers/projectApproval.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
    createProjectApprovalSchema,
    updateProjectApprovalSchema
} from "../validations/projectApproval.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/")
    .get(getAllProjectApprovals)
    .post(checkPermission("project-approval", "create"), validate(createProjectApprovalSchema), createProjectApproval);

router.get("/stats", getProjectApprovalStats);

router.route("/:id")
    .get(getProjectApprovalById)
    .put(checkPermission("project-approval", "edit"), validate(updateProjectApprovalSchema), updateProjectApproval)
    .delete(checkPermission("project-approval", "delete"), deleteProjectApproval);

export default router;
