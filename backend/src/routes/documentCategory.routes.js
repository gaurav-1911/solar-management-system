import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
} from "../controllers/documentCategory.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAllCategories);
router.get("/:id", getCategoryById);
router.post("/", checkPermission("documents", "create"), createCategory);
router.put("/:id", checkPermission("documents", "edit"), updateCategory);
router.delete("/:id", checkPermission("documents", "delete"), deleteCategory);

export default router;
