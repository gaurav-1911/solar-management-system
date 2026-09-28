import mongoose from "mongoose";

// A stock request is raised from the Installation module when a technician
// needs more of a product than the lead's quotation reserved. The request
// lands in the Quotation module (that lead's quotation) for approval. Once
// approved, the extra quantity is added to the lead's allowed quota AND the
// extra units are deducted from the Product Catalog stock immediately.
const stockRequestSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            index: { unique: true, sparse: true },
            trim: true
        },
        quotationId: {
            type: String,
            trim: true,
            index: true
        },
        leadId: {
            type: String,
            trim: true,
            index: true
        },
        productId: {
            type: String,
            trim: true
        },
        productName: {
            type: String,
            default: "",
            trim: true
        },
        category: {
            type: String,
            default: "",
            trim: true
        },
        brand: {
            type: String,
            default: "",
            trim: true
        },
        vendorName: {
            type: String,
            default: "",
            trim: true
        },
        // Allowed qty before this request (quotation item qty + approved extras).
        currentQuoted: {
            type: Number,
            default: 0,
            min: [0, "Current quoted qty cannot be negative"]
        },
        // Quantity already used across the lead's installations at request time.
        usedQty: {
            type: Number,
            default: 0,
            min: [0, "Used qty cannot be negative"]
        },
        // Extra quantity requested beyond the current allowance.
        requestedQty: {
            type: Number,
            default: 1,
            min: [1, "Requested quantity must be at least 1"]
        },
        reason: {
            type: String,
            default: "",
            trim: true
        },
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected"],
            default: "Pending"
        },
        requestedBy: {
            type: String,
            default: "",
            trim: true
        },
        approvedBy: {
            type: String,
            default: "",
            trim: true
        },
        resolvedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

const StockRequest = mongoose.model("StockRequest", stockRequestSchema);

export default StockRequest;
