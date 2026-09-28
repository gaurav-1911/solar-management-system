import mongoose from "mongoose";

const solarDesignSchema = new mongoose.Schema(
    {
        designId: {
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
        leadId: {
            type: String,
            required: [true, "Lead ID is required"],
            trim: true
        },
        monthlyConsumption: {
            type: Number,
            required: [true, "Monthly consumption is required"],
            min: [1, "Monthly consumption must be greater than 0"],
            max: [100000000, "Monthly consumption cannot exceed 10 crore units"]
        },
        roofLength: {
            type: Number,
            default: null,
            min: [1, "Roof length must be greater than 0"],
            max: [1000, "Roof length cannot exceed 1000 meters"]
        },
        roofWidth: {
            type: Number,
            default: null,
            min: [1, "Roof width must be greater than 0"],
            max: [1000, "Roof width cannot exceed 1000 meters"]
        },
        roofArea: {
            type: Number,
            default: 0,
            min: [0, "Roof area cannot be negative"],
            max: [1000000, "Roof area cannot exceed 1,000,000 sq meters"]
        },
        recommendedCapacity: {
            type: Number,
            default: 0,
            min: [0, "Recommended capacity cannot be negative"],
            max: [100000, "Recommended capacity cannot exceed 100,000 kW"]
        },
        panelCount: {
            type: Number,
            default: 0,
            min: [0, "Panel count cannot be negative"],
            max: [100000, "Panel count cannot exceed 100,000"]
        },
        monthlyProduction: {
            type: Number,
            default: 0,
            min: [0, "Monthly production cannot be negative"],
            max: [10000000, "Monthly production cannot exceed 1 crore kWh"]
        },
        annualProduction: {
            type: Number,
            default: 0,
            min: [0, "Annual production cannot be negative"],
            max: [100000000, "Annual production cannot exceed 10 crore kWh"]
        },
        monthlySavings: {
            type: Number,
            default: 0,
            min: [0, "Monthly savings cannot be negative"],
            max: [100000000, "Monthly savings cannot exceed 10 crore"]
        },
        annualSavings: {
            type: Number,
            default: 0,
            min: [0, "Annual savings cannot be negative"],
            max: [1000000000, "Annual savings cannot exceed 100 crore"]
        },
        estimatedSystemCost: {
            type: Number,
            default: null,
            min: [0, "Estimated cost cannot be negative"],
            max: [10000000000, "Estimated cost cannot exceed ₹1000 crore"]
        },
        // roi can legitimately be negative (savings less than cost over the
        // system's lifespan); the mathematical floor is -100%.
        roi: {
            type: Number,
            default: 0,
            min: [-100, "ROI cannot be less than -100%"],
            max: [100000, "ROI is out of range"]
        },
        paybackPeriod: {
            type: Number,
            default: 0,
            min: [0, "Payback period cannot be negative"],
            max: [100, "Payback period cannot exceed 100 years"]
        }
    },
    {
        timestamps: true
    }
);

solarDesignSchema.index({ leadId: 1 });
solarDesignSchema.index({ createdAt: -1 });

const SolarDesign = mongoose.model("SolarDesign", solarDesignSchema);

export default SolarDesign;
