import Inventory from "../models/inventory.model.js";
import Vendor from "../models/vendor.model.js";
import Product from "../models/product.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { generateProductId, generateInventoryId } from "../utils/idGenerator.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Escape regex metacharacters so a name is matched literally (mirrors the
// warehouse controller's duplicate-name guard).
const escapeRegExp = (str) =>
    String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// When a supplierId reference is provided, resolve the vendor's name so the
// denormalized `supplier` display field always matches the linked vendor.
// Keeps the two in sync even if the vendor is later renamed.
const resolveSupplier = async (data) => {
    if (!data.supplierId) return data;
    try {
        const vendor = await Vendor.findById(data.supplierId).select("name").lean();
        if (vendor) {
            data.supplier = vendor.name;
        } else if (!data.supplier) {
            data.supplier = "";
        }
    } catch {
        // invalid ObjectId — leave the supplied name as-is
    }
    return data;
};

// Inventory categories are a fixed enum while product categories are dynamic
// keys (managed via the product-categories API). Map each inventory category
// to the closest default product category key.
const PRODUCT_CATEGORY_MAP = {
    Panels: "solar-panels",
    Inverters: "inverters",
    Batteries: "batteries",
    Controllers: "charge-controllers",
    Mounting: "mounting-structures",
    Wiring: "cables",
    Accessories: "connectors"
};

const mapInventoryCategoryToProduct = (category) => {
    if (!category) return "accessories";
    const trimmed = String(category).trim();
    if (PRODUCT_CATEGORY_MAP[trimmed]) return PRODUCT_CATEGORY_MAP[trimmed];
    return (
        trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        "accessories"
    );
};

// Creates a linked Product from an inventory item so the item also shows up in
// Product Catalog (warranty defaults to 5 months). The product is tagged with
// inventoryRef so we can keep it in sync later and remove it when the item is
// deleted. The inventory item remains the source of truth for stock.
const createProductForInventoryItem = async (item) => {
    return Product.create({
        productId: await generateProductId(),
        name: item.name,
        brand: item.supplier || "Unknown",
        category: mapInventoryCategoryToProduct(item.category),
        costPrice: item.unitPrice,
        price: item.unitPrice,
        stock: item.quantity,
        minStock: item.minStock,
        warranty: 5,
        inventoryItemId: item._id,
        inventoryRef: item._id,
        specs: {}
    });
};

export const createInventoryItem = async (req, res) => {
    try {
        const data = await resolveSupplier({ ...req.body });
        // invId is system-generated; never trust a client-supplied value
        delete data.invId;

        // Reject duplicate names (case-insensitive) — the same item must not
        // be stored twice. When a vendor adds stock for an item that already
        // exists, they should increase that item's quantity instead, so no
        // duplicate records pile up in Inventory (and no duplicate auto-created
        // products in the catalog).
        const existing = await Inventory.findOne({
            name: {
                $regex: new RegExp(
                    `^${escapeRegExp(String(data.name || "").trim())}$`,
                    "i"
                )
            }
        });
        if (existing) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: `An inventory item "${existing.name}" (${existing.invId || existing._id}) already exists — add the new stock to that existing item instead of creating a duplicate.`,
                data: { existingId: existing._id }
            });
        }

        // Retry on duplicate-key so two simultaneous creates don't collide on the same INV-XXX
        let item;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.invId = await generateInventoryId();
                // SKU is no longer collected in the UI — mirror the auto
                // ID so any consumer that still reads `sku` gets a value.
                data.sku = data.sku || data.invId;
                item = await Inventory.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        // A new inventory item should always show up in Product Catalog: auto-
        // create a linked product from the item's data. If that fails, keep the
        // item (unlinked) rather than losing it entirely.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await createProductForInventoryItem(item);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the PRD-XXX
                console.error("Auto-create Product For Inventory Error:", error);
                break;
            }
        }

        // Pre-existing products with the same name that were never linked also
        // mirror the item's stock, so creating an inventory entry for a product
        // already in the catalog keeps both modules in sync.
        try {
            await Product.updateMany(
                { name: item.name, inventoryItemId: null },
                { stock: item.quantity, minStock: item.minStock }
            );
        } catch (error) {
            console.error("Sync Unlinked Products By Name Error:", error);
        }

        logActivity({
            module: "inventory",
            action: "created",
            recordId: item.invId || item.sku || String(item._id),
            recordLabel: item.name,
            req,
            changes: computeChanges({}, item.toObject ? item.toObject() : item),
            summary: `Inventory item created: ${item.name}`
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Inventory item created successfully",
            data: item
        });
    } catch (error) {
        console.error("Create Inventory Item Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllInventoryItems = async (req, res) => {
    try {
        const {
            search,
            category,
            status,
            sortField,
            sortDir,
            page = 1,
            limit = 10
        } = req.query;

        const filter = {};

        if (category && category !== "All") {
            filter.category = category;
        }
        if (status && status !== "All") {
            // Status is derived from quantity vs minStock (not stored in DB):
            // Critical  → quantity === 0
            // Low Stock → 0 < quantity <= minStock
            // In Stock  → quantity > minStock
            if (status === "Critical") {
                filter.quantity = 0;
            } else if (status === "Low Stock") {
                filter.$expr = {
                    $and: [
                        { $gt: ["$quantity", 0] },
                        { $lte: ["$quantity", "$minStock"] }
                    ]
                };
            } else if (status === "In Stock") {
                filter.$expr = { $gt: ["$quantity", "$minStock"] };
            }
        }
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { sku: { $regex: search, $options: "i" } },
                { invId: { $regex: search, $options: "i" } }
            ];
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Inventory.countDocuments(filter);
        const items = await Inventory.find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: items,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Inventory Items Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getInventoryItemById = async (req, res) => {
    try {
        const item = await Inventory.findById(req.params.id).lean();

        if (!item) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Inventory item not found"
            });
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: item
        });
    } catch (error) {
        console.error("Get Inventory Item By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateInventoryItem = async (req, res) => {
    try {
        const data = await resolveSupplier({ ...req.body });
        // invId is system-generated; never allow clients to overwrite it
        delete data.invId;
        if (req.body.quantity !== undefined || req.body.name) {
            data.lastRestocked = new Date();
        }

        const item = await Inventory.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!item) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Inventory item not found"
            });
        }

        // Inventory is the single source of truth for stock: push the updated
        // quantity/minStock onto every product linked to this item.
        await Product.updateMany(
            { inventoryItemId: item._id },
            { stock: item.quantity, minStock: item.minStock }
        );

        // Legacy/manual products that share this item's name but were never
        // linked (inventoryItemId null) must stay in step too, so the Product
        // Catalog never shows a different stock than Inventory Management.
        // Best-effort: a failure here must not fail the update.
        try {
            await Product.updateMany(
                { name: item.name, inventoryItemId: null },
                { stock: item.quantity, minStock: item.minStock }
            );
        } catch (error) {
            console.error("Sync Unlinked Products By Name Error:", error);
        }

        // Keep auto-created products (inventoryRef set) in step with edits to
        // the item's name/category/price/supplier so the Product Catalog never
        // shows stale info. Best-effort: a failure here must not fail the update.
        try {
            await Product.updateMany(
                { inventoryRef: item._id, inventoryItemId: item._id },
                {
                    name: item.name,
                    brand: item.supplier,
                    category: mapInventoryCategoryToProduct(item.category),
                    costPrice: item.unitPrice
                }
            );
        } catch (error) {
            console.error("Sync Inventory Products Error:", error);
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Inventory item updated successfully",
            data: item
        });
    } catch (error) {
        console.error("Update Inventory Item Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteInventoryItem = async (req, res) => {
    try {
        const item = await Inventory.findByIdAndDelete(req.params.id);

        if (!item) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Inventory item not found"
            });
        }

        // Remove products that were auto-created from this item (inventoryRef
        // set and still linked here) so deleting an item doesn't leave orphaned
        // products behind. Must run BEFORE the unlink below, which clears the
        // inventoryItemId this filter relies on. Manually created/linked
        // products are kept. Best-effort: the item delete already succeeded.
        try {
            await Product.deleteMany({ inventoryRef: item._id, inventoryItemId: item._id });
        } catch (error) {
            console.error("Delete Inventory Products Error:", error);
        }

        // Unlink any remaining products pointing at this item so they don't
        // hold a dangling reference (their last synced stock values are kept).
        await Product.updateMany(
            { inventoryItemId: item._id },
            { inventoryItemId: null }
        );

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Inventory item deleted successfully"
        });
    } catch (error) {
        console.error("Delete Inventory Item Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

//#region Get Inventory Stats
export const getInventoryStats = async (req, res) => {
    try {
        const items = await Inventory.find().lean();
        const totalItems = items.length;
        const totalUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
        const totalValue = items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitPrice || 0)), 0);
        const lowStockCount = items.filter((i) => i.quantity <= i.minStock).length;
        const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                totalItems,
                totalUnits,
                totalValue,
                lowStockCount,
                categories
            }
        });
    } catch (error) {
        console.error("Get Inventory Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
