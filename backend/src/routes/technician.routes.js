import express from "express";
import {
    createTechnician,
    getAllTechnicians,
    getTechnicianById,
    updateTechnician,
    deleteTechnician
} from "../controllers/technician.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createTechnicianSchema,
    updateTechnicianSchema
} from "../validations/technician.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllTechnicians)
    .post(checkPermission("technicians", "create"), validate(createTechnicianSchema), createTechnician);

router
    .route("/:id")
    .get(getTechnicianById)
    .put(checkPermission("technicians", "edit"), validate(updateTechnicianSchema), updateTechnician)
    .delete(checkPermission("technicians", "delete"), deleteTechnician);

export default router;
