import ActivityLog from "../models/activityLog.model.js";

/**
 * MODULE_META maps API route prefixes to the RBAC module name and a
 * human-readable label used in activity-log summaries.
 *
 * When a write request (POST / PUT / PATCH / DELETE) succeeds (2xx),
 * the middleware captures the response body and creates an ActivityLog
 * entry automatically — no per-controller boilerplate needed.
 */
const MODULE_META = {
    "/api/leads":                 { module: "leads",               label: "Lead" },
    "/api/customers":             { module: "customers",           label: "Customer" },
    "/api/quotations":            { module: "quotations",          label: "Quotation" },
    "/api/site-surveys":          { module: "site-survey",         label: "Site Survey" },
    "/api/solar-designs":         { module: "solar-design",        label: "Solar Design" },
    "/api/project-approvals":     { module: "project-approval",    label: "Project Approval" },
    "/api/installations":         { module: "installations",       label: "Installation" },
    "/api/testing":               { module: "testing",             label: "Testing" },
    "/api/project-progress":      { module: "project-progress",    label: "Project Progress" },
    "/api/commissioning":         { module: "commissioning",       label: "Commissioning" },
    "/api/daily-progress":        { module: "daily-progress",      label: "Daily Progress Log" },
    "/api/technicians":           { module: "technicians",         label: "Technician" },
    "/api/technician-locations":  { module: "technician-locations", label: "Technician Location" },
    "/api/daily-reports":         { module: "daily-reports",       label: "Daily Report" },
    "/api/technician-tasks":      { module: "technician-tasks",    label: "Technician Task" },
    "/api/attendance":            { module: "attendance",          label: "Attendance" },
    "/api/task-assignments":      { module: "task-assignment",     label: "Task Assignment" },
    "/api/team-schedules":        { module: "team-schedule",       label: "Team Schedule" },
    "/api/products":              { module: "products",            label: "Product" },
    "/api/product-categories":    { module: "product-categories",  label: "Product Category" },
    "/api/inventory":             { module: "inventory",           label: "Inventory" },
    "/api/vendors":               { module: "vendors",             label: "Vendor" },
    "/api/purchase-orders":       { module: "purchase-orders",     label: "Purchase Order" },
    "/api/vendor-payments":       { module: "vendor-payments",     label: "Vendor Payment" },
    "/api/invoices":              { module: "billing",             label: "Invoice" },
    "/api/credit-notes":          { module: "billing",             label: "Credit Note" },
    "/api/gst-invoices":          { module: "billing",             label: "GST Invoice" },
    "/api/receipts":              { module: "payments",            label: "Receipt" },
    "/api/subsidies":             { module: "subsidy",             label: "Subsidy" },
    "/api/maintenance-tickets":   { module: "maintenance",         label: "Maintenance Ticket" },
    "/api/service-visits":        { module: "maintenance",         label: "Service Visit" },
    "/api/ticket-support":        { module: "tickets",             label: "Ticket" },
    "/api/warranties":            { module: "warranty",            label: "Warranty" },
    "/api/warranty-claims":       { module: "warranty",            label: "Warranty Claim" },
    "/api/vendor-escalations":    { module: "warranty",            label: "Vendor Escalation" },
    "/api/amcs":                  { module: "amc",                 label: "AMC" },
    "/api/users":                 { module: "users",               label: "User" },
    "/api/roles":                 { module: "role-permissions",    label: "Role" },
    "/api/departments":           { module: "departments",         label: "Department" },
    "/api/documents":             { module: "documents",           label: "Document" },
    "/api/document-categories":   { module: "documents",           label: "Document Category" },
    "/api/warehouses":            { module: "warehouses",          label: "Warehouse" },
    "/api/settings":              { module: "settings",            label: "Settings" },
    "/api/auth":                  { module: "auth",                label: "Auth" },
};

// Sorted by path length (longest first) so /api/vendor-payments matches
// before /api/vendors.
const SORTED_PREFIXES = Object.keys(MODULE_META).sort((a, b) => b.length - a.length);

/**
 * Derive the RBAC action from the HTTP method.
 */
const methodToAction = (method) => {
    switch (method) {
        case "POST":   return "created";
        case "PUT":
        case "PATCH":  return "updated";
        case "DELETE": return "deleted";
        default:       return null;
    }
};

/**
 * Try to extract a human-readable label from the response body's `data` object.
 * Checks common ID/name fields across the Solar system.
 */
const extractRecordLabel = (data) => {
    if (!data || typeof data !== "object") return "";
    return (
        data.leadId ||
        data.customerId ||
        data.quotationId ||
        data.surveyId ||
        data.installationId ||
        data.amcId ||
        data.invoiceNumber ||
        data.invoiceId ||
        data.receiptNumber ||
        data.poNumber ||
        data.creditNoteId ||
        data.subsidyId ||
        data.ticketId ||
        data.name ||
        data.title ||
        data.email ||
        data._id?.toString() ||
        ""
    );
};

