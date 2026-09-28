import Role from "../models/role.model.js";

/* ──────────────────────────────────────────────────────────────────────
   RBAC Default Roles & Permission Matrix
   Mirrors Solar_Frontend/frontend/src/config/roles.js so the backend and
   frontend always agree on the canonical permission matrix.

   ⚠️  BOOTSTRAP-ONLY: this seeder only creates the default roles when the
   roles collection is EMPTY (first run). Once roles exist, the seeder NEVER
   touches them again — the permission matrix saved via the Role &
   Permissions page checkboxes is the single source of truth. Server
   restarts, unchecking a box, or editing a role in the UI are never
   overwritten by this file (see the guard in seedRoles).
   ────────────────────────────────────────────────────────────────────── */

const ALL_MODULES = [
  "dashboard", "leads", "customers", "quotations", "site-survey",
  "solar-design", "project-approval", "installations", "technicians",
  "testing", "daily-progress", "products", "inventory", "vendors", "warehouses",
  "solar-monitoring", "alerts", "maintenance", "tickets", "amc",
  "warranty", "billing", "payments", "subsidy", "documents", "users",
  "role-permissions", "reports", "sales-reports", "project-reports",
  "inventory-reports", "financial-reports", "technician-reports",
  "project-progress", "commissioning", "attendance", "task-assignment", "team-schedule",
  "settings", "follow-ups",
];

const fullAccess = () => ({ view: true, create: true, edit: true, delete: true, export: true });
const noAccess = () => ({ view: false, create: false, edit: false, delete: false, export: false });
const viewOnly = () => ({ view: true, create: false, edit: false, delete: false, export: false });
const ACTIONS = ["view", "create", "edit", "delete", "export"];

// Only the system role is force-synced on seed (self-healing). Company Admin
// and Customer are editable via the Role & Permissions page, so their
// admin-customized permissions must persist across restarts — they use the
// merge-only path like every other role instead of being overwritten.
const CANONICAL_ROLE_NAMES = ["Super Admin"];

const setActions = (view = false, create = false, edit = false, del = false, exp = false) => ({
  view, create, edit, delete: del, export: exp,
});

/**
 * Build a full module-permission map from a compact spec.
 * spec values can be:
 *   - "full"  → all five actions true
 *   - "view"  → view only
 *   - [ "view", "create", ... ] → only listed actions true
 *   - { view: true, ... } → raw partial object (merged over no-access)
 * Any module not mentioned defaults to no access.
 */
const buildPermissions = (spec) => {
  const perms = {};
  ALL_MODULES.forEach((m) => { perms[m] = noAccess(); });
  Object.entries(spec || {}).forEach(([moduleKey, actions]) => {
    if (actions === "full") perms[moduleKey] = fullAccess();
    else if (actions === "view") perms[moduleKey] = viewOnly();
    else if (Array.isArray(actions)) {
      perms[moduleKey] = setActions(
        actions.includes("view"),
        actions.includes("create"),
        actions.includes("edit"),
        actions.includes("delete"),
        actions.includes("export")
      );
    } else if (actions && typeof actions === "object") {
      perms[moduleKey] = { ...noAccess(), ...actions };
    }
  });
  return perms;
};

const defaultRoles = [
  {
    name: "Super Admin",
    description: "Unrestricted access across every module, company setting and billing record.",
    color: "purple",
    isSystem: true,
    userCount: 1,
    permissions: buildPermissions(Object.fromEntries(ALL_MODULES.map((m) => [m, "full"]))),
  },
  {
    name: "Company Admin",
    description: "Administrative access to company operations and management.",
    color: "teal",
    isSystem: false,
    userCount: 2,
    permissions: buildPermissions({ dashboard: "view" }),
  },
  {
    name: "Sales Manager",
    description: "Lead tracking, customer management, and quotation generation.",
    color: "blue",
    isSystem: false,
    userCount: 4,
    permissions: buildPermissions({
      dashboard: "view",
      leads: "full",
      customers: ["view", "create", "edit", "export"],
      quotations: "full",
      "site-survey": ["view", "create", "edit"],
      "solar-design": ["view", "create", "edit"],
      "project-approval": ["view", "create", "edit"],
      installations: "view",
      products: ["view", "export"],
      warranty: ["view", "create", "edit", "delete"],
      documents: ["view", "create", "edit", "export"],
      reports: ["view", "export"],
      "sales-reports": ["view", "export"],
    }),
  },
  {
    name: "Technician",
    description: "Executes site surveys, installations and testing, and logs daily field progress.",
    color: "emerald",
    isSystem: false,
    userCount: 6,
    permissions: buildPermissions({
      dashboard: "view",
      installations: ["view", "edit"],
      testing: ["view", "create", "edit"],
      commissioning: ["view", "create", "edit"],
      "daily-progress": ["view", "create", "edit", "delete"],
      maintenance: ["view", "create", "edit"],
      tickets: ["view", "edit"],
      "solar-monitoring": "view",
      "site-survey": ["view", "create", "edit"],
      products: "view",
      inventory: "view",
      documents: ["view", "create"],
      technicians: ["view", "create"],
      attendance: ["view", "create"],
      "task-assignment": ["view"],
      warranty: ["view", "create", "edit"],
    }),
  },
  {
    name: "Customer",
    description: "Self-service portal access to raise tickets, view bills and track solar production.",
    color: "slate",
    isSystem: false,
    userCount: 1,
    permissions: buildPermissions({
      dashboard: "view",
      "solar-monitoring": "view",
      tickets: ["view", "create"],
      billing: "view",
      payments: "view",
      warranty: "view",
      documents: "view",
      quotations: "view",
      "site-survey": "view",
    }),
  },
  {
    name: "Accountant",
    description: "Handles invoicing, payments and subsidy disbursement across every project.",
    color: "purple",
    isSystem: false,
    userCount: 3,
    permissions: buildPermissions({
      dashboard: "view",
      billing: ["view", "create", "edit", "export"],
      payments: ["view", "create", "edit", "export"],
      customers: ["view", "export"],
      quotations: ["view", "export"],
      reports: ["view", "export"],
      "sales-reports": ["view", "export"],
      "financial-reports": ["view", "export"],
      documents: ["view", "export"],
    }),
  },
  {
    name: "Support Team",
    description: "Resolves tickets, maintenance and warranty requests raised by customers.",
    color: "rose",
    isSystem: false,
    userCount: 7,
    permissions: buildPermissions({
      dashboard: "view",
      tickets: ["view", "create", "edit"],
      maintenance: ["view", "create", "edit"],
      customers: "view",
      installations: "view",
      commissioning: ["view", "edit"],
      amc: ["view", "create", "edit"],
      warranty: ["view", "edit"],
      documents: "view",
    }),
  },
];

