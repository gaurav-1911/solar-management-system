import express from "express";
import { createVendorEscalation, getAllVendorEscalations, getVendorEscalationById, updateVendorEscalation, deleteVendorEscalation } from "../controllers/vendorEscalation.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createVendorEscalationSchema, updateVendorEscalationSchema } from "../validations/vendorEscalation.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllVendorEscalations).post(checkPermission("warranty", "create"), validate(createVendorEscalationSchema), createVendorEscalation);
router.route("/:id").get(getVendorEscalationById).put(checkPermission("warranty", "edit"), validate(updateVendorEscalationSchema), updateVendorEscalation).delete(checkPermission("warranty", "delete"), deleteVendorEscalation);

export default router;
