import express from "express";
import {
    createGstInvoice,
    getAllGstInvoices,
    getGstInvoiceById,
    updateGstInvoice,
    deleteGstInvoice
} from "../controllers/gstInvoice.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createGstInvoiceSchema,
    updateGstInvoiceSchema
} from "../validations/gstInvoice.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllGstInvoices)
    .post(checkPermission("billing", "create"), validate(createGstInvoiceSchema), createGstInvoice);

router
    .route("/:id")
    .get(getGstInvoiceById)
    .put(checkPermission("billing", "edit"), validate(updateGstInvoiceSchema), updateGstInvoice)
    .delete(checkPermission("billing", "delete"), deleteGstInvoice);

export default router;
