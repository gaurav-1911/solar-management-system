import express from "express";
import {
    createInstallation,
    getAllInstallations,
    getInstallationById,
    updateInstallation,
    updateInstallationStatus,
    deleteInstallation,
    downloadSitePhoto,
    getInstallationStats,
    submitMaterialRequest,
    sendRemainingProducts
} from "../controllers/installation.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createInstallationSchema, updateInstallationSchema } from "../validations/installation.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();
router.use(authMiddleware);

const uploadInstallationPhotos = createUploadMiddleware(
    [{ name: "sitePhotos", maxCount: 10 }],
    {
        maxFileSize: 5 * 1024 * 1024,
        allowedMime: { sitePhotos: ["image/jpeg", "image/png"] }
    }
);

router.route("/")
    .get(getAllInstallations)
    .post(checkPermission("installations", "create"), uploadInstallationPhotos, validate(createInstallationSchema), createInstallation);

router.get("/stats", getInstallationStats);

// Material request: submit a request as a quotation for customer approval.
router.post("/:id/material-request", checkPermission("installations", "edit"), submitMaterialRequest);

// Send remaining (unused) products as a quotation to the customer.
router.post("/:id/send-remaining-products", checkPermission("installations", "edit"), sendRemainingProducts);

// Serve a single stored site photo file bytes as a download.
// Registered before "/:id" so it is never shadowed by it.
router.get("/:id/site-photos/:index", downloadSitePhoto);

router.patch("/:id/status", checkPermission("installations", "edit"), updateInstallationStatus);

router.route("/:id")
    .get(getInstallationById)
    .put(checkPermission("installations", "edit"), uploadInstallationPhotos, validate(updateInstallationSchema), updateInstallation)
    .delete(checkPermission("installations", "delete"), deleteInstallation);

export default router;
