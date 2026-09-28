import express from "express";
import {
    getAllQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    updateQuotationStatus,
    approveQuotation,
    deleteQuotation,
    getQuotationAnalytics,
    getAllStockRequests,
    createStockRequest,
    approveStockRequest,
    rejectStockRequest,
    sendQuotationEmail,
    resetCustomerResponse
} from "../controllers/quotation.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createQuotationSchema,
    updateQuotationSchema,
    updateQuotationStatusSchema
} from "../validations/quotation.validation.js";

const router = express.Router();

// All quotation routes are protected (require authentication)
router.use(authMiddleware);

// Analytics (must be registered before /:id routes)
router.get("/analytics", getQuotationAnalytics);

// Stock requests (installation → quotation approval flow). Must be registered
// before "/:id" so "stock-requests" is never captured as an id.
router.get("/stock-requests", getAllStockRequests);
router.post("/stock-requests", checkPermission("quotations", "create"), createStockRequest);
router.patch("/stock-requests/:id/approve", checkPermission("quotations", "edit"), approveStockRequest);
router.patch("/stock-requests/:id/reject", checkPermission("quotations", "edit"), rejectStockRequest);

// CRUD Routes
router.get("/", getAllQuotations);
router.post("/", checkPermission("quotations", "create"), validate(createQuotationSchema), createQuotation);
router.get("/:id", getQuotationById);
router.put("/:id", checkPermission("quotations", "edit"), validate(updateQuotationSchema), updateQuotation);

// Status Update
router.patch("/:id/status", checkPermission("quotations", "edit"), validate(updateQuotationStatusSchema), updateQuotationStatus);

router.patch("/:id/approve", approveQuotation);

// Send quotation email to customer
router.post("/:id/send-email", checkPermission("quotations", "edit"), sendQuotationEmail);

// Reset customer response (for sales team to resend after editing)
router.patch("/:id/reset-response", checkPermission("quotations", "edit"), resetCustomerResponse);

// Delete
router.delete("/:id", checkPermission("quotations", "delete"), deleteQuotation);

export default router;
