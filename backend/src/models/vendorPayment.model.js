import mongoose from "mongoose";

const PAYMENT_STATUSES = ["Paid", "Pending", "Overdue"];

const vendorPaymentSchema = new mongoose.Schema(
    {
        paymentId: {
            type: String,
            unique: true,
            trim: true,
            default: ""
        },
        poRef: {
            type: String,
            trim: true,
            default: ""
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            default: null
        },
        vendor: {
            type: String,
            required: [true, "Vendor name is required"],
            trim: true
        },
        leadId: {
            type: String,
            default: "",
            trim: true
        },
        customerName: {
            type: String,
            default: "",
            trim: true
        },
        projectName: {
            type: String,
            default: "",
            trim: true
        },
        amount: {
            type: Number,
            required: [true, "Payment amount is required"],
            min: [0, "Payment amount cannot be negative"]
        },
        dueDate: {
            type: String,
            trim: true,
            default: ""
        },
        paidDate: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: "Pending"
        }
    },
    {
        timestamps: true
    }
);

const VendorPayment = mongoose.model("VendorPayment", vendorPaymentSchema);

export default VendorPayment;
