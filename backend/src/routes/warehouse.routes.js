import express from "express";
import {
    createWarehouse,
    getAllWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
    getWarehouseStats
} from "../controllers/warehouse.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createWarehouseSchema,
    updateWarehouseSchema
} from "../validations/warehouse.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Stats (must be before /:id routes)
router.get("/stats", getWarehouseStats);

// GET is open to any authenticated user — the Inventory page reads this list to
// populate its Location dropdown even for roles without warehouse management
// rights. Writes are guarded by the warehouses module permissions.
router
    .route("/")
    .get(getAllWarehouses)
    .post(checkPermission("warehouses", "create"), validate(createWarehouseSchema), createWarehouse);

router
    .route("/:id")
    .get(getWarehouseById)
    .put(checkPermission("warehouses", "edit"), validate(updateWarehouseSchema), updateWarehouse)
    .delete(checkPermission("warehouses", "delete"), deleteWarehouse);

export default router;
