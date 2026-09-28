import React, { useState, useEffect, useCallback } from "react";
import { activityLogAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import "./RecordActivityModal.css";

/**
 * Exact SVG icon matching the user image:
 * Counter-clockwise circular arrow around clock hour/minute hands
 */
export const HistoryIcon = ({ size = 16, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Counter-clockwise circular arrow */}
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    {/* Clock Hands */}
    <path d="M12 7v5l3 2" />
  </svg>
);

/**
 * Standalone action button for table rows or headers.
 * Dynamically checks if the user has `export` (Download/View Log) permission for `module`.
 * If permission is not granted, the button is hidden automatically.
 */
export const ActivityLogButton = ({ onClick, title = "View Activity Log", className = "", module }) => {
  const { canDo } = useAuth();
  if (module && !canDo(module, "export")) {
    return null;
  }
  return (
    <button
      type="button"
      className={`act-btn act-history ${className}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <HistoryIcon size={16} />
    </button>
  );
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatVal = (val) => {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "True" : "False";
  if (typeof val === "object") {
    try {
      const s = JSON.stringify(val);
      return s.length > 50 ? s.substring(0, 50) + "…" : s;
    } catch {
      return String(val);
    }
  }
  const s = String(val);
  return s.length > 60 ? s.substring(0, 60) + "…" : s;
};

const RecordActivityModal = ({
  isOpen,
  onClose,
  recordId,
  recordLabel,
  module,
  title = "Activity & History Logs"
}) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fetchLogs = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      let res;
      if (recordId) {
        res = await activityLogAPI.getByRecord(recordId, { limit: 50 });
      } else if (module) {
        res = await activityLogAPI.getAll({ module, limit: 50 });
      } else {
        res = await activityLogAPI.getAll({ limit: 50 });
      }
      if (res?.data?.success) {
        const rawLogs = res.data.data || [];
        const filterActiveLifecycleLogs = (logList) => {
          if (!Array.isArray(logList) || logList.length <= 1) return logList;
          const sorted = [...logList].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          const newestCreationIdx = sorted.findIndex((l) => {
            const act = String(l.action || "").toLowerCase();
            return act.includes("create") || act.includes("add") || act.includes("new");
          });
          const newestDeletionIdx = sorted.findIndex((l) => {
            const act = String(l.action || "").toLowerCase();
            return act.includes("delete") || act.includes("remove");
          });
          if (newestCreationIdx !== -1 && newestDeletionIdx !== -1 && newestCreationIdx < newestDeletionIdx) {
            return sorted.slice(0, newestDeletionIdx);
          }
          return sorted;
        };
        setLogs(filterActiveLifecycleLogs(rawLogs));
      }
    } catch (err) {
      console.error("Failed to fetch activity logs for modal:", err);
    } finally {
      setLoading(false);
    }
  }, [isOpen, recordId, module]);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, fetchLogs]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (log.summary || "").toLowerCase().includes(term) ||
      (log.userName || "").toLowerCase().includes(term) ||
      (log.action || "").toLowerCase().includes(term) ||
      (log.recordLabel || "").toLowerCase().includes(term)
    );
  });

  // Calculate statistics
  const totalCount = logs.length;
  const createdCount = logs.filter((l) => l.action === "created").length;
  const updatedCount = logs.filter((l) => l.action === "updated" || l.action === "status_change").length;
  const deletedCount = logs.filter((l) => l.action === "deleted").length;

  const handleDownloadCSV = () => {
    if (logs.length === 0) return;

    const headers = [
      "Timestamp",
      "Module",
      "Action",
      "User Name",
      "User Role",
      "Record ID / Label",
      "Description / Summary",
      "Field Changes (Old -> New)"
    ];

    const rows = logs.map((log) => {
      const changesStr = (log.changes || [])
        .map((c) => `${c.field}: (${formatVal(c.oldValue)} -> ${formatVal(c.newValue)})`)
        .join(" | ");

      return [
        new Date(log.createdAt).toLocaleString("en-IN"),
        log.module || "",
        log.action || "",
        `"${(log.userName || "").replace(/"/g, '""')}"`,
        `"${(log.userRole || "").replace(/"/g, '""')}"`,
        `"${(log.recordLabel || log.recordId || "").replace(/"/g, '""')}"`,
        `"${(log.summary || "").replace(/"/g, '""')}"`,
        `"${changesStr.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filename = `activity-logs-${recordLabel ? recordLabel.replace(/[^a-z0-9]/gi, "_") : module || "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="record-activity-modal-overlay">
      <div className="record-activity-modal">
        {/* Header */}
        <div className="ram-header">
          <div className="ram-header-left">
            <div className="ram-header-icon">
              <HistoryIcon size={20} />
            </div>
            <div>
              <h3 className="ram-header-title">{title}</h3>
              <div className="ram-header-subtitle">
                {recordLabel ? `Item: ${recordLabel}` : module ? `Module: ${module}` : "All Recent Activities"}
              </div>
            </div>
          </div>
          <div className="ram-header-actions">
            <button
              type="button"
              className="ram-btn-download"
              onClick={handleDownloadCSV}
              disabled={logs.length === 0}
              title="Download CSV Activity Log"
            >
              📥 Download Log
            </button>
            <button
              type="button"
              className="ram-btn-close"
              onClick={onClose}
              title="Close Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ram-body">
          {/* Stats Summary */}
          <div className="ram-stats-row">
            <div className="ram-stat-box">
              <span className="ram-stat-label">Total Logs</span>
              <span className="ram-stat-val">{totalCount}</span>
            </div>
            <div className="ram-stat-box created">
              <span className="ram-stat-label">New Added</span>
              <span className="ram-stat-val">{createdCount}</span>
            </div>
            <div className="ram-stat-box updated">
              <span className="ram-stat-label">Modified</span>
              <span className="ram-stat-val">{updatedCount}</span>
            </div>
            <div className="ram-stat-box deleted">
              <span className="ram-stat-label">Removed</span>
              <span className="ram-stat-val">{deletedCount}</span>
            </div>
          </div>

          {/* Search Filter */}
          <div className="ram-filter-bar">
            <input
              type="text"
              className="ram-search-input"
              placeholder="🔍 Search activity descriptions, users, actions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table Data */}
          {loading ? (
            <div className="ram-empty">Loading activity history...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="ram-empty">
              <div className="ram-empty-icon">📜</div>
              <div>No activity history found for this selection.</div>
            </div>
          ) : (
            <div className="ram-table-wrapper">
              <table className="ram-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>User & Role</th>
                    <th>Action</th>
                    <th>Summary / Description</th>
                    <th>Field Changes Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log._id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "600" }}>
                          {new Date(log.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {new Date(log.createdAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ({timeAgo(log.createdAt)})
                        </div>
                      </td>
                      <td>
                        <div className="ram-user-badge">
                          <span>👤</span> {log.userName || "System"}
                        </div>
                        <span className="ram-user-role">
                          {log.userRole ? log.userRole.replace(/_/g, " ") : "User"}
                        </span>
                      </td>
                      <td>
                        <span className={`ram-badge ${log.action}`}>
                          {log.action === "created"
                            ? "New Add"
                            : log.action === "deleted"
                            ? "Removed"
                            : log.action?.includes("convert") || (log.summary && log.summary.toLowerCase().includes("convert"))
                            ? "Converted"
                            : log.action === "status_change" || (log.changes && log.changes.some(c => String(c.field).toLowerCase() === "status"))
                            ? "Status Change"
                            : "Changed"}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: "500" }}>{log.summary}</div>
                        {log.recordLabel && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            Ref: {log.recordLabel}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: "200px" }}>
                        {log.changes && log.changes.length > 0 ? (
                          <div className="ram-diff-container">
                            {log.changes
                              .filter((ch) => {
                                if (!ch?.field) return false;
                                const f = String(ch.field).trim().toLowerCase();
                                if (["_id", "id", "__v", "password", "createdat", "updatedat", "tokenversion", "documents", "department", "refreshtoken", "resetpasswordtoken", "resetpasswordexpires"].includes(f)) return false;
                                if (typeof ch.newValue === "string" && /^[0-9a-fA-F]{24}$/.test(ch.newValue.trim())) return false;
                                return true;
                              })
                              .map((ch, idx) => (
                                <div key={idx} className="ram-diff-item">
                                  <span className="ram-diff-field">{ch.field?.replace(/_/g, " ")}:</span>
                                  {ch.oldValue !== null && ch.oldValue !== undefined && (
                                    <>
                                      <span className="ram-diff-old">{formatVal(ch.oldValue)}</span>
                                      <span className="ram-diff-arrow">→</span>
                                    </>
                                  )}
                                  <span className="ram-diff-new">{formatVal(ch.newValue)}</span>
                                </div>
                              ))}
                          </div>
                        ) : log.action === "created" ? (
                          <span className="ram-diff-added">+ New Record Created</span>
                        ) : log.action === "deleted" ? (
                          <span className="ram-diff-removed">- Record Removed</span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Standard update</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordActivityModal;
