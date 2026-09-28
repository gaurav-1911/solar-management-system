import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { ticketSchema, ticketEditSchema, visitSchema, resolutionSchema, normalizePhone, toLocalPhone } from "../../utils/AdminValidation";
import { Dropdown, Pagination, TableLoader } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import {
  maintenanceTicketAPI,
  serviceVisitAPI,
  customerAPI,
  technicianAPI,
} from "../../services";
import { fetchAllPages } from "../../utils";
import { createProfilePdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./MaintenanceManagement.css";


/* ---------------------------------- constants ---------------------------------- */

const TICKET_STATUSES = [
  "Open",
  "Scheduled",
  "In Progress",
  "Resolved",
  "Closed",
];
const OPEN_TICKET_STATUSES = ["Open", "Scheduled", "In Progress"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const STATUS_TONE = {
  Open: "neutral",
  Scheduled: "info",
  "In Progress": "warning",
  Resolved: "success",
  Closed: "neutral",
};

const PRIORITY_TONE = {
  Low: "neutral",
  Medium: "info",
  High: "warning",
  Urgent: "danger",
};

const VISIT_STATUS_TONE = {
  upcoming: "info",
  completed: "success",
  missed: "danger",
};

/* ------------------------------------ helpers ------------------------------------ */

let idCounter = 4000;
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

// Backend documents use Mongo _id internally plus a human-friendly ticketId /
// amcId / visitId (MT-2201, AMC-501, VS-701 style) for display.

// History entries stored in the DB don't carry the client-side `id` that the
// timeline uses for React keys — backfill one from the parent record.
function normalizeHistory(history, baseId) {
  return (history || []).map((h, i) => ({
    ...h,
    id: h.id || `${baseId}-H${i + 1}`,
  }));
}

function normalizeTicket(doc) {
  const normalized = {
    ...doc,
    id: doc.ticketId || doc._id,
    createdDate: toDateInput(doc.createdDate || doc.createdAt),
    scheduledDate: toDateInput(doc.scheduledDate),
    resolvedDate: toDateInput(doc.resolvedDate),
  };
  return { ...normalized, history: normalizeHistory(doc.history, normalized.id) };
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
  // Keep the currently-assigned technician selectable even if they are no
  // longer in the fetched list.
  if (current && !opts.some((o) => o.value === current)) {
    opts.push({ value: current, label: current });
  }
  return opts;
}

/* --------------------------------- small UI bits --------------------------------- */

function Pill({ value, toneMap, labelMap }) {
  const tone = toneMap[value] ?? "neutral";
  const label = labelMap?.[value] ?? value;
  return <span className={`mm-pill mm-pill--${tone}`}>{label}</span>;
}

function StatusStepper({ status }) {
  const idx = TICKET_STATUSES.indexOf(status);
  return (
    <ol className="mm-stepper">
      {TICKET_STATUSES.map((s, i) => (
        <li
          key={s}
          className={`mm-stepper__step ${i <= idx ? "is-complete" : ""} ${i === idx ? "is-current" : ""}`}
        >
          <span className="mm-stepper__dot" />
          <span className="mm-stepper__label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------ module ------------------------------------ */

const TABS = [
  { key: "maintenance", label: "Maintenance Requests", type: "Maintenance" },
  { key: "service", label: "Service Requests", type: "Service" },
  { key: "complaints", label: "Complaints", type: "Complaint" },
  { key: "visits", label: "Schedule Visits" },
  { key: "resolution", label: "Resolution Tracking" },
];

export default function MaintenanceManagement() {
  const [tickets, setTickets] = useState([]);
  const [visits, setVisits] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [activeTab, setActiveTab] = useState("maintenance");
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [viewTicketId, setViewTicketId] = useState(null);
  const [createTicketType, setCreateTicketType] = useState(null);
  const [loading, setLoading] = useState(true);
  const { success, error } = useToast();
  const { canDo } = useAuth();
  const canCreate = canDo("maintenance", "create");
  const canEdit = canDo("maintenance", "edit");
  const canDelete = canDo("maintenance", "delete");

  /* ------------------------------ live data loading ------------------------------ */

  // Load real records from MongoDB (via the backend API) on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAllPages(maintenanceTicketAPI.getAll)
        .then((docs) => { if (!cancelled) setTickets(docs.map(normalizeTicket)); })
        .catch((err) => console.warn("Failed to load maintenance tickets:", err?.message)),
      fetchAllPages(serviceVisitAPI.getAll)
        .then((docs) => { if (!cancelled) setVisits(docs.map(normalizeVisit)); })
        .catch((err) => console.warn("Failed to load service visits:", err?.message)),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load real technicians for the assignment dropdowns.
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

  /* -------------------------------- ticket operations -------------------------------- */

  async function createTicket(data) {
    const ticket = {
      id: nextId(
        data.type === "Maintenance"
          ? "MT"
          : data.type === "Service"
            ? "SR"
            : "CM",
      ),
      type: data.type,
      customer: data.customer,
      phone: data.phone,
      system: data.system,
      priority: data.priority,
      status: "Open",
      assignedTech: data.assignedTech || "Unassigned",
      createdDate: todayISO(),
      scheduledDate: data.scheduledDate || null,
      resolvedDate: null,
      description: data.description,
      resolutionNotes: "",
      history: [historyEntry("Ticket created", `${data.type} request logged`)],
    };
    setTickets((prev) => [ticket, ...prev]);

    // Persist to the backend; on failure the ticket stays local (offline mode).
    let savedTicket = ticket;
    let ticketSaved = false;
    try {
      const res = await maintenanceTicketAPI.create({
        type: ticket.type,
        customer: ticket.customer,
        phone: ticket.phone,
        system: ticket.system,
        priority: ticket.priority,
        status: ticket.status,
        assignedTech: ticket.assignedTech,
        scheduledDate: ticket.scheduledDate || null,
        description: ticket.description,
        resolutionNotes: "",
        history: toApiHistory(ticket.history),
      });
      savedTicket = normalizeTicket(res.data.data);
      ticketSaved = true;
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? savedTicket : t)),
      );
    } catch (err) {
      console.warn("Failed to save ticket to server:", err?.message);
      // Keep the ticket in local state (offline mode) so it survives a
      // refresh-free session — it will be retried when the user reloads.
      error(
        err.response?.data?.message ||
          "Failed to save ticket to server. It may not persist after refresh.",
      );
      setCreateTicketType(null);
      return;
    }

    if (data.scheduledDate) {
      const visit = {
        id: nextId("VS"),
        date: data.scheduledDate,
        customer: data.customer,
        technician: data.assignedTech || "Unassigned",
        linkType: "Ticket",
        linkId: savedTicket.id,
        status: "upcoming",
        notes: `${data.type} visit`,
      };
      setVisits((prev) => [...prev, visit]);
      // Only persist the linked visit when the ticket itself was saved, so we
      // never create an orphan visit pointing at a ticket that doesn't exist.
      if (ticketSaved) {
        try {
          const res = await serviceVisitAPI.create({
            date: visit.date,
            customer: visit.customer,
            technician: visit.technician,
            linkType: "Ticket",
            linkId: visit.linkId,
            status: "upcoming",
            notes: visit.notes,
          });
          const savedVisit = normalizeVisit(res.data.data);
          setVisits((prev) =>
            prev.map((v) => (v.id === visit.id ? savedVisit : v)),
          );
        } catch (err) {
          console.warn("Failed to save visit to server:", err?.message);
        }
      }
    }
    setCreateTicketType(null);
    success(`${data.type} ticket ${savedTicket.id} created.`);
  }

  function updateTicketFields(id, patch) {
    const existing = tickets.find((t) => t.id === id);
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
    if (existing?._id) {
      maintenanceTicketAPI
        .update(existing._id, patch)
        .then((res) => {
          const updated = normalizeTicket(res.data.data);
          setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
          success("Maintenance request updated successfully.");
        })
        .catch((err) => {
          console.warn("Failed to update ticket on server:", err?.message);
          error(err.response?.data?.message || "Could not update ticket on server.");
        });
    } else {
      success("Maintenance request updated successfully.");
    }
  }

  function assignTech(id, tech) {
    const existing = tickets.find((t) => t.id === id);
    setTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              assignedTech: tech,
              history: [
                ...t.history,
                historyEntry("Assigned", `Assigned to ${tech}`),
              ],
            }
          : t,
      ),
    );
    if (existing?._id) {
      const history = [
        ...(existing.history || []),
        historyEntry("Assigned", `Assigned to ${tech}`),
      ];
      maintenanceTicketAPI
        .update(existing._id, {
          assignedTech: tech,
          history: toApiHistory(history),
        })
        .then((res) => {
          const updated = normalizeTicket(res.data.data);
          setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
        })
        .catch((err) =>
          console.warn("Failed to sync assignment:", err?.message),
        );
    }
    success(`Assigned to ${tech}.`);
  }

  function changeTicketStatus(id, newStatus) {
    const existing = tickets.find((t) => t.id === id);
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const resolvedDate =
          newStatus === "Resolved"
            ? todayISO()
            : newStatus === "Closed"
              ? t.resolvedDate || todayISO()
              : t.resolvedDate;
        return {
          ...t,
          status: newStatus,
          resolvedDate,
          history: [
            ...t.history,
            historyEntry("Status changed", `${t.status} → ${newStatus}`),
          ],
        };
      }),
    );
    if (existing?._id) {
      const resolvedDate =
        newStatus === "Resolved"
          ? todayISO()
          : newStatus === "Closed"
            ? existing.resolvedDate || todayISO()
            : existing.resolvedDate;
      const history = [
        ...(existing.history || []),
        historyEntry("Status changed", `${existing.status} → ${newStatus}`),
      ];
      maintenanceTicketAPI
        .update(existing._id, {
          status: newStatus,
          resolvedDate,
          history: toApiHistory(history),
        })
        .then((res) => {
          const updated = normalizeTicket(res.data.data);
          setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
        })
        .catch((err) =>
          console.warn("Failed to sync status change:", err?.message),
        );
    }
  }

  function addResolution(id, note) {
    const existing = tickets.find((t) => t.id === id);
    setTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              resolutionNotes: note,
              status: "Resolved",
              resolvedDate: todayISO(),
              history: [...t.history, historyEntry("Resolved", note)],
            }
          : t,
      ),
    );
    if (existing?._id) {
      const history = [...(existing.history || []), historyEntry("Resolved", note)];
      maintenanceTicketAPI
        .update(existing._id, {
          resolutionNotes: note,
          status: "Resolved",
          resolvedDate: todayISO(),
          history: toApiHistory(history),
        })
        .then((res) => {
          const updated = normalizeTicket(res.data.data);
          setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
        })
        .catch((err) =>
          console.warn("Failed to sync resolution:", err?.message),
        );
    }
    success("Resolution logged, ticket marked Resolved.");
  }

  function scheduleTicketVisit(id, date, tech) {
    const existing = tickets.find((t) => t.id === id);
    setTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              scheduledDate: date,
              status: t.status === "Open" ? "Scheduled" : t.status,
              assignedTech: tech || t.assignedTech,
              history: [
                ...t.history,
                historyEntry(
                  "Visit scheduled",
                  `${formatDate(date)}${tech ? ` with ${tech}` : ""}`,
                ),
              ],
            }
          : t,
      ),
    );
    const ticket = existing || tickets.find((t) => t.id === id);
    const visit = {
      id: nextId("VS"),
      date,
      customer: ticket?.customer,
      technician: tech || ticket?.assignedTech || "Unassigned",
      linkType: "Ticket",
      linkId: id,
      status: "upcoming",
      notes: `${ticket?.type ?? "Ticket"} visit`,
    };
    setVisits((prev) => [...prev, visit]);
    if (existing?._id) {
      const history = [
        ...(existing.history || []),
        historyEntry(
          "Visit scheduled",
          `${formatDate(date)}${tech ? ` with ${tech}` : ""}`,
        ),
      ];
      maintenanceTicketAPI
        .update(existing._id, {
          scheduledDate: date,
          status: existing.status === "Open" ? "Scheduled" : existing.status,
          assignedTech: tech || existing.assignedTech,
          history: toApiHistory(history),
        })
        .then((res) => {
          const updated = normalizeTicket(res.data.data);
          setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
        })
        .catch((err) =>
          console.warn("Failed to sync scheduled visit:", err?.message),
        );
    }
    serviceVisitAPI
      .create({
        date: visit.date,
        customer: visit.customer,
        technician: visit.technician,
        linkType: "Ticket",
        linkId: visit.linkId,
        status: "upcoming",
        notes: visit.notes,
      })
      .then((res) => {
        const savedVisit = normalizeVisit(res.data.data);
        setVisits((prev) =>
          prev.map((v) => (v.id === visit.id ? savedVisit : v)),
        );
      })
      .catch((err) =>
        console.warn("Failed to save visit to server:", err?.message),
      );
    success("Visit scheduled.");
  }

  function deleteTicket(id) {
    const t = tickets.find((x) => x.id === id);
    setTickets((prev) => prev.filter((x) => x.id !== id));
    if (selectedTicketId === id) setSelectedTicketId(null);
    if (t?._id) {
      maintenanceTicketAPI.delete(t._id).catch((err) =>
        console.warn("Failed to delete ticket on server:", err?.message),
      );
    }
    success(`Ticket ${t?.id} deleted.`);
  }

  /* --------------------------------- visit operations --------------------------------- */

  function markVisitCompleted(id) {
    const visit = visits.find((v) => v.id === id);
    setVisits((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status: "completed" } : v)),
    );
    if (visit?.linkType === "Ticket") {
      const ticket = tickets.find((t) => t.id === visit.linkId);
      setTickets((prev) =>
        prev.map((t) =>
          t.id === visit.linkId
            ? {
                ...t,
                status:
                  t.status === "Resolved" || t.status === "Closed"
                    ? t.status
                    : "In Progress",
                history: [
                  ...t.history,
                  historyEntry("Visit completed", formatDate(visit.date)),
                ],
              }
            : t,
        ),
      );
      if (ticket?._id) {
        const newStatus =
          ticket.status === "Resolved" || ticket.status === "Closed"
            ? ticket.status
            : "In Progress";
        const history = [
          ...(ticket.history || []),
          historyEntry("Visit completed", formatDate(visit.date)),
        ];
        maintenanceTicketAPI
          .update(ticket._id, {
            status: newStatus,
            history: toApiHistory(history),
          })
          .then((res) => {
            const updated = normalizeTicket(res.data.data);
            setTickets((prev) =>
              prev.map((t) => (t.id === visit.linkId ? updated : t)),
            );
          })
          .catch((err) =>
            console.warn("Failed to sync ticket after visit:", err?.message),
          );
      }
    }
    if (visit?._id) {
      serviceVisitAPI
        .update(visit._id, { status: "completed" })
        .then((res) => {
          const updated = normalizeVisit(res.data.data);
          setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
        })
        .catch((err) =>
          console.warn("Failed to sync visit status:", err?.message),
        );
    }
    success("Visit marked completed.");
  }

  function markVisitMissed(id) {
    const visit = visits.find((v) => v.id === id);
    setVisits((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status: "missed" } : v)),
    );
    if (visit?._id) {
      serviceVisitAPI
        .update(visit._id, { status: "missed" })
        .then((res) => {
          const updated = normalizeVisit(res.data.data);
          setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
        })
        .catch((err) =>
          console.warn("Failed to sync visit status:", err?.message),
        );
    }
    success("Visit marked missed.");
  }

  function rescheduleVisit(id, newDate) {
    const visit = visits.find((v) => v.id === id);
    setVisits((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, date: newDate, status: "upcoming" } : v,
      ),
    );
    if (visit?._id) {
      serviceVisitAPI
        .update(visit._id, { date: newDate, status: "upcoming" })
        .then((res) => {
          const updated = normalizeVisit(res.data.data);
          setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
        })
        .catch((err) =>
          console.warn("Failed to reschedule visit on server:", err?.message),
        );
    }
    success("Visit rescheduled.");
  }

  /* ------------------------------------ derived ------------------------------------ */

  const stats = useMemo(() => {
    const openTickets = tickets.filter((t) =>
      OPEN_TICKET_STATUSES.includes(t.status),
    ).length;
    const overdueTickets = tickets.filter(
      (t) =>
        OPEN_TICKET_STATUSES.includes(t.status) &&
        t.scheduledDate &&
        isPast(t.scheduledDate),
    ).length;
    const upcomingVisits = visits.filter((v) => v.status === "upcoming").length;
    return { openTickets, overdueTickets, upcomingVisits };
  }, [tickets, visits]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="maintenance-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="maintenance-module">
      <header className="mm-header">
        <div>
          <h1 className="mm-title">Maintenance Management</h1>
          <p className="mm-subtitle">
            Maintenance requests, service tickets, complaints, visit scheduling
            and resolution tracking — all in one place.
          </p>
        </div>
      </header>

      <div className="maint-stats-grid">
        <StatCard
          title="Total Tickets"
          value={tickets.length.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="blue"
        />
        <StatCard
          title="Open Tickets"
          value={stats.openTickets.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Overdue Visits"
          value={stats.overdueTickets.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="red"
        />
        <StatCard
          title="Upcoming Visits"
          value={stats.upcomingVisits.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="green"
        />
      </div>

      <nav className="mm-tabs" role="tablist" aria-label="Maintenance sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`mm-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="mm-content">
        {["maintenance", "service", "complaints"].includes(activeTab) && (
          <TicketsPanel
            type={TABS.find((t) => t.key === activeTab).type}
            tickets={tickets.filter(
              (t) => t.type === TABS.find((tb) => tb.key === activeTab).type,
            )}
            loading={loading}
            onOpen={setSelectedTicketId}
            onView={setViewTicketId}
            onDelete={deleteTicket}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onCreate={() =>
              setCreateTicketType(TABS.find((t) => t.key === activeTab).type)
            }
          />
        )}
        {activeTab === "visits" && (
          <VisitsPanel
            visits={visits}
            onComplete={markVisitCompleted}
            onMissed={markVisitMissed}
            onReschedule={rescheduleVisit}
            onDownload={success}
            canEdit={canEdit}
            canExport={canDo("maintenance", "export")}
          />
        )}
        {activeTab === "resolution" && <ResolutionPanel tickets={tickets} canEdit={canEdit} />}
      </main>

      {viewTicketId && (
        <ViewTicketModal
          ticket={tickets.find((t) => t.id === viewTicketId)}
          onClose={() => setViewTicketId(null)}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          technicians={technicians}
          onClose={() => setSelectedTicketId(null)}
          onUpdateFields={updateTicketFields}
          onAssign={assignTech}
          onChangeStatus={changeTicketStatus}
          onAddResolution={addResolution}
          onScheduleVisit={scheduleTicketVisit}
          onDelete={deleteTicket}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {createTicketType && (
        <CreateTicketModal
          type={createTicketType}
          technicians={technicians}
          tickets={tickets}
          onClose={() => setCreateTicketType(null)}
          onCreate={createTicket}
        />
      )}

    </div>
  );
}

/* ------------------------------------ Tickets panel ------------------------------------ */

function TicketsPanel({ type, tickets, loading, onOpen, onView, onDelete, onCreate, canCreate = true, canEdit = true, canDelete = true }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.customer.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.system.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tickets, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <section aria-label={`${type} tickets`}>
      <div className="mm-toolbar">
        <div className="mm-search-wrap">
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
            className="mm-input"
            placeholder="Search by customer, ticket ID or system"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="mm-search-clear" onClick={() => setSearch("")}>
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
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All Statuses" },
            ...TICKET_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
        {canCreate && (
          <button
            type="button"
            className="mm-btn mm-btn--primary"
            onClick={onCreate}
          >
            + New {type} Request
          </button>
        )}
      </div>

      <div className="mm-table-card">
        <div className="mm-table-wrap">
          <table className="mm-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Customer</th>
                <th>System</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Scheduled Visit</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : paginated.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code className="mm-code">{t.id}</code>
                  </td>
                  <td>
                    <div className="mm-cell-title">{t.customer}</div>
                    <div className="mm-cell-sub">{t.phone}</div>
                  </td>
                  <td className="mm-cell-sub">{t.system}</td>
                  <td>
                    <Pill value={t.priority} toneMap={PRIORITY_TONE} />
                  </td>
                  <td>
                    <Pill value={t.status} toneMap={STATUS_TONE} />
                  </td>
                  <td>
                    <div className="mm-row-with-avatar">
                      <span className="mm-cell-sub">{t.assignedTech}</span>
                    </div>
                  </td>
                  <td
                    className={
                      t.scheduledDate &&
                      isPast(t.scheduledDate) &&
                      OPEN_TICKET_STATUSES.includes(t.status)
                        ? "mm-danger-text"
                        : ""
                    }
                  >
                    {formatDate(t.scheduledDate)}
                  </td>
                  <td>
                    <div className="act-actions">
                      <button
                        type="button"
                        className="act-btn act-view"
                        onClick={() => onView(t.id)}
                        title="View"
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
                        module="maintenance"
                        onClick={() => {
                          const mId = t.serverId || t._id || t.id;
                          navigate(`/admin/maintenance-activity/${mId}`, {
                            state: { target: { recordId: mId, recordLabel: t.taskId || t.customer || t.id, module: "maintenance" } },
                          });
                        }}
                        title="View Maintenance Activity Log"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          className="act-btn act-edit"
                          onClick={() => onOpen(t.id)}
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="mm-empty-row">
                    {search || statusFilter !== "all"
                      ? `No ${type.toLowerCase()} tickets match your search.`
                      : `No ${type.toLowerCase()} tickets yet — create one with the button above.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="product-pagination-row">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={perPage}
            onPageChange={setPage}
            variant="table"
            onPageSizeChange={(val) => {
              setPerPage(Number(val));
              setPage(1);
            }}
            disabled={loading}
          />
        </div>
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete Ticket"
          message={`Are you sure you want to delete ticket ${deleteConfirm.id} (${deleteConfirm.customer})?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            onDelete(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </section>
  );
}

/* ------------------------------------ Visits panel ------------------------------------ */

function VisitsPanel({
  visits,
  onComplete,
  onMissed,
  onReschedule,
  onDownload,
  canEdit = true,
  canExport = true,
}) {
  const [rescheduleId, setRescheduleId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [visitPage, setVisitPage] = useState(1);
  const [visitPerPage, setVisitPerPage] = useState(10);

  const sorted = useMemo(
    () => [...visits].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [visits],
  );
  const visitTotalPages = Math.ceil(sorted.length / visitPerPage);
  const visitPaginated = sorted.slice(
    (visitPage - 1) * visitPerPage,
    visitPage * visitPerPage,
  );
  const paginatedUpcoming = visitPaginated.filter(
    (v) => v.status === "upcoming",
  );
  const paginatedCompleted = visitPaginated.filter(
    (v) => v.status === "completed",
  );
  const paginatedMissed = visitPaginated.filter((v) => v.status === "missed");


  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);

  function viewVisit(v) {
    setSelectedVisit(v);
  }

const downloadVisitLog = async (v) => {
  const doc = await createProfilePdf({
    bannerName: v.customer,
    bannerSubtitle: `Visit ID: ${v.id}`,
    bannerRight: [`Status: ${v.status || "—"}`, `Linked To: ${v.linkType} ${v.linkId}`],
    sections: [
      {
        title: "Visit Details",
        fields: [
          ["Customer", v.customer],
          ["Technician", v.technician],
          ["Linked To", `${v.linkType} ${v.linkId}`],
          ["Date", formatDate(v.date)],
        ],
      },
    ],
    notes: v.notes,
  });

  const safeCustomer = (v.customer || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`VisitLog_${safeCustomer}.pdf`);

  onDownload(`Visit log for ${v.customer} downloaded.`);
};

  function VisitRow({ v }) {
    const overdue = v.status === "upcoming" && isPast(v.date);
    return (
      <tr key={v.id}>
        <td>
          <code className="mm-code">{v.id}</code>
        </td>
        <td className="mm-cell-title">{v.customer}</td>
        <td className="mm-cell-sub">
          {v.linkType} · {v.linkId}
        </td>
        <td className="mm-cell-sub">{v.notes}</td>
        <td>
          <div className="mm-row-with-avatar">
            <span className="mm-cell-sub">{v.technician}</span>
          </div>
        </td>
        <td
          className={overdue ? "mm-danger-text mm-cell-title" : "mm-cell-title"}
        >
          {formatDate(v.date)}
        </td>
        <td>
          <Pill
            value={overdue ? "missed" : v.status}
            toneMap={VISIT_STATUS_TONE}
            labelMap={{
              upcoming: "Upcoming",
              completed: "Completed",
              missed: "Overdue / Missed",
            }}
          />
        </td>
        <td>
          <div className="act-actions">
            <button
              type="button"
              className="act-btn act-view"
              onClick={() => viewVisit(v)}
              title="View Visit"
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
            {canExport && (
            <button
              type="button"
              className="act-btn act-log"
              onClick={() => setShowLogModal(v)}
              title="Download Log"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
            )}
            {v.status === "upcoming" && rescheduleId === v.id && (
              <>
                <input
                  type="date"
                  className="mm-input mm-input--compact"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  min={todayISO()}
                />
                <button
                  type="button"
                  className="mm-btn mm-btn--primary mm-btn--small"
                  onClick={() => {
                    if (rescheduleDate) {
                      onReschedule(v.id, rescheduleDate);
                      setRescheduleId(null);
                    }
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="mm-btn mm-btn--ghost mm-btn--small"
                  onClick={() => setRescheduleId(null)}
                >
                  Cancel
                </button>
              </>
            )}
            {v.status === "upcoming" && rescheduleId !== v.id && canEdit && (
              <>
                <button
                  type="button"
                  className="mm-btn mm-btn--secondary mm-btn--small"
                  onClick={() => onComplete(v.id)}
                >
                  Mark Completed
                </button>
                <button
                  type="button"
                  className="mm-btn mm-btn--ghost mm-btn--small"
                  onClick={() => {
                    setRescheduleId(v.id);
                    setRescheduleDate(v.date);
                  }}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="mm-btn mm-btn--ghost mm-btn--small"
                  onClick={() => onMissed(v.id)}
                >
                  Mark Missed
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <section aria-label="Scheduled visits">
      <div className="mm-panel-heading">
        <h2>Schedule Visits</h2>
        <p>
          Every visit tied to a maintenance ticket or an AMC contract, in one
          calendar-ordered list.
        </p>
      </div>

      <div className="mm-table-wrap">
        <table className="mm-table">
          <thead>
            <tr>
              <th>Visit</th>
              <th>Customer</th>
              <th>Linked To</th>
              <th>Notes</th>
              <th>Technician</th>
              <th>Date</th>
              <th>Status</th>
              <th aria-label="Actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUpcoming.map((v) => (
              <VisitRow key={v.id} v={v} />
            ))}
            {paginatedMissed.map((v) => (
              <VisitRow key={v.id} v={v} />
            ))}
            {paginatedCompleted.map((v) => (
              <VisitRow key={v.id} v={v} />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="mm-empty-row">
                  No visits scheduled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="product-pagination-row">
        <Pagination
          currentPage={visitPage}
          totalPages={visitTotalPages}
          totalItems={sorted.length}
          pageSize={visitPerPage}
          onPageChange={setVisitPage}
          variant="table"
          onPageSizeChange={(val) => {
            setVisitPerPage(Number(val));
            setVisitPage(1);
          }}
        />
      </div>

      {selectedVisit && (
        <div
          className="mm-modal-backdrop"
          onClick={() => setSelectedVisit(null)}
        >
          <div
            className="mm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mm-modal__header">
              <div>
                <h2>
                  {selectedVisit.id} — {selectedVisit.customer}
                </h2>
                <div className="mm-modal__header-meta">
                  <Pill
                    value={selectedVisit.status}
                    toneMap={VISIT_STATUS_TONE}
                    labelMap={{
                      upcoming: "Upcoming",
                      completed: "Completed",
                      missed: "Overdue / Missed",
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="mm-modal__close"
                onClick={() => setSelectedVisit(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mm-modal__body">
              <div className="mm-view-section">
                <h4>Visit Details</h4>
                <div className="mm-view-grid">
                  <div className="mm-view-item">
                    <span className="mm-view-label">Visit ID</span>
                    <span className="mm-view-value">{selectedVisit.id}</span>
                  </div>
                  <div className="mm-view-item">
                    <span className="mm-view-label">Customer</span>
                    <span className="mm-view-value">
                      {selectedVisit.customer}
                    </span>
                  </div>
                  <div className="mm-view-item">
                    <span className="mm-view-label">Technician</span>
                    <span className="mm-view-value">
                      {selectedVisit.technician}
                    </span>
                  </div>
                  <div className="mm-view-item">
                    <span className="mm-view-label">Date</span>
                    <span className="mm-view-value">
                      {formatDate(selectedVisit.date)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mm-view-section">
                <h4>Additional Information</h4>
                <div className="mm-view-grid">
                  <div className="mm-view-item mm-view-item--full">
                    <span className="mm-view-label">Linked To</span>
                    <span className="mm-view-value">
                      {selectedVisit.linkType} · {selectedVisit.linkId}
                    </span>
                  </div>
                  <div className="mm-view-item mm-view-item--full">
                    <span className="mm-view-label">Notes</span>
                    <span className="mm-view-value">
                      {selectedVisit.notes || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                  {showLogModal.ticketId || showLogModal._id}
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
                      {showLogModal.status || "Upcoming"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Visit Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.date ? formatDate(showLogModal.date) : "—"}
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
                  Visit Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customer}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technician || "Unassigned"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Linked Resource</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.linkType} · {showLogModal.linkId}</div>
                  </div>
                </div>

                {showLogModal.notes && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Log Remarks &amp; Notes</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.notes}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadVisitLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------- Resolution panel ---------------------------------- */

function ResolutionPanel({ tickets, canEdit = true }) {
  const resolved = tickets.filter((t) => t.resolvedDate);
  const avgDays = resolved.length
    ? Math.round(
        resolved.reduce(
          (sum, t) => sum + daysBetween(t.createdDate, t.resolvedDate),
          0,
        ) / resolved.length,
      )
    : 0;
  const withinSla = resolved.filter(
    (t) => daysBetween(t.createdDate, t.resolvedDate) <= 3,
  ).length;
  const breached = resolved.length - withinSla;
  const [resPage, setResPage] = useState(1);
  const [resPerPage, setResPerPage] = useState(10);
  const resTotalPages = Math.ceil(resolved.length / resPerPage);
  const resPaginated = resolved.slice(
    (resPage - 1) * resPerPage,
    resPage * resPerPage,
  );

  return (
    <section aria-label="Resolution tracking">
      <div className="mm-panel-heading">
        <h2>Resolution Tracking</h2>
        <p>
          How quickly tickets get from opened to resolved, against a 3-day SLA
          target.
        </p>
      </div>

      <div className="mm-mini-stats">
        <div className="mm-mini-stat">
          <span className="mm-stat-label">Avg. Days to Resolve</span>
          <span className="mm-stat-value">{avgDays}</span>
        </div>
        <div className="mm-mini-stat">
          <span className="mm-stat-label">Resolved Within SLA</span>
          <span className="mm-stat-value">{withinSla}</span>
        </div>
        <div className="mm-mini-stat">
          <span className="mm-stat-label">SLA Breached</span>
          <span className="mm-stat-value">{breached}</span>
        </div>
      </div>

      <div className="mm-table-wrap">
        <table className="mm-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Created</th>
              <th>Resolved</th>
              <th>Time to Resolve</th>
              <th>SLA</th>
              <th>Resolution Notes</th>
            </tr>
          </thead>
          <tbody>
            {resPaginated.map((t) => {
              const days = daysBetween(t.createdDate, t.resolvedDate);
              const ok = days <= 3;
              return (
                <tr key={t.id}>
                  <td>
                    <code className="mm-code">{t.id}</code>
                  </td>
                  <td className="mm-cell-sub">{t.type}</td>
                  <td className="mm-cell-title">{t.customer}</td>
                  <td>{formatDate(t.createdDate)}</td>
                  <td>{formatDate(t.resolvedDate)}</td>
                  <td className="mm-cell-title">
                    {days} day{days === 1 ? "" : "s"}
                  </td>
                  <td>
                    <span
                      className={`mm-pill mm-pill--${ok ? "success" : "danger"}`}
                    >
                      {ok ? "Within SLA" : "Breached"}
                    </span>
                  </td>
                  <td className="mm-cell-sub">{t.resolutionNotes || "—"}</td>
                </tr>
              );
            })}
            {resolved.length === 0 && (
              <tr>
                <td colSpan={8} className="mm-empty-row">
                  No resolved tickets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="product-pagination-row">
        <Pagination
          currentPage={resPage}
          totalPages={resTotalPages}
          totalItems={resolved.length}
          pageSize={resPerPage}
          onPageChange={setResPage}
          variant="table"
          onPageSizeChange={(val) => {
            setResPerPage(Number(val));
            setResPage(1);
          }}
        />
      </div>
    </section>
  );
}

/* ------------------------------------- View ticket modal (read‑only) ------------------------------------- */

function ViewTicketModal({ ticket, onClose }) {
  if (!ticket) return null;
  return (
    <div className="mm-modal-backdrop">
      <div
        className="mm-modal mm-modal--wide"
        role="dialog"
        aria-modal="true"
      >
        <div className="mm-modal__header">
          <div>
            <h2>
              {ticket.id} — {ticket.customer}
            </h2>
            <div className="mm-modal__header-meta">
              <Pill
                value={ticket.type}
                toneMap={{
                  Maintenance: "neutral",
                  Service: "info",
                  Complaint: "danger",
                }}
              />
              <Pill value={ticket.priority} toneMap={PRIORITY_TONE} />
              <Pill value={ticket.status} toneMap={STATUS_TONE} />
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

        <div className="mm-modal__stepper-wrap">
          <StatusStepper status={ticket.status} />
        </div>

        <div className="mm-modal__body">
          <div className="mm-view-section">
            <h4>Ticket Information</h4>
            <div className="mm-view-grid">
              <div className="mm-view-item">
                <span className="mm-view-label">Customer</span>
                <span className="mm-view-value">{ticket.customer}</span>
              </div>
              <div className="mm-view-item">
                <span className="mm-view-label">Phone</span>
                <span className="mm-view-value">{ticket.phone}</span>
              </div>
              <div className="mm-view-item mm-view-item--full">
                <span className="mm-view-label">System / Product</span>
                <span className="mm-view-value">{ticket.system}</span>
              </div>
              <div className="mm-view-item">
                <span className="mm-view-label">Status</span>
                <span className="mm-view-value">
                  <Pill value={ticket.status} toneMap={STATUS_TONE} />
                </span>
              </div>
              <div className="mm-view-item">
                <span className="mm-view-label">Assigned To</span>
                <span className="mm-view-value">
                  {/* <Avatar name={ticket.assignedTech} /> {ticket.assignedTech} */}
                </span>
              </div>
              <div className="mm-view-item mm-view-item--full">
                <span className="mm-view-label">Description</span>
                <span className="mm-view-value" style={{ lineHeight: "1.6" }}>
                  {ticket.description}
                </span>
              </div>
            </div>
          </div>

          <div className="mm-view-section">
            <h4>Schedule &amp; Resolution</h4>
            <div className="mm-view-grid">
              {ticket.scheduledDate && (
                <div className="mm-view-item">
                  <span className="mm-view-label">Scheduled Visit</span>
                  <span className="mm-view-value">
                    {formatDate(ticket.scheduledDate)}
                  </span>
                </div>
              )}
              <div className="mm-view-item">
                <span className="mm-view-label">Created</span>
                <span className="mm-view-value">
                  {formatDate(ticket.createdDate)}
                </span>
              </div>
              {ticket.resolutionNotes && (
                <div className="mm-view-item mm-view-item--full">
                  <span className="mm-view-label">Resolution Notes</span>
                  <span className="mm-view-value" style={{ lineHeight: "1.6" }}>
                    {ticket.resolutionNotes}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mm-modal__footer">
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

/* ------------------------------------- Ticket detail modal ------------------------------------- */

function TicketDetailModal({
  ticket,
  technicians,
  onClose,
  onUpdateFields,
  onAssign,
  onChangeStatus,
  onAddResolution,
  onScheduleVisit,
  onDelete,
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [tab, setTab] = useState("overview");

  const formik = useFormik({
    initialValues: {
      customer: ticket.customer,
      phone: toLocalPhone(ticket.phone),
      system: ticket.system,
      description: ticket.description,
    },
    validationSchema: ticketEditSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onUpdateFields(ticket.id, { ...values, phone: normalizePhone(values.phone) });
      onClose();
    },
  });

  const scheduleFormik = useFormik({
    initialValues: {
      visitDate: ticket.scheduledDate || "",
      visitTech: ticket.assignedTech,
    },
    validationSchema: visitSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onScheduleVisit(ticket.id, values.visitDate, values.visitTech);
    },
  });

  const resolutionFormik = useFormik({
    initialValues: {
      notes: ticket.resolutionNotes || "",
    },
    validationSchema: resolutionSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onAddResolution(ticket.id, values.notes.trim());
    },
  });

  return (
    <div className="mm-modal-backdrop">
      <div
        className="mm-modal mm-modal--wide"
        role="dialog"
        aria-modal="true"
      >
        <div className="mm-modal__header">
          <div>
            <h2>
              {ticket.id} — {ticket.customer}
            </h2>
            <div className="mm-modal__header-meta">
              <Pill
                value={ticket.type}
                toneMap={{
                  Maintenance: "neutral",
                  Service: "info",
                  Complaint: "danger",
                }}
              />
              <Pill value={ticket.priority} toneMap={PRIORITY_TONE} />
              <Pill value={ticket.status} toneMap={STATUS_TONE} />
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

        <div className="mm-modal__stepper-wrap">
          <StatusStepper status={ticket.status} />
        </div>

        <nav className="mm-modal-tabs">
          {[
            { key: "overview", label: "Overview" },
            { key: "schedule", label: "Schedule Visit" },
            { key: "resolution", label: "Resolution" },
            { key: "history", label: "History" },
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
            <form onSubmit={formik.handleSubmit}>
              <div className="mm-form-grid">
                <label className="mm-field">
                  <span>Customer</span>
                  <input
                    type="text"
                    name="customer"
                    placeholder="Enter customer full name"
                    maxLength={50}
                    value={formik.values.customer}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.customer && formik.errors.customer ? "mm-input-error" : ""}
                  />
                  {formik.touched.customer && formik.errors.customer && (
                    <span className="mm-form-error">{formik.errors.customer}</span>
                  )}
                </label>
                <label className="mm-field">
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
                      onBlur={formik.handleBlur}
                      className={formik.touched.phone && formik.errors.phone ? "mm-input-error" : ""}
                    />
                  </div>
                  {formik.touched.phone && formik.errors.phone && (
                    <span className="mm-form-error">{formik.errors.phone}</span>
                  )}
                </label>
                <label className="mm-field mm-field--full">
                  <span>System / Product</span>
                  <input
                    type="text"
                    name="system"
                    placeholder="e.g. 5kW On-Grid Solar System"
                    maxLength={100}
                    value={formik.values.system}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.system && formik.errors.system ? "mm-input-error" : ""}
                  />
                  {formik.touched.system && formik.errors.system && (
                    <span className="mm-form-error">{formik.errors.system}</span>
                  )}
                </label>
                <label className="mm-field">
                  <span>Status</span>
                  <Dropdown
                    value={ticket.status}
                    onChange={(val) => onChangeStatus(ticket.id, val)}
                    options={TICKET_STATUSES.map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    variant="form"
                  />
                </label>
                <label className="mm-field">
                  <span>Assigned Technician</span>
                  <Dropdown
                    value={ticket.assignedTech}
                    onChange={(val) => onAssign(ticket.id, val)}
                    options={technicianOptions(technicians, ticket.assignedTech)}
                    variant="form"
                  />
                </label>
                <label className="mm-field mm-field--full">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    name="description"
                    placeholder="Describe the maintenance request in detail..."
                    maxLength={500}
                    value={formik.values.description}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.description && formik.errors.description ? "mm-input-error" : ""}
                  />
                  {formik.touched.description && formik.errors.description && (
                    <span className="mm-form-error">{formik.errors.description}</span>
                  )}
                </label>
              </div>

              <div className="mm-modal-section-footer">
                <button
                  type="submit"
                  className="mm-btn mm-btn--primary mm-btn--small"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {tab === "schedule" && (
            <form onSubmit={scheduleFormik.handleSubmit} className="mm-schedule-form">
              <div className="mm-form-grid">
                <label className="mm-field">
                  <span>Visit Date</span>
                  <input
                    type="date"
                    name="visitDate"
                    value={scheduleFormik.values.visitDate}
                    onChange={scheduleFormik.handleChange}
                    onBlur={scheduleFormik.handleBlur}
                    className={scheduleFormik.touched.visitDate && scheduleFormik.errors.visitDate ? "mm-input-error" : ""}
                  />
                  {scheduleFormik.touched.visitDate && scheduleFormik.errors.visitDate && (
                    <span className="mm-form-error">{scheduleFormik.errors.visitDate}</span>
                  )}
                </label>
                <label className="mm-field">
                  <span>Technician</span>
                  <Dropdown
                    value={scheduleFormik.values.visitTech}
                    onChange={(val) => scheduleFormik.setFieldValue("visitTech", val)}
                    options={technicianOptions(technicians, scheduleFormik.values.visitTech)}
                    variant="form"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="mm-btn mm-btn--primary mm-btn--small"
              >
                {ticket.scheduledDate
                  ? "Update Scheduled Visit"
                  : "Schedule Visit"}
              </button>
              {ticket.scheduledDate && (
                <p className="mm-cell-sub mm-schedule-note">
                  Currently scheduled for {formatDate(ticket.scheduledDate)}.
                </p>
              )}
            </form>
          )}

          {tab === "resolution" && (
            <form onSubmit={resolutionFormik.handleSubmit} className="mm-resolution-form">
              <label className="mm-field mm-field--full">
                <span>Resolution Notes</span>
                <textarea
                  rows={4}
                  name="notes"
                  placeholder="What was done to resolve this ticket?"
                  value={resolutionFormik.values.notes}
                  onChange={resolutionFormik.handleChange}
                  onBlur={resolutionFormik.handleBlur}
                  className={resolutionFormik.touched.notes && resolutionFormik.errors.notes ? "mm-input-error" : ""}
                />
                {resolutionFormik.touched.notes && resolutionFormik.errors.notes && (
                  <span className="mm-form-error">{resolutionFormik.errors.notes}</span>
                )}
              </label>
              <div className="mm-row-actions">
                <button
                  type="submit"
                  className="mm-btn mm-btn--primary mm-btn--small"
                >
                  Log Resolution &amp; Mark Resolved
                </button>
                {ticket.status === "Resolved" && (
                  <button
                    type="button"
                    className="mm-btn mm-btn--secondary mm-btn--small"
                    onClick={() => onChangeStatus(ticket.id, "Closed")}
                  >
                    Close Ticket
                  </button>
                )}
              </div>
            </form>
          )}

          {tab === "history" && (
            <ul className="mm-timeline">
              {[...ticket.history].reverse().map((h) => (
                <li key={h.id} className="mm-timeline__item">
                  <span className="mm-timeline__dot" />
                  <div>
                    <div className="mm-cell-title">{h.action}</div>
                    {h.detail && <div className="mm-cell-sub">{h.detail}</div>}
                    <div className="mm-cell-sub">{formatDateTime(h.date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={!!deleteConfirm}
          title="Delete Ticket"
          message={`Are you sure you want to delete ticket ${ticket.id} (${ticket.customer})?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            onDelete(ticket.id);
            onClose();
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------- Create ticket modal ------------------------------------- */

function CreateTicketModal({ type, technicians, tickets, onClose, onCreate }) {
  const [customers, setCustomers] = useState([]);
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";

  useEffect(() => {
    customerAPI.getAll({ limit: 500 })
      .then((res) => setCustomers(res.data?.data || []))
      .catch(() => {});
  }, []);

  const customerOptions = customers.map((c) => ({
    value: c.name,
    label: c.name,
  }));

  const formik = useFormik({
    initialValues: {
      type,
      customer: isCustomer ? (user.name || "") : "",
      phone: "",
      system: "",
      priority: "Medium",
      assignedTech: "Unassigned",
      scheduledDate: "",
      description: "",
    },
    validationSchema: ticketSchema,
    onSubmit: (values) => {
      onCreate({ ...values, phone: normalizePhone(values.phone) });
    },
  });

  // Auto-assign technician when customer is pre-filled (customer role)
  useEffect(() => {
    if (isCustomer && formik.values.customer && tickets?.length) {
      const lastTicket = tickets.find((t) => t.customer === formik.values.customer && t.assignedTech && t.assignedTech !== "Unassigned");
      if (lastTicket) {
        formik.setFieldValue("assignedTech", lastTicket.assignedTech);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  return (
    <div className="mm-modal-backdrop">
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mm-modal__header">
          <h2>New {type} Request</h2>
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
              <span>Customer{isCustomer && " (You)"}</span>
              {customerOptions.length > 0 ? (
                <Dropdown
                  value={formik.values.customer}
                  onChange={(val) => {
                  formik.setFieldValue("customer", val);
                  // Auto-assign the technician from the customer's most recent ticket
                  if (val && tickets?.length) {
                    const lastTicket = tickets.find((t) => t.customer === val && t.assignedTech && t.assignedTech !== "Unassigned");
                    if (lastTicket) {
                      formik.setFieldValue("assignedTech", lastTicket.assignedTech);
                    }
                  }
                }}
                  options={isCustomer ? [{ value: formik.values.customer, label: formik.values.customer }] : [{ value: "", label: "Select customer" }, ...customerOptions]}
                  variant="form"
                  disabled={isCustomer}
                />
              ) : (
                <input
                  type="text"
                  name="customer"
                  placeholder="Enter customer full name"
                  maxLength={50}
                  value={formik.values.customer}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isCustomer}
                  className={formik.touched.customer && formik.errors.customer ? "mm-input-error" : ""}
                />
              )}
              {formik.touched.customer && formik.errors.customer && (
                <span className="mm-form-error">{formik.errors.customer}</span>
              )}
            </label>
            <label className="mm-field">
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
                  onBlur={formik.handleBlur}
                  className={formik.touched.phone && formik.errors.phone ? "mm-input-error" : ""}
                />
              </div>
              {formik.touched.phone && formik.errors.phone && (
                <span className="mm-form-error">{formik.errors.phone}</span>
              )}
            </label>
            <label className="mm-field">
              <span>System / Product</span>
              <input
                type="text"
                name="system"
                placeholder="e.g. 5kW On-Grid Solar System"
                maxLength={100}
                value={formik.values.system}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.system && formik.errors.system ? "mm-input-error" : ""}
              />
              {formik.touched.system && formik.errors.system && (
                <span className="mm-form-error">{formik.errors.system}</span>
              )}
            </label>
            <label className="mm-field">
              <span>Priority</span>
              <Dropdown
                value={formik.values.priority}
                onChange={(val) => formik.setFieldValue("priority", val)}
                options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                variant="form"
              />
            </label>
            <label className="mm-field">
              <span>Assign Technician</span>
              <Dropdown
                value={formik.values.assignedTech}
                onChange={(val) => formik.setFieldValue("assignedTech", val)}
                options={technicianOptions(technicians, formik.values.assignedTech)}
                variant="form"
              />
            </label>
            <label className="mm-field mm-field--full">
              <span>Schedule Visit (optional)</span>
              <input
                type="date"
                name="scheduledDate"
                value={formik.values.scheduledDate}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                min={todayISO()}
              />
            </label>
            <label className="mm-field mm-field--full">
              <span>Description</span>
              <textarea
                rows={3}
                name="description"
                placeholder="Describe the maintenance request in detail..."
                maxLength={500}
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={formik.touched.description && formik.errors.description ? "mm-input-error" : ""}
              />
              {formik.touched.description && formik.errors.description && (
                <span className="mm-form-error">{formik.errors.description}</span>
              )}
            </label>
          </div>
          <div className="mm-modal__footer">
            <button
              type="button"
              className="mm-btn mm-btn--ghost"
              onClick={onClose}
              disabled={formik.isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="mm-btn mm-btn--primary" disabled={formik.isSubmitting || !formik.isValid}>
              {formik.isSubmitting ? "Creating Ticket..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


