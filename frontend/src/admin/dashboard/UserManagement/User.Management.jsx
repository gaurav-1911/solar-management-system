import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ROLES, ROLE_LABELS, getStoredRolesList, getRoleLabel } from "../../../config/roles";
import { USER_STATUSES, getStatusMeta, statusFilterOptions } from "../../../config/statuses";
import { Pagination, Dropdown, ErrorState, OfflineBanner, PageLoader, TableLoader } from "../../../components/common";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import { useLocalToast, ToastRenderer } from "../../../components/common/Toast";
import StatCard from "../StatCard/StatCard";
import { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import { userValidationSchema,
  NAME_REGEX,
  EMAIL_REGEX,
  PASSWORD_REGEX,
  isValidPhone,
} from "../../../utils/AdminValidation";
import { createProfilePdf } from "../../../utils/pdfLayout";
import {
  NAME_PATTERN_MSG,
  EMAIL_REQUIRED_MSG,
  EMAIL_PATTERN_MSG,
  PHONE_PATTERN_MSG,
  PASSWORD_PATTERN_MSG,
} from "../../../utils/validationMessages";
import { userAPI, roleAPI } from "../../../services/api";
import { fetchAllPages } from "../../../utils";
import { useAuth } from "../../../context/AuthContext";
import "./User.Management.css";

/**
 * UserManagement
 * Fully dynamic user management hub for a solar management system.
 * All data is fetched from MongoDB via the API.
 * Covers employee lifecycle, roles, and activity tracking.
 */

/* --------------------------------- data --------------------------------- */

const ACTIVITY_ACTIONS = ["Login", "Profile Update", "Status Change", "Role Change", "User Created", "User Deleted", "Permission Change", "Password Reset", "Document Upload"];

// Last-fetched users are cached locally so the table renders instantly on
// every visit while the database refreshes in the background.
const USERS_CACHE_KEY = "solar_users_cache_v1";

const deriveRoleKey = (name) => {
  const match = Object.entries(ROLE_LABELS).find(
    ([, label]) => String(label).toLowerCase() === String(name || "").toLowerCase()
  );
  return match ? match[0] : null;
};

const TABS = [
  { key: "users", label: "All Users" },
  { key: "activity", label: "Activity Logs" },
];

/* ------------------------------- helpers ------------------------------- */

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, "0");
  return `${day}-${month}-${year} ${strHours}:${minutes} ${ampm}`;
}

function getRoleBadgeClass(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
    case ROLES.COMPANY_ADMIN: return "role-badge--admin";
    case ROLES.SALES_MANAGER: return "role-badge--sales";
    case ROLES.TECHNICIAN: return "role-badge--tech";
    case ROLES.ACCOUNTANT: return "role-badge--finance";
    case ROLES.SUPPORT_TEAM: return "role-badge--support";
    default: return "";
  }
}

function getInitials(name) {
  return name.split(" ").map((n) => n.charAt(0)).join("").toUpperCase().slice(0, 2);
}

function RoleBadge({ role, rolesList = [] }) {
  const customRole = rolesList.find((r) => r.key === role || r.id === role);
  const label = customRole ? customRole.label : getRoleLabel(role);
  return <span className={`role-badge ${getRoleBadgeClass(role)}`}>{label}</span>;
}

// Status definitions live in config/statuses.js — the single source of truth
// shared with the Roles & Permissions module. Only Active / Inactive exist
// end-to-end (backend enum, Joi schema, login guard and auth middleware).
function StatusPill({ status }) {
  const meta = getStatusMeta(USER_STATUSES, status);
  return <span className={`usr-status-pill usr-status-pill--${meta.tone}`}>{meta.label}</span>;
}

function StatusToggle({ user, onToggleStatus, disabled }) {
  const isActive = user.status === "active";
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (updating || disabled) return;
    const nextStatus = isActive ? "inactive" : "active";
    setUpdating(true);
    await onToggleStatus(user, nextStatus);
    setUpdating(false);
  };

  const switchTitle = disabled
    ? "You cannot change your own account status"
    : `Click to switch status to ${isActive ? "Inactive" : "Active"}`;

  return (
    <button
      type="button"
      className={`usr-pill-switch ${isActive ? "usr-pill-switch--active" : "usr-pill-switch--inactive"} ${disabled ? "usr-pill-switch--disabled" : ""}`}
      onClick={handleToggle}
      disabled={updating || disabled}
      title={switchTitle}
      aria-label={`Status: ${isActive ? "Active" : "Inactive"}. Click to toggle.`}
    >
      <span className="usr-pill-switch-text">{isActive ? "Active" : "Inactive"}</span>
      <span className="usr-pill-switch-knob" />
    </button>
  );
}

function ActivityActionPill({ action }) {
  const colorMap = {
    "Login": "#0b3d3a",
    "Profile Update": "#2563eb",
    "Status Change": "#0284c7",
    "Role Change": "#c8862a",
    "User Created": "#16a34a",
    "User Deleted": "#dc2626",
    "Permission Change": "#9333ea",
    "Password Reset": "#c1443c",
    "Document Upload": "#0891b2",
  };
  const color = colorMap[action] || "#5c6f68";
  return (
    <span className="activity-pill" style={{ background: `${color}14`, color, borderColor: `${color}30` }}>
      {action}
    </span>
  );
}

