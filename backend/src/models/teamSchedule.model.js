import mongoose from "mongoose";

const teamScheduleSchema = new mongoose.Schema(
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
        date: {
            type: Date,
            required: [true, "Date is required"]
        },
        shift: {
            type: String,
            enum: ["Morning", "Afternoon", "Night", "Full Day"],
            default: "Morning"
        },
        shiftStart: {
            type: String,
            default: "08:00"
        },
        shiftEnd: {
            type: String,
            default: "16:00"
        },
        jobAssignment: {
            type: String,
            required: [true, "Job assignment is required"],
            trim: true
        },
        siteLocation: {
            type: String,
            required: [true, "Site location is required"],
            trim: true
        },
        status: {
            type: String,
            enum: ["Scheduled", "In Progress", "Completed", "Cancelled"],
            default: "Scheduled"
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

const TeamSchedule = mongoose.model("TeamSchedule", teamScheduleSchema);

export default TeamSchedule;
