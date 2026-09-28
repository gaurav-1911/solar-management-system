import React, { useState, useEffect, useCallback } from "react";
import { activityLogAPI } from "../../../services/api";
import { PageLoader, Dropdown } from "../../../components/common";
import "./ActivityLogs.css";

const MODULE_OPTIONS = [
  { value: "", label: "All Modules" },
  { value: "leads", label: "Leads" },
  { value: "customers", label: "Customers" },
  { value: "quotations", label: "Quotations" },
  { value: "site-survey", label: "Site Survey" },
  { value: "solar-design", label: "Solar Design" },
  { value: "project-approval", label: "Project Approval" },
  { value: "installations", label: "Installations" },
  { value: "testing", label: "Testing" },
  { value: "project-progress", label: "Project Progress" },
  { value: "commissioning", label: "Commissioning" },
  { value: "daily-progress", label: "Daily Progress" },
  { value: "technicians", label: "Technicians" },
  { value: "attendance", label: "Attendance" },
  { value: "task-assignment", label: "Task Assignment" },
  { value: "team-schedule", label: "Team Schedule" },
  { value: "products", label: "Products" },
  { value: "product-categories", label: "Product Categories" },
  { value: "inventory", label: "Inventory" },
  { value: "vendors", label: "Vendors" },
  { value: "purchase-orders", label: "Purchase Orders" },
  { value: "vendor-payments", label: "Vendor Payments" },
  { value: "billing", label: "Billing" },
  { value: "payments", label: "Payments" },
  { value: "subsidy", label: "Subsidy" },
  { value: "maintenance", label: "Maintenance" },
  { value: "tickets", label: "Tickets" },
  { value: "warranty", label: "Warranty" },
  { value: "amc", label: "AMC" },
  { value: "users", label: "Users" },
  { value: "role-permissions", label: "Roles & Permissions" },
  { value: "departments", label: "Departments" },
  { value: "documents", label: "Documents" },
  { value: "warehouses", label: "Warehouses" },
  { value: "settings", label: "Settings" },
  { value: "auth", label: "Authentication" },
];

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "status_change", label: "Status Change" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
];

const ACTION_ICONS = {
  created: "➕",
  updated: "✏️",
  deleted: "🗑️",
  status_change: "🔄",
  login: "🔑",
  logout: "🚪",
  exported: "📥",
  password_reset: "🔐",
};

/**
 * Format a date as relative time ("2 minutes ago", "3 hours ago", etc.)
 */
const timeAgo = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Format a value for display in change diffs.
 */
