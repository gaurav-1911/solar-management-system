import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        // Recipient — the user who should see this notification
        recipientId: {
            type: String,
            required: true,
            index: true,
        },
        recipientRole: {
            type: String,
            default: "",
        },

        // Notification content
        type: {
            type: String,
            enum: ["follow_up_response", "installation_assigned", "quotation_approved", "commissioning_completed", "general"],
            default: "general",
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },

        // Link — where the user should navigate when clicking the notification
        link: {
            type: String,
            default: "",
        },

        // Reference to the source record
        sourceModule: {
            type: String,
            default: "",
        },
        sourceId: {
            type: String,
            default: "",
        },

        // Read state
        read: {
            type: Boolean,
            default: false,
            index: true,
        },

        // Sender info (who triggered the notification)
        triggeredBy: {
            type: String,
            default: "System",
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient queries: find all unread notifications for a user
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
// TTL index: auto-delete notifications older than 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
