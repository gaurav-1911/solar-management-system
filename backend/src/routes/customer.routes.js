import express from "express";
import {
    getAllCustomers,
    getCustomerById,
    getCustomerProfile,
    createCustomer,
    updateCustomer,
    updateCustomerStatus,
    deleteCustomer,
    getCustomerAnalytics
} from "../controllers/customer.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createCustomerSchema,
    updateCustomerSchema,
    updateCustomerStatusSchema
} from "../validations/customer.validation.js";

const router = express.Router();

// All customer routes are protected (require authentication)
router.use(authMiddleware);

// Analytics (must be before /:id routes)
router.get("/analytics", getCustomerAnalytics);

router.get("/:id/profile", getCustomerProfile);

// CRUD Routes
router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.post("/", checkPermission("customers", "create"), validate(createCustomerSchema), createCustomer);
router.put("/:id", checkPermission("customers", "edit"), validate(updateCustomerSchema), updateCustomer);

// Status Update
router.patch("/:id/status", checkPermission("customers", "edit"), validate(updateCustomerStatusSchema), updateCustomerStatus);

// Delete
router.delete("/:id", checkPermission("customers", "delete"), deleteCustomer);

export default router;
