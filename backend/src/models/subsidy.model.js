import mongoose from "mongoose";

const REQUIRED_DOCUMENTS = [
    "aadhaar", "pan", "electricityBill", "bankDetails",
    "propertyDocs", "installCert", "netMeterApproval"
];

const subsidyDocumentSchema = new mongoose.Schema(
    {
        documentType: {
            type: String,
            required: [true, "Document type is required"]
        },
        documentNumber: {
            type: String,
            trim: true,
            default: ""
        },
        issueDate: {
            type: String,
            default: ""
        },
        uploadedDate: {
            type: Date,
            default: Date.now
        },
        uploadedBy: {
            type: String,
            default: ""
        },
        verificationStatus: {
            type: String,
            enum: ["Pending", "Verified", "Rejected"],
            default: "Pending"
        },
        verifierRemarks: {
            type: String,
            trim: true,
            default: ""
        },
        fileName: {
            type: String,
            default: ""
        },
        storedName: {
            type: String,
            default: ""
        },
        fileSize: {
            type: Number,
            default: 0
        },
        fileType: {
            type: String,
            default: "other"
        },
        fileUrl: {
            type: String,
            default: ""
        },
    
        fileData: {
            type: Buffer,
            default: null
        },
      
        publicId: {
            type: String,
            default: ""
        },

        url: {
            type: String,
            default: ""
        },
        mimeType: {
            type: String,
            default: ""
        },
        originalName: {
            type: String,
            default: ""
        },
        hasFile: {
            type: Boolean,
            default: false
        }
    },
    { _id: false }
);

const subsidySchema = new mongoose.Schema(
    {
        applicationNumber: {
            type: String,
            required: [true, "Application number is required"],
            trim: true,
            unique: true
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true
        },
        customerId: {
            type: String,
            trim: true,
            default: ""
        },
        projectName: {
            type: String,
            trim: true,
            default: ""
        },
        schemeName: {
            type: String,
            enum: [
                "PM Surya Ghar Yojana",
                "State Government Subsidies",
                "Residential Subsidy Programs",
                "Commercial Incentive Programs"
            ],
            default: "PM Surya Ghar Yojana"
        },
        applicationDate: {
            type: Date,
            required: [true, "Application date is required"]
        },
        status: {
            type: String,
            enum: [
                "Draft", "Submitted", "Under Verification",
                "Approved", "Rejected", "Subsidy Released"
            ],
            default: "Draft"
        },
        notes: {
            type: String,
            trim: true,
            default: ""
        },
        customerType: {
            type: String,
            enum: ["Individual", "Business", "Government", "NGO"],
            default: "Individual"
        },
        projectType: {
            type: String,
            enum: ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"],
            default: "Residential"
        },
        eligibleCapacity: {
            type: Number,
            default: null
        },
        subsidyPercent: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },
        ratePerKw: {
            type: Number,
            min: 0,
            default: 1000
        },
        calculationMethod: {
            type: String,
            enum: ["percentage", "slab"],
            default: "percentage"
        },
        subsidyAmount: {
            type: Number,
            min: 0,
            default: 0
        },
        approvalStatus: {
            type: String,
            enum: ["Pending", "Approved", "Rejected"],
            default: "Pending"
        },
        approverName: {
            type: String,
            trim: true,
            default: ""
        },
        approvalDate: {
            type: Date,
            default: null
        },
        approvalRemarks: {
            type: String,
            trim: true,
            default: ""
        },
        paymentStatus: {
            type: String,
            enum: ["Pending", "Processing", "Released", "Failed"],
            default: "Pending"
        },
        paymentDate: {
            type: Date,
            default: null
        },
        releasedAmount: {
            type: Number,
            min: 0,
            default: null
        },
        transactionRef: {
            type: String,
            trim: true,
            default: ""
        },
        documents: {
            type: [subsidyDocumentSchema],
            default: []
        },
        submissionDate: {
            type: Date,
            default: null
        },
        submittedBy: {
            type: String,
            trim: true,
            default: ""
        },
        currentStage: {
            type: String,
            default: "Application Created"
        }
    },
    {
        timestamps: true
    }
);

const Subsidy = mongoose.model("Subsidy", subsidySchema);

export default Subsidy;
