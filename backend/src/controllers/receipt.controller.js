import mongoose from "mongoose";
import Receipt from "../models/receipt.model.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { recomputeInvoiceStatus } from "../utils/billingHelpers.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Guarantee a unique receipt number server-side (same stale/duplicate
// protection as invoices).
const nextReceiptNumber = async () => {
    // Compute the max suffix numerically (not via string sort, which breaks
    // at the 999 → 1000 boundary) and increment it.
    const docs = await Receipt.find({ receiptNumber: /^RCP-/ })
        .select("receiptNumber")
        .lean();
    const maxSuffix = docs.reduce((max, d) => {
        const n = parseInt(String(d.receiptNumber).split("-").pop(), 10) || 0;
        return Math.max(max, n);
    }, 0);
    return `RCP-2026-${String(maxSuffix + 1).padStart(3, "0")}`;
};

export const getNextReceiptNumber = async (req, res) => {
    try {
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                nextReceiptNumber: await nextReceiptNumber()
            }
        });
    } catch (error) {
        console.error("Get Next Receipt Number Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const createReceipt = async (req, res) => {
    try {
        const body = { ...req.body };
        // Replace a missing or already-taken number with a fresh server-side one.
        if (!body.receiptNumber || await Receipt.exists({ receiptNumber: body.receiptNumber })) {
            body.receiptNumber = await nextReceiptNumber();
        }
        // Over-payments are allowed (e.g. advance collection). The linked
        // invoice's outstanding is floored at 0 by recomputeInvoiceStatus,
        // so the invoice simply shows as "Paid".
        await recomputeInvoiceStatus(body.invoiceNumber).catch(() => null);

        let receipt;
        try {
            receipt = await Receipt.create(body);
        } catch (err) {
            if (err.code === 11000) {
                body.receiptNumber = await nextReceiptNumber();
                receipt = await Receipt.create(body);
            } else {
                throw err;
            }
        }

        // Reflect the payment in the linked invoice's payment status.
        await recomputeInvoiceStatus(body.invoiceNumber).catch(() => {});
        const initialChanges = Object.entries(receipt.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "finance", action: "created", recordId: receipt._id, recordLabel: receipt.receiptNumber, summary: `Receipt ${receipt.receiptNumber} created`, changes: initialChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Receipt created successfully",
            data: receipt
        });
    } catch (error) {
        console.error("Create Receipt Error:", error);
        if (error.code === 11000) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Receipt number '${error.keyValue?.receiptNumber || ""}' already exists. Please try again.`
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

export const getAllReceipts = async (req, res) => {
    try {
        const {
            search,
            paymentMethod,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (paymentMethod && paymentMethod !== "All") {
            filter.paymentMethod = paymentMethod;
        }
        if (search) {
            filter.$or = [
                { receiptNumber: { $regex: search, $options: "i" } },
                { invoiceNumber: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } }
            ];
        }
        // Customers see only their own billing receipts.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customerName: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }

        const sortableFields = ["createdAt", "receiptNumber", "invoiceNumber", "customerName", "paymentDate", "paymentAmount", "paymentMethod"];
        const sortObj = {};
        // Default to createdAt descending so the newest receipts appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await Receipt.countDocuments(filter);
        const receipts = await Receipt.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: receipts,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All Receipts Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getReceiptById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid receipt id" });
        }
        const receipt = await Receipt.findById(req.params.id);

        if (!receipt) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Receipt not found"
            });
        }

        // Customers may only view their own receipts.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(receipt, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this receipt does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: receipt
        });
    } catch (error) {
        console.error("Get Receipt By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateReceipt = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid receipt id" });
        }
        const existing = await Receipt.findById(req.params.id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Receipt not found"
            });
        }

        const updateChanges = computeChanges(existing, req.body);

        const receipt = await Receipt.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        // Recompute the payment status of both the previous and the new
        // invoice (an edit can move the payment to another invoice).
        await recomputeInvoiceStatus(existing.invoiceNumber).catch(() => {});
        if (receipt?.invoiceNumber && receipt.invoiceNumber !== existing.invoiceNumber) {
            await recomputeInvoiceStatus(receipt.invoiceNumber).catch(() => {});
        }

        await logActivity({ req, module: "finance", action: "updated", recordId: receipt._id, recordLabel: receipt.receiptNumber, summary: "Receipt updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Receipt updated successfully",
            data: receipt
        });
    } catch (error) {
        console.error("Update Receipt Error:", error);
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

export const deleteReceipt = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid receipt id" });
        }
        const receipt = await Receipt.findByIdAndDelete(req.params.id);

        if (!receipt) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Receipt not found"
            });
        }

        // Removing the payment restores part of the invoice's outstanding.
        await recomputeInvoiceStatus(receipt.invoiceNumber).catch(() => {});

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Receipt deleted successfully"
        });
    } catch (error) {
        console.error("Delete Receipt Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

