import React, { useState, useMemo, useEffect } from "react";
import { Pagination, Dropdown, TableLoader } from "../../../components/common";
import { useToast } from "../../../components/common/Toast";
import { exportPDF, exportExcel, exportSingleRowPDF } from "./exportUtils";
import { reportAPI } from "../../../services/api";
import ExportModal from "./ExportModal";
import "../../SiteSurvey/SiteSurvey.css";
import StatCard from "../StatCard/StatCard";
import { useAuth } from "../../../context/AuthContext";

const STATUS_OPTIONS = ["completed", "in-progress", "delayed", "blocked"];

const STATUS_MAP = {
  "completed":   { label: "Completed",   cls: "ss-badge-completed" },
  "in-progress": { label: "In Progress", cls: "ss-badge-scheduled" },
  "delayed":     { label: "Delayed",     cls: "ss-badge-cancelled" },
  "blocked":     { label: "Blocked",     cls: "ss-badge-cancelled" },
};

function formatDate(d) {
  if (!d) return "\u2014";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

function formatINR(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "\u2014";
  return "\u20b9" + Number(n).toLocaleString("en-IN");
}

// Map a raw project progress record into a report row.
// Primary source: projectStatus field stored in the DB (set manually by the user).
// Fallback: derive from completionPercentage + delayStatus for older records.
function toStatus(p) {
  const raw = String(p.projectStatus || "").trim().toLowerCase();
  const modelMap = { "completed": "completed", "in progress": "in-progress", "delayed": "delayed", "blocked": "blocked" };
  if (modelMap[raw]) return modelMap[raw];
  // Fallback for legacy records without projectStatus
  if (Number(p.completionPercentage) >= 100) return "completed";
  if (p.delayStatus === "Yes") return "delayed";
  return "in-progress";
}

// Capacity is not stored on progress records; it comes from the matching
// project approval (matched by project name + customer name).
function projectKey(name, customer) {
  return `${String(name || "").trim().toLowerCase()}::${String(customer || "").trim().toLowerCase()}`;
}

function toReportRow(p, capacityByKey) {
  const cap = capacityByKey[projectKey(p.projectName, p.customerName)];
  return {
    key: p._id || p.projectId || p.projectName,
    id: p.projectId || "\u2014",
    name: p.projectName || "\u2014",
    capacity: cap ? `${cap} kW` : "\u2014",
    customer: p.customerName || "\u2014",
    startDate: p.startDate ? String(p.startDate).slice(0, 10) : "",
    progress: Number(p.completionPercentage) || 0,
    status: toStatus(p),
    budget: p.approvedBudget ?? null,
    actualCost: p.actualProjectCost ?? null,
  };
}

function downloadRowPDF(r) {
  exportSingleRowPDF({
    title: "Project Report",
    id: r.id,
    fields: [
      { label: "Project ID", value: r.id },
      { label: "Project Name", value: r.name },
      { label: "Customer Name", value: r.customer },
      { label: "Capacity", value: r.capacity },
      { label: "Start Date", value: formatDate(r.startDate) },
      { label: "Approved Budget", value: formatINR(r.budget) },
      { label: "Actual Cost", value: formatINR(r.actualCost) },
      { label: "Progress", value: `${r.progress}%` },
      { label: "Status", value: STATUS_MAP[r.status]?.label || r.status },
    ],
    filename: `ProjectReport_${r.id}`,
  });
}

export default function ProjectReports() {
  const { canDo } = useAuth();
  const canExport = canDo("project-reports", "export");
  const { success } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverStats, setServerStats] = useState({ total: 0, completed: 0, active: 0, delayed: 0, blocked: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportModal, setExportModal] = useState({ open: false, format: "", count: 0 });
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 400); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    reportAPI.getProjectReport({
      page: currentPage, limit: pageSize,
      status: statusFilter !== "All" ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((res) => { if (mounted && res.data.success) { setProjects(res.data.data || []); setServerTotal(res.data.pagination?.total || 0); if (res.data.stats) setServerStats(res.data.stats); } })
      .catch((err) => console.error("Fetch project report error:", err))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [currentPage, pageSize, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const handleExportClick = async (format) => {
    try {
      const res = await reportAPI.getProjectReportCount({ status: statusFilter !== "All" ? statusFilter : undefined, search: debouncedSearch || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      const totalCount = res.data.count || 0;
      setExportModal({ open: true, format, count: totalCount });
    } catch { setExportModal({ open: true, format, count: filtered.length }); }
  };
  const confirmExport = async (limit, fmt) => {
    setExportLoading(true);
    try {
      const res = await reportAPI.getProjectReport({
        page: 1, limit,
        status: statusFilter !== "All" ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const exportData = res.data.data || [];
      const args = { title: "Project Report", stats: [{ label: "Total Projects", value: serverStats.total }, { label: "Completed", value: serverStats.completed }, { label: "Active", value: serverStats.active }, { label: "Delayed", value: serverStats.delayed }], columns: ["Project ID", "Project Name", "Customer Name", "Capacity", "Approved Budget", "Actual Cost", "Progress", "Status"], rows: exportData.map((r) => [r.id, r.name, r.customer, r.capacity, formatINR(r.budget), formatINR(r.actualCost), r.progress + "%", STATUS_MAP[r.status]?.label || r.status]), filename: "Project_Report" };
      if (fmt === "pdf") { exportPDF(args); success(`PDF report exported (${exportData.length} records)`); } else { exportExcel(args); success(`Excel report exported (${exportData.length} records)`); }
    } catch { success("Export failed. Please try again."); }
    setExportLoading(false);
    setExportModal({ open: false, format: "", count: 0 });
  };

  const filtered = projects;
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const paginated = filtered;
  const stats = serverStats;

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Project Reports</h1>
          <p className="ss-subtitle">Track project status, progress, and milestones across all active projects.</p>
        </div>
        <div className="ss-header-actions">
          {canExport && (
          <>
          <button className="ss-btn ss-btn-primary" onClick={() => {
            handleExportClick("pdf");
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Export PDF
          </button>
          <button className="ss-btn ss-btn-primary" onClick={() => {
            handleExportClick("excel");
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export Excel
          </button>
          </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          title="Total Projects"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
        <StatCard
          title="Completed Projects"
          value={stats.completed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Active Projects"
          value={stats.active.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Delayed Projects"
          value={stats.delayed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
      </div>

      {/* Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-toolbar-row">
          <div className="ss-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search by Project ID, Name, or Customer" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
            {search && (
              <button className="ss-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "Status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }))]}
          />
          <div className="ss-date-range">
            <input type="date" className="ss-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
            <span className="ss-date-sep">&mdash;</span>
            <input type="date" className="ss-inline-date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="ss-table-card">
        <div className="ss-table-wrapper">
          <table className="ss-table">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Customer Name</th>
                <th>Capacity</th>
                <th>Approved Budget</th>
                <th>Actual Cost</th>
                <th>Progress</th>
                <th>Project Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={9} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan="9" className="ss-empty">
                    <div className="ss-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                      <p>No projects found</p>
                      <span>Try adjusting your search or filters</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.key}>
                    <td className="ss-td-id">{r.id}</td>
                    <td className="ss-td-name-text">{r.name}</td>
                    <td>{r.customer}</td>
                    <td className="ss-td-area">{r.capacity}</td>
                    <td>{formatINR(r.budget)}</td>
                    <td>{formatINR(r.actualCost)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, r.progress)}%`, height: "100%", borderRadius: 999, background: r.progress >= 100 ? "#10b981" : "#6366f1", transition: "width .4s ease" }} />
                        </div>
                        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{r.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`ss-badge ${STATUS_MAP[r.status]?.cls}`}>
                        {STATUS_MAP[r.status]?.label}
                      </span>
                    </td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" title="View Report" onClick={() => { setSelected(r); setShowViewModal(true); }}>
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
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }} />
          </div>
        )}
      </div>

      {/* Export Modal */}
      <ExportModal
        open={exportModal.open}
        onClose={() => setExportModal({ open: false, format: "", count: 0 })}
        onConfirm={confirmExport}
        totalCount={exportModal.count}
        format={exportModal.format}
        title="Project Report"
        loading={exportLoading}
      />

      {/* View Modal */}
      {showViewModal && selected && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Project Detail &mdash; {selected.id}</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="ss-view-section">
                <h4>Project Information</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Project ID</span><span className="ss-view-value">{selected.id}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Project Name</span><span className="ss-view-value">{selected.name}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Customer Name</span><span className="ss-view-value">{selected.customer}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Capacity</span><span className="ss-view-value">{selected.capacity}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Start Date</span><span className="ss-view-value">{formatDate(selected.startDate)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Approved Budget</span><span className="ss-view-value">{formatINR(selected.budget)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Actual Cost</span><span className="ss-view-value">{formatINR(selected.actualCost)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Progress</span><span className="ss-view-value">{selected.progress}%</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Project Status</span>
                    <span className={`ss-badge ${STATUS_MAP[selected.status]?.cls}`}>
                      {STATUS_MAP[selected.status]?.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close" onClick={() => setShowViewModal(false)}>Close</button>
              {canExport && (
              <button className="vm-btn-primary" onClick={() => { downloadRowPDF(selected); success("Report downloaded"); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download Report
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
