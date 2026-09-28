import React, { useState, useEffect, useMemo } from "react";
import { Pagination, Dropdown, TableLoader, PageLoader } from "../../../components/common";
import { useToast } from "../../../components/common/Toast";
import { exportPDF, exportExcel, exportSingleRowPDF } from "./exportUtils";
import { reportAPI } from "../../../services/api";
import ExportModal from "./ExportModal";
import "../../SiteSurvey/SiteSurvey.css";
import StatCard from "../StatCard/StatCard";
import { useAuth } from "../../../context/AuthContext";

const STATUS_OPTIONS = ["active", "on-leave", "inactive"];
const RATING_OPTIONS = ["Excellent", "Good", "Average", "Poor"];

const STATUS_MAP = {
  "active":   { label: "Active",   cls: "ss-badge-completed" },
  "on-leave": { label: "On Leave", cls: "ss-badge-scheduled" },
  "inactive": { label: "Inactive", cls: "ss-badge-cancelled" },
};

const RATING_MAP = {
  "Excellent": { label: "Excellent", cls: "ss-badge-completed" },
  "Good":      { label: "Good",      cls: "ss-badge-scheduled" },
  "Average":   { label: "Average",   cls: "" },
  "Poor":      { label: "Poor",      cls: "ss-badge-cancelled" },
};

// Maps the technician model's status enum onto the report's status buckets.
const mapStatus = (status) => {
  if (status === "On Leave") return "on-leave";
  if (status === "Inactive") return "inactive";
  return "active";
};

// Derives a performance rating from the task completion percentage.
const deriveRating = (pct) => {
  if (pct >= 80) return "Excellent";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Average";
  return "Poor";
};

// Attendance/task records store the human-friendly technicianId (TECH-001);
// fall back to the Mongo _id in case any record stored that instead.
const matchesTechnician = (record, tech) => {
  const recordId = String(record?.technicianId || "");
  const techId = String(tech.technicianId || "");
  const techDbId = String(tech._id || "");
  return (techId && recordId === techId) || (techDbId && recordId === techDbId);
};

const toIso = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toISOString();
};

function formatDate(d) {
  if (!d) return "\u2014";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "\u2014";
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = String(dt.getMonth() + 1).padStart(2, "0");
  return `${day}-${mon}-${dt.getFullYear()}`;
}

function downloadRowPDF(r) {
  exportSingleRowPDF({
    title: "Technician Report",
    id: r.id,
    fields: [
      { label: "Technician ID", value: r.id },
      { label: "Technician Name", value: r.name },
      { label: "Region", value: r.region },
      { label: "Tasks Assigned", value: r.tasksAssigned },
      { label: "Completed Tasks", value: r.completedTasks },
      { label: "Attendance", value: `${r.attendance}%` },
      { label: "Performance Rating", value: r.performanceRating },
      { label: "Last Activity", value: formatDate(r.lastActivity) },
      { label: "Status", value: STATUS_MAP[r.status]?.label || r.status },
    ],
    filename: `TechnicianReport_${r.id}`,
  });
}

