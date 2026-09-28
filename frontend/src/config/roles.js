// ─── Role Constants ───────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  COMPANY_ADMIN: "company_admin",
  SALES_MANAGER: "sales_manager",
  TECHNICIAN: "technician",
  CUSTOMER: "customer",
  ACCOUNTANT: "accountant",
  SUPPORT_TEAM: "support_team",
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.COMPANY_ADMIN]: "Company Admin",
  [ROLES.SALES_MANAGER]: "Sales Manager",
  [ROLES.TECHNICIAN]: "Technician",
  [ROLES.CUSTOMER]: "Customer",
  [ROLES.ACCOUNTANT]: "Accountant",
  [ROLES.SUPPORT_TEAM]: "Support Team",
};

// ─── Module Constants ─────────────────────────────────────────────
export const MODULES = {
  DASHBOARD: "dashboard",
  LEADS: "leads",
  CUSTOMERS: "customers",
  QUOTATIONS: "quotations",
  SITE_SURVEY: "site-survey",
  SOLAR_DESIGN: "solar-design",
  PROJECT_APPROVAL: "project-approval",
  INSTALLATIONS: "installations",
  TECHNICIANS: "technicians",
  TESTING: "testing",
  DAILY_PROGRESS: "daily-progress",
  PRODUCTS: "products",
  INVENTORY: "inventory",
  VENDORS: "vendors",
  WAREHOUSES: "warehouses",
  SOLAR_MONITORING: "solar-monitoring",
  ALERTS: "alerts",
  MAINTENANCE: "maintenance",
  TICKETS: "tickets",
  AMC: "amc",
  WARRANTY: "warranty",
  BILLING: "billing",
  PAYMENTS: "payments",
  SUBSIDY: "subsidy",
  DOCUMENTS: "documents",
  USERS: "users",
  ROLE_PERMISSIONS: "role-permissions",
  REPORTS: "reports",
  SALES_REPORTS: "sales-reports",
  PROJECT_REPORTS: "project-reports",
  INVENTORY_REPORTS: "inventory-reports",
  // FINANCIAL_REPORTS: "financial-reports", // Financial Reports module commented out
  TECHNICIAN_REPORTS: "technician-reports",
  PROJECT_PROGRESS: "project-progress",
  COMMISSIONING: "commissioning",
  ATTENDANCE: "attendance",
  TASK_ASSIGNMENT: "task-assignment",
  TEAM_SCHEDULE: "team-schedule",
  SETTINGS: "settings",
  ACTIVITY_LOGS: "activity-logs",
  FOLLOW_UPS: "follow-ups",
};

// ─── Actions ──────────────────────────────────────────────────────
export const ACTIONS = {
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  EXPORT: "export",
};

