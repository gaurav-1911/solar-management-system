import HTTP_STATUS from "../constants/httpStatus.js";
import { DEFAULT_PRODUCT_CATEGORIES } from "../constants/productCategories.js";
import ProductCategory from "../models/productCategory.model.js";
import Product from "../models/product.model.js";
import AppFlag from "../models/appFlag.model.js";
import {
    validateCreateProductCategory,
    validateUpdateProductCategory
} from "../validations/productCategory.validation.js";

const ADMIN_ROLES = ["super_admin", "company_admin"];

const requireAdmin = (req, res) => {
    const role = req.user?.role;
    if (!role || !ADMIN_ROLES.includes(role)) {
        res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: "Only admins can manage product categories"
        });
        return false;
    }
    return true;
};

// Seeds the original 8 default categories into the database on first use.
//
// This only happens once, and only when the collection is completely empty,
// so the defaults behave like any normal category: they can be edited,
// recolored, renamed or deleted from the UI, and deleting one (or all of them)
// never brings it back — the one-time AppFlag marker prevents resurrection.
const ensureDefaultProductCategories = async () => {
    try {
        const alreadyBootstrapped = await AppFlag.findOne({
            key: "product_categories_seeded"
        });
        if (alreadyBootstrapped) return;

        const count = await ProductCategory.countDocuments();
        if (count > 0) {
            // Categories already exist (user created them) — just remember that
            // the bootstrap is no longer needed and never touch them again.
            await AppFlag.create({ key: "product_categories_seeded" }).catch(() => {});
            return;
        }

        await ProductCategory.insertMany(DEFAULT_PRODUCT_CATEGORIES, {
            ordered: false
        }).catch((err) => {
            // Duplicate-key errors are fine (concurrent bootstraps racing);
            // anything else should bubble up and be logged by the caller.
            if (err?.code !== 11000) throw err;
        });
        await AppFlag.create({ key: "product_categories_seeded" }).catch(() => {});
    } catch (error) {
        console.warn("Product category bootstrap skipped:", error.message);
    }
};

export const getAllCategories = async (req, res) => {
    try {
        await ensureDefaultProductCategories();

        const {
            page = 1,
            limit = 100,
            search,
            sortField = "createdAt",
            sortDir = 1
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { label: { $regex: search, $options: "i" } },
                { key: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ];
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortField] = parseInt(sortDir, 10);

        const [categories, total] = await Promise.all([
            ProductCategory.find(filter).sort(sort).skip(skip).limit(limitNum),
            ProductCategory.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Categories fetched successfully",
            data: categories,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCategoryById = async (req, res) => {
    try {
        const category = await ProductCategory.findById(req.params.id);
        if (!category) {
            return res
                .status(404)
                .json({ success: false, message: "Category not found" });
        }
        res.status(200).json({
            success: true,
            message: "Category fetched successfully",
            data: category
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createCategory = async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const { error, value } = validateCreateProductCategory.validate(req.body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        const existing = await ProductCategory.findOne({ key: value.key });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Category with this key already exists" });
        }

        const category = await ProductCategory.create(value);
        res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: category
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCategory = async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const { error, value } = validateUpdateProductCategory.validate(req.body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        // The key is immutable — products reference categories by key string.
        // Renaming it would orphan products, so it can never be changed.
        delete value.key;

        const category = await ProductCategory.findByIdAndUpdate(
            req.params.id,
            value,
            { new: true, runValidators: true }
        );
        if (!category) {
            return res
                .status(404)
                .json({ success: false, message: "Category not found" });
        }
        res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: category
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteCategory = async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const category = await ProductCategory.findById(req.params.id);
        if (!category) {
            return res
                .status(404)
                .json({ success: false, message: "Category not found" });
        }

        const productsInCategory = await Product.countDocuments({
            category: category.key
        });
        if (productsInCategory > 0) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: `Cannot delete "${category.label}": it is used by ${productsInCategory} product(s). Move or delete those products first.`
                });
        }

        await ProductCategory.findByIdAndDelete(req.params.id);
        res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