const isMongoIdOrInternal = (k, v) => {
    if (!k) return true;
    const key = String(k).trim().toLowerCase().replace(/[\s_-]+/g, "");
    const internalKeys = [
        "_id", "id", "v", "version", "password", "hash", "salt",
        "createdat", "updatedat", "tokenversion", "token", "lastlogin",
        "resetpasswordtoken", "resetpasswordexpires", "isemailverified",
        "otp", "otpexpires", "isedit", "linktotype", "isdeleted", "deletedat",
        "documents", "docs", "attachments", "photos", "sitephotos", "electricitybill"
    ];
    if (internalKeys.includes(key)) return true;
    if (key.includes("password") || key.includes("token") || key.includes("login")) return true;

    if (v === null || v === undefined) return true;
    if (v === 0 || v === "0" || v === "0 items" || v === "[]" || v === "{}") return true;
    if (key === "department" && (v === "admin" || v === "general" || v === "default")) return true;

    if (typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v.trim())) return true;

    return false;
};

const formatFieldValue = (k, v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return String(v);
    if (Array.isArray(v)) return `[${v.length} items]`;

    const keyLower = String(k).toLowerCase();

    if (keyLower.includes("account") || v.password) {
        return v.email ? `User Account Created (${v.email})` : "User Account Created";
    }
    if (keyLower.includes("lead") || v.leadId) {
        const parts = [v.leadId, v.name, v.email].filter(Boolean);
        return parts.length > 0 ? `Lead ${parts.join(" — ")}` : "Lead Details";
    }
    if (keyLower.includes("customer") || v.customerId) {
        const parts = [v.name || v.customerName, v.email || v.phone].filter(Boolean);
        return parts.length > 0 ? `Customer ${parts.join(" — ")}` : "Customer Details";
    }

    const entries = Object.entries(v)
        .filter(([subK, subV]) => !isMongoIdOrInternal(subK, subV) && subV !== null && subV !== "");

    if (entries.length === 0) return "Record Details";
    return entries.slice(0, 3).map(([subK, subV]) => `${subK}: ${typeof subV === "object" ? "..." : String(subV)}`).join(", ");
};

/**
 * Express middleware that intercepts write-request responses and logs them
 * as ActivityLog entries. Mount BEFORE routes so it can patch res.json().
 *
 * Only successful (2xx) POST/PUT/PATCH/DELETE are logged.
 * GET requests and error responses are always skipped.
 * Logging is fire-and-forget — failures are swallowed to never break the API.
 */
const activityLoggerMiddleware = (req, res, next) => {
    const method = (req.method || "").toUpperCase();

    // Skip read-only requests immediately
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return next();
    }

    // Find the matching module for this route
    const path = req.originalUrl || req.url || "";
    let meta = null;
    for (const prefix of SORTED_PREFIXES) {
        if (path.startsWith(prefix)) {
            meta = MODULE_META[prefix];
            break;
        }
    }

    // No matching module → skip logging
    if (!meta) return next();

    // Patch res.json to intercept the response
    const originalJson = res.json.bind(res);
    res.json = function (body) {
        // Call the original first so the response goes out immediately
        const result = originalJson(body);

        // Only log successful writes if not already logged explicitly by controller/client
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300 && body?.success === true && !res.locals?.activityLogged) {
            const action = methodToAction(method);
            if (action) {
                const data = body.data || {};
                const recordId = data._id?.toString() || req.params?.id || "";
                const recordLabel = extractRecordLabel(data);

                const user = req.user || {};
                const userId = user.userId || user.id || user._id || null;
                const userName = user.name || user.email || "System";
                const userRole = user.role || "";

                // Build summary
                let summary = `${meta.label} ${action}`;
                if (recordLabel) summary += `: ${recordLabel}`;
                if (action === "updated" && body.message) summary = body.message;
                let changes = res.locals?.changes || [];
                if (changes.length === 0) {
                    if (action === "created" && data && typeof data === "object") {
                        changes = Object.entries(data)
                            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !isMongoIdOrInternal(k, v))
                            .map(([k, v]) => ({
                                field: k,
                                oldValue: null,
                                newValue: formatFieldValue(k, v)
                            }));
                    } else if (action === "updated" && req.body && typeof req.body === "object") {
                        changes = Object.entries(req.body)
                            .filter(([k, v]) => v !== undefined && v !== null && !isMongoIdOrInternal(k, v))
                            .map(([k, v]) => ({
                                field: k,
                                oldValue: null,
                                newValue: formatFieldValue(k, v)
                            }));
                    }
                }

                // 3-second deduplication check before creating automated log
                const windowStart = new Date(Date.now() - 3000);
                ActivityLog.findOne({
                    module: meta.module,
                    createdAt: { $gte: windowStart },
                    $or: [
                        { recordId: recordId || "" },
                        { recordLabel: String(recordLabel) },
                        { summary: String(summary) }
                    ]
                })
                .lean()
                .then((existing) => {
                    if (existing) return;
                    return ActivityLog.create({
                        module: meta.module,
                        action,
                        recordId,
                        recordLabel: String(recordLabel).substring(0, 200),
                        userId,
                        userName,
                        userRole,
                        changes,
                        summary: String(summary).substring(0, 500),
                        ipAddress:
                            req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
                            req.socket?.remoteAddress ||
                            req.ip ||
                            "",
                        userAgent: req.headers?.["user-agent"] || ""
                    });
                })
                .catch((err) => {
                    console.warn("Activity log middleware write failed:", err.message);
                });
            }
        }

        return result;
    };

    next();
};

export default activityLoggerMiddleware;
