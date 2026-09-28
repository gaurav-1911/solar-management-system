import express from "express";
import {
    createInventoryItem,
    getAllInventoryItems,
    getInventoryItemById,
    updateInventoryItem,
    deleteInventoryItem,
    getInventoryStats
} from "../controllers/inventory.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createInventorySchema,
    updateInventorySchema
} from "../validations/inventory.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Stats (must be before /:id routes)
router.get("/stats", getInventoryStats);

router
    .route("/")
    .get(getAllInventoryItems)
    .post(checkPermission("inventory", "create"), validate(createInventorySchema), createInventoryItem);

router
    .route("/:id")
    .get(getInventoryItemById)
    .put(checkPermission("inventory", "edit"), validate(updateInventorySchema), updateInventoryItem)
    .delete(checkPermission("inventory", "delete"), deleteInventoryItem);

export default router;
