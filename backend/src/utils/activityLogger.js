import ActivityLog from "../models/activityLog.model.js";

/**
 * Extract user information from the Express request object.
 * Works with the auth middleware that sets req.user from the JWT.
 */
const extractUserInfo = (req) => {
    const user = req?.user || {};
    return {
        userId: user.userId || user.id || user._id || null,
        userName: user.name || user.email || "System",
        userRole: user.role || "",
        ipAddress:
            req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req?.socket?.remoteAddress ||
            req?.ip ||
            "",
        userAgent: req?.headers?.["user-agent"] || ""
    };
};

/**
 * Compute field-level changes between an old document and new data.
 *
 * @param {Object} oldDoc  - The original Mongoose document (or plain object)
 * @param {Object} newData - The incoming update payload
 * @param {string[]} [fieldsToTrack] - Optional whitelist of field names to track.
 *                                      If omitted, all keys in newData are compared.
 * @returns {{ field: string, oldValue: any, newValue: any }[]}
 */
export const computeChanges = (oldDoc, newData, fieldsToTrack) => {
    if (!oldDoc || !newData) return [];

    const old = typeof oldDoc.toObject === "function" ? oldDoc.toObject() : oldDoc;
    const keys = fieldsToTrack || Object.keys(newData);
    const changes = [];

    for (const key of keys) {
        // Skip internal/meta fields and large nested structures that
        // should never appear in the activity log (file metadata,
        // version history snapshots, materials checklists, etc.).
        if (["_id", "__v", "createdAt", "updatedAt", "password"].includes(key)) continue;
        if (FIELDS_TO_SKIP.has(key)) continue;
        if (newData[key] === undefined) continue;

        const oldVal = old[key];
        const newVal = newData[key];

        // Normalize for comparison
        const oldStr = formatValue(oldVal);
        const newStr = formatValue(newVal);

        if (oldStr !== newStr) {
            changes.push({
                field: key,
                oldValue: oldVal ?? null,
                newValue: newVal ?? null
            });
        }
    }

    return changes;
};

// Fields that are too large, binary, or internal to be useful in the
// activity log — always excluded from both create and update changes.
const FIELDS_TO_SKIP = new Set([
    // File / photo metadata arrays
    "sitePhotos", "electricityBill", "docs", "photos", "images", "videos",
    "fileData", "documents",
    // Material / product arrays (large, frequently changing)
    "materials", "materialRequests", "materialUsage",
    // Quotation internals
    "versions", "items", "requestedItems", "customerResponse",
    // Testing nested sub-documents
    "stringTest", "stringTests", "inverterTest", "earthingTest",
    "insulationTest", "voltageTest", "currentTest", "performance",
    "safety", "finalInspection", "params",
    // Progress / tasks
    "tasks", "resources", "milestones"
]);

/**
 * Deep-clone a value, stripping Mongoose internals ($, activePaths, etc.)
 * from nested subdocuments so they don't leak into stored activity logs.
 */
const deepSanitize = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (typeof obj.toJSON === "function") return obj.toJSON();
    if (Array.isArray(obj)) return obj.map(deepSanitize);
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("$") || k === "activePaths" || k === "emitter") continue;
        clean[k] = deepSanitize(v);
    }
    return clean;
};

/**
 * Normalize a value to a comparable string representation.
 */
const formatValue = (val) => {
    if (val === null || val === undefined) return "";
    if (val instanceof Date) return val.toISOString();
    if (typeof val === "object") {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
};

/**
 * Log an activity event. This is fire-and-forget — errors are swallowed
 * so that a logging failure never breaks the original API operation.
 *
 * @param {Object} options
 * @param {string}   options.module      - Module key matching RBAC (e.g. "customers", "leads")
 * @param {string}   options.action      - "created" | "updated" | "deleted" | "status_change" | etc.
 * @param {string}   [options.recordId]  - The _id (or human ID) of the affected record
 * @param {string}   [options.recordLabel] - Human-readable label (e.g. "CUS-003", "John Doe")
 * @param {Object}   [options.req]       - Express request object (extracts user, IP, user-agent)
 * @param {Array}    [options.changes]   - Array of { field, oldValue, newValue }
 * @param {string}   options.summary     - One-line human-readable summary
 * @param {string}   [options.userId]    - Override user ID (when req is not available)
 * @param {string}   [options.userName]  - Override user name
 * @param {string}   [options.userRole]  - Override user role
 */
export const logActivity = async ({
    module,
    action,
    recordId,
    recordLabel,
    req,
    changes,
    summary,
    userId,
    userName,
    userRole
}) => {
    try {
        if (req?.res?.locals) {
            req.res.locals.activityLogged = true;
        }

        const targetRecordId = recordId ? String(recordId) : null;
        const targetRecordLabel = recordLabel || "";

        // 3-second deduplication guard: skip duplicate log creation if an identical log was just saved
        const windowStart = new Date(Date.now() - 3000);
        const existing = await ActivityLog.findOne({
            module,
            action,
            createdAt: { $gte: windowStart },
            $or: [
                { recordId: targetRecordId },
                { recordLabel: targetRecordLabel },
                { summary }
            ]
        }).lean();

        if (existing) {
            return;
        }

        const userInfo = extractUserInfo(req);

        await ActivityLog.create({
            module,
            action,
            recordId: targetRecordId,
            recordLabel: targetRecordLabel,
            userId: userId || userInfo.userId,
            userName: userName || userInfo.userName,
            userRole: userRole || userInfo.userRole,
            changes: changes
                ? changes
                    .filter(c => c.field && !FIELDS_TO_SKIP.has(c.field))
                    .map(c => deepSanitize(c))
                : [],
            summary,
            ipAddress: userInfo.ipAddress,
            userAgent: userInfo.userAgent
        });
    } catch (err) {
        // Fire-and-forget — never let logging break the main operation
        console.warn("Activity log write failed:", err.message);
    }
};

export default logActivity;
