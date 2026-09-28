import express from "express";
import {
    createCreditNote,
    getAllCreditNotes,
    getCreditNoteById,
    updateCreditNote,
    deleteCreditNote,
    getNextCreditNoteNumber
} from "../controllers/creditNote.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";
import { checkPermission } from "../middlewares/rbac.middleware.js";
import validate from "../middlewares/validate.middleware.js";

import {
    createCreditNoteSchema,
    updateCreditNoteSchema
} from "../validations/creditNote.validation.js";

const router = express.Router();

router.use(authMiddleware);

router
    .route("/")
    .get(getAllCreditNotes)
    .post(checkPermission("billing", "create"), validate(createCreditNoteSchema), createCreditNote);

// Next sequential credit note number — MUST be registered before "/:id"
router.get("/next-number", getNextCreditNoteNumber);

router
    .route("/:id")
    .get(getCreditNoteById)
    .put(checkPermission("billing", "edit"), validate(updateCreditNoteSchema), updateCreditNote)
    .delete(checkPermission("billing", "delete"), deleteCreditNote);

export default router;
