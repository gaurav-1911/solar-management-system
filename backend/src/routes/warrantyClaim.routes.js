import express from "express";
import { createWarrantyClaim, getAllWarrantyClaims, getWarrantyClaimById, updateWarrantyClaim, deleteWarrantyClaim } from "../controllers/warrantyClaim.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createWarrantyClaimSchema, updateWarrantyClaimSchema } from "../validations/warrantyClaim.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllWarrantyClaims).post(checkPermission("warranty", "create"), validate(createWarrantyClaimSchema), createWarrantyClaim);
router.route("/:id").get(getWarrantyClaimById).put(checkPermission("warranty", "edit"), validate(updateWarrantyClaimSchema), updateWarrantyClaim).delete(checkPermission("warranty", "delete"), deleteWarrantyClaim);

export default router;
