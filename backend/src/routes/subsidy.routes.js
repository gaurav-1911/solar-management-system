import express from "express";
import {
  createSubsidy,
  getAllSubsidies,
  getSubsidyById,
  getSubsidyStats,
  updateSubsidy,
  deleteSubsidy,
  uploadSubsidyDocument,
  deleteSubsidyDocument,
  downloadPendingDocument,
  downloadSubsidyDocument,
} from "../controllers/subsidy.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
  createSubsidySchema,
  updateSubsidySchema,
} from "../validations/subsidy.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(authMiddleware);

const uploadSingle = createUploadMiddleware("file", {
  maxFileSize: 10 * 1024 * 1024,
  allowedMime: ["application/pdf", "image/jpeg", "image/png"]
});

router.post("/upload", checkPermission("subsidy", "create"), uploadSingle, uploadSubsidyDocument);


router.delete("/file", checkPermission("subsidy", "edit"), deleteSubsidyDocument);

router.get("/file/:fileRef", downloadPendingDocument);

router.get("/:id/documents/:index", downloadSubsidyDocument);

router
  .route("/")
  .get(getAllSubsidies)
  .post(checkPermission("subsidy", "create"), validate(createSubsidySchema), createSubsidy);


router.get("/stats", getSubsidyStats);

router
  .route("/:id")
  .get(getSubsidyById)
  .put(checkPermission("subsidy", "edit"), validate(updateSubsidySchema), updateSubsidy)
  .delete(checkPermission("subsidy", "delete"), deleteSubsidy);

export default router;