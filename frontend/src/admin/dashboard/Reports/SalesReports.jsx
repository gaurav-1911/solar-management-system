import React, { useState, useMemo, useEffect } from "react";
import { Pagination, Dropdown, TableLoader } from "../../../components/common";
import { useToast } from "../../../components/common/Toast";
import { ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { exportPDF, exportExcel, exportSingleRowPDF } from "./exportUtils";
import { reportAPI } from "../../../services/api";
import ExportModal from "./ExportModal";
import "../../SiteSurvey/SiteSurvey.css";
import StatCard from "../StatCard/StatCard";
import { useAuth } from "../../../context/AuthContext";

const STATUS_OPTIONS = ["paid", "pending", "overdue"];
const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_MAP = {
  paid:    { label: "Paid",    cls: "ss-badge-completed" },
  pending: { label: "Pending", cls: "ss-badge-scheduled" },
  overdue: { label: "Overdue", cls: "ss-badge-cancelled" },
};

const STATUS_COLORS = { paid: "#10b981", pending: "#f59e0b", overdue: "#ef4444" };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const first = payload[0];
  const isRevenue = first?.dataKey === "revenue";
  const status = first?.payload?.status;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef2f7", borderRadius: 12, boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)", padding: "10px 14px", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {isRevenue ? label : (status ? STATUS_MAP[status]?.label || status : "")}
      </div>
      {isRevenue ? (
        <div style={{ fontSize: 15, fontWeight: 800, color: "#6366f1" }}>{formatCurrency(first.value)}</div>
      ) : (
        payload.map((p, i) => (
          <div key={`${p.dataKey}-${i}`} style={{ fontSize: 14, fontWeight: 700, color: p.color || p.payload?.fill || "#1a2332" }}>
            {`${p.value} invoices`}
          </div>
        ))
      )}
    </div>
  );
}

