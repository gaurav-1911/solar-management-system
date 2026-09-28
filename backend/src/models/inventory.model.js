import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
    {
        invId: {
            type: String,
            unique: true,
            // sparse so pre-existing documents without an invId
            // don't collide on null when the unique index is built
            sparse: true,
            trim: true
        },
        name: {
            type: String,
            required: [true, "Item name is required"],
            trim: true
        },
        category: {
            type: String,
            enum: [
                "Panels", "Inverters", "Batteries",
                "Accessories", "Mounting", "Wiring", "Controllers"
            ],
            required: [true, "Category is required"]
        },
        sku: {
            type: String,
            // No longer collected in the UI — the controller mirrors the auto
            // invId into it so existing consumers that read `sku` keep working.
            default: "",
            trim: true
        },
        quantity: {
            type: Number,
            required: [true, "Quantity is required"],
            min: [0, "Quantity cannot be negative"]
        },
        minStock: {
            type: Number,
            required: [true, "Minimum stock is required"],
            min: [0, "Min stock cannot be negative"]
        },
        unitPrice: {
            type: Number,
            required: [true, "Unit price is required"],
            min: [0, "Unit price cannot be negative"]
        },
        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            default: null
        },
        supplier: {
            type: String,
            required: [true, "Supplier is required"],
            trim: true
        },
        // Location is a free-form warehouse name (previously a fixed enum) so
        // warehouses managed via the Warehouses page can be used without model
        // changes. Existing "Warehouse A/B/C" values remain valid.
        location: {
            type: String,
            required: [true, "Location is required"]
        },
        lastRestocked: {
            type: Date,
            default: null
        },
        // Set when this item was auto-created from a product (Product page →
        // Inventory). Lets us keep it in sync when the product is edited and
        // clean it up when the product is deleted. Manually created items
        // leave this null.
        productRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null
        }
    },
    {
        timestamps: true
    }
);

inventorySchema.index({ category: 1 });
inventorySchema.index({ supplierId: 1 });
inventorySchema.index({ productRef: 1 });
inventorySchema.index({ createdAt: -1 });

const Inventory = mongoose.model("Inventory", inventorySchema);

export default Inventory;
