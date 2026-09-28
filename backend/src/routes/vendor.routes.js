import express from "express";
import {
    createVendor,
    getAllVendors,
    getVendorById,
    updateVendor,
    deleteVendor
} from "../controllers/vendor.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createVendorSchema,
    updateVendorSchema
} from "../validations/vendor.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllVendors)
    .post(checkPermission("vendors", "create"), validate(createVendorSchema), createVendor);

router
    .route("/:id")
    .get(getVendorById)
    .put(checkPermission("vendors", "edit"), validate(updateVendorSchema), updateVendor)
    .delete(checkPermission("vendors", "delete"), deleteVendor);

export default router;