// ─── Default Permission Matrix ────────────────────────────────────
export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    [MODULES.DASHBOARD]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.LEADS]:            { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.CUSTOMERS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.QUOTATIONS]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SITE_SURVEY]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SOLAR_DESIGN]:     { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PROJECT_APPROVAL]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.INSTALLATIONS]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TECHNICIANS]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TESTING]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.DAILY_PROGRESS]:   { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PRODUCTS]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.INVENTORY]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.VENDORS]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.WAREHOUSES]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SOLAR_MONITORING]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ALERTS]:           { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.MAINTENANCE]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TICKETS]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.AMC]:              { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.WARRANTY]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.BILLING]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PAYMENTS]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SUBSIDY]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.DOCUMENTS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.USERS]:            { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ROLE_PERMISSIONS]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.REPORTS]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SALES_REPORTS]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PROJECT_REPORTS]:  { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.INVENTORY_REPORTS]:{ view: true,  create: true,  edit: true,  delete: true,  export: true  },
    // [MODULES.FINANCIAL_REPORTS]:{ view: true,  create: true,  edit: true,  delete: true,  export: true  }, // Financial Reports module commented out
    [MODULES.TECHNICIAN_REPORTS]:{ view: true, create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PROJECT_PROGRESS]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.COMMISSIONING]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ATTENDANCE]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TASK_ASSIGNMENT]:  { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TEAM_SCHEDULE]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SETTINGS]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ACTIVITY_LOGS]:     { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.FOLLOW_UPS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  },

  [ROLES.COMPANY_ADMIN]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.LEADS]:            { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.CUSTOMERS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.QUOTATIONS]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SITE_SURVEY]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SOLAR_DESIGN]:     { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PROJECT_APPROVAL]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.INSTALLATIONS]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TECHNICIANS]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TESTING]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.DAILY_PROGRESS]:   { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PRODUCTS]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.INVENTORY]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.VENDORS]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.WAREHOUSES]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SOLAR_MONITORING]: { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.ALERTS]:           { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.MAINTENANCE]:      { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TICKETS]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.AMC]:              { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.WARRANTY]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.BILLING]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.PAYMENTS]:         { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SUBSIDY]:          { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.DOCUMENTS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.USERS]:            { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ROLE_PERMISSIONS]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.REPORTS]:          { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.SALES_REPORTS]:    { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.PROJECT_REPORTS]:  { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.INVENTORY_REPORTS]:{ view: true,  create: false, edit: false, delete: false, export: true  },
    // [MODULES.FINANCIAL_REPORTS]:{ view: true,  create: false, edit: false, delete: false, export: true  }, // Financial Reports module commented out
    [MODULES.TECHNICIAN_REPORTS]:{ view: true, create: false, edit: false, delete: false, export: true  },
    [MODULES.PROJECT_PROGRESS]: { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.COMMISSIONING]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.ATTENDANCE]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TASK_ASSIGNMENT]:  { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.TEAM_SCHEDULE]:    { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SETTINGS]:         { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.ACTIVITY_LOGS]:     { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.FOLLOW_UPS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
  },

  [ROLES.SALES_MANAGER]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.LEADS]:            { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.CUSTOMERS]:        { view: true,  create: true,  edit: true,  delete: false, export: true  },
    [MODULES.QUOTATIONS]:       { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    [MODULES.SITE_SURVEY]:      { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.SOLAR_DESIGN]:     { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.PROJECT_APPROVAL]: { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.INSTALLATIONS]:    { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.PRODUCTS]:         { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.WARRANTY]:         { view: true,  create: true,  edit: true,  delete: true,  export: false },
    [MODULES.DOCUMENTS]:        { view: true,  create: true,  edit: true,  delete: false, export: true  },
    [MODULES.REPORTS]:          { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.SALES_REPORTS]:    { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.FOLLOW_UPS]:        { view: true,  create: true,  edit: true,  delete: true,  export: true  },
    // No User Management access — cannot view/create/edit/delete users.
    [MODULES.USERS]:            { view: false, create: false, edit: false, delete: false, export: false },
  },    [ROLES.TECHNICIAN]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.CUSTOMERS]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.INSTALLATIONS]:    { view: true,  create: false, edit: true,  delete: false, export: false },
    [MODULES.TESTING]:          { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.COMMISSIONING]:    { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.DAILY_PROGRESS]:   { view: true,  create: true,  edit: true,  delete: true,  export: false },
    [MODULES.MAINTENANCE]:      { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.TICKETS]:          { view: true,  create: false, edit: true,  delete: false, export: false },
    [MODULES.SOLAR_MONITORING]: { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.SITE_SURVEY]:      { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.PRODUCTS]:         { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.INVENTORY]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.WARRANTY]:         { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.DOCUMENTS]:        { view: true,  create: true,  edit: false, delete: false, export: false },
    [MODULES.TECHNICIANS]:      { view: true,  create: true,  edit: false, delete: false, export: false },
    [MODULES.ATTENDANCE]:       { view: true,  create: true,  edit: false, delete: false, export: false },    [MODULES.AMC]:              { view: true, create: false, edit: true, delete: false, export: false },
    [MODULES.TASK_ASSIGNMENT]:  { view: true, create: false, edit: false, delete: false, export: false },
    // No User Management access.
    [MODULES.USERS]:            { view: false, create: false, edit: false, delete: false, export: false },
  },

  [ROLES.CUSTOMER]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.SOLAR_MONITORING]: { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.TICKETS]:          { view: true,  create: true,  edit: false, delete: false, export: false },
    [MODULES.BILLING]:          { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.PAYMENTS]:         { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.WARRANTY]:         { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.DOCUMENTS]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.QUOTATIONS]:       { view: true,  create: false, edit: false, delete: false, export: false },    [MODULES.PROJECT_APPROVAL]: { view: true, create: false, edit: true, delete: false, export: false },
    [MODULES.SITE_SURVEY]:      { view: true, create: false, edit: false, delete: false, export: false },
    [MODULES.AMC]:              { view: true, create: false, edit: false, delete: false, export: false },
    [MODULES.MAINTENANCE]:      { view: true, create: true, edit: false, delete: false, export: false },
    [MODULES.USERS]:            { view: false, create: false, edit: false, delete: false, export: false },
  },

  [ROLES.ACCOUNTANT]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.BILLING]:          { view: true,  create: true,  edit: true,  delete: false, export: true  },
    [MODULES.PAYMENTS]:         { view: true,  create: true,  edit: true,  delete: false, export: true  },
    [MODULES.CUSTOMERS]:        { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.QUOTATIONS]:       { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.REPORTS]:          { view: true,  create: false, edit: false, delete: false, export: true  },
    [MODULES.SALES_REPORTS]:    { view: true,  create: false, edit: false, delete: false, export: true  },
    // [MODULES.FINANCIAL_REPORTS]:{ view: true,  create: false, edit: false, delete: false, export: true  }, // Financial Reports module commented out
    [MODULES.DOCUMENTS]:        { view: true,  create: false, edit: false, delete: false, export: true  },
    // No User Management access.
    [MODULES.USERS]:            { view: false, create: false, edit: false, delete: false, export: false },
  },

  [ROLES.SUPPORT_TEAM]: {
    [MODULES.DASHBOARD]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.TICKETS]:          { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.MAINTENANCE]:      { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.CUSTOMERS]:        { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.INSTALLATIONS]:    { view: true,  create: false, edit: false, delete: false, export: false },
    [MODULES.COMMISSIONING]:    { view: true,  create: false, edit: true,  delete: false, export: false },
    [MODULES.AMC]:              { view: true,  create: true,  edit: true,  delete: false, export: false },
    [MODULES.WARRANTY]:         { view: true,  create: false, edit: true,  delete: false, export: false },
    [MODULES.DOCUMENTS]:        { view: true,  create: false, edit: false, delete: false, export: false },
    // No User Management access.
    [MODULES.USERS]:            { view: false, create: false, edit: false, delete: false, export: false },
  },
};

