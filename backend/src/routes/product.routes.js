import express from "express";
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    adjustProductStock,
    deleteProduct
} from "../controllers/product.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createProductSchema,
    updateProductSchema,
    adjustStockSchema
} from "../validations/product.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllProducts)
    .post(checkPermission("products", "create"), validate(createProductSchema), createProduct);

router
    .route("/:id")
    .get(getProductById)
    .put(checkPermission("products", "edit"), validate(updateProductSchema), updateProduct)
    .delete(checkPermission("products", "delete"), deleteProduct);

router
    .route("/:id/stock")
    .put(checkPermission("products", "edit"), validate(adjustStockSchema), adjustProductStock);

export default router;
