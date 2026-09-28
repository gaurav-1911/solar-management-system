import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { useLocalToast, ToastRenderer } from "../../../components/common/Toast";
import { Pagination, Dropdown, ErrorState, OfflineBanner, TableLoader, PageLoader } from "../../../components/common";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import RecordActivityModal, { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../../common/GenericDetailActivityLog";
import StatCard from "../StatCard/StatCard";
import { roleValidationSchema } from "../../../utils/AdminValidation";
import { roleAPI } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import {
  ROLES,
  ROLE_LABELS,
  MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  getStoredRolePermissions,
  saveDynamicRolesAndPermissions,
  isSystemRole,
} from "../../../config/roles";
import { ROLE_STATUSES, getStatusMeta, statusFilterOptions } from "../../../config/statuses";
import "../../../styles/ActionButtons.css";
import "./RolePermissions.css";

const ACTIONS = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "export", label: "Log" },
];

const MODULE_GROUPS = [
  {
    group: "Administration",
    modules: [
      { key: MODULES.DASHBOARD, label: "Dashboard" },
      { key: MODULES.USERS, label: "User Management" },
      { key: MODULES.ROLE_PERMISSIONS, label: "Roles & Permissions" },
      { key: MODULES.DOCUMENTS, label: "Document Management" },
      { key: MODULES.SETTINGS, label: "Settings" },
    ],
  },
  {
    group: "Sales & CRM",
    modules: [
      { key: MODULES.CUSTOMERS, label: "Customer Management" },
      { key: MODULES.LEADS, label: "Lead Management" },
      { key: MODULES.QUOTATIONS, label: "Quotation Management" },
      { key: MODULES.FOLLOW_UPS, label: "Follow-Ups Management" },
    ],
  },
  {
    group: "Operations & Projects",
    modules: [
      { key: MODULES.SITE_SURVEY, label: "Site Survey" },
      { key: MODULES.SOLAR_DESIGN, label: "Solar System Design" },
      { key: MODULES.PROJECT_APPROVAL, label: "Project Approval" },
      { key: MODULES.INSTALLATIONS, label: "Installation Management" },
      { key: MODULES.TESTING, label: "Testing" },
      { key: MODULES.PROJECT_PROGRESS, label: "Project Progress" },
      { key: MODULES.COMMISSIONING, label: "Commissioning & Handover" },
      { key: MODULES.DAILY_PROGRESS, label: "Daily Progress Log" },
    ],
  },
  {
    group: "Team Management",
    modules: [
      { key: MODULES.TECHNICIANS, label: "Technician Management" },
      { key: MODULES.ATTENDANCE, label: "Attendance Log" },
      { key: MODULES.TASK_ASSIGNMENT, label: "Task Assignment" },
      { key: MODULES.TEAM_SCHEDULE, label: "Team Schedule" },
    ],
  },
  {
    group: "Support & Service",
    modules: [
      { key: MODULES.MAINTENANCE, label: "Maintenance Management" },
      { key: MODULES.TICKETS, label: "Ticket Support System" },
      { key: MODULES.AMC, label: "AMC Management" },
      { key: MODULES.WARRANTY, label: "Warranty Management" },
      { key: MODULES.SOLAR_MONITORING, label: "Solar Monitoring" },
      { key: MODULES.ALERTS, label: "Alerts & Notifications" },
    ],
  },
  {
    group: "Inventory & Procurement",
    modules: [
      { key: MODULES.PRODUCTS, label: "Product Catalog" },
      { key: MODULES.INVENTORY, label: "Inventory Management" },
      { key: MODULES.VENDORS, label: "Vendor Management" },
      { key: MODULES.WAREHOUSES, label: "Warehouse Management" },
    ],
  },
  {
    group: "Finance",
    modules: [
      { key: MODULES.BILLING, label: "Billing & Invoice" },
      { key: MODULES.PAYMENTS, label: "Payment" },
      { key: MODULES.SUBSIDY, label: "Govt. Subsidy Management" },
    ],
  },
  {
    group: "Reports & Analytics",
    modules: [
      { key: MODULES.SALES_REPORTS, label: "Sales Reports" },
      { key: MODULES.PROJECT_REPORTS, label: "Project Reports" },
      { key: MODULES.INVENTORY_REPORTS, label: "Inventory Reports" },
      // { key: MODULES.FINANCIAL_REPORTS, label: "Financial Reports" }, // Financial Reports module commented out
      { key: MODULES.TECHNICIAN_REPORTS, label: "Technician Reports" },
    ],
  },
];

