import mongoose from "mongoose";

const taskAssignmentSchema = new mongoose.Schema(
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
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        leadId: {
            type: String,
            required: [true, "Lead ID is required"],
            trim: true
        },
        installationId: {
            type: String,
            required: [true, "Installation ID is required"],
            trim: true
        },
        jobTitle: {
            type: String,
            required: [true, "Job title is required"],
            trim: true
        },
        jobDescription: {
            type: String,
            trim: true,
            default: ""
        },
        assignedDate: {
            type: Date,
            required: [true, "Assigned date is required"]
        },
        dueDate: {
            type: Date,
            default: null
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium"
        },
        status: {
            type: String,
            enum: ["Pending", "In Progress", "Completed"],
            default: "Pending"
        },
        // When a job is auto-created from the Task Tracking module, this holds
        // the originating technician task's _id so each task maps to exactly one
        // job and updates/deletes stay in sync.
        sourceTaskId: {
            type: String,
            trim: true,
            default: null
        }
    },
    {
        timestamps: true
    }
);

taskAssignmentSchema.index({ technicianId: 1 });
taskAssignmentSchema.index({ leadId: 1 });
taskAssignmentSchema.index({ installationId: 1 });
taskAssignmentSchema.index({ status: 1 });
taskAssignmentSchema.index({ createdAt: -1 });

const TaskAssignment = mongoose.model("TaskAssignment", taskAssignmentSchema);

export default TaskAssignment;
