import mongoose from "mongoose";
import GstInvoice from "../models/gstInvoice.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

export const createGstInvoice = async (req, res) => {
    try {
        const invoice = await GstInvoice.create(req.body);
        const initialChanges = Object.entries(invoice.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "finance", action: "created", recordId: invoice._id, recordLabel: invoice.invoiceNumber, summary: `GST invoice ${invoice.invoiceNumber} created`, changes: initialChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "GST invoice generated successfully",
            data: invoice
        });
    } catch (error) {
        console.error("Create GST Invoice Error:", error);
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

export const getAllGstInvoices = async (req, res) => {
    try {
        const {
            search,
            gstPercentage,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (gstPercentage && gstPercentage !== "All") {
            filter.gstPercentage = gstPercentage;
        }
        if (search) {
            filter.$or = [
                { invoiceNumber: { $regex: search, $options: "i" } },
                { gstNumber: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } }
            ];
        }

        // Customers only ever see their OWN GST invoices.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customerName: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }

        const sortableFields = ["createdAt", "invoiceNumber", "customerName", "gstPercentage", "taxableAmount", "gstAmount"];
        const sortObj = {};
        // Default to createdAt descending so the newest invoices appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await GstInvoice.countDocuments(filter);
        const invoices = await GstInvoice.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum);

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: invoices,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error("Get All GST Invoices Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getGstInvoiceById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid GST invoice id" });
        }
        const invoice = await GstInvoice.findById(req.params.id);

        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "GST invoice not found"
            });
        }

        // Customers may only view their own GST invoices.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(invoice, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this GST invoice does not belong to your account"
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error("Get GST Invoice By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateGstInvoice = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid GST invoice id" });
        }
        const existingInvoice = await GstInvoice.findById(req.params.id);
        if (!existingInvoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "GST invoice not found" });
        }
        const updateChanges = computeChanges(existingInvoice, req.body);
        const invoice = await GstInvoice.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "GST invoice not found"
            });
        }

        await logActivity({ req, module: "finance", action: "updated", recordId: invoice._id, recordLabel: invoice.invoiceNumber, summary: "GST invoice updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "GST invoice updated successfully",
            data: invoice
        });
    } catch (error) {
        console.error("Update GST Invoice Error:", error);
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

export const deleteGstInvoice = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid GST invoice id" });
        }
        const invoice = await GstInvoice.findByIdAndDelete(req.params.id);

        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "GST invoice not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "GST invoice deleted successfully"
        });
    } catch (error) {
        console.error("Delete GST Invoice Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
