import express from "express";
import {
    createInvoice,
    getAllInvoices,
    getInvoiceById,
    updateInvoice,
    deleteInvoice,
    getBillingStats,
    getNextInvoiceNumber
} from "../controllers/invoice.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createInvoiceSchema,
    updateInvoiceSchema
} from "../validations/invoice.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllInvoices)
    .post(checkPermission("billing", "create"), validate(createInvoiceSchema), createInvoice);

// Billing dashboard KPI aggregates — MUST be registered before "/:id"
router.get("/stats", getBillingStats);

// Next sequential invoice number — MUST be registered before "/:id"
router.get("/next-number", getNextInvoiceNumber);

router
    .route("/:id")
    .get(getInvoiceById)
    .put(checkPermission("billing", "edit"), validate(updateInvoiceSchema), updateInvoice)
    .delete(checkPermission("billing", "delete"), deleteInvoice);

export default router;
