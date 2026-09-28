import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
    {
        leadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Lead",
            required: [true, "Lead ID is required"]
        },
        type: {
            type: String,
            required: [true, "Activity type is required"],
            enum: ["created", "status", "converted", "note"],
            default: "note"
        },
        message: {
            type: String,
            required: [true, "Activity message is required"],
            trim: true
        },
        user: {
            type: String,
            default: "System",
            trim: true
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient querying by lead
activitySchema.index({ leadId: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
