import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: [true, "Invoice number is required"],
            trim: true,
            unique: true
        },
        invoiceDate: {
            type: Date,
            required: [true, "Invoice date is required"]
        },
        dueDate: {
            type: Date
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        customerId: {
            type: String,
            trim: true,
            default: ""
        },
        invoiceType: {
            type: String,
            enum: ["Installation", "Product", "Service", "Other"],
            default: "Other"
        },
        projectName: {
            type: String,
            trim: true,
            default: ""
        },
        invoiceAmount: {
            type: Number,
            required: [true, "Invoice amount is required"],
            min: [0, "Amount cannot be negative"]
        },
        taxAmount: {
            type: Number,
            min: 0,
            default: 0
        },
        totalAmount: {
            type: Number,
            required: [true, "Total amount is required"],
            min: [0, "Total amount cannot be negative"]
        },
        gstNumber: {
            type: String,
            trim: true,
            default: ""
        },
        gstPercentage: {
            type: Number,
            min: 0,
            default: 0
        },
        taxableAmount: {
            type: Number,
            min: 0,
            default: 0
        },
        gstAmount: {
            type: Number,
            min: 0,
            default: 0
        },
        paymentStatus: {
            type: String,
            enum: ["Pending", "Partially Paid", "Paid"],
            default: "Pending"
        },
        // Optional payment deadline — powers the Due Payments module
        dueDate: {
            type: Date,
            default: null
        },
        notes: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
