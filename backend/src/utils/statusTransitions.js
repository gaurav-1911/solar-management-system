/**
 * Status Transition Validation Utility
 *
 * Centralizes all allowed status transitions for every module. Each module
 * defines a map of "from status" → Set of allowed "to statuses". Any
 * transition NOT listed is rejected with a descriptive error message.
 *
 * Usage:
 *   const error = validateStatusTransition("leads", "New", "Interested");
 *   if (error) return res.status(400).json({ success: false, message: error });
 */

const TRANSITIONS = {
    /* ── CRM ─────────────────────────────────────────────────── */

    leads: {
        "New":       ["Contacted", "Interested", "Converted", "Lost"],
        "Contacted": ["Interested", "Converted", "Lost"],
        "Interested": ["Converted", "Lost", "Contacted"],
        // Converted and Lost are terminal — no outgoing transitions
    },

    customers: {
        "Active":   ["Inactive"],
        "Inactive": ["Active"],
    },

    /* ── Sales ───────────────────────────────────────────────── */

    quotations: {
        "Draft":             ["Pending Approval", "Sent", "Rejected"],
        "Pending Approval":  ["Sent", "Rejected"],
        "Sent":              ["Negotiating", "Approved", "Rejected"],
        "Negotiating":       ["Sent", "Approved", "Rejected"],
        // Approved and Rejected are terminal
    },

    /* ── Projects ────────────────────────────────────────────── */

    "site-surveys": {
        "Scheduled": ["Completed", "Cancelled"],
        "Completed": [],   // terminal
        "Cancelled": [],   // terminal
    },

    "solar-designs": {
        "Draft":       ["Final", "Cancelled"],
        "Final":       ["Cancelled"],
        "Cancelled":   [],
    },

    "project-approvals": {
        "Pending":      ["Under Review", "Rejected"],
        "Under Review": ["Approved", "Rejected"],
        "Approved":     [],
        "Rejected":     ["Pending"],   // can resubmit
    },

    installations: {
        "Pending":     ["Scheduled", "On Hold", "In Progress"],
        "Scheduled":   ["In Progress", "On Hold", "Cancelled"],
        "In Progress": ["Completed", "On Hold"],
        "On Hold":     ["Scheduled", "In Progress", "Cancelled"],
        "Completed":   [],
        "Cancelled":   [],
    },

    testing: {
        "In Progress": ["Pass", "Fail"],
        "Pass":        [],
        "Fail":        ["In Progress"],   // can retest
    },

    commissioning: {
        "Pending":     ["In Progress", "Connected"],
        "In Progress": ["Connected"],
        "Connected":   [],
    },

    "project-progress": {
        "Not Started": ["In Progress"],
        "In Progress": ["Completed", "Delayed"],
        "Completed":   [],
        "Delayed":     ["In Progress", "Completed"],
    },

    "daily-progress": {
        "Not Started": ["In Progress"],
        "In Progress": ["Completed", "Delayed", "Blocked"],
        "Completed":   [],
        "Delayed":     ["In Progress", "Completed"],
        "Blocked":     ["In Progress"],
    },

    /* ── Team ────────────────────────────────────────────────── */

    technicians: {
        "Available": ["Busy", "On Leave", "Inactive"],
        "Busy":      ["Available", "On Leave", "Inactive"],
        "On Leave":  ["Available", "Busy"],
        "Inactive":  ["Available"],
    },

    attendance: {
        "Present":  ["Half Day", "Absent"],
        "Half Day": ["Absent"],
        "Absent":   ["Present", "Half Day"],
        "Leave":    [],
    },

    "task-assignments": {
        "Pending":     ["In Progress", "Completed"],
        "In Progress": ["Completed"],
        "Completed":   [],
    },

    "team-schedules": {
        "Scheduled":   ["In Progress", "Completed", "Cancelled"],
        "In Progress": ["Completed", "Cancelled"],
        "Completed":   [],
        "Cancelled":   [],
    },

    /* ── Service ─────────────────────────────────────────────── */

    maintenance: {
        "Open":       ["Scheduled", "In Progress", "Resolved", "Closed"],
        "Scheduled":  ["In Progress", "Closed"],
        "In Progress": ["Resolved", "Closed"],
        "Resolved":   ["Closed", "Open"],   // reopen if needed
        "Closed":     ["Open"],             // reopen if needed
    },

    tickets: {
        "Open":                ["In Progress", "Waiting on Customer", "Resolved", "Closed"],
        "In Progress":         ["Waiting on Customer", "Resolved", "Closed"],
        "Waiting on Customer": ["In Progress", "Resolved", "Closed"],
        "Resolved":            ["Closed", "Open"],   // reopen
        "Closed":              ["Open"],              // reopen
    },

    /* ── Finance ─────────────────────────────────────────────── */

    invoices: {
        "Pending":        ["Partially Paid", "Paid"],
        "Partially Paid": ["Paid"],
        "Paid":           [],
    },

    subsidies: {
        "Pending":  ["Verified", "Rejected"],
        "Verified": ["Rejected"],
        "Rejected": ["Pending"],   // can resubmit
    },

    /* ── AMC / Warranty ──────────────────────────────────────── */

    amc: {
        "Active":         ["Expiring Soon", "Expired"],
        "Expiring Soon":  ["Active", "Expired"],
        "Expired":        ["Active"],   // renew
    },

    warranties: {
        "Active":   ["Expired"],
        "Expired":  [],
    },

    "warranty-claims": {
        "Pending":  ["Approved", "Rejected"],
        "Approved": [],
        "Rejected": ["Pending"],
    },

    /* ── Vendors ─────────────────────────────────────────────── */

    vendors: {
        "Active":   ["Inactive"],
        "Inactive": ["Active"],
    },

    /* ── Inventory / Warehouse ───────────────────────────────── */

    inventory: {
        "In Stock":  ["Low Stock", "Out of Stock"],
        "Low Stock": ["In Stock", "Out of Stock"],
        "Out of Stock": ["In Stock", "Low Stock"],
    },

    warehouses: {
        "Active":   ["Inactive"],
        "Inactive": ["Active"],
    },
};

