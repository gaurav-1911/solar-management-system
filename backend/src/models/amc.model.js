import mongoose from "mongoose";

const amcSchema = new mongoose.Schema(
    {
        amcId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        customer: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        customerId: {
            type: String,
            trim: true,
            default: ""
        },
        system: {
            type: String,
            required: [true, "System name is required"],
            trim: true
        },
        plan: {
            type: String,
            enum: ["Basic — 2 visits/yr", "Standard — 4 visits/yr", "Premium — 6 visits/yr", "Annual", "Premium", "Basic"],
            required: [true, "Plan is required"]
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"]
        },
        endDate: {
            type: Date,
            required: [true, "End date is required"]
        },
        amount: {
            type: Number,
            min: 0,
            default: 0
        },
        status: {
            type: String,
            enum: ["Active", "Expiring Soon", "Expired", "active", "expiring", "expired"],
            default: "Active"
        },
        lastService: {
            type: Date,
            default: null
        },
        nextService: {
            type: Date,
            default: null
        },
        visits: {
            type: Number,
            min: 0,
            default: 0
        },
        totalVisits: {
            type: Number,
            min: 0,
            default: 0
        },
        visitsUsed: {
            type: Number,
            min: 0,
            default: 0
        },
        history: [{
            action: { type: String },
            detail: { type: String },
            date: { type: Date, default: Date.now }
        }]
    },
    {
        timestamps: true
    }
);

const AMC = mongoose.model("AMC", amcSchema);

export default AMC;
