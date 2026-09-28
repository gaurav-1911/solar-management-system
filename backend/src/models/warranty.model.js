import mongoose from "mongoose";

const warrantySchema = new mongoose.Schema(
    {
        warrantyId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        component: {
            type: String,
            enum: [
                "Solar Panel", "Inverter", "Battery",
                "Mounting Structure", "Charge Controller"
            ],
            required: [true, "Component type is required"]
        },
        model: {
            type: String,
            required: [true, "Model is required"],
            trim: true
        },
        serial: {
            type: String,
            required: [true, "Serial number is required"],
            trim: true
        },
        customer: {
            type: String,
            required: [true, "Customer is required"],
            trim: true
        },
        site: {
            type: String,
            required: [true, "Site location is required"],
            trim: true
        },
        manufacturer: {
            type: String,
            required: [true, "Manufacturer is required"],
            trim: true
        },
        installed: {
            type: Date,
            required: [true, "Installation date is required"]
        },
        periodYears: {
            type: Number,
            required: [true, "Warranty period is required"],
            min: [1, "Period must be at least 1 year"]
        },
        expires: {
            type: Date,
            default: null
        },
        coverage: {
            type: String,
            enum: ["Product Only", "Product + Labor", "Performance + Product"],
            default: "Product Only"
        },
        status: {
            type: String,
            enum: ["active", "expiring", "expired"],
            default: "active"
        },
        certificate: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Warranty = mongoose.model("Warranty", warrantySchema);

export default Warranty;
