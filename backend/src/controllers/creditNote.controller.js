import mongoose from "mongoose";
import CreditNote from "../models/creditNote.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { recomputeInvoiceStatus } from "../utils/billingHelpers.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
 
// Guarantee a unique credit-note number server-side (same stale/duplicate
// protection as invoices).
const nextCreditNoteNumber = async () => {
    // Compute the max suffix numerically (not via string sort, which breaks
    // at the 999 → 1000 boundary) and increment it.
    const docs = await CreditNote.find({ creditNoteNumber: /^CN-/ })
        .select("creditNoteNumber")
        .lean();
    const maxSuffix = docs.reduce((max, d) => {
        const n = parseInt(String(d.creditNoteNumber).split("-").pop(), 10) || 0;
        return Math.max(max, n);
    }, 0);
    return `CN-2026-${String(maxSuffix + 1).padStart(3, "0")}`;
};
 
export const getNextCreditNoteNumber = async (req, res) => {
    try {
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                nextCreditNoteNumber: await nextCreditNoteNumber()
            }
        });
    } catch (error) {
        console.error("Get Next Credit Note Number Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const createCreditNote = async (req, res) => {
    try {
        const body = { ...req.body };
        // Replace a missing or already-taken number with a fresh server-side one.
        if (!body.creditNoteNumber || await CreditNote.exists({ creditNoteNumber: body.creditNoteNumber })) {
            body.creditNoteNumber = await nextCreditNoteNumber();
        }
        // A credit note cannot exceed what the customer still owes — reject
        // over-crediting even when the amount is submitted via the API directly.
        const balance = await recomputeInvoiceStatus(body.invoiceNumber).catch(() => null);
        if (balance && Number(body.creditAmount) > balance.outstanding) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Credit amount exceeds the invoice's outstanding balance (${balance.outstanding}).`
            });
        }
 
        let note;
        try {
            note = await CreditNote.create(body);
        } catch (err) {
            if (err.code === 11000) {
                body.creditNoteNumber = await nextCreditNoteNumber();
                note = await CreditNote.create(body);
            } else {
                throw err;
            }
        }
 
        // Reflect the credit in the linked invoice's payment status.
        await recomputeInvoiceStatus(body.invoiceNumber).catch(() => {});
        const initialChanges = Object.entries(note.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "finance", action: "created", recordId: note._id, recordLabel: note.creditNoteNumber, summary: `Credit note ${note.creditNoteNumber} created`, changes: initialChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Credit note created successfully",
            data: note
        });
    } catch (error) {
        console.error("Create Credit Note Error:", error);
        if (error.code === 11000) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Credit note number '${error.keyValue?.creditNoteNumber || ""}' already exists. Please try again.`
            });
        }
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const getAllCreditNotes = async (req, res) => {
    try {
        const {
            search,
            invoiceNumber,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;
 
        const filter = {};
 
        if (invoiceNumber && invoiceNumber !== "All") {
            filter.invoiceNumber = invoiceNumber;
        }
        if (search) {
            filter.$or = [
                { creditNoteNumber: { $regex: search, $options: "i" } },
                { invoiceNumber: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } }
            ];
        }

        // Customers only ever see their OWN credit notes.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customerName: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }
 
        const sortableFields = ["createdAt", "creditNoteNumber", "invoiceNumber", "customerName", "date", "creditAmount"];
        const sortObj = {};
        // Default to createdAt descending so the newest credit notes appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await CreditNote.countDocuments(filter);
        const notes = await CreditNote.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum);
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: notes,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Credit Notes Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

// export const getNextCreditNoteNumber = async (req, res) => {
//     try {
//         const creditNoteNumber = await nextCreditNoteNumber();
//         return res.status(HTTP_STATUS.OK).json({
//             success: true,
//             data: { creditNoteNumber }
//         });
//     } catch (error) {
//         console.error("Get Next Credit Note Number Error:", error);
//         return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
//             success: false,
//             message: MESSAGE.INTERNAL_SERVER_ERROR
//         });
//     }
// };

export const getCreditNoteById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid credit note id" });
        }
        const note = await CreditNote.findById(req.params.id);
 
        if (!note) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Credit note not found"
            });
        }

        // Customers may only view their own credit notes.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(note, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this credit note does not belong to your account"
                });
            }
        }
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: note
        });
    } catch (error) {
        console.error("Get Credit Note By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const updateCreditNote = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid credit note id" });
        }
        const existing = await CreditNote.findById(req.params.id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Credit note not found"
            });
        }

        const updateChanges = computeChanges(existing, req.body);

        const note = await CreditNote.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
 
        // Recompute the payment status of both the previous and the new
        // invoice (an edit can move the credit to another invoice).
        await recomputeInvoiceStatus(existing.invoiceNumber).catch(() => {});
        if (note?.invoiceNumber && note.invoiceNumber !== existing.invoiceNumber) {
            await recomputeInvoiceStatus(note.invoiceNumber).catch(() => {});
        }

        await logActivity({ req, module: "finance", action: "updated", recordId: note._id, recordLabel: note.creditNoteNumber, summary: "Credit note updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Credit note updated successfully",
            data: note
        });
    } catch (error) {
        console.error("Update Credit Note Error:", error);
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: messages.join(". ")
            });
        }
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const deleteCreditNote = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid credit note id" });
        }
        const note = await CreditNote.findByIdAndDelete(req.params.id);
 
        if (!note) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Credit note not found"
            });
        }
 
        // Removing the credit restores part of the invoice's outstanding.
        await recomputeInvoiceStatus(note.invoiceNumber).catch(() => {});
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Credit note deleted successfully"
        });
    } catch (error) {
        console.error("Delete Credit Note Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};