export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

// ─── Dynamic LocalStorage Persistence Engine ────────────────────────
// Exported so AuthContext can watch for cross-tab changes (the browser fires
// a `storage` event in every other tab when these keys change), enabling
// instant permission lockout (Access Denied) without a page reload.
export const STORAGE_PERMISSIONS_KEY = "solar_dynamic_permissions_matrix_v2";
export const STORAGE_ROLES_KEY = "solar_dynamic_roles_list_v2";

/**
 * A role is a SYSTEM role only when it is Super Admin. Company Admin,
 * Customer and every other built-in or custom role are regular roles.
 * Keys may arrive as "super_admin" or as the display name "Super Admin".
 */
export const isSystemRole = (role) => {
  const raw = String(role?.key || role?.id || role?.name || "");
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return key === ROLES.SUPER_ADMIN;
};

let inMemoryRolesList = null;
let inMemoryPermissionsObj = null;

export const getStoredRolesList = () => {
  if (inMemoryRolesList && Array.isArray(inMemoryRolesList) && inMemoryRolesList.length > 0) {
    return inMemoryRolesList.map((r) => ({ ...r, isSystem: isSystemRole(r) }));
  }
  return Object.entries(ROLES).map(([key, value]) => ({
    id: value,
    key: value,
    name: ROLE_LABELS[value] || key,
    isSystem: isSystemRole({ key: value }),
  }));
};