export default function TechnicianReports() {
  const { canDo } = useAuth();
  const canExport = canDo("technician-reports", "export");
  const { success } = useToast();

  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverStats, setServerStats] = useState({ total: 0, active: 0, onLeave: 0, inactive: 0, avgCompletion: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportModal, setExportModal] = useState({ open: false, format: "", count: 0 });
  const [exportLoading, setExportLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ratingFilter, setRatingFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 400); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    reportAPI.getTechnicianReport({
      page: currentPage, limit: pageSize,
      status: statusFilter !== "All" ? statusFilter : undefined,
      rating: ratingFilter !== "All" ? ratingFilter : undefined,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((res) => { if (mounted && res.data.success) { setTechnicians(res.data.data || []); setServerTotal(res.data.pagination?.total || 0); if (res.data.stats) setServerStats(res.data.stats); } })
      .catch(() => { if (mounted) setTechnicians([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [currentPage, pageSize, statusFilter, ratingFilter, debouncedSearch, dateFrom, dateTo]);

  const handleExportClick = async (format) => {
    try {
      const res = await reportAPI.getTechnicianReportCount({ status: statusFilter !== "All" ? statusFilter : undefined, rating: ratingFilter !== "All" ? ratingFilter : undefined, search: debouncedSearch || undefined });
      const totalCount = res.data.count || 0;
      setExportModal({ open: true, format, count: totalCount });
    } catch { setExportModal({ open: true, format, count: filtered.length }); }
  };
  const confirmExport = async (limit, fmt) => {
    setExportLoading(true);
    try {
      const res = await reportAPI.getTechnicianReport({
        page: 1, limit,
        status: statusFilter !== "All" ? statusFilter : undefined,
        rating: ratingFilter !== "All" ? ratingFilter : undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const exportData = res.data.data || [];
      const args = { title: "Technician Report", stats: [{ label: "Total Technicians", value: serverStats.total }, { label: "Active", value: serverStats.active }, { label: "On Leave", value: serverStats.onLeave }, { label: "Avg Completion", value: serverStats.avgCompletion + "%" }], columns: ["ID", "Name", "Region", "Tasks Assigned", "Completed", "Attendance", "Rating", "Last Activity", "Status"], rows: exportData.map((r) => [r.id, r.name, r.region, r.tasksAssigned, r.completedTasks, r.attendance + "%", r.performanceRating, formatDate(r.lastActivity), STATUS_MAP[r.status]?.label || r.status]), filename: "Technician_Report" };
      if (fmt === "pdf") { exportPDF(args); success(`PDF report exported (${exportData.length} records)`); } else { exportExcel(args); success(`Excel report exported (${exportData.length} records)`); }
    } catch { success("Export failed. Please try again."); }
    setExportLoading(false);
    setExportModal({ open: false, format: "", count: 0 });
  };

  // Server returns processed rows directly
  const rows = technicians;

  const filtered = rows;

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const stats = useMemo(
    () => ({
      totalTechnicians: filtered.length,
      activeTechnicians: filtered.filter((r) => r.status === "active").length,
      tasksCompleted: filtered.reduce((s, r) => s + r.completedTasks, 0),
      avgAttendance:
        filtered.length > 0
          ? Math.round(
              filtered.reduce((s, r) => s + r.attendance, 0) / filtered.length,
            )
          : 0,
    }),
    [filtered],
  );

  const exportColumns = [
    "Technician ID",
    "Name",
    "Region",
    "Tasks Assigned",
    "Completed Tasks",
    "Attendance",
    "Performance",
    "Status",
  ];
  const exportRows = () =>
    filtered.map((r) => [
      r.id,
      r.name,
      r.region,
      r.tasksAssigned,
      r.completedTasks,
      `${r.attendance}%`,
      r.performanceRating,
      STATUS_MAP[r.status]?.label || r.status,
    ]);
  const exportStats = () => [
    { label: "Total Technicians", value: stats.totalTechnicians },
    { label: "Active", value: stats.activeTechnicians },
    { label: "Tasks Completed", value: stats.tasksCompleted },
    { label: "Avg Attendance", value: `${stats.avgAttendance}%` },
  ];

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Technician Reports</h1>
          <p className="ss-subtitle">
            Performance tracking and analytics for all technicians across the
            organization.
          </p>
        </div>
        <div className="ss-header-actions">
          {canExport && (
          <>
          <button
            className="ss-btn ss-btn-primary"
            onClick={() => handleExportClick("pdf")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Export PDF
          </button>
          <button
            className="ss-btn ss-btn-primary"
            onClick={() => handleExportClick("excel")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export Excel
          </button>
          </>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader minHeight="300px" />
      ) : (
        <>
          {/* Stats */}
          <div className="tech-stats-grid">
            <StatCard
              title="Total Technicians"
              value={stats.totalTechnicians.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>}
              color="blue"
            />
            <StatCard
              title="Active Technicians"
              value={stats.activeTechnicians.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
              color="green"
            />
            <StatCard
              title="Tasks Completed"
              value={stats.tasksCompleted.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              color="blue"
            />
            <StatCard
              title="Average Attendance"
              value={`${stats.avgAttendance}%`}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              color="red"
            />
          </div>

          {/* Toolbar */}
          <div className="ss-toolbar">
            <div className="ss-toolbar-row">
              <div className="ss-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input
                  type="text"
                  placeholder="Search by Technician ID or Name"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {search && (
                  <button
                    className="ss-search-clear"
                    onClick={() => {
                      setSearch("");
                      setCurrentPage(1);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "All", label: "Status" },
                  ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label })),
                ]}
              />
              <Dropdown
                value={ratingFilter}
                onChange={(val) => {
                  setRatingFilter(val);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "All", label: "Performance Rating" },
                  ...RATING_OPTIONS.map((r) => ({ value: r, label: r })),
                ]}
              />
              <div className="ss-date-range">
                <input
                  type="date"
                  className="ss-inline-date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  title="From date"
                />
                <span className="ss-date-sep">&mdash;</span>
                <input
                  type="date"
                  className="ss-inline-date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  title="To date"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="ss-table-card">
            <div className="ss-table-wrapper">
              <table className="ss-table">
                <thead>
                  <tr>
                    <th>Technician ID</th>
                    <th>Technician Name</th>
                    <th>Tasks Assigned</th>
                    <th>Completed Tasks</th>
                    <th>Attendance</th>
                    <th>Performance Rating</th>
                    <th>Last Activity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <TableLoader colSpan={9} />
                  )}
                  {!loading && paginated.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="ss-empty">
                        <div className="ss-empty-state">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                          <p>
                            {rows.length === 0
                              ? "No technicians yet — add technicians in Technician Management."
                              : "No technicians found"}
                          </p>
                          <span>Try adjusting your search or filters</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((r) => (
                      <tr key={r.id}>
                        <td className="ss-td-id">{r.id}</td>
                        <td>
                          <div className="ss-td-name-wrap">
                            <span className="ss-td-name-text">{r.name}</span>
                          </div>
                        </td>
                        <td className="ss-td-area">{r.tasksAssigned}</td>
                        <td>{r.completedTasks}</td>
                        <td>{r.attendance}%</td>
                        <td>
                          <span className={`ss-badge ${RATING_MAP[r.performanceRating]?.cls}`}>
                            {r.performanceRating}
                          </span>
                        </td>
                        <td>{formatDate(r.lastActivity)}</td>
                        <td>
                          <span className={`ss-badge ${STATUS_MAP[r.status]?.cls}`}>
                            {STATUS_MAP[r.status]?.label}
                          </span>
                        </td>
                        <td>
                          <div className="act-actions">
                            <button
                              className="act-btn act-view"
                              title="View Report"
                              onClick={() => {
                                setSelected(r);
                                setShowViewModal(true);
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="ss-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                />
              </div>
            )}
          </div>

          {/* View Modal */}
          {/* Export Modal */}
      <ExportModal
        open={exportModal.open}
        onClose={() => setExportModal({ open: false, format: "", count: 0 })}
        onConfirm={confirmExport}
        totalCount={exportModal.count}
        format={exportModal.format}
        title="Technician Report"
        loading={exportLoading}
      />

      {showViewModal && selected && (
            <div className="vm-overlay">
              <div className="vm-view-modal">
                <div className="vm-modal-header">
                  <div className="vm-modal-title">
                    <h3>Technician Detail &mdash; {selected.id}</h3>
                  </div>
                  <button
                    className="vm-modal-close"
                    onClick={() => setShowViewModal(false)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="vm-view-body">
                  <div className="ss-view-section">
                    <h4>Technician Information</h4>
                    <div className="ss-view-grid">
                      <div className="ss-view-item"><span className="ss-view-label">Technician ID</span><span className="ss-view-value">{selected.id}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Technician Name</span><span className="ss-view-value">{selected.name}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Region</span><span className="ss-view-value">{selected.region}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Experience</span><span className="ss-view-value">{selected.experience}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Join Date</span><span className="ss-view-value">{formatDate(selected.joinDate)}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Status</span><span className={`ss-badge ${STATUS_MAP[selected.status]?.cls}`}>{STATUS_MAP[selected.status]?.label}</span></div>
                      <div className="ss-view-item ss-view-item-wide"><span className="ss-view-label">Skills</span><span className="ss-view-value">{selected.skills?.length > 0 ? selected.skills.join(", ") : "\u2014"}</span></div>
                    </div>
                  </div>
                  <div className="ss-view-section">
                    <h4>Work Summary</h4>
                    <div className="ss-view-grid">
                      <div className="ss-view-item"><span className="ss-view-label">Tasks Assigned</span><span className="ss-view-value">{selected.tasksAssigned}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Completed Tasks</span><span className="ss-view-value">{selected.completedTasks}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">In Progress</span><span className="ss-view-value">{selected.inProgress}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Completion Rate</span><span className="ss-view-value">{selected.completionPct}%</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Attendance</span><span className="ss-view-value">{selected.attendance}%</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Performance Rating</span><span className={`ss-badge ${RATING_MAP[selected.performanceRating]?.cls}`}>{selected.performanceRating}</span></div>
                      <div className="ss-view-item"><span className="ss-view-label">Last Activity</span><span className="ss-view-value">{formatDate(selected.lastActivity)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="vm-modal-footer">
                  <button
                    className="vm-btn-close"
                    onClick={() => setShowViewModal(false)}
                  >
                    Close
                  </button>
                  {canExport && (
                  <button
                    className="vm-btn-primary"
                    onClick={() => {
                      downloadRowPDF(selected);
                      success("Report downloaded");
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download Report
                  </button>
                    )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