// Company Admin: everything full except a few modules that are view(+export) only.
// (Recompute explicitly to keep the matrix readable and exact.)
const companyAdminPerms = {};
ALL_MODULES.forEach((m) => { companyAdminPerms[m] = fullAccess(); });
["dashboard", "settings"].forEach((m) => { companyAdminPerms[m] = viewOnly(); });
["solar-monitoring", "reports", "sales-reports", "project-reports",
 "inventory-reports", "financial-reports", "technician-reports"].forEach((m) => {
  companyAdminPerms[m] = setActions(true, false, false, false, true);
});
defaultRoles[1].permissions = companyAdminPerms;

/* ──────────────────────────────────────────────────────────────────────
   Seeder (bootstrap-only): create the default roles when the collection is
   empty. Existing roles are never modified — the upsert/merge/canonicalize
   logic below only runs against a brand-new (empty) collection, so UI-saved
   permissions always win.
   ────────────────────────────────────────────────────────────────────── */

const upsertRole = async (roleDef) => {
  const existing = await Role.findOne({ name: roleDef.name });

  if (!existing) {
    await Role.create(roleDef);
    console.log(`✅ Seeded RBAC role '${roleDef.name}'`);
    return;
  }

  // ── System (canonical) role ────────────────────────────────────────────
  // Only Super Admin is force-synced: it is isSystem (locked in the UI) so
  // the matrix can never drift from admin edits. Company Admin, Customer and
  // every other role use the merge-only path below — admin customizations
  // made in the Role & Permissions page are never overwritten on re-seed.
  if (CANONICAL_ROLE_NAMES.includes(roleDef.name)) {
    const canonicalPerms = roleDef.permissions;
    const currentPerms = existing.permissions || new Map();
    const canonicalEntries = Object.entries(canonicalPerms);
    const matchesCanonical =
      currentPerms.size === canonicalEntries.length &&
      canonicalEntries.every(([moduleKey, actions]) =>
        ACTIONS.every((a) => currentPerms.get(moduleKey)?.[a] === actions[a])
      );

    let changed = false;
    if (!matchesCanonical) {
      existing.permissions = new Map(canonicalEntries);
      changed = true;
    }
    if (existing.isSystem !== roleDef.isSystem) {
      existing.isSystem = roleDef.isSystem;
      changed = true;
    }
    if (changed) {
      await existing.save({ validateBeforeSave: false });
      console.log(`🔄 Canonicalized built-in role '${roleDef.name}' (permissions/isSystem)`);
    }
    return;
  }

  const existingPerms = existing.permissions || new Map();
  let changed = false;

  for (const [moduleKey, actions] of Object.entries(roleDef.permissions)) {
    if (!existingPerms.has(moduleKey)) {
      existingPerms.set(moduleKey, actions);
      changed = true;
    }
  }

  // NOTE: no module is ever force-overwritten here. The merge above only ADDS
  // modules missing from the spec, so admin edits made in the Role &
  // Permissions page (grants AND removals) persist across restarts.

  // Keep the delete-protection flag in sync with the canonical matrix
  // (only Super Admin is a system role).
  if (existing.isSystem !== roleDef.isSystem) {
    existing.isSystem = roleDef.isSystem;
    changed = true;
  }

  if (changed) {
    existing.permissions = existingPerms;
    await existing.save({ validateBeforeSave: false });
    console.log(`🔁 Synced RBAC role '${roleDef.name}' (missing modules added, users module normalized)`);
  }
};

export const seedRoles = async () => {
  try {
    for (const roleDef of defaultRoles) {
      await upsertRole(roleDef);
    }
    console.log("RBAC roles are up to date in MongoDB");
  } catch (error) {
    console.error("❌ RBAC Role Seeder Error:", error.message);
  }
};

export default seedRoles;