function Avatar({ name, size = 36 }) {
  return (
    <div
      className="usr-avatar"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

/* --------------------------------- icons --------------------------------- */

const icons = {
  userPlus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  eye: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  pencil: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  list: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  building: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  activity: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

/* --------------------------------- module --------------------------------- */

export default function UserManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [viewUser, setViewUser] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(10);
  const [usersPage, setUsersPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);
  // DB fetch lifecycle — error card on failure. Users render instantly from
  // the last-fetched cache while the database refreshes in the background.
  const [loadError, setLoadError] = useState(null);

  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast, success, error: toastError } = useLocalToast();
  const { canDo, user: currentUser } = useAuth();

  // The currently logged-in admin — their own account must never be
  // deactivated/deleted, otherwise the auth middleware locks them out of
  // the whole panel ("Account is inactive. Access denied.").
  const currentUserId = currentUser?._id || currentUser?.id || currentUser?.userId || null;
  const isSelfUser = (u) =>
    !!currentUserId && !!u && (u.serverId || u._id || u.id) === String(currentUserId);

  const fetchRoles = async () => {
    try {
      const res = await roleAPI.getAll({ limit: 100 });
      if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const serverRoles = res.data.data.map((r) => {
          const key = deriveRoleKey(r.name) || r.key || r.id || r._id;
          return {
            key,
            label: r.name || getRoleLabel(key),
          };
        });
        setRolesList(serverRoles);
        return;
      }
    } catch (err) {
      console.warn("Failed to fetch roles from API, falling back to local storage:", err.message);
    }
    const stored = getStoredRolesList().map((r) => ({
      key: r.key || r.id,
      label: r.name || getRoleLabel(r.key || r.id),
    }));
    setRolesList(stored);
  };

  const fetchUsers = async () => {
    try {
      // Newest users first — sort by createdAt descending so freshly created
      // accounts appear at the top of the list (not at the bottom).
      const serverUsers = (
        await fetchAllPages(userAPI.getAll, { sortField: "createdAt", sortDir: -1 })
      ).map((u) => ({
        ...u,
        serverId: u._id || u.serverId,
      }));
      setUsers(serverUsers);
    } catch (err) {
      if (err?.code !== "ERR_NETWORK" && err?.message !== "Network Error") {
        console.error("Failed to fetch users:", err.message);
      }
      setLoadError("Failed to load users. Check your connection and try again.");
    }
  };

  // Reload every dataset from the database (used by the Retry action).
  const retryLoad = () => {
    setLoadError(null);
    Promise.allSettled([
      fetchUsers(),
      fetchActivities(),
      fetchRoles(),
    ]);
  };

  const fetchActivities = async () => {
    try {
      const docs = await fetchAllPages(userAPI.getActivities);
      setActivities(docs);
    } catch (err) {
      if (err?.code !== "ERR_NETWORK" && err?.message !== "Network Error") {
        console.error("Failed to fetch activity logs:", err.message);
      }
      setActivities([]);
    }
  };

  useEffect(() => {
    // Data is always fetched from MongoDB. Cached records render instantly;
    // this background refresh swaps in the freshest database data — no
    // blocking loading UI.
    const loadAll = async () => {
      setLoadError(null);
      setLoading(true);
      await Promise.allSettled([
        fetchUsers(),
        fetchActivities(),
        fetchRoles(),
      ]);
      setLoading(false);
    };
    loadAll();

    const handleRolesUpdated = () => {
      fetchRoles();
    };

    window.addEventListener("roles-updated", handleRolesUpdated);
    return () => {
      window.removeEventListener("roles-updated", handleRolesUpdated);
    };
  }, []);

  /* ── KPI Stats ── */
  const totalUsers = users.length;
  const activeUsersCount = users.filter((u) => u.status === "active").length;
  const inactiveUsersCount = users.filter((u) => u.status === "inactive").length;
  const uniqueRoles = new Set(users.map((u) => u.role)).size;

  /* ── SVG Icons for StatCards ── */
  const iconTotalUsers = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
  const iconActiveUsers = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
  const iconInactiveUsers = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
  const iconRoles = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );

  const filteredUsers = useMemo(() => {
    let list = [...users];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.employeeId?.toLowerCase().includes(q) ||
          u.phone?.includes(q) ||
          u.designation?.toLowerCase().includes(q) ||
          // Also match by the record's own database ID(s).
          (u._id && String(u._id).toLowerCase().includes(q)) ||
          (u.id && String(u.id).toLowerCase().includes(q)) ||
          (u.serverId && String(u.serverId).toLowerCase().includes(q))
      );
    }
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (statusFilter !== "all") list = list.filter((u) => u.status === statusFilter);
    return list;
  }, [users, search, roleFilter, statusFilter]);

  const filteredActivity = useMemo(() => {
    let list = [...activities];
    if (activityFilter !== "all") {
      list = list.filter((a) => a.action === activityFilter);
    }
    if (activitySearch.trim()) {
      const q = activitySearch.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.user?.toLowerCase().includes(q) ||
          a.action?.toLowerCase().includes(q) ||
          a.detail?.toLowerCase().includes(q) ||
          a.device?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
  }, [activities, activityFilter, activitySearch]);

  // Reset activity page whenever search or filter changes
  useEffect(() => {
    setActivityPage(1);
  }, [activitySearch, activityFilter]);

  const paginatedActivity = useMemo(() => {
    const start = (activityPage - 1) * activityPageSize;
    return filteredActivity.slice(start, start + activityPageSize);
  }, [filteredActivity, activityPage, activityPageSize]);

  const activityTotalPages = Math.max(1, Math.ceil(filteredActivity.length / activityPageSize));

  const paginatedUsers = useMemo(() => {
    const start = (usersPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, usersPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  useEffect(() => {
    if (usersPage > 1 && paginatedUsers.length === 0 && filteredUsers.length > 0) {
      setUsersPage(1);
    }
  }, [usersPage, paginatedUsers.length, filteredUsers.length]);

  const handleDeleteUser = async () => {
    if (!deleteTarget || deleteLoading) return;
    // eslint-disable-next-line no-unused-vars
    const name = deleteTarget.name;
    const targetId = deleteTarget.serverId || deleteTarget._id || deleteTarget.id;
    if (isSelfUser(deleteTarget)) {
      toastError("You cannot delete your own account");
      setDeleteTarget(null);
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await userAPI.delete(targetId);
      if (res.data?.success) {
        const msg = res.data.message || "User deleted successfully";
        if (msg.includes("Note:")) {
          success(msg);
        } else {
          success("User deleted successfully");
        }
        setDeleteTarget(null);
        if (viewUser && (viewUser.serverId === targetId || viewUser._id === targetId || viewUser.id === targetId)) setViewUser(null);
        fetchUsers();
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete user");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddUserSubmit = async (userData) => {
    try {
      const res = await userAPI.create(userData);
      if (res.data?.success) {
        success(res.data?.message || "User created successfully — login credentials sent to their email");
        setShowAddUser(false);
        fetchUsers();
      } else {
        toastError(res.data?.message || "Failed to create user");
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to create user");
    }
  };

  const handleEditUserSubmit = async (userData) => {
    if (isSelfUser(userData) && userData.status === "inactive") {
      toastError("You cannot deactivate your own account");
      return;
    }
    try {
      const targetId = userData.serverId || userData._id || userData.id;
      const res = await userAPI.update(targetId, userData);
      if (res.data?.success) {
        success("User updated successfully");
        setEditingUser(null);
        fetchUsers();
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to update user");
    }
  };

  const handleToggleStatus = async (user, nextStatus) => {
    if (isSelfUser(user) && nextStatus === "inactive") {
      toastError("You cannot deactivate your own account");
      return;
    }
    const prevUsers = users;
    const userId = user.serverId || user._id || user.id;
    setUsers((prev) =>
      prev.map((u) =>
        (u.serverId || u._id || u.id) === userId ? { ...u, status: nextStatus } : u
      )
    );
    const targetId = user.serverId || user._id;
    if (targetId) {
      try {
        const res = await userAPI.update(targetId, { status: nextStatus });
        if (res.data?.success) {
          // Activate → green success toast, Deactivate → red toast.
          if (nextStatus === "active") {
            success("User activated successfully");
          } else {
            toastError("User deactivated successfully");
          }
        } else {
          setUsers(prevUsers);
          toastError(res.data?.message || "Failed to update status");
        }
      } catch (err) {
        setUsers(prevUsers);
        toastError(err.response?.data?.message || "Failed to update status");
      }
    } else {
      if (nextStatus === "active") {
        success("User activated successfully");
      } else {
        toastError("User deactivated successfully");
      }
    }
  };

  return (
    <div className="usr-module">
      <div className="usr-header">
        <div className="usr-header-left">
          <h2>User Management</h2>
          <p>Manage employees, technicians, sales staff, and admins — including roles, permissions, departments, and activity history.</p>
        </div>
        <div className="usr-header-actions">
          {canDo("users", "create") && (
            <button className="usr-add-btn" onClick={() => setShowAddUser(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add User
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Stats Grid (Dashboard-style with top border) ── */}
      <div className="usr-stats-grid">
        <StatCard
          title="Total Users"
          value={totalUsers.toLocaleString()}
          icon={iconTotalUsers}
          color="blue"
        />
        <StatCard
          title="Active Users"
          value={activeUsersCount.toLocaleString()}
          icon={iconActiveUsers}
          color="green"
        />
        <StatCard
          title="Inactive Users"
          value={inactiveUsersCount.toLocaleString()}
          icon={iconInactiveUsers}
          color="orange"
        />
        <StatCard
          title="Roles & Access"
          value={uniqueRoles.toLocaleString()}
          icon={iconRoles}
          color="purple"
        />
      </div>

      {loadError && users.length > 0 && (
        <OfflineBanner message={loadError} onRetry={retryLoad} />
      )}

      <main className="usr-content">
        {loadError && users.length === 0 ? (
          <ErrorState message={loadError} onRetry={retryLoad} />
        ) : loading ? (
          <PageLoader message="Loading user directory, please wait..." />
        ) : (
          <UsersPanel
            search={search}
            setSearch={setSearch}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onToggleStatus={handleToggleStatus}
            users={paginatedUsers}
            rolesList={rolesList}
            totalItems={filteredUsers.length}
            currentPage={usersPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setUsersPage}
            onPageSizeChange={(val) => { setPageSize(Number(val)); setUsersPage(1); }}
            onView={setViewUser}
            onEdit={setEditingUser}
            onDelete={setDeleteTarget}
            onDownloadLog={(u) => setShowLogModal(u)}
            isSelfUser={isSelfUser}
            loading={loading}
          />
        )}
      </main>

      {viewUser && (
        <UserDetailModal
          user={users.find((u) => (u.serverId || u._id || u.id) === (viewUser.serverId || viewUser._id || viewUser.id)) || viewUser}
          onClose={() => setViewUser(null)}
          activities={activities}
          rolesList={rolesList}
        />
      )}

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onSubmit={handleAddUserSubmit}
          rolesList={rolesList}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          users={users}
          onClose={() => setEditingUser(null)}
          onSubmit={handleEditUserSubmit}
          rolesList={rolesList}
          isSelfUser={isSelfUser}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete user ${deleteTarget?.name}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />
      {/* ════════ Log Details & Change Summary Modal ════════ */}
      {showLogModal && (
        <div className="cm-overlay">
          <div className="cm-view-modal" style={{ maxWidth: "550px" }}>
            <div className="cm-view-modal-header" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: "14px", marginBottom: "16px" }}>
              <div className="cm-view-modal-title">
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#1a2332" }}>
                  Log Details &amp; Change Summary
                </h3>
                <span className="cm-td-id" style={{ marginTop: "4px", display: "inline-block" }}>
                  {showLogModal.employeeId || showLogModal.name || showLogModal._id}
                </span>
              </div>
              <button className="cm-modal-close" onClick={() => setShowLogModal(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="cm-view-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
              
              {/* Change/Creation Summary */}
              <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 16px" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "600", color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Change &amp; Status Logs
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Role</span>
                    <span className="cm-status-badge cm-status-active" style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.role}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Status</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>{showLogModal.status || "active"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Joined Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.joinDate ? formatDate(showLogModal.joinDate) : (showLogModal.createdAt ? new Date(showLogModal.createdAt).toLocaleDateString("en-IN") : "—")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Last Modified</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.updatedAt ? new Date(showLogModal.updatedAt).toLocaleString("en-IN") : "No changes logged"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Log Details Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  User Account Information
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Full Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.name}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Username</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.username || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Email Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.email}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Employee ID</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.employeeId || "—"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { triggerUserLogDownload(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastRenderer toast={toast} />
    </div>
  );
}

async function triggerUserLogDownload(user) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("User Log", 14, 20);

  autoTable(doc, {
    startY: 30,
    theme: "grid",
    head: [["Field", "Value"]],
    body: [
      ["User ID", user.serverId || user._id || user.id],
      ["Employee ID", user.employeeId || "EMP-001"],
      ["Name", user.name],
      ["Username", user.username || "N/A"],
      ["Email", user.email],
      ["Phone", user.phone || "N/A"],
      ["Role", user.role],
      ["Created Date", formatDate(user.joinDate || user.createdAt)],
      ["Reports To", user.reportsTo || "None"],
      [
        "Last Login",
        user.lastLogin
          ? formatDateTime(user.lastLogin)
          : "Never",
      ],
      ["Documents on File", user.documents || 0],
    ],
  });

  doc.save(`UserLog_${user.username || user.name}.pdf`);
}

/* ----------------------------- All Users Panel ----------------------------- */

function UsersPanel({
  search, setSearch,
  roleFilter, setRoleFilter,
  statusFilter, setStatusFilter, onToggleStatus,
  users, rolesList = [], onView, onEdit, onDelete, onDownloadLog,
  totalItems, currentPage, totalPages, pageSize, onPageChange, onPageSizeChange,
  isSelfUser, loading,
}) {
  const { canDo } = useAuth();
  const navigate = useNavigate();

  return (
    <section aria-label="All users">
      {/* ── Filters ── */}
      <div className="usr-filters">
        <div className="usr-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="usr-search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="usr-filter-selects">
          <Dropdown
            value={roleFilter}
            onChange={(val) => setRoleFilter(val)}
            options={[{ value: "all", label: "All Roles" }, ...rolesList.map((r) => ({ value: r.key, label: r.label }))]}
          />
          <Dropdown
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={statusFilterOptions(USER_STATUSES)}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="usr-card">
        <div className="usr-table-wrapper">
          <table className="usr-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={5} />
              ) : users.map((user) => (
                <tr key={user.serverId || user._id || user.id || user.email}>
                  <td className="usr-td-id">{user.employeeId || (user.serverId || user._id ? `EMP-${String(user.serverId || user._id).slice(-4)}` : "EMP-001")}</td>
                  <td>
                    <div className="usr-name-cell">
                      <Avatar name={user.name} />
                      <div>
                        <span className="cell-title">{user.name}</span>
                        <div className="cell-sub">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <RoleBadge role={user.role} rolesList={rolesList} />
                  </td>
                  <td>
                    <StatusToggle user={user} onToggleStatus={onToggleStatus} disabled={isSelfUser(user) || !canDo("users", "edit")} />
                  </td>
                  <td>
                    <div className="act-actions">
                      {canDo("users", "view") && (
                        <button type="button" className="act-btn act-view" onClick={() => onView(user)} title="View">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      )}
                      <ActivityLogButton
                        module="users"
                        onClick={() => {
                          const userId = user.serverId || user._id || user.id;
                          navigate(`/admin/user-activity/${userId}`, {
                            state: { target: { recordId: userId, recordLabel: user.name, module: "users" } },
                          });
                        }}
                        title="View User Activity & Changes Log"
                      />
                      {canDo("users", "edit") && (
                        <button type="button" className="act-btn act-edit" onClick={() => onEdit(user)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                      {canDo("users", "delete") && !isSelfUser(user) && (
                        <button type="button" className="act-btn act-delete" onClick={() => onDelete(user)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="5" className="usr-empty">
                    No users match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="usr-pagination-row">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={onPageChange}
            variant="table"
            onPageSizeChange={onPageSizeChange}
            disabled={loading}
          />
        </div>
      </div>
    </section>
  );
}



/* ----------------------------- Activity Panel ----------------------------- */

function ActivityPanel({ activities, activityFilter, setActivityFilter, activitySearch, setActivitySearch, totalItems, currentPage, totalPages, pageSize, onPageChange, onPageSizeChange }) {

  return (
    <section aria-label="Activity logs">
      <div className="panel-heading">
        <h2>Activity Logs &amp; Login History</h2>
        <p>Complete audit trail of user logins, profile changes, permission updates, and system actions.</p>
      </div>

      <div className="usr-card">
        <div className="act-toolbar">
          <div className="act-toolbar-left">
            <Dropdown value={activityFilter} onChange={(val) => { setActivityFilter(val); onPageChange(1); }} options={[{ value: "all", label: "All Activities" }, ...ACTIVITY_ACTIONS.map((a) => ({ value: a, label: a }))]} variant="filter" />
            <div className="act-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Filter by user or IP"
                value={activitySearch}
                onChange={(e) => { setActivitySearch(e.target.value); onPageChange(1); }}
              />
              {activitySearch && (
                <button className="usr-search-clear" onClick={() => { setActivitySearch(""); onPageChange(1); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="act-toolbar-right">
            <span className="cell-sub">{totalItems} events logged</span>
          </div>
        </div>

        <div className="usr-table-wrapper">
          <table className="act-table">
            <thead>
              <tr>
                <th className="act-col-time">Timestamp</th>
                <th className="act-col-user">User</th>
                <th className="act-col-action">Action</th>
                <th className="act-col-detail">Details</th>
                <th className="act-col-device">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((act, index) => (
                <tr key={act._id || act.id || index}>
                  <td className="act-time-cell">{formatDateTime(act.timestamp || act.createdAt || act.updatedAt)}</td>
                  <td>
                    <span className="act-user-name">{act.user || "System User"}</span>
                  </td>
                  <td>
                    <span className={`role-badge ${act.action === "Login" ? "role-badge--tech" : act.action === "Role Change" ? "role-badge--admin" : act.action === "Permission Change" ? "role-badge--finance" : ""}`}>
                      {act.action}
                    </span>
                  </td>
                  <td className="act-detail-cell">{act.detail}</td>
                  <td className="act-device-cell" title={act.ip || act.device || "Web Session"}>
                    {act.ip || act.device || "Web Session"}
                  </td>
                </tr>
              ))}
              {activities.length === 0 && (
                <tr>
                  <td colSpan="5" className="usr-empty">
                    No activity logs match your filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="usr-pagination-row">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={onPageChange}
            variant="table"
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Bulk Panel ----------------------------- */

function BulkPanel({ users, rolesList = [], onUsersChange, onImportUsers, onSuccess, onError, canExport = true }) {
  const [importFiles, setImportFiles] = useState([]);
  const [activeAction, setActiveAction] = useState(null); // role | department

  // Super Admin is not assignable through the UI (matches Add/Edit User).
  const assignableRoles = useMemo(
    () => rolesList.filter((r) => r.key !== ROLES.SUPER_ADMIN),
    [rolesList]
  );

  const [pendingRole, setPendingRole] = useState(assignableRoles[0]?.key || ROLES.TECHNICIAN);
  const [pendingDept, setPendingDept] = useState(DEPARTMENTS[0]?.id || "sales");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rolesList.length > 0 && !assignableRoles.some((r) => r.key === pendingRole)) {
      setPendingRole(assignableRoles[0]?.key || ROLES.TECHNICIAN);
    }
  }, [rolesList, assignableRoles, pendingRole]);

  function handleFileChange(e) {
    setImportFiles(Array.from(e.target.files));
  }

  const hasUsers = users.length > 0;

  const applyRole = async () => {
    if (!hasUsers || busy) return;
    setBusy(true);
    try {
      const selectedRoleObj = rolesList.find((r) => r.key === pendingRole);
      const label = selectedRoleObj ? selectedRoleObj.label : (ROLE_LABELS[pendingRole] || pendingRole);
      const { failedCount = 0 } = (await onUsersChange(users.map((u) => ({ ...u, role: pendingRole })))) || {};
      if (failedCount > 0) {
        onError(`Role changed to "${label}" for ${users.length} user${users.length === 1 ? "" : "s"} locally, but ${failedCount} failed to sync to the server.`);
      } else {
        onSuccess(`Role changed to "${label}" for ${users.length} user${users.length === 1 ? "" : "s"}.`);
      }
      setActiveAction(null);
    } catch (err) {
      onError("Bulk update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const applyDepartment = async () => {
    if (!hasUsers || busy) return;
    setBusy(true);
    try {
      const label = getDepartmentLabel(pendingDept);
      const { failedCount = 0 } = (await onUsersChange(users.map((u) => ({ ...u, department: pendingDept })))) || {};
      if (failedCount > 0) {
        onError(`Department changed to "${label}" for ${users.length} user${users.length === 1 ? "" : "s"} locally, but ${failedCount} failed to sync to the server.`);
      } else {
        onSuccess(`Department changed to "${label}" for ${users.length} user${users.length === 1 ? "" : "s"}.`);
      }
      setActiveAction(null);
    } catch (err) {
      onError("Bulk update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  function downloadTemplate() {
    const headers = ["Employee ID", "Name", "Email", "Phone", "Role", "Department", "Designation"];
    const sample = [["EMP-101", "John Doe", "john.doe@solar.com", "+91 98765 00000", "Sales Manager", "Sales", "Sales Executive"]];
    const csv = [headers, ...sample].map((r) => r.join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── Delimited-file parser (handles quoted fields + commas inside quotes) ──
  function parseDelimited(text) {
    const probe = text.slice(0, 2000);
    const delimiter = probe.includes("\t") && !probe.includes(",") ? "\t" : ",";
    const rows = [];
    let row = [], field = "", inQuotes = false;
    const pushField = () => { row.push(field); field = ""; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        pushField();
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        pushField();
        if (row.some((c) => String(c).trim() !== "")) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    pushField();
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    return rows;
  }

  // Maps spreadsheet rows to user objects; flags invalid rows with _invalid.
  function parseImportFile(text) {
    const rows = parseDelimited(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-z]/g, ""));
    const col = (name) => { const i = headers.indexOf(name); return i >= 0 ? i : null; };
    const idx = {
      name: col("name") ?? col("fullname"),
      email: col("email"),
      phone: col("phone") ?? col("phonenumber"),
      role: col("role"),
      dept: col("department") ?? col("dept"),
      designation: col("designation") ?? col("title"),
      employeeId: col("employeeid") ?? col("empid"),
    };
    if (idx.name == null || idx.email == null) return [];
    return rows.slice(1).map((r) => {
      const get = (i) => (i == null ? "" : String(r[i] ?? "").trim());
      const email = get(idx.email).toLowerCase();
      const roleKey = getRoleKeyByLabel(get(idx.role), rolesList);
      const deptId = DEPT_ID_BY_LABEL[get(idx.dept).toLowerCase()];
      const user = {
        name: get(idx.name),
        email,
        // Normalize phone to digits (keep an optional leading +); empty rows
        // fall back to an empty string rather than junk like "Not provided".
        phone: get(idx.phone).replace(/[^+\d]/g, ""),
        role: roleKey || ROLES.TECHNICIAN,
        department: deptId || "sales",
        designation: get(idx.designation),
        status: ["active", "inactive"].includes(get(idx.status).toLowerCase()) ? get(idx.status).toLowerCase() : "active",
        employeeId: get(idx.employeeId) || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
        reportsTo: "",
        photo: null,
        lastLogin: new Date().toISOString(),
        documents: 0,
        permissions: [],
        modules: ["dashboard"],
      };
      const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (!user.name || !email || !emailOk) user._invalid = true;
      if (!roleKey) user._invalid = true;
      if (!deptId) user._invalid = true;
      // Bulk import must never create a Super Admin account.
      if (roleKey === ROLES.SUPER_ADMIN) user._invalid = true;
      return user;
    });
  }

  async function handleImport() {
    if (!importFiles.length || busy) return;
    setBusy(true);
    try {
      const text = await importFiles[0].text();
      const parsed = parseImportFile(text);
      const valid = parsed.filter((u) => !u._invalid);
      const skipped = parsed.length - valid.length;
      if (!valid.length) {
        onError(parsed.length === 0 ? "Could not read any rows. Use the sample template for the correct format." : `${skipped} row${skipped === 1 ? "" : "s"} skipped — check Name, Email, Role and Department columns.`);
        return;
      }
      const result = (await onImportUsers(valid)) || { created: 0, failed: 0 };
      const { created = 0, failed = 0 } = result;
      if (created > 0 && skipped === 0 && failed === 0) {
        onSuccess(`Imported ${created} user${created === 1 ? "" : "s"} successfully.`);
      } else if (created > 0 || failed > 0 || skipped > 0) {
        const parts = [];
        if (created > 0) parts.push(`${created} imported`);
        if (failed > 0) parts.push(`${failed} failed to save`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        onError(`Import finished — ${parts.join(", ")}. Check Name, Email, Role and Department columns for skipped/failed rows.`);
      }
      if (created > 0) setImportFiles([]);
    } catch (err) {
      onError("Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleExportCSV() {
    const headers = ["Employee ID", "Name", "Email", "Phone", "Role", "Department", "Designation", "Status", "Join Date", "Last Login"];
    const rows = users.map((u) => {
      const rObj = rolesList.find((r) => r.key === u.role);
      const rLabel = rObj ? rObj.label : (ROLE_LABELS[u.role] ?? u.role);
      return [
        u.employeeId, u.name, u.email, u.phone,
        rLabel, getDepartmentLabel(u.department),
        u.designation, u.status, u.joinDate, u.lastLogin,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Users_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    const headers = ["Employee ID", "Name", "Email", "Phone", "Role", "Department", "Designation", "Status", "Join Date", "Last Login"];
    const rows = users.map((u) => {
      const rObj = rolesList.find((r) => r.key === u.role);
      const rLabel = rObj ? rObj.label : (ROLE_LABELS[u.role] ?? u.role);
      return [
        u.employeeId, u.name, u.email, u.phone,
        rLabel, getDepartmentLabel(u.department),
        u.designation, u.status, u.joinDate, u.lastLogin,
      ];
    });
    const tsv = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    const blob = new Blob([`\uFEFF${tsv}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Users_Export_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Bulk operations">
      <div className="bulk-grid">
        <div className="bulk-card">
          <h3>
            <span className="bulk-card__icon">⬇</span>
            Export Users
          </h3>
          <p>Download all user records as an Excel spreadsheet for reporting, backups, or offline review.</p>
          <div className="bulk-card__actions">
            {canExport && (
            <button type="button" className="btn btn--primary btn--icon" onClick={handleExportExcel}>
              {icons.check}
              Export as Excel
            </button>
            )}
            {canExport && (
            <button type="button" className="btn btn--ghost btn--small" onClick={handleExportCSV}>
              Export as CSV
            </button>
            )}
          </div>
          <div className="bulk-card__info cell-sub">
            Includes: name, email, role, department, designation, status, join date, last login
          </div>
        </div>

        <div className="bulk-card">
          <h3>
            <span className="bulk-card__icon">⬆</span>
            Import Users
          </h3>
          <p>Bulk import multiple users from an Excel or CSV file with automatic validation.</p>
          <div
            className="bulk-upload-zone"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) setImportFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <input
              type="file"
              accept=".csv,.xls,.txt"
              onChange={handleFileChange}
              id="bulk-file-input"
              style={{ display: "none" }}
            />
            {importFiles.length === 0 ? (
              <label htmlFor="bulk-file-input" className="bulk-upload-placeholder">
                <span className="bulk-upload-icon">📂</span>
                <span>Drop your file here or <strong>browse</strong></span>
                <span className="cell-sub">Supports .csv and tab-separated .xls files</span>
              </label>
            ) : (
              <div className="bulk-upload-list">
                {importFiles.map((f, idx) => (
                  <div key={idx} className="bulk-upload-item">
                    <span>📊</span>
                    <div className="cell-title">{f.name}</div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setImportFiles([])}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn--primary btn--icon"
                  style={{ alignSelf: "flex-start" }}
                  onClick={handleImport}
                  disabled={busy}
                >
                  {icons.check}
                  {busy ? "Importing…" : "Upload & Import"}
                </button>
              </div>
            )}
          </div>
          <div className="bulk-card__info cell-sub">
            Download template:{" "}
            <button
              type="button"
              className="btn btn--ghost btn--small"
              style={{ display: "inline-flex" }}
              onClick={downloadTemplate}
            >
              sample-template.csv
            </button>
          </div>
        </div>

        <div className="bulk-card">
          <h3>
            <span className="bulk-card__icon">⚙️</span>
            Bulk Actions
          </h3>
          <p>Perform actions on multiple users at once — change role, or reassign department.</p>
          <div className="bulk-actions-grid">
            <button
              type="button"
              className="bulk-action-btn"
              onClick={() => setActiveAction(activeAction === "role" ? null : "role")}
              disabled={!hasUsers || busy}
              title={hasUsers ? `Change role for all ${users.length} users` : "No users available"}
            >
              <span className="bulk-action-icon bulk-icon--warning">↻</span>
              <span>Change Role</span>
            </button>
            <button
              type="button"
              className="bulk-action-btn"
              onClick={() => setActiveAction(activeAction === "department" ? null : "department")}
              disabled={!hasUsers || busy}
              title={hasUsers ? `Reassign department for all ${users.length} users` : "No users available"}
            >
              <span className="bulk-action-icon bulk-icon--info">🏢</span>
              <span>Reassign Department</span>
            </button>
          </div>

          {activeAction && (
            <div className="bulk-action-panel">
              {activeAction === "role" && (
                <>
                  <p className="bulk-action-panel__text">
                    Change role for <strong>all {users.length} user{users.length === 1 ? "" : "s"}</strong> to:
                  </p>
                  <Dropdown
                    value={pendingRole}
                    onChange={setPendingRole}
                    options={assignableRoles.map((r) => ({ value: r.key, label: r.label }))}
                    variant="form"
                  />
                  <div className="bulk-action-panel__actions">
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => setActiveAction(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn--primary btn--small" onClick={applyRole} disabled={busy}>
                      {busy ? "Applying…" : "Apply Role"}
                    </button>
                  </div>
                </>
              )}
              {activeAction === "department" && (
                <>
                  <p className="bulk-action-panel__text">
                    Reassign <strong>all {users.length} user{users.length === 1 ? "" : "s"}</strong> to department:
                  </p>
                  <Dropdown
                    value={pendingDept}
                    onChange={setPendingDept}
                    options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.label }))}
                    variant="form"
                  />
                  <div className="bulk-action-panel__actions">
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => setActiveAction(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn--primary btn--small" onClick={applyDepartment} disabled={busy}>
                      {busy ? "Applying…" : "Reassign"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------- User Detail Modal -------------------------- */

function UserDetailModal({ user, onClose, activities = [], rolesList = [] }) {
  const userId = user.serverId || user._id || user.id;
  const userActivity = activities
    .filter((a) => a.userId === userId || a.userId === user._id || a.userId === user.serverId)
    .slice(0, 8);

  function downloadUserLog() {
    const roleObj = rolesList.find((r) => r.key === user.role);
    const roleDisplay = roleObj ? roleObj.label : getRoleLabel(user.role);
    const logContent = [
      "========================================",
      "         USER LOG                       ",
      "========================================",
      "",
      `User ID           : ${user.serverId || user._id || user.id}`,
      `Employee ID       : ${user.employeeId || "EMP-001"}`,
      `Name              : ${user.name}`,
      `Username          : ${user.username || "N/A"}`,
      `Email             : ${user.email}`,
      `Phone             : ${user.phone || "N/A"}`,
      `Role              : ${roleDisplay}`,
      `Created Date      : ${formatDate(user.joinDate || user.createdAt)}`,
      `Reports To        : ${user.reportsTo || "None"}`,
      `Last Login        : ${user.lastLogin ? formatDateTime(user.lastLogin) : "Never"}`,
      `Documents on File : ${user.documents || 0}`,
      "",
      "========================================",
      `Generated on : ${new Date().toLocaleString()}`,
      "========================================",
    ].join("\n");
    const blob = new Blob([logContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `UserLog_${user.employeeId || user.serverId || user._id || user.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="vm-overlay">
      <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <div className="vm-modal-title">
            <h3>{user.name}</h3>
            <span className="vm-modal-subtitle">{user.employeeId}</span>
          </div>
          <button className="vm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="vm-view-body">
          {/* ── User Information ── */}
          <div className="lm-view-section">
            <h4>User Information</h4>
            <div className="lm-view-grid">
              <div className="lm-view-item">
                <span className="lm-view-label">Employee ID</span>
                <span className="lm-view-value">{user.employeeId}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Email</span>
                <span className="lm-view-value">{user.email}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Username</span>
                <span className="lm-view-value">{user.username || "N/A"}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Phone</span>
                <span className="lm-view-value">{user.phone}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Role Title</span>
                <span className="lm-view-value">{rolesList.find((r) => r.key === user.role)?.label || getRoleLabel(user.role)}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Status</span>
                <span className="lm-view-value"><StatusPill status={user.status || "active"} /></span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Created / Joined</span>
                <span className="lm-view-value">{formatDate(user.joinDate || user.createdAt)}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Last Login</span>
                <span className="lm-view-value">{user.lastLogin ? formatDateTime(user.lastLogin) : "Never"}</span>
              </div>
            </div>
          </div>

          {/* ── Recent Activity ── */}
          {userActivity.length > 0 && (
            <div className="lm-view-section">
              <h4>Recent Activity</h4>
              <div className="usr-timeline">
                {userActivity.map((act) => (
                  <div key={act.id} className="usr-timeline-item">
                    <div className="usr-timeline-content">
                      <div className="usr-timeline-top">
                        <ActivityActionPill action={act.action} />
                        <span className="usr-timeline-meta">{formatDateTime(act.timestamp || act.createdAt || act.updatedAt)}</span>
                      </div>
                      <p className="usr-timeline-detail">{act.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="vm-modal-footer">
          <button className="vm-btn-close" onClick={onClose}>Close</button>
          <button className="vm-btn-primary" onClick={downloadUserLog}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Download Log
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Add User Modal ----------------------------- */

// Detect whether a login identifier is an email address or a username.
function isEmailIdentifier(value) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function AddUserModal({ onClose, onSubmit, rolesList = [], departmentsList = [] }) {
  // Super Admin cannot be assigned through the UI — only the existing
  // Super Admin account holds that role.
  const assignableRoles = rolesList.filter((r) => r.key !== ROLES.SUPER_ADMIN);

  // Same Google-level regex rules as the Edit modal / backend Joi schema.
  const addUserSchema = Yup.object().shape({
    name: Yup.string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Full name cannot exceed 50 characters")
      .matches(NAME_REGEX, NAME_PATTERN_MSG)
      .required("Full name is required"),
    email: Yup.string()
      .trim()
      .max(100, "Email cannot exceed 100 characters")
      .matches(EMAIL_REGEX, EMAIL_PATTERN_MSG)
      .required(EMAIL_REQUIRED_MSG),
    phone: Yup.string()
      .test("phone", PHONE_PATTERN_MSG, isValidPhone)
      .required("Phone number is required"),
    role: Yup.string().required("Role is required"),
  });

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      phone: "",
      role: assignableRoles[0]?.key || ROLES.TECHNICIAN,
    },
    validationSchema: addUserSchema,
    onSubmit: async (values, { setSubmitting }) => {
      const autoEmpId = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
      const cleanEmail = values.email.trim().toLowerCase();
      try {
        await onSubmit({
          name: values.name.trim(),
          email: cleanEmail,
          username: cleanEmail.split("@")[0],
          phone: values.phone.trim() || "+91 98765 43210",
          role: values.role,
          status: "active",
          employeeId: autoEmpId,
          photo: null,
          lastLogin: new Date().toISOString(),
          documents: 0,
          permissions: [],
          modules: ["dashboard"],
        });
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>Add New User</h3>
          <button type="button" className="lm-modal-close" onClick={onClose} aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={formik.handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group">
              <label>Full Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="name"
                maxLength={50}
                placeholder="e.g. John Doe"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
              />
              {formik.touched.name && formik.errors.name && (
                <span className="form-field-error">{formik.errors.name}</span>
              )}
            </div>

            <div className="lm-form-group">
              <label>Email Address <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="email"
                name="email"
                maxLength={100}
                placeholder="e.g. john@solar.com"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.email && formik.errors.email ? "input-has-error" : ""}
              />
              {formik.touched.email && formik.errors.email && (
                <span className="form-field-error">{formik.errors.email}</span>
              )}
            </div>

            <div className="lm-form-group">
              <label>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="phone-input-group">
                <span className="phone-prefix">+91</span>
                <input
                  type="text"
                  name="phone"
                  maxLength={10}
                  value={formik.values.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    formik.setFieldValue("phone", val);
                  }}
                  onBlur={formik.handleBlur}
                  placeholder="98765 43210"
                  className={formik.touched.phone && formik.errors.phone ? "input-has-error" : ""}
                />
              </div>
              {formik.touched.phone && formik.errors.phone && (
                <span className="form-field-error">{formik.errors.phone}</span>
              )}
            </div>

            <div className="lm-form-group">
              <label>Default Password</label>
              <div className="lm-password-input">
                <input type="text" value="Welcome@123" readOnly />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "#64748b", lineHeight: 1.5 }}>
                This default password will be emailed to the user's address. They should change it after their first login.
              </p>
            </div>

            <div className="lm-form-group">
              <label>Role <span style={{ color: "#ef4444" }}>*</span></label>
              <Dropdown
                value={formik.values.role}
                onChange={(val) => formik.setFieldValue("role", val)}
                options={assignableRoles.map((r) => ({ value: r.key, label: r.label }))}
                variant="form"
              />
              {formik.touched.role && formik.errors.role && (
                <span className="form-field-error">{formik.errors.role}</span>
              )}
            </div>
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={formik.isSubmitting}>Cancel</button>
            <button type="submit" className="lm-save-btn" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? "Creating User..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Edit User Modal ----------------------------- */

function EditUserModal({ user, users = [], onClose, onSubmit, rolesList = [], isSelfUser }) {
  // Super Admin is not assignable through the UI. The only exception: when
  // editing a user who ALREADY holds Super Admin, keep the option in the
  // list so the dropdown can still display their current role.
  const assignableRoles = rolesList.filter(
    (r) => r.key !== ROLES.SUPER_ADMIN || user?.role === ROLES.SUPER_ADMIN
  );

  const formik = useFormik({
    initialValues: {
      name: user.name || "",
      // Show the email when available, otherwise fall back to the username.
      identifier: user.email || user.username || "",
      phone: user.phone || "",
      role: user.role || rolesList[0]?.key || ROLES.TECHNICIAN,
      status: user.status || "active",
    },
    validationSchema: userValidationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      const idValue = values.identifier.trim();
      const isEmail = isEmailIdentifier(idValue);
      try {
        await onSubmit({
          ...user,
          name: values.name.trim(),
          // Editing the single identifier only changes the field that was
          // actually edited; the other login identifier is preserved.
          email: isEmail ? idValue.toLowerCase() : user.email || "",
          username: isEmail ? user.username || "" : idValue.toLowerCase(),
          // Preserve the entered country code and digits only (strip spaces,
          // dashes and parentheses) — never force a +91 prefix.
          phone: (values.phone || "").trim().replace(/[^+\d]/g, ""),
          role: values.role,
          status: values.status,
        });
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>Edit User</h3>
          <button className="lm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form noValidate onSubmit={formik.handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group lm-form-full">
              <label>Full Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
              />
              {formik.touched.name && formik.errors.name && (
                <span className="form-field-error">{formik.errors.name}</span>
              )}
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Email Address <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="identifier"
                placeholder="e.g. amit.sharma or amit@solar.com"
                value={formik.values.identifier}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.identifier && formik.errors.identifier ? "input-has-error" : ""}
              />
              {formik.touched.identifier && formik.errors.identifier && (
                <span className="form-field-error">{formik.errors.identifier}</span>
              )}
            </div>
            <div className="lm-form-group">
              <label>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="phone-input-group">
                <span className="phone-prefix">+91</span>
                <input
                  type="text"
                  name="phone"
                  value={formik.values.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    formik.setFieldValue("phone", val);
                  }}
                  onBlur={formik.handleBlur}
                  placeholder="98765 43210"
                  className={formik.touched.phone && formik.errors.phone ? "input-has-error" : ""}
                />
              </div>
              {formik.touched.phone && formik.errors.phone && (
                <span className="form-field-error">{formik.errors.phone}</span>
              )}
            </div>
            <div className="lm-form-group">
              <label>Role <span style={{ color: "#ef4444" }}>*</span></label>
              <Dropdown
                value={formik.values.role}
                onChange={(val) => formik.setFieldValue("role", val)}
                options={assignableRoles.map((r) => ({ value: r.key, label: r.label }))}
                variant="form"
              />
            </div>
          </div>
          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={formik.isSubmitting}>Cancel</button>
            <button type="submit" className="lm-save-btn" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
