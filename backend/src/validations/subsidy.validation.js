import Joi from "joi";
import { notPastDate, notFutureDate } from "../utils/dateValidation.js";

const SCHEMES = [
    "PM Surya Ghar Yojana",
    "State Government Subsidies",
    "Residential Subsidy Programs",
    "Commercial Incentive Programs"
];

const SUBSIDY_STATUSES = [
    "Draft", "Submitted", "Under Verification",
    "Approved", "Rejected", "Subsidy Released"
];

const CUSTOMER_TYPES = ["Individual", "Business", "Government", "NGO"];
const PROJECT_TYPES = ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"];
const APPROVAL_STATUSES = ["Pending", "Approved", "Rejected"];
const PAYMENT_STATUSES = ["Pending", "Processing", "Released", "Failed"];

// Amounts are capped at ₹1000 crore — far beyond any realistic subsidy.
const MAX_AMOUNT = 10000000000;
// Matches the multer upload limit (25MB) enforced in the routes file.
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// The model documents only ~8 required document types per application.
const MAX_DOCUMENTS = 20;

const documentSchema = (update) => Joi.object({
    documentType: update
        ? Joi.string().trim().max(100)
        : Joi.string().trim().max(100).required(),
    documentNumber: Joi.string().trim().allow("").default("").max(100),
    issueDate: Joi.string().trim().allow("").default("").max(20),
    uploadedDate: update ? Joi.date() : Joi.date().default(Date.now),
    uploadedBy: Joi.string().trim().allow("").default("").max(50),
    verificationStatus: Joi.string()
        .valid("Pending", "Verified", "Rejected")
        .default("Pending"),
    verifierRemarks: Joi.string().trim().allow("").default("").max(500),
    fileName: Joi.string().trim().allow("").default("").max(200),
    storedName: Joi.string().trim().allow("").default("").max(200),
    fileSize: Joi.number().min(0).max(MAX_FILE_SIZE).default(0),
    fileType: Joi.string().trim().allow("").default("other").max(20),
    fileUrl: Joi.string().trim().allow("").default("").max(500)
});

export const createSubsidySchema = Joi.object({
    applicationNumber: Joi.string().trim().max(50).required()
        .messages({ "string.empty": "Application number is required" }),

    customerName: Joi.string().trim().min(2).max(100).required()
        .messages({ "string.empty": "Customer name is required" }),

    customerId: Joi.string().trim().allow("").default("").max(50),

    projectName: Joi.string().trim().allow("").default("").max(100),

    schemeName: Joi.string().valid(...SCHEMES).default("PM Surya Ghar Yojana"),

    // Past dates are already blocked at the UI level — this matches on create.
    // Update stays unrestricted so existing applications keep their dates.
    applicationDate: Joi.date().required()
        .custom(notPastDate, "not past date")
        .messages({
            "date.base": "Application date is required",
            "date.min": "Application date cannot be in the past"
        }),

    status: Joi.string().valid(...SUBSIDY_STATUSES).default("Draft"),

    notes: Joi.string().trim().allow("").default("").max(500),

    customerType: Joi.string().valid(...CUSTOMER_TYPES).default("Individual"),

    projectType: Joi.string().valid(...PROJECT_TYPES).default("Residential"),

    eligibleCapacity: Joi.number().min(0).max(1000).allow(null).default(null),

    subsidyPercent: Joi.number().min(0).max(100).allow(null).default(0),

    ratePerKw: Joi.number().min(0).max(1000000).allow(null).default(1000),

    calculationMethod: Joi.string().valid("percentage", "slab").default("percentage"),

    subsidyAmount: Joi.number().min(0).max(MAX_AMOUNT).default(0),

    approvalStatus: Joi.string().valid(...APPROVAL_STATUSES).default("Pending"),

    approverName: Joi.string().trim().allow("").default("").max(50),

    // An approval cannot happen in the future — past dates stay allowed.
    approvalDate: Joi.date().allow(null).default(null)
        .custom(notFutureDate, "not future date")
        .messages({ "date.max": "Approval date cannot be in the future" }),

    approvalRemarks: Joi.string().trim().allow("").default("").max(500),

    paymentStatus: Joi.string().valid(...PAYMENT_STATUSES).default("Pending"),

    paymentDate: Joi.date().allow(null).default(null),

    releasedAmount: Joi.number().min(0).allow(null).default(null),

    transactionRef: Joi.string().trim().allow("").default(""),

    documents: Joi.array().items(
        Joi.object({
            documentType: Joi.string().trim().required(),
            documentNumber: Joi.string().trim().allow("").default(""),
            issueDate: Joi.string().trim().allow("").default(""),
            uploadedDate: Joi.date().default(Date.now),
            uploadedBy: Joi.string().trim().allow("").default(""),
            verificationStatus: Joi.string()
                .valid("Pending", "Verified", "Rejected")
                .default("Pending"),
            verifierRemarks: Joi.string().trim().allow("").default(""),
            fileName: Joi.string().trim().allow("").default(""),
            storedName: Joi.string().trim().allow("").default(""),
            fileSize: Joi.number().min(0).default(0),
            fileType: Joi.string().trim().allow("").default("other"),
            fileUrl: Joi.string().trim().allow("").default(""),
           
            fileRef: Joi.string().trim().allow(""),
         
            mimeType: Joi.string().trim().allow(""),
            originalName: Joi.string().trim().allow(""),
            hasFile: Joi.boolean().default(false)
        })
    ).default([]),

    submissionDate: Joi.date().allow(null).default(null),

    submittedBy: Joi.string().trim().allow("").default("").max(50),

    currentStage: Joi.string().trim().allow("").default("Application Created").max(100)
});

