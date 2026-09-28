import express from "express";
import {
    createTesting,
    getAllTests,
    getTestById,
    updateTesting,
    deleteTesting,
    downloadTestingDoc,
    downloadTestingPhoto
} from "../controllers/testing.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createTestingSchema, updateTestingSchema } from "../validations/testing.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();
router.use(authMiddleware);

const uploadTestingFiles = createUploadMiddleware(
    [
        { name: "docs", maxCount: 10 },
        { name: "photos", maxCount: 10 }
    ],
    {
        maxFileSize: 5 * 1024 * 1024,
        allowedMime: {
            docs: ["application/pdf", "image/jpeg", "image/png"],
            photos: ["image/jpeg", "image/png"]
        }
    }
);

router.route("/")
    .get(getAllTests)
    .post(checkPermission("testing", "create"), uploadTestingFiles, validate(createTestingSchema), createTesting);

// Serve a single stored file (document / photo) as a download.
// Registered before "/:id" so they are never shadowed by it.
router.get("/:id/docs/:index", downloadTestingDoc);
router.get("/:id/photos/:index", downloadTestingPhoto);

router.route("/:id")
    .get(getTestById)
    .put(checkPermission("testing", "edit"), uploadTestingFiles, validate(updateTestingSchema), updateTesting)
    .delete(checkPermission("testing", "delete"), deleteTesting);

export default router;
