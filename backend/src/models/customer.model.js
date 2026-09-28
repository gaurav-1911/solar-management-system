import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name must be at most 50 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true
        },
        type: {
            type: String,
            required: [true, "Customer type is required"],
            enum: ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"],
            default: "Residential"
        },
        address: {
            type: String,
            required: [true, "Address is required"],
            trim: true,
            minlength: [3, "Address must be at least 3 characters"]
        },
        capacity: {
            type: String,
            trim: true,
            default: "",
            // Same format the frontend enforces (e.g. "5 kW" or "5.5");
            // empty string is allowed since capacity is optional.
            match: [
                /^(?:\d+(\.\d+)?\s*(?:kW|kw|KW)?)?$/,
                "Enter valid solar capacity (e.g. 5kW or 5.5)"
            ]
        },
        status: {
            type: String,
            required: [true, "Status is required"],
            enum: ["Active", "Inactive"],
            default: "Active"
        },
        totalProjects: {
            type: Number,
            default: 0,
            min: [0, "Total projects cannot be negative"],
            max: [1000, "Total projects cannot exceed 1000"]
        },
        lastService: {
            type: String,
            default: "—",
            maxlength: [50, "Last service cannot exceed 50 characters"]
        },
        notes: {
            type: String,
            default: "",
            trim: true
        },
        joinDate: {
            type: Date,
            default: Date.now
        },
        leadId: {
            type: String,
            default: "",
            trim: true,
            // Set when created from a converted lead — links back to a Lead (L-XXX)
            index: true
        },
        customerId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
            // Sequential human-friendly ID (CUS-001, CUS-002, ...) set at creation
        },
        technicianId: {
            type: String,
            default: "",
            trim: true,
            // Assigned technician (TECH-XXX) — set when lead is converted
            index: true
        },
        technicianName: {
            type: String,
            default: "",
            trim: true
        },
        technicianEmail: {
            type: String,
            default: "",
            trim: true,
            lowercase: true
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

customerSchema.index({ createdAt: -1 });
customerSchema.index({ status: 1, type: 1, createdAt: -1 });
customerSchema.index({ technicianId: 1 });

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
