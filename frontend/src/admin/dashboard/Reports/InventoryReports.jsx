import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Pagination, Dropdown, TableLoader } from "../../../components/common";
import { useToast } from "../../../components/common/Toast";
import { reportAPI } from "../../../services/api";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar } from "recharts";
import { exportPDF, exportExcel, exportSingleRowPDF } from "./exportUtils";
import { sortCategories } from "../../../utils/helpers";
import ExportModal from "./ExportModal";
import "../../SiteSurvey/SiteSurvey.css";
import StatCard from "../StatCard/StatCard";
import { useAuth } from "../../../context/AuthContext";

// Inventory categories as defined by the Inventory module's model.
const CATEGORY_OPTIONS = ["Panels", "Inverters", "Batteries", "Accessories", "Mounting", "Wiring", "Controllers"];
// Dropdown display order — alphabetical.
const SORTED_CATEGORY_OPTIONS = sortCategories(CATEGORY_OPTIONS);
const STATUS_OPTIONS = ["in-stock", "low-stock", "out-of-stock"];

// Stock status is not stored on the record — it is derived from quantity vs
// the minimum-stock threshold (same rule as the Inventory module).
const deriveStatus = (item) => {
  if (item.quantity <= 0) return "out-of-stock";
  if (item.quantity < item.minStock) return "low-stock";
  return "in-stock";
};

// Map an API inventory record into the shape the report's table/charts use.
const mapItem = (item) => {
  const updateDate = item.lastRestocked || item.updatedAt;
  return {
    sku: item.sku || item.invId || item._id,
    name: item.name,
    id: item.invId || item._id,
    category: item.category,
    stock: item.quantity || 0,
    reserved: 0,
    unitPrice: item.unitPrice || 0,
    status: deriveStatus(item),
    updateDate: updateDate ? String(updateDate).slice(0, 10) : "",
    location: item.location || "",
    supplier: item.supplier || "",
    minStock: item.minStock || 0,
  };
};


const STATUS_MAP = {
  "in-stock":     { label: "In Stock",     cls: "ss-badge-completed" },
  "low-stock":    { label: "Low Stock",    cls: "ss-badge-scheduled" },
  "out-of-stock": { label: "Out of Stock", cls: "ss-badge-cancelled" },
};

// Colors for the modern charts.
const STATUS_COLORS = {
  "in-stock": "#10b981",
  "low-stock": "#f59e0b",
  "out-of-stock": "#ef4444",
};

// Recharts tooltip shared by the charts.
const ChartTip = ({ active, payload, prefix = "", suffix = "" }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, boxShadow: "0 6px 18px rgba(0,0,0,.08)" }}>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color || (p.payload && p.payload.fill) || "#6366f1" }} />
          <span style={{ color: "#6b7280" }}>{p.name}: </span>
          <b>{prefix}{p.value.toLocaleString("en-IN")}{suffix}</b>
        </div>
      ))}
    </div>
  );
};

