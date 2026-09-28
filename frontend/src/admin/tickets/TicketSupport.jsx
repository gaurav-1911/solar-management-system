import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { ticketSupportSchema, ticketSupportEditSchema, normalizePhone, toLocalPhone } from "../../utils/AdminValidation";
import { Dropdown, TableLoader, Pagination } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import "./TicketSupport.css";
import { ticketAPI, customerAPI } from "../../services";
import { fetchAllPages } from "../../utils";
import { createProfilePdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";

/**
 * TicketSupport
 * Customer-support ticketing module backed by the live /api/ticket-support
 * REST endpoints: raise a ticket, comment (with an
 * internal-note toggle), attach file metadata (names/sizes only — nothing
 * is uploaded anywhere), track status through its lifecycle, and set a
 * priority level.
 *
 * All data is fetched from the backend on mount; every mutation (create,
 * update, status/priority changes, comments, attachments, delete)
 * is persisted to the server so the queue survives a refresh.
 */

/* ---------------------------------- constants ---------------------------------- */

const STATUSES = [
  "Open",
  "In Progress",
  "Waiting on Customer",
  "Resolved",
  "Closed",
];
const OPEN_STATUSES = ["Open", "In Progress", "Waiting on Customer"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const CATEGORIES = [
  "Billing",
  "General",
  "Installation",
  "Technical",
  "Warranty",
];
const STATUS_TONE = {
  Open: "neutral",
  "In Progress": "warning",
  "Waiting on Customer": "info",
  Resolved: "success",
  Closed: "neutral",
};

const PRIORITY_TONE = {
  Low: "neutral",
  Medium: "info",
  High: "warning",
  Critical: "danger",
};

function statusClass(status) {
  return STATUS_TONE[status] || "neutral";
}

function prioClass(priority) {
  return PRIORITY_TONE[priority] || "neutral";
}

/* ------------------------------------ helpers ------------------------------------ */

let idCounter = 6000;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function nowISO() {
  return new Date().toISOString();
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function isPast(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date(nowISO()).getTime();
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ── File-type helpers & preview component ─────────────────────────── */

function isImageFile(name, mimeType) {
  if (mimeType && mimeType.startsWith("image/")) return true;
  const ext = (name || "").split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

function isPdfFile(name, mimeType) {
  if (mimeType === "application/pdf") return true;
  return (name || "").toLowerCase().endsWith(".pdf");
}

function isVideoFile(name, mimeType) {
  if (mimeType && mimeType.startsWith("video/")) return true;
  const ext = (name || "").split(".").pop().toLowerCase();
  return ["mp4", "webm", "ogg", "mov"].includes(ext);
}

function getFileIcon(name, mimeType) {
  if (isImageFile(name, mimeType)) return "🖼️";
  if (isPdfFile(name, mimeType)) return "📄";
  if (isVideoFile(name, mimeType)) return "🎬";
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  if (["zip", "rar", "7z"].includes(ext)) return "📦";
  if (["txt", "csv"].includes(ext)) return "📃";
  return "📎";
}

function AttachmentPreview({ attachment }) {
  const { name, url, mimeType } = attachment;
  const previewUrl = url || attachment._localPreviewUrl;
  if (previewUrl && isImageFile(name, mimeType)) {
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <img
          src={previewUrl}
          alt={name}
          style={{
            maxWidth: "100%",
            maxHeight: 220,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            objectFit: "contain",
            cursor: "pointer",
            display: "block",
          }}
          onClick={() => window.open(previewUrl, "_blank")}
        />
      </div>
    );
  }
  if (previewUrl && isPdfFile(name, mimeType)) {
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <iframe
          src={previewUrl}
          title={name}
          style={{
            width: "100%",
            height: 220,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
        />
      </div>
    );
  }
  if (previewUrl && isVideoFile(name, mimeType)) {
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <video
          src={previewUrl}
          controls
          style={{
            maxWidth: "100%",
            maxHeight: 220,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
        />
      </div>
    );
  }
  if (previewUrl) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginTop: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: "#2563eb",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        Open file ↗
      </a>
    );
  }
  return null;
}

function historyEntry(action, detail = "") {
  return { id: nextId("HST"), action, detail, date: nowISO() };
}

// Map a raw server ticket (Mongo _id + createdAt/updatedAt timestamps) into
// the shape this module uses (id / createdDate / updatedDate / sub-arrays),
// and derive a short human-friendly ticket code for display.
function normalizeTicket(t) {
  const rawId = t._id || t.id;
  return {
    ...t,
    id: rawId,
    ticketId: t.ticketId || `TKT-${String(rawId).slice(-4).toUpperCase()}`,
    createdDate: t.createdDate || t.createdAt,
    updatedDate: t.updatedDate || t.updatedAt,
    // Server subdocuments have no id, so synthesize stable ones for React
    // keys and attachment removal.
    comments: (t.comments || []).map((c, i) => ({ ...c, id: c.id || `CM-${i + 1}` })),
    attachments: (t.attachments || []).map((a, i) => ({ ...a, id: a.id || `AT-${i + 1}` })),
    history: (t.history || []).map((h, i) => ({ ...h, id: h.id || `HST-${i + 1}` })),
  };
}

// Strip the frontend-only fields before persisting back to the server.
function toServerTicket(t) {
  return {
    subject: t.subject,
    description: t.description,
    customer: t.customer,
    email: t.email,
    phone: t.phone,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedAgent: t.assignedAgent,
    comments: t.comments,
    attachments: t.attachments.map(({ _localPreviewUrl, ...rest }) => rest),
    history: t.history,
  };
}



/* --------------------------------- small UI bits --------------------------------- */

function Pill({ value, toneMap }) {
  const tone = toneMap[value] ?? "neutral";
  return <span className={`ts-pill ts-pill--${tone}`}>{value}</span>;
}

// function Avatar({ name }) {
//   return (
//     <span
//       className={`ts-avatar ${name === "Unassigned" ? "ts-avatar--empty" : ""}`}
//       title={name}
//     >
//       {initials(name)}
//     </span>
//   );
// }

function StatusStepper({ status }) {
  const idx = STATUSES.indexOf(status);
  return (
    <ol className="ts-stepper">
      {STATUSES.map((s, i) => (
        <li
          key={s}
          className={`ts-stepper__step ${i <= idx ? "is-complete" : ""} ${i === idx ? "is-current" : ""}`}
        >
          <span className="ts-stepper__dot" />
          <span className="ts-stepper__label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------ module ------------------------------------ */

export default function TicketSupport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canDo } = useAuth();

  // Reset internal detail sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setViewTicketId(null);
  }, [location.pathname, location.search, location.key]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [viewTicketId, setViewTicketId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { success, error } = useToast();

  async function raiseTicket(data) {
    const payload = {
      subject: data.subject,
      description: data.description,
      customer: data.customer,
      email: data.email,
      phone: data.phone,
      category: data.category,
      priority: data.priority,
      status: "Open",
      assignedAgent: "Unassigned",
      comments: [],
      attachments: [],
      history: [
        historyEntry(
          "Ticket raised",
          `${data.category} — ${data.priority} priority`,
        ),
      ],
    };
    try {
      const res = await ticketAPI.create(payload);
      const created = normalizeTicket(res.data?.data || { ...payload, _id: nextId("TKT") });
      setTickets((prev) => [created, ...prev]);
      setShowCreate(false);
      success(`Ticket ${created.ticketId} raised.`);
    } catch (err) {
      console.warn("Failed to raise ticket:", err.message);
      error("Could not raise ticket — server unreachable.");
      setShowCreate(false);
    }
  }

  // Persist an optimistic local update to the backend and reconcile with the
  // server response (or the local copy if the response has no data).
  async function touch(id, patch, historyEvt) {
    const current = tickets.find((t) => t.id === id);
    if (!current) return;
    const updated = {
      ...current,
      ...patch,
      updatedDate: nowISO(),
      history: historyEvt ? [...current.history, historyEvt] : current.history,
    };
    setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    try {
      const res = await ticketAPI.update(id, toServerTicket(updated));
      const saved = res.data?.data;
      if (saved) {
        setTickets((prev) =>
          prev.map((t) => (t.id === id ? normalizeTicket(saved) : t)),
        );
      }
    } catch (err) {
      console.warn("Failed to sync ticket:", err.message);
      error(err.response?.data?.message || "Could not save changes — server unreachable.");
    }
  }

  function updateFields(id, patch) {
    touch(id, patch);
  }

  function changeStatus(id, status) {
    const current = tickets.find((t) => t.id === id);
    if (!current) return;
    touch(
      id,
      { status },
      historyEntry("Status changed", `${current.status} → ${status}`),
    );
  }

  function changePriority(id, priority) {
    touch(
      id,
      { priority },
      historyEntry("Priority changed", priority),
    );
  }

  function addComment(id, text, role) {
    const current = tickets.find((t) => t.id === id);
    if (!current) return;
    const comment = {
      id: nextId("CM"),
      author:
        role === "customer"
          ? "Customer"
          : role === "internal"
            ? "Support (internal note)"
            : "Support Agent",
      role,
      text,
      date: nowISO(),
    };
    touch(
      id,
      {
        comments: [...current.comments, comment],
        status:
          role !== "customer" && current.status === "Open"
            ? "In Progress"
            : current.status,
      },
      historyEntry(
        role === "internal" ? "Internal note added" : "Reply sent",
        text.length > 60 ? text.slice(0, 60) + "…" : text,
      ),
    );
    success("Comment added.");
  }

  async function addAttachments(id, files) {
    const current = tickets.find((t) => t.id === id);
    if (!current) return;

    // Build local preview entries with blob URLs for instant visual feedback
    const localEntries = files.map((f) => ({
      id: nextId("AT"),
      name: f.name,
      size: f.size,
      mimeType: f.type || "",
      addedBy: user?.name || "You",
      date: nowISO(),
      url: "",
      _localPreviewUrl: URL.createObjectURL(f),
    }));

    // Show previews immediately
    setTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, attachments: [...t.attachments, ...localEntries] }
          : t,
      ),
    );

    success(`Uploading ${files.length} file(s)…`);

    // Upload each file to Cloudinary
    for (let i = 0; i < files.length; i++) {
      try {
        const res = await ticketAPI.uploadAttachment(id, files[i]);
        if (res.data?.success && res.data?.data?.attachment) {
          const serverAtt = res.data.data.attachment;
          // Merge server data onto local entry — keep localPreviewUrl as fallback
          // and ensure mimeType/url are present even if server response is incomplete
          setTickets((prev) =>
            prev.map((t) => {
              if (t.id !== id) return t;
              const updatedAttachments = t.attachments.map((a) => {
                if (a.id !== localEntries[i].id) return a;
                return {
                  ...a,
                  ...serverAtt,
                  id: a.id,
                  // Always keep local preview as fallback if server has no URL
                  _localPreviewUrl: serverAtt.url ? undefined : a._localPreviewUrl,
                  mimeType: serverAtt.mimeType || a.mimeType || files[i].type || "",
                  url: serverAtt.url || a.url || "",
                };
              });
              return { ...t, attachments: updatedAttachments };
            }),
          );
        }
      } catch (err) {
        console.warn("Failed to upload:", files[i].name, err.message);
        error(`Failed to upload ${files[i].name}`);
        // Remove the local entry on failure
        setTickets((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, attachments: t.attachments.filter((a) => a.id !== localEntries[i].id) }
              : t,
          ),
        );
        URL.revokeObjectURL(localEntries[i]._localPreviewUrl);
      }
    }
  }

  function removeAttachment(id, attachmentId) {
    const current = tickets.find((t) => t.id === id);
    if (!current) return;
    touch(id, {
      attachments: current.attachments.filter((a) => a.id !== attachmentId),
    });
  }

  function openDetailModal(t) {
    setViewTicketId(t.id);
  }

  function editTicket(t) {
    setSelectedId(t.id);
  }

  const [deleteLoading, setDeleteLoading] = useState(false);
  async function deleteTicket(id) {
    if (!id || deleteLoading) return;
    setDeleteLoading(true);
    const t = tickets.find((x) => x.id === id);
    try {
      await ticketAPI.delete(id);
      setTickets((prev) => prev.filter((x) => x.id !== id));
      if (selectedId === id) setSelectedId(null);
      success(`Ticket ${t?.ticketId || t?.id} deleted.`);
    } catch (err) {
      console.warn("Failed to delete ticket:", err.message);
      error("Could not delete ticket — server unreachable.");
    } finally {
      setDeleteLoading(false);
      setDeleteConfirm(null);
    }
  }

const downloadTicketLog = async (t) => {
  const doc = await createProfilePdf({
    bannerName: t.subject,
    bannerSubtitle: `Ticket ID: ${t.ticketId || t.id}`,
    bannerRight: [`Status: ${t.status || "—"}`, `Priority: ${t.priority || "—"}`],
    sections: [
      {
        title: "Contact Information",
        fields: [
          ["Customer", t.customer],
          ["Email", t.email],
          ["Phone", t.phone],
        ],
      },
      {
        title: "Ticket Details",
        fields: [
          ["Category", t.category],
          ["Created Date", formatDateTime(t.createdDate)],
          ["Last Updated", formatDateTime(t.updatedDate)],
          ["Comments", t.comments?.length || 0],
          ["Attachments", t.attachments?.length || 0],
        ],
      },
    ],
    notes: t.description,
  });

  const safeCustomer = (t.customer || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  const safeSubject = (t.subject || "Ticket")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`TicketLog_${safeCustomer}_${safeSubject}.pdf`);

  success(`Ticket log for ${t.customer} downloaded.`);
};
  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.subject.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        (t.ticketId || t.id).toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesPriority =
        priorityFilter === "all" || t.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, search, statusFilter, priorityFilter]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const critical = tickets.filter(
      (t) => t.priority === "Critical" && OPEN_STATUSES.includes(t.status),
    ).length;
    const resolvedClosed = tickets.filter(
      (t) => t.status === "Resolved" || t.status === "Closed",
    ).length;
    return { total: tickets.length, open, critical, resolvedClosed };
  }, [tickets]);

  const viewTicket = tickets.find((t) => t.id === viewTicketId) || null;
  const selected = tickets.find((t) => t.id === selectedId) || null;

  const filteredTotalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // Page resets handled by the useEffect dependencies above.

  // Fetch tickets with server-side pagination.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { page: currentPage, limit: pageSize };
    if (search.trim()) params.search = search.trim();
    if (statusFilter !== "all") params.status = statusFilter;
    if (priorityFilter !== "all") params.priority = priorityFilter;
    ticketAPI.getAll(params)
      .then((res) => {
        if (cancelled) return;
        const docs = res.data?.data || [];
        setTickets(docs.map(normalizeTicket));
        setServerTotal(res.data?.pagination?.total || docs.length);
        setLoadError(false);
      })
      .catch((err) => {
        console.warn("Failed to load support tickets:", err.message);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentPage, pageSize, search, statusFilter, priorityFilter]);

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="tickets-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="ticket-module">
      <header className="ts-header">
        <div>
          <h1 className="ts-title">Ticket Support System</h1>
          <p className="ts-subtitle">
            Every support request in one queue — raise, assign, discuss, attach
            files, and track status through to close.
          </p>
        </div>
        {canDo("tickets", "create") && (
          <button
            type="button"
            className="ts-btn ts-btn--primary"
            onClick={() => setShowCreate(true)}
          >
            + Raise Ticket
          </button>
        )}
      </header>

      <div className="ticket-stats-grid">
        <StatCard
          title="Total Tickets"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="blue"
        />
        <StatCard
          title="Open Tickets"
          value={stats.open.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Critical Priority"
          value={stats.critical.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="red"
        />
        <StatCard
          title="Resolved / Closed"
          value={stats.resolvedClosed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="green"
        />
      </div>

      <div className="ts-toolbar">
        <div className="ts-search-wrap">
          <svg
            width="18"
            height="18"
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
            placeholder="Search by subject, customer or ticket ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="ts-search-clear" onClick={() => setSearch("")}>
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
            { value: "all", label: "All Statuses" },
            ...STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <Dropdown
          value={priorityFilter}
          onChange={(val) => setPriorityFilter(val)}
          options={[
            { value: "all", label: "All Priorities" },
            ...PRIORITIES.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>


      <div className="ts-table-card">
        <div className="ts-table-wrap">
        <table className="ts-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Subject</th>
              <th>Customer</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Updated</th>
              <th aria-label="Actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoader colSpan={8} />
            ) : loadError ? (
              <tr>
                <td colSpan={8} className="ts-empty-row">
                  Could not load tickets — check your connection.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="ts-empty-row">
                  {tickets.length === 0
                    ? "No tickets yet — raise one with the button above."
                    : "No tickets match your search or filter."}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code className="ts-code">{t.ticketId || t.id}</code>
                  </td>
                  <td>
                    <div className="ts-subject">{t.subject}</div>
                    <div className="cell-sub">{t.description}</div>
                  </td>
                  <td>
                    <div className="cell-title">{t.customerName || t.customer}</div>
                    <div className="cell-sub">{t.customerEmail || t.customerPhone}</div>
                  </td>
                  <td>
                    <span className="ts-cat">{t.category}</span>
                  </td>
                  <td>
                    <span className={`pill pill--${prioClass(t.priority)}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`pill pill--${statusClass(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>{formatDateTime(t.updatedAt || t.createdAt)}</td>
                  <td>
                    <div className="act-actions">
                      <button
                        type="button"
                        className="act-btn act-view"
                        onClick={() => openDetailModal(t)}
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
                        module="tickets"
                        onClick={() => {
                          const ticketId = t.serverId || t._id || t.id;
                          navigate(`/admin/tickets-activity/${ticketId}`, {
                            state: { target: { recordId: ticketId, recordLabel: t.ticketId || t.subject, module: "tickets" } },
                          });
                        }}
                        title="View Ticket Activity Log"
                      />
                      {canDo("tickets", "edit") && (
                        <button
                          type="button"
                          className="act-btn act-edit"
                          onClick={() => editTicket(t)}
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
                      {canDo("tickets", "delete") && (
                        <button
                          type="button"
                          className="act-btn act-delete"
                          onClick={() => setDeleteConfirm(t)}
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
              ))
            )}
          </tbody>
        </table>
        </div>
        {filtered.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={filteredTotalPages}
            onPageChange={setCurrentPage}
            totalItems={serverTotal}
          />
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete Ticket"
          message={`Are you sure you want to delete ticket ${deleteConfirm.ticketId || deleteConfirm.id} (${deleteConfirm.customer})?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            deleteTicket(deleteConfirm.id);
          }}
          onCancel={() => setDeleteConfirm(null)}
          loading={deleteLoading}
        />
      )}

      {viewTicket && (
        <ViewTicketModal
          ticket={viewTicket}
          onClose={() => setViewTicketId(null)}
          userRole={user?.role}
        />
      )}

      {selected && (
        <TicketDetailModal
          ticket={selected}
          onClose={() => setSelectedId(null)}
          onUpdateFields={updateFields}
          onChangeStatus={changeStatus}
          onChangePriority={changePriority}
          onAddComment={addComment}
          onAddAttachments={addAttachments}
          onRemoveAttachment={removeAttachment}
          onDelete={deleteTicket}
          userRole={user?.role}
        />
      )}

      {showCreate && (
        <RaiseTicketModal
          onClose={() => setShowCreate(false)}
          onCreate={raiseTicket}
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
                  {showLogModal.subject || showLogModal._id}
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
                      {showLogModal.status || "Pending"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Priority</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>{showLogModal.priority || "Low"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date Logged</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.date ? formatDate(showLogModal.date) : (showLogModal.createdAt ? new Date(showLogModal.createdAt).toLocaleDateString("en-IN") : "—")}
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
                  Ticket Information
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customer}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Subject / Issue</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.subject}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Assigned Engineer</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.assigned || "Unassigned"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Category</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.category || "—"}</div>
                  </div>
                </div>

                {showLogModal.description && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Log Remarks &amp; Description</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.description}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadTicketLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

/* ------------------------------------- Detail modal ------------------------------------- */

function TicketDetailModal({
  ticket,
  onClose,
  onUpdateFields,
  onChangeStatus,
  onChangePriority,
  onAddComment,
  onAddAttachments,
  onRemoveAttachment,
  onDelete,
  userRole,
}) {
  const [tab, setTab] = useState("overview");
  const formik = useFormik({
    initialValues: {
      subject: ticket.subject,
      customer: ticket.customer,
      description: ticket.description,
      email: ticket.email,
      phone: toLocalPhone(ticket.phone),
    },
    validationSchema: ticketSupportEditSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onUpdateFields(ticket.id, { ...values, phone: normalizePhone(values.phone) });
      onClose();
    },
  });
  const [commentText, setCommentText] = useState("");
  const [commentRole, setCommentRole] = useState(userRole === "customer" ? "customer" : "agent");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileInputRef = useRef(null);

  function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(ticket.id, commentText.trim(), commentRole);
    setCommentText("");
  }

  function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) onAddAttachments(ticket.id, files);
    e.target.value = "";
  }

  return (
    <>
      <div className="ts-modal-backdrop">
        <div
          className="ts-modal ts-modal--wide"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ts-modal__header">
            <div>
              <h2>
                {ticket.ticketId || ticket.id} — {ticket.subject}
              </h2>
              <div className="ts-modal__header-meta">
                <span className="ts-tag">{ticket.category}</span>
                <Pill value={ticket.priority} toneMap={PRIORITY_TONE} />
                <Pill value={ticket.status} toneMap={STATUS_TONE} />
              </div>
            </div>
            <button
              type="button"
              className="ts-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="ts-modal__stepper-wrap">
            <StatusStepper status={ticket.status} />
          </div>

          <nav className="ts-modal-tabs">
            {[
              { key: "overview", label: "Overview" },
              {
                key: "comments",
                label: `Comments (${ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).length})`,
              },
              {
                key: "attachments",
                label: `Attachments (${ticket.attachments.length})`,
              },
              { key: "history", label: "Status History" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                className={`ts-modal-tab ${tab === t.key ? "is-active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ts-modal__body">
            {tab === "overview" && (
              <form onSubmit={formik.handleSubmit}>
                <div className="ts-form-grid">
                  <label className="ts-field ts-field--full">
                    <span>Subject</span>
                    <input
                      type="text"
                      name="subject"
                      value={formik.values.subject}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.subject && formik.errors.subject ? "ts-input-error" : ""}
                    />
                    {formik.touched.subject && formik.errors.subject && (
                      <span className="ts-field-error">{formik.errors.subject}</span>
                    )}
                  </label>
                  <label className="ts-field">
                    <span>Customer</span>
                    <p className="ts-cell-title">{ticket.customer}</p>
                  </label>
                  <label className="ts-field">
                    <span>Category</span>
                    <p className="ts-cell-title">{ticket.category}</p>
                  </label>
                  <label className="ts-field">
                    <span>Email</span>
                    <input
                      type="email"
                      name="email"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.email && formik.errors.email ? "ts-input-error" : ""}
                    />
                    {formik.touched.email && formik.errors.email && (
                      <span className="ts-field-error">{formik.errors.email}</span>
                    )}
                  </label>
                  <label className="ts-field">
                    <span>Phone</span>
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
                        className={formik.touched.phone && formik.errors.phone ? "ts-input-error" : ""}
                      />
                    </div>
                    {formik.touched.phone && formik.errors.phone && (
                      <span className="ts-field-error">{formik.errors.phone}</span>
                    )}
                  </label>
                  <label className="ts-field">
                    <span>Priority</span>
                    <Dropdown
                      value={ticket.priority}
                      onChange={(val) => onChangePriority(ticket.id, val)}
                      options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                      variant="form"
                    />
                  </label>
                  <label className="ts-field">
                    <span>Status</span>
                    <Dropdown
                      value={ticket.status}
                      onChange={(val) => onChangeStatus(ticket.id, val)}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                      variant="form"
                    />
                  </label>
                  <label className="ts-field ts-field--full">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      name="description"
                      value={formik.values.description}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.description && formik.errors.description ? "ts-input-error" : ""}
                    />
                    {formik.touched.description && formik.errors.description && (
                      <span className="ts-field-error">{formik.errors.description}</span>
                    )}
                  </label>
                </div>

                <div className="ts-modal-section-footer">
                  <button
                    type="submit"
                    className="ts-btn ts-btn--primary ts-btn--small"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {tab === "comments" && (
              <div className="ts-comments-panel">
                <ul className="ts-comment-list">
                  {ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).map((c) => (
                    <li
                      key={c.id}
                      className={`ts-comment ts-comment--${c.role}`}
                    >
                      <div className="ts-comment__meta">
                        <span className="ts-cell-title">{c.author}</span>
                        {c.role === "customer" && (
                          <span className="ts-pill ts-pill--neutral">
                            Customer
                          </span>
                        )}
                        {c.role === "agent" && (
                          <span className="ts-pill ts-pill--info">
                            Agent
                          </span>
                        )}
                        {c.role === "internal" && (
                          <span className="ts-pill ts-pill--warning">
                            Internal note
                          </span>
                        )}
                        <span className="ts-cell-sub">
                          {formatDateTime(c.date)}
                        </span>
                      </div>
                      <p>{c.text}</p>
                    </li>
                  ))}
                  {ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).length === 0 && (
                    <p className="ts-cell-sub">
                      No comments yet — start the conversation below.
                    </p>
                  )}
                </ul>

                <form className="ts-comment-form" onSubmit={submitComment}>
                  <label className="ts-field ts-field--full">
                    <span>Add a comment</span>
                    <textarea
                      rows={3}
                      placeholder="Write a reply…"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                  </label>
                  <div className="ts-comment-form__footer">
                    {userRole !== "customer" && (
                    <div
                      className="ts-segmented"
                      role="group"
                      aria-label="Comment type"
                    >
                      <button
                        type="button"
                        className={`ts-segmented__option ${commentRole === "agent" ? "is-active" : ""}`}
                        onClick={() => setCommentRole("agent")}
                      >
                        Reply to customer
                      </button>
                      <button
                        type="button"
                        className={`ts-segmented__option ${commentRole === "internal" ? "is-active" : ""}`}
                        onClick={() => setCommentRole("internal")}
                      >
                        Internal note
                      </button>
                    </div>
                    )}
                    <button
                      type="submit"
                      className="ts-btn ts-btn--primary ts-btn--small"
                    >
                      Post
                    </button>
                  </div>
                </form>
              </div>
            )}

            {tab === "attachments" && (
              <div className="ts-attachments-panel">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="ts-file-input"
                  onChange={handleFilePick}
                />
                <button
                  type="button"
                  className="ts-btn ts-btn--secondary ts-btn--small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Attach Files
                </button>

                <ul className="ts-attachment-list">
                  {ticket.attachments.map((a) => (
                    <li key={a.id} className={`ts-attachment ${(a.addedBy === ticket.customer || (ticket.email && a.addedBy === ticket.email)) ? "ts-attachment--customer" : "ts-attachment--admin"}`}>
                      <div>
                        <div className="ts-cell-title">
                          <span style={{ marginRight: 6 }}>{getFileIcon(a.name, a.mimeType)}</span>
                          {a.url ? (
                            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "none" }}>{a.name}</a>
                          ) : a.name}
                        </div>
                        <div className="ts-cell-sub">
                          {formatBytes(a.size)} · added by {a.addedBy} ·{" "}
                          {formatDate(a.date)}
                          {(a.addedBy === ticket.customer || (ticket.email && a.addedBy === ticket.email)) && (
                            <span className="ts-pill ts-pill--neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                              Customer
                            </span>
                          )}
                        </div>
                        <AttachmentPreview attachment={a} />
                      </div>
                      <button
                        type="button"
                        className="ts-btn ts-btn--ghost ts-btn--small"
                        onClick={() => onRemoveAttachment(ticket.id, a.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {ticket.attachments.length === 0 && (
                    <p className="ts-cell-sub">No files attached yet.</p>
                  )}
                </ul>
              </div>
            )}

            {tab === "history" && (
              <ul className="ts-timeline">
                {[...ticket.history].reverse().map((h) => (
                  <li key={h.id} className="ts-timeline__item">
                    <span className="ts-timeline__dot" />
                    <div>
                      <div className="ts-cell-title">{h.action}</div>
                      {h.detail && (
                        <div className="ts-cell-sub">{h.detail}</div>
                      )}
                      <div className="ts-cell-sub">
                        {formatDateTime(h.date)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete Ticket"
          message={`Are you sure you want to delete ticket ${deleteConfirm.ticketId || deleteConfirm.id} (${deleteConfirm.customer})?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            onDelete(deleteConfirm.id);
            onClose();
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </>
  );
}

/* -------------------------------------- View ticket modal (read-only) -------------------------------------- */

function ViewTicketModal({ ticket, onClose, userRole }) {
  const [tab, setTab] = useState("overview");

  return (
    <div className="ts-modal-backdrop">
      <div className="ts-modal ts-modal--wide" role="dialog" aria-modal="true">
        <div className="ts-modal__header">
          <div>
            <h2>
              {ticket.ticketId || ticket.id} — {ticket.subject}
            </h2>
            <div className="ts-modal__header-meta">
              <span className="ts-tag">{ticket.category}</span>
              <Pill value={ticket.priority} toneMap={PRIORITY_TONE} />
              <Pill value={ticket.status} toneMap={STATUS_TONE} />
            </div>
          </div>
          <button
            type="button"
            className="ts-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="ts-modal__stepper-wrap">
          <StatusStepper status={ticket.status} />
        </div>

        <nav className="ts-modal-tabs">
          {[
            { key: "overview", label: "Overview" },
            { key: "comments", label: `Comments (${ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).length})` },
            {
              key: "attachments",
              label: `Attachments (${ticket.attachments.length})`,
            },
            { key: "history", label: "Status History" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              className={`ts-modal-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ts-modal__body">
          {tab === "overview" && (
            <div>
              <div className="ts-view-section">
                <h4>Ticket Information</h4>
                <div className="ts-view-grid">
                  <div className="ts-view-item ts-view-item--full">
                    <span className="ts-view-label">Subject</span>
                    <span className="ts-view-value">{ticket.subject}</span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Customer</span>
                    <span className="ts-view-value">{ticket.customer}</span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Category</span>
                    <span className="ts-view-value">{ticket.category}</span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Email</span>
                    <span className="ts-view-value">{ticket.email}</span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Phone</span>
                    <span className="ts-view-value">{ticket.phone}</span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Priority</span>
                    <span className="ts-view-value">
                      <Pill value={ticket.priority} toneMap={PRIORITY_TONE} />
                    </span>
                  </div>
                  <div className="ts-view-item">
                    <span className="ts-view-label">Status</span>
                    <span className="ts-view-value">
                      <Pill value={ticket.status} toneMap={STATUS_TONE} />
                    </span>
                  </div>
                  <div className="ts-view-item ts-view-item--full">
                    <span className="ts-view-label">Description</span>
                    <span
                      className="ts-view-value"
                      style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                    >
                      {ticket.description}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div className="ts-comments-panel">
              <ul className="ts-comment-list">
                {ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).map((c) => (
                  <li key={c.id} className={`ts-comment ts-comment--${c.role}`}>
                    <div className="ts-comment__meta">
                      <span className="ts-cell-title">{c.author}</span>
                      {c.role === "customer" && (
                        <span className="ts-pill ts-pill--neutral">
                          Customer
                        </span>
                      )}
                      {c.role === "agent" && (
                        <span className="ts-pill ts-pill--info">
                          Agent
                        </span>
                      )}
                      {c.role === "internal" && (
                        <span className="ts-pill ts-pill--warning">
                          Internal note
                        </span>
                      )}
                      <span className="ts-cell-sub">
                        {formatDateTime(c.date)}
                      </span>
                    </div>
                    <p>{c.text}</p>
                  </li>
                ))}
                {ticket.comments.filter((c) => userRole === "customer" ? c.role !== "internal" : true).length === 0 && (
                  <p className="ts-cell-sub">No comments yet.</p>
                )}
              </ul>
            </div>
          )}

          {tab === "attachments" && (
            <div className="ts-attachments-panel">
              {ticket.attachments.some((a) => a.addedBy === ticket.customer || (ticket.email && a.addedBy === ticket.email)) && (
                <p className="ts-cell-sub" style={{ marginBottom: 8 }}>
                  Files uploaded by the customer are shown below.
                </p>
              )}
              <ul className="ts-attachment-list">
                {ticket.attachments.map((a) => (
                  <li key={a.id} className={`ts-attachment ${(a.addedBy === ticket.customer || (ticket.email && a.addedBy === ticket.email)) ? "ts-attachment--customer" : "ts-attachment--admin"}`}>
                    <div>
                      <div className="ts-cell-title">
                        <span style={{ marginRight: 6 }}>{getFileIcon(a.name, a.mimeType)}</span>
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "none" }}>{a.name}</a>
                        ) : a.name}
                      </div>
                      <div className="ts-cell-sub">
                        {formatBytes(a.size)} &middot; added by {a.addedBy}{" "}
                        &middot; {formatDate(a.date)}
                        {(a.addedBy === ticket.customer || (ticket.email && a.addedBy === ticket.email)) && (
                          <span className="ts-pill ts-pill--neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                            Customer
                          </span>
                        )}
                      </div>
                      <AttachmentPreview attachment={a} />
                    </div>
                  </li>
                ))}
                {ticket.attachments.length === 0 && (
                  <p className="ts-cell-sub">No files attached.</p>
                )}
              </ul>
            </div>
          )}

          {tab === "history" && (
            <ul className="ts-timeline">
              {[...ticket.history].reverse().map((h) => (
                <li key={h.id} className="ts-timeline__item">
                  <span className="ts-timeline__dot" />
                  <div>
                    <div className="ts-cell-title">{h.action}</div>
                    {h.detail && <div className="ts-cell-sub">{h.detail}</div>}
                    <div className="ts-cell-sub">{formatDateTime(h.date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ts-modal__footer">
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

/* -------------------------------------- Raise ticket modal -------------------------------------- */

function RaiseTicketModal({ onClose, onCreate }) {
  const [customers, setCustomers] = useState([]);
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";

  useEffect(() => {
    customerAPI.getAll({ limit: 500 })
      .then((res) => setCustomers(res.data?.data || []))
      .catch(() => {});
  }, []);

  const customerOptions = customers.map((c) => ({ value: c.name, label: c.name }));

  const formik = useFormik({
    initialValues: {
      subject: "",
      description: "",
      customer: isCustomer ? (user.name || "") : "",
      email: isCustomer ? (user.email || "") : "",
      phone: "",
      category: CATEGORIES[0],
      priority: "Medium",
    },
    validationSchema: ticketSupportSchema,
    onSubmit: (values) => {
      onCreate({ ...values, phone: normalizePhone(values.phone) });
    },
  });

  return (
    <div className="ts-modal-backdrop">
      <div className="ts-modal" role="dialog" aria-modal="true">
        <div className="ts-modal__header">
          <h2>Raise Ticket</h2>
          <button
            type="button"
            className="ts-modal__close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="ts-modal__form" onSubmit={formik.handleSubmit}>
          <div className="ts-form-grid">
            <label className="ts-field ts-field--full">
              <span>Subject</span>
              <input
                type="text"
                name="subject"
                placeholder="Short summary of the issue"
                value={formik.values.subject}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.subject && formik.errors.subject ? "ts-input-error" : ""}
              />
              {formik.touched.subject && formik.errors.subject && (
                <span className="ts-field-error">{formik.errors.subject}</span>
              )}
            </label>
            <label className="ts-field">
              <span>Customer{isCustomer && " (You)"}</span>
              {customerOptions.length > 0 ? (
                <Dropdown
                  value={formik.values.customer}
                  onChange={(val) => formik.setFieldValue("customer", val)}
                  options={isCustomer ? [{ value: formik.values.customer, label: formik.values.customer }] : [{ value: "", label: "Select customer" }, ...customerOptions]}
                  variant="form"
                  disabled={isCustomer}
                />
              ) : (
                <input
                  type="text"
                  name="customer"
                  placeholder="Customer full name"
                  value={formik.values.customer}
                  onChange={formik.handleChange}
                  disabled={isCustomer}
                />
              )}
              {formik.touched.customer && formik.errors.customer && (
                <span className="ts-field-error">{formik.errors.customer}</span>
              )}
            </label>
            <label className="ts-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                placeholder="customer@example.com"
                value={formik.values.email}
                onChange={formik.handleChange}
                disabled={isCustomer}
              />
            </label>
            <label className="ts-field">
              <span>Phone</span>
              <div className="phone-input-group">
                <span className="phone-prefix">+91</span>
                <input
                  type="text"
                  name="phone"
                  placeholder="98765 43210"
                  maxLength={10}
                  value={formik.values.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    formik.setFieldValue("phone", val);
                  }}
                />
              </div>
              {formik.touched.phone && formik.errors.phone && (
                <span className="ts-field-error">{formik.errors.phone}</span>
              )}
            </label>
            <label className="ts-field">
              <span>Category</span>
              <Dropdown
                value={formik.values.category}
                onChange={(val) => formik.setFieldValue("category", val)}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                variant="form"
              />
            </label>
            <label className="ts-field">
              <span>Priority</span>
              <Dropdown
                value={formik.values.priority}
                onChange={(val) => formik.setFieldValue("priority", val)}
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                variant="form"
              />
            </label>
            <label className="ts-field ts-field--full">
              <span>Description</span>
              <textarea
                rows={4}
                name="description"
                placeholder="Detailed description of the issue…"
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.description && formik.errors.description ? "ts-input-error" : ""}
              />
              {formik.touched.description && formik.errors.description && (
                <span className="ts-field-error">{formik.errors.description}</span>
              )}
            </label>
          </div>
          <div className="ts-modal__footer">
            <button
              type="button"
              className="ts-btn ts-btn--ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="ts-btn ts-btn--primary">
              Raise Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
