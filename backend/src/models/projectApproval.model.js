import mongoose from "mongoose";

const projectApprovalSchema = new mongoose.Schema(
    {
        approvalId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
            // Sequential human-friendly ID (PA-001, PA-002, ...) set at creation
        },
        designId: {
            type: String,
            default: "",
            trim: true
        },
        projectName: {
            type: String,
            required: [true, "Project name is required"],
            trim: true
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        customerId: {
            type: String,
            default: "",
            trim: true
        },
        quotationId: {
            type: String,
            default: "",
            trim: true
        },
        siteSurveyId: {
            type: String,
            default: "",
            trim: true
        },
        leadId: {
            type: String,
            default: "",
            trim: true
        },
        capacity: {
            type: Number,
            required: [true, "Capacity is required"],
            min: [0, "Capacity cannot be negative"],
            max: [100000, "Capacity cannot exceed 100,000 kW"]
        },
        estimatedCost: {
            type: Number,
            required: [true, "Estimated cost is required"],
            min: [0, "Estimated cost cannot be negative"],
            max: [10000000000, "Estimated cost cannot exceed ₹1000 crore"]
        },
        submittedDate: {
            type: Date,
            required: [true, "Submission date is required"]
        },
        status: {
            type: String,
            enum: ["Pending", "Under Review", "Approved", "Rejected"],
            default: "Pending"
        },
        reviewedBy: {
            type: String,
            default: "",
            maxlength: [50, "Reviewed by cannot exceed 50 characters"]
        },
        reviewedDate: {
            type: Date,
            default: null
        },
        comments: {
            type: String,
            default: "",
            maxlength: [500, "Comments cannot exceed 500 characters"]
        },
        sourceModule: {
            type: String,
            default: "quotation",
            trim: true
        },
        submittedBy: {
            type: String,
            default: "System",
            trim: true,
            maxlength: [50, "Submitted by cannot exceed 50 characters"]
        }
    },
    {
        timestamps: true
    }
);

const ProjectApproval = mongoose.model("ProjectApproval", projectApprovalSchema);

export default ProjectApproval;
