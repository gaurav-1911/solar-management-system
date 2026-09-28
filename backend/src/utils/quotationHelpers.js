export const GST_RATE = 0.18;

/**
 * Compute total, GST (18%) and grand total from an items map.
 * Each item is expected to have qty and price.
 */
export const computeQuotationTotals = (items = {}) => {
    let total = 0;

    const entries =
        items instanceof Map ? items.entries() : Object.entries(items || {});

    for (const [, item] of entries) {
        if (item && Number(item.qty) > 0 && Number(item.price) > 0) {
            total += Number(item.qty) * Number(item.price);
        }
    }

    total = Math.round(total);
    const gst = Math.round(total * GST_RATE);
    const grandTotal = total + gst;

    return { total, gst, grandTotal };
};

/**
 * Resolve the display ID for a quotation: the stored sequential quotationId
 * (Q-001, Q-002, ...) when present, otherwise the legacy Q-XXXX derived from
 * the ObjectId (kept for records created before quotationId was introduced).
 */
export const getQuotationId = (quotation) => {
    if (!quotation) return "";
    if (quotation.quotationId) return quotation.quotationId;
    if (quotation._id) {
        const idStr = quotation._id.toString();
        return `Q-${idStr.substring(idStr.length - 4).toUpperCase()}`;
    }
    return "";
};

/**
 * Format a quotation document for consistent API response.
 */
export const formatQuotation = (quotation) => {
    if (!quotation) return null;

    const quotationId = getQuotationId(quotation);

    // Convert the items Map to a plain object
    let items = {};
    if (quotation.items) {
        if (quotation.items instanceof Map) {
            items = Object.fromEntries(quotation.items);
        } else if (typeof quotation.items === "object") {
            items = quotation.items;
        }
    }

    // Format version history snapshots
    const rawVersions = Array.isArray(quotation.versions) && quotation.versions.length > 0
        ? quotation.versions
        : [{
            version: quotation.version || 1,
            items: quotation.items,
            total: quotation.total || 0,
            gst: quotation.gst || 0,
            grandTotal: quotation.grandTotal || 0,
            status: quotation.status || "Draft",
            validUntil: quotation.validUntil,
            customerResponse: quotation.customerResponse || {},
            createdAt: quotation.createdAt
        }];

    const formattedVersions = rawVersions.map((v) => {
        let vItems = {};
        if (v.items) {
            if (v.items instanceof Map) {
                vItems = Object.fromEntries(v.items);
            } else if (typeof v.items === "object") {
                vItems = v.items;
            }
        }
        return {
            version: v.version || 1,
            items: vItems,
            total: v.total || 0,
            gst: v.gst || 0,
            grandTotal: v.grandTotal || 0,
            status: v.status || "Draft",
            validUntil: v.validUntil ? new Date(v.validUntil).toISOString().split("T")[0] : "",
            customerResponse: v.customerResponse || {},
            createdAt: v.createdAt ? new Date(v.createdAt).toISOString() : "",
            notes: v.notes || ""
        };
    });

    return {
        ...quotation,
        id: quotation._id,
        quotationId,
        items,
        versions: formattedVersions,
        validUntil: quotation.validUntil
            ? new Date(quotation.validUntil).toISOString().split("T")[0]
            : "",
        createdAt: quotation.createdAt
            ? new Date(quotation.createdAt).toISOString().split("T")[0]
            : "",
        updatedAt: quotation.updatedAt
            ? new Date(quotation.updatedAt).toISOString().split("T")[0]
            : ""
    };
};
