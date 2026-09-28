import express from "express";
import {
    createCommissioning,
    getAllCommissioning,
    getCommissioningById,
    updateCommissioning,
    deleteCommissioning,
    getCommissioningStats
} from "../controllers/commissioningAndHandover.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import {
    createCommissioningSchema,
    updateCommissioningSchema
} from "../validations/commissioningAndHandover.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/")
    .get(getAllCommissioning)
    .post(checkPermission("commissioning", "create"), validate(createCommissioningSchema), createCommissioning);

router.get("/stats", getCommissioningStats);

router.route("/:id")
    .get(getCommissioningById)
    .put(checkPermission("commissioning", "edit"), validate(updateCommissioningSchema), updateCommissioning)
    .delete(checkPermission("commissioning", "delete"), deleteCommissioning);

export default router;
