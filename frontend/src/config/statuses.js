// ─── Entity Statuses (single source of truth) ─────────────────────────────
// Roles & Permissions and User Management both derive their status pills,
// toggles, filters and labels from these maps so the two modules can never
// drift apart. Only Active / Inactive exist end-to-end: the backend Mongoose
// enums, Joi schemas, login guard and auth middleware enforce the same pair.

export const ROLE_STATUSES = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "danger" },
};

export const USER_STATUSES = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "danger" },
};

/** Resolve status metadata, falling back to a neutral pill for unknown values. */
export const getStatusMeta = (statusMap, status) =>
  statusMap[status] ?? { label: status || "Active", tone: "neutral" };

/** Build [{ value, label }] options for a status filter dropdown. */
export const statusFilterOptions = (statusMap) => [
  { value: "all", label: "All Status" },
  ...Object.entries(statusMap).map(([key, meta]) => ({ value: key, label: meta.label })),
];