export const getStoredRolePermissions = () => {
  if (inMemoryPermissionsObj) {
    if (!inMemoryPermissionsObj[ROLES.SUPER_ADMIN]) {
      inMemoryPermissionsObj[ROLES.SUPER_ADMIN] = DEFAULT_ROLE_PERMISSIONS[ROLES.SUPER_ADMIN];
    }
    return inMemoryPermissionsObj;
  }
  return DEFAULT_ROLE_PERMISSIONS;
};

export const saveDynamicRolesAndPermissions = (rolesList, permissionsObj) => {
  const normalizedRoles = (rolesList || []).map((r) => ({
    ...r,
    isSystem: isSystemRole(r),
  }));
  inMemoryRolesList = normalizedRoles;
  inMemoryPermissionsObj = permissionsObj;
  window.dispatchEvent(new CustomEvent("roles-updated"));
};

export const setStoredRolePermissions = (permissionsObj) => {
  inMemoryPermissionsObj = permissionsObj;
};

// ─── Helpers ──────────────────────────────────────────────────────

/** Get readable label for any role key */
export const getRoleLabel = (roleKey) => {
  if (ROLE_LABELS[roleKey]) return ROLE_LABELS[roleKey];
  if (inMemoryRolesList) {
    const match = inMemoryRolesList.find((r) => r.id === roleKey || r.key === roleKey);
    if (match) return match.name;
  }
  return roleKey ? roleKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "User";
};

/** True when the user has at least one accessible module (any permission). */
export const hasAnyAccess = (permissions) =>
  Array.isArray(permissions) && permissions.length > 0;

/**
 * True when the stored roles list marks the role as deactivated (inactive).
 * Deactivating a role in Roles & Permissions revokes ALL access for its
 * users — the same as deleting the role or granting it zero permissions.
 * When the roles list is unknown/stale the check fails open (only the
 * permission matrix decides), because the backend enforces role status
 * authoritatively at login and on every profile re-sync.
 */
const isRoleInactive = (role) => {
  if (!role) return false;
  try {
    const list = getStoredRolesList();
    const entry = list.find((r) => String(r.key || r.id || "") === String(role));
    return !!entry && entry.status === "inactive";
  } catch (e) {
    return false;
  }
};

/** Get accessible module keys for a given role */
export const getAccessibleModules = (role) => {
  if (isRoleInactive(role)) return [];
  const currentPermissions = getStoredRolePermissions();
  const defaultMods = DEFAULT_ROLE_PERMISSIONS[role] || {};
  const roleMods = { ...defaultMods, ...(currentPermissions[role] || {}) };
  return Object.keys(roleMods).filter((moduleKey) => {
    const actions = roleMods[moduleKey];
    if (!actions) return false;
    return Object.values(actions).some(Boolean);
  });
};

/** Check if a role has a specific action on a module */
export const canDo = (role, moduleKey, actionKey) => {
  if (isRoleInactive(role)) return false;
  const currentPermissions = getStoredRolePermissions();
  const defaultMods = DEFAULT_ROLE_PERMISSIONS[role] || {};
  const roleMods = { ...defaultMods, ...(currentPermissions[role] || {}) };
  const mod = roleMods[moduleKey];
  if (!mod) return false;
  return mod[actionKey] === true;
};

/** Check if a role has access to a module at all (any action) */
export const hasPermission = (role, moduleKey) => {
  if (isRoleInactive(role)) return false;
  const currentPermissions = getStoredRolePermissions();
  const defaultMods = DEFAULT_ROLE_PERMISSIONS[role] || {};
  const roleMods = { ...defaultMods, ...(currentPermissions[role] || {}) };
  const mod = roleMods[moduleKey];
  if (!mod) return false;
  return Object.values(mod).some(Boolean);
};

/** Get all allowed actions for a module under a role */
export const getActions = (role, moduleKey) => {
  if (isRoleInactive(role)) return [];
  const currentPermissions = getStoredRolePermissions();
  const roleMods = currentPermissions[role] || {};
  const mod = roleMods[moduleKey] || {};
  return Object.entries(mod)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
};
