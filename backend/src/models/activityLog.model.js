import mongoose from "mongoose";

const changeSchema = new mongoose.Schema(
    {
        field: { type: String, required: true },
        oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
        newValue: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    { _id: false }
);

const activityLogSchema = new mongoose.Schema(
    {
        module: {
            type: String,
            required: [true, "Module name is required"],
            trim: true,
            index: true
        },
        action: {
            type: String,
            required: [true, "Action is required"],
            enum: ["created", "updated", "deleted", "status_change", "login", "logout", "password_reset", "exported"],
            index: true
        },
        recordId: {
            type: String,
            default: null,
            index: true
        },
        recordLabel: {
            type: String,
            default: "",
            trim: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        userName: {
            type: String,
            default: "System",
            trim: true
        },
        userRole: {
            type: String,
            default: "",
            trim: true
        },
        changes: {
            type: [changeSchema],
            default: []
        },
        summary: {
            type: String,
            required: [true, "Summary is required"],
            trim: true
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true
        },
        userAgent: {
            type: String,
            default: "",
            trim: true
        }
    },
    {
        timestamps: true
    }
);

// Compound indexes for the most common query patterns
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ recordId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
