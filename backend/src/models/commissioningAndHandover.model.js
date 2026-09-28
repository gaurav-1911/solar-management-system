import mongoose from "mongoose";

const commissioningAndHandoverSchema = new mongoose.Schema(
    {
        recordId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        leadId: {
            type: String,
            required: [true, "Lead ID is required"],
            trim: true,
            index: true,
            minlength: [2, "Lead ID must be at least 2 characters"],
            maxlength: [50, "Lead ID cannot exceed 50 characters"]
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
        commissioningDate: {
            type: Date,
            default: null
        },
        gridConnected: {
            type: String,
            enum: ["Pending", "In Progress", "Connected"],
            default: "Pending"
        },
        netMeterInstalled: {
            type: String,
            enum: ["Pending", "Installed"],
            default: "Pending"
        },
        discomApproval: {
            type: String,
            enum: ["Pending", "Approved", "Rejected"],
            default: "Pending"
        },
        handoverDate: {
            type: Date,
            default: null
        },
        customerSigned: {
            type: String,
            enum: ["Pending", "Signed"],
            default: "Pending"
        },
        documentsDelivered: {
            type: String,
            enum: ["Pending", "Delivered"],
            default: "Pending"
        },
        trainingProvided: {
            type: Boolean,
            default: false
        },
        warrantyRegistered: {
            type: Boolean,
            default: false
        },
        remarks: {
            type: String,
            default: "",
            maxlength: [500, "Remarks cannot exceed 500 characters"]
        }
    },
    {
        timestamps: true
    }
);

const CommissioningAndHandover = mongoose.model(
    "CommissioningAndHandover",
    commissioningAndHandoverSchema
);

export default CommissioningAndHandover;