function formatCurrency(n) {
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

function formatDate(d) {
  if (!d) return d;
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

// Map a real billing invoice into a sales-report row.
// Status: Paid -> paid; otherwise overdue when the due date has passed.
function toReportRow(inv) {
  const date = inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : "";
  let status = "pending";
  if (inv.paymentStatus === "Paid") {
    status = "paid";
  } else {
    const due = inv.dueDate
      ? String(inv.dueDate).slice(0, 10)
      : (date ? new Date(new Date(date).getTime() + 30 * 86400000).toISOString().slice(0, 10) : "");
    if (due && due < TODAY) status = "overdue";
  }
  return {
    id: inv.invoiceNumber || inv._id,
    customer: inv.customerName || "—",
    amount: Number(inv.totalAmount) || 0,
    date,
    status,
  };
}

function downloadRowPDF(r) {
  exportSingleRowPDF({
    title: "Sales Invoice Report",
    id: r.id,
    fields: [
      { label: "Invoice No.", value: r.id },
      { label: "Customer Name", value: r.customer },
      { label: "Invoice Date", value: formatDate(r.date) },
      { label: "Total Amount", value: formatCurrency(r.amount) },
      { label: "Payment Status", value: STATUS_MAP[r.status]?.label || r.status },
    ],
    filename: `SalesReport_${r.id}`,
  });
}

export default function SalesReports() {
  const { canDo } = useAuth();
  const canExport = canDo("sales-reports", "export");
  const { success } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverStats, setServerStats] = useState({ total: 0, paid: 0, pending: 0, overdue: 0, revenue: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportModal, setExportModal] = useState({ open: false, format: "", count: 0 });
  const [exportLoading, setExportLoading] = useState(false);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 400); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    reportAPI.getSalesReport({
      page: currentPage, limit: pageSize,
      status: statusFilter !== "All" ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((res) => { if (mounted && res.data.success) { setSalesData(res.data.data || []); setServerTotal(res.data.pagination?.total || 0); if (res.data.stats) setServerStats(res.data.stats); } })
      .catch((err) => console.error("Fetch sales report error:", err))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [currentPage, pageSize, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const handleExportClick = async (format) => {
    try {
      const res = await reportAPI.getSalesReportCount({ status: statusFilter !== "All" ? statusFilter : undefined, search: debouncedSearch || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      const totalCount = res.data.count || 0;
      setExportModal({ open: true, format, count: totalCount });
    } catch { setExportModal({ open: true, format, count: filtered.length }); }
  };
  const confirmExport = async (limit, fmt) => {
    setExportLoading(true);
    try {
      const res = await reportAPI.getSalesReport({
        page: 1, limit,
        status: statusFilter !== "All" ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const exportData = res.data.data || [];
      const args = { title: "Sales Report", stats: [{ label: "Total Revenue", value: formatCurrency(serverStats.revenue) }, { label: "Total Invoices", value: serverStats.total }, { label: "Paid", value: serverStats.paid }, { label: "Overdue", value: serverStats.overdue }], columns: ["Invoice No.", "Customer Name", "Invoice Date", "Total Amount", "Payment Status"], rows: exportData.map((r) => [r.id, r.customer, formatDate(r.date), formatCurrency(r.amount), STATUS_MAP[r.status]?.label || r.status]), filename: "Sales_Report" };
      if (fmt === "pdf") { exportPDF(args); success(`PDF report exported (${exportData.length} records)`); } else { exportExcel(args); success(`Excel report exported (${exportData.length} records)`); }
    } catch { success("Export failed. Please try again."); }
    setExportLoading(false);
    setExportModal({ open: false, format: "", count: 0 });
  };

  const filtered = salesData;
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const paginated = filtered;
  const stats = serverStats;

  const monthlyRevenueData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const month = r.date.substring(0, 7);
      map[month] = (map[month] || 0) + r.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => {
        const [y, m] = month.split("-");
        const label = new Date(y, m - 1).toLocaleString("en", { month: "short", year: "2-digit" });
        return { month: label, revenue };
      });
  }, [filtered]);

  const statusCountData = useMemo(() => {
    const counts = { paid: 0, pending: 0, overdue: 0 };
    filtered.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] += 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [filtered]);

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Sales Reports</h1>
          <p className="ss-subtitle">Track revenue performance, invoices, and payment status across all sales.</p>
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
          title="Total Revenue"
          value={formatCurrency(stats.revenue)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>}
          color="green"
        />
        <StatCard
          title="Total Invoices"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
        <StatCard
          title="Paid"
          value={stats.paid.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Overdue"
          value={stats.overdue.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="ss-charts-row">
        <div className="ss-chart-card">
          <div className="ss-chart-head">
            <h4 className="ss-chart-title">Revenue by Month</h4>
            <span className="ss-chart-total">{formatCurrency(stats.revenue)}</span>
          </div>
          <div className="ss-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyRevenueData} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="revAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={6} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.07)" }} />
                <Bar dataKey="revenue" fill="url(#revBarGrad)" radius={[10, 10, 4, 4]} barSize={38} maxBarSize={56} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revAreaGrad)" dot={{ r: 4, fill: "#ffffff", stroke: "#6366f1", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="ss-chart-card">
          <h4 className="ss-chart-title">Invoices by Payment Status</h4>
          <div className="ss-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusCountData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={4}
                  cornerRadius={8}
                  stroke="none"
                >
                  {statusCountData.map((d) => (
                    <Cell key={d.status} fill={STATUS_COLORS[d.status] || "#cbd5e1"} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="ss-chart-center">
              <div className="ss-chart-center-value">{stats.total}</div>
              <div className="ss-chart-center-label">Invoices</div>
            </div>
          </div>
          <div className="ss-chart-legend">
            {statusCountData.map((d) => (
              <div key={d.status} className="ss-chart-legend-item">
                <span className="ss-chart-legend-dot" style={{ background: STATUS_COLORS[d.status] || "#cbd5e1" }} />
                {STATUS_MAP[d.status]?.label || d.status} · {d.count}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-toolbar-row">
          <div className="ss-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search by Invoice No. or Customer" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
            {search && (
              <button className="ss-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Payment Status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }))]} />
          <div className="ss-date-range">
            <input type="date" className="ss-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
            <span className="ss-date-sep">—</span>
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
                <th>Invoice No.</th>
                <th>Customer Name</th>
                <th>Invoice Date</th>
                <th>Total Amount</th>
                <th>Payment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={6} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan="6" className="ss-empty">
                    <div className="ss-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                      <p>No records found</p>
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
                        <span className="ss-td-name-text">{r.customer}</span>
                      </div>
                    </td>
                    <td>{formatDate(r.date)}</td>
                    <td className="ss-td-area">{formatCurrency(r.amount)}</td>
                    <td><span className={`ss-badge ${STATUS_MAP[r.status]?.cls}`}>{STATUS_MAP[r.status]?.label}</span></td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" title="View Invoice" onClick={() => { setSelected(r); setShowViewModal(true); }}>
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
        title="Sales Report"
        loading={exportLoading}
      />

      {/* View Modal */}
      {showViewModal && selected && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Invoice Detail — {selected.id}</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="ss-view-section">
                <h4>Invoice Information</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Invoice No.</span><span className="ss-view-value">{selected.id}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Customer Name</span><span className="ss-view-value">{selected.customer}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Invoice Date</span><span className="ss-view-value">{formatDate(selected.date)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Total Amount</span><span className="ss-view-value">{formatCurrency(selected.amount)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Payment Status</span><span className={`ss-badge ${STATUS_MAP[selected.status]?.cls}`}>{STATUS_MAP[selected.status]?.label}</span></div>
                </div>
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close" onClick={() => setShowViewModal(false)}>Close</button>
              {canExport && (
              <button className="vm-btn-primary" onClick={() => { downloadRowPDF(selected); success("PDF downloaded"); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download PDF
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
