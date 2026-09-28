import mongoose from "mongoose";
import Vendor from "../models/vendor.model.js";
import PurchaseOrder from "../models/purchaseOrder.model.js";

/**
 * Resolves a vendor document from either a Mongo ObjectId or a display name.
 * This is what makes purchase orders and payments truly link to vendors:
 * the API accepts a plain vendor name from the UI, but we store the real
 * ObjectId reference on the record as well.
 */
export const resolveVendor = async (vendorId, vendorName) => {
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
        const byId = await Vendor.findById(vendorId);
        if (byId) return byId;
    }
    if (vendorName && typeof vendorName === "string" && vendorName.trim()) {
        const byName = await Vendor.findOne({ name: vendorName.trim() });
        if (byName) return byName;
    }
    return null;
};

/**
 * Recomputes a vendor's rollup fields from its purchase orders so the numbers
 * always reflect real activity:
 *  - totalOrders   -> count of non-cancelled purchase orders
 *  - totalSpend    -> sum of non-cancelled purchase order totals
 *  - deliveryScore -> % of delivered orders that arrived on/before their
 *                     expected delivery date (0 when nothing delivered yet)
 * Called whenever POs are created, updated, or deleted.
 */
export const recomputeVendorStats = async (vendorId) => {
    if (!vendorId) return null;

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return null;

    // Match by id AND by stored name so legacy POs created before the id link
    // existed are still counted toward the vendor's totals.
    const orders = await PurchaseOrder.find({
        $or: [{ vendorId }, { vendor: vendor.name }]
    }).lean();
    const active = orders.filter((o) => o.status !== "Cancelled");
    const delivered = orders.filter((o) => o.status === "Delivered");
    const onTime = delivered.filter(
        (o) => o.actualDelivery && o.expectedDelivery && o.actualDelivery <= o.expectedDelivery
    ).length;

    const totalSpend = active.reduce((sum, o) => sum + (o.total || 0), 0);
    const deliveryScore = delivered.length
        ? Math.round((onTime / delivered.length) * 100)
        : 0;

    return Vendor.findByIdAndUpdate(
        vendorId,
        {
            $set: {
                totalOrders: active.length,
                totalSpend,
                deliveryScore
            }
        },
        { new: true }
    );
};
