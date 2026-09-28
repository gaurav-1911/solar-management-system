import mongoose from "mongoose";

const warrantyClaimSchema = new mongoose.Schema(
    {
        claimId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        warrantyId: {
            type: String,
            required: [true, "Warranty ID is required"],
            trim: true
        },
        component: {
            type: String,
            trim: true,
            default: ""
        },
        serial: {
            type: String,
            trim: true,
            default: ""
        },
        customer: {
            type: String,
            trim: true,
            default: ""
        },
        issue: {
            type: String,
            required: [true, "Issue description is required"],
            trim: true
        },
        submitted: {
            type: Date,
            default: Date.now
        },
        stageIndex: {
            type: Number,
            min: 0,
            default: 0
        },
        priority: {
            type: String,
            enum: ["high", "medium", "low"],
            default: "medium"
        },
        resolution: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const WarrantyClaim = mongoose.model("WarrantyClaim", warrantyClaimSchema);

export default WarrantyClaim;
