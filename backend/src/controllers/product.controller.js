import mongoose from "mongoose";
import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";
import Warehouse from "../models/warehouse.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { generateProductId, generateInventoryId } from "../utils/idGenerator.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";

// Product categories are dynamic (managed via the product-categories API) while
// Inventory categories are a fixed enum. Map the known category keys onto the
// closest inventory category; anything unknown falls back to "Accessories".
const INVENTORY_CATEGORY_MAP = {
    "solar-panels": "Panels",
    inverters: "Inverters",
    batteries: "Batteries",
    "charge-controllers": "Controllers",
    "mounting-structures": "Mounting",
    connectors: "Wiring",
    cables: "Wiring",
    "solar-water-pumps": "Accessories"
};
const INVENTORY_CATEGORIES = [
    "Panels", "Inverters", "Batteries",
    "Accessories", "Mounting", "Wiring", "Controllers"
];

const mapProductCategoryToInventory = (category) => {
    if (!category) return "Accessories";
    const trimmed = String(category).trim();
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (INVENTORY_CATEGORY_MAP[slug]) return INVENTORY_CATEGORY_MAP[slug];
    if (INVENTORY_CATEGORIES.includes(trimmed)) return trimmed;
    return "Accessories";
};

// Auto-created inventory entries need a location; use the first active
// warehouse, or null when none exist so the item is never stamped with a
// made-up location (the caller skips auto-creation in that case).
const getDefaultWarehouseName = async () => {
    try {
        const warehouse = await Warehouse.findOne({ status: "Active" })
            .sort({ createdAt: 1 })
            .select("name")
            .lean();
        return warehouse?.name || null;
    } catch (error) {
        return null;
    }
};

// Creates a linked Inventory entry from product data so the new product shows
// up in Inventory Management too (auto INV id, supplier = brand/vendor, and a
// location defaulting to the first active warehouse). When no warehouse exists
// yet, the entry is skipped (returns null) so the product is never tied to a
// made-up location — it simply stays unlinked until a warehouse is added. The
// item is tagged with productRef so we can keep it in sync later and remove it
// if the product is deleted. Retries on duplicate-key so two simultaneous
// creates don't collide on the same INV-XXX (mirrors createInventoryItem).
const createInventoryForProduct = async (product) => {
    const location = await getDefaultWarehouseName();
    if (!location) return null;
    let item;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            item = await Inventory.create({
                invId: await generateInventoryId(),
                name: product.name,
                category: mapProductCategoryToInventory(product.category),
                sku: product.productId,
                quantity: product.stock,
                minStock: product.minStock,
                unitPrice: product.costPrice || product.price,
                supplier: product.brand,
                location,
                lastRestocked: new Date(),
                productRef: product._id
            });
            break;
        } catch (error) {
            if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
            throw error;
        }
    }
    return item;
};

// Syncs an auto-created inventory entry (productRef matches) with edits made to
// its product, so the two pages never show conflicting names/prices. Stock is
// intentionally not touched here — Inventory remains the source of truth.
const syncLinkedInventory = async (product) => {
    if (!product || !product.inventoryItemId) return;
    const inv = await Inventory.findById(product.inventoryItemId).select("productRef").lean();
    if (!inv || String(inv.productRef || "") !== String(product._id)) return;
    await Inventory.updateOne(
        { _id: inv._id },
        {
            name: product.name,
            category: mapProductCategoryToInventory(product.category),
            unitPrice: product.costPrice || product.price,
            supplier: product.brand
        }
    );
};

// When a product is linked (or stays linked) to an inventory item, Inventory is
// the single source of truth for stock: mirror its quantity/minStock onto the
// product. Invalid references are dropped instead of stored as a broken link.
const resolveInventoryLink = async (data, existing = null) => {
    // The link to enforce: the one the client sent, or — if the client didn't
    // touch the link at all — the product's current link (so stock edits on an
    // already-linked product can't diverge from Inventory).
    const requested =
        data.inventoryItemId !== undefined
            ? data.inventoryItemId
            : existing
                ? existing.inventoryItemId
                : null;

    // "" is accepted by Joi but means "no link" — normalize it to null so it
    // never reaches Mongo as an uncastable ObjectId.
    if (requested === "") {
        data.inventoryItemId = null;
        return data;
    }
    if (!requested) return data;

    let inv = null;
    if (mongoose.isValidObjectId(requested)) {
        inv = await Inventory.findById(requested);
    }
    if (inv) {
        data.inventoryItemId = inv._id;
        data.stock = inv.quantity;
        data.minStock = inv.minStock;
        // Sync the vendor cost price from inventory — the selling price (data.price)
        // is left untouched so the admin's markup is preserved.
        if (inv.unitPrice !== undefined && inv.unitPrice !== null) {
            data.costPrice = inv.unitPrice;
        }
    } else {
        data.inventoryItemId = null;
    }
    return data;
};

