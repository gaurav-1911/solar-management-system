import React, { useState, useMemo, useEffect } from "react";
import { Pagination, Dropdown, PageLoader } from "../../../components/common";
import { useToast } from "../../../components/common/Toast";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { exportPDF, exportExcel, exportSingleRowPDF } from "./exportUtils";
import ExportModal from "./ExportModal";
import "../../SiteSurvey/SiteSurvey.css";
import StatCard from "../StatCard/StatCard";

const INVOICE_DATA = [
  { id: "INV-2026-0142", customer: "R. Patel Residence", type: "Installation", amount: 248500, tax: 44730, total: 293230, issueDate: "2026-07-02", dueDate: "2026-08-02", status: "paid" },
  { id: "INV-2026-0143", customer: "Bhatt Textiles Pvt Ltd", type: "Product", amount: 84000, tax: 15120, total: 99120, issueDate: "2026-06-25", dueDate: "2026-07-25", status: "overdue" },
  { id: "INV-2026-0141", customer: "Joshi Residence", type: "Installation", amount: 198000, tax: 35640, total: 233640, issueDate: "2026-07-01", dueDate: "2026-08-01", status: "paid" },
  { id: "INV-2026-0140", customer: "Mehta Clinic", type: "Service", amount: 320000, tax: 57600, total: 377600, issueDate: "2026-06-28", dueDate: "2026-07-28", status: "pending" },
  { id: "INV-2026-0139", customer: "Desai Enterprises", type: "Installation", amount: 275000, tax: 49500, total: 324500, issueDate: "2026-06-20", dueDate: "2026-07-20", status: "pending" },
  { id: "INV-2026-0138", customer: "Sharma Industries", type: "Product", amount: 175000, tax: 31500, total: 206500, issueDate: "2026-06-15", dueDate: "2026-07-15", status: "paid" },
  { id: "INV-2026-0137", customer: "Goyal Sweets Shop", type: "Installation", amount: 156000, tax: 28080, total: 184080, issueDate: "2026-06-10", dueDate: "2026-07-10", status: "paid" },
  { id: "INV-2026-0136", customer: "Kumar Farm House", type: "Service", amount: 112000, tax: 20160, total: 132160, issueDate: "2026-06-05", dueDate: "2026-07-05", status: "paid" },
  { id: "INV-2026-0135", customer: "Gupta Textiles", type: "Product", amount: 145000, tax: 26100, total: 171100, issueDate: "2026-06-01", dueDate: "2026-07-01", status: "paid" },
  { id: "INV-2026-0134", customer: "Reddy Garments", type: "Installation", amount: 390000, tax: 70200, total: 460200, issueDate: "2026-05-28", dueDate: "2026-06-28", status: "overdue" },
  { id: "INV-2026-0133", customer: "Nair Hospital", type: "Service", amount: 210000, tax: 37800, total: 247800, issueDate: "2026-05-20", dueDate: "2026-06-20", status: "paid" },
  { id: "INV-2026-0132", customer: "Verma Motors", type: "Product", amount: 325000, tax: 58500, total: 383500, issueDate: "2026-05-15", dueDate: "2026-06-15", status: "overdue" },
];

const TYPE_OPTIONS = ["Installation", "Product", "Service"];
const STATUS_OPTIONS = ["paid", "pending", "overdue"];

const STATUS_MAP = {
  paid:    { label: "Paid",    cls: "ss-badge-completed" },
  pending: { label: "Pending", cls: "ss-badge-scheduled" },
  overdue: { label: "Overdue", cls: "ss-badge-cancelled" },
};

function formatCurrency(n) {
  if (n == null) return "\u20B90";
  return "\u20B9" + Number(n).toLocaleString("en-IN");
}

