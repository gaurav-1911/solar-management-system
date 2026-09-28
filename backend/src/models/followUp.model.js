import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
    {
        followUpId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true
        },
        leadId: {
            type: String,
            trim: true,
            default: "",
            index: true
        },
        customerId: {
            type: String,
            trim: true,
            default: "",
            index: true
        },
        quotationId: {
            type: String,
            trim: true,
            default: ""
        },
        installationId: {
            type: String,
            trim: true,
            default: ""
        },
        contactName: {
            type: String,
            required: [true, "Contact name is required"],
            trim: true
        },
        contactPhone: {
            type: String,
            trim: true,
            default: ""
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: ""
        },
        type: {
            type: String,
            enum: ["Call", "Email", "Site Visit", "WhatsApp", "Meeting", "Other"],
            default: "Call"
        },
        scheduledDate: {
            type: Date,
            required: [true, "Scheduled date is required"]
        },
        scheduledTime: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["Pending", "Completed", "Rescheduled", "Cancelled", "Missed"],
            default: "Pending"
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium"
        },
        assignedTo: {
            type: String,
            default: "Unassigned",
            trim: true,
            index: true
        },
        notes: {
            type: String,
            trim: true,
            maxLength: [1000, "Notes cannot exceed 1000 characters"],
            default: ""
        },
        outcome: {
            type: String,
            trim: true,
            maxLength: [1000, "Outcome cannot exceed 1000 characters"],
            default: ""
        },
        previousFollowUpId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FollowUp",
            default: null
        },
        nextFollowUpDate: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes
followUpSchema.index({ createdAt: -1 });
followUpSchema.index({ scheduledDate: 1, status: 1 });
followUpSchema.index({ assignedTo: 1 });
followUpSchema.index({ leadId: 1, scheduledDate: 1 });
followUpSchema.index({ customerId: 1, scheduledDate: 1 });

followUpSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

const FollowUp = mongoose.model("FollowUp", followUpSchema);

export default FollowUp;
