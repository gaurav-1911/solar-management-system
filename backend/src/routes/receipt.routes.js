import express from "express";
import {
    createReceipt,
    getAllReceipts,
    getReceiptById,
    updateReceipt,
    deleteReceipt,
    getNextReceiptNumber
} from "../controllers/receipt.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createReceiptSchema,
    updateReceiptSchema
} from "../validations/receipt.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Receipts belong to the Payment module
router
    .route("/")
    .get(getAllReceipts)
    .post(checkPermission("payments", "create"), validate(createReceiptSchema), createReceipt);

// Next sequential receipt number — MUST be registered before "/:id"
router.get("/next-number", getNextReceiptNumber);

router
    .route("/:id")
    .get(getReceiptById)
    .put(checkPermission("payments", "edit"), validate(updateReceiptSchema), updateReceipt)
    .delete(checkPermission("payments", "delete"), deleteReceipt);

export default router;
