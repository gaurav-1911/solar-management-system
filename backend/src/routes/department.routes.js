import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
} from "../controllers/department.controller.js";

const router = express.Router();


router.use(authMiddleware);

router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);
router.post("/", checkPermission("users", "create"), createDepartment);
router.put("/:id", checkPermission("users", "edit"), updateDepartment);
router.delete("/:id", checkPermission("users", "delete"), deleteDepartment);

export default router;
