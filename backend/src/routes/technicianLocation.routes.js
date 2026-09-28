import express from "express";
import {
    createTechnicianLocation,
    getAllTechnicianLocations,
    getTechnicianLocationById,
    updateTechnicianLocation,
    deleteTechnicianLocation
} from "../controllers/technicianLocation.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createTechnicianLocationSchema,
    updateTechnicianLocationSchema
} from "../validations/technicianLocation.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllTechnicianLocations)
    .post(checkPermission("technicians", "create"), validate(createTechnicianLocationSchema), createTechnicianLocation);

router
    .route("/:id")
    .get(getTechnicianLocationById)
    .put(checkPermission("technicians", "edit"), validate(updateTechnicianLocationSchema), updateTechnicianLocation)
    .delete(checkPermission("technicians", "delete"), deleteTechnicianLocation);

export default router;
