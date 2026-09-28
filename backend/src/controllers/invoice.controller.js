import mongoose from "mongoose";
import Invoice from "../models/invoice.model.js";
import Receipt from "../models/receipt.model.js";
import CreditNote from "../models/creditNote.model.js";
import Lead from "../models/lead.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { getCustomerScope, mergeOwnershipFilter, isDocOwnedByCustomer } from "../utils/ownershipScope.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
 
// When a customer invoice is fully paid, the linked project's "Payment
// Received" milestone auto-completes — same pattern as the other milestones.
// Invoices link to customers by customerId (not leadId), so the payment is
// propagated through every converted lead of that customer. Best-effort: a
// missing project must never break the invoice create/update response.
const syncPaymentMilestone = async (invoice) => {
    try {
        if (!invoice?.customerId || invoice.paymentStatus !== "Paid") return;
        const leads = await Lead.find({ customerId: invoice.customerId }).select("leadId").lean();
        for (const lead of leads) {
            if (!lead?.leadId) continue;
            await ProjectProgress.updateOne(
                { leadId: lead.leadId },
                { $set: { "milestones.paymentReceived": "Completed" } }
            );
        }
    } catch (error) {
        console.warn("Sync payment received milestone error:", error?.message);
    }
};

// Guarantee a unique invoice number server-side. The frontend suggests a
// number, but a stale list (or a concurrent save) can collide with an existing
// one — which used to surface as a duplicate-key 500.
const nextInvoiceNumber = async () => {
    // Compute the max suffix numerically (not via string sort, which breaks
    // at the 999 → 1000 boundary) and increment it.
    const docs = await Invoice.find({ invoiceNumber: /^INV-/ })
        .select("invoiceNumber")
        .lean();
    const maxSuffix = docs.reduce((max, d) => {
        const n = parseInt(String(d.invoiceNumber).split("-").pop(), 10) || 0;
        return Math.max(max, n);
    }, 0);
    return `INV-2026-${String(maxSuffix + 1).padStart(3, "0")}`;
};
 
