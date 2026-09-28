import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
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
        checkIn: {
            type: String,
            default: ""
        },
        checkOut: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            enum: ["Present", "Absent", "Half Day", "Leave"],
            default: "Present"
        }
    },
    {
        timestamps: true
    }
);

// A technician can only mark attendance once per day
attendanceSchema.index({ technicianId: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
