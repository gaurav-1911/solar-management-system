import mongoose from "mongoose";

const technicianLocationSchema = new mongoose.Schema(
    {
        technicianName: {
            type: String,
            required: [true, "Technician name is required"],
            trim: true
        },
        technicianId: {
            type: String,
            required: [true, "Technician ID is required"],
            trim: true
        },
        latitude: {
            type: String,
            required: [true, "Latitude is required"],
            trim: true
        },
        longitude: {
            type: String,
            required: [true, "Longitude is required"],
            trim: true
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

const TechnicianLocation = mongoose.model("TechnicianLocation", technicianLocationSchema);

export default TechnicianLocation;
