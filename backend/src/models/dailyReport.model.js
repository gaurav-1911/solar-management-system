import mongoose from "mongoose";

const dailyReportSchema = new mongoose.Schema(
    {
        reportId: {
            type: String,
            unique: true,
            trim: true
        },
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
        assignedJob: {
            type: String,
            default: "",
            trim: true
        },
        workSummary: {
            type: String,
            required: [true, "Work summary is required"],
            trim: true
        },
        hoursWorked: {
            type: Number,
            required: [true, "Hours worked is required"],
            min: [0, "Hours worked cannot be negative"],
            max: [12, "Hours worked cannot be more than 12"]
        }
    },
    {
        timestamps: true
    }
);

const DailyReport = mongoose.model("DailyReport", dailyReportSchema);

export default DailyReport;
