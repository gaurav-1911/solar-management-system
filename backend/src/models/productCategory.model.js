import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: [true, "Category key is required"],
            trim: true,
            unique: true,
            lowercase: true,
            match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, "Key must be a slug (e.g. solar-panels)"]
        },
        label: {
            type: String,
            required: [true, "Category label is required"],
            trim: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        color: {
            type: String,
            trim: true,
            default: "#5c6f68"
        },
        icon: {
            type: String,
            trim: true,
            default: "📦"
        },
        isSystem: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

const ProductCategory = mongoose.model("ProductCategory", productCategorySchema);

export default ProductCategory;
