import express from "express";
import {
    createSiteSurvey,
    getAllSiteSurveys,
    getSiteSurveyById,
    updateSiteSurvey,
    deleteSiteSurvey,
    downloadElectricityBill,
    downloadSitePhoto
} from "../controllers/siteSurvey.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createSiteSurveySchema, updateSiteSurveySchema } from "../validations/siteSurvey.validation.js";
import { createUploadMiddleware } from "../middlewares/upload.middleware.js";

const router = express.Router();
router.use(authMiddleware);

const uploadSurveyFiles = createUploadMiddleware(
    [
        { name: "electricityBill", maxCount: 1 },
        { name: "sitePhotos", maxCount: 5 }
    ],
    {
        maxFileSize: 5 * 1024 * 1024,
        allowedMime: {
            electricityBill: ["application/pdf", "image/jpeg", "image/png"],
            sitePhotos: ["image/jpeg", "image/png"]
        }
    }
);

router.route("/")
    .get(getAllSiteSurveys)
    .post(checkPermission("site-survey", "create"), uploadSurveyFiles, validate(createSiteSurveySchema), createSiteSurvey);

// Serve the stored file bytes (electricity bill / individual site photo).
// Registered before "/:id" so they are never shadowed by it.
router.get("/:id/electricity-bill", downloadElectricityBill);
router.get("/:id/site-photos/:index", downloadSitePhoto);

router.route("/:id")
    .get(getSiteSurveyById)
    .put(checkPermission("site-survey", "edit"), uploadSurveyFiles, validate(updateSiteSurveySchema), updateSiteSurvey)
    .delete(checkPermission("site-survey", "delete"), deleteSiteSurvey);

export default router;
