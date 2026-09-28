import Joi from "joi";
import { notPastDate } from "../utils/dateValidation.js";

const milestoneSchema = Joi.object({
    leadCreated: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    surveyCompleted: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    quotationApproved: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    paymentReceived: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    materialProcured: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    installationStarted: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    testingCompleted: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    commissioningCompleted: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started"),
    handoverCompleted: Joi.string().valid("Not Started", "In Progress", "Completed").default("Not Started")
});

const resourceSchema = Joi.object({
    name: Joi.string().allow("").max(100).default("").messages({
        "string.max": "Resource name cannot exceed 100 characters"
    }),
    role: Joi.string().allow("").max(100).default("").messages({
        "string.max": "Resource role cannot exceed 100 characters"
    })
});

// Expected end date must not be earlier than the start date when both are
// present in the same payload (mirrors the frontend's end-after-start rule).
const endAfterStart = (value, helpers) => {
    if (value === null) return value;
    const start = helpers.state.ancestors[0]?.startDate;
    if (start && new Date(value) < new Date(start)) return helpers.error("date.min");
    return value;
};

export const createProjectProgressSchema = Joi.object({
    projectName: Joi.string().trim().min(2).max(100).required(),
    customerName: Joi.string().trim().min(2).max(50).required(),
    leadId: Joi.string().allow("").trim().max(50).default(""),
    // Only create blocks past dates; the frontend already enforces this
    // (min = today) so the backend just matches it. Updates keep allowing
    // the existing (possibly past) start date.
    startDate: Joi.date().custom(notPastDate).required().messages({
        "date.base": "Please enter a valid start date",
        "date.min": "Start date cannot be in the past"
    }),
    expectedEndDate: Joi.date().allow(null).custom(notPastDate).custom(endAfterStart).default(null).messages({
        "date.base": "Please enter a valid expected end date",
        "date.min": "Expected end date cannot be earlier than the start date"
    }),
    milestones: milestoneSchema.default(),
    completionPercentage: Joi.number().min(0).max(100).default(0),
    delayStatus: Joi.string().valid("No", "Yes").default("No"),
    delayReason: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Delay reason cannot exceed 500 characters"
    }),
    resources: Joi.array().items(resourceSchema).max(100).default([]),
    actualProjectCost: Joi.number().min(0).max(10000000000).default(0).messages({
        "number.max": "Actual project cost cannot exceed ₹10,000,000,000"
    }),
    approvedBudget: Joi.number().min(0).max(10000000000).default(0).messages({
        "number.max": "Approved budget cannot exceed ₹10,000,000,000"
    }),
    gstAmount: Joi.number().min(0).max(10000000000).default(0).messages({
        "number.max": "GST amount cannot exceed ₹10,000,000,000"
    }),
    riskLevel: Joi.string().valid("Low", "Medium", "High").default("Low"),
    riskDescription: Joi.string().allow("").max(500).default("").messages({
        "string.max": "Risk description cannot exceed 500 characters"
    }),
    dependentActivity: Joi.string().allow("").max(200).default("").messages({
        "string.max": "Dependent activity cannot exceed 200 characters"
    }),
    // Values come from the frontend dropdown (Not Started / In Progress /
    // Completed / Delayed); everything else is junk.
    dependencyStatus: Joi.string().valid("Not Started", "In Progress", "Completed", "Delayed").default("Not Started"),
    healthScore: Joi.string().valid("Excellent", "Good", "Average", "Poor").default("Good"),
    // Computed client-side from healthScore + delayStatus, plus "Completed"
    // set by the commissioning auto-create — all covered by the enum.
    projectStatus: Joi.string().valid("In Progress", "Delayed", "Blocked", "Completed").default("In Progress")
});

export const updateProjectProgressSchema = Joi.object({
    // System-generated and unique — never client-settable.
    projectId: Joi.string().forbidden(),
    projectName: Joi.string().trim().min(2).max(100),
    customerName: Joi.string().trim().min(2).max(50),
    leadId: Joi.string().allow("").trim().max(50),
    // No past-date restriction on update: the existing (possibly past)
    // start date must stay editable.
    startDate: Joi.date().messages({
        "date.base": "Please enter a valid start date"
    }),
    expectedEndDate: Joi.date().allow(null).custom(endAfterStart).messages({
        "date.base": "Please enter a valid expected end date",
        "date.min": "Expected end date cannot be earlier than the start date"
    }),
    milestones: milestoneSchema,
    completionPercentage: Joi.number().min(0).max(100),
    delayStatus: Joi.string().valid("No", "Yes"),
    delayReason: Joi.string().allow("").max(500).messages({
        "string.max": "Delay reason cannot exceed 500 characters"
    }),
    resources: Joi.array().items(resourceSchema).max(100),
    actualProjectCost: Joi.number().min(0).max(10000000000).messages({
        "number.max": "Actual project cost cannot exceed ₹10,000,000,000"
    }),
    approvedBudget: Joi.number().min(0).max(10000000000).messages({
        "number.max": "Approved budget cannot exceed ₹10,000,000,000"
    }),
    gstAmount: Joi.number().min(0).max(10000000000).messages({
        "number.max": "GST amount cannot exceed ₹10,000,000,000"
    }),
    riskLevel: Joi.string().valid("Low", "Medium", "High"),
    riskDescription: Joi.string().allow("").max(500).messages({
        "string.max": "Risk description cannot exceed 500 characters"
    }),
    dependentActivity: Joi.string().allow("").max(200).messages({
        "string.max": "Dependent activity cannot exceed 200 characters"
    }),
    dependencyStatus: Joi.string().valid("Not Started", "In Progress", "Completed", "Delayed"),
    healthScore: Joi.string().valid("Excellent", "Good", "Average", "Poor"),
    projectStatus: Joi.string().valid("In Progress", "Delayed", "Blocked", "Completed")
});
