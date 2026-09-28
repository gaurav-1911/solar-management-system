import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
    {
        leadId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        name: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name must be at most 50 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
            match: [
                /^\S+@\S+\.\S+$/,
                "Please enter a valid email address"
            ]
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true,
            // Last-resort guard for non-API writes (seeders/scripts). Spaces,
            // dashes and parentheses are stripped first so stored formats like
            // "+91 98765 43210" still validate.
            validate: {
                validator: (v) =>
                    /^\+?[1-9]\d{9,14}$/.test(
                        String(v || "").replace(/[\s-()]/g, "")
                    ),
                message: "Please enter a valid phone number"
            }
        },
        source: {
            type: String,
            required: [true, "Source is required"],
            enum: [
                "Website",
                "Referral",
                "Social Media",
                "Cold Call",
                "Walk-in",
                "Email Campaign"
            ],
            default: "Website"
        },
        status: {
            type: String,
            required: [true, "Status is required"],
            enum: [
                "New",
                "Contacted",
                "Interested",
                "Converted",
                "Lost"
            ],
            default: "New"
        },
        value: {
            type: Number,
            required: [true, "Lead value is required"],
            // DB layer allows 0 because internal flows (e.g. a lead auto-created
            // from a manually added customer) legitimately have no value yet;
            // the API layer (Joi .positive()) still blocks 0 on direct creation.
            min: [0, "Lead value cannot be negative"],
            max: [100000000, "Lead value cannot exceed ₹10 crore"]
        },
        address: {
            type: String,
            required: [true, "Address is required"],
            trim: true,
            minlength: [3, "Address must be at least 3 characters"]
        },
        assigned: {
            type: String,
            default: "Unassigned",
            trim: true
        },
        capacity: {
            type: Number,
            default: 0,
            min: [0, "Capacity cannot be negative"],
            max: [50, "Maximum number is 50"]
        },
        notes: {
            type: String,
            default: "",
            trim: true
        },
        followUp: {
            type: Date,
            default: null
        },
        customerId: {
            type: String,
            default: "",
            trim: true,
            // Set when the lead is converted — links to a Customer (CUS-XXXX)
            index: true
        },
        statusReason: {
            type: String,
            default: "",
            trim: true
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ assigned: 1 });

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
