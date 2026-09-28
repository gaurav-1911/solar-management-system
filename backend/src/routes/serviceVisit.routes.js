import express from "express";
import { createServiceVisit, getAllServiceVisits, getServiceVisitById, updateServiceVisit, deleteServiceVisit } from "../controllers/serviceVisit.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createServiceVisitSchema, updateServiceVisitSchema } from "../validations/serviceVisit.validation.js";

const router = express.Router();
router.use(authMiddleware);

// Service visits are managed inside the Maintenance module
router.route("/").get(getAllServiceVisits).post(checkPermission("maintenance", "create"), validate(createServiceVisitSchema), createServiceVisit);
router.route("/:id").get(getServiceVisitById).put(checkPermission("maintenance", "edit"), validate(updateServiceVisitSchema), updateServiceVisit).delete(checkPermission("maintenance", "delete"), deleteServiceVisit);

export default router;
