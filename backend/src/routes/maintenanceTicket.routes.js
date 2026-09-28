import express from "express";
import { createMaintenanceTicket, getAllMaintenanceTickets, getMaintenanceTicketById, updateMaintenanceTicket, deleteMaintenanceTicket } from "../controllers/maintenanceTicket.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createMaintenanceTicketSchema, updateMaintenanceTicketSchema } from "../validations/maintenanceTicket.validation.js";

const router = express.Router();
router.use(authMiddleware);

router.route("/").get(getAllMaintenanceTickets).post(checkPermission("maintenance", "create"), validate(createMaintenanceTicketSchema), createMaintenanceTicket);
router.route("/:id").get(getMaintenanceTicketById).put(checkPermission("maintenance", "edit"), validate(updateMaintenanceTicketSchema), updateMaintenanceTicket).delete(checkPermission("maintenance", "delete"), deleteMaintenanceTicket);

export default router;
