import mongoose from "mongoose";

const technicianTaskSchema = new mongoose.Schema(
    {
        taskId: {
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
        taskName: {
            type: String,
            required: [true, "Task name is required"],
            trim: true
        },
        status: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        // When a job is auto-created from the Task Assignment module, this holds
        // the originating assignment's _id so each job maps to exactly one task
        // and updates/deletes stay in sync.
        sourceAssignmentId: {
            type: String,
            trim: true,
            default: null
        }
    },
    {
        timestamps: true
    }
);

technicianTaskSchema.index({ technicianId: 1 });
technicianTaskSchema.index({ status: 1 });
technicianTaskSchema.index({ createdAt: -1 });

const TechnicianTask = mongoose.model("TechnicianTask", technicianTaskSchema);

export default TechnicianTask;
