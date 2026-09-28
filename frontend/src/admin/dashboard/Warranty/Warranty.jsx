import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { warrantySchema } from "../../../utils/AdminValidation";
import { Pagination, Dropdown, TableLoader } from "../../../components/common";
import StatCard from "../StatCard/StatCard";
import { useLocalToast, ToastRenderer } from "../../../components/common/Toast";
import {
  warrantyAPI,
  warrantyClaimAPI,
  vendorEscalationAPI,
  productAPI,
  vendorAPI,
  customerAPI,
} from "../../../services";
import { fetchAllPages } from "../../../utils";
import { createProfilePdf } from "../../../utils/pdfLayout";
import { sortById } from "../../../utils/helpers";
import { useAuth } from "../../../context/AuthContext";
import { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../../common/GenericDetailActivityLog";
import "./warranty.css";
/* ---------------------------------- data ---------------------------------- */

const CLAIM_STAGES = [
  "Submitted",
  "Under Review",
  "Approved",
  "Vendor Escalation",
  "Resolved",
];

const STATUS_META = {
  active: { label: "Active", tone: "success" },
  expiring: { label: "Expiring Soon", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
};

const PRIORITY_META = {
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "neutral" },
};

const ESCALATION_STATUS_META = {
  "awaiting-vendor": { label: "Awaiting Vendor", tone: "warning" },
  "vendor-responded": { label: "Vendor Responded", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

const TABS = [
  { key: "registry", label: "Warranty Registry" },
  { key: "claims", label: "Claims" },
  { key: "escalation", label: "Vendor Escalation" },
  { key: "alerts", label: "Alerts" },
];

/* -------------------------------- helpers -------------------------------- */

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function coverageProgress(installed, expires) {
  const start = new Date(installed).getTime();
  const end = new Date(expires).getTime();
  const now = Date.now();
  const pct = ((now - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, pct));
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" };
  return <span className={`pill pill--${meta.tone}`}>{meta.label}</span>;
}

function PriorityPill({ priority }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, tone: "neutral" };
  return (
    <span className={`pill pill--${meta.tone} pill--outline`}>
      {meta.label}
    </span>
  );
}

/* ------------------------------- API data helpers ------------------------------- */

// Convert a stored ISO date to a local-timezone YYYY-MM-DD so date inputs and
// day calculations don't shift by a day.
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

// Backend documents use Mongo _id internally plus a human-friendly warrantyId /
// claimId / escalationId (WR-1042, CLM-3301, ESC-210 style) for display.
function normalizeWarranty(doc) {
  return {
    ...doc,
    id: doc.warrantyId || doc._id,
    installed: toDateInput(doc.installed),
    expires: toDateInput(doc.expires),
  };
}

function normalizeClaim(doc) {
  return {
    ...doc,
    id: doc.claimId || doc._id,
    submitted: toDateInput(doc.submitted),
  };
}

function normalizeEscalation(doc) {
  return {
    ...doc,
    id: doc.escalationId || doc._id,
    escalated: toDateInput(doc.escalated),
    expectedResponse: toDateInput(doc.expectedResponse),
  };
}

/* --------------------------------- icons --------------------------------- */

const icons = {
  shield: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  shieldPlus: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="12" y1="9" x2="12" y2="15" />
    </svg>
  ),
  pencil: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  certificate: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M9 15h3" />
      <path d="M12 18H9" />
      <circle cx="14" cy="14" r="3" />
      <circle cx="14" cy="14" r="1" />
    </svg>
  ),
  eye: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  arrowRight: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  check: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    ></svg>
  ),
  close: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  list: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  fileText: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  ),
  send: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  bell: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  search: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
};

/* --------------------------------- module --------------------------------- */

async function downloadWarrantyLog(w) {
  const doc = await createProfilePdf({
    bannerName: w.customer,
    bannerSubtitle: `Warranty ID: ${w.id}`,
    bannerRight: [`Status: ${w.status || "—"}`, `Component: ${w.component || "—"}`],
    sections: [
      {
        title: "Warranty Details",
        fields: [
          ["Component", w.component],
          ["Model", w.model],
          ["Serial No.", w.serial],
          ["Customer", w.customer],
          ["Site", w.site],
          ["Manufacturer", w.manufacturer],
          ["Installed", formatDate(w.installed)],
          ["Period", `${w.periodYears} years`],
          ["Expires", formatDate(w.expires)],
          ["Coverage", w.coverage],
          ["Certificate", w.certificate],
        ],
      },
    ],
  });

  doc.save(`WarrantyLog_${w.customer}.pdf`);
}