// Build a lowercase-name → { quantity, minStock } lookup of every inventory
// item. Products that were never linked (legacy or manually created) fall back
// to a same-named item so both modules always report the same stock.
const buildInventoryStockMap = async () => {
    // Most recently updated item wins for duplicate names — matches the
    // last-write-wins behaviour of the write-time name sync in the Inventory
    // controller.
    const items = await Inventory.find({})
        .select("name quantity minStock updatedAt")
        .sort({ updatedAt: -1 })
        .lean();
    const map = new Map();
    for (const it of items || []) {
        const key = String(it.name || "").trim().toLowerCase();
        if (!key || map.has(key)) continue;
        map.set(key, { quantity: it.quantity, minStock: it.minStock });
    }
    return map;
};

// Inventory is the single source of truth for stock. Mirror the linked
// inventory item's quantity onto the product before sending it back, so the
// Product Catalog always reports the same stock as Inventory Management even
// when the stored product.stock is stale (e.g. after quotation deductions).
// Products without a link fall back to a same-named inventory item.
const mirrorInventoryStock = (product, invStockMap = null) => {
    if (!product) return product;
    const doc = product.toObject ? product.toObject() : product;
    // Normalize costPrice: 0 or null means it was never set (legacy product),
    // so fall back to the selling price.
    if (!doc.costPrice) {
        doc.costPrice = doc.price || 0;
    }
    const inv = doc.inventoryItemId;
    if (inv && inv.quantity !== undefined) {
        doc.stock = Math.max(0, Number(inv.quantity) || 0);
        return doc;
    }
    if (invStockMap) {
        const key = String(doc.name || "").trim().toLowerCase();
        const match = key ? invStockMap.get(key) : null;
        if (match) {
            doc.stock = Math.max(0, Number(match.quantity) || 0);
            if (match.minStock !== undefined && match.minStock !== null) {
                doc.minStock = match.minStock;
            }
        }
    }
    return doc;
};

