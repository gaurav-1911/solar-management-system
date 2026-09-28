import express from "express";
import { createWarranty, getAllWarranties, getWarrantyById, updateWarranty, deleteWarranty } from "../controllers/warranty.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createWarrantySchema, updateWarrantySchema } from "../validations/warranty.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllWarranties).post(checkPermission("warranty", "create"), validate(createWarrantySchema), createWarranty);
router.route("/:id").get(getWarrantyById).put(checkPermission("warranty", "edit"), validate(updateWarrantySchema), updateWarranty).delete(checkPermission("warranty", "delete"), deleteWarranty);

export default router;
