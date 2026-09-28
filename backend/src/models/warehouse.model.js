import mongoose from "mongoose";

// Warehouse records power the dynamic "Location" dropdown on the Inventory page
// (inventory items store the warehouse NAME string, mirroring the old static
// "Warehouse A/B/C" values) and are managed via the dedicated Warehouses page.
const warehouseSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Warehouse name is required"],
            unique: true,
            trim: true
        },
        code: {
            type: String,
            default: "",
            trim: true
        },
        address: {
            type: String,
            default: "",
            trim: true
        },
        city: {
            type: String,
            default: "",
            trim: true
        },
        contactPerson: {
            type: String,
            default: "",
            trim: true
        },
        contactPhone: {
            type: String,
            default: "",
            trim: true
        },
        capacity: {
            type: Number,
            default: 0,
            min: [0, "Capacity cannot be negative"]
        },
        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active"
        },
        description: {
            type: String,
            default: "",
            trim: true
        }
    },
    {
        timestamps: true
    }
);

const Warehouse = mongoose.model("Warehouse", warehouseSchema);

export default Warehouse;
