import HTTP_STATUS from "../constants/httpStatus.js";
import DocumentCategory from "../models/documentCategory.model.js";
import Document from "../models/document.model.js";
import {
    validateCreateDocumentCategory,
    validateUpdateDocumentCategory
} from "../validations/documentCategory.validation.js";

const ADMIN_ROLES = ["super_admin", "company_admin"];

const requireAdmin = (req, res) => {
    const role = req.user?.role;
    if (!role || !ADMIN_ROLES.includes(role)) {
        res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: "Only admins can manage document categories"
        });
        return false;
    }
    return true;
};

export const getAllCategories = async (req, res) => {
    try {
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
            DocumentCategory.find(filter).sort(sort).skip(skip).limit(limitNum),
            DocumentCategory.countDocuments(filter)
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
        const category = await DocumentCategory.findById(req.params.id);
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

        const { error, value } = validateCreateDocumentCategory.validate(req.body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        const existing = await DocumentCategory.findOne({ key: value.key });
        if (existing) {
            return res
                .status(400)
                .json({ success: false, message: "Category with this key already exists" });
        }

        const category = await DocumentCategory.create(value);
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

        const { error, value } = validateUpdateDocumentCategory.validate(req.body, {
            stripUnknown: true
        });
        if (error) {
            return res
                .status(400)
                .json({ success: false, message: error.details[0].message });
        }

        // The key is immutable — documents reference categories by key string.
        // Renaming it would orphan documents, so it can never be changed.
        delete value.key;

        const category = await DocumentCategory.findByIdAndUpdate(
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

        const category = await DocumentCategory.findById(req.params.id);
        if (!category) {
            return res
                .status(404)
                .json({ success: false, message: "Category not found" });
        }

        const docsInCategory = await Document.countDocuments({
            category: category.key
        });
        if (docsInCategory > 0) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: `Cannot delete "${category.label}": it is used by ${docsInCategory} document(s). Move or delete those documents first.`
                });
        }

        await DocumentCategory.findByIdAndDelete(req.params.id);
        res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
