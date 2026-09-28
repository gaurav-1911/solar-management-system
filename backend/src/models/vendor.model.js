import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Vendor name is required"],
            trim: true
        },
        category: {
            type: String,
            trim: true,
            default: ""
        },
        categories: {
            type: [String],
            default: []
        },
        country: {
            type: String,
            trim: true,
            default: ""
        },
        rating: {
            type: Number,
            min: [0, "Rating cannot be negative"],
            max: [5, "Rating cannot exceed 5"],
            default: 0
        },
        totalOrders: {
            type: Number,
            min: 0,
            default: 0
        },
        totalSpend: {
            type: Number,
            min: 0,
            default: 0
        },
        contactPerson: {
            type: String,
            trim: true,
            default: ""
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            match: [
                /^\S+@\S+\.\S+$/,
                "Please enter a valid email address"
            ],
            default: ""
        },
        contactPhone: {
            type: String,
            trim: true,
            default: ""
        },
        address: {
            type: String,
            trim: true,
            default: ""
        },
        paymentTerms: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active"
        },
        since: {
            type: Number,
            default: null
        },
        deliveryScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },
        qualityScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },
        responseTime: {
            type: Number,
            min: 0,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

const Vendor = mongoose.model("Vendor", vendorSchema);

export default Vendor;