const formatChangeValue = (val, fieldName = "") => {
  if (val === null || val === undefined || val === "" || val === "null") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";

  // Clean date formatting for ISO timestamp strings (e.g. "2026-08-25T00:00:00.000Z")
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}(T|\b)/.test(val.trim())) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    }
  }

  let obj = val;
  if (typeof val === "string" && (val.trim().startsWith("{") || val.trim().startsWith("["))) {
    try {
      obj = JSON.parse(val);
    } catch {
      obj = val;
    }
  }

  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return `${obj.length} items`;
    }

    const fieldLower = String(fieldName).toLowerCase();

    // Account / Auth objects — hide passwords completely!
    if (fieldLower.includes("account") || obj.password) {
      return obj.email ? `User Account Created (${obj.email})` : "User Account Created";
    }

    // Lead objects
    if (fieldLower.includes("lead") || obj.leadId) {
      const parts = [obj.leadId, obj.name, obj.email].filter(Boolean);
      return parts.length > 0 ? `Lead ${parts.join(" — ")}` : "Lead Details";
    }

    // Customer objects
    if (fieldLower.includes("customer") || obj.customerId) {
      const parts = [obj.name || obj.customerName, obj.email || obj.phone].filter(Boolean);
      return parts.length > 0 ? `Customer ${parts.join(" — ")}` : "Customer Details";
    }

    // Generic JSON objects: clean key-value summary omitting internal DB metadata keys
    const entries = Object.entries(obj)
      .filter(([k, v]) => !["_id", "__v", "createdAt", "updatedAt", "password"].includes(k) && v !== null && v !== "");

    if (entries.length === 0) return "Record Details";

    return entries
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? "..." : String(v)}`)
      .join(", ") + (entries.length > 3 ? "..." : "");
  }

  const str = String(val);
  return str.length > 100 ? str.substring(0, 100) + "…" : str;
};

const ActivityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState(new Set());

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterModule) params.module = filterModule;
      if (filterAction) params.action = filterAction;
      if (filterSearch) params.search = filterSearch;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;

      const res = await activityLogAPI.getAll(params);
      if (res.data?.success) {
        setLogs(res.data.data || []);
        setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, pages: 0 });
      }
    } catch (err) {
      console.error("Failed to fetch activity logs:", err);
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterAction, filterSearch, filterStartDate, filterEndDate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await activityLogAPI.getStats();
      if (res.data?.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch activity stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchLogs(1);
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleResetFilters = () => {
    setFilterModule("");
    setFilterAction("");
    setFilterSearch("");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;

    const headers = ["Date", "Module", "Action", "User", "Role", "Record", "Summary"];
    const rows = logs.map((log) => [
      new Date(log.createdAt).toLocaleString(),
      log.module,
      log.action,
      log.userName,
      log.userRole,
      log.recordLabel,
      `"${(log.summary || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderPagination = () => {
    const { page, pages, total } = pagination;
    if (pages <= 1) return null;

    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);

    for (let i = start; i <= end; i++) {
      buttons.push(
        <button
          key={i}
          className={i === page ? "active" : ""}
          onClick={() => fetchLogs(i)}
        >
          {i}
        </button>
      );
    }

    return (
      <div className="activity-pagination">
        <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)}>
          ← Prev
        </button>
        {start > 1 && <span className="page-info">…</span>}
        {buttons}
        {end < pages && <span className="page-info">…</span>}
        <button disabled={page >= pages} onClick={() => fetchLogs(page + 1)}>
          Next →
        </button>
        <span className="page-info">
          {total} total
        </span>
      </div>
    );
  };

  return (
    <div className="activity-logs-container">
      {/* Page Header */}
      <div className="activity-page-header">
        <div>
          <h2>📋 Activity Logs</h2>
          <div className="header-subtitle">
            Track all changes across every module — who did what, when, and what changed.
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="activity-stats-grid">
          <div className="activity-stat-card">
            <div className="activity-stat-icon total">📊</div>
            <div className="activity-stat-content">
              <h4>Total Activities</h4>
              <div className="stat-value">{stats.totalLogs?.toLocaleString() || 0}</div>
            </div>
          </div>
          <div className="activity-stat-card">
            <div className="activity-stat-icon created">➕</div>
            <div className="activity-stat-content">
              <h4>Created Today</h4>
              <div className="stat-value">{stats.todayCreated || 0}</div>
            </div>
          </div>
          <div className="activity-stat-card">
            <div className="activity-stat-icon updated">✏️</div>
            <div className="activity-stat-content">
              <h4>Updated Today</h4>
              <div className="stat-value">{stats.todayUpdated || 0}</div>
            </div>
          </div>
          <div className="activity-stat-card">
            <div className="activity-stat-icon deleted">🗑️</div>
            <div className="activity-stat-content">
              <h4>Deleted Today</h4>
              <div className="stat-value">{stats.todayDeleted || 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="activity-filter-bar">
        <Dropdown
          value={filterModule}
          onChange={(val) => setFilterModule(val)}
          options={MODULE_OPTIONS}
          placeholder="All Modules"
          variant="filter"
        />

        <Dropdown
          value={filterAction}
          onChange={(val) => setFilterAction(val)}
          options={ACTION_OPTIONS}
          placeholder="All Actions"
          variant="filter"
        />

        <input
          type="date"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
          placeholder="From date"
        />

        <input
          type="date"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          placeholder="To date"
        />

        <input
          className="filter-search"
          type="text"
          placeholder="🔍 Search activities..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchLogs(1)}
        />

        <div className="activity-filter-actions">
          <button className="btn-filter-reset" onClick={handleResetFilters}>
            Reset
          </button>
          <button className="btn-export" onClick={handleExportCSV}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Activity List */}
      {loading ? (
        <PageLoader minHeight="250px" />
      ) : logs.length === 0 ? (
        <div className="activity-empty">
          <div className="activity-empty-icon">📋</div>
          <h3>No Activity Logs Found</h3>
          <p>Activity logs will appear here as actions are performed across the system.</p>
        </div>
      ) : (
        <>
          <div className="activity-list">
            {logs.map((log) => (
              <div
                key={log._id}
                className={`activity-item action-${log.action}`}
                onClick={() => log.changes?.length > 0 && toggleExpand(log._id)}
              >
                <div className={`activity-item-icon ${log.action}`}>
                  {ACTION_ICONS[log.action] || "📝"}
                </div>
                <div className="activity-item-body">
                  <div className="activity-item-header">
                    <span className="activity-user-name">{log.userName || "System"}</span>
                    <span className={`activity-action-badge ${log.action}`}>
                      {log.action?.replace(/_/g, " ")}
                    </span>
                    <span className="activity-module-badge">
                      {log.module?.replace(/-/g, " ")}
                    </span>
                    <span className="activity-timestamp">{timeAgo(log.createdAt)}</span>
                  </div>
                  <div className="activity-summary">{log.summary}</div>
                  <div className="activity-meta">
                    {log.userRole && (
                      <span>👤 {log.userRole.replace(/_/g, " ")}</span>
                    )}
                    {log.recordLabel && (
                      <span>🏷️ {log.recordLabel}</span>
                    )}
                    {log.changes?.length > 0 && (
                      <button
                        className="activity-changes-toggle"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(log._id); }}
                      >
                        {expandedRows.has(log._id) ? "▲ Hide" : "▼ Show"} {log.changes.length} change{log.changes.length > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>

                  {/* Expandable Changes Panel */}
                  {expandedRows.has(log._id) && log.changes?.length > 0 && (
                    <div className="activity-changes-panel">
                      {log.changes
                        .filter((ch) => {
                          if (!ch?.field) return false;
                          const f = String(ch.field).trim().toLowerCase();
                          if (["_id", "id", "__v", "password", "createdat", "updatedat"].includes(f)) return false;
                          if (typeof ch.newValue === "string" && /^[0-9a-fA-F]{24}$/.test(ch.newValue.trim())) return false;
                          return true;
                        })
                        .map((ch, idx) => (
                          <div className="change-row" key={idx}>
                            <span className="change-field">{ch.field?.replace(/_/g, " ")}</span>
                            <span className="change-old">{formatChangeValue(ch.oldValue, ch.field)}</span>
                            <span className="change-arrow">→</span>
                            <span className="change-new">{formatChangeValue(ch.newValue, ch.field)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {renderPagination()}
        </>
      )}
    </div>
  );
};

export default ActivityLogs;