export const updateSubsidySchema = Joi.object({
    // Sent by the form on both create and edit — allowed but unchanged.
    applicationNumber: Joi.string().trim().max(50),

    customerName: Joi.string().trim().max(100),

    customerId: Joi.string().trim().allow("").max(50),

    projectName: Joi.string().trim().allow("").max(100),

    schemeName: Joi.string().valid(...SCHEMES),

    applicationDate: Joi.date(),

    status: Joi.string().valid(...SUBSIDY_STATUSES),

    notes: Joi.string().trim().allow("").max(500),

    customerType: Joi.string().valid(...CUSTOMER_TYPES),

    projectType: Joi.string().valid(...PROJECT_TYPES),

    eligibleCapacity: Joi.number().min(0).max(1000).allow(null),

    subsidyPercent: Joi.number().min(0).max(100).allow(null),

    ratePerKw: Joi.number().min(0).max(1000000).allow(null),

    calculationMethod: Joi.string().valid("percentage", "slab"),

    subsidyAmount: Joi.number().min(0).max(MAX_AMOUNT),

    approvalStatus: Joi.string().valid(...APPROVAL_STATUSES),

    approverName: Joi.string().trim().allow("").max(50),

    approvalDate: Joi.date().allow(null),

    approvalRemarks: Joi.string().trim().allow("").max(500),

    paymentStatus: Joi.string().valid(...PAYMENT_STATUSES),

    paymentDate: Joi.date().allow(null),

    releasedAmount: Joi.number().min(0).allow(null),

    transactionRef: Joi.string().trim().allow(""),

    documents: Joi.array().items(
        Joi.object({
            documentType: Joi.string().trim(),
            documentNumber: Joi.string().trim().allow(""),
            issueDate: Joi.string().trim().allow(""),
            uploadedDate: Joi.date(),
            uploadedBy: Joi.string().trim().allow(""),
            verificationStatus: Joi.string()
                .valid("Pending", "Verified", "Rejected"),
            verifierRemarks: Joi.string().trim().allow(""),
            fileName: Joi.string().trim().allow(""),
            storedName: Joi.string().trim().allow(""),
            fileSize: Joi.number().min(0),
            fileType: Joi.string().trim().allow(""),
            fileUrl: Joi.string().trim().allow(""),
          
            fileRef: Joi.string().trim().allow(""),
       
            mimeType: Joi.string().trim().allow(""),
            originalName: Joi.string().trim().allow(""),
            hasFile: Joi.boolean()
        })
    ),

    submissionDate: Joi.date().allow(null),

    submittedBy: Joi.string().trim().allow("").max(50),

    currentStage: Joi.string().trim().allow("").max(100)
}).min(1);