function formatDate(d) {
  if (!d) return "\u2014";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

function downloadRowPDF(r) {
  exportSingleRowPDF({
    title: "Financial Invoice Report",
    id: r.id,
    fields: [
      { label: "Invoice ID", value: r.id },
      { label: "Customer Name", value: r.customer },
      { label: "Invoice Type", value: r.type },
      { label: "Invoice Amount", value: formatCurrency(r.amount) },
      { label: "GST / Tax", value: formatCurrency(r.tax) },
      { label: "Total Amount", value: formatCurrency(r.total) },
      { label: "Invoice Date", value: formatDate(r.issueDate) },
      { label: "Due Date", value: formatDate(r.dueDate) },
      { label: "Payment Status", value: STATUS_MAP[r.status]?.label || r.status },
    ],
    filename: `Invoice_${r.id}`,
  });
}

export default function FinancialReports() {
  const { success } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate brief loading for table data initialization
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [exportModal, setExportModal] = useState({ open: false, format: "", count: 0 });

  const filtered = useMemo(() => {
    let result = [...INVOICE_DATA];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.id.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== "All") {
      result = result.filter((r) => r.type === typeFilter);
    }

    if (statusFilter !== "All") {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (dateFrom) result = result.filter((r) => r.issueDate >= dateFrom || r.dueDate >= dateFrom);
    if (dateTo) result = result.filter((r) => r.issueDate <= dateTo || r.dueDate <= dateTo);

    return result;
  }, [search, typeFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = useMemo(() => ({
    totalRevenue: filtered.reduce((s, inv) => inv.status === "paid" ? s + inv.total : s, 0),
    pending: filtered.reduce((s, inv) => inv.status === "pending" ? s + inv.total : s, 0),
    overdue: filtered.reduce((s, inv) => inv.status === "overdue" ? s + inv.total : s, 0),
    count: filtered.length,
  }), [filtered]);

  const monthlyRevenueData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const month = r.issueDate.substring(0, 7);
      map[month] = (map[month] || 0) + r.total;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => {
        const [y, m] = month.split("-");
        const label = new Date(y, m - 1).toLocaleString("en", { month: "short", year: "2-digit" });
        return { month: label, revenue };
      });
  }, [filtered]);

  const typeRevenueData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      map[r.type] = (map[r.type] || 0) + r.total;
    });
    return Object.entries(map).map(([type, revenue]) => ({ type, revenue }));
  }, [filtered]);

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Financial Reports</h1>
          <p className="ss-subtitle">Manage invoices, track payments, and view financial summaries.</p>
        </div>
        <div className="ss-header-actions">
          <button className="ss-btn ss-btn-primary" onClick={() => setExportModal({ open: true, format: "pdf", count: filtered.length })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Export PDF
          </button>
          <button className="ss-btn ss-btn-primary" onClick={() => setExportModal({ open: true, format: "excel", count: filtered.length })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <PageLoader minHeight="300px" />
      ) : (
        <>
      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="green"
        />
        <StatCard
          title="Pending Payments"
          value={formatCurrency(stats.pending)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Overdue Payments"
          value={formatCurrency(stats.overdue)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
        <StatCard
          title="Total Invoices"
          value={stats.count.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="ss-charts-row">
        <div className="ss-chart-card">
          <h4 className="ss-chart-title">Monthly Revenue Trend</h4>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="finRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#finRevenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="ss-chart-card">
          <h4 className="ss-chart-title">Revenue by Invoice Type</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                {typeRevenueData.map((_, i) => (
                  <Cell key={i} fill={["#3b82f6", "#10b981", "#f59e0b"][i % 3]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-toolbar-row">
          <div className="ss-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search by Invoice ID or Customer Name..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
          </div>
          <Dropdown
            value={typeFilter}
            onChange={(val) => { setTypeFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "Invoice Type" }, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t }))]}
          />
          <Dropdown
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "Payment Status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }))]}
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
                <th>Invoice ID</th>
                <th>Customer Name</th>
                <th>Invoice Type</th>
                <th>Invoice Amount</th>
                <th>GST / Tax</th>
                <th>Total Amount</th>
                <th>Due Date</th>
                <th>Payment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan="9" className="ss-empty">
                    <div className="ss-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                      <p>No invoices found</p>
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
                        <span className="ss-td-sub">{r.type}</span>
                      </div>
                    </td>
                    <td>{r.type}</td>
                    <td>{formatCurrency(r.amount)}</td>
                    <td>{formatCurrency(r.tax)}</td>
                    <td className="ss-td-area">{formatCurrency(r.total)}</td>
                    <td>{formatDate(r.dueDate)}</td>
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
        onConfirm={(limit, fmt) => {
          const exportData = filtered.slice(0, limit);
          const args = { title: "Financial Report", stats: [{ label: "Total Revenue", value: formatCurrency(stats.totalRevenue) }, { label: "Pending Payments", value: formatCurrency(stats.pending) }, { label: "Overdue Payments", value: formatCurrency(stats.overdue) }, { label: "Total Invoices", value: stats.count }], columns: ["Invoice ID", "Customer Name", "Invoice Type", "Amount", "GST/Tax", "Total", "Due Date", "Status"], rows: exportData.map((r) => [r.id, r.customer, r.type, formatCurrency(r.amount), formatCurrency(r.tax), formatCurrency(r.total), formatDate(r.dueDate), STATUS_MAP[r.status]?.label || r.status]), filename: "Financial_Report" };
          if (fmt === "pdf") { exportPDF(args); success(`PDF report exported (${exportData.length} records)`); } else { exportExcel(args); success(`Excel report exported (${exportData.length} records)`); }
          setExportModal({ open: false, format: "", count: 0 });
        }}
        totalCount={exportModal.count}
        format={exportModal.format}
        title="Financial Report"
        loading={false}
      />

      {/* View Modal */}
      {showViewModal && selected && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Invoice Detail &mdash; {selected.id}</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="ss-view-section">
                <h4>Invoice Information</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Invoice ID</span><span className="ss-view-value">{selected.id}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Customer Name</span><span className="ss-view-value">{selected.customer}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Invoice Type</span><span className="ss-view-value">{selected.type}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Payment Status</span><span className={`ss-badge ${STATUS_MAP[selected.status]?.cls}`}>{STATUS_MAP[selected.status]?.label}</span></div>
                </div>
              </div>
              <div className="ss-view-section">
                <h4>Billing Details</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Invoice Amount</span><span className="ss-view-value">{formatCurrency(selected.amount)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">GST / Tax</span><span className="ss-view-value">{formatCurrency(selected.tax)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Total Amount</span><span className="ss-view-value">{formatCurrency(selected.total)}</span></div>
                </div>
              </div>
              <div className="ss-view-section">
                <h4>Key Dates</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Invoice Date</span><span className="ss-view-value">{formatDate(selected.issueDate)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Due Date</span><span className="ss-view-value">{formatDate(selected.dueDate)}</span></div>
                </div>
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close" onClick={() => setShowViewModal(false)}>Close</button>
              <button className="vm-btn-primary" onClick={() => { downloadRowPDF(selected); success("PDF downloaded"); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
