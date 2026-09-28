import mongoose from "mongoose";

const PO_STATUSES = ["Pending", "Approved", "Dispatched", "Delivered", "Cancelled"];

const purchaseOrderSchema = new mongoose.Schema(
    {
        purchaseOrderId: {
            type: String,
            unique: true,
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
        items: {
            type: String,
            required: [true, "Items description is required"],
            trim: true
        },
        total: {
            type: Number,
            required: [true, "Order total is required"],
            min: [0, "Order total cannot be negative"]
        },
        orderDate: {
            type: String,
            trim: true,
            default: ""
        },
        expectedDelivery: {
            type: String,
            trim: true,
            default: ""
        },
        actualDelivery: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: PO_STATUSES,
            default: "Pending"
        }
    },
    {
        timestamps: true
    }
);

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrder;
