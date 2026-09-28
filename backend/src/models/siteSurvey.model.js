import mongoose from "mongoose";

const siteSurveySchema = new mongoose.Schema(
    {
        surveyId: {
            type: String,
            unique: true,
            trim: true
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        projectName: {
            type: String,
            default: "",
            trim: true
        },
        projectType: {
            type: String,
            enum: ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"],
            default: "Residential"
        },
        leadId: {
            type: String,
            default: "",
            trim: true
        },
        customerId: {
            type: String,
            default: "",
            trim: true,
            // Set when the survey is created for a customer (CUS-XXXX) without a lead
            index: true
        },
        technicianId: {
            type: String,
            required: [true, "Technician is required"],
            trim: true
        },
        technicianName: {
            type: String,
            default: "",
            trim: true
        },
        visitDate: {
            type: Date,
            required: [true, "Visit date is required"]
        },
        visitTime: {
            type: String,
            required: [true, "Visit time is required"]
        },
        visitStatus: {
            type: String,
            enum: ["Scheduled", "Completed", "Cancelled"],
            default: "Scheduled"
        },
        notes: {
            type: String,
            default: ""
        },
        roofType: {
            type: String,
            required: [true, "Roof type is required"]
        },
        customRoofType: {
            type: String,
            default: ""
        },
        roofLength: {
            type: Number,
            required: [true, "Roof length is required"],
            min: [1, "Roof length must be greater than 0"],
            max: [1000, "Roof length cannot exceed 1000 meters"]
        },
        roofWidth: {
            type: Number,
            required: [true, "Roof width is required"],
            min: [1, "Roof width must be greater than 0"],
            max: [1000, "Roof width cannot exceed 1000 meters"]
        },
        roofArea: {
            type: Number,
            default: 0,
            max: [1000000, "Roof area cannot exceed 1,000,000 sq meters"]
        },
        roofAngle: {
            type: Number,
            required: [true, "Roof angle is required"],
            min: [0, "Angle must be between 0 and 90"],
            max: [90, "Angle must be between 0 and 90"]
        },
        shadowAnalysis: {
            type: String,
            enum: ["No Shadow", "Partial Shadow", "Heavy Shadow"],
            required: [true, "Shadow analysis is required"]
        },
        shadowNotes: {
            type: String,
            default: ""
        },
        monthlyUnits: {
            type: Number,
            required: [true, "Monthly electricity units are required"],
            min: [0, "Monthly units cannot be negative"],
            max: [1000000, "Monthly electricity units cannot exceed 1,000,000"],
            default: 0
        },
        latitude: {
            type: String,
            required: [true, "Latitude is required"]
        },
        longitude: {
            type: String,
            required: [true, "Longitude is required"]
        },
        electricityBill: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        sitePhotos: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        surveyNotes: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

siteSurveySchema.index({ leadId: 1 }, { unique: true });
siteSurveySchema.index({ technicianId: 1 });
siteSurveySchema.index({ createdAt: -1 });
siteSurveySchema.index({ visitStatus: 1, visitDate: -1 });

const SiteSurvey = mongoose.model("SiteSurvey", siteSurveySchema);

export default SiteSurvey;
