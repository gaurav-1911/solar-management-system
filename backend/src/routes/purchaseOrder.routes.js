import express from "express";
import {
    createPurchaseOrder,
    getAllPurchaseOrders,
    getPurchaseOrderById,
    updatePurchaseOrder,
    deletePurchaseOrder
} from "../controllers/purchaseOrder.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createPurchaseOrderSchema,
    updatePurchaseOrderSchema
} from "../validations/purchaseOrder.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Purchase orders are created and managed from the Vendor Management module
router
    .route("/")
    .get(getAllPurchaseOrders)
    .post(checkPermission("vendors", "create"), validate(createPurchaseOrderSchema), createPurchaseOrder);

router
    .route("/:id")
    .get(getPurchaseOrderById)
    .put(checkPermission("vendors", "edit"), validate(updatePurchaseOrderSchema), updatePurchaseOrder)
    .delete(checkPermission("vendors", "delete"), deletePurchaseOrder);

export default router;
