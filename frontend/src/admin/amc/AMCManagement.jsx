import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { amcSchema, visitSchema } from "../../utils/AdminValidation";
import { Dropdown, Pagination, TableLoader, PageLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { amcAPI, serviceVisitAPI, customerAPI, productAPI, technicianAPI } from "../../services";
import { fetchAllPages } from "../../utils";
import { createProfilePdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./AMCManagement.css";
import "../maintenance/MaintenanceManagement.css";

/* ---------------------------------- constants ---------------------------------- */

const AMC_PLANS = [
  "Basic — 2 visits/yr",
  "Standard — 4 visits/yr",
  "Premium — 6 visits/yr",
];

const PLAN_VISITS = {
  "Basic — 2 visits/yr": 2,
  "Standard — 4 visits/yr": 4,
  "Premium — 6 visits/yr": 6,
};

// Derived contract status → display badge
const STATUS_META = {
  active: { label: "Active", tone: "amc-active" },
  expiring: { label: "Expiring Soon", tone: "amc-expiring-soon" },
  expired: { label: "Expired", tone: "amc-expired" },
};

const PLAN_BADGE = {
  "Basic — 2 visits/yr": "plan-basic",
  Basic: "plan-basic",
  "Standard — 4 visits/yr": "",
  Annual: "plan-annual",
  "Premium — 6 visits/yr": "plan-premium",
  Premium: "plan-premium",
};

/* ------------------------------------ helpers ------------------------------------ */

let idCounter = 9000;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}



function daysBetween(a, b) {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isPast(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date(todayISO()).getTime();
}

function historyEntry(action, detail = "") {
  return { id: nextId("HST"), action, detail, date: new Date().toISOString() };
}

// History entries carry a client-side `id` used for React keys; the backend
// only stores action/detail/date, so strip the extra key before sending.
function toApiHistory(history) {
  return (history || []).map(({ action, detail, date }) => ({
    action,
    detail,
    date,
  }));
}

// Convert a stored ISO date to a local-timezone YYYY-MM-DD for date inputs and
// calculations.
function toDateInput(value) {
  if (!value) return "";
  const str = String(value);
  if (str.length === 10 && !str.includes("T")) return str;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return str.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Display date in the page's DD-MM-YYYY format.
function displayDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Contract status is always derived from the end date so it stays accurate.
function amcStatus(endDate) {
  if (!endDate) return "active";
  if (isPast(endDate)) return "expired";
  return daysBetween(todayISO(), endDate) <= 30 ? "expiring" : "active";
}

// History entries stored in the DB don't carry the client-side `id` that the
// timeline uses for React keys — backfill one from the parent record.
function normalizeHistory(history, baseId) {
  return (history || []).map((h, i) => ({
    ...h,
    id: h.id || `${baseId}-H${i + 1}`,
  }));
}

// Backend documents use Mongo _id internally plus a human-friendly amcId
// (AMC-501 style) for display.
function normalizeAmc(doc) {
  const id = doc.amcId || doc._id;
  return {
    ...doc,
    id,
    startDate: toDateInput(doc.startDate),
    endDate: toDateInput(doc.endDate),
    lastService: doc.lastService ? toDateInput(doc.lastService) : "",
    nextService: doc.nextService ? toDateInput(doc.nextService) : "",
    amount: doc.amount ?? 0,
    customerId: doc.customerId || "",
    // Backend AMCs created via the UI only track `visitsUsed`, with `visits`
    // left at its default 0 — use || so a 0 never shadows the real count.
    visitsUsed: doc.visitsUsed || doc.visits || 0,
    totalVisits: doc.totalVisits || PLAN_VISITS[doc.plan] || 4,
    history: normalizeHistory(doc.history, id),
  };
}

function normalizeVisit(doc) {
  return {
    ...doc,
    id: doc.visitId || doc._id,
    date: toDateInput(doc.date),
  };
}

// Build the technician dropdown options from the live technicians API,
// always keeping "Unassigned" available as a valid assignment value.
function technicianOptions(technicians, current = "") {
  const names = [
    ...new Set(
      (technicians || [])
        .map((t) => t.name)
        .filter((n) => n && n !== "Unassigned"),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const opts = [
    { value: "Unassigned", label: "Unassigned" },
    ...names.map((n) => ({ value: n, label: n })),
  ];
  // Keep the currently-selected technician selectable even if they are no
  // longer in the fetched list.
  if (current && !opts.some((o) => o.value === current)) {
    opts.push({ value: current, label: current });
  }
  return opts;
}

/* ------------------------------------ module ------------------------------------ */

export default function AMCManagement() {
  const navigate = useNavigate();
  const { canDo } = useAuth();
  const [amcs, setAmcs] = useState([]);
  const [visits, setVisits] = useState([]);
  const [selectedAmcId, setSelectedAmcId] = useState(null);
  const [showCreateAmc, setShowCreateAmc] = useState(false);
  const [editAmcId, setEditAmcId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [logVisitAmcId, setLogVisitAmcId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const { success } = useToast();

  // Load AMC contracts with server-side pagination.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { page: currentPage, limit: pageSize };
    if (search.trim()) params.search = search.trim();
    amcAPI.getAll(params)
      .then((res) => {
        if (cancelled) return;
        const docs = res.data?.data || [];
        setAmcs(docs.map(normalizeAmc));
        setServerTotal(res.data?.pagination?.total || docs.length);
      })
      .catch((err) => console.warn("Failed to load AMC contracts:", err?.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentPage, pageSize, search]);

  // Load service visits (kept as fetchAll since visits list is typically small)
  useEffect(() => {
    let cancelled = false;
    fetchAllPages(serviceVisitAPI.getAll, { linkType: "AMC" })
      .then((docs) => { if (!cancelled) setVisits(docs.map(normalizeVisit)); })
      .catch((err) => console.warn("Failed to load AMC visits:", err?.message));
    return () => { cancelled = true; };
  }, []);

  // Load real technicians for the visit-logging dropdown.
  useEffect(() => {
    let cancelled = false;
    fetchAllPages(technicianAPI.getAll)
      .then((docs) => {
        if (!cancelled) setTechnicians(docs);
      })
      .catch((err) =>
        console.warn("Failed to load technicians:", err?.message),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  /* ------------------------------- AMC operations ------------------------------- */

  async function createAmc(data) {
    const amc = {
      id: nextId("AMC"),
      customer: data.customer,
      customerId: data.customerId || "",
      system: data.system,
      plan: data.plan,
      startDate: data.startDate || todayISO(),
      endDate: data.endDate,
      amount: Number(data.amount) || 0,
      visitsUsed: 0,
      totalVisits: PLAN_VISITS[data.plan] || 4,
      lastService: "",
      nextService: data.nextService || "",
      history: [historyEntry("AMC created", `${data.plan} activated`)],
    };
    setAmcs((prev) => [amc, ...prev]);
    setShowCreateAmc(false);
    try {
      const res = await amcAPI.create({
        customer: amc.customer,
        customerId: amc.customerId,
        system: amc.system,
        plan: amc.plan,
        startDate: amc.startDate,
        endDate: amc.endDate,
        amount: Number(amc.amount) || 0,
        nextService: amc.nextService || "",
        visitsUsed: 0,
        totalVisits: amc.totalVisits,
        history: toApiHistory(amc.history),
      });
      const saved = normalizeAmc(res.data.data);
      setAmcs((prev) => prev.map((a) => (a.id === amc.id ? saved : a)));
      success(`AMC ${saved.id} created.`);
    } catch (err) {
      console.warn("Failed to save AMC to server:", err?.message);
      success(`AMC ${amc.id} created.`);
    }
  }

  function updateAmc(id, data) {
    const existing = amcs.find((a) => a.id === id);
    setAmcs((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
    if (existing?._id) {
      amcAPI
        .update(existing._id, data)
        .then((res) => {
          const updated = normalizeAmc(res.data.data);
          setAmcs((prev) => prev.map((a) => (a.id === id ? updated : a)));
        })
        .catch((err) =>
          console.warn("Failed to update AMC on server:", err?.message),
        );
    }
    success(`AMC ${id} updated.`);
  }

  async function logAmcVisit(id, date, tech, notes) {
    const existing = amcs.find((a) => a.id === id);
    // Optimistic local visit
    const tempVisit = {
      id: `VS-${Date.now()}`,
      date: toDateInput(date),
      customer: existing?.customer || "",
      technician: tech || "Unassigned",
      linkType: "AMC",
      linkId: id,
      status: "completed",
      notes: notes || "",
    };
    setVisits((prev) => [tempVisit, ...prev]);
    setAmcs((prev) =>
      prev.map((a) => a.id === id ? { ...a, visitsUsed: a.visitsUsed + 1, lastService: todayISO() } : a)
    );
    if (existing?._id) {
      amcAPI
        .logVisit(existing._id, { date, technician: tech, notes })
        .then((res) => {
          const { visit: savedVisit, amc: updatedAmc } = res.data.data;
          const normalizedVisit = normalizeVisit(savedVisit);
          setVisits((prev) => prev.map((v) => (v.id === tempVisit.id ? normalizedVisit : v)));
          setAmcs((prev) => prev.map((a) => (a.id === id ? normalizeAmc(updatedAmc) : a)));
        })
        .catch((err) => {
          console.warn("Failed to log visit on server:", err?.message);
          // Revert optimistic update on failure
          setVisits((prev) => prev.filter((v) => v.id !== tempVisit.id));
          setAmcs((prev) =>
            prev.map((a) => a.id === id ? { ...a, visitsUsed: Math.max(0, a.visitsUsed - 1) } : a)
          );
        });
    }
    success("Visit logged against AMC.");
  }

  function renewAmc(id) {
    const existing = amcs.find((a) => a.id === id);
    setAmcs((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const newEnd = new Date(a.endDate);
        newEnd.setFullYear(newEnd.getFullYear() + 1);
        return {
          ...a,
          startDate: todayISO(),
          endDate: newEnd.toISOString().slice(0, 10),
          visitsUsed: 0,
          history: [
            ...a.history,
            historyEntry("AMC renewed", `Renewed for 1 year, ${a.plan}`),
          ],
        };
      }),
    );
    if (existing?._id) {
      const newEnd = new Date(existing.endDate);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      const history = [
        ...(existing.history || []),
        historyEntry("AMC renewed", `Renewed for 1 year, ${existing.plan}`),
      ];
      amcAPI
        .update(existing._id, {
          startDate: todayISO(),
          endDate: newEnd.toISOString().slice(0, 10),
          visitsUsed: 0,
          history: toApiHistory(history),
        })
        .then((res) => {
          const updated = normalizeAmc(res.data.data);
          setAmcs((prev) => prev.map((a) => (a.id === id ? updated : a)));
        })
        .catch((err) =>
          console.warn("Failed to sync AMC renewal:", err?.message),
        );
    }
    success("AMC renewed for another year.");
  }

  function deleteAmc(id) {
    const a = amcs.find((x) => x.id === id);
    setAmcs((prev) => prev.filter((x) => x.id !== id));
    if (selectedAmcId === id) setSelectedAmcId(null);
    if (a?._id) {
      amcAPI.delete(a._id).catch((err) =>
        console.warn("Failed to delete AMC on server:", err?.message),
      );
    }
    success("AMC contract deleted.");
  }

async function downloadAMCLog(a) {
  const totalVisits = a.totalVisits || PLAN_VISITS[a.plan] || 4;

  const expired = isPast(a.endDate);
  const daysLeft = daysBetween(todayISO(), a.endDate);

  const status = expired
    ? "Expired"
    : daysLeft <= 30
    ? "Expiring Soon"
    : "Active";

  const doc = await createProfilePdf({
    bannerName: a.customer,
    bannerSubtitle: `AMC ID: ${a.id}`,
    bannerRight: [`Status: ${status}`],
    sections: [
      {
        title: "Contract Details",
        fields: [
          ["Customer", a.customer],
          ["System", a.system],
          ["Plan", a.plan],
          ["Start Date", formatDate(a.startDate)],
          ["End Date", formatDate(a.endDate)],
          ["Total Visits", totalVisits],
          ["Visits Used", a.visitsUsed],
          ["Visits Remaining", totalVisits - a.visitsUsed],
        ],
      },
    ],
  });

  const safeCustomer = (a.customer || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`AMCLog_${safeCustomer}.pdf`);
  success("AMC contract dowanloaded Successfully.");
}


  /* ----------------------------------- derived ----------------------------------- */

  const withStatus = useMemo(
    () => amcs.map((a) => ({ ...a, statusKey: amcStatus(a.endDate) })),
    [amcs],
  );

  const stats = useMemo(() => {
    const activeCount = withStatus.filter((a) => a.statusKey === "active").length;
    const expiringCount = withStatus.filter(
      (a) => a.statusKey === "expiring",
    ).length;
    const expiredCount = withStatus.filter(
      (a) => a.statusKey === "expired",
    ).length;
    const totalRevenue = withStatus.reduce((sum, a) => sum + (a.amount || 0), 0);
    return { activeCount, expiringCount, expiredCount, totalRevenue };
  }, [withStatus]);

  const filtered = useMemo(
    () =>
      withStatus.filter((a) => {
        const matchesStatus = statusFilter === "all" || a.statusKey === statusFilter;
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          (a.customer || "").toLowerCase().includes(q) ||
          (a.id || "").toLowerCase().includes(q) ||
          (a.system || "").toLowerCase().includes(q);
        return matchesStatus && matchesSearch;
      }),
    [withStatus, search, statusFilter],
  );

  // Server-side paginated data — filtered by status on the client (status is derived from endDate)
  const paginated = useMemo(() => {
    if (statusFilter === "all") return withStatus;
    return withStatus.filter((a) => a.statusKey === statusFilter);
  }, [withStatus, statusFilter]);
  const totalPages = Math.max(1, Math.ceil((statusFilter === "all" ? serverTotal : filtered.length) / pageSize));
  const selectedAmc = amcs.find((a) => a.id === selectedAmcId) || null;
  const editingAmc = amcs.find((a) => a.id === editAmcId) || null;

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="amc-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="amc-container">
      <div className="amc-header">
        <div>
          <h2>AMC Management</h2>
          <p className="td-sub">
            Annual maintenance contracts — create, renew, log visits and track
            coverage.
          </p>
        </div>
      </div>

      <div className="amc-stats-grid">
        <StatCard
          title="Active AMC"
          value={stats.activeCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="blue"
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiringCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="yellow"
        />
        <StatCard
          title="Expired"
          value={stats.expiredCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
        <StatCard
          title="Total Revenue"
          value={`₹${(stats.totalRevenue / 100000).toFixed(1)}L`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="green"
        />
      </div>

      <div className="amc-filter-bar">
        <div className="amc-search-wrap">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search AMC records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="amc-search-clear" onClick={() => setSearch("")}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown
          value={statusFilter}
          onChange={(val) => setStatusFilter(val)}
          options={[
            { value: "all", label: "All Status" },
            { value: "active", label: "Active" },
            { value: "expiring", label: "Expiring Soon" },
            { value: "expired", label: "Expired" },
          ]}
        />
        {canDo("amc", "create") && (
          <button
            type="button"
            className="mm-btn mm-btn--primary"
            onClick={() => setShowCreateAmc(true)}
          >
            + New AMC Contract
          </button>
        )}
      </div>

      <div className="amc-table-card">
        {loading ? (
          <PageLoader minHeight="300px" />
        ) : (
          <>
            <div className="amc-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>AMC ID</th>
                    <th>Customer</th>
                    <th>System</th>
                    <th>Plan</th>
                    <th>Duration</th>
                    <th>Amount</th>
                    <th>Visits</th>
                    <th>Next Service</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <TableEmptyState colSpan={10} title="No AMC contracts found" subtitle="Try adjusting your search or filters." />
                  ) : (
                paginated.map((a) => {
                const meta = STATUS_META[a.statusKey];
                const totalVisits = a.totalVisits || PLAN_VISITS[a.plan] || 4;
                const pct = Math.min(
                  100,
                  Math.round((a.visitsUsed / totalVisits) * 100),
                );
                return (
                  <tr key={a.id}>
                    <td className="td-id">{a.id}</td>
                    <td>
                      <div className="customer-name">{a.customer}</div>
                      <div className="td-sub">{a.customerId}</div>
                    </td>
                    <td>{a.system}</td>
                    <td>
                      <span
                        className={`plan-badge ${PLAN_BADGE[a.plan] || ""}`.trim()}
                      >
                        {a.plan}
                      </span>
                    </td>
                    <td>
                      <div className="td-sub">{displayDate(a.startDate)}</div>
                      <div className="td-sub">to {displayDate(a.endDate)}</div>
                    </td>
                    <td className="td-amount">
                      Rs. {(a.amount || 0).toLocaleString()}
                    </td>
                    <td className="td-center">
                      <div className="mm-progress-track">
                        <div
                          className={`mm-progress-fill mm-progress-fill--${a.statusKey}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="td-sub">
                        {a.visitsUsed}/{totalVisits} visits
                      </div>
                    </td>
                    <td>{a.nextService ? displayDate(a.nextService) : "-"}</td>
                    <td>
                      <span className={`status-badge ${meta.tone}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <div className="act-actions">
                        <button
                          type="button"
                          className="act-btn act-view"
                          onClick={() => setSelectedAmcId(a.id)}
                          title="View Details"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <ActivityLogButton
                          module="amc"
                          onClick={() => {
                            const amcId = a._id || a.id;
                            navigate(`/admin/amc-activity/${amcId}`, {
                              state: { target: { recordId: amcId, recordLabel: a.amcId || a.customer, module: "amc" } },
                            });
                          }}
                          title="View AMC Activity Log"
                        />
                        {canDo("amc", "edit") && (
                          <button
                            type="button"
                            className="act-btn act-edit"
                            onClick={() => setLogVisitAmcId(a.id)}
                            title="Log Visit"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                              <line x1="12" y1="14" x2="12" y2="18" />
                              <line x1="10" y1="16" x2="14" y2="16" />
                            </svg>
                          </button>
                        )}
                        {canDo("amc", "edit") && (
                          <button
                            type="button"
                            className="act-btn act-edit"
                            onClick={() => setEditAmcId(a.id)}
                            title="Edit"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        {canDo("amc", "delete") && (
                          <button
                            type="button"
                            className="act-btn act-delete"
                            onClick={() => setDeleteConfirm(a)}
                            title="Delete"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
                </tbody>
              </table>
            </div>
            <div className="product-pagination-row">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={statusFilter === "all" ? serverTotal : filtered.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(val) => {
                  setPageSize(Number(val));
                  setCurrentPage(1);
                }}
                disabled={loading}
              />
            </div>
          </>
        )}
      </div>

      {selectedAmc && (
        <AmcDetailModal
          amc={selectedAmc}
          visits={visits.filter((v) => v.linkId === selectedAmc.id)}
          onClose={() => setSelectedAmcId(null)}
          onRenew={renewAmc}
          onUpdateAmc={updateAmc}
        />
      )}

      {showCreateAmc && (
        <CreateAmcModal
          technicians={technicians}
          onClose={() => setShowCreateAmc(false)}
          onCreate={createAmc}
          onUpdate={updateAmc}
        />
      )}

      {editingAmc && (
        <CreateAmcModal
          amc={editingAmc}
          technicians={technicians}
          onClose={() => setEditAmcId(null)}
          onUpdate={updateAmc}
          onLogVisit={logAmcVisit}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete AMC Contract"
          message={`Are you sure you want to delete AMC ${deleteConfirm.customer}?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            deleteAmc(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {logVisitAmcId && (
        <LogVisitModal
          amc={amcs.find((a) => a.id === logVisitAmcId)}
          technicians={technicians}
          onClose={() => setLogVisitAmcId(null)}
          onLogVisit={logAmcVisit}
        />
      )}
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
                  {showLogModal.amcId || showLogModal._id}
                </span>
              </div>
              <button className="cm-modal-close" onClick={() => setShowLogModal(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="cm-view-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "400px", overflowY: "auto" }}>
              
              {/* Change/Creation Summary */}
              <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 16px" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "600", color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Change &amp; Status Logs
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Status</span>
                    <span className={`cm-status-badge cm-status-${(showLogModal.status || "").toLowerCase()}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.status || "Active"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Contract Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.startDate ? new Date(showLogModal.startDate).toLocaleDateString("en-IN") : "—"} to {showLogModal.endDate ? new Date(showLogModal.endDate).toLocaleDateString("en-IN") : "—"}
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
                  Contract Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customer}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Contract Type</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.contractType || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Contract Value</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.price ? `INR ${showLogModal.price}` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Total Maintenance Visits</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{(showLogModal.visits || []).length} visits logged</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadAMCLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- AMC detail modal --------------------------------- */

function AmcDetailModal({ amc, visits = [], onClose, onRenew, onUpdateAmc }) {
  const [tab, setTab] = useState("overview");

  const amcFormik = useFormik({
    initialValues: {
      customer: amc.customer,
      system: amc.system,
      plan: amc.plan,
      startDate: amc.startDate,
      endDate: amc.endDate,
    },
    validationSchema: amcSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onUpdateAmc(amc.id, values);
      onClose();
    },
  });

  const expired = isPast(amc.endDate);
  const totalVisits = amc.totalVisits || PLAN_VISITS[amc.plan] || 4;

  return (
    <div className="mm-modal-backdrop">
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="mm-modal__header">
          <div>
            <h2>
              {amc.id} — {amc.customer}
            </h2>
            <div className="mm-modal__header-meta">
              <span className="mm-pill mm-pill--neutral">{amc.plan}</span>
              {expired && (
                <span className="mm-pill mm-pill--danger">Expired</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="mm-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <nav className="mm-modal-tabs">
          {[
            { key: "overview", label: "Overview" },
            { key: "history", label: "Visit History" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              className={`mm-modal-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mm-modal__body">
          {tab === "overview" && (
            <div>
              <form onSubmit={amcFormik.handleSubmit}>
                <div className="mm-form-grid">
                  <label className="mm-field mm-field--full">
                    <span>Customer</span>
                    <input
                      type="text"
                      name="customer"
                      value={amcFormik.values.customer}
                      onChange={amcFormik.handleChange}
                      onBlur={amcFormik.handleBlur}
                      className={
                        amcFormik.touched.customer && amcFormik.errors.customer
                          ? "mm-input-error"
                          : ""
                      }
                    />
                    {amcFormik.touched.customer && amcFormik.errors.customer && (
                      <span className="mm-form-error">
                        {amcFormik.errors.customer}
                      </span>
                    )}
                  </label>
                  <label className="mm-field mm-field--full">
                    <span>System / Product</span>
                    <input
                      type="text"
                      name="system"
                      value={amcFormik.values.system}
                      onChange={amcFormik.handleChange}
                      onBlur={amcFormik.handleBlur}
                      className={
                        amcFormik.touched.system && amcFormik.errors.system
                          ? "mm-input-error"
                          : ""
                      }
                    />
                    {amcFormik.touched.system && amcFormik.errors.system && (
                      <span className="mm-form-error">
                        {amcFormik.errors.system}
                      </span>
                    )}
                  </label>
                  <label className="mm-field">
                    <span>Plan</span>
                    <Dropdown
                      value={amcFormik.values.plan}
                      onChange={(val) => amcFormik.setFieldValue("plan", val)}
                      options={AMC_PLANS.map((p) => ({ value: p, label: p }))}
                      variant="form"
                    />
                  </label>
                  <label className="mm-field">
                    <span>Start Date</span>
                    <input
                      type="date"
                      name="startDate"
                      value={amcFormik.values.startDate}
                      onChange={amcFormik.handleChange}
                      onBlur={amcFormik.handleBlur}
                      className={
                        amcFormik.touched.startDate && amcFormik.errors.startDate
                          ? "mm-input-error"
                          : ""
                      }
                    />
                    {amcFormik.touched.startDate &&
                      amcFormik.errors.startDate && (
                        <span className="mm-form-error">
                          {amcFormik.errors.startDate}
                        </span>
                      )}
                  </label>
                  <label className="mm-field">
                    <span>End Date</span>
                    <input
                      type="date"
                      name="endDate"
                      value={amcFormik.values.endDate}
                      onChange={amcFormik.handleChange}
                      onBlur={amcFormik.handleBlur}
                      className={
                        amcFormik.touched.endDate && amcFormik.errors.endDate
                          ? "mm-input-error"
                          : ""
                      }
                    />
                    {amcFormik.touched.endDate && amcFormik.errors.endDate && (
                      <span className="mm-form-error">
                        {amcFormik.errors.endDate}
                      </span>
                    )}
                  </label>
                  <div className="mm-field">
                    <span>Visits Used</span>
                    <p className="mm-cell-title">
                      {amc.visitsUsed} / {totalVisits}
                    </p>
                  </div>
                </div>
                <div className="mm-modal-section-footer">
                  <button
                    type="button"
                    className="mm-btn mm-btn--secondary mm-btn--small"
                    onClick={() => onRenew(amc.id)}
                  >
                    Renew Contract (+1 Year)
                  </button>
                  <button
                    type="submit"
                    className="mm-btn mm-btn--primary mm-btn--small"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === "history" && (
            <>
              {visits.length === 0 ? (
                <p className="mm-cell-sub" style={{ padding: "12px 0" }}>No visits logged yet.</p>
              ) : (
                <div className="mm-table-wrap">
                  <table className="mm-table">
                    <thead>
                      <tr>
                        <th>Visit ID</th>
                        <th>Date</th>
                        <th>Technician</th>
                        <th>Status</th>
                        <th>Visit Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...visits]
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((v) => (
                          <tr key={v.id}>
                            <td><code className="mm-code">{v.id}</code></td>
                            <td>{formatDate(v.date)}</td>
                            <td className="mm-cell-sub">{v.technician || "—"}</td>
                            <td>
                              <span className={`mm-pill mm-pill--${{ completed: "success", upcoming: "info", missed: "danger" }[v.status] || "neutral"}`}>
                                {v.status}
                              </span>
                            </td>
                            <td className="mm-cell-sub">{v.notes || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Create AMC modal -------------------------------- */

function CreateAmcModal({ amc, technicians, onClose, onCreate, onUpdate, onLogVisit }) {
  const isEditing = Boolean(amc);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const visitTechOptions = technicianOptions(technicians, "");
  const defaultVisitTech =
    visitTechOptions.find((o) => o.value !== "Unassigned")?.value ||
    "Unassigned";

  const logVisitFormik = useFormik({
    initialValues: { visitDate: todayISO(), visitTech: defaultVisitTech, visitNotes: "" },
    validationSchema: visitSchema,
    onSubmit: (values) => {
      onLogVisit(amc.id, values.visitDate, values.visitTech, values.visitNotes);
      logVisitFormik.resetForm({ values: { visitDate: todayISO(), visitTech: defaultVisitTech, visitNotes: "" } });
    },
  });

  useEffect(() => {
    customerAPI.getAll({ limit: 500 })
      .then((res) => setCustomers(res.data?.data || []))
      .catch(() => {});
    productAPI.getAll({ limit: 500 })
      .then((res) => setProducts(res.data?.data || []))
      .catch(() => {});
  }, []);

  const formik = useFormik({
    initialValues: {
      customer: amc?.customer || "",
      customerId: amc?.customerId || "",
      system: amc?.system || "",
      plan: amc?.plan || AMC_PLANS[1],
      startDate: amc?.startDate || todayISO(),
      endDate: amc?.endDate || "",
      amount: amc?.amount ?? "",
      nextService: amc?.nextService || "",
    },
    validationSchema: amcSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      if (isEditing) {
        onUpdate(amc.id, values);
      } else {
        onCreate(values);
      }
    },
  });

  const customerOptions = customers.map((c) => ({
    value: c.customerId || c._id,
    label: c.name,
    _id: c._id,
    name: c.name,
  }));

  const productOptions = products.map((p) => ({
    value: p.name,
    label: p.name,
  }));

  return (
    <div className="mm-modal-backdrop">
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="mm-modal__header">
          <h2>{isEditing ? `Edit AMC — ${amc.id}` : "New AMC Contract"}</h2>
          <button
            type="button"
            className="mm-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="mm-modal__form" onSubmit={formik.handleSubmit}>
          <div className="mm-form-grid">
            <label className="mm-field mm-field--full">
              <span>Customer</span>
              {customerOptions.length > 0 ? (
                <Dropdown
                  value={formik.values.customerId || formik.values.customer}
                  onChange={(val) => {
                    const selected = customerOptions.find((c) => c.value === val);
                    formik.setFieldValue("customer", selected?.name || val);
                    formik.setFieldValue("customerId", val);
                  }}
                  options={[
                    { value: "", label: "Select customer" },
                    ...customerOptions,
                  ]}
                  variant="form"
                />
              ) : (
                <input
                  type="text"
                  name="customer"
                  placeholder="Customer name"
                  value={formik.values.customer}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.customer && formik.errors.customer ? "mm-input-error" : ""}
                />
              )}
              {formik.touched.customer && formik.errors.customer && (
                <span className="mm-form-error">{formik.errors.customer}</span>
              )}
            </label>
            <label className="mm-field mm-field--full">
              <span>System / Product</span>
              {productOptions.length > 0 ? (
                <Dropdown
                  value={formik.values.system}
                  onChange={(val) => formik.setFieldValue("system", val)}
                  options={[
                    { value: "", label: "Select product…" },
                    ...productOptions,
                  ]}
                  variant="form"
                />
              ) : (
                <input
                  type="text"
                  name="system"
                  placeholder="System / Product name"
                  value={formik.values.system}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.system && formik.errors.system ? "mm-input-error" : ""}
                />
              )}
              {formik.touched.system && formik.errors.system && (
                <span className="mm-form-error">{formik.errors.system}</span>
              )}
            </label>
            <label className="mm-field">
              <span>Plan</span>
              <Dropdown
                value={formik.values.plan}
                onChange={(val) => formik.setFieldValue("plan", val)}
                options={AMC_PLANS.map((p) => ({ value: p, label: p }))}
                variant="form"
              />
            </label>
            <label className="mm-field">
              <span>Start Date</span>
              <input
                type="date"
                name="startDate"
                value={formik.values.startDate}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                min={todayISO()}
                className={formik.touched.startDate && formik.errors.startDate ? "mm-input-error" : ""}
              />
              {formik.touched.startDate && formik.errors.startDate && (
                <span className="mm-form-error">{formik.errors.startDate}</span>
              )}
            </label>
            <label className="mm-field">
              <span>End Date</span>
              <input
                type="date"
                name="endDate"
                value={formik.values.endDate}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                min={todayISO()}
                className={formik.touched.endDate && formik.errors.endDate ? "mm-input-error" : ""}
              />
              {formik.touched.endDate && formik.errors.endDate && (
                <span className="mm-form-error">{formik.errors.endDate}</span>
              )}
            </label>
            <label className="mm-field">
              <span>Amount (Rs.)</span>
              <input
                type="number"
                name="amount"
                placeholder="e.g. 12000"
                value={formik.values.amount}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                min="0"
              />
            </label>
            <label className="mm-field">
              <span>Next Service Date</span>
              <input
                type="date"
                name="nextService"
                value={formik.values.nextService}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
            </label>
          </div>
          <div className="mm-modal__footer">
            <button type="button" className="mm-btn mm-btn--ghost" onClick={onClose} disabled={formik.isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="mm-btn mm-btn--primary" disabled={formik.isSubmitting || !formik.isValid}>
              {formik.isSubmitting ? (isEditing ? "Saving Changes..." : "Creating AMC...") : (isEditing ? "Save Changes" : "Create AMC")}
            </button>
          </div>
        </form>

        {isEditing && (
          <>
            <div className="mm-panel-heading mm-panel-heading--tight" style={{ padding: "0 24px" }}>
              <h3>Log a Visit</h3>
            </div>
            <form onSubmit={logVisitFormik.handleSubmit} style={{ padding: "0 24px 24px" }}>
              <div className="mm-form-grid">
                <label className="mm-field">
                  <span>Date</span>
                  <input
                    type="date"
                    name="visitDate"
                    value={logVisitFormik.values.visitDate}
                    onChange={logVisitFormik.handleChange}
                    onBlur={logVisitFormik.handleBlur}
                    className={logVisitFormik.touched.visitDate && logVisitFormik.errors.visitDate ? "mm-input-error" : ""}
                  />
                  {logVisitFormik.touched.visitDate && logVisitFormik.errors.visitDate && (
                    <span className="mm-form-error">{logVisitFormik.errors.visitDate}</span>
                  )}
                </label>
                <label className="mm-field">
                  <span>Technician</span>
                  <Dropdown
                    value={logVisitFormik.values.visitTech}
                    onChange={(val) => logVisitFormik.setFieldValue("visitTech", val)}
                    options={technicianOptions(technicians, logVisitFormik.values.visitTech)}
                    variant="form"
                  />
                </label>
                <label className="mm-field mm-field--full">
                  <span>Notes</span>
                  <input
                    type="text"
                    name="visitNotes"
                    placeholder="e.g. Preventive cleaning + inspection"
                    value={logVisitFormik.values.visitNotes}
                    onChange={logVisitFormik.handleChange}
                    onBlur={logVisitFormik.handleBlur}
                  />
                </label>
              </div>
              <div className="mm-modal-section-footer">
                <button type="submit" className="mm-btn mm-btn--primary mm-btn--small" disabled={logVisitFormik.isSubmitting || !logVisitFormik.isValid}>
                  {logVisitFormik.isSubmitting ? "Logging Visit..." : "Log Visit"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Log Visit modal -------------------------------- */

function LogVisitModal({ amc, technicians, onClose, onLogVisit }) {
  const { user } = useAuth();
  const isTechnician = user?.role === "technician";
  const visitTechOptions = technicianOptions(technicians, isTechnician ? user?.name : "");
  const defaultTech = isTechnician ? (user?.name || "") : (
    visitTechOptions.find((o) => o.value !== "Unassigned")?.value || "Unassigned"
  );

  const formik = useFormik({
    initialValues: {
      visitDate: todayISO(),
      visitTech: defaultTech,
      visitDescription: "",
    },
    onSubmit: async (values) => {
      await onLogVisit(amc.id, values.visitDate, values.visitTech, values.visitDescription);
      onClose();
    },
  });

  if (!amc) return null;

  const totalVisits = amc.totalVisits || PLAN_VISITS[amc.plan] || 4;
  const remaining = totalVisits - amc.visitsUsed;

  return (
    <div className="mm-modal-backdrop" onClick={onClose}>
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mm-modal__header">
          <div>
            <h2>Log Visit — {amc.id}</h2>
            <div className="mm-modal__header-meta">
              <span className="mm-pill mm-pill--neutral">{amc.customer}</span>
              <span className="mm-pill mm-pill--info">{amc.plan}</span>
              <span className="mm-pill mm-pill--warning">
                {amc.visitsUsed}/{totalVisits} visits used ({remaining} remaining)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="mm-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="mm-modal__form" onSubmit={formik.handleSubmit}>
          <div className="mm-form-grid">
            <label className="mm-field">
              <span>Date</span>
              <input
                type="date"
                name="visitDate"
                value={formik.values.visitDate}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                max={todayISO()}
              />
            </label>
            <label className="mm-field">
              <span>Technician</span>
              <Dropdown
                value={formik.values.visitTech}
                onChange={(val) => formik.setFieldValue("visitTech", val)}
                options={visitTechOptions}
                variant="form"
                disabled={isTechnician}
              />
            </label>
            <label className="mm-field mm-field--full">
              <span>Visit Description</span>
              <textarea
                rows={3}
                name="visitDescription"
                placeholder="Describe the work performed during this visit..."
                maxLength={500}
                value={formik.values.visitDescription}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
            </label>
          </div>
          <div className="mm-modal__footer">
            <button type="button" className="mm-btn mm-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="mm-btn mm-btn--primary" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? "Logging Visit..." : "Log Visit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
