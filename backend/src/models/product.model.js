import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
    {
        productId: {
            type: String,
            unique: true,
            // sparse so pre-existing documents without a productId
            // don't collide on null when the unique index is built
            sparse: true,
            trim: true
        },
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true
        },
        brand: {
            type: String,
            required: [true, "Brand is required"],
            trim: true
        },
        category: {
            type: String,
            // Categories are managed dynamically via the product-categories API,
            // so no enum restriction here — any registered category key is valid.
            required: [true, "Category is required"]
        },
        costPrice: {
            type: Number,
            min: [0, "Cost price cannot be negative"],
            default: null
        },
        price: {
            type: Number,
            required: [true, "Price is required"],
            min: [0, "Price cannot be negative"]
        },
        stock: {
            type: Number,
            required: [true, "Stock is required"],
            min: [0, "Stock cannot be negative"]
        },
        minStock: {
            type: Number,
            required: [true, "Minimum stock is required"],
            min: [0, "Min stock cannot be negative"]
        },
        warranty: {
            type: Number,
            required: [true, "Warranty is required"],
            min: [0, "Warranty cannot be negative"]
        },
        inventoryItemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inventory",
            default: null
        },
        // Set when this product was auto-created from an inventory item
        // (Inventory page → Product Catalog). Lets us keep it in sync when the
        // item is edited and remove it when the item is deleted. Manually
        // created/linked products leave this null.
        inventoryRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inventory",
            default: null
        },
        specs: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

// Indexes for fast server-side filtering/pagination on the Product Catalog page.
// (productId already gets its own unique index from the schema definition.)
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
// Speeds up finding products linked to an inventory item (stock sync, unlink).
productSchema.index({ inventoryItemId: 1 });

const Product = mongoose.model("Product", productSchema);

export default Product;
