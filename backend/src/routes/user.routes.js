import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getActivities,
    createActivity
} from "../controllers/user.controller.js";

const router = express.Router();

router.use(authMiddleware);

// User Management module guards every write on user accounts
router.get("/", getAllUsers);
router.get("/activities", getActivities);
router.post("/activities", createActivity);
router.get("/:id", getUserById);
router.post("/", checkPermission("users", "create"), createUser);
router.put("/:id", checkPermission("users", "edit"), updateUser);
router.delete("/:id", checkPermission("users", "delete"), deleteUser);

export default router;