export const createProduct = async (req, res) => {
    try {
        const data = { ...req.body };
        // productId is system-generated; never trust a client-supplied value
        delete data.productId;

        // If linking to an inventory item, stock/minStock come from it
        await resolveInventoryLink(data);

        // Default costPrice to the selling price when not explicitly set
        if (data.costPrice === undefined || data.costPrice === null || data.costPrice === "") {
            data.costPrice = data.price;
        }

        // Retry on duplicate-key so two simultaneous creates don't collide on the same PRD-XXX
        let product;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                data.productId = await generateProductId();
                product = await Product.create(data);
                break;
            } catch (error) {
                if (error.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        if (!product.inventoryItemId) {
            try {
                const inv = await createInventoryForProduct(product);
                if (inv) {
                    product.inventoryItemId = inv._id;
                    await product.save();
                }
            } catch (error) {
                console.error("Auto-create Inventory For Product Error:", error);
            }
        }

        logActivity({
            module: "products",
            action: "created",
            recordId: product.productId || product.sku || String(product._id),
            recordLabel: product.name,
            req,
            changes: computeChanges({}, product.toObject ? product.toObject() : product),
            summary: `Product created: ${product.name}`
        });

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Product created successfully",
            data: product
        });
    } catch (error) {
        console.error("Create Product Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getAllProducts = async (req, res) => {
    try {
        const {
            search,
            category,
            status,
            sortField,
            sortDir,
            page = 1,
            limit = 10,
            fields
        } = req.query;

        const filter = {};

        if (category && category !== "all") {
            filter.category = category;
        }
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { brand: { $regex: search, $options: "i" } },
                { productId: { $regex: search, $options: "i" } }
            ];
        }
        // Stock status is derived (not stored): 0 → out, 0 < stock <= minStock → low,
        // stock > minStock → in. Cross-field comparisons need $expr.
        if (status && status !== "all") {
            if (status === "out-of-stock") {
                filter.stock = 0;
        } else if (status === "low-stock") {
            filter.$expr = {
                $and: [
                    { $gt: ["$stock", 0] },
                    { $lte: ["$stock", "$minStock"] }
                ]
            };
        } else if (status === "in-stock") {
            filter.$expr = { $gt: ["$stock", "$minStock"] };
        }
        }

        const sortObj = {};
        if (sortField) {
            sortObj[sortField] = sortDir === "desc" ? -1 : 1;
        } else {
            sortObj.createdAt = -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Product.countDocuments(filter);

        // Optional projection: pass ?fields=name,brand,stock to fetch only the
        // listed fields (used by the Products page for a lightweight summary
        // of the full catalog for stats, charts and tabs).
        let projection = null;
        if (fields) {
            projection = {};
            fields.split(",").forEach((field) => {
                const name = field.trim();
                if (name) projection[name] = 1;
            });
        }

        // Populate the linked inventory item so clients can show its id/location
        const products = await Product.find(filter, projection)
            .populate("inventoryItemId")
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        // Stock always reflects the linked Inventory item's quantity; unlinked
        // products mirror a same-named item instead (legacy data support).
        const invStockMap = await buildInventoryStockMap();
        const data = (products || []).map((p) => mirrorInventoryStock(p, invStockMap));

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get All Products Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate("inventoryItemId");

        if (!product) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        const invStockMap = await buildInventoryStockMap();
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: mirrorInventoryStock(product, invStockMap)
        });
    } catch (error) {
        console.error("Get Product By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const updateProduct = async (req, res) => {
    try {
        const data = { ...req.body };
        // productId is system-generated; never allow clients to overwrite it
        delete data.productId;

        const existing = await Product.findById(req.params.id);
        if (!existing) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        // Remember the previous link so we can clean up the auto-created
        // inventory entry if the product is re-linked (or unlinked) below.
        const previousLink = existing.inventoryItemId
            ? String(existing.inventoryItemId)
            : null;

        // If (re)linking — or already linked — stock/minStock come from Inventory
        await resolveInventoryLink(data, existing);

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            data,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        // Keep an auto-created inventory entry in step with name/category/price
        // edits so the Inventory page never shows stale product info.
        await syncLinkedInventory(product);

        // The product moved away from an auto-created entry (re-linked or
        // unlinked) — remove the orphaned entry so it doesn't linger in
        // Inventory. Best-effort: a failure here must not fail the update.
        if (previousLink && String(product.inventoryItemId || "") !== previousLink) {
            try {
                const oldInv = await Inventory.findById(previousLink).select("productRef").lean();
                if (oldInv && String(oldInv.productRef || "") === String(product._id)) {
                    await Inventory.findByIdAndDelete(oldInv._id);
                }
            } catch (error) {
                console.error("Cleanup Auto-created Inventory Error:", error);
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Product updated successfully",
            data: product
        });
    } catch (error) {
        console.error("Update Product Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const adjustProductStock = async (req, res) => {
    try {
        const newStock = Math.max(0, parseInt(req.body.quantity) || 0);

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        product.stock = newStock;
        await product.save();

        // The linked inventory item is kept in step so the two pages never
        // report conflicting quantities (Inventory is normally the source of
        // truth; this endpoint is the explicit way to adjust from the product).
        if (product.inventoryItemId) {
            const inv = await Inventory.findById(product.inventoryItemId);
            if (inv) {
                const increased = newStock > inv.quantity;
                await Inventory.updateOne(
                    { _id: inv._id },
                    {
                        quantity: newStock,
                        ...(increased ? { lastRestocked: new Date() } : {})
                    }
                );
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Stock adjusted successfully",
            data: product
        });
    } catch (error) {
        console.error("Adjust Product Stock Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        // Remove the inventory entry that was auto-created from this product so
        // deleting a product doesn't leave an orphaned item behind. Manually
        // linked inventory items (productRef not set) are left untouched.
        // Best-effort: the product delete itself already succeeded.
        if (product.inventoryItemId) {
            try {
                const inv = await Inventory.findById(product.inventoryItemId).select("productRef").lean();
                if (inv && String(inv.productRef || "") === String(product._id)) {
                    await Inventory.findByIdAndDelete(inv._id);
                }
            } catch (error) {
                console.error("Delete Auto-created Inventory Error:", error);
            }
        }

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        console.error("Delete Product Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: MESSAGE.INTERNAL_SERVER_ERROR
        });
    }
};
