/**
 * Find the highest numeric suffix currently in use across stored customer IDs
 * (CUS-001, CUS-002, ...). Used by ID generation so numbers are never reused
 * after deletions.
 */
export const getMaxCustomerNumber = async (CustomerModel) => {
    // Customer IDs are assigned monotonically at creation, so the newest
    // document's suffix is the highest in use — one indexed lookup instead of
    // scanning every customer ID in the collection.
    const lastDoc = await CustomerModel.findOne({
        customerId: { $exists: true, $ne: null, $regex: /^CUS-\d+$/ }
    })
        .sort({ _id: -1 })
        .select("customerId")
        .lean();
    if (lastDoc && lastDoc.customerId) {
        const m = lastDoc.customerId.match(/^CUS-(\d+)$/);
        if (m) return parseInt(m[1], 10);
    }
    return 0;
};

/**
 * Format a customer document for consistent API response.
 * Uses the stored sequential customerId (CUS-001, CUS-002, ...) when present.
 * Legacy documents created before sequential IDs existed fall back to an
 * ID derived from the last 4 characters of the ObjectId hex string.
 */
export const formatCustomer = (customer) => {
    if (!customer) return null;

    let customerId = customer.customerId;
    if (!customerId) {
        const idStr = customer._id.toString();
        const shortId = idStr.substring(idStr.length - 4).toUpperCase();
        customerId = `CUS-${shortId}`;
    }

    return {
        ...customer,
        id: customer._id,
        customerId,
        joinDate: customer.joinDate
            ? new Date(customer.joinDate).toISOString().split("T")[0]
            : "",
        lastService: customer.lastService || "—"
    };
};
