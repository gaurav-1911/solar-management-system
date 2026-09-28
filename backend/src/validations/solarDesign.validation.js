import Joi from "joi";

export const createSolarDesignSchema = Joi.object({
    customerName: Joi.string().trim().allow("").max(50),
    projectName: Joi.string().trim().max(100).allow("").default(""),
    leadId: Joi.string().trim().max(50).required(),
    monthlyConsumption: Joi.number().positive().max(100000000).required().messages({
        "number.max": "Monthly consumption cannot exceed 10 crore units"
    }),
    roofLength: Joi.number().positive().max(1000).allow(null).default(null).messages({
        "number.max": "Roof length cannot exceed 1000 meters"
    }),
    roofWidth: Joi.number().positive().max(1000).allow(null).default(null).messages({
        "number.max": "Roof width cannot exceed 1000 meters"
    }),
    roofArea: Joi.number().min(0).max(1000000).default(0).messages({
        "number.min": "Roof area cannot be negative",
        "number.max": "Roof area cannot exceed 1,000,000 sq meters"
    }),
    recommendedCapacity: Joi.number().min(0).max(100000).default(0),
    panelCount: Joi.number().min(0).max(100000).default(0),
    monthlyProduction: Joi.number().min(0).max(10000000).default(0),
    annualProduction: Joi.number().min(0).max(100000000).default(0),
    monthlySavings: Joi.number().min(0).max(100000000).default(0),
    annualSavings: Joi.number().min(0).max(1000000000).default(0),
    estimatedSystemCost: Joi.number().min(0).max(10000000000).allow(null).default(null).messages({
        "number.max": "Estimated system cost cannot exceed ₹1000 crore"
    }),
    // Annual ROI: percentage of investment earned back per year.
    // Can be negative (loss) but practically won't exceed 100% for solar.
    roi: Joi.number().min(-100).max(100).default(0).messages({
        "number.min": "ROI cannot be less than -100%",
        "number.max": "ROI cannot exceed 100%"
    }),
    paybackPeriod: Joi.number().min(0).max(100).default(0).messages({
        "number.max": "Payback period cannot exceed 100 years"
    })
});

export const updateSolarDesignSchema = Joi.object({
    customerName: Joi.string().trim().allow("").max(50),
    projectName: Joi.string().trim().max(100).allow(""),
    leadId: Joi.string().trim().max(50),
    monthlyConsumption: Joi.number().positive().max(100000000).messages({
        "number.max": "Monthly consumption cannot exceed 10 crore units"
    }),
    roofLength: Joi.number().positive().max(1000).allow(null).messages({
        "number.max": "Roof length cannot exceed 1000 meters"
    }),
    roofWidth: Joi.number().positive().max(1000).allow(null).messages({
        "number.max": "Roof width cannot exceed 1000 meters"
    }),
    roofArea: Joi.number().min(0).max(1000000).messages({
        "number.min": "Roof area cannot be negative",
        "number.max": "Roof area cannot exceed 1,000,000 sq meters"
    }),
    recommendedCapacity: Joi.number().min(0).max(100000),
    panelCount: Joi.number().min(0).max(100000),
    monthlyProduction: Joi.number().min(0).max(10000000),
    annualProduction: Joi.number().min(0).max(100000000),
    monthlySavings: Joi.number().min(0).max(100000000),
    annualSavings: Joi.number().min(0).max(1000000000),
    estimatedSystemCost: Joi.number().min(0).max(10000000000).allow(null).messages({
        "number.max": "Estimated system cost cannot exceed ₹1000 crore"
    }),
    // Annual ROI: percentage of investment earned back per year.
    roi: Joi.number().min(-100).max(100).messages({
        "number.min": "ROI cannot be less than -100%",
        "number.max": "ROI cannot exceed 100%"
    }),
    paybackPeriod: Joi.number().min(0).max(100).messages({
        "number.max": "Payback period cannot exceed 100 years"
    })
});