const ALL_MODULE_KEYS = MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.key));
const TOTAL_PERMISSION_SLOTS = ALL_MODULE_KEYS.length * ACTIONS.length;

const fullAccess = () => ({ view: true, create: true, edit: true, delete: true, export: true });
const noAccess = () => ({ view: false, create: false, edit: false, delete: false, export: false });
const viewOnly = () => ({ view: true, create: false, edit: false, delete: false, export: false });

function buildPermissions(overrides = {}, fallback = "none") {
  const fallbackFn = fallback === "full" ? fullAccess : fallback === "view" ? viewOnly : noAccess;
  const perms = {};
  ALL_MODULE_KEYS.forEach((key) => {
    perms[key] = overrides[key] ? { ...fallbackFn(), ...overrides[key] } : fallbackFn();
  });
  return perms;
}

// Count granted permissions ONLY for modules inside the known permission
// matrix (ALL_MODULE_KEYS). The stored permissions object can contain extra
// keys (e.g. legacy "reports", modules added later) that are not part of the
// 36-module matrix — counting those would overflow past TOTAL_PERMISSION_SLOTS
// (e.g. 190/180). Filtering to the matrix keeps numerator <= denominator.
function grantedCount(permissions = {}) {
  return ALL_MODULE_KEYS.reduce((sum, mod) => {
    const actions = permissions[mod] || {};
    return sum + ACTIONS.reduce((s, a) => s + (actions[a.key] ? 1 : 0), 0);
  }, 0);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

// Status definitions live in config/statuses.js — the single source of truth
// shared with User Management. Roles support exactly two statuses: Active / Inactive.
const INITIAL_DEFAULT_ROLES = [
  { id: ROLES.SUPER_ADMIN, key: ROLES.SUPER_ADMIN, name: "Super Admin", description: "Unrestricted access across every module, company setting and billing record.", color: "gold", isSystem: true, status: "active", userCount: 2, createdAt: "2024-01-05T09:15:00" },
  { id: ROLES.COMPANY_ADMIN, key: ROLES.COMPANY_ADMIN, name: "Company Admin", description: "Manages daily operations, staff and configuration for a single company account.", color: "indigo", isSystem: false, status: "active", userCount: 4, createdAt: "2024-01-05T09:20:00" },
  { id: ROLES.SALES_MANAGER, key: ROLES.SALES_MANAGER, name: "Sales Manager", description: "Owns leads, quotations and customer conversion through the sales pipeline.", color: "teal", isSystem: false, status: "active", userCount: 6, createdAt: "2024-02-12T11:05:00" },
  { id: ROLES.TECHNICIAN, key: ROLES.TECHNICIAN, name: "Technician", description: "Executes site surveys, installations and testing, and logs daily field progress.", color: "orange", isSystem: false, status: "active", userCount: 18, createdAt: "2024-02-12T11:10:00" },
  { id: ROLES.CUSTOMER, key: ROLES.CUSTOMER, name: "Customer", description: "Self-service portal access to raise tickets, view bills and track solar production.", color: "slate", isSystem: false, status: "active", userCount: 342, createdAt: "2024-03-01T10:00:00" },
  { id: ROLES.ACCOUNTANT, key: ROLES.ACCOUNTANT, name: "Accountant", description: "Handles invoicing, payments and subsidy disbursement across every project.", color: "purple", isSystem: false, status: "active", userCount: 3, createdAt: "2024-04-18T14:30:00" },
  { id: ROLES.SUPPORT_TEAM, key: ROLES.SUPPORT_TEAM, name: "Support Team", description: "Resolves tickets, maintenance and warranty requests raised by customers.", color: "rose", isSystem: false, status: "active", userCount: 7, createdAt: "2024-05-22T16:45:00" },
];

const COLOR_MAP = { gold: "#e8a33d", indigo: "#5b5fef", teal: "#159a7c", orange: "#e8752c", slate: "#64748b", purple: "#8b5cf6", rose: "#ec6a5e" };

// Map a role's display name → canonical frontend role key so server roles
// (keyed by Mongo _id) can be matched back to the built-in role keys.
const ROLE_KEY_BY_NAME = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([key, label]) => [String(label).toLowerCase(), key])
);
const deriveRoleKey = (name) => ROLE_KEY_BY_NAME[String(name || "").toLowerCase()] || null;

// Mongoose serializes the permissions Map as a plain object of module → actions.
const normalizeServerPermissions = (perms) => {
  const out = {};
  Object.entries(perms || {}).forEach(([mod, actions]) => {
    out[mod] = {
      view: !!actions?.view,
      create: !!actions?.create,
      edit: !!actions?.edit,
      delete: !!actions?.delete,
      export: !!actions?.export,
    };
  });
  return out;
};

