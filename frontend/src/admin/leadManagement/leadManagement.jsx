import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormik } from "formik";
import "./leadManagement.css";
import { Dropdown, Pagination, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/Toast";
import StatCard from "../dashboard/StatCard/StatCard";
import { leadValidationSchema, clampNumberInput } from "../../utils/AdminValidation";
import { leadAPI, activityLogAPI, userAPI, technicianAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "../../components/common/RecordActivityModal.css";
import "../../styles/ActionButtons.css";
import { formatDateDDMMYYYY } from "../../utils/helpers";

/* ─────────── Constants ─────────── */

const statuses = ["New", "Contacted", "Interested", "Converted", "Lost"];

// Statuses the user can actively set. "Converted" is intentionally NOT here —
// converting a lead to a customer is done only via the dedicated
// "Convert to Customer" action button, never from the status dropdown.
const editableStatuses = ["New", "Contacted", "Interested", "Lost"];
const sources = [
  "Website",
  "Referral",
  "Social Media",
  "Cold Call",
  "Walk-in",
  "Email Campaign",
];

const emptyForm = {
  name: "", email: "", phone: "", source: "Website", status: "New",
  value: "", address: "", assigned: "Unassigned", capacity: "", notes: "", followUp: "",
};

/* ── Field Diffs Computer ── */
const computeLeadDiffs = (oldLead, newPayload) => {
  if (!oldLead || !newPayload) return [];
  const fields = [
    { key: "name", label: "name" },
    { key: "email", label: "email" },
    { key: "phone", label: "phone" },
    { key: "source", label: "source" },
    { key: "status", label: "status" },
    { key: "value", label: "value" },
    { key: "address", label: "address" },
    { key: "assigned", label: "assigned" },
    { key: "capacity", label: "capacity" },
    { key: "notes", label: "notes" },
  ];

  const diffs = [];
  fields.forEach(({ key, label }) => {
    let oldVal = oldLead[key];
    let newVal = newPayload[key];
    if (key === "value" || key === "capacity") {
      oldVal = oldVal ? String(oldVal) : "";
      newVal = newVal ? String(newVal) : "";
    }
    if ((oldVal || "") !== (newVal || "")) {
      diffs.push({ field: label, oldValue: oldVal || "N/A", newValue: newVal || "N/A" });
    }
  });
  return diffs;
};

/* ─────────── Component ─────────── */

const LeadManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();
  const { canDo, user } = useAuth();
  const queryClient = useQueryClient();

  /* ── State ── */
  const [leads, setLeads] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [viewActivities, setViewActivities] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showLogModal, setShowLogModal] = useState(null);
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [statusReasonModal, setStatusReasonModal] = useState({ open: false, leadId: null, newStatus: "", oldStatus: "" });
  const [statusReason, setStatusReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [convertTechnician, setConvertTechnician] = useState("");
  const [technicianList, setTechnicianList] = useState([]);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setViewLead(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  // Analytics & overdue data (server driven)
  const [analytics, setAnalytics] = useState(null);
  const [overdueLeads, setOverdueLeads] = useState([]);

  const today = new Date().toISOString().split("T")[0];

  const getFollowUpClass = (lead) => {
    if (!lead.followUp) return "lm-na";
    if (lead.status === "Converted" || lead.status === "Lost") {
      return "lm-follow-closed";
    }
    if (lead.followUp < today) {
      return "lm-follow-overdue";
    }
    if (lead.followUp === today) {
      return "lm-follow-today";
    }
    return "lm-follow-future";
  };

  /* ── Fetch Leads (server-side pagination/filtering via TanStack Query) ── */
  const { data: leadData, isLoading: loading } = useQuery({
    queryKey: ["leads", currentPage, pageSize, debouncedSearch, statusFilter, sourceFilter, assignedFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "All") params.status = statusFilter;
      if (sourceFilter !== "All") params.source = sourceFilter;
      if (assignedFilter !== "All") params.assigned = assignedFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await leadAPI.getAll(params);
      return response.data;
    },
    keepPreviousData: true,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["leadAnalytics"],
    queryFn: async () => {
      const response = await leadAPI.getAnalytics();
      return response.data.data;
    },
  });

  const { data: overdueData } = useQuery({
    queryKey: ["overdueLeads"],
    queryFn: async () => {
      const response = await leadAPI.getOverdue();
      return response.data.data || [];
    },
  });

  // Sync state variables
  useEffect(() => {
    if (leadData?.success) {
      const rows = leadData.data || [];
      setLeads(rows);
      setServerTotal(leadData.pagination?.total || rows.length || 0);
    }
  }, [leadData]);

  useEffect(() => {
    if (analyticsData) {
      setAnalytics(analyticsData);
    }
  }, [analyticsData]);

  useEffect(() => {
    if (overdueData) {
      setOverdueLeads(overdueData);
    }
  }, [overdueData]);

  /* ── Debounce search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Clamp page when total shrinks ── */
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, serverTotal, pageSize]);

  /* ── Formik Form ── */
  const formik = useFormik({
    initialValues: emptyForm,
    validationSchema: leadValidationSchema,
    onSubmit: async (values) => {
      setSubmitting(true);
      const wasEdit = !!editingLead;
      try {
        const payload = {
          name: values.name,
          email: values.email,
          phone: "+91" + (values.phone || "").replace(/\D/g, ""),
          source: values.source,
          status: values.status,
          value: Number(String(values.value).replace(/[₹,]/g, "")),
          address: values.address,
          assigned: values.assigned || "Unassigned",
          capacity: Number(values.capacity) || 0,
          notes: values.notes || "",
          followUp: values.followUp || null,
        };

        let saved = null;
        if (editingLead) {
          const updateId = editingLead.serverId || editingLead._id || editingLead.id;
          const response = await leadAPI.update(updateId, payload);
          if (response.data.success) {
            success("Lead updated successfully.");
            saved = response.data.data;
          }
        } else {
          const response = await leadAPI.create(payload);
          if (response.data.success) {
            success(response.data.message || "Lead created successfully.");
            saved = response.data.data;
            try {
              const targetId = saved?.id || saved?._id;
              const targetLabel = saved?.leadId || saved?.name || payload.name;

              const initialChanges = [
                { field: "name", oldValue: "", newValue: payload.name },
                { field: "email", oldValue: "", newValue: payload.email },
                { field: "phone", oldValue: "", newValue: payload.phone },
                { field: "status", oldValue: "", newValue: payload.status },
                { field: "value", oldValue: "", newValue: String(payload.value) },
              ].filter((c) => c.newValue);

              activityLogAPI
                .create({
                  module: "leads",
                  action: "created",
                  recordId: String(targetId),
                  recordLabel: String(targetLabel),
                  summary: `${user?.name || "Super Admin"} created a new Lead (${payload.name})`,
                  changes: initialChanges,
                })
                .catch((e) => console.warn("Activity log creation failed:", e));
            } catch (logErr) {
              console.warn("Activity log creation error:", logErr);
            }
          }
        }
        setShowModal(false);
        setEditingLead(null);
        if (saved) {
          upsertLead({ ...saved, id: saved.id || saved._id });
          if (!wasEdit) setServerTotal((t) => (t || 0) + 1);
        }
        queryClient.invalidateQueries(["leads"]);
        queryClient.invalidateQueries(["leadAnalytics"]);
        queryClient.invalidateQueries(["overdueLeads"]);
      } catch (err) {
        console.error("Save lead error:", err);
        const serverErrors = err.response?.data?.errors;
        const msg = err.response?.data?.message || (editingLead ? "Failed to update lead" : "Failed to create lead");
        
        if (serverErrors && typeof serverErrors === "object" && !Array.isArray(serverErrors)) {
          Object.keys(serverErrors).forEach((field) => {
            formik.setFieldError(field, serverErrors[field]);
          });
        } else if (Array.isArray(serverErrors) && serverErrors.length) {
          toastError(serverErrors[0]);
        } else if (msg) {
          toastError(msg);
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  /* ── Helpers ── */

  /* ── Helpers ── */
  const formatCurrency = (val) => {
    const num = Number(String(val ?? 0).replace(/[₹,]/g, ""));
    return isNaN(num) ? val : `₹${num.toLocaleString("en-IN")}`;
  };

  // jsPDF's built-in fonts are WinAnsi-encoded and can't render the ₹ glyph,
  // so PDFs use an ASCII-safe "Rs." prefix instead.
  const formatCurrencyPdf = (val) => {
    const num = Number(String(val ?? 0).replace(/[₹,]/g, ""));
    return isNaN(num) ? String(val ?? "") : `Rs. ${num.toLocaleString("en-IN")}`;
  };

  const formatDate = formatDateDDMMYYYY;

  /* ── Local list helpers (instant updates without a full refetch) ── */
  const leadMatchesFilters = useCallback((lead) => {
    if (statusFilter !== "All" && (lead.status || "") !== statusFilter) return false;
    if (sourceFilter !== "All" && (lead.source || "") !== sourceFilter) return false;
    if (assignedFilter === "Assigned" && (!lead.assigned || lead.assigned === "Unassigned")) return false;
    if (assignedFilter === "Unassigned" && (lead.assigned || "") !== "Unassigned") return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      const hay = `${lead.name || ""} ${lead.email || ""} ${lead.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [statusFilter, sourceFilter, assignedFilter, debouncedSearch]);

  const upsertLead = useCallback((lead) => {
    const id = lead.id || lead._id;
    setLeads((prev) => {
      if (prev.some((l) => (l.id || l._id) === id)) {
        // Edit — drop ONLY this row when it no longer matches the active filters
        if (!leadMatchesFilters(lead)) {
          return prev.filter((l) => (l.id || l._id) !== id);
        }
        return prev.map((l) => ((l.id || l._id) === id ? lead : l));
      }
      // Create — only show it when it belongs in the currently filtered list
      return leadMatchesFilters(lead) ? [lead, ...prev] : prev;
    });
  }, [leadMatchesFilters]);

  /* ── Pagination (server-side) ── */
  const totalPages = useMemo(() => Math.max(1, Math.ceil(serverTotal / pageSize)), [serverTotal, pageSize]);

  /* ── Analytics derived values ── */
  const statusCounts = useMemo(() => {
    if (analytics?.statusCounts) return analytics.statusCounts;
    const counts = {};
    statuses.forEach((s) => { counts[s] = 0; });
    return counts;
  }, [analytics]);

  const sourceCounts = useMemo(() => {
    if (analytics?.sourceCounts) return analytics.sourceCounts;
    const counts = {};
    sources.forEach((s) => { counts[s] = 0; });
    return counts;
  }, [analytics]);

  // eslint-disable-next-line no-unused-vars
  const conversionRate = analytics?.conversionRate ?? 0;
  const totalLeadsCount = analytics?.totalLeads ?? serverTotal;
  const newLeadsCount = analytics?.newLeads ?? 0;
  const convertedCount = analytics?.converted ?? 0;
  const pipelineValue = analytics?.totalPipelineValue ?? 0;

  /* ── SVG Icons for StatCards ── */
  const iconTotalLeads = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
  const iconConverted = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
  const iconCurrency = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="M6 13h5" />
      <path d="M10 13a4 4 0 1 0 0-8H6" />
      <path d="m10 13 6 8" />
    </svg>
  );
  const iconNew = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );

  /* ── SVG Icons for Form Fields ── */
  const iconPrice = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="M6 13h5a4 4 0 0 0 0-8H6" />
      <path d="M6 13l8 9" />
    </svg>
  );

  /* ── Fetch Sales Persons ── */
  useEffect(() => {
    if (showModal) {
      userAPI
        .getAll({ limit: 200 })
        .then((res) => {
          const raw = res?.data?.data || [];
          const unique = [];
          const seen = new Set();
          for (const u of raw) {
            if (u.role !== "sales_manager") continue;
            const key = (u.name || u.email || "").trim().toLowerCase();
            if (key && !seen.has(key)) {
              seen.add(key);
              unique.push(u);
            }
          }
          setUsersList(unique);
        })
        .catch(() => setUsersList([]));
    }
  }, [showModal]);

  // Auto-fill assigned sales person when usersList loads (handles async timing)
  useEffect(() => {
    if (!showModal || !usersList.length || user?.role !== "sales_manager") return;
    const currentAssigned = formik.values.assigned;
    // Only auto-fill if currently Unassigned (new lead or unassigned lead being edited)
    if (currentAssigned && currentAssigned !== "Unassigned") return;
    const matched = usersList.find(
      (u) => (u.name || "").trim().toLowerCase() === (user.name || "").trim().toLowerCase()
    );
    if (matched) {
      formik.setFieldValue("assigned", matched.name || matched.email || "");
    }
  }, [showModal, usersList, user?.role]);

  // Fetch technicians when convert dialog opens
  useEffect(() => {
    if (showConvertDialog) {
      technicianAPI
        .getAll({ limit: 200 })
        .then((res) => {
          const raw = res?.data?.data || [];
          setTechnicianList(raw.filter((t) => t.status !== "Inactive"));
        })
        .catch(() => setTechnicianList([]));
    }
  }, [showConvertDialog]);

  /* ── Modal Handlers ── */
  const openAddModal = () => {
    setEditingLead(null);
    formik.resetForm({ values: emptyForm });
    setShowModal(true);
  };

  const openEditModal = (lead) => {
    setEditingLead(lead);
    const defaultAssigned = lead.assigned || "Unassigned";
    // Auto-select sales person name if lead is unassigned and user is sales manager
    const assignedValue =
      user?.role === "sales_manager" && defaultAssigned === "Unassigned"
        ? user.name || defaultAssigned
        : defaultAssigned;
    formik.resetForm({
      values: {
        name: lead.name || "",
        email: lead.email || "",
        phone: String(lead.phone || "").replace(/\D/g, "").slice(-10),
        source: lead.source || "Website",
        status: lead.status || "New",
        value: String(lead.value ?? ""),
        address: lead.address || "",
        assigned: assignedValue,
        capacity: lead.capacity ?? "",
        notes: lead.notes || "",
        followUp: lead.followUp || "",
      },
    });
    setShowModal(true);
  };

  const handleClientClick = (lead) => {
    if (lead.customerId && canDo("customers", "view")) {
      navigate(`/admin/customer-progress?customerId=${encodeURIComponent(lead.customerId)}`);
    } else {
      openViewModal(lead);
    }
  };

  /* ── View Lead (fetch details + activities from server) ── */
  const openViewModal = async (lead) => {
    setViewLead(lead);
    setViewActivities([]);
    setViewLoading(true);
    try {
      const response = await leadAPI.getActivities(lead.id || lead._id);
      if (response.data.success) {
        setViewActivities(response.data.data || []);
      }
    } catch (err) {
      console.error("Fetch lead activities error:", err);
      const msg = err.response?.data?.message || "Failed to load lead activities";
      toastError(msg);
    } finally {
      setViewLoading(false);
    }
  };

  /* ── Status Change ── */
  const changeStatus = (id, newStatus) => {
    const lead = leads.find((l) => (l.id || l._id) === id);
    if (!lead) return;

    const oldStatus = lead.status;
    if (oldStatus === newStatus) return;

    // Open reason modal before changing status
    setStatusReasonModal({ open: true, leadId: id, newStatus, oldStatus });
    setStatusReason("");
    setReasonError("");
  };

  const confirmStatusChange = async () => {
    const { leadId, newStatus, oldStatus } = statusReasonModal;

    if (!statusReason || !statusReason.trim()) {
      setReasonError("Reason is required. Please enter a reason for this status change.");
      return;
    }

    setReasonError("");
    setStatusReasonModal({ open: false, leadId: null, newStatus: "", oldStatus: "" });

    setStatusLoadingId(leadId);
    try {
      const response = await leadAPI.updateStatus(leadId, newStatus, statusReason || "");
      if (response.data.success) {
        const lead = leads.find((l) => (l.id || l._id) === leadId);
        success(response.data.message || `Lead status changed to "${newStatus}".`);
        upsertLead({ ...lead, status: newStatus });
        const targetId = leadId;
        const targetLabel = lead?.leadId || lead?.name || "";
        const reasonText = statusReason ? ` — Reason: ${statusReason}` : "";

        activityLogAPI
          .create({
            module: "leads",
            action: "status_changed",
            recordId: String(targetId),
            recordLabel: String(targetLabel),
            summary: `Status changed (${oldStatus} → ${newStatus})${reasonText} by ${user?.name || "Super Admin"}`,
            changes: [
              { field: "status", oldValue: oldStatus, newValue: newStatus },
              ...(statusReason ? [{ field: "statusReason", oldValue: "", newValue: statusReason }] : []),
            ],
          })
          .catch((e) => console.warn("Activity log creation failed:", e));

        queryClient.invalidateQueries(["leads"]);
        queryClient.invalidateQueries(["leadAnalytics"]);
        queryClient.invalidateQueries(["overdueLeads"]);
      }
    } catch (err) {
      console.error("Update lead status error:", err);
      const msg = err.response?.data?.message || "Failed to update lead status";
      toastError(msg);
    } finally {
      setStatusLoadingId(null);
      setStatusReason("");
    }
  };

  /* ── Confirm Conversion ── */
  const handleConvert = async () => {
    if (!convertTarget) return;
    const lead = leads.find((l) => (l.id || l._id) === convertTarget);
    if (!lead) { setShowConvertDialog(false); setConvertTarget(null); return; }

    setStatusLoadingId(convertTarget);
    try {
      const selectedTech = technicianList.find((t) => t.technicianId === convertTechnician);
      // The backend atomically creates/links a customer and marks the lead Converted
      const response = await leadAPI.convert(convertTarget, {
        technicianId: convertTechnician || "",
        technicianName: selectedTech?.name || "",
        technicianEmail: selectedTech?.email || ""
      });
      if (response.data.success) {
        const created = response.data.data?.created;
        success(
          created
            ? "Lead to customer converted successfully 🎉"
            : "Lead to customer converted successfully"
        );
        const converted = response.data.data?.lead;
        if (converted) {
          upsertLead({ ...converted, id: converted.id || converted._id });
        } else {
          upsertLead({
            ...lead,
            status: "Converted",
            customerId: response.data.data?.customer?._id || lead.customerId,
          });
        }
        queryClient.invalidateQueries(["leads"]);
        queryClient.invalidateQueries(["leadAnalytics"]);
        queryClient.invalidateQueries(["overdueLeads"]);
      }
      setShowConvertDialog(false);
      setConvertTarget(null);
      setConvertTechnician("");
    } catch (err) {
      console.error("Convert lead error:", err);
      const msg = err.response?.data?.message || "Failed to convert lead";
      toastError(msg);
      setShowConvertDialog(false);
      setConvertTarget(null);
      setConvertTechnician("");
    } finally {
      setStatusLoadingId(null);
    }
  };

  /* ── Delete ── */
  const confirmDelete = (id) => {
    setDeleteTarget(id);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const response = await leadAPI.delete(deleteTarget);
      if (response.data.success) {
        success("Lead deleted successfully.");
        const id = deleteTarget;
        setLeads((prev) => prev.filter((l) => (l.id || l._id) !== id));
        setServerTotal((t) => Math.max(0, (t || 0) - 1));
        queryClient.invalidateQueries(["leads"]);
        queryClient.invalidateQueries(["leadAnalytics"]);
        queryClient.invalidateQueries(["overdueLeads"]);
      }
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete lead error:", err);
      // [FLOW-06] Show dependency details if the backend returns them
      const deps = err.response?.data?.dependencies;
      const msg = err.response?.data?.message || "Failed to delete lead";
      if (deps && deps.length > 0) {
        const detail = deps.map((d) => `• ${d.count} ${d.module}${d.count > 1 ? "s" : ""}`).join("\n");
        toastError(`${msg}\n\nLinked records:\n${detail}`);
      } else {
        toastError(msg);
      }
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Download Log ── */
const downloadLeadLog = async (lead) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  // Profile-card palette (plain — no branding)
  const C = {
    banner: "#0f766e",
    accent: "#0f766e",
    label: "#6b7280",
    value: "#111827",
    divider: "#e5e7eb",
    muted: "#9ca3af",
    white: "#ffffff",
  };

  // A4 portrait (jsPDF default) — 210 x 297 mm
  const MARGIN = 20;
  const PAGE_W = 210;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const COL_W = (CONTENT_W - 18) / 2;
  const COL_X = [MARGIN, MARGIN + COL_W + 18];

  let y = 20;

  // ── Summary banner ──
  doc.setFillColor(C.banner);
  doc.roundedRect(MARGIN, y, CONTENT_W, 30, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(C.white);
  doc.text(lead.name || "Lead", MARGIN + 10, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Lead ID: ${lead.leadId || lead.id || "—"}`, MARGIN + 10, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Status: ${lead.status || "—"}`, PAGE_W - MARGIN - 10, y + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Source: ${lead.source || "—"}`, PAGE_W - MARGIN - 10, y + 22, { align: "right" });

  y += 30 + 12;

  // ── Sectioned field groups ──
  const renderSection = (title, fields) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C.accent);
    doc.text(String(title).toUpperCase(), MARGIN, y);
    doc.setDrawColor(C.divider);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 8;

    for (let i = 0; i < fields.length; i += 2) {
      const pair = [fields[i], fields[i + 1] || null];
      const wrapped = pair.map((f) =>
        f ? doc.splitTextToSize(String(f[1] ?? "").trim() || "—", COL_W) : []
      );
      const maxLines = Math.max(
        wrapped[0].length,
        wrapped[1] ? wrapped[1].length : 0
      );
      const rowH = Math.max(12.5, 6 + maxLines * 4.5);

      pair.forEach((f, ci) => {
        if (!f) return;
        const x = COL_X[ci];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(C.label);
        doc.text(String(f[0]).toUpperCase(), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(C.value);
        doc.text(wrapped[ci], x, y + 4.8);
      });

      y += rowH;
    }
    y += 6;
  };

  renderSection("Contact Information", [
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Address", lead.address],
  ]);

  renderSection("Project Details", [
    ["Lead Value", formatCurrencyPdf(lead.value)],
    ["Capacity", lead.capacity ? `${lead.capacity} kW` : "N/A"],
    ["Source", lead.source],
  ]);

  renderSection("Status & Follow-Up", [
    ["Status", lead.status],
    ["Assigned To", lead.assigned || "Unassigned"],
    ["Follow-Up Date", lead.followUp ? formatDate(lead.followUp) : "Not set"],
    ["Date Created", formatDate(lead.date)],
  ]);

  // ── Notes ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C.accent);
  doc.text("NOTES", MARGIN, y);
  doc.setDrawColor(C.divider);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  y += 8;
  const notes = doc.splitTextToSize(
    String(lead.notes || "").trim() || "—",
    CONTENT_W
  );
  if (y + notes.length * 5.2 > 250) {
    doc.addPage();
    y = 30;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(C.value);
  doc.text(notes, MARGIN, y);

  // ── Footer (pinned to bottom) ──
  doc.setDrawColor(C.divider);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 272, PAGE_W - MARGIN, 272);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(C.muted);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, MARGIN, 280);

  // Safe filename
  const safeName = (lead.name || "Lead")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  // Download PDF
  doc.save(`LeadLog_${safeName}.pdf`);

  success("Lead log downloaded successfully.");
};

  /* ── Source / Status CSS ── */
  const getSourceClass = (source) => {
    switch (source) {
      case "Website": return "lms-website";
      case "Referral": return "lms-referral";
      case "Social Media": return "lms-social";
      case "Cold Call": return "lms-call";
      case "Walk-in": return "lms-walk";
      case "Email Campaign": return "lms-email";
      default: return "";
    }
  };

  const getSourceColor = (source) => {
    switch (source) {
      case "Website": return "#2563eb";
      case "Referral": return "#059669";
      case "Social Media": return "#7c3aed";
      case "Cold Call": return "#ea580c";
      case "Walk-in": return "#0d9488";
      case "Email Campaign": return "#db2777";
      default: return "#2c5364";
    }
  };

  /* ── Activity icon ── */
  const getActivityClass = (type) => {
    switch (type) {
      case "created": return "lm-act-created";
      case "status": return "lm-act-status";
      case "converted": return "lm-act-converted";
      case "note": return "lm-act-note";
      default: return "lm-act-note";
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case "created": return "+";
      case "status": return "↻";
      case "converted": return "★";
      case "note": return "📝";
      default: return "•";
    }
  };

  /* ── Render ── */
  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="lead-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="lm-container">
      {/* ── Header ── */}
      <div className="lm-header">
        <div className="lm-header-left">
          <h2>Lead Management</h2>
          <p>
            Capture, nurture, and convert potential customers into confirmed
            solar installation projects
          </p>
        </div>
        <div className="lm-header-actions">
          {canDo("leads", "create") && (
          <button className="lm-add-btn" onClick={openAddModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Lead
          </button>
          )}
        </div>
      </div>

      {/* ── Overdue Follow-up Banner ── */}
      {overdueLeads.length > 0 && (
        <div className="lm-overdue-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            <strong>{overdueLeads.length}</strong> lead{overdueLeads.length > 1 ? "s" : ""} with overdue follow-up
            {overdueLeads.length === 1
              ? ` (${overdueLeads[0].name})`
              : ` — ${overdueLeads.slice(0, 3).map((l) => l.name).join(", ")}${overdueLeads.length > 3 ? ` +${overdueLeads.length - 3} more` : ""}`}
          </span>
        </div>
      )}

      {/* ════════ KPI Stats Cards (always visible at top) ════════ */}
      <div className="lm-list-stats-grid">
        <StatCard
          title="Total Leads"
          value={totalLeadsCount.toLocaleString()}
          // change={12.5}
          icon={iconTotalLeads}
          color="blue"
        />
        <StatCard
          title="New (Uncontacted)"
          value={newLeadsCount.toLocaleString()}
          // change={-2.4}
          icon={iconNew}
          color="orange"
        />
        <StatCard
          title="Converted"
          value={convertedCount.toLocaleString()}
          // change={parseFloat(conversionRate)}
          icon={iconConverted}
          color="green"
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(pipelineValue)}
          // change={15.8} 
          icon={iconCurrency}
          color="teal"
        />
      </div>

      {/* ── Filters ── */}
          <div className="lm-filters">
            <div className="lm-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search lead by name, email or phone"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              />
              {search && (
                <button className="lm-search-clear" onClick={() => setSearch("")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <div className="lm-filter-selects">
              <Dropdown
                value={statusFilter}
                onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
                options={[
                  { value: "All", label: "All Status" },
                  ...statuses.map((s) => ({ value: s, label: s })),
                ]}
              />
              <Dropdown
                value={sourceFilter}
                onChange={(val) => { setSourceFilter(val); setCurrentPage(1); }}
                options={[
                  { value: "All", label: "All Sources" },
                  ...sources.map((s) => ({ value: s, label: s })),
                ]}
              />
              <Dropdown
                value={assignedFilter}
                onChange={(val) => { setAssignedFilter(val); setCurrentPage(1); }}
                options={[
                  { value: "All", label: "All Assignees" },
                  { value: "Assigned", label: "Assigned" },
                  { value: "Unassigned", label: "Unassigned" },
                ]}
              />
              <input type="date" className="lm-filter-date-inline" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
              <input type="date" className="lm-filter-date-inline" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />
            </div>
          </div>

          {/* ── Table ── */}
          <div className="lm-card">
            <div className="lm-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Client</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th>Assigned</th>
                    <th>Follow-up</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableLoader colSpan={8} />
                  ) : leads.length === 0 ? (
                    <TableEmptyState colSpan={8} title="No leads found" subtitle="Try adjusting your search or filters." />
                  ) : (
                    leads.map((lead) => (
                      <tr key={lead.id || lead._id}>
                        <td className="lm-td-id">{lead.leadId || lead.id}</td>
                        <td>
                          <div className="lm-client-info">
                            <button
                              type="button"
                              className={`lm-client-link${lead.customerId && canDo("customers", "view") ? " lm-client-link-customer" : ""}`}
                              onClick={() => handleClientClick(lead)}
                              title={
                                lead.customerId && canDo("customers", "view")
                                  ? `View ${lead.name}'s customer profile & project progress`
                                  : `View ${lead.name}'s lead details`
                              }
                            >
                              {lead.name}
                              {lead.customerId && canDo("customers", "view") && (
                                <span className="lm-client-link-badge">Customer</span>
                              )}
                            </button>
                            <span className="lm-client-email">{lead.email}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`lms-tag ${getSourceClass(lead.source)}`}>
                            {lead.source}
                          </span>
                        </td>
                        <td>
                          {lead.status === "Converted" ? (
                            <span className="lm-status-indicator ls-converted">
                              Converted
                            </span>
                          ) : canDo("leads", "edit") ? (
                            <Dropdown
                              value={lead.status}
                              onChange={(val) => changeStatus(lead.id || lead._id, val)}
                              options={editableStatuses.map((s) => ({ value: s, label: s }))}
                              variant="inline"
                              size="sm"
                              disabled={statusLoadingId === (lead.id || lead._id)}
                            />
                          ) : (
                            <span className={`lm-status-indicator ls-${String(lead.status).toLowerCase()}`}>{lead.status}</span>
                          )}
                        </td>
                        <td className="lm-td-value">{formatCurrency(lead.value)}</td>
                        <td className="lm-td-assigned">{lead.assigned}</td>
                        <td className="lm-td-followup">
                          {lead.followUp ? (
                            <span className={`lm-follow-date ${getFollowUpClass(lead)}`}>
                              {lead.followUp < today && lead.status !== "Converted" && lead.status !== "Lost" && "Overdue: "}
                              {lead.followUp === today && lead.status !== "Converted" && lead.status !== "Lost" && "Today: "}
                              {formatDate(lead.followUp)}
                            </span>
                          ) : (
                            <span className="lm-na">—</span>
                          )}
                        </td>
                        <td>
                          <div className="act-actions">
                            {!lead.customerId && canDo("leads", "edit") && (
                              <button
                                className="act-btn act-convert"
                                title="Convert to Customer"
                                onClick={() => {
                                  setConvertTarget(lead.id || lead._id);
                                  setShowConvertDialog(true);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                                  <circle cx="8.5" cy="7" r="4" />
                                  <line x1="20" y1="8" x2="20" y2="14" />
                                  <line x1="23" y1="11" x2="17" y2="11" />
                                </svg>
                              </button>
                            )}
                            <button
                              className="act-btn act-view"
                              title="View Details"
                              onClick={() => openViewModal(lead)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                             <ActivityLogButton
                              module="leads"
                              onClick={() => {
                                const leadDbId = lead.serverId || lead._id || lead.id;
                                navigate(`/admin/lead-activity/${leadDbId}`, {
                                  state: { target: { recordId: leadDbId, recordLabel: lead.leadId || lead.name, module: "leads" } },
                                });
                              }}
                              title="View Lead Activity Log"
                            />
                            {canDo("leads", "edit") && (
                            <button
                              className="act-btn act-edit"
                              title="Edit"
                              onClick={() => openEditModal(lead)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            )}
                            {canDo("leads", "delete") && (
                            <button
                              className="act-btn act-delete"
                              title="Delete"
                              onClick={() => confirmDelete(lead.id || lead._id)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            {leads.length > 0 && (
              <div className="lm-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  variant="table"
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  disabled={submitting}
                />
              </div>
            )}
          </div>

      {/* ════════ View Lead Modal ════════ */}
      {viewLead && (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>{viewLead.name}</h3>
                <span className={`lms-tag ${getSourceClass(viewLead.source)}`}>
                  {viewLead.source}
                </span>
                <span className={`lm-status-indicator ls-${String(viewLead.status).toLowerCase()}`}>
                  {viewLead.status}
                </span>
              </div>
              <button className="vm-modal-close" onClick={() => setViewLead(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="vm-view-body">
              {/* ── Details Grid ── */}
              <div className="lm-view-section">
                <h4>Contact Information</h4>
                <div className="lm-view-grid">
                  <div className="lm-view-item">
                    <span className="lm-view-label">Lead ID</span>
                    <span className="lm-view-value">{viewLead.leadId || viewLead.id}</span>
                  </div>
                  {viewLead.customerId && (
                    <div className="lm-view-item">
                      <span className="lm-view-label">Linked Customer</span>
                      <span className="lm-view-value lm-view-value-highlight">
                        {viewLead.name}
                      </span>
                    </div>
                  )}
                  <div className="lm-view-item">
                    <span className="lm-view-label">Email</span>
                    <span className="lm-view-value">{viewLead.email}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Phone</span>
                    <span className="lm-view-value">{viewLead.phone}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Address</span>
                    <span className="lm-view-value">{viewLead.address}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Lead Value</span>
                    <span className="lm-view-value lm-view-value-highlight">{formatCurrency(viewLead.value)}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Date Created</span>
                    <span className="lm-view-value">{formatDate(viewLead.date)}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Assigned To</span>
                    <span className="lm-view-value">{viewLead.assigned}</span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Capacity</span>
                    <span className="lm-view-value">
                      {viewLead.capacity ? (
                        `${viewLead.capacity} kW`
                      ) : (
                        <span className="lm-na">Not set</span>
                      )}
                    </span>
                  </div>
                  <div className="lm-view-item">
                    <span className="lm-view-label">Follow-up Date</span>
                    <span className="lm-view-value">
                      {viewLead.followUp ? (
                        <span className={`lm-follow-date ${getFollowUpClass(viewLead)}`}>
                          {viewLead.followUp < today && viewLead.status !== "Converted" && viewLead.status !== "Lost" && "Overdue: "}
                          {viewLead.followUp === today && viewLead.status !== "Converted" && viewLead.status !== "Lost" && "Today: "}
                          {formatDate(viewLead.followUp)}
                        </span>
                      ) : (
                        <span className="lm-na">Not set</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Notes ── */}
              <div className="lm-view-section">
                <h4>Notes</h4>
                <p className="lm-view-notes">
                  {viewLead.notes || (
                    <span className="lm-na">No notes added yet.</span>
                  )}
                </p>
              </div>

              {/* ── Activity Timeline ── */}
              <div className="lm-view-section">
                <h4>Activity Timeline</h4>
                <div className="lm-timeline">
                  {viewLoading ? (
                    <div className="lm-empty-state">
                      <span className="lm-spinner"></span>
                      <p>Loading activity...</p>
                    </div>
                  ) : viewActivities.length > 0 ? (
                    viewActivities.map((act) => (
                      <div key={act.id || act._id} className="lm-timeline-item">
                        <div className={`lm-timeline-icon ${getActivityClass(act.type)}`}>
                          <span className="lm-act-icon">{getActivityIcon(act.type)}</span>
                        </div>
                        <div className="lm-timeline-content">
                          <p className="lm-timeline-message">{act.message}</p>
                          <span className="lm-timeline-meta">
                            {act.timestamp} — {act.user}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="lm-na">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="vm-modal-footer">
              <button className="vm-btn-close-primary" onClick={() => setViewLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Add / Edit Lead Modal ════════ */}
      {showModal && (
        <div className="lm-overlay">
          <div className="lm-modal">
            <div className="lm-modal-header">
              <h3>{editingLead ? "Edit Lead" : "Add Lead"}</h3>
              <button className="lm-modal-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form noValidate onSubmit={formik.handleSubmit}>
              <div className="lm-form-grid">
                <div className="lm-form-group">
                  <label>Client Name <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="name"
                    maxLength={50}
                    value={formik.values.name}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Full name"
                    className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
                  />
                  {formik.touched.name && formik.errors.name && (
                    <span className="form-field-error">{formik.errors.name}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Email <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="email"
                    maxLength={100}
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="email@domain.com"
                    className={formik.touched.email && formik.errors.email ? "input-has-error" : ""}
                  />
                  {formik.touched.email && formik.errors.email && (
                    <span className="form-field-error">{formik.errors.email}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input
                      type="text"
                      name="phone"
                      maxLength={10}
                      value={formik.values.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        formik.setFieldValue("phone", val);
                      }}
                      onBlur={formik.handleBlur}
                      placeholder="98765 43210"
                      className={formik.touched.phone && formik.errors.phone ? "input-has-error" : ""}
                    />
                  </div>
                  {formik.touched.phone && formik.errors.phone && (
                    <span className="form-field-error">{formik.errors.phone}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Lead Value (₹) <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="lm-input-with-icon">
                    <span className="lm-input-icon">{iconPrice}</span>
                    <input
                      type="number"
                      name="value"
                      value={formik.values.value}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      placeholder="e.g. 12500"
                      maxLength={12}
                      min="1"
                      step="any"
                      className={formik.errors.value && formik.touched.value ? "input-has-error" : ""}
                    />
                  </div>
                  {(formik.touched.value || (formik.values.value !== "" && Number(String(formik.values.value).replace(/[₹,]/g, "")) > 100000000)) && formik.errors.value && (
                    <span className="form-field-error">{formik.errors.value}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Source <span style={{ color: "#ef4444" }}>*</span></label>
                  <Dropdown
                    value={formik.values.source}
                    onChange={(val) => formik.setFieldValue("source", val)}
                    options={sources.map((s) => ({ value: s, label: s }))}
                    variant="form"
                  />
                </div>
                <div className="lm-form-group">
                  <label>Status <span style={{ color: "#ef4444" }}>*</span></label>
                  {editingLead?.status === "Converted" ? (
                    <div className="lm-status-readonly">
                      <span className="lm-status-indicator ls-converted">Converted</span>
                      <small>Converted leads are managed from the leads list.</small>
                    </div>
                  ) : (
                    <Dropdown
                      value={formik.values.status}
                      onChange={(val) => formik.setFieldValue("status", val)}
                      options={editableStatuses.map((s) => ({ value: s, label: s }))}
                      variant="form"
                    />
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Capacity (kW) <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="number"
                    name="capacity"
                    value={formik.values.capacity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d{0,3}(\.\d{0,2})?$/.test(v)) formik.handleChange(e);
                    }}
                    onBlur={formik.handleBlur}
                    placeholder="e.g. 5.5"
                    min="0"
                    step="any"
                    className={formik.errors.capacity && (formik.touched.capacity || formik.submitCount > 0 || Number(formik.values.capacity) > 999.99) ? "input-has-error" : ""}
                  />
                  {(formik.touched.capacity || formik.submitCount > 0 || Number(formik.values.capacity) > 999.99) && formik.errors.capacity && (
                    <span className="form-field-error">{formik.errors.capacity}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Assigned Sales Person</label>
                  <Dropdown
                    value={formik.values.assigned}
                    onChange={(val) => formik.setFieldValue("assigned", val)}
                    options={[
                      { value: "Unassigned", label: "Unassigned" },
                      ...usersList.map((u) => ({
                        value: u.name || u.email,
                        label: u.name || u.email,
                      })),
                    ]}
                    variant="form"
                  />
                </div>
                <div className="lm-form-group lm-form-full">
                  <label>Address <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="address"
                    maxLength={250}
                    value={formik.values.address}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Street, City"
                    className={formik.touched.address && formik.errors.address ? "input-has-error" : ""}
                  />
                  {formik.touched.address && formik.errors.address && (
                    <span className="form-field-error">{formik.errors.address}</span>
                  )}
                </div>
                <div className="lm-form-group">
                  <label>Follow-up Date <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="lm-date-wrapper">
                    <input
                      type="date"
                      name="followUp"
                      value={formik.values.followUp}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      min={new Date().toISOString().split("T")[0]}
                      className={formik.errors.followUp && (formik.touched.followUp || formik.submitCount > 0) ? "input-has-error lm-date-input" : "lm-date-input"}
                    />
                    <svg className="lm-date-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  {formik.errors.followUp && (formik.touched.followUp || formik.submitCount > 0) && (
                    <span className="form-field-error">{formik.errors.followUp}</span>
                  )}
                </div>
                <div className="lm-form-group lm-form-full">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    maxLength={500}
                    className={formik.touched.notes && formik.errors.notes ? "lm-form-textarea input-has-error" : "lm-form-textarea"}
                    value={formik.values.notes}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Lead notes..."
                    rows="2"
                  />
                  {formik.touched.notes && formik.errors.notes && (
                    <span className="form-field-error">{formik.errors.notes}</span>
                  )}
                </div>
              </div>
              <div className="lm-modal-actions">
                <button type="submit" className="lm-save-btn" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="lm-spinner lm-spinner-light"></span>
                      {editingLead ? "Updating..." : "Saving..."}
                    </>
                  ) : (
                    editingLead ? "Update" : "Add Lead"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════ Delete Confirmation ════════ */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Lead"
        message={`Are you sure you want to delete this lead?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteDialog(false);
          setDeleteTarget(null);
        }}
        loading={submitting}
      />

      {/* ════════ Convert Confirmation ════════ */}
      <ConvertCustomerModal
        open={showConvertDialog}
        lead={leads.find((l) => (l.id || l._id) === convertTarget)}
        onClose={() => {
          setShowConvertDialog(false);
          setConvertTarget(null);
          setConvertTechnician("");
        }}
        onConfirm={handleConvert}
        loading={!!statusLoadingId}
        technicianList={technicianList}
        selectedTechnician={convertTechnician}
        onTechnicianChange={setConvertTechnician}
      />
      {/* ════════ Status Change Reason Modal ════════ */}
      {statusReasonModal.open && (
        <div className="lm-reason-overlay" onClick={() => { setStatusReasonModal({ open: false, leadId: null, newStatus: "", oldStatus: "" }); setReasonError(""); }}>
          <div className="lm-reason-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="lm-reason-title">Reason for Status Change</h3>
            <p className="lm-reason-subtitle">
              Changing from <strong>{statusReasonModal.oldStatus}</strong> to <strong>{statusReasonModal.newStatus}</strong>
            </p>
            <textarea
              className="lm-reason-textarea"
              placeholder="Enter the reason for this status change..."
              rows={4}
              value={statusReason}
              onChange={(e) => { setStatusReason(e.target.value); if (reasonError) setReasonError(""); }}
              autoFocus
            />
            {reasonError && (
              <span style={{ color: "#ef4444", fontSize: 13, marginTop: 4, display: "block" }}>{reasonError}</span>
            )}
            <div className="lm-reason-actions">
              <button
                className="lm-reason-btn lm-reason-btn-cancel"
                onClick={() => { setStatusReasonModal({ open: false, leadId: null, newStatus: "", oldStatus: "" }); setStatusReason(""); setReasonError(""); }}
              >
                Cancel
              </button>
              <button
                className="lm-reason-btn lm-reason-btn-confirm"
                onClick={confirmStatusChange}
              >
                Confirm Change
              </button>
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
                  {showLogModal.leadId || showLogModal.id || showLogModal._id}
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
                      {showLogModal.status || "New"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date Created</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.date ? formatDate(showLogModal.date) : (showLogModal.createdAt ? new Date(showLogModal.createdAt).toLocaleDateString("en-IN") : "—")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Follow-up Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.followUp ? formatDate(showLogModal.followUp) : "Not set"}
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
                  Lead Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.name}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Email Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.email || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Phone Number</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.phone || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Lead Source</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.source || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Assigned Representative</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.assigned || "Unassigned"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>System Capacity</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.capacity || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Project Value</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.value ? formatCurrency(showLogModal.value) : "—"}</div>
                  </div>
                </div>

                {showLogModal.address && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Site Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.address}</div>
                  </div>
                )}

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
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════ Convert to Customer — website-themed modal ════════ */
function ConvertCustomerModal({ open, lead, onClose, onConfirm, loading, technicianList = [], selectedTechnician, onTechnicianChange }) {
  if (!open) return null;

  const rows = [
    { label: "Customer Name", value: lead?.name },
    { label: "Phone", value: lead?.phone },
    { label: "Email", value: lead?.email },
    { label: "Lead Value", value: lead?.value != null && lead.value !== "" ? `\u20b9${Number(lead.value).toLocaleString("en-IN")}` : "" },
  ].filter((r) => r.value);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(15,32,39,0.55)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={loading ? undefined : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 430,
          overflow: "hidden", boxShadow: "0 25px 80px rgba(0,0,0,0.35)",
          animation: "cvt-pop .32s cubic-bezier(.16,1,.3,1)",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        {/* ── Header (website gradient theme) ── */}
        <div style={{ background: "linear-gradient(135deg,#0f2027 0%,#2c5364 100%)", padding: "22px 24px 20px", position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: -45, right: -25, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,184,28,0.08)" }} />
          <div style={{ position: "absolute", bottom: -30, right: 60, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            style={{ position: "absolute", top: 14, right: 14, zIndex: 2, width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "not-allowed" : "pointer", transition: "background .2s" }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(255,184,28,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb81c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>Convert to Customer</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                This lead will join the customer &amp; installation pipeline
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1 }}>
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "#334155", lineHeight: 1.55 }}>
            Convert <strong>{lead?.name || "this lead"}</strong> into a customer? The status will change to{" "}
            <span className="lm-status-indicator ls-converted">Converted</span> and a customer record will be created.
          </p>

          {rows.length > 0 && (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
              {rows.map((r, i) => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: i % 2 === 0 ? "#f8fafc" : "#fff", borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, minWidth: 108 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", wordBreak: "break-word" }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Technician Assignment */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Assign Technician <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <Dropdown
              value={selectedTechnician || ""}
              onChange={(val) => onTechnicianChange(val)}
              options={[
                { value: "", label: "Select technician..." },
                ...technicianList.map((t) => ({
                  value: t.technicianId,
                  label: `${t.name} (${t.technicianId})`
                }))
              ]}
              placeholder="Select technician..."
              variant="form"
            />
            {technicianList.length === 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>No technicians available</p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(44,83,100,0.06)", border: "1px solid rgba(44,83,100,0.15)", borderRadius: 10, padding: "11px 13px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
              After conversion, the assigned technician can create a site survey for this customer.
            </span>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div style={{ padding: "14px 24px 18px", borderTop: "1px solid #f0f0f0", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", transition: "all .15s", fontFamily: "inherit" }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#334155"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !selectedTechnician}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: loading || !selectedTechnician ? "#94a3b8" : "linear-gradient(135deg,#0f2027 0%,#2c5364 100%)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: loading || !selectedTechnician ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 7, transition: "all .15s", boxShadow: loading ? "none" : "0 2px 8px rgba(44,83,100,0.3)", fontFamily: "inherit" }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "cvt-spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                Converting...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" />
                </svg>
                Convert to Customer
              </>
            )}
          </button>
        </div>

        <style>{`
          @keyframes cvt-pop {
            from { opacity: 0; transform: translateY(24px) scale(.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes cvt-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default LeadManagement;
