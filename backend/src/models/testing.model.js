import mongoose from "mongoose";

const stringTestSchema = new mongoose.Schema(
    {
        stringNumber: { type: String, default: "S1", maxlength: [50, "String number cannot exceed 50 characters"] },
        // Free string so the UI's "Other" custom values are always accepted.
        status: { type: String, default: "Pass", maxlength: [50, "Status cannot exceed 50 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const inverterTestSchema = new mongoose.Schema(
    {
        model: { type: String, required: [true, "Inverter model is required"], maxlength: [100, "Model cannot exceed 100 characters"] },
        // Free string so the UI's "Other" custom values are always accepted.
        status: { type: String, required: [true, "Inverter status is required"], maxlength: [50, "Status cannot exceed 50 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const earthingTestSchema = new mongoose.Schema(
    {
        // Free string so the UI's "Other" custom values are always accepted.
        result: { type: String, required: [true, "Earthing result is required"], maxlength: [50, "Result cannot exceed 50 characters"] },
        resistance: { type: String, required: [true, "Earthing resistance is required"], maxlength: [100, "Resistance cannot exceed 100 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const insulationTestSchema = new mongoose.Schema(
    {
        value: { type: String, required: [true, "Insulation resistance value is required"], maxlength: [100, "Value cannot exceed 100 characters"] },
        status: { type: String, enum: ["Pass", "Fail"], required: [true, "Insulation status is required"] }
    },
    { _id: false }
);

const voltageTestSchema = new mongoose.Schema(
    {
        value: { type: String, required: [true, "Voltage value is required"], maxlength: [100, "Value cannot exceed 100 characters"] },
        status: { type: String, enum: ["Pass", "Fail"], required: [true, "Voltage status is required"] }
    },
    { _id: false }
);

const currentTestSchema = new mongoose.Schema(
    {
        value: { type: String, required: [true, "Current value is required"], maxlength: [100, "Value cannot exceed 100 characters"] },
        status: { type: String, enum: ["Pass", "Fail"], required: [true, "Current status is required"] }
    },
    { _id: false }
);

const performanceSchema = new mongoose.Schema(
    {
        // Free string so the UI's "Other" custom values are always accepted.
        status: { type: String, required: [true, "Performance status is required"], maxlength: [50, "Status cannot exceed 50 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const safetySchema = new mongoose.Schema(
    {
        // Free string so the UI's "Other" custom values are always accepted.
        status: { type: String, required: [true, "Safety status is required"], maxlength: [50, "Status cannot exceed 50 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const finalInspectionSchema = new mongoose.Schema(
    {
        // Free string so the UI's "Other" custom values are always accepted.
        status: { type: String, required: [true, "Final inspection status is required"], maxlength: [50, "Status cannot exceed 50 characters"] },
        remarks: { type: String, default: "", maxlength: [500, "Remarks cannot exceed 500 characters"] }
    },
    { _id: false }
);

const paramsSchema = new mongoose.Schema(
    {
        voc: { type: String, default: "", maxlength: [100, "Voc cannot exceed 100 characters"] },
        isc: { type: String, default: "", maxlength: [100, "Isc cannot exceed 100 characters"] },
        acVoltage: { type: String, default: "", maxlength: [100, "AC voltage cannot exceed 100 characters"] },
        frequency: { type: String, default: "", maxlength: [100, "Frequency cannot exceed 100 characters"] },
        earthing: { type: String, default: "", maxlength: [100, "Earthing cannot exceed 100 characters"] },
        inverterEff: { type: String, default: "", maxlength: [100, "Inverter efficiency cannot exceed 100 characters"] },
        pr: { type: String, default: "", maxlength: [100, "PR cannot exceed 100 characters"] }
    },
    { _id: false }
);

const testingSchema = new mongoose.Schema(
    {
        testId: {
            type: String,
            unique: true,
            trim: true
        },
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
            minlength: [2, "Customer name must be at least 2 characters"],
            maxlength: [50, "Customer name cannot exceed 50 characters"]
        },
        projectName: {
            type: String,
            default: "",
            trim: true,
            maxlength: [100, "Project name cannot exceed 100 characters"]
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
        testDate: {
            type: Date,
            required: [true, "Test date is required"]
        },
        engineerName: {
            type: String,
            required: [true, "Engineer name is required"],
            maxlength: [50, "Engineer name cannot exceed 50 characters"]
        },
        status: {
            type: String,
            enum: ["Scheduled", "In Progress", "Completed", "Cancelled"],
            default: "Scheduled"
        },
        testResult: {
            type: String,
            enum: ["Pass", "Fail"],
            required: [true, "Test result is required"]
        },
        electricalTest: {
            type: String,
            enum: ["Pass", "Fail", "In Progress"],
            default: "Pass"
        },
        remarks: {
            type: String,
            default: "",
            maxlength: [500, "Remarks cannot exceed 500 characters"]
        },
        stringTest: {
            type: stringTestSchema,
            default: () => ({})
        },
        stringTests: {
            type: [stringTestSchema],
            default: () => []
        },
        inverterTest: {
            type: inverterTestSchema,
            default: () => ({})
        },
        earthingTest: {
            type: earthingTestSchema,
            default: () => ({})
        },
        insulationTest: {
            type: insulationTestSchema,
            default: () => ({})
        },
        voltageTest: {
            type: voltageTestSchema,
            default: () => ({})
        },
        currentTest: {
            type: currentTestSchema,
            default: () => ({})
        },
        performance: {
            type: performanceSchema,
            default: () => ({})
        },
        safety: {
            type: safetySchema,
            default: () => ({})
        },
        finalInspection: {
            type: finalInspectionSchema,
            default: () => ({})
        },
        params: {
            type: paramsSchema,
            default: () => ({})
        },
        // Dynamic tasks with daily progress logs — technicians add their
        // own testing tasks and track progress over multiple days.
        tasks: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Materials used during testing — pre-filled from the lead's quotation.
        materials: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        // Additional material requests during testing.
        materialRequests: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        docs: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        photos: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        isDraft: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

testingSchema.index({ isDraft: 1 });

const Testing = mongoose.model("Testing", testingSchema);

export default Testing;