/**
 * Validate whether a status transition is allowed for a given module.
 *
 * @param {string} moduleKey  - Module identifier (e.g. "leads", "quotations")
 * @param {string} fromStatus - Current status of the record
 * @param {string} toStatus   - Desired new status
 * @returns {string|null}     - Error message if invalid, null if allowed
 */
export const validateStatusTransition = (moduleKey, fromStatus, toStatus) => {
    const transitions = TRANSITIONS[moduleKey];

    // If the module has no transition rules defined, allow anything
    // (pass-through for modules we haven't configured yet)
    if (!transitions) return null;

    // Same status = no-op, always allowed
    if (fromStatus === toStatus) return null;

    const allowed = transitions[fromStatus];

    // Unknown source status — allow (defensive; the model enum should catch it)
    if (!allowed) return null;

    // Terminal state — no outgoing transitions defined
    if (allowed.length === 0) {
        return `Status "${fromStatus}" is final and cannot be changed.`;
    }

    // Check if the target status is in the allowed set
    if (!allowed.includes(toStatus)) {
        const allowedList = allowed.map((s) => `"${s}"`).join(", ");
        return `Cannot change status from "${fromStatus}" to "${toStatus}". Allowed transitions: ${allowedList}.`;
    }

    return null; // valid
};

/**
 * Get all valid next statuses for a given module + current status.
 * Useful for frontend dropdown population.
 *
 * @param {string} moduleKey  - Module identifier
 * @param {string} fromStatus - Current status
 * @returns {string[]}        - Array of allowed next statuses
 */
export const getAllowedNextStatuses = (moduleKey, fromStatus) => {
    const transitions = TRANSITIONS[moduleKey];
    if (!transitions) return [];
    const allowed = transitions[fromStatus];
    if (!allowed) return [];
    return [...allowed];
};

/**
 * Check if a status is terminal (no outgoing transitions).
 *
 * @param {string} moduleKey - Module identifier
 * @param {string} status    - Status to check
 * @returns {boolean}
 */
export const isTerminalStatus = (moduleKey, status) => {
    const transitions = TRANSITIONS[moduleKey];
    if (!transitions) return false;
    const allowed = transitions[status];
    if (!allowed) return false;
    return allowed.length === 0;
};

/**
 * Get all valid statuses for a module (from the transition map keys).
 *
 * @param {string} moduleKey - Module identifier
 * @returns {string[]}
 */
export const getModuleStatuses = (moduleKey) => {
    const transitions = TRANSITIONS[moduleKey];
    if (!transitions) return [];
    return Object.keys(transitions);
};

export default TRANSITIONS;
