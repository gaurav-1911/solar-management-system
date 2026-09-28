import mongoose from "mongoose";

const gstInvoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: [true, "Invoice number is required"],
            trim: true
        },
        customerName: {
            type: String,
            trim: true,
            default: ""
        },
        gstNumber: {
            type: String,
            required: [true, "GST number is required"],
            trim: true
        },
        gstPercentage: {
            type: Number,
            required: [true, "GST percentage is required"],
            min: [0, "GST percentage cannot be negative"]
        },
        taxableAmount: {
            type: Number,
            required: [true, "Taxable amount is required"],
            min: [0, "Taxable amount cannot be negative"]
        },
        gstAmount: {
            type: Number,
            min: [0, "GST amount cannot be negative"],
            default: 0
        }
    },
    {
        timestamps: true
    }
);

const GstInvoice = mongoose.model("GstInvoice", gstInvoiceSchema);

export default GstInvoice;
