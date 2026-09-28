import express from "express";
import {
    getPublicQuotation,
    respondToQuotation
} from "../controllers/quotationPublic.controller.js";

const router = express.Router();

// Public endpoints — no auth middleware, accessed via email links
router.get("/:quotationId", getPublicQuotation);
router.post("/:quotationId/respond", respondToQuotation);

export default router;
