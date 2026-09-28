import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
    {
        author: { type: String, required: true },
        role: {
            type: String,
            enum: ["customer", "agent", "internal"],
            default: "customer"
        },
        text: { type: String, required: true },
        date: { type: Date, default: Date.now }
    },
    { _id: false }
);

const attachmentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        url: { type: String, default: "" },
        publicId: { type: String, default: "" },
        addedBy: { type: String, default: "" },
        date: { type: Date, default: Date.now }
    },
    { _id: false }
);

const historyEntrySchema = new mongoose.Schema(
    {
        action: { type: String, required: true },
        detail: { type: String, default: "" },
        date: { type: Date, default: Date.now }
    },
    { _id: false }
);

const ticketSupportSchema = new mongoose.Schema(
    {
        subject: {
            type: String,
            required: [true, "Subject is required"],
            trim: true
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true
        },
        customer: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
            default: ""
        },
        phone: {
            type: String,
            trim: true,
            default: ""
        },
        category: {
            type: String,
            enum: ["Technical", "Billing", "Installation", "Warranty", "General"],
            default: "Technical"
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Critical"],
            default: "Medium"
        },
        status: {
            type: String,
            enum: ["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"],
            default: "Open"
        },
        assignedAgent: {
            type: String,
            default: "Unassigned"
        },
        comments: [commentSchema],
        attachments: [attachmentSchema],
        history: [historyEntrySchema]
    },
    {
        timestamps: true
    }
);

ticketSupportSchema.index({ status: 1 });
ticketSupportSchema.index({ priority: 1 });
ticketSupportSchema.index({ email: 1 });
ticketSupportSchema.index({ createdAt: -1 });

const TicketSupport = mongoose.model("TicketSupport", ticketSupportSchema);

export default TicketSupport;
