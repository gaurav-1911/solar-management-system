import mongoose from "mongoose";

const receiptSchema = new mongoose.Schema(
    {
        receiptNumber: {
            type: String,
            required: [true, "Receipt number is required"],
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
        paymentDate: {
            type: Date,
            required: [true, "Payment date is required"]
        },
        paymentAmount: {
            type: Number,
            required: [true, "Payment amount is required"],
            min: [0, "Payment amount cannot be negative"]
        },
        paymentMethod: {
            type: String,
            enum: ["Bank Transfer", "UPI", "Cheque", "Cash", "Card", "NEFT", "RTGS"],
            default: "Bank Transfer"
        }
    },
    {
        timestamps: true
    }
);

const Receipt = mongoose.model("Receipt", receiptSchema);

export default Receipt;