function formatCurrency(n) {
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

function formatNum(n) {
  return n.toLocaleString("en-IN");
}

function formatDate(d) {
  if (!d) return "\u2014";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

function downloadRowPDF(r) {
  const available = r.stock - r.reserved;
  const totalValue = r.stock * r.unitPrice;
  exportSingleRowPDF({
    title: "Inventory Item Report",
    id: r.sku,
    fields: [
      { label: "SKU", value: r.sku },
      { label: "Item Name", value: r.name },
      { label: "Item ID", value: r.id },
      { label: "Category", value: r.category },
      { label: "Total Stock", value: formatNum(r.stock) },
      { label: "Reserved Stock", value: formatNum(r.reserved) },
      { label: "Available Stock", value: formatNum(available) },
      { label: "Unit Price", value: formatCurrency(r.unitPrice) },
      { label: "Total Value", value: formatCurrency(totalValue) },
      { label: "Status", value: STATUS_MAP[r.status]?.label || r.status },
      { label: "Last Updated", value: formatDate(r.updateDate) },
    ],
    filename: `InventoryReport_${r.sku}`,
  });
}

export default function InventoryReports() {
  const { canDo } = useAuth();
  const canExport = canDo("inventory-reports", "export");
  const { success } = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverStats, setServerStats] = useState({ totalProducts: 0, totalStock: 0, lowStockItems: 0, totalValue: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exportModal, setExportModal] = useState({ open: false, format: "", count: 0 });
  const [exportLoading, setExportLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
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
    reportAPI.getInventoryReport({
      page: currentPage, limit: pageSize,
      category: categoryFilter !== "All" ? categoryFilter : undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((res) => { if (mounted && res.data.success) { setItems(res.data.data || []); setServerTotal(res.data.pagination?.total || 0); if (res.data.stats) setServerStats(res.data.stats); } })
      .catch((err) => { console.error("Fetch inventory report error:", err); setItems([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [currentPage, pageSize, categoryFilter, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const handleExportClick = async (format) => {
    try {
      const res = await reportAPI.getInventoryReportCount({ category: categoryFilter !== "All" ? categoryFilter : undefined, status: statusFilter !== "All" ? statusFilter : undefined, search: debouncedSearch || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      const totalCount = res.data.count || 0;
      setExportModal({ open: true, format, count: totalCount });
    } catch { setExportModal({ open: true, format, count: filtered.length }); }
  };
  const confirmExport = async (limit, fmt) => {
    setExportLoading(true);
    try {
      if (fmt === "pdf") {
        // Server-side PDF generation — streams PDF directly, no JSON transfer
        const res = await reportAPI.exportInventoryPDF({
          limit,
          category: categoryFilter !== "All" ? categoryFilter : undefined,
          status: statusFilter !== "All" ? statusFilter : undefined,
          search: debouncedSearch || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        // Download the blob as a file
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Inventory_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        success(`PDF report exported (${limit} records) — Server-side generation`);
      } else {
        // Excel — still uses client-side generation
        const res = await reportAPI.getInventoryReport({
          page: 1, limit,
          category: categoryFilter !== "All" ? categoryFilter : undefined,
          status: statusFilter !== "All" ? statusFilter : undefined,
          search: debouncedSearch || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        const exportData = res.data.data || [];
        const args = { title: "Inventory Report", stats: [{ label: "Total Products", value: serverStats.totalProducts }, { label: "Total Stock", value: formatNum(serverStats.totalStock) }, { label: "Low Stock Items", value: serverStats.lowStockItems }, { label: "Inventory Value", value: formatCurrency(serverStats.totalValue) }], columns: ["SKU", "Item Name", "Category", "Total Stock", "Reserved", "Available", "Unit Price", "Status"], rows: exportData.map((r) => [r.sku, r.name, r.category, formatNum(r.stock), formatNum(r.reserved), formatNum(r.stock - r.reserved), formatCurrency(r.unitPrice), STATUS_MAP[r.status]?.label || r.status]), filename: "Inventory_Report" };
        exportExcel(args);
        success(`Excel report exported (${exportData.length} records)`);
      }
    } catch (err) { console.error("Export error:", err); success("Export failed. Please try again."); }
    setExportLoading(false);
    setExportModal({ open: false, format: "", count: 0 });
  };

  const filtered = items;
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const paginated = filtered;
  const stats = serverStats;

  const stockLevelData = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      if (!map[r.category]) map[r.category] = { category: r.category, stock: 0, minStock: 0 };
      map[r.category].stock += r.stock;
      map[r.category].minStock += r.minStock;
    });
    return Object.values(map);
  }, [filtered]);

  const stockHealthPct = useMemo(() => {
    const counts = { "in-stock": 0, "low-stock": 0, "out-of-stock": 0 };
    filtered.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const total = filtered.length || 1;
    return ["in-stock", "low-stock", "out-of-stock"]
      .map((status) => ({
        key: status,
        name: STATUS_MAP[status].label,
        value: Math.round((counts[status] / total) * 100),
        fill: STATUS_COLORS[status],
      }))
      .filter((d) => d.value > 0);
  }, [filtered]);

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Inventory Reports</h1>
          <p className="ss-subtitle">Track stock levels, monitor low-critical items, and manage inventory across all warehouse locations.</p>
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
      <div className="stats-grid">
        <StatCard
          title="Total Products"
          value={stats.totalProducts.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
        <StatCard
          title="Total Stock"
          value={formatNum(stats.totalStock)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockItems.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
        <StatCard
          title="Total Valuation"
          value={formatCurrency(stats.totalValue)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="ss-charts-row">
        <div className="ss-chart-card">
          <div className="ss-chart-head">
            <h4 className="ss-chart-title">Stock Levels by Category</h4>
            <span className="ss-chart-total">{formatNum(stats.totalStock)} units</span>
          </div>
          <div className="ss-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stockLevelData} margin={{ top: 14, right: 10, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="invStockGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="invMinGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={6} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip suffix=" units" />} cursor={{ stroke: "#c7d2fe", strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="stock" name="Total Stock" stroke="#6366f1" strokeWidth={2.5} fill="url(#invStockGrad)" dot={{ r: 4, fill: "#fff", stroke: "#6366f1", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Area type="monotone" dataKey="minStock" name="Minimum Required" stroke="#f59e0b" strokeWidth={2} fill="url(#invMinGrad)" dot={{ r: 3, fill: "#fff", stroke: "#f59e0b", strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="ss-chart-legend">
            <div className="ss-chart-legend-item">
              <span className="ss-chart-legend-dot" style={{ background: "#6366f1" }} />
              Total Stock
            </div>
            <div className="ss-chart-legend-item">
              <span className="ss-chart-legend-dot" style={{ background: "#f59e0b" }} />
              Minimum Required
            </div>
          </div>
        </div>
        <div className="ss-chart-card">
          <div className="ss-chart-head">
            <h4 className="ss-chart-title">Stock Health</h4>
            <span className="ss-chart-total">{filtered.length} items</span>
          </div>
          <div className="ss-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart data={stockHealthPct} innerRadius="26%" outerRadius="100%" startAngle={90} endAngle={-270} cy="50%">
                <RadialBar dataKey="value" name="Health" cornerRadius={12} background={{ fill: "#f1f5f9" }} label={{ position: "insideStart", fill: "#fff", fontSize: 11, fontWeight: 700 }} />
                <Tooltip content={<ChartTip suffix="%" />} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="ss-chart-center">
              <div className="ss-chart-center-value">{stats.lowStockItems}</div>
              <div className="ss-chart-center-label">Need Attention</div>
            </div>
          </div>
          <div className="ss-chart-legend">
            {stockHealthPct.map((d) => (
              <div key={d.key} className="ss-chart-legend-item">
                <span className="ss-chart-legend-dot" style={{ background: d.fill }} />
                {d.name} · {d.value}%
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
            <input type="text" placeholder="Search by SKU or Item Name" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
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
            value={categoryFilter}
            onChange={(val) => { setCategoryFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "Category" }, ...SORTED_CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))]}
          />
          <Dropdown
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "Stock Status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_MAP[s].label }))]}
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
                <th>SKU</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Total Stock</th>
                <th>Reserved Stock</th>
                <th>Available Stock</th>
                <th>Unit Price</th>
                <th>Stock Status</th>
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
                      <p>No inventory items found</p>
                      <span>Try adjusting your search or filters</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.sku}>
                    <td className="ss-td-id">{r.sku}</td>
                    <td>
                      <div className="ss-td-name-wrap">
                        <span className="ss-td-name-text">{r.name}</span>
                        {/* <span className="ss-td-sub">{r.id}</span> */}
                      </div>
                    </td>
                    <td>{r.category}</td>
                    <td className="ss-td-area">{formatNum(r.stock)}</td>
                    <td>{formatNum(r.reserved)}</td>
                    <td className="ss-td-area">{formatNum(r.stock - r.reserved)}</td>
                    <td>{formatCurrency(r.unitPrice)}</td>
                    <td><span className={`ss-badge ${STATUS_MAP[r.status]?.cls}`}>{STATUS_MAP[r.status]?.label}</span></td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" title="View Details" onClick={() => { setSelected(r); setShowViewModal(true); }}>
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
        title="Inventory Report"
        loading={exportLoading}
      />

      {/* View Modal */}
      {showViewModal && selected && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Item Detail &mdash; {selected.sku}</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="ss-view-section">
                <h4>Item Information</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">SKU</span><span className="ss-view-value">{selected.sku}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Item Name</span><span className="ss-view-value">{selected.name}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Item ID</span><span className="ss-view-value">{selected.id}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Category</span><span className="ss-view-value">{selected.category}</span></div>
                </div>
              </div>
              <div className="ss-view-section">
                <h4>Stock Details</h4>
                <div className="ss-view-grid">
                  <div className="ss-view-item"><span className="ss-view-label">Total Stock</span><span className="ss-view-value">{formatNum(selected.stock)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Reserved Stock</span><span className="ss-view-value">{formatNum(selected.reserved)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Available Stock</span><span className="ss-view-value">{formatNum(selected.stock - selected.reserved)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Unit Price</span><span className="ss-view-value">{formatCurrency(selected.unitPrice)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Total Value</span><span className="ss-view-value">{formatCurrency(selected.stock * selected.unitPrice)}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Stock Status</span><span className={`ss-badge ${STATUS_MAP[selected.status]?.cls}`}>{STATUS_MAP[selected.status]?.label}</span></div>
                  <div className="ss-view-item"><span className="ss-view-label">Last Updated</span><span className="ss-view-value">{formatDate(selected.updateDate)}</span></div>
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
