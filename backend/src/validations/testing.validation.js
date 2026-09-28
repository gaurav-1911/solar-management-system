import Joi from "joi";
import { notFutureDate } from "../utils/dateValidation.js";

const stringTestSchema = Joi.object({
    stringNumber: Joi.string().default("S1").max(50),
    // Free string so the UI's "Other" custom values are always accepted.
    status: Joi.string().default("Pass").max(50),
    remarks: Joi.string().allow("").default("").max(500)
});

const inverterTestSchema = Joi.object({
    model: Joi.string().allow("").default("").max(100),
    // Free string so the UI's "Other" custom values are always accepted.
    status: Joi.string().default("Pass").max(50),
    remarks: Joi.string().allow("").default("").max(500)
});

const earthingTestSchema = Joi.object({
    // Free string so the UI's "Other" custom values are always accepted.
    result: Joi.string().default("Pass").max(50),
    resistance: Joi.string().allow("").default("").max(100),
    remarks: Joi.string().allow("").default("").max(500)
});

const insulationTestSchema = Joi.object({
    value: Joi.string().allow("").default("").max(100),
    status: Joi.string().valid("Pass", "Fail").default("Pass")
});

const voltageTestSchema = Joi.object({
    value: Joi.string().allow("").default("").max(100),
    status: Joi.string().valid("Pass", "Fail").default("Pass")
});

const currentTestSchema = Joi.object({
    value: Joi.string().allow("").default("").max(100),
    status: Joi.string().valid("Pass", "Fail").default("Pass")
});

const performanceSchema = Joi.object({
    // Free string so the UI's "Other" custom values are always accepted.
    status: Joi.string().default("Verified").max(50),
    remarks: Joi.string().allow("").default("").max(500)
});

const safetySchema = Joi.object({
    // Free string so the UI's "Other" custom values are always accepted.
    status: Joi.string().default("Compliant").max(50),
    remarks: Joi.string().allow("").default("").max(500)
});

const finalInspectionSchema = Joi.object({
    // Free string so the UI's "Other" custom values are always accepted.
    status: Joi.string().default("Approved").max(50),
    remarks: Joi.string().allow("").default("").max(500)
});

const paramsSchema = Joi.object({
    voc: Joi.string().allow("").default("").max(100),
    isc: Joi.string().allow("").default("").max(100),
    acVoltage: Joi.string().allow("").default("").max(100),
    frequency: Joi.string().allow("").default("").max(100),
    earthing: Joi.string().allow("").default("").max(100),
    inverterEff: Joi.string().allow("").default("").max(100),
    pr: Joi.string().allow("").default("").max(100)
});

export const createTestingSchema = Joi.object({
    testId: Joi.string().forbidden(),
    isDraft: Joi.boolean().default(false),
    customerName: Joi.string().trim().min(2).max(50).when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.required() }),
    projectName: Joi.string().trim().allow("").max(100).default(""),
    leadId: Joi.string().trim().max(50).required(),
    installationId: Joi.string().trim().max(50).when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.required() }),
    // Only create blocks future dates; updates keep allowing the existing
    // date (which may be in the past for completed tests) and past dates
    // are always valid since testing happens after installation.
    testDate: Joi.date().when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.custom(notFutureDate).required() }).messages({
        "date.base": "Please enter a valid test date",
        "date.max": "Test date cannot be in the future"
    }),
    engineerName: Joi.string().trim().max(50).when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.required().messages({ "string.max": "Engineer name cannot exceed 50 characters" }) }),
    status: Joi.string().valid("Scheduled", "In Progress", "Completed", "Cancelled").default("Scheduled").when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.required() }),
    testResult: Joi.string().valid("Pass", "Fail").when("isDraft", { is: true, then: Joi.optional(), otherwise: Joi.required() }),
    electricalTest: Joi.string().valid("Pass", "Fail", "In Progress").default("Pass"),
    remarks: Joi.string().allow("").default("").max(500).messages({
        "string.max": "Remarks cannot exceed 500 characters"
    }),
    stringTest: stringTestSchema.default(),
    stringTests: Joi.array().items(stringTestSchema).max(50).default([]),
    inverterTest: inverterTestSchema.default(),
    earthingTest: earthingTestSchema.default(),
    insulationTest: insulationTestSchema.default(),
    voltageTest: voltageTestSchema.default(),
    currentTest: currentTestSchema.default(),
    performance: performanceSchema.default(),
    safety: safetySchema.default(),
    finalInspection: finalInspectionSchema.default(),
    params: paramsSchema.default(),
    tasks: Joi.array().items(
        Joi.object({
            name: Joi.string().trim().min(1).max(100).required(),
            status: Joi.string().valid("To Do", "In Progress", "Completed").default("To Do"),
            dailyLogs: Joi.array().items(
                Joi.object({
                    date: Joi.date().required(),
                    description: Joi.string().trim().max(500).required()
                })
            ).max(365).default([])
        })
    ).max(50).default([]),
    materials: Joi.array().items(Joi.alternatives().try(
        Joi.object({
            productId: Joi.string().allow("").max(50),
            productName: Joi.string().allow("").max(100),
            category: Joi.string().allow("").max(50),
            brand: Joi.string().allow("").max(100),
            vendorName: Joi.string().allow("").max(100),
            price: Joi.number().min(0).allow(null),
            stock: Joi.number().min(0).allow(null),
            quantity: Joi.number().min(0).max(10000),
            quotedQty: Joi.number().min(0).max(10000),
            status: Joi.string().valid("Available", "Not Available")
        }),
        Joi.string()
    )).max(200).default([]),
    materialRequests: Joi.array().items(
        Joi.object({
            productName: Joi.string().trim().min(1).max(100).required(),
            category: Joi.string().allow("").max(50).default(""),
            brand: Joi.string().allow("").max(100).default(""),
            quantity: Joi.number().min(1).max(10000).required(),
            reason: Joi.string().trim().max(500).allow("").default(""),
            status: Joi.string().valid("Pending", "Sent", "Approved", "Rejected").default("Pending")
        })
    ).max(50).default([]),
    docs: Joi.any().default([]),
    photos: Joi.any().default([]),
    docsKeep: Joi.any(),
    photosKeep: Joi.any()
});

