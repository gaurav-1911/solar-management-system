import mongoose from "mongoose";
import Quotation from "../models/quotation.model.js";
import StockRequest from "../models/stockRequest.model.js";
import Installation from "../models/installation.model.js";
import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";

// Resolve a Product document from a loose reference: an ObjectId string
// (product._id) or the human-readable productId ("PRD-001"). Returns the
// document or null when nothing matches.
export const resolveProductRef = async (ref) => {
    if (!ref) return null;
    const filter = { $or: [{ productId: String(ref) }] };
    if (mongoose.isValidObjectId(ref)) filter.$or.push({ _id: ref });
    return Product.findOne(filter).lean();
};

// Resolve many loose product references (ObjectId strings or productId codes
// like "PRD-001") in ONE query instead of one round-trip per reference.
// Returns a Map keyed by both the raw reference string and the canonical _id
// so callers can look up either form. Mirrors resolveProductRef's precedence:
// a ref that happens to match a productId wins over the same ref as an _id.
export const resolveProductRefs = async (refs) => {
    const unique = [...new Set((refs || []).filter(Boolean).map((r) => String(r)))];
    if (!unique.length) return new Map();
    const idRefs = [];
    const codeRefs = [];
    for (const ref of unique) {
        if (mongoose.isValidObjectId(ref)) idRefs.push(ref);
        else codeRefs.push(ref);
    }
    const clauses = [];
    if (codeRefs.length) clauses.push({ productId: { $in: codeRefs } });
    if (idRefs.length) clauses.push({ _id: { $in: idRefs } });
    if (!clauses.length) return new Map();
    const products = await Product.find({ $or: clauses }).lean();
    const byRef = new Map();
    // _id keys first, then productId keys overwrite — a code wins over an _id
    // for the same raw ref (matches resolveProductRef's $or ordering).
    for (const p of products) {
        if (!byRef.has(String(p._id))) byRef.set(String(p._id), p);
    }
    for (const p of products) {
        if (p.productId) byRef.set(String(p.productId), p);
    }
    return byRef;
};

// Deduct (direction -1) or restore (direction +1) the Inventory quantity that
// backs a product — the linked item, or a same-named item as a legacy
// fallback. Inventory is the source of truth shown by the Product Catalog and
// the quotation picker, so quotation reservations must move it too — otherwise
// the displayed stock keeps showing the pre-quotation number and stock can be
// over-reserved by later quotations. Quantity is floored at 0.
const adjustLinkedInventoryStock = async (product, qty, direction) => {
    if (!product || !(Number(qty) > 0)) return;
    let item = null;
    if (product.inventoryItemId) {
        item = await Inventory.findOne({ _id: product.inventoryItemId }).select("_id").lean();
    }
    if (!item && product.name) {
        const key = String(product.name || "").trim().toLowerCase();
        if (key) {
            item = await Inventory.findOne({
                $expr: { $eq: [{ $toLower: { $trim: { input: "$name" } } }, key] }
            })
                .sort({ updatedAt: -1 })
                .select("_id")
                .lean();
        }
    }
    if (!item) return;
    const q = Number(qty);
    try {
        await Inventory.updateOne(
            { _id: item._id },
            [{ $set: { quantity: { $max: [0, direction === -1 ? { $subtract: ["$quantity", q] } : { $add: ["$quantity", q] }] } } }],
            { updatePipeline: true }
        );
    } catch (error) {
        console.error("Inventory stock adjustment failed for item", item._id, error.message);
    }
};

// Deduct (-1) or restore (+1) both the Product Catalog stock and the backing
// Inventory quantity for a resolved product document.
export const adjustProductStockWithInventory = async (product, qty, direction) => {
    if (!product || !(Number(qty) > 0)) return;
    const q = Number(qty);
    try {
        if (direction === -1) {
            await Product.updateOne(
                { _id: product._id },
                [{ $set: { stock: { $max: [0, { $subtract: ["$stock", q] }] } } }],
                { updatePipeline: true }
            );
        } else {
            await Product.updateOne(
                { _id: product._id },
                [{ $set: { stock: { $max: [0, { $add: ["$stock", q] }] } } }],
                { updatePipeline: true }
            );
        }
    } catch (error) {
        console.error("Quotation stock adjustment failed for product", product._id, error.message);
    }
    await adjustLinkedInventoryStock(product, q, direction);
};

// Normalize a quotation items Map/object into [key, item] entries.
const itemEntries = (items) =>
    items instanceof Map ? items.entries() : Object.entries(items || {});

