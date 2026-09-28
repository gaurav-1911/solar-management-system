import mongoose from "mongoose";

const technicianSchema = new mongoose.Schema(
    {
        technicianId: {
            type: String,
            unique: true,
            trim: true
        },
        name: {
            type: String,
            required: [true, "Technician name is required"],
            trim: true
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true
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
        skills: {
            type: [String],
            enum: [
                "Inverter Installation", "Panel Mounting", "Wiring & Cabling",
                "Battery Systems", "IoT & Monitoring", "Site Survey",
                "Maintenance", "Earthing & Safety"
            ],
            default: []
        },
        experience: {
            type: String,
            enum: ["0-1 Years", "1-3 Years", "3-5 Years", "5-10 Years", "10+ Years"],
            required: [true, "Experience is required"]
        },
        status: {
            type: String,
            enum: ["Available", "Busy", "On Leave", "Inactive"],
            default: "Available"
        },
        joinDate: {
            type: Date,
            required: [true, "Join date is required"]
        },
        photo: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

const Technician = mongoose.model("Technician", technicianSchema);

export default Technician;