export const updateTestingSchema = Joi.object({
    testId: Joi.string().forbidden(),
    isDraft: Joi.boolean(),
    customerName: Joi.string().trim().min(2).max(50),
    projectName: Joi.string().trim().allow("").max(100),
    leadId: Joi.string().trim().max(50),
    installationId: Joi.string().trim().max(50),
    // No future-date restriction on update: the existing (possibly future if
    // scheduled ahead) test date must stay editable without friction.
    testDate: Joi.date().messages({
        "date.base": "Please enter a valid test date"
    }),
    engineerName: Joi.string().trim().max(50).messages({
        "string.max": "Engineer name cannot exceed 50 characters"
    }),
    status: Joi.string().valid("Scheduled", "In Progress", "Completed", "Cancelled"),
    testResult: Joi.string().valid("Pass", "Fail"),
    electricalTest: Joi.string().valid("Pass", "Fail", "In Progress"),
    remarks: Joi.string().allow("").max(500).messages({
        "string.max": "Remarks cannot exceed 500 characters"
    }),
    stringTest: stringTestSchema,
    stringTests: Joi.array().items(stringTestSchema).max(50),
    inverterTest: inverterTestSchema,
    earthingTest: earthingTestSchema,
    insulationTest: insulationTestSchema,
    voltageTest: voltageTestSchema,
    currentTest: currentTestSchema,
    performance: performanceSchema,
    safety: safetySchema,
    finalInspection: finalInspectionSchema,
    params: paramsSchema,
    tasks: Joi.array().items(
        Joi.object({
            name: Joi.string().trim().min(1).max(100),
            status: Joi.string().valid("To Do", "In Progress", "Completed"),
            dailyLogs: Joi.array().items(
                Joi.object({
                    date: Joi.date(),
                    description: Joi.string().trim().max(500)
                })
            ).max(365)
        })
    ).max(50),
    materials: Joi.array().items(Joi.alternatives().try(
        Joi.object({
            productId: Joi.string().allow("").max(50),
            productName: Joi.string().allow("").max(100),
            category: Joi.string().allow("").max(50),
            brand: Joi.string().allow("").max(100),
            vendorName: Joi.string().allow("").max(100),
            price: Joi.number().min(0).allow(null),
            stock: Joi.number().min(0).allow(null),
            quantity: Joi.number().min(0).max(10000),
            quotedQty: Joi.number().min(0).max(10000),
            status: Joi.string().valid("Available", "Not Available")
        }),
        Joi.string()
    )).max(200),
    materialRequests: Joi.array().items(
        Joi.object({
            productName: Joi.string().trim().min(1).max(100),
            category: Joi.string().allow("").max(50),
            brand: Joi.string().allow("").max(100),
            quantity: Joi.number().min(1).max(10000),
            reason: Joi.string().trim().max(500).allow(""),
            status: Joi.string().valid("Pending", "Sent", "Approved", "Rejected")
        })
    ).max(50),
    docs: Joi.any(),
    photos: Joi.any(),
    docsKeep: Joi.any(),
    photosKeep: Joi.any()
});