// Deduct (direction -1) or restore (direction +1) Product Catalog stock for
// the product-referenced items on a quotation. Keys that don't resolve to a
// product (custom components, legacy "comp_..." keys) are skipped so only real
// catalog products affect stock. Stock is floored at 0 so it never goes
// negative. Each product is adjusted independently, so the whole batch runs in
// parallel (Promise.all) — the update must not wait for N sequential DB
// round-trips.
export const adjustQuotationItemStocks = async (items, direction) => {
    // Array.from handles both plain objects and Mongoose Maps (whose .entries()
    // returns an iterator without .filter).
    const entries = Array.from(itemEntries(items)).filter(([, item]) => item && Number(item.qty) > 0);
    // Resolve every product reference in one query, then adjust each product.
    const products = await resolveProductRefs(entries.map(([key]) => key));
    await Promise.all(
        entries.map(async ([key, item]) => {
            const product = products.get(String(key));
            if (!product) return;
            await adjustProductStockWithInventory(product, Number(item.qty), direction);
        })
    );
};

// Restore stock that an approved stock request consumed.
export const restoreApprovedRequestStock = async (request) => {
    if (!request || request.status !== "Approved") return;
    const product = await resolveProductRef(request.productId);
    if (!product || Number(request.requestedQty) <= 0) return;
    await adjustProductStockWithInventory(product, Number(request.requestedQty), 1);
};

// Per-lead stock allowance keyed by canonical product._id:
//   { quoted, approvedExtra, allowed, used }
// quoted        = qty reserved by the lead's quotation items
// approvedExtra = extra qty unlocked via approved stock requests
// allowed       = quoted + approvedExtra (the hard cap for installations)
// used          = qty already used across the lead's installations
// excludeInstallationId lets an update ignore the installation being edited.
export const getLeadAllowance = async (leadId, excludeInstallationId = null) => {
    const quotation = leadId ? await Quotation.findOne({ leadId }).lean() : null;
    const approvedRequests = leadId
        ? await StockRequest.find({ leadId, status: "Approved" }).lean()
        : [];
    const installations = leadId ? await Installation.find({ leadId }).lean() : [];

    const allowance = new Map();

    // Collect every loose product reference across quotation items, approved
    // requests and used materials first, then resolve them all in a single
    // query — avoids N+M+K sequential per-reference lookups below.
    const refs = [];
    if (quotation?.items) {
        for (const [key, item] of itemEntries(quotation.items)) {
            if (item && Number(item.qty) > 0) refs.push(key);
        }
    }
    for (const r of approvedRequests) refs.push(r.productId);
    for (const inst of installations) {
        if (excludeInstallationId && String(inst._id) === String(excludeInstallationId)) continue;
        for (const m of inst.materials || []) {
            if (!m || typeof m !== "object" || !m.productId || m.status !== "Available" || Number(m.quantity) <= 0) continue;
            refs.push(m.productId);
        }
    }
    const products = await resolveProductRefs(refs);

    if (quotation?.items) {
        for (const [key, item] of itemEntries(quotation.items)) {
            if (!item || Number(item.qty) <= 0) continue;
            const product = products.get(String(key));
            if (!product) continue;
            const pid = String(product._id);
            const cur = allowance.get(pid) || { quoted: 0, approvedExtra: 0, allowed: 0, used: 0 };
            cur.quoted += Number(item.qty);
            allowance.set(pid, cur);
        }
    }

    for (const r of approvedRequests) {
        const product = products.get(String(r.productId));
        if (!product) continue;
        const pid = String(product._id);
        const cur = allowance.get(pid) || { quoted: 0, approvedExtra: 0, allowed: 0, used: 0 };
        cur.approvedExtra += Number(r.requestedQty);
        allowance.set(pid, cur);
    }

    for (const cur of allowance.values()) {
        cur.allowed = cur.quoted + cur.approvedExtra;
    }

    for (const inst of installations) {
        if (excludeInstallationId && String(inst._id) === String(excludeInstallationId)) continue;
        for (const m of inst.materials || []) {
            if (!m || typeof m !== "object" || !m.productId || m.status !== "Available" || Number(m.quantity) <= 0) continue;
            const product = products.get(String(m.productId));
            if (!product) continue;
            const pid = String(product._id);
            const cur = allowance.get(pid) || { quoted: 0, approvedExtra: 0, allowed: 0, used: 0 };
            cur.used += Number(m.quantity);
            allowance.set(pid, cur);
        }
    }

    return { quotation, allowance };
};
