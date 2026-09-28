import express from "express";
import { createAMC, getAllAMCs, getAMCById, updateAMC, deleteAMC, logAmcVisit } from "../controllers/amc.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createAmcSchema, updateAmcSchema } from "../validations/amc.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllAMCs).post(checkPermission("amc", "create"), validate(createAmcSchema), createAMC);
router.route("/:id").get(getAMCById).put(checkPermission("amc", "edit"), validate(updateAmcSchema), updateAMC).delete(checkPermission("amc", "delete"), deleteAMC);
router.post("/:id/visit", checkPermission("amc", "edit"), logAmcVisit);

export default router;
