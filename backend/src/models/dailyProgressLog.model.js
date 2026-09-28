import mongoose from "mongoose";

const dailyProgressLogSchema = new mongoose.Schema(
    {
        logId: {
            type: String,
            unique: true,
            trim: true
        },
        date: {
            type: Date,
            required: [true, "Date is required"]
        },
        project: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
            minlength: [2, "Project name must be at least 2 characters"],
            maxlength: [100, "Project name cannot exceed 100 characters"]
        },
        technician: {
            type: String,
            required: [true, "Technician name is required"],
            trim: true,
            minlength: [2, "Technician name must be at least 2 characters"],
            maxlength: [50, "Technician name cannot exceed 50 characters"]
        },
        workPerformed: {
            type: String,
            required: [true, "Work performed is required"],
            trim: true,
            minlength: [1, "Work performed is required"],
            maxlength: [1000, "Work performed cannot exceed 1000 characters"]
        },
        status: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed", "Delayed", "Blocked"],
            default: "Not Started"
        },
        completedTasks: {
            type: String,
            default: "",
            maxlength: [500, "Completed tasks cannot exceed 500 characters"]
        },
        pendingTasks: {
            type: String,
            default: "",
            maxlength: [500, "Pending tasks cannot exceed 500 characters"]
        },
        materials: {
            type: String,
            default: "",
            maxlength: [500, "Materials summary cannot exceed 500 characters"]
        },
        qty: {
            type: Number,
            default: null,
            min: [0, "Quantity cannot be negative"],
            max: [1000000, "Quantity cannot exceed 1,000,000"]
        },
        delayStatus: {
            type: String,
            enum: ["Yes", "No"],
            default: "No"
        },
        delayReason: {
            type: String,
            default: "",
            maxlength: [500, "Delay reason cannot exceed 500 characters"]
        },
        weather: {
            type: String,
            required: [true, "Weather is required"],
            enum: ["Sunny", "Cloudy", "Rainy", "Windy", "Partly Cloudy", "Other"]
        },
        weatherDesc: {
            type: String,
            default: "",
            maxlength: [500, "Weather description cannot exceed 500 characters"]
        },
        gpsLat: {
            type: String,
            default: "",
            maxlength: [20, "Latitude cannot exceed 20 characters"]
        },
        gpsLng: {
            type: String,
            default: "",
            maxlength: [20, "Longitude cannot exceed 20 characters"]
        },
        images: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        videos: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Structured material consumption: [{ name, qty }]. Each entry deducts
        // the matching Inventory item's stock when the log is saved. `materials`
        // and `qty` below keep a human-readable summary for display/download.
        materialUsage: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        nextDayPlan: {
            type: String,
            default: "",
            maxlength: [500, "Next day plan cannot exceed 500 characters"]
        },
        issuesFound: {
            type: String,
            default: "",
            maxlength: [500, "Issues found cannot exceed 500 characters"]
        },
        customerRemarks: {
            type: String,
            default: "",
            maxlength: [500, "Customer remarks cannot exceed 500 characters"]
        }
    },
    {
        timestamps: true
    }
);

dailyProgressLogSchema.index({ date: -1 });
dailyProgressLogSchema.index({ createdAt: -1 });

const DailyProgressLog = mongoose.model("DailyProgressLog", dailyProgressLogSchema);

export default DailyProgressLog;