export default function WarrantyManagement() {
  const { canDo } = useAuth();
  const [activeTab, setActiveTab] = useState("registry");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimPage, setClaimPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [viewWarranty, setViewWarranty] = useState(null);
  const [editingWarranty, setEditingWarranty] = useState(null);
  const [warranties, setWarranties] = useState([]);
  const [showLogModal, setShowLogModal] = useState(null);
  const [escalations, setEscalations] = useState([]);
  const [warrantyPage, setWarrantyPage] = useState(1);
  const [escalationPage, setEscalationPage] = useState(1);
  const [warrantyPageSize, setWarrantyPageSize] = useState(10);
  const [warrantyServerTotal, setWarrantyServerTotal] = useState(0);
  const { toast, success: showToast, error: showError } = useLocalToast();
  

  /* ------------------------------ live data loading ------------------------------ */

  // Load records with server-side pagination for registry tab
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setLoading(true);
      const params = { page: warrantyPage, limit: warrantyPageSize };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      await Promise.all([
        warrantyAPI.getAll(params)
          .then((res) => {
            if (cancelled) return;
            setWarranties((res.data?.data || []).map(normalizeWarranty));
            setWarrantyServerTotal(res.data?.pagination?.total || (res.data?.data || []).length);
          })
          .catch((err) => console.warn("Failed to load warranties:", err?.message)),
        fetchAllPages(warrantyClaimAPI.getAll)
          .then((docs) => { if (!cancelled) setClaims(docs.map(normalizeClaim)); })
          .catch((err) => console.warn("Failed to load claims:", err?.message)),
        fetchAllPages(vendorEscalationAPI.getAll)
          .then((docs) => { if (!cancelled) setEscalations(docs.map(normalizeEscalation)); })
          .catch((err) => console.warn("Failed to load escalations:", err?.message)),
      ]);
      if (!cancelled) setLoading(false);
    };
    loadAll();
    return () => { cancelled = true; };
  }, [warrantyPage, warrantyPageSize, search, statusFilter]);

  const stats = useMemo(() => {
    const total = warranties.length;
    const active = warranties.filter((w) => w.status === "active").length;
    const expiring = warranties.filter((w) => w.status === "expiring").length;
    const expired = warranties.filter((w) => w.status === "expired").length;
    const openClaims = claims.filter((c) => c.stageIndex < 4).length;
    return { total, active, expiring, expired, openClaims };
  }, [warranties, claims]);

  const filteredWarranties = useMemo(() => {
    const result = warranties.filter((w) => {
      const matchesStatus = statusFilter === "all" || w.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        w.serial.toLowerCase().includes(q) ||
        w.customer.toLowerCase().includes(q) ||
        w.model.toLowerCase().includes(q) ||
        w.component.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
    if (
      warrantyPage > Math.max(1, Math.ceil(result.length / warrantyPageSize))
    ) {
      setWarrantyPage(1);
    }
    return result;
  }, [search, statusFilter, warranties, warrantyPage, warrantyPageSize]);

  const paginatedWarranties = useMemo(() => {
    return filteredWarranties.slice(
      (warrantyPage - 1) * warrantyPageSize,
      warrantyPage * warrantyPageSize,
    );
  }, [filteredWarranties, warrantyPage, warrantyPageSize]);

  const warrantyTotalPages = Math.max(
    1,
    Math.ceil(warrantyServerTotal / warrantyPageSize),
  );

  async function handleRegisterSubmit(values) {
    const now = new Date();
    const periodYears = Number(values.periodYears) || 5;
    const installed =
      values.installed || now.toISOString().split("T")[0];
    const installedDate = new Date(installed);
    const expiresDate = new Date(installedDate);
    expiresDate.setFullYear(expiresDate.getFullYear() + periodYears);
    const expires = expiresDate.toISOString().split("T")[0];
    const nowMs = Date.now();
    const diffPct =
      ((nowMs - installedDate.getTime()) /
        (expiresDate.getTime() - installedDate.getTime())) *
      100;
    let status = "active";
    if (diffPct >= 100) status = "expired";
    else if (diffPct >= 80) status = "expiring";

    const newWarranty = {
      id: `WR-${1050 + warranties.length}`,
      component: values.component || "Solar Panel",
      model: values.model || "Standard Panel",
      serial:
        values.serial ||
        `SER-${String(warranties.length + 1).padStart(4, "0")}`,
      customer: values.customer || "New Customer",
      site: values.site || "N/A",
      manufacturer: values.manufacturer || "Manufacturer",
      installed,
      periodYears,
      expires,
      coverage: values.coverage || "Product Only",
      status,
      certificate: `${values.serial || "SER"}_certificate.pdf`,
    };
    setWarranties((prev) => [newWarranty, ...prev]);

    // Persist to the backend. Only report success once the server confirms the
    // save; on failure we roll back the optimistic row and surface the error so
    // the user never sees a phantom warranty that vanishes after a refresh.
    let savedWarranty = newWarranty;
    try {
      const res = await warrantyAPI.create({
        component: newWarranty.component,
        model: newWarranty.model,
        serial: newWarranty.serial,
        customer: newWarranty.customer,
        site: newWarranty.site,
        manufacturer: newWarranty.manufacturer,
        installed: newWarranty.installed,
        periodYears: newWarranty.periodYears,
        coverage: newWarranty.coverage,
        status: newWarranty.status,
        certificate: newWarranty.certificate,
      });
      savedWarranty = normalizeWarranty(res.data.data);
      setWarranties((prev) =>
        prev.map((w) => (w.id === newWarranty.id ? savedWarranty : w)),
      );
    } catch (err) {
      console.warn("Failed to register warranty on server:", err?.message);
      setWarranties((prev) =>
        prev.filter((w) => w.id !== newWarranty.id),
      );
      showError(
        err.response?.data?.message ||
          "Failed to register warranty. Please try again.",
      );
      return;
    }
    showToast(
      `Warranty ${savedWarranty.id} registered for ${savedWarranty.customer}`,
    );
    setShowRegisterForm(false);
  }

  async function handleCreateClaim(values) {
    const tempId = `CLM-${Date.now()}`;
    const newClaim = { ...values, id: tempId, stageIndex: 0, submitted: new Date().toISOString().split("T")[0] };
    setClaims((prev) => [newClaim, ...prev]);
    try {
      const res = await warrantyClaimAPI.create(values);
      const saved = normalizeClaim(res.data.data);
      setClaims((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
      showToast(`Claim ${saved.id} created`);
    } catch (err) {
      console.warn("Failed to create claim:", err?.message);
      showToast("Claim saved locally (offline)");
    }
  }

  async function handleUpdateClaim(updated) {
    setClaims((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (updated._id) {
      try {
        const res = await warrantyClaimAPI.update(updated._id, {
          warrantyId: updated.warrantyId,
          component: updated.component,
          serial: updated.serial,
          customer: updated.customer,
          issue: updated.issue,
          priority: updated.priority,
          resolution: updated.resolution,
        });
        const saved = normalizeClaim(res.data.data);
        setClaims((prev) => prev.map((c) => (c.id === updated.id ? saved : c)));
      } catch (err) {
        console.warn("Failed to update claim:", err?.message);
      }
    }
    showToast(`Claim ${updated.id} updated`);
  }

  async function handleDeleteClaim(claim) {
    setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    if (claim._id) {
      try {
        await warrantyClaimAPI.delete(claim._id);
      } catch (err) {
        console.warn("Failed to delete claim:", err?.message);
      }
    }
    showToast(`Claim ${claim.id} deleted`);
  }

  async function handleCreateEscalation(values) {
    const tempId = `ESC-${Date.now()}`;
    const newEsc = { ...values, id: tempId };
    setEscalations((prev) => [newEsc, ...prev]);
    try {
      const res = await vendorEscalationAPI.create(values);
      const saved = normalizeEscalation(res.data.data);
      setEscalations((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
      showToast(`Escalation ${saved.id} created`);
    } catch (err) {
      console.warn("Failed to create escalation:", err?.message);
      showToast("Escalation saved locally (offline)");
    }
  }

  async function handleUpdateEscalation(updated) {
    setEscalations((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    if (updated._id) {
      try {
        const res = await vendorEscalationAPI.update(updated._id, {
          claimId: updated.claimId,
          manufacturer: updated.manufacturer,
          expectedResponse: updated.expectedResponse,
          status: updated.status,
          note: updated.note,
        });
        const saved = normalizeEscalation(res.data.data);
        setEscalations((prev) => prev.map((e) => (e.id === updated.id ? saved : e)));
      } catch (err) {
        console.warn("Failed to update escalation:", err?.message);
      }
    }
    showToast(`Escalation ${updated.id} updated`);
  }

  async function handleDeleteEscalation(esc) {
    setEscalations((prev) => prev.filter((e) => e.id !== esc.id));
    if (esc._id) {
      try {
        await vendorEscalationAPI.delete(esc._id);
      } catch (err) {
        console.warn("Failed to delete escalation:", err?.message);
      }
    }
    showToast(`Escalation ${esc.id} deleted`);
  }

  const [deletingWarranty, setDeletingWarranty] = useState(null);
  async function handleDeleteWarranty(w) {
    if (!w) return;
    try {
      if (w._id) await warrantyAPI.delete(w._id);
      setWarranties((prev) => prev.filter((item) => item.id !== w.id));
      showToast(`Warranty ${w.id} deleted`);
    } catch (err) {
      console.warn("Failed to delete warranty:", err?.message);
      showToast("Failed to delete warranty");
    }
    setDeletingWarranty(null);
  }

  async function handleUpdateWarranty(updated) {
    setWarranties((prev) =>
      prev.map((w) => (w.id === updated.id ? updated : w)),
    );
    if (updated._id) {
      try {
        const res = await warrantyAPI.update(updated._id, {
          component: updated.component,
          model: updated.model,
          serial: updated.serial,
          manufacturer: updated.manufacturer,
          customer: updated.customer,
          site: updated.site,
          installed: updated.installed,
          periodYears: updated.periodYears,
          coverage: updated.coverage,
        });
        const saved = normalizeWarranty(res.data.data);
        setWarranties((prev) =>
          prev.map((w) => (w.id === updated.id ? saved : w)),
        );
      } catch (err) {
        console.warn("Failed to update warranty on server:", err?.message);
      }
    }
    showToast(`Warranty ${updated.serial} updated`);
    setEditingWarranty(null);
  }

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="warranty-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="warranty-module">
      <header className="wm-header">
        <div>
          <h1 className="wm-title">Warranty Management</h1>
          <p className="wm-subtitle">
            Register coverage, track expiry, and route claims to the right
            manufacturer — for every panel, inverter and battery you install.
          </p>
        </div>
        {canDo("warranty", "create") && (
          <button
            type="button"
            className="wm-btn wm-btn--primary"
            onClick={() => setShowRegisterForm(true)}
          >
            {icons.shieldPlus}
            Register Warranty
          </button>
        )}
      </header>
              <section className="warranty-stats-grid" aria-label="Warranty overview">
        <StatCard
          title="Total Warranties"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
          color="blue"
        />
        <StatCard
          title="Active"
          value={stats.active.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiring.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="yellow"
        />
        <StatCard
          title="Expired"
          value={stats.expired.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
      </section>

      <nav className="wm-tabs" role="tablist" aria-label="Warranty sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`wm-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="wm-tab-icon">
              {
                icons[
                  tab.key === "registry"
                    ? "list"
                    : tab.key === "claims"
                      ? "fileText"
                      : tab.key === "escalation"
                        ? "send"
                        : "bell"
                ]
              }
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="wm-content">
        {activeTab === "registry" && (
          <RegistryPanel
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            warranties={paginatedWarranties}
            totalWarranties={warrantyServerTotal || filteredWarranties.length}
            warrantyPage={warrantyPage}
            warrantyTotalPages={warrantyTotalPages}
            warrantyPageSize={warrantyPageSize}
            onWarrantyPageChange={setWarrantyPage}
            onWarrantyPageSizeChange={(val) => {
              setWarrantyPageSize(Number(val));
              setWarrantyPage(1);
            }}
            showToast={showToast}
            onView={setViewWarranty}
            onEdit={setEditingWarranty}
            onDownloadLog={(w) => setShowLogModal(w)}
            canEdit={canDo("warranty", "edit")}
            canDelete={canDo("warranty", "delete")}
            onDelete={handleDeleteWarranty}
            loading={loading}
          />
        )}
        {activeTab === "claims" && (
          <ClaimsPanel
            claims={claims}
            setClaims={setClaims}
            selectedClaim={selectedClaim}
            setSelectedClaim={setSelectedClaim}
            claimPage={claimPage}
            setClaimPage={setClaimPage}
            warranties={warranties}
            onCreateClaim={handleCreateClaim}
            onUpdateClaim={handleUpdateClaim}
            onDeleteClaim={handleDeleteClaim}
            canCreate={canDo("warranty", "create")}
            canEdit={canDo("warranty", "edit")}
            canDelete={canDo("warranty", "delete")}
          />
        )}
        {activeTab === "escalation" && (
          <EscalationPanel
            escalations={escalations}
            escalationPage={escalationPage}
            setEscalationPage={setEscalationPage}
            claims={claims}
            onCreateEscalation={handleCreateEscalation}
            onUpdateEscalation={handleUpdateEscalation}
            onDeleteEscalation={handleDeleteEscalation}
            canCreate={canDo("warranty", "create")}
            canEdit={canDo("warranty", "edit")}
            canDelete={canDo("warranty", "delete")}
          />
        )}
        {activeTab === "alerts" && (
          <AlertsPanel warranties={warranties} claims={claims} />
        )}
      </main>

      {showRegisterForm && (
        <RegisterWarrantyModal
          onClose={() => setShowRegisterForm(false)}
          onSubmit={handleRegisterSubmit}
          warranties={warranties}
        />
      )}

      {viewWarranty && (
        <ViewWarrantyModal
          warranty={viewWarranty}
          onClose={() => setViewWarranty(null)}
        />
      )}

      {editingWarranty && (
        <EditWarrantyModal
          warranty={editingWarranty}
          onClose={() => setEditingWarranty(null)}
          onSave={handleUpdateWarranty}
          warranties={warranties}
        />
      )}

      {selectedClaim && (
        <ClaimDetailModal
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
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
                  {showLogModal.warrantyId || showLogModal._id}
                </span>
              </div>
              <button className="cm-modal-close" onClick={() => setShowLogModal(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
                    <span style={{ color: "#64748b" }}>Warranty Period</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.installed ? new Date(showLogModal.installed).toLocaleDateString("en-IN") : "—"} to {showLogModal.expires ? new Date(showLogModal.expires).toLocaleDateString("en-IN") : "—"}
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
                  Warranty Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customer}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Component</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.component} ({showLogModal.model})</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Serial No.</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.serial}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Manufacturer</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.manufacturer}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadWarrantyLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

/* -------------------------------- Registry -------------------------------- */

function RegistryPanel({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  warranties,
  totalWarranties,
  warrantyPage,
  warrantyTotalPages,
  warrantyPageSize,
  onWarrantyPageChange,
  onWarrantyPageSizeChange,
  showToast,
  onView,
  onEdit,
  onDelete,
  loading,
  onDownloadLog,
  canEdit = true,
  canDelete = false,
}) {
  const navigate = useNavigate();
  return (
    <section aria-label="Warranty registry">
      <div className="wm-toolbar">
        <div className="wm-search-wrap">
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
            placeholder="Search by serial no., customer, or model"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="wm-search-clear" onClick={() => setSearch("")}>
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
      </div>

      <div className="wm-table-card">
        <div className="wm-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Serial No.</th>
                <th>Customer / Site</th>
                <th>Manufacturer</th>
                <th>Coverage</th>
                <th>Warranty Window</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : warranties.map((w) => {
                const pct = coverageProgress(w.installed, w.expires);
                return (
                  <tr key={w.id}>
                    <td>
                      <div className="cell-title">{w.component}</div>
                      <div className="cell-sub">{w.model}</div>
                    </td>
                    <td>
                      <code className="serial">{w.serial}</code>
                    </td>
                    <td>
                      <div className="cell-title">{w.customer}</div>
                      <div className="cell-sub">{w.site}</div>
                    </td>
                    <td>{w.manufacturer}</td>
                    <td>{w.coverage}</td>
                    <td>
                      <div
                        className="coverage-track"
                        title={`${Math.round(pct)}% of warranty period elapsed`}
                      >
                        <div
                          className={`coverage-fill coverage-fill--${w.status}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="cell-sub coverage-dates">
                        {formatDate(w.installed)} – {formatDate(w.expires)}
                      </div>
                    </td>
                    <td>
                      <StatusPill status={w.status} />
                    </td>
                    <td className="col-actions">
                      <div className="act-actions">
                        <button
                          type="button"
                          className="act-btn act-view"
                          onClick={() => onView(w)}
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
                          module="warranty"
                          onClick={() => {
                            const warId = w.serverId || w._id || w.id;
                            navigate(`/admin/warranty-activity/${warId}`, {
                              state: { target: { recordId: warId, recordLabel: w.serial || w.customer, module: "warranty" } },
                            });
                          }}
                          title="View Warranty Activity Log"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            className="act-btn act-edit"
                            onClick={() => onEdit(w)}
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
                        {canDelete && (
                          <button
                            type="button"
                            className="act-btn act-delete"
                            onClick={() => onDelete && onDelete(w)}
                            title="Delete Warranty"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {warranties.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    {search || statusFilter !== "all"
                      ? "No warranties match this search. Try a different serial number or customer name."
                      : "No warranties yet — register one with the button above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="product-pagination-row">
          <Pagination
            currentPage={warrantyPage}
            totalPages={warrantyTotalPages}
            totalItems={totalWarranties}
            pageSize={warrantyPageSize}
            onPageChange={onWarrantyPageChange}
            variant="table"
            onPageSizeChange={onWarrantyPageSizeChange}
            disabled={loading}
          />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Claims --------------------------------- */

function ClaimsPanel({
  claims,
  setClaims,
  selectedClaim,
  setSelectedClaim,
  claimPage,
  setClaimPage,
  warranties,
  onCreateClaim,
  onUpdateClaim,
  onDeleteClaim,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}) {
  const [claimPageSize, setClaimPageSize] = useState(10);
  const [showCreateClaim, setShowCreateClaim] = useState(false);
  const [editingClaim, setEditingClaim] = useState(null);
  const [deletingClaim, setDeletingClaim] = useState(null);
  const totalPages = Math.max(1, Math.ceil(claims.length / claimPageSize));
  const paginatedClaims = claims.slice(
    (claimPage - 1) * claimPageSize,
    claimPage * claimPageSize,
  );

  function handleAdvanceStage(claim) {
    if (claim.stageIndex >= 4) return;
    const nextStage = claim.stageIndex + 1;
    setClaims((prev) =>
      prev.map((c) =>
        c.id === claim.id ? { ...c, stageIndex: nextStage } : c,
      ),
    );
    if (claim._id) {
      warrantyClaimAPI
        .update(claim._id, { stageIndex: nextStage })
        .then((res) => {
          const saved = normalizeClaim(res.data.data);
          setClaims((prev) =>
            prev.map((c) => (c.id === claim.id ? saved : c)),
          );
        })
        .catch((err) =>
          console.warn("Failed to advance claim on server:", err?.message),
        );
    }
  }

  return (
    <section aria-label="Warranty claims" className="wm-claims">
      <div className="panel-heading">
        <div>
          <h2>Claim Workflow</h2>
          <p>Every claim moves left to right. Escalated claims hand off to the manufacturer directly.</p>
        </div>
        {canCreate && (
          <button type="button" className="wm-btn wm-btn--primary wm-btn--small" onClick={() => setShowCreateClaim(true)}>
            + New Claim
          </button>
        )}
      </div>

      <div className="wm-claim-list">
        {paginatedClaims.map((claim) => (
          <article key={claim.id} className="wm-claim-card">
            <div className="wm-claim-card__header">
              <div>
                <span className="wm-claim-id">{claim.id}</span>
                <h3 className="wm-claim-title">{claim.component}</h3>
                <p className="cell-sub">
                  <code className="serial">{claim.serial}</code> ·{" "}
                  {claim.customer}
                </p>
              </div>
              <PriorityPill priority={claim.priority} />
            </div>

            <p className="wm-claim-issue">{claim.issue}</p>

            <ol className="wm-stepper">
              {CLAIM_STAGES.map((stage, idx) => (
                <li
                  key={stage}
                  className={`wm-stepper__step ${idx <= claim.stageIndex ? "is-complete" : ""} ${
                    idx === claim.stageIndex ? "is-current" : ""
                  }`}
                >
                  <span className="wm-stepper__dot" />
                  <span className="wm-stepper__label">{stage}</span>
                </li>
              ))}
            </ol>

            <div className="wm-claim-card__footer">
              <span className="cell-sub">
                Submitted {formatDate(claim.submitted)}
              </span>
              {claim.resolution && (
                <span className="wm-claim-resolution">{claim.resolution}</span>
              )}
              <div className="wm-claim-actions">
                <button
                  type="button"
                  className="wm-btn wm-btn--ghost wm-btn--small"
                  onClick={() => setSelectedClaim(claim)}
                >
                  {icons.eye} View Details
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="wm-btn wm-btn--ghost wm-btn--small"
                    onClick={() => setEditingClaim(claim)}
                  >
                    {icons.pencil} Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="wm-btn wm-btn--danger wm-btn--small"
                    onClick={() => setDeletingClaim(claim)}
                  >
                    Delete
                  </button>
                )}
                {canEdit && claim.stageIndex < 4 && (
                  <button
                    type="button"
                    className="wm-btn wm-btn--primary wm-btn--small"
                    onClick={() => handleAdvanceStage(claim)}
                  >
                    {icons.arrowRight} Advance Stage
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        {paginatedClaims.length === 0 && (
          <p className="cell-sub" style={{ padding: "24px 0", textAlign: "center" }}>
            No claims yet — create one with the button above.
          </p>
        )}
      </div>

      <div className="product-pagination-row">
        <Pagination
          currentPage={claimPage}
          totalPages={totalPages}
          totalItems={claims.length}
          pageSize={claimPageSize}
          onPageChange={setClaimPage}
          variant="table"
          onPageSizeChange={(val) => {
            setClaimPageSize(Number(val));
            setClaimPage(1);
          }}
        />
      </div>

      {showCreateClaim && (
        <ClaimFormModal
          title="New Claim"
          warranties={warranties}
          onClose={() => setShowCreateClaim(false)}
          onSubmit={(vals) => { onCreateClaim(vals); setShowCreateClaim(false); }}
        />
      )}
      {editingClaim && (
        <ClaimFormModal
          title="Edit Claim"
          initial={editingClaim}
          warranties={warranties}
          onClose={() => setEditingClaim(null)}
          onSubmit={(vals) => { onUpdateClaim({ ...editingClaim, ...vals }); setEditingClaim(null); }}
        />
      )}
      {deletingClaim && (
        <ConfirmDeleteModal
          message={`Delete claim ${deletingClaim.id}?`}
          onConfirm={() => { onDeleteClaim(deletingClaim); setDeletingClaim(null); }}
          onCancel={() => setDeletingClaim(null)}
        />
      )}
    </section>
  );
}

/* ------------------------------- Escalation ------------------------------- */

function EscalationPanel({ escalations, escalationPage, setEscalationPage, claims, onCreateEscalation, onUpdateEscalation, onDeleteEscalation, canCreate = true, canEdit = true, canDelete = true }) {
  const [escPageSize, setEscPageSize] = useState(10);
  const [showCreateEsc, setShowCreateEsc] = useState(false);
  const [editingEsc, setEditingEsc] = useState(null);
  const [deletingEsc, setDeletingEsc] = useState(null);

  // Claims at stage 3 (Vendor Escalation) that don't have an escalation record yet
  const escalatedClaimIds = new Set(escalations.map((e) => e.claimId));
  const pendingEscalationClaims = claims.filter(
    (c) => c.stageIndex === 3 && !escalatedClaimIds.has(c.id)
  );

  const escalationTotalPages = Math.max(
    1,
    Math.ceil(escalations.length / escPageSize),
  );
  const paginatedEscalations = escalations.slice(
    (escalationPage - 1) * escPageSize,
    escalationPage * escPageSize,
  );

  return (
    <section aria-label="Vendor escalations" className="wm-claims">
      <div className="panel-heading">
        <div>
          <h2>Manufacturer / Vendor Escalation</h2>
          <p>Claims that need the manufacturer's sign-off, RMA, or replacement stock.</p>
        </div>
        {canCreate && (
          <button type="button" className="wm-btn wm-btn--primary wm-btn--small" onClick={() => setShowCreateEsc(true)}>
            + New Escalation
          </button>
        )}
      </div>

      {pendingEscalationClaims.length > 0 && (
        <div className="wm-alert-group wm-alert-group--warning" style={{ marginBottom: 16 }}>
          <h3 className="wm-alert-group__title">Claims awaiting escalation ({pendingEscalationClaims.length})</h3>
          <ul className="wm-alert-group__list">
            {pendingEscalationClaims.map((c) => (
              <li key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>
                  <strong>{c.id}</strong> — {c.component} · <code className="serial">{c.serial}</code> · {c.customer}
                </span>
                {canCreate && (
                  <button
                    type="button"
                    className="wm-btn wm-btn--primary wm-btn--small"
                    style={{ marginLeft: 12, flexShrink: 0 }}
                    onClick={() => setShowCreateEsc({ claimId: c.id, manufacturer: "" })}
                  >
                    Escalate
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wm-table-card">
        <table>
          <thead>
            <tr>
              <th>Escalation</th>
              <th>Related Claim</th>
              <th>Manufacturer</th>
              <th>Escalated</th>
              <th>Expected Response</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEscalations.map((esc) => {
              const meta = ESCALATION_STATUS_META[esc.status];
              return (
                <tr key={esc.id}>
                  <td className="cell-title">{esc.id}</td>
                  <td>{esc.claimId}</td>
                  <td>{esc.manufacturer}</td>
                  <td>{formatDate(esc.escalated)}</td>
                  <td>{formatDate(esc.expectedResponse)}</td>
                  <td>
                    <span className={`pill pill--${meta.tone}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="cell-sub">{esc.note}</td>
                  <td>
                    <div className="act-actions">
                      {canEdit && (
                        <button type="button" className="act-btn act-edit" onClick={() => setEditingEsc(esc)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="act-btn act-delete" onClick={() => setDeletingEsc(esc)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginatedEscalations.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  No escalations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="product-pagination-row">
        <Pagination
          currentPage={escalationPage}
          totalPages={escalationTotalPages}
          totalItems={escalations.length}
          pageSize={escPageSize}
          onPageChange={setEscalationPage}
          variant="table"
          onPageSizeChange={(val) => {
            setEscPageSize(Number(val));
            setEscalationPage(1);
          }}
        />
      </div>

      {showCreateEsc && (
        <EscalationFormModal
          title="New Escalation"
          initial={typeof showCreateEsc === "object" ? showCreateEsc : {}}
          claims={claims}
          onClose={() => setShowCreateEsc(false)}
          onSubmit={(vals) => { onCreateEscalation(vals); setShowCreateEsc(false); }}
        />
      )}
      {editingEsc && (
        <EscalationFormModal
          title="Edit Escalation"
          initial={editingEsc}
          claims={claims}
          onClose={() => setEditingEsc(null)}
          onSubmit={(vals) => { onUpdateEscalation({ ...editingEsc, ...vals }); setEditingEsc(null); }}
        />
      )}
      {deletingEsc && (
        <ConfirmDeleteModal
          message={`Delete escalation ${deletingEsc.id}?`}
          onConfirm={() => { onDeleteEscalation(deletingEsc); setDeletingEsc(null); }}
          onCancel={() => setDeletingEsc(null)}
        />
      )}
    </section>
  );
}

/* ---------------------------------- Alerts --------------------------------- */

function AlertsPanel({ warranties, claims }) {
  const expiring = warranties.filter((w) => w.status === "expiring");
  const expired = warranties.filter((w) => w.status === "expired");
  const openClaims = claims.filter((c) => c.stageIndex < 4);

  return (
    <section aria-label="Alerts" className="wm-alerts">
      <div className="panel-heading">
        <h2>Alerts</h2>
        <p>Coverage windows and claims that need attention this week.</p>
      </div>

      <div className="wm-alert-groups">
        <AlertGroup
          title="Expiring within 90 days"
          tone="warning"
          items={expiring.map(
            (w) =>
              `${w.model} (${w.serial}) — ${w.customer}, expires ${formatDate(w.expires)}`,
          )}
          emptyText="Nothing expiring soon."
        />
        <AlertGroup
          title="Expired coverage"
          tone="danger"
          items={expired.map(
            (w) =>
              `${w.model} (${w.serial}) — ${w.customer}, expired ${formatDate(w.expires)}`,
          )}
          emptyText="No expired warranties."
        />
        <AlertGroup
          title="Claims awaiting action"
          tone="neutral"
          items={openClaims.map(
            (c) =>
              `${c.id} — ${c.component} at ${c.customer}, stage: ${CLAIM_STAGES[c.stageIndex]}`,
          )}
          emptyText="No open claims."
        />
      </div>
    </section>
  );
}

function AlertGroup({ title, tone, items, emptyText }) {
  return (
    <div className={`wm-alert-group wm-alert-group--${tone}`}>
      <h3 className="wm-alert-group__title">{title}</h3>
      {items.length === 0 ? (
        <p className="cell-sub">{emptyText}</p>
      ) : (
        <ul className="wm-alert-group__list">
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- View Warranty modal (read-only) ---------------------------- */

function ViewWarrantyModal({ warranty, onClose }) {
  const pct = coverageProgress(warranty.installed, warranty.expires);
  return (
    <div className="wm-modal-overlay">
      <div
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-warranty-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wm-modal-header">
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 id="view-warranty-title">Warranty Details</h2>
            <span className="wm-modal-header-badge">{warranty.id}</span>
          </div>
          <button
            type="button"
            className="wm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            {icons.close}
          </button>
        </div>

        <div className="wm-modal-body">
          <div className="wm-detail-grid">
            <div className="wm-detail-item">
              <span className="wm-detail-label">Component</span>
              <span className="wm-detail-value">{warranty.component}</span>
              <span className="cell-sub">{warranty.model}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Serial No.</span>
              <span className="wm-detail-value">{warranty.serial}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Customer</span>
              <span className="wm-detail-value">{warranty.customer}</span>
              <span className="cell-sub">{warranty.site}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Manufacturer</span>
              <span className="wm-detail-value">{warranty.manufacturer}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Coverage</span>
              <span className="wm-detail-value">{warranty.coverage}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Status</span>
              <span className="wm-detail-value">
                <StatusPill status={warranty.status} />
              </span>
            </div>
          </div>

          <div className="wm-detail-section">
            <span className="wm-detail-label">Warranty Period</span>
            <div
              className="coverage-track"
              style={{ width: "100%", marginTop: 6 }}
              title={`${Math.round(pct)}% of warranty period elapsed`}
            >
              <div
                className={`coverage-fill coverage-fill--${warranty.status}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="cell-sub coverage-dates" style={{ marginTop: 6 }}>
              {formatDate(warranty.installed)} – {formatDate(warranty.expires)}{" "}
              ({warranty.periodYears} years)
            </div>
          </div>

          {warranty.certificate && (
            <div className="wm-detail-section">
              <span className="wm-detail-label">Certificate</span>
              <p className="cell-sub">{warranty.certificate}</p>
            </div>
          )}
        </div>

        <div className="wm-modal-footer">
          <button
            type="button"
            className="modal-footer-close-primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Edit Warranty modal ---------------------------- */

function EditWarrantyModal({ warranty, onClose, onSave, warranties = [] }) {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    productAPI.getAll({ limit: 500 }).then((r) => setProducts(r.data?.data || [])).catch(() => {});
    vendorAPI.getAll({ limit: 500 }).then((r) => setVendors(r.data?.data || [])).catch(() => {});
    customerAPI.getAll({ limit: 500 }).then((r) => setCustomers(r.data?.data || [])).catch(() => {});
  }, []);

  const formik = useFormik({
    initialValues: {
      component: warranty.component,
      model: warranty.model,
      serial: warranty.serial,
      manufacturer: warranty.manufacturer,
      customer: warranty.customer,
      site: warranty.site || "",
      installed: warranty.installed,
      periodYears: warranty.periodYears,
      coverage: warranty.coverage,
    },
    validationSchema: warrantySchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      const updated = {
        ...warranty,
        component: values.component,
        model: values.model,
        serial: values.serial,
        manufacturer: values.manufacturer,
        customer: values.customer,
        site: values.site,
        installed: values.installed,
        periodYears: Number(values.periodYears),
        coverage: values.coverage,
      };
      onSave(updated);
    },
  });

  return (
    <div className="wm-modal-overlay">
      <div
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-warranty-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wm-modal-header">
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 id="edit-warranty-title">Edit Warranty</h2>
            <span className="wm-modal-header-badge">{warranty.id}</span>
          </div>
          <button
            type="button"
            className="wm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            {icons.close}
          </button>
        </div>
        <div className="wm-modal-body">
          <form onSubmit={formik.handleSubmit}>
            <div className="wm-detail-grid">
              <label className="field">
                <span>Component Type</span>
                <Dropdown
                  value={formik.values.component}
                  onChange={(val) => formik.setFieldValue("component", val)}
                  options={[
                    { value: "Solar Panel", label: "Solar Panel" },
                    { value: "Inverter", label: "Inverter" },
                    { value: "Battery", label: "Battery" },
                    { value: "Mounting Structure", label: "Mounting Structure" },
                    { value: "Charge Controller", label: "Charge Controller" },
                  ]}
                  variant="form"
                />
                {formik.touched.component && formik.errors.component && (
                  <span className="wm-field-error">{formik.errors.component}</span>
                )}
              </label>
              <label className="field">
                <span>Product / Model</span>
                {products.length > 0 ? (
                  <Dropdown
                    value={formik.values.model}
                    onChange={(val) => {
                      formik.setFieldValue("model", val);
                      const prod = products.find((p) => p.name === val);
                      if (prod?.brand) {
                        const matched = vendors.filter((v) => v.name === prod.brand);
                        if (matched.length === 1) formik.setFieldValue("manufacturer", matched[0].name);
                      }
                    }}
                    options={[{ value: "", label: "Select product" }, ...products.map((p) => ({ value: p.name, label: p.name }))]}
                    variant="form"
                  />
                ) : (
                  <input type="text" name="model" value={formik.values.model} onChange={formik.handleChange} onBlur={formik.handleBlur} className={formik.touched.model && formik.errors.model ? "wm-input-error" : ""} />
                )}
                {formik.touched.model && formik.errors.model && (
                  <span className="wm-field-error">{formik.errors.model}</span>
                )}
              </label>
              <label className="field">
                <span>Serial Number</span>
                <input
                  type="text"
                  name="serial"
                  value={formik.values.serial}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.serial && formik.errors.serial ? "wm-input-error" : ""}
                />
                {formik.touched.serial && formik.errors.serial && (
                  <span className="wm-field-error">{formik.errors.serial}</span>
                )}
              </label>
              <label className="field">
                <span>Vendor / Manufacturer</span>
                {(() => {
                  const selectedProd = products.find((p) => p.name === formik.values.model);
                  const filteredVendors = selectedProd?.brand
                    ? vendors.filter((v) => v.name === selectedProd.brand)
                    : vendors;
                  return filteredVendors.length > 0 ? (
                    <Dropdown
                      value={formik.values.manufacturer}
                      onChange={(val) => {
                        formik.setFieldValue("manufacturer", val);
                        formik.setFieldValue("customer", "");
                        formik.setFieldValue("site", "");
                      }}
                      options={[{ value: "", label: "Select vendor" }, ...filteredVendors.map((v) => ({ value: v.name, label: v.name }))]}
                      variant="form"
                    />
                  ) : (
                    <input type="text" name="manufacturer" value={formik.values.manufacturer} onChange={formik.handleChange} onBlur={formik.handleBlur} className={formik.touched.manufacturer && formik.errors.manufacturer ? "wm-input-error" : ""} />
                  );
                })()}
                {formik.touched.manufacturer && formik.errors.manufacturer && (
                  <span className="wm-field-error">{formik.errors.manufacturer}</span>
                )}
              </label>
              {(() => {
                const vendorName = formik.values.manufacturer;
                const vendorCustomerNames = vendorName
                  ? new Set(warranties.filter((w) => w.manufacturer === vendorName).map((w) => w.customer))
                  : null;
                const filteredCustomers = vendorCustomerNames
                  ? customers.filter((c) => vendorCustomerNames.has(c.name))
                  : customers;
                return (
                  <label className="field">
                    <span>Customer</span>
                    {filteredCustomers.length > 0 ? (
                      <Dropdown
                        value={formik.values.customer}
                        onChange={(val) => {
                          formik.setFieldValue("customer", val);
                          const cust = customers.find((c) => c.name === val);
                          const loc = cust?.address || cust?.location || cust?.city || "";
                          if (loc) formik.setFieldValue("site", loc);
                        }}
                        options={[{ value: "", label: vendorName ? "Select customer (vendor)" : "Select customer" }, ...filteredCustomers.map((c) => ({ value: c.name, label: c.name }))]}
                        variant="form"
                      />
                    ) : (
                      <input type="text" name="customer" value={formik.values.customer} onChange={formik.handleChange} onBlur={formik.handleBlur} className={formik.touched.customer && formik.errors.customer ? "wm-input-error" : ""} />
                    )}
                    {formik.touched.customer && formik.errors.customer && (
                      <span className="wm-field-error">{formik.errors.customer}</span>
                    )}
                  </label>
                );
              })()}
              <label className="field">
                <span>Site Location</span>
                <input
                  type="text"
                  name="site"
                  value={formik.values.site}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.site && formik.errors.site ? "wm-input-error" : ""}
                />
                {formik.touched.site && formik.errors.site && (
                  <span className="wm-field-error">{formik.errors.site}</span>
                )}
              </label>
              <label className="field">
                <span>Installation Date</span>
                <input
                  type="date"
                  name="installed"
                  value={formik.values.installed}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.installed && formik.errors.installed ? "wm-input-error" : ""}
                />
                {formik.touched.installed && formik.errors.installed && (
                  <span className="wm-field-error">{formik.errors.installed}</span>
                )}
              </label>
              <label className="field">
                <span>Warranty Period (years)</span>
                <input
                  type="number"
                  name="periodYears"
                  min="1"
                  value={formik.values.periodYears}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.periodYears && formik.errors.periodYears ? "wm-input-error" : ""}
                />
                {formik.touched.periodYears && formik.errors.periodYears && (
                  <span className="wm-field-error">{formik.errors.periodYears}</span>
                )}
              </label>
              <label className="field">
                <span>Coverage Type</span>
                <Dropdown
                  value={formik.values.coverage}
                  onChange={(val) => formik.setFieldValue("coverage", val)}
                  options={[
                    { value: "Product Only", label: "Product Only" },
                    { value: "Product + Labor", label: "Product + Labor" },
                    {
                      value: "Performance + Product",
                      label: "Performance + Product",
                    },
                  ]}
                  variant="form"
                />
              </label>
            </div>
            <div className="wm-modal-footer" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="wm-btn wm-btn--ghost wm-btn--small"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wm-btn wm-btn--primary wm-btn--small"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Claim detail modal ---------------------------- */

function ClaimDetailModal({ claim, onClose }) {
  return (
    <div className="wm-modal-overlay">
      <div
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wm-modal-header">
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 id="claim-detail-title">{claim.id}</h2>
            <span className="wm-modal-header-badge">Claim Detail</span>
          </div>
          <button
            type="button"
            className="wm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            {icons.close}
          </button>
        </div>

        <div className="wm-modal-body">
          <div className="wm-detail-grid">
            <div className="wm-detail-item">
              <span className="wm-detail-label">Warranty ID</span>
              <span className="wm-detail-value">{claim.warrantyId}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Component</span>
              <span className="wm-detail-value">{claim.component}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Serial No.</span>
              <span className="wm-detail-value">{claim.serial}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Customer</span>
              <span className="wm-detail-value">{claim.customer}</span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Priority</span>
              <span className="wm-detail-value">
                <PriorityPill priority={claim.priority} />
              </span>
            </div>
            <div className="wm-detail-item">
              <span className="wm-detail-label">Submitted</span>
              <span className="wm-detail-value">
                {formatDate(claim.submitted)}
              </span>
            </div>
          </div>

          <div className="wm-detail-section">
            <span className="wm-detail-label">Issue Description</span>
            <p className="cell-sub">{claim.issue}</p>
          </div>

          <div className="wm-detail-section">
            <span className="wm-detail-label">Current Stage</span>
            <ol className="wm-stepper">
              {CLAIM_STAGES.map((stage, idx) => (
                <li
                  key={stage}
                  className={`wm-stepper__step ${idx <= claim.stageIndex ? "is-complete" : ""} ${
                    idx === claim.stageIndex ? "is-current" : ""
                  }`}
                >
                  <span className="wm-stepper__dot" />
                  <span className="wm-stepper__label">{stage}</span>
                </li>
              ))}
            </ol>
          </div>

          {claim.resolution && (
            <div className="wm-detail-section">
              <span className="wm-detail-label">Resolution</span>
              <p className="cell-sub">{claim.resolution}</p>
            </div>
          )}
        </div>

        <div className="wm-modal-footer">
          <button
            type="button"
            className="modal-footer-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Register modal ---------------------------- */

function RegisterWarrantyModal({ onClose, onSubmit, warranties = [] }) {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    productAPI.getAll({ limit: 500 }).then((r) => setProducts(r.data?.data || [])).catch(() => {});
    vendorAPI.getAll({ limit: 500 }).then((r) => setVendors(r.data?.data || [])).catch(() => {});
    customerAPI.getAll({ limit: 500 }).then((r) => setCustomers(r.data?.data || [])).catch(() => {});
  }, []);

  const formik = useFormik({
    initialValues: {
      component: "Solar Panel",
      model: "",
      serial: "",
      manufacturer: "",
      customer: "",
      site: "",
      installed: "",
      periodYears: "10",
      coverage: "Product Only",
    },
    validationSchema: warrantySchema,
    onSubmit: (values) => {
      onSubmit(values);
    },
  });

  return (
    <div className="wm-modal-overlay">
      <div
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-warranty-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wm-modal-header">
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 id="register-warranty-title">Register Warranty</h2>
          </div>
          <button
            type="button"
            className="wm-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            {icons.close}
          </button>
        </div>
        <div className="wm-modal-body">
          <form onSubmit={formik.handleSubmit}>
            <div className="wm-detail-grid">
              <label className="field">
                <span>Component Type</span>
                <Dropdown
                  value={formik.values.component}
                  onChange={(val) => formik.setFieldValue("component", val)}
                  options={[
                    { value: "Solar Panel", label: "Solar Panel" },
                    { value: "Inverter", label: "Inverter" },
                    { value: "Battery", label: "Battery" },
                    { value: "Mounting Structure", label: "Mounting Structure" },
                    { value: "Charge Controller", label: "Charge Controller" },
                  ]}
                  variant="form"
                />
              </label>
              <label className="field">
                <span>Product / Model</span>
                {products.length > 0 ? (
                  <Dropdown
                    value={formik.values.model}
                    onChange={(val) => {
                      formik.setFieldValue("model", val);
                      const prod = products.find((p) => p.name === val);
                      if (prod?.brand) {
                        const matched = vendors.filter((v) => v.name === prod.brand);
                        if (matched.length === 1) formik.setFieldValue("manufacturer", matched[0].name);
                        else formik.setFieldValue("manufacturer", "");
                      }
                    }}
                    options={[{ value: "", label: "Select product" }, ...products.map((p) => ({ value: p.name, label: p.name }))]}
                    variant="form"
                  />
                ) : (
                  <input type="text" name="model" value={formik.values.model} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="e.g. SunMax 440W Mono" className={formik.touched.model && formik.errors.model ? "wm-input-error" : ""} />
                )}
                {formik.touched.model && formik.errors.model && (
                  <span className="wm-field-error">{formik.errors.model}</span>
                )}
              </label>
              <label className="field">
                <span>Serial Number</span>
                <input
                  type="text"
                  name="serial"
                  value={formik.values.serial}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. SM440-2291-A"
                  className={
                    formik.touched.serial && formik.errors.serial
                      ? "wm-input-error"
                      : ""
                  }
                />
                {formik.touched.serial && formik.errors.serial && (
                  <span className="wm-field-error">{formik.errors.serial}</span>
                )}
              </label>
              <label className="field">
                <span>Vendor</span>
                {(() => {
                  const selectedProd = products.find((p) => p.name === formik.values.model);
                  const filteredVendors = selectedProd?.brand
                    ? vendors.filter((v) => v.name === selectedProd.brand)
                    : vendors;
                  return filteredVendors.length > 0 ? (
                    <Dropdown
                      value={formik.values.manufacturer}
                      onChange={(val) => {
                        formik.setFieldValue("manufacturer", val);
                        formik.setFieldValue("customer", "");
                        formik.setFieldValue("site", "");
                      }}
                      options={[{ value: "", label: "Select vendor" }, ...filteredVendors.map((v) => ({ value: v.name, label: v.name }))]}
                      variant="form"
                    />
                  ) : (
                    <input type="text" name="manufacturer" value={formik.values.manufacturer} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="e.g. SunMax Energy" className={formik.touched.manufacturer && formik.errors.manufacturer ? "wm-input-error" : ""} />
                  );
                })()}
                {formik.touched.manufacturer && formik.errors.manufacturer && (
                  <span className="wm-field-error">{formik.errors.manufacturer}</span>
                )}
              </label>
              {(() => {
                const vendorName = formik.values.manufacturer;
                const vendorCustomerNames = vendorName
                  ? new Set(warranties.filter((w) => w.manufacturer === vendorName).map((w) => w.customer))
                  : null;
                const filteredCustomers = vendorCustomerNames
                  ? customers.filter((c) => vendorCustomerNames.has(c.name))
                  : customers;
                return (
                  <label className="field">
                    <span>Customer</span>
                    {filteredCustomers.length > 0 ? (
                      <Dropdown
                        value={formik.values.customer}
                        onChange={(val) => {
                          formik.setFieldValue("customer", val);
                          const cust = customers.find((c) => c.name === val);
                          const loc = cust?.address || cust?.location || cust?.city || "";
                          if (loc) formik.setFieldValue("site", loc);
                        }}
                        options={[{ value: "", label: vendorName ? "Select customer (vendor)" : "Select customer" }, ...filteredCustomers.map((c) => ({ value: c.name, label: c.name }))]}
                        variant="form"
                      />
                    ) : (
                      <input type="text" name="customer" value={formik.values.customer} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Customer name" className={formik.touched.customer && formik.errors.customer ? "wm-input-error" : ""} />
                    )}
                    {formik.touched.customer && formik.errors.customer && (
                      <span className="wm-field-error">{formik.errors.customer}</span>
                    )}
                  </label>
                );
              })()}
              <label className="field">
                <span>Site Location</span>
                <input
                  type="text"
                  name="site"
                  placeholder="e.g. Vesu, Surat"
                  value={formik.values.site}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.site && formik.errors.site ? "wm-input-error" : ""}
                />
                {formik.touched.site && formik.errors.site && (
                  <span className="wm-field-error">{formik.errors.site}</span>
                )}
              </label>
              <label className="field">
                <span>Installation Date</span>
                <input
                  type="date"
                  name="installed"
                  value={formik.values.installed}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.installed && formik.errors.installed ? "wm-input-error" : ""}
                />
                {formik.touched.installed && formik.errors.installed && (
                  <span className="wm-field-error">{formik.errors.installed}</span>
                )}
              </label>
              <label className="field">
                <span>Warranty Period (years)</span>
                <input
                  type="number"
                  name="periodYears"
                  min="1"
                  value={formik.values.periodYears}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={formik.touched.periodYears && formik.errors.periodYears ? "wm-input-error" : ""}
                />
                {formik.touched.periodYears && formik.errors.periodYears && (
                  <span className="wm-field-error">{formik.errors.periodYears}</span>
                )}
              </label>
              <label className="field">
                <span>Coverage Type</span>
                <Dropdown
                  value={formik.values.coverage}
                  onChange={(val) => formik.setFieldValue("coverage", val)}
                  options={[
                    { value: "Product Only", label: "Product Only" },
                    { value: "Product + Labor", label: "Product + Labor" },
                    {
                      value: "Performance + Product",
                      label: "Performance + Product",
                    },
                  ]}
                  variant="form"
                />
              </label>
            </div>
            <div className="wm-modal-footer" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="wm-btn wm-btn--ghost wm-btn--small"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="wm-btn wm-btn--primary wm-btn--small"
              >
                Save Warranty
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- ClaimFormModal (Create / Edit) ---------------------------- */

function ClaimFormModal({ title, initial = {}, warranties = [], onClose, onSubmit }) {
  const [form, setForm] = useState({
    warrantyId: initial.warrantyId || "",
    component: initial.component || "",
    serial: initial.serial || "",
    customer: initial.customer || "",
    issue: initial.issue || "",
    priority: initial.priority || "medium",
    resolution: initial.resolution || "",
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleWarrantySelect(val) {
    const w = warranties.find((x) => x.id === val);
    setForm((prev) => ({
      ...prev,
      warrantyId: val,
      component: w?.component || prev.component,
      serial: w?.serial || prev.serial,
      customer: w?.customer || prev.customer,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.warrantyId || !form.issue) return;
    onSubmit(form);
  }

  return (
    <div className="wm-modal-overlay">
      <div className="wm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="wm-modal-header">
          <h2>{title}</h2>
          <button type="button" className="wm-modal-close" onClick={onClose} aria-label="Close">{icons.close}</button>
        </div>
        <div className="wm-modal-body">
          <form onSubmit={handleSubmit}>
            <div className="wm-detail-grid">
              <label className="field">
                <span>Warranty</span>
                {warranties.length > 0 ? (
                  <Dropdown
                    value={form.warrantyId}
                    onChange={handleWarrantySelect}
                    options={[{ value: "", label: "Select warranty…" }, ...sortById(warranties, "id").map((w) => ({ value: w.id, label: `${w.id} — ${w.component}` }))]}
                    variant="form"
                  />
                ) : (
                  <input type="text" name="warrantyId" value={form.warrantyId} onChange={handleChange} placeholder="e.g. WR-1042" required />
                )}
              </label>
              <label className="field">
                <span>Component</span>
                <input type="text" name="component" value={form.component} onChange={handleChange} placeholder="e.g. Solar Panel" />
              </label>
              <label className="field">
                <span>Serial No.</span>
                <input type="text" name="serial" value={form.serial} onChange={handleChange} placeholder="e.g. SM440-2291-A" />
              </label>
              <label className="field">
                <span>Customer</span>
                <input type="text" name="customer" value={form.customer} onChange={handleChange} placeholder="Customer name" />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Issue Description *</span>
                <textarea name="issue" value={form.issue} onChange={handleChange} rows={3} required style={{ resize: "vertical" }} />
              </label>
              <label className="field">
                <span>Priority</span>
                <Dropdown
                  value={form.priority}
                  onChange={(val) => setForm((p) => ({ ...p, priority: val }))}
                  options={[
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                  variant="form"
                />
              </label>
              <label className="field">
                <span>Resolution (optional)</span>
                <input type="text" name="resolution" value={form.resolution} onChange={handleChange} placeholder="Resolution note" />
              </label>
            </div>
            <div className="wm-modal-footer" style={{ marginTop: 16 }}>
              <button type="button" className="wm-btn wm-btn--ghost wm-btn--small" onClick={onClose}>Cancel</button>
              <button type="submit" className="wm-btn wm-btn--primary wm-btn--small">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- EscalationFormModal (Create / Edit) ---------------------------- */

function EscalationFormModal({ title, initial = {}, claims = [], onClose, onSubmit }) {
  const [form, setForm] = useState({
    claimId: initial.claimId || "",
    manufacturer: initial.manufacturer || "",
    escalated: initial.escalated || new Date().toISOString().split("T")[0],
    expectedResponse: initial.expectedResponse || "",
    status: initial.status || "awaiting-vendor",
    note: initial.note || "",
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.claimId) return;
    onSubmit(form);
  }

  return (
    <div className="wm-modal-overlay">
      <div className="wm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="wm-modal-header">
          <h2>{title}</h2>
          <button type="button" className="wm-modal-close" onClick={onClose} aria-label="Close">{icons.close}</button>
        </div>
        <div className="wm-modal-body">
          <form onSubmit={handleSubmit}>
            <div className="wm-detail-grid">
              <label className="field">
                <span>Related Claim *</span>
                {claims.length > 0 ? (
                  <Dropdown
                    value={form.claimId}
                    onChange={(val) => setForm((p) => ({ ...p, claimId: val }))}
                    options={[{ value: "", label: "Select claim…" }, ...sortById(claims, "id").map((c) => ({ value: c.id, label: `${c.id} — ${c.component}` }))]}
                    variant="form"
                    searchable
                  />
                ) : (
                  <input type="text" name="claimId" value={form.claimId} onChange={handleChange} placeholder="e.g. CLM-3301" required />
                )}
              </label>
              <label className="field">
                <span>Manufacturer</span>
                <input type="text" name="manufacturer" value={form.manufacturer} onChange={handleChange} placeholder="e.g. VoltCell Storage" />
              </label>
              <label className="field">
                <span>Escalated Date</span>
                <input type="date" name="escalated" value={form.escalated} onChange={handleChange} />
              </label>
              <label className="field">
                <span>Expected Response</span>
                <input type="date" name="expectedResponse" value={form.expectedResponse} onChange={handleChange} />
              </label>
              <label className="field">
                <span>Status</span>
                <Dropdown
                  value={form.status}
                  onChange={(val) => setForm((p) => ({ ...p, status: val }))}
                  options={[
                    { value: "awaiting-vendor", label: "Awaiting Vendor" },
                    { value: "vendor-responded", label: "Vendor Responded" },
                    { value: "closed", label: "Closed" },
                  ]}
                  variant="form"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Notes</span>
                <textarea name="note" value={form.note} onChange={handleChange} rows={3} style={{ resize: "vertical" }} />
              </label>
            </div>
            <div className="wm-modal-footer" style={{ marginTop: 16 }}>
              <button type="button" className="wm-btn wm-btn--ghost wm-btn--small" onClick={onClose}>Cancel</button>
              <button type="submit" className="wm-btn wm-btn--primary wm-btn--small">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- ConfirmDeleteModal ---------------------------- */

function ConfirmDeleteModal({ message, onConfirm, onCancel }) {
  return (
    <div className="wm-modal-overlay">
      <div className="wm-modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="wm-modal-header">
          <h2>Confirm Delete</h2>
          <button type="button" className="wm-modal-close" onClick={onCancel} aria-label="Close">{icons.close}</button>
        </div>
        <div className="wm-modal-body">
          <p style={{ marginBottom: 0 }}>{message}</p>
        </div>
        <div className="wm-modal-footer" style={{ marginTop: 16 }}>
          <button type="button" className="wm-btn wm-btn--ghost wm-btn--small" onClick={onCancel}>Cancel</button>
          <button type="button" className="wm-btn wm-btn--danger wm-btn--small" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
