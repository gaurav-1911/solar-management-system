/**
 * Find the highest numeric suffix currently in use across stored lead IDs
 * (L-001, L-002, ...). Used by ID generation and the backfill script so that
 * numbers are never reused after deletions.
 *
 * Only IDs in the L-001…L-999 range (1-3 digit suffix) are counted. Legacy
 * leads created under the old numbering scheme (L-1001, L-1002, …) are
 * intentionally ignored so the sequence restarts at L-001 for new leads —
 * their 4-digit IDs never collide with the restarted 3-digit range.
 */
export const getMaxLeadNumber = async (LeadModel) => {
    // Lead IDs are assigned monotonically at creation, so the newest document
    // in the 1-3 digit range carries the highest suffix — one indexed lookup
    // instead of scanning every lead ID. The regex keeps the legacy 4-digit
    // numbering (L-1001…) out of the count, matching the original behavior.
    const lastDoc = await LeadModel.findOne({
        leadId: { $exists: true, $ne: null, $regex: /^L-\d{1,3}$/ }
    })
        .sort({ _id: -1 })
        .select("leadId")
        .lean();
    if (lastDoc && lastDoc.leadId) {
        const m = lastDoc.leadId.match(/^L-(\d{1,3})$/);
        if (m) return parseInt(m[1], 10);
    }
    return 0;
};

/**
 * Format a lead document for consistent API response.
 * Uses the stored sequential leadId (L-001, L-002, ...) when present.
 * Legacy documents created before sequential IDs existed fall back to an
 * ID derived from the last 4 characters of the ObjectId hex string.
 */
export const formatLead = (lead) => {
    if (!lead) return null;

    let leadId = lead.leadId;
    if (!leadId) {
        const idStr = lead._id.toString();
        const shortId = idStr.substring(idStr.length - 4).toUpperCase();
        leadId = `L-${shortId}`;
    }

    return {
        ...lead,
        id: lead._id,
        leadId,
        date: lead.createdAt
            ? new Date(lead.createdAt).toISOString().split("T")[0]
            : lead.date || "",
        followUp: lead.followUp
            ? new Date(lead.followUp).toISOString().split("T")[0]
            : lead.followUp || ""
    };
};
