import mongoose from "mongoose";

const serviceVisitSchema = new mongoose.Schema(
    {
        visitId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        date: {
            type: Date,
            required: [true, "Visit date is required"]
        },
        customer: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        technician: {
            type: String,
            trim: true,
            default: ""
        },
        linkType: {
            type: String,
            enum: ["Ticket", "AMC"],
            default: "Ticket"
        },
        linkId: {
            type: String,
            trim: true,
            default: ""
        },
        status: {
            type: String,
            enum: ["upcoming", "completed", "missed"],
            default: "upcoming"
        },
        notes: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const ServiceVisit = mongoose.model("ServiceVisit", serviceVisitSchema);

export default ServiceVisit;
