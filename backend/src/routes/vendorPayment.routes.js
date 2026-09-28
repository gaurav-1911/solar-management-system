import express from "express";
import {
    createVendorPayment,
    getAllVendorPayments,
    getVendorPaymentById,
    updateVendorPayment,
    deleteVendorPayment
} from "../controllers/vendorPayment.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createVendorPaymentSchema,
    updateVendorPaymentSchema
} from "../validations/vendorPayment.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllVendorPayments)
    .post(checkPermission("vendors", "create"), validate(createVendorPaymentSchema), createVendorPayment);

router
    .route("/:id")
    .get(getVendorPaymentById)
    .put(checkPermission("vendors", "edit"), validate(updateVendorPaymentSchema), updateVendorPayment)
    .delete(checkPermission("vendors", "delete"), deleteVendorPayment);

export default router;
