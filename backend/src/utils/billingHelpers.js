import Invoice from "../models/invoice.model.js";
import Receipt from "../models/receipt.model.js";
import CreditNote from "../models/creditNote.model.js";
import Lead from "../models/lead.model.js";
import ProjectProgress from "../models/projectProgress.model.js";

/**
 * When an invoice is fully paid, auto-complete the linked project's
 * "Payment Received" milestone. Best-effort — errors must never break
 * billing flows.
 */
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

/**
 * Recompute an invoice's payment status from the money actually received
 * (receipts) and adjusted (credit notes):
 *
 *     outstanding = totalAmount - paid - credited
 *
 *   - outstanding <= 0        -> "Paid"
 *   - anything paid/credited -> "Partially Paid"
 *   - otherwise              -> "Pending"
 *
 * Returns the computed breakdown, or null when the invoice does not exist.
 */
export const recomputeInvoiceStatus = async (invoiceNumber) => {
    if (!invoiceNumber) return null;

    const invoice = await Invoice.findOne({ invoiceNumber });
    if (!invoice) return null;

    const [receipts, creditNotes] = await Promise.all([
        Receipt.find({ invoiceNumber }).select("paymentAmount").lean(),
        CreditNote.find({ invoiceNumber }).select("creditAmount").lean(),
    ]);

    const paid = receipts.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
    const credited = creditNotes.reduce((sum, c) => sum + (Number(c.creditAmount) || 0), 0);
    const outstanding = Math.max(0, (Number(invoice.totalAmount) || 0) - paid - credited);

    const paymentStatus = outstanding <= 0
        ? "Paid"
        : (paid > 0 || credited > 0 ? "Partially Paid" : "Pending");

    if (invoice.paymentStatus !== paymentStatus) {
        invoice.paymentStatus = paymentStatus;
        await invoice.save();
        // When invoice becomes fully paid, auto-complete the payment milestone
        if (paymentStatus === "Paid") {
            await syncPaymentMilestone(invoice);
        }
    }

    return { outstanding, paid, credited, paymentStatus };
};
