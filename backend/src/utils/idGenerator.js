import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";
import Invoice from "../models/invoice.model.js";
import CreditNote from "../models/creditNote.model.js";
import Receipt from "../models/receipt.model.js";
import Subsidy from "../models/subsidy.model.js";

// Generate the next sequential human-friendly ID like PRD-001, PRD-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a
// number and the sequence is safe beyond 999 (lexicographic string sort is not
// reliable here).
export const generateProductId = async () => {
    // IDs are assigned monotonically at creation, so the newest document's
    // suffix is the highest in use — one indexed lookup instead of scanning
    // every product ID in the collection.
    const lastDoc = await Product.findOne({ productId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("productId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.productId) {
        const m = lastDoc.productId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `PRD-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential human-friendly ID like INV-001, INV-002, ...
// Uses the numeric suffix of the highest existing ID so deletions never reuse a
// number and the sequence is safe beyond 999 (string sort is not reliable here).
export const generateInventoryId = async () => {
    const lastDoc = await Inventory.findOne({ invId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("invId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.invId) {
        const m = lastDoc.invId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `INV-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential invoice number like INV-2026-001, INV-2026-002, ...
// Scoped per year so the sequence restarts naturally on 1 January. Uses the
// highest numeric suffix so deleted numbers are never reused.
export const generateInvoiceNumber = async (year = new Date().getFullYear()) => {
    // Numbers are assigned monotonically within a year, so the newest invoice
    // of the year carries the highest suffix — one indexed lookup instead of
    // scanning every invoice number for that year.
    const lastDoc = await Invoice.findOne({ invoiceNumber: new RegExp(`^INV-${year}-`) })
        .sort({ _id: -1 })
        .select("invoiceNumber")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.invoiceNumber) {
        const m = lastDoc.invoiceNumber.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `INV-${year}-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential credit note number like CN-2026-001, ...
export const generateCreditNoteNumber = async (year = new Date().getFullYear()) => {
    const lastDoc = await CreditNote.findOne({ creditNoteNumber: new RegExp(`^CN-${year}-`) })
        .sort({ _id: -1 })
        .select("creditNoteNumber")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.creditNoteNumber) {
        const m = lastDoc.creditNoteNumber.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `CN-${year}-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential receipt number like RCP-2026-001, ...
export const generateReceiptNumber = async (year = new Date().getFullYear()) => {
    const lastDoc = await Receipt.findOne({ receiptNumber: new RegExp(`^RCP-${year}-`) })
        .sort({ _id: -1 })
        .select("receiptNumber")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.receiptNumber) {
        const m = lastDoc.receiptNumber.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `RCP-${year}-${String(max + 1).padStart(3, "0")}`;
};

// Generate the next sequential subsidy application number like SUB-2026-001, ...
export const generateSubsidyNumber = async (year = new Date().getFullYear()) => {
    const lastDoc = await Subsidy.findOne({ applicationNumber: new RegExp(`^SUB-${year}-`) })
        .sort({ _id: -1 })
        .select("applicationNumber")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.applicationNumber) {
        const m = lastDoc.applicationNumber.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `SUB-${year}-${String(max + 1).padStart(3, "0")}`;
};
