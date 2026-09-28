import mongoose from "mongoose";

const vendorEscalationSchema = new mongoose.Schema(
    {
        escalationId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        claimId: {
            type: String,
            required: [true, "Claim ID is required"],
            trim: true
        },
        manufacturer: {
            type: String,
            trim: true,
            default: ""
        },
        escalated: {
            type: Date,
            default: Date.now
        },
        expectedResponse: {
            type: Date,
            default: null
        },
        status: {
            type: String,
            enum: ["awaiting-vendor", "vendor-responded", "closed"],
            default: "awaiting-vendor"
        },
        note: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const VendorEscalation = mongoose.model("VendorEscalation", vendorEscalationSchema);

export default VendorEscalation;
