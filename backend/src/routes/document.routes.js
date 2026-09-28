import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import {
    getAllDocuments,
    getDocumentById,
    createDocument,
    updateDocument,
    deleteDocument,
    downloadDocument,
    reviewDocument
} from "../controllers/document.controller.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();

const uploadSingle = (field) => createUploadMiddleware(field, { maxFileSize: 10 * 1024 * 1024 });


router.use(authMiddleware);


router.get("/", getAllDocuments);
router.get("/:id", getDocumentById);
// Serve the stored file bytes as a download
router.get("/:id/download", downloadDocument);
router.post("/", checkPermission("documents", "create"), uploadSingle("file"), createDocument);
router.put("/:id", checkPermission("documents", "edit"), uploadSingle("file"), updateDocument);
router.delete("/:id", checkPermission("documents", "delete"), deleteDocument);

// Admin-only: approve or reject a submitted document
router.patch("/:id/status", checkPermission("documents", "edit"), reviewDocument);

export default router;
