import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
    {
        leadCreated: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        surveyCompleted: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        quotationApproved: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        paymentReceived: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        materialProcured: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        installationStarted: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        testingCompleted: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        commissioningCompleted: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        },
        handoverCompleted: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed"],
            default: "Not Started"
        }
    },
    { _id: false }
);

const resourceSchema = new mongoose.Schema(
    {
        name: { type: String, default: "", maxlength: [100, "Resource name cannot exceed 100 characters"] },
        role: { type: String, default: "", maxlength: [100, "Resource role cannot exceed 100 characters"] }
    },
    { _id: false }
);

const projectProgressSchema = new mongoose.Schema(
    {
        projectId: {
            type: String,
            unique: true,
            trim: true
        },
        projectName: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
            minlength: [2, "Project name must be at least 2 characters"],
            maxlength: [100, "Project name cannot exceed 100 characters"]
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
            minlength: [2, "Customer name must be at least 2 characters"],
            maxlength: [50, "Customer name cannot exceed 50 characters"]
        },
        leadId: {
            type: String,
            default: "",
            trim: true,
            index: true,
            maxlength: [50, "Lead ID cannot exceed 50 characters"]
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"]
        },
        expectedEndDate: {
            type: Date,
            default: null
        },
        milestones: {
            type: milestoneSchema,
            default: () => ({})
        },
        completionPercentage: {
            type: Number,
            default: 0,
            min: [0, "Completion must be between 0 and 100"],
            max: [100, "Completion must be between 0 and 100"]
        },
        delayStatus: {
            type: String,
            enum: ["No", "Yes"],
            default: "No"
        },
        delayReason: {
            type: String,
            default: "",
            maxlength: [500, "Delay reason cannot exceed 500 characters"]
        },
        resources: {
            type: [resourceSchema],
            default: []
        },
        actualProjectCost: {
            type: Number,
            default: 0,
            min: [0, "Project cost cannot be negative"],
            max: [10000000000, "Actual project cost cannot exceed ₹10,000,000,000"]
        },
        approvedBudget: {
            type: Number,
            default: 0,
            min: [0, "Budget cannot be negative"],
            max: [10000000000, "Approved budget cannot exceed ₹10,000,000,000"]
        },
        gstAmount: {
            type: Number,
            default: 0,
            min: [0, "GST amount cannot be negative"],
            max: [10000000000, "GST amount cannot exceed ₹10,000,000,000"]
        },
        riskLevel: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Low"
        },
        riskDescription: {
            type: String,
            default: "",
            maxlength: [500, "Risk description cannot exceed 500 characters"]
        },
        dependentActivity: {
            type: String,
            default: "",
            maxlength: [200, "Dependent activity cannot exceed 200 characters"]
        },
        dependencyStatus: {
            type: String,
            enum: ["Not Started", "In Progress", "Completed", "Delayed"],
            default: "Not Started"
        },
        healthScore: {
            type: String,
            enum: ["Excellent", "Good", "Average", "Poor"],
            default: "Good"
        },
        projectStatus: {
            type: String,
            enum: ["In Progress", "Delayed", "Blocked", "Completed"],
            default: "In Progress"
        }
    },
    {
        timestamps: true
    }
);

projectProgressSchema.index({ createdAt: -1 });
projectProgressSchema.index({ projectStatus: 1 });

const ProjectProgress = mongoose.model("ProjectProgress", projectProgressSchema);

export default ProjectProgress;
