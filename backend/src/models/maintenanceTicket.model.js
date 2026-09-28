import mongoose from "mongoose";

const historyEntrySchema = new mongoose.Schema(
    {
        action: { type: String, required: true },
        detail: { type: String, default: "" },
        date: { type: Date, default: Date.now }
    },
    { _id: false }
);

const maintenanceTicketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        type: {
            type: String,
            enum: ["Maintenance", "Service", "Complaint"],
            required: [true, "Ticket type is required"]
        },
        customer: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        phone: {
            type: String,
            trim: true,
            default: ""
        },
        system: {
            type: String,
            required: [true, "System name is required"],
            trim: true
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Urgent"],
            default: "Medium"
        },
        status: {
            type: String,
            enum: ["Open", "Scheduled", "In Progress", "Resolved", "Closed"],
            default: "Open"
        },
        assignedTech: {
            type: String,
            default: "Unassigned"
        },
        createdDate: {
            type: Date,
            default: Date.now
        },
        scheduledDate: {
            type: Date,
            default: null
        },
        resolvedDate: {
            type: Date,
            default: null
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        resolutionNotes: {
            type: String,
            trim: true,
            default: ""
        },
        history: [historyEntrySchema]
    },
    {
        timestamps: true
    }
);

const MaintenanceTicket = mongoose.model("MaintenanceTicket", maintenanceTicketSchema);

export default MaintenanceTicket;
