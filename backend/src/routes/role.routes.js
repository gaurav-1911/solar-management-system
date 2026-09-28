import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
} from "../controllers/role.controller.js";

const router = express.Router();

router.use(authMiddleware);

// Roles & Permissions module guards every write on the role matrix
router.get("/", getAllRoles);
router.get("/:id", getRoleById);
router.post("/", checkPermission("role-permissions", "create"), createRole);
router.put("/:id", checkPermission("role-permissions", "edit"), updateRole);
router.delete("/:id", checkPermission("role-permissions", "delete"), deleteRole);

export default router;
