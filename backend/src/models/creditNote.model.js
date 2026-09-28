import mongoose from "mongoose";

const creditNoteSchema = new mongoose.Schema(
    {
        creditNoteNumber: {
            type: String,
            required: [true, "Credit note number is required"],
            trim: true,
            unique: true
        },
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
        creditAmount: {
            type: Number,
            required: [true, "Credit amount is required"],
            min: [0, "Credit amount cannot be negative"]
        },
        reason: {
            type: String,
            required: [true, "Reason is required"],
            trim: true
        },
        date: {
            type: Date,
            required: [true, "Date is required"]
        }
    },
    {
        timestamps: true
    }
);

const CreditNote = mongoose.model("CreditNote", creditNoteSchema);

export default CreditNote;