const icons = {
  plus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  shield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
};

function TypeBadge({ isSystem }) {
  const label = isSystem ? "System" : "Custom";
  return <span className={`pill ${isSystem ? "pill--neutral" : "pill--warning"}`}>{label}</span>;
}

function StatusPill({ status }) {
  const meta = getStatusMeta(ROLE_STATUSES, status);
  return <span className={`pill pill--${meta.tone}`}>{meta.label}</span>;
}

function RoleStatusToggle({ role, onToggleStatus, disabled }) {
  const isActive = role.status !== "inactive";
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (updating || disabled) return;
    const nextStatus = isActive ? "inactive" : "active";
    setUpdating(true);
    await onToggleStatus(role, nextStatus);
    setUpdating(false);
  };

  return (
    <button
      type="button"
      className={`rp-pill-switch ${isActive ? "rp-pill-switch--active" : "rp-pill-switch--inactive"} ${disabled ? "rp-pill-switch--disabled" : ""}`}
      onClick={handleToggle}
      disabled={updating || disabled}
      title={disabled ? "System roles cannot be deactivated" : `Click to switch status to ${isActive ? "Inactive" : "Active"}`}
      aria-label={`Status: ${isActive ? "Active" : "Inactive"}. Click to toggle.`}
    >
      <span className="rp-pill-switch-text">{isActive ? "Active" : "Inactive"}</span>
      <span className="rp-pill-switch-knob" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Permission Matrix Component                                       */
/* ------------------------------------------------------------------ */

function PermissionMatrix({ permissions = {}, onChange, readOnly }) {
  const [collapsed, setCollapsed] = useState({});
  const { toast, warning, dismiss } = useLocalToast();
  const toggleGroup = (group) => setCollapsed((c) => ({ ...c, [group]: !c[group] }));

  // "Select all" state is tracked per group and changes ONLY when the user
  // clicks it. Manually toggling individual module checkboxes must never
  // auto-fill the group's "All" box — any manual change clears the flag so
  // the box reflects the user's own action, not a derived guess. It starts
  // checked only when the group was already fully selected (e.g. editing a
  // role that was saved with that group fully granted).
  const [selectAllState, setSelectAllState] = useState(() => {
    const initial = {};
    MODULE_GROUPS.forEach(({ group, modules }) => {
      initial[group] = modules.every((m) =>
        ACTIONS.every((a) => !!(permissions[m.key] || {})[a.key])
      );
    });
    return initial;
  });

  const clearSelectAllForModule = (moduleKey) => {
    const groupDef = MODULE_GROUPS.find((g) => g.modules.some((m) => m.key === moduleKey));
    if (groupDef) {
      setSelectAllState((prev) => ({ ...prev, [groupDef.group]: false }));
    }
  };

  const setModuleAction = (moduleKey, actionKey, value) => {
    if (readOnly) return;
    const existingModulePerms = permissions[moduleKey] || noAccess();

    // Create/Edit/Delete/Export only make sense when the role can View the
    // module first — block the grant and tell the admin why.
    if (actionKey !== "view" && value === true && !existingModulePerms.view) {
      const actionLabel = ACTIONS.find((a) => a.key === actionKey)?.label || actionKey;
      const moduleLabel =
        MODULE_GROUPS.flatMap((g) => g.modules).find((m) => m.key === moduleKey)?.label || moduleKey;
      warning(
        `Cannot grant "${actionLabel}" for "${moduleLabel}" without the View permission. Please enable View first.`
      );
      return;
    }

    // Same rule in reverse: View cannot be removed while Create/Edit/Delete/
    // Export are still granted for the module.
    if (actionKey === "view" && value === false) {
      const dependent = ACTIONS.filter((a) => a.key !== "view" && !!existingModulePerms[a.key]).map((a) => a.label);
      if (dependent.length > 0) {
        const moduleLabel =
          MODULE_GROUPS.flatMap((g) => g.modules).find((m) => m.key === moduleKey)?.label || moduleKey;
        warning(
          `Cannot remove the View permission for "${moduleLabel}" while ${dependent.join(", ")} is still granted. Uncheck those first.`
        );
        return;
      }
    }

    clearSelectAllForModule(moduleKey);
    onChange({
      ...permissions,
      [moduleKey]: {
        ...existingModulePerms,
        [actionKey]: value,
      },
    });
  };

  // Grant / revoke every action for the modules inside one group
  const setGroupAll = (modules, value) => {
    if (readOnly) return;
    const next = { ...permissions };
    modules.forEach((m) => {
      next[m.key] = value ? fullAccess() : noAccess();
    });
    onChange(next);
  };

  // Grant / revoke every action for a single module (row-wise select all)
  const setRowAll = (moduleKey, value) => {
    if (readOnly) return;
    clearSelectAllForModule(moduleKey);
    onChange({
      ...permissions,
      [moduleKey]: value ? fullAccess() : noAccess(),
    });
  };

  return (
    <div className="rp-matrix">
      <div className="permission-groups">
        {MODULE_GROUPS.map(({ group, modules }) => {
          const isCollapsed = !!collapsed[group];
          return (
            <div key={group} className="perm-group">
              <div className="perm-group__header">
                <button type="button" className="perm-group__toggle" onClick={() => toggleGroup(group)}>
                  <span className={`perm-group__arrow ${isCollapsed ? "is-collapsed" : ""}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </span>
                  <span className="perm-group__title">{group}</span>
                </button>
                {!readOnly && (
                  <label className="perm-group__select-all" title={`Select all permissions in ${group}`}>
                    <input
                      type="checkbox"
                      checked={!!selectAllState[group]}
                      onChange={(e) => {
                        setSelectAllState((prev) => ({ ...prev, [group]: e.target.checked }));
                        setGroupAll(modules, e.target.checked);
                      }}
                    />
                    <span>All</span>
                  </label>
                )}
                <span className="perm-group__count">{modules.length} modules</span>
              </div>
              {!isCollapsed && (
                <div className="perm-group__body">
                  <div className="perm-row perm-row--head">
                    <div className="perm-cell perm-cell--label">
                      <span className="cell-sub" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Module</span>
                    </div>
                    <div className="perm-cell perm-cell--select-row">
                      <span className="cell-sub" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Select All</span>
                    </div>
                    {ACTIONS.map((a) => (
                      <div key={a.key} className="perm-cell perm-cell--action">
                        <span className="cell-sub" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{a.label}</span>
                      </div>
                    ))}
                  </div>
                  {modules.map((m) => {
                    const modPerms = permissions[m.key] || {};
                    const isRowAllChecked = ACTIONS.every((a) => !!modPerms[a.key]);
                    return (
                      <div key={m.key} className="perm-row">
                        <div className="perm-cell perm-cell--label">
                          <span className="cell-title">{m.label}</span>
                        </div>
                        <div className="perm-cell perm-cell--select-row">
                          <input
                            type="checkbox"
                            checked={isRowAllChecked}
                            disabled={readOnly}
                            onChange={(e) => setRowAll(m.key, e.target.checked)}
                            title={`Select all permissions for ${m.label}`}
                            style={{ width: 16, height: 16, cursor: readOnly ? "default" : "pointer", accentColor: "#2c5364" }}
                          />
                        </div>
                        {ACTIONS.map((a) => {
                          const isChecked = !!modPerms[a.key];
                          return (
                            <div key={a.key} className="perm-cell perm-cell--action">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={readOnly}
                                onChange={(e) => setModuleAction(m.key, a.key, e.target.checked)}
                                style={{ width: 16, height: 16, cursor: readOnly ? "default" : "pointer", accentColor: "#2c5364" }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ToastRenderer toast={toast} onClose={dismiss} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Role Modal Component                                              */
/* ------------------------------------------------------------------ */

function RoleModal({ mode, role, onClose, onSave }) {
  const isReadOnly = mode === "view";
  const isNew = mode === "create";
  const [permissions, setPermissions] = useState(() => role?.permissions || buildPermissions({}, "none"));

  const formik = useFormik({
    initialValues: {
      name: role?.name || "",
      description: role?.description || "",
      status: role?.status || "active",
    },
    validationSchema: roleValidationSchema,
    onSubmit: (values) => {
      const roleId = role?.id || role?.key || `role_${values.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
      onSave({
        id: roleId,
        key: roleId,
        name: values.name.trim(),
        description: values.description.trim() || "No description provided.",
        color: role?.color || "teal",
        isSystem: role?.isSystem || false,
        status: values.status,
        userCount: role?.userCount || 0,
        permissions,
      });
    },
  });

  if (isReadOnly) {
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>{role.name}</h3>
              <span className="vm-modal-subtitle">{role.isSystem ? "System Role" : "Custom Role"}</span>
            </div>
            <button className="vm-modal-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="lm-view-section">
              <h4>Role Details</h4>
              <div className="lm-view-grid">
                <div className="lm-view-item">
                  <span className="lm-view-label">Role Name</span>
                  <span className="lm-view-value">{role.name}</span>
                </div>
                <div className="lm-view-item">
                  <span className="lm-view-label">Type</span>
                  <span className="lm-view-value">{role.isSystem ? "System" : "Custom"}</span>
                </div>
                <div className="lm-view-item">
                  <span className="lm-view-label">Status</span>
                  <span className="lm-view-value"><StatusPill status={role.status || "active"} /></span>
                </div>
                <div className="lm-view-item">
                  <span className="lm-view-label">Created</span>
                  <span className="lm-view-value">{formatDateTime(role.createdAt)}</span>
                </div>
                <div className="lm-view-item lm-view-full">
                  <span className="lm-view-label">Description</span>
                  <span className="lm-view-value">{role.description}</span>
                </div>
                <div className="lm-view-item">
                  <span className="lm-view-label">Assigned Users</span>
                  <span className="lm-view-value">{(role.userCount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="lm-view-section">
              <h4>Permissions Matrix</h4>
              <PermissionMatrix permissions={role.permissions} onChange={() => {}} readOnly />
            </div>
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>
            {isNew ? icons.plus : icons.shield}
            {isNew ? "Create Custom Role" : `Edit ${role.name}`}
          </h3>
          <button className="lm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form noValidate onSubmit={formik.handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group lm-form-full">
              <label>Role Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="e.g. Regional Sales Lead"
                className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
              />
              {formik.touched.name && formik.errors.name && (
                <span className="form-field-error">{formik.errors.name}</span>
              )}
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Description <span style={{ color: "#ef4444" }}>*</span></label>
              <textarea
                rows={2}
                name="description"
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Briefly describe what this role can do..."
                className={formik.touched.description && formik.errors.description ? "input-has-error" : ""}
              />
              {formik.touched.description && formik.errors.description && (
                <span className="form-field-error">{formik.errors.description}</span>
              )}
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Configure Permissions</label>
              <PermissionMatrix permissions={permissions} onChange={setPermissions} readOnly={false} />
            </div>
          </div>
          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={formik.isSubmitting}>Cancel</button>
            <button type="submit" className="lm-save-btn" disabled={formik.isSubmitting || !formik.isValid}>
              {formik.isSubmitting ? (isNew ? "Creating Role..." : "Saving Changes...") : (isNew ? "Create Role" : "Save Changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function RolePermissionManagement() {
  const navigate = useNavigate();
  const [rolePermissionsObj, setRolePermissionsObj] = useState(() => getStoredRolePermissions());
  
  const [roles, setRoles] = useState(INITIAL_DEFAULT_ROLES);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewingRole, setViewingRole] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [deletingRole, setDeletingRole] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // DB fetch lifecycle — cached roles render instantly while the database
  // refreshes in the background; offline notice shown on failure.
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast, success, error } = useLocalToast();
  const { canDo } = useAuth();
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // ── Sync roles & permissions from the backend (source of truth) ──
  // Skeletons show while the database responds; if the API is unreachable,
  // the locally-cached matrix is shown with an offline notice + retry.
  const loadRolesData = async () => {
    setLoadError(null);
    try {
      const res = await roleAPI.getAll({ limit: 100 });
      if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        // Deduplicate roles by name (case-insensitive). The RBAC matrix
        // allows only one Super Admin — if the database ever holds duplicate
        // entries (e.g. "Super Admin" vs "super admin"), keep the system
        // one and render a single row.
        const byName = new Map();
        res.data.data.forEach((r) => {
          const nameKey = String(r.name || "").trim().toLowerCase();
          const existing = byName.get(nameKey);
          if (existing && (existing.isSystem || !r.isSystem)) return;
          byName.set(nameKey, r);
        });
        const serverRoles = [...byName.values()].map((r) => {
          const key = deriveRoleKey(r.name) || r._id;
          return {
            id: key,
            key,
            serverId: r._id,
            name: r.name,
            description: r.description || "No description provided.",
            color: r.color || "slate",
            // Enforce the single-system-role invariant regardless of what the
            // API returns — only Super Admin can ever be a system role.
            isSystem: isSystemRole({ key, name: r.name }),
            status: r.status || "active",
            userCount: r.userCount ?? 0,
            createdAt: r.createdAt || null,
          };
        });
        const serverPerms = {};
        [...byName.values()].forEach((r) => {
          const key = deriveRoleKey(r.name) || r._id;
          if (r.permissions) serverPerms[key] = normalizeServerPermissions(r.permissions);
        });
        setRoles(serverRoles);
        setRolePermissionsObj((prev) => ({ ...prev, ...serverPerms }));
        // Persist the canonical list so stale localStorage flags are
        // replaced with the server truth on every load.
        saveDynamicRolesAndPermissions(serverRoles, {
          ...getStoredRolePermissions(),
          ...serverPerms,
        });
        return;
      }
      setLoadError("The server returned no roles — showing cached data.");
    } catch (err) {
      console.warn("Roles API unavailable — showing cached data:", err.message);
      setLoadError("Couldn't reach the server — showing cached data.");
    }
  };

  useEffect(() => {
    setLoading(true);
    loadRolesData().finally(() => setLoading(false));
  }, []);

  // Combine role objects with permissions matrix
  const rolesWithPermissions = useMemo(() => {
    return roles.map((r) => {
      const key = r.key || r.id;
      const perms = rolePermissionsObj[key] || DEFAULT_ROLE_PERMISSIONS[key] || buildPermissions({}, "none");
      return { ...r, permissions: perms };
    });
  }, [roles, rolePermissionsObj]);

  /* ── KPI Stats ── */
  const totalRoles = rolesWithPermissions.length;
  const systemRoles = rolesWithPermissions.filter((r) => r.isSystem).length;
  const customRoles = rolesWithPermissions.filter((r) => !r.isSystem).length;
  const activeRoles = rolesWithPermissions.filter((r) => r.status !== "inactive").length;


  const filteredRoles = useMemo(() => {
    return rolesWithPermissions.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || (r.status || "active") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rolesWithPermissions, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRoles = filteredRoles.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const handleSaveRole = async (roleData) => {
    const key = roleData.key || roleData.id;
    // Snapshot pre-change state — used to build the updated list/matrix and
    // to detect name collisions before the server-first save below.
    const prevRoles = roles;
    const prevPermissionsObj = rolePermissionsObj;
    const wasCreating = !prevRoles.some((r) => (r.key || r.id) === key);

    // ── Single Super Admin / unique name guard ──
    // Role names must be unique (case-insensitive), so only ONE Super Admin
    // can ever exist. Reject duplicates before the optimistic update so a
    // second "Super Admin" (or any same-named role) never appears in the list.
    const normalizedName = String(roleData.name || "").trim().toLowerCase();
    const duplicateName = prevRoles.some(
      (r) =>
        String(r.name || "").trim().toLowerCase() === normalizedName &&
        (r.key || r.id) !== key
    );
    if (duplicateName) {
      error(`Role name "${roleData.name}" already exists — role names must be unique`);
      return;
    }

    // Update roles list — newly created roles go to the TOP so the latest
    // record is always visible first (matches newest-first ordering).
    const updatedRolesList = wasCreating
      ? [{ id: key, key, name: roleData.name, description: roleData.description, color: roleData.color || "teal", isSystem: false, status: roleData.status || "active", userCount: 0, createdAt: new Date().toISOString() }, ...prevRoles]
      : prevRoles.map((r) => ((r.key || r.id) === key ? { ...r, name: roleData.name, description: roleData.description, color: roleData.color || r.color || "teal", status: roleData.status || r.status || "active" } : r));

    // Update permissions object
    const updatedPermissionsObj = {
      ...prevPermissionsObj,
      [key]: roleData.permissions,
    };

    const existing = prevRoles.find((r) => (r.key || r.id) === key);
    const serverId = existing?.serverId;

    const existingColor = existing?.color || roleData.color || "teal";
    const payload = {
      name: roleData.name,
      description: roleData.description,
      color: existingColor,
      isSystem: !!roleData.isSystem,
      status: roleData.status || "active",
      userCount: roleData.userCount || 0,
      permissions: roleData.permissions,
    };

 
    try {
      let saved = null;
      if (serverId) {
        const res = await roleAPI.update(serverId, payload);
        saved = res.data?.data;
      } else {
        const res = await roleAPI.create(payload);
        saved = res.data?.data;
      }
      // Attach the Mongo _id so subsequent edits update (not duplicate) the role
      const syncedRoles = updatedRolesList.map((r) =>
        (r.key || r.id) === key && saved?._id
          ? { ...r, serverId: saved._id, createdAt: saved.createdAt || r.createdAt }
          : r
      );
      setRoles(syncedRoles);
      setRolePermissionsObj(updatedPermissionsObj);
      saveDynamicRolesAndPermissions(syncedRoles, updatedPermissionsObj);
      success(wasCreating ? "Role created successfully" : "Role updated successfully");
    } catch (err) {

      console.warn("Role save failed — changes were NOT applied:", err.message);
      error(err.response?.data?.message || (wasCreating ? "Failed to create role" : "Failed to update role"));
    }

    setEditingRole(null);
  };

  const handleToggleStatus = async (roleObj, newStatus) => {
    if (roleObj.isSystem) return;
    const key = roleObj.key || roleObj.id;
    const serverId = roleObj.serverId;
    const prevRoles = roles;

    // Optimistic local update
    const updatedRolesList = prevRoles.map((r) =>
      (r.key || r.id) === key ? { ...r, status: newStatus } : r
    );
    setRoles(updatedRolesList);
    saveDynamicRolesAndPermissions(updatedRolesList, rolePermissionsObj);

    try {
      if (serverId) {
        const res = await roleAPI.update(serverId, { status: newStatus });
        const saved = res.data?.data;
        if (saved?._id) {
          const syncedRoles = updatedRolesList.map((r) =>
            (r.key || r.id) === key ? { ...r, serverId: saved._id } : r
          );
          setRoles(syncedRoles);
          saveDynamicRolesAndPermissions(syncedRoles, rolePermissionsObj);
        }
      }
      // Activate → green success toast, Deactivate → red toast — same wording
      // style as User Management's status toggle.
      if (newStatus === "active") {
        success("Role activated successfully");
      } else {
        error("Role deactivated successfully");
      }
    } catch (err) {
      if (err.response) {
        // Server rejected — roll back
        setRoles(prevRoles);
        saveDynamicRolesAndPermissions(prevRoles, rolePermissionsObj);
        error(err.response?.data?.message || "Failed to update role status");
      } else {
        console.warn("Backend status sync failed — kept local change:", err.message);
        error("Role updated locally, but backend sync failed");
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingRole) return;
    const keyToDelete = deletingRole.key || deletingRole.id;
    const serverId = deletingRole.serverId;
    // Snapshot pre-change state so a rejected delete can be rolled back exactly
    const prevRoles = roles;
    const prevPermissionsObj = rolePermissionsObj;

    const updatedRolesList = prevRoles.filter((r) => (r.key || r.id) !== keyToDelete);
    const updatedPermissionsObj = { ...prevPermissionsObj };
    delete updatedPermissionsObj[keyToDelete];

    setRoles(updatedRolesList);
    setRolePermissionsObj(updatedPermissionsObj);
    saveDynamicRolesAndPermissions(updatedRolesList, updatedPermissionsObj);

    setDeletingRole(null);
    if (viewingRole && (viewingRole.key || viewingRole.id) === keyToDelete) setViewingRole(null);

    if (serverId) {
      setDeleteLoading(true);
      try {
        await roleAPI.delete(serverId);
        success("Role deleted successfully");
      } catch (err) {
        if (err.response) {
          // Server rejected the delete — restore the role locally
          setRoles(prevRoles);
          setRolePermissionsObj(prevPermissionsObj);
          saveDynamicRolesAndPermissions(prevRoles, prevPermissionsObj);
          error(err.response?.data?.message || "Failed to delete role");
        } else {
          error("Role deleted locally, but backend delete failed");
        }
      } finally {
        setDeleteLoading(false);
      }
    } else {
      success("Role deleted successfully");
    }
  };

  const iconRoles = (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
  const iconSystem = (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
  const iconCustom = (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>);
  const iconActive = (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="role-permissions-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="rp-module">
      <header className="rp-header">
        <div>
          <h2>Roles &amp; Permissions</h2>
          <p className="rp-subtitle">Configure exactly what every role can view, create, edit, delete and export across the platform.</p>
        </div>
        {canDo("role-permissions", "create") && (
          <button type="button" className="rp-add-btn" onClick={() => setEditingRole({ mode: "create", role: null })}>
            {icons.plus} Create Role
          </button>
        )}
      </header>

      <div className="rp-stats-grid">
          <StatCard title="Total Roles" value={totalRoles.toLocaleString()} change={0} icon={iconRoles} color="blue" />
          <StatCard title="Active Roles" value={activeRoles.toLocaleString()} change={0} icon={iconActive} color="green" />
          <StatCard title="System Roles" value={systemRoles.toLocaleString()} change={0} icon={iconSystem} color="purple" />
          <StatCard title="Custom Roles" value={customRoles.toLocaleString()} change={0} icon={iconCustom} color="orange" />
      </div>

      <div className="rp-filters">
        <div className="rp-search">
          <span className="rp-search-icon">{icons.search}</span>
          <input type="text" placeholder="Search roles by name or description" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
          {search && (
            <button className="rp-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
        <div className="rp-status-filter">
          <Dropdown
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            options={statusFilterOptions(ROLE_STATUSES)}
          />
        </div>
      </div>

      {loadError && <OfflineBanner message={loadError} onRetry={loadRolesData} />}

      <div className="rp-card">
        {loading ? (
          <PageLoader minHeight="300px" />
        ) : roles.length === 0 ? (
          <ErrorState title="No roles found" message="No roles were returned from the database." onRetry={loadRolesData} />
        ) : (
        <>
        <div className="rp-table-wrapper">
          <table className="rp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Role</th>
                <th>Description</th>
                <th>Users</th>
                <th>Permissions</th>
                <th>Type</th>
                <th>Created</th>
                <th>Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={9} />
              ) : paginatedRoles.map((role, idx) => {
                const srNo = (safeCurrentPage - 1) * pageSize + idx + 1;
                const granted = grantedCount(role.permissions);
                const pct = Math.round((granted / TOTAL_PERMISSION_SLOTS) * 100);
                return (
                  <tr key={role.id || role.key}>
                    <td className="rp-sr-cell"><span className="cell-sub">{srNo}</span></td>
                    <td><span className="cell-title">{role.name}</span></td>
                    <td className="cell-sub rp-desc-cell">{role.description}</td>
                    <td><span className="cell-title">{(role.userCount || 0).toLocaleString()}</span></td>
                    <td>
                      <div className="rp-perm-cell">
                        <span className="cell-sub">{granted}/{TOTAL_PERMISSION_SLOTS}</span>
                        <div className="rp-perm-bar"><div className="rp-perm-fill" style={{ width: `${pct}%`, backgroundColor: COLOR_MAP[role.color] || "#e8a33d" }} /></div>
                      </div>
                    </td>
                    <td><TypeBadge isSystem={role.isSystem} /></td>
                    <td className="rp-created-cell"><span className="cell-sub">{formatDateTime(role.createdAt)}</span></td>
                    <td>
                      <RoleStatusToggle role={role} onToggleStatus={handleToggleStatus} disabled={role.isSystem || !canDo("role-permissions", "edit")} />
                    </td>
                    <td className="col-actions">
                      <div className="act-actions">
                        {canDo("role-permissions", "view") && (
                          <button type="button" className="act-btn act-view" onClick={() => setViewingRole(role)} title="View">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                        )}
                        <ActivityLogButton
                          module="role-permissions"
                          onClick={() => {
                            const roleId = role.serverId || role._id || role.id;
                            navigate(`/admin/role-permissions-activity/${roleId}`, {
                              state: { target: { recordId: roleId, recordLabel: role.name, module: "role-permissions" } },
                            });
                          }}
                          title="View Role Activity Log"
                        />
                        {canDo("role-permissions", "edit") && (
                          <span
                            title={role.isSystem ? "System roles cannot be edited — view only" : "Edit"}
                          >
                            <button
                              type="button"
                              className="act-btn act-edit"
                              onClick={() => setEditingRole({ mode: "edit", role })}
                              disabled={role.isSystem}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          </span>
                        )}
                        {canDo("role-permissions", "delete") && (
                          <span
                            title={role.isSystem ? "System roles cannot be deleted" : "Delete"}
                          >
                            <button
                              type="button"
                              className="act-btn act-delete"
                              onClick={() => setDeletingRole(role)}
                              disabled={role.isSystem}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedRoles.length === 0 && (
                <tr><td colSpan={9} className="empty-row">No roles match your search. Try a different keyword or clear the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rp-pagination-row">
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredRoles.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            variant="table"
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            disabled={loading}
          />
        </div>
        </>
      )}
      </div>

      {viewingRole && (
        <RoleModal mode="view" role={viewingRole} onClose={() => setViewingRole(null)} onSave={() => {}} />
      )}
      {editingRole && (
        <RoleModal mode={editingRole.mode} role={editingRole.role} onClose={() => setEditingRole(null)} onSave={handleSaveRole} />
      )}
      <ConfirmDialog
        isOpen={!!deletingRole}
        title={`Delete "${deletingRole?.name}"?`}
        message={
          deletingRole?.userCount > 0
            ? `${deletingRole.userCount} user${deletingRole.userCount === 1 ? "" : "s"} currently hold this role. They will lose all associated permissions immediately.`
            : "This role has no assigned users."
        }
        confirmLabel="Delete Role"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingRole(null)}
        loading={deleteLoading}
      />

      <ToastRenderer toast={toast} />
    </div>
  );
}
