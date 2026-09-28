import FollowUp from "../models/followUp.model.js";

/**
 * Find the highest numeric suffix currently in use across stored follow-up IDs
 * (FU-001, FU-002, ...).
 */
export const getMaxFollowUpNumber = async (FollowUpModel = FollowUp) => {
    const lastDoc = await FollowUpModel.findOne({
        followUpId: { $exists: true, $ne: null, $regex: /^FU-\d+$/ }
    })
        .sort({ _id: -1 })
        .select("followUpId")
        .lean();

    if (lastDoc && lastDoc.followUpId) {
        const m = lastDoc.followUpId.match(/^FU-(\d+)$/);
        if (m) return parseInt(m[1], 10);
    }
    return 0;
};

/**
 * Generate the next sequential human-friendly ID like FU-001, FU-002, ...
 */
export const generateFollowUpId = async (FollowUpModel = FollowUp) => {
    const max = await getMaxFollowUpNumber(FollowUpModel);
    return `FU-${String(max + 1).padStart(3, "0")}`;
};

/**
 * Format a follow-up document for consistent API response.
 */
export const formatFollowUp = (followUp) => {
    if (!followUp) return null;

    return {
        ...followUp,
        id: followUp._id ? followUp._id.toString() : followUp.id,
        scheduledDate: followUp.scheduledDate
            ? new Date(followUp.scheduledDate).toISOString().split("T")[0]
            : "",
        nextFollowUpDate: followUp.nextFollowUpDate
            ? new Date(followUp.nextFollowUpDate).toISOString().split("T")[0]
            : null,
        createdAt: followUp.createdAt
            ? new Date(followUp.createdAt).toISOString()
            : "",
        updatedAt: followUp.updatedAt
            ? new Date(followUp.updatedAt).toISOString()
            : ""
    };
};