export const createInvoice = async (req, res) => {
    try {
        const body = { ...req.body };
        // Replace a missing or already-taken number with a fresh server-side one.
        if (!body.invoiceNumber || await Invoice.exists({ invoiceNumber: body.invoiceNumber })) {
            body.invoiceNumber = await nextInvoiceNumber();
        }
        let invoice;
        try {
            invoice = await Invoice.create(body);
        } catch (err) {
            // Rare race: another request grabbed the same number — retry once
            // with a freshly generated one before surfacing an error.
            if (err.code === 11000) {
                body.invoiceNumber = await nextInvoiceNumber();
                invoice = await Invoice.create(body);
            } else {
                throw err;
            }
        }
        await syncPaymentMilestone(invoice);
        const initialChanges = Object.entries(invoice.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "finance", action: "created", recordId: invoice._id, recordLabel: invoice.invoiceNumber, summary: `Invoice ${invoice.invoiceNumber} created`, changes: initialChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Invoice created successfully",
            data: invoice
        });
    } catch (error) {
        console.error("Create Invoice Error:", error);
        if (error.code === 11000) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Invoice number '${error.keyValue?.invoiceNumber || ""}' already exists. Please try again.`
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
 
export const getAllInvoices = async (req, res) => {
    try {
        const {
            search,
            paymentStatus,
            invoiceDate,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;
 
        const filter = {};
 
        if (paymentStatus && paymentStatus !== "All") {
            filter.paymentStatus = paymentStatus;
        }
        if (invoiceDate) {
            const parsedDate = new Date(invoiceDate);
            // Only apply the filter when the date is valid — an invalid string
            // would throw a CastError and 500 the whole list.
            if (!isNaN(parsedDate.getTime())) {
                filter.invoiceDate = parsedDate;
            }
        }
        if (search) {
            // Escape regex metacharacters so a plain-text search term (e.g.
            // "(" or "[") never throws and 500s the whole list.
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { invoiceNumber: { $regex: escaped, $options: "i" } },
                { customerName: { $regex: escaped, $options: "i" } },
                { customerId: { $regex: escaped, $options: "i" } }
            ];
        }

        // Customers only ever see their OWN invoices — matched through the
        // linked Customer/Lead email (same email as their login account).
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                mergeOwnershipFilter(filter, [{ customerName: { $in: scope.names } }]);
            } else {
                mergeOwnershipFilter(filter, []);
            }
        }
 
        const sortableFields = ["createdAt", "invoiceNumber", "customerName", "invoiceDate", "dueDate", "totalAmount", "paymentStatus"];
        const sortObj = {};
        // Default to createdAt descending so the newest invoices appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await Invoice.countDocuments(filter);
        const invoices = await Invoice.find(filter)
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
        console.error("Get All Invoices Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getInvoiceById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid invoice id" });
        }
        const invoice = await Invoice.findById(req.params.id);
 
        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Invoice not found"
            });
        }

        // Customers may only view their own invoices.
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (!isDocOwnedByCustomer(invoice, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: "Access denied: this invoice does not belong to your account"
                });
            }
        }
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error("Get Invoice By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const updateInvoice = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid invoice id" });
        }
        const existingInvoice = await Invoice.findById(req.params.id);
        if (!existingInvoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Invoice not found" });
        }
        const updateChanges = computeChanges(existingInvoice, req.body);
        const invoice = await Invoice.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
 
        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Invoice not found"
            });
        }
        await syncPaymentMilestone(invoice);
        await logActivity({ req, module: "finance", action: "updated", recordId: invoice._id, recordLabel: invoice.invoiceNumber, summary: "Invoice updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Invoice updated successfully",
            data: invoice
        });
    } catch (error) {
        console.error("Update Invoice Error:", error);

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
 
export const deleteInvoice = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid invoice id" });
        }
        const invoice = await Invoice.findByIdAndDelete(req.params.id);
 
        if (!invoice) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Invoice not found"
            });
        }
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Invoice deleted successfully"
        });
    } catch (error) {
        console.error("Delete Invoice Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const getNextInvoiceNumber = async (req, res) => {
    try {
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                nextInvoiceNumber: await nextInvoiceNumber()
            }
        });
    } catch (error) {
        console.error("Get Next Invoice Number Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
 
export const getBillingStats = async (req, res) => {
    try {
        // Customers only ever see KPIs for their OWN invoices/receipts/notes.
        let invoiceFilter = {};
        let receiptFilter = {};
        let creditFilter = {};
        if (req.user?.role === "customer") {
            const scope = await getCustomerScope(req.user.email);
            if (scope && scope.names.length) {
                invoiceFilter.customerName = { $in: scope.names };
                const ownedInvoices = await Invoice.find(invoiceFilter).select("invoiceNumber").lean();
                const numbers = ownedInvoices.map((i) => i.invoiceNumber).filter(Boolean);
                const numFilter = numbers.length
                    ? { invoiceNumber: { $in: numbers } }
                    : { _id: { $exists: false } };
                receiptFilter = numFilter;
                creditFilter = numFilter;
            } else {
                invoiceFilter._id = { $exists: false };
                receiptFilter = { _id: { $exists: false } };
                creditFilter = { _id: { $exists: false } };
            }
        }

        const [invoices, paidAgg, creditedAgg] = await Promise.all([
            Invoice.find(invoiceFilter).select("invoiceNumber totalAmount paymentStatus dueDate").lean(),
            Receipt.aggregate([
                { $match: receiptFilter },
                { $group: { _id: "$invoiceNumber", paid: { $sum: { $ifNull: ["$paymentAmount", 0] } } } }
            ]),
            CreditNote.aggregate([
                { $match: creditFilter },
                { $group: { _id: "$invoiceNumber", credited: { $sum: { $ifNull: ["$creditAmount", 0] } } } }
            ])
        ]);
 
        const paidMap = Object.fromEntries(paidAgg.map((p) => [p._id, p.paid]));
        const creditMap = Object.fromEntries(creditedAgg.map((c) => [c._id, c.credited]));
 
        const now = new Date();
        let totalInvoiced = 0;
        let outstanding = 0;
        let overdueAmount = 0;
 
        invoices.forEach((inv) => {
            const total = Number(inv.totalAmount) || 0;
            totalInvoiced += total;
            const due = Math.max(0, total - (paidMap[inv.invoiceNumber] || 0) - (creditMap[inv.invoiceNumber] || 0));
            outstanding += due;
            if (due > 0 && inv.paymentStatus !== "Paid" && inv.dueDate && new Date(inv.dueDate) < now) {
                overdueAmount += due;
            }
        });
 
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                totalInvoiced,
                invoiceCount: invoices.length,
                outstanding,
                overdueAmount
            }
        });
    } catch (error) {
        console.error("Get Billing Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};