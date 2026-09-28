import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormik } from "formik";
import "./followUpManagement.css";
import { Dropdown, Pagination, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/Toast";
import StatCard from "../dashboard/StatCard/StatCard";
import { followUpValidationSchema } from "../../utils/AdminValidation";
import {
  followUpAPI,
  leadAPI,
  customerAPI,
  quotationAPI,
  userAPI
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "../../components/common/RecordActivityModal.css";
import "../../styles/ActionButtons.css";

/* ─────────── Constants ─────────── */

const types = ["Call", "Email", "Site Visit", "WhatsApp", "Meeting", "Other"];
const statuses = ["Pending", "Completed", "Rescheduled", "Cancelled", "Missed"];
const priorities = ["Low", "Medium", "High"];

const emptyForm = {
  linkToType: "lead",
  leadId: "",
  customerId: "",
  quotationId: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  type: "Call",
  scheduledDate: new Date().toISOString().split("T")[0],
  scheduledTime: "10:00",
  priority: "Medium",
  assignedTo: "Unassigned",
  notes: "",
  status: "Pending",
  outcome: "",
  nextFollowUpDate: "",
  isEdit: false
};

const FollowUpManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();
  const { canDo, user } = useAuth();
  const queryClient = useQueryClient();

  /* ── State ── */
  const [followUps, setFollowUps] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const [quickStatus, setQuickStatus] = useState("Completed");
  const [quickOutcome, setQuickOutcome] = useState("");

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  // Dynamic dropdown list options
  const [linkToType, setLinkToType] = useState("lead");
  const [leadsList, setLeadsList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [quotationsList, setQuotationsList] = useState([]);
  const [usersList, setUsersList] = useState([]);

  /* ── Debounce Search Input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Fetch Follow-Ups (TanStack Query) ── */
  const { data: followUpRes, isLoading: loading, refetch } = useQuery({
    queryKey: [
      "followUps",
      currentPage,
      pageSize,
      debouncedSearch,
      statusFilter,
      typeFilter,
      priorityFilter,
      assignedFilter,
      dateFrom,
      dateTo
    ],
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: pageSize,
        sortField: "createdAt",
        sortDir: "desc"
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "All") params.status = statusFilter;
      if (typeFilter !== "All") params.type = typeFilter;
      if (priorityFilter !== "All") params.priority = priorityFilter;
      if (assignedFilter !== "All") params.assignedTo = assignedFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await followUpAPI.getAll(params);
      return res.data;
    },
    keepPreviousData: true
  });

  const { data: analyticsRes } = useQuery({
    queryKey: ["followUpAnalytics"],
    queryFn: async () => {
      const res = await followUpAPI.getAnalytics();
      return res.data.data;
    }
  });

  const { data: overdueRes } = useQuery({
    queryKey: ["overdueFollowUps"],
    queryFn: async () => {
      const res = await followUpAPI.getOverdue();
      return res.data.data || [];
    }
  });

  useEffect(() => {
    if (followUpRes?.success) {
      const rows = followUpRes.data || [];
      setFollowUps(rows);
      setServerTotal(followUpRes.pagination?.total || rows.length || 0);
    }
  }, [followUpRes]);

  const analytics = analyticsRes || {
    total: 0,
    dueToday: 0,
    overdue: 0,
    completed7Days: 0,
    byStatus: {},
    byType: {},
    byPriority: {}
  };
  const overdueFollowUps = overdueRes || [];

  // Load option lists for modal dropdowns
  const loadOptions = useCallback(async () => {
    try {
      const [leadsRes, custRes, quotesRes, usersRes] = await Promise.all([
        leadAPI.getAll({ limit: 100 }).catch(() => ({ data: { data: [] } })),
        customerAPI.getAll({ limit: 100 }).catch(() => ({ data: { data: [] } })),
        quotationAPI.getAll({ limit: 100 }).catch(() => ({ data: { data: [] } })),
        userAPI.getAll({ limit: 100 }).catch(() => ({ data: { data: [] } }))
      ]);
      setLeadsList(leadsRes?.data?.data || []);
      setCustomersList(custRes?.data?.data || []);
      setQuotationsList(quotesRes?.data?.data || []);
      
      const rawUsers = usersRes?.data?.data || [];
      const uniqueUsers = [];
      const seenKeys = new Set();
      for (const u of rawUsers) {
        const key = `${u.name || u.email || ""}-${u.role || ""}`.trim().toLowerCase();
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueUsers.push(u);
        }
      }
      setUsersList(uniqueUsers);
    } catch (err) {
      console.warn("Failed to load options:", err.message);
    }
  }, []);

  useEffect(() => {
    if (showModal) {
      loadOptions();
    }
  }, [showModal, loadOptions]);

  /* ── Formik Form ── */
  const formik = useFormik({
    initialValues: emptyForm,
    validationSchema: followUpValidationSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      try {
        const payload = {
          contactName: values.contactName,
          contactPhone: values.contactPhone,
          contactEmail: values.contactEmail,
          type: values.type,
          scheduledDate: values.scheduledDate,
          scheduledTime: values.scheduledTime,
          priority: values.priority,
          assignedTo: values.assignedTo,
          notes: values.notes,
          leadId: values.leadId || undefined,
          customerId: values.customerId || undefined,
          quotationId: values.quotationId || undefined
        };

        if (values.isEdit) {
          payload.status = values.status;
          payload.outcome = values.outcome;
          if (values.nextFollowUpDate) payload.nextFollowUpDate = values.nextFollowUpDate;

          await followUpAPI.update(editingRecord.id || editingRecord._id, payload);
          success("Follow-Up updated successfully");
        } else {
          if (values.nextFollowUpDate) payload.nextFollowUpDate = values.nextFollowUpDate;
          await followUpAPI.create(payload);
          success("Follow-Up created successfully");
        }

        setShowModal(false);
        resetForm();
        queryClient.invalidateQueries(["followUps"]);
        queryClient.invalidateQueries(["followUpAnalytics"]);
        queryClient.invalidateQueries(["overdueFollowUps"]);
      } catch (err) {
        console.error("Save follow-up error:", err);
        const serverErrors = err.response?.data?.errors;
        const msg = err.response?.data?.message || (values.isEdit ? "Failed to update follow-up" : "Failed to create follow-up");

        if (serverErrors && typeof serverErrors === "object") {
          Object.keys(serverErrors).forEach((field) => {
            formik.setFieldError(field, serverErrors[field]);
          });
        } else {
          toastError(msg);
        }
      } finally {
        setSubmitting(false);
      }
    }
  });

  /* ── Record Selection Helper ── */
  const handleRecordSelect = (typeSel, id) => {
    if (!id) return;
    if (typeSel === "lead") {
      const found = leadsList.find((l) => l.leadId === id || l._id === id);
      if (found) {
        formik.setFieldValue("leadId", found.leadId || found._id);
        formik.setFieldValue("contactName", found.name || "");
        formik.setFieldValue("contactPhone", found.phone || "");
        formik.setFieldValue("contactEmail", found.email || "");
      }
    } else if (typeSel === "customer") {
      const found = customersList.find((c) => c.customerId === id || c._id === id);
      if (found) {
        formik.setFieldValue("customerId", found.customerId || found._id);
        formik.setFieldValue("contactName", found.name || "");
        formik.setFieldValue("contactPhone", found.phone || "");
        formik.setFieldValue("contactEmail", found.email || "");
      }
    } else if (typeSel === "quotation") {
      const found = quotationsList.find((q) => q.quotationId === id || q._id === id);
      if (found) {
        const name = found.client || found.clientName || found.customerName || found.customer || found.name || "";
        formik.setFieldValue("quotationId", found.quotationId || found._id);
        formik.setFieldValue("contactName", name);
        formik.setFieldValue("contactPhone", String(found.phone || found.clientPhone || "").replace(/\D/g, "").slice(-10));
        formik.setFieldValue("contactEmail", found.email || found.clientEmail || "");
        if (found.leadId) formik.setFieldValue("leadId", found.leadId);
        if (found.customerId) formik.setFieldValue("customerId", found.customerId);
      }
    }
  };

  /* ── Open Modals ── */
  const openAddModal = () => {
    setEditingRecord(null);
    setLinkToType("lead");
    formik.resetForm({ values: { ...emptyForm, isEdit: false } });
    setShowModal(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    const lead = record.leadId || "";
    const customer = record.customerId || "";
    const quotation = record.quotationId || "";
    const typeSel = lead ? "lead" : customer ? "customer" : "quotation";
    setLinkToType(typeSel);

    formik.resetForm({
      values: {
        linkToType: typeSel,
        leadId: lead,
        customerId: customer,
        quotationId: quotation,
        contactName: record.contactName || "",
        contactPhone: record.contactPhone || "",
        contactEmail: record.contactEmail || "",
        type: record.type || "Call",
        scheduledDate: record.scheduledDate
          ? new Date(record.scheduledDate).toISOString().split("T")[0]
          : "",
        scheduledTime: record.scheduledTime || "",
        priority: record.priority || "Medium",
        assignedTo: record.assignedTo || "Unassigned",
        notes: record.notes || "",
        status: record.status || "Pending",
        outcome: record.outcome || "",
        nextFollowUpDate: record.nextFollowUpDate
          ? new Date(record.nextFollowUpDate).toISOString().split("T")[0]
          : "",
        isEdit: true
      }
    });
    setShowModal(true);
  };

  const openStatusModal = (record) => {
    setStatusTarget(record);
    setQuickStatus(record.status === "Pending" ? "Completed" : record.status);
    setQuickOutcome(record.outcome || "");
    setShowStatusModal(true);
  };

  const handleSaveQuickStatus = async () => {
    if (quickStatus === "Completed" && !quickOutcome.trim()) {
      toastError("Outcome is required when status is Completed");
      return;
    }
    try {
      await followUpAPI.updateStatus(statusTarget.id || statusTarget._id, quickStatus, quickOutcome);
      success("Status updated successfully");
      setShowStatusModal(false);
      setStatusTarget(null);
      queryClient.invalidateQueries(["followUps"]);
      queryClient.invalidateQueries(["followUpAnalytics"]);
      queryClient.invalidateQueries(["overdueFollowUps"]);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await followUpAPI.delete(deleteTarget.id || deleteTarget._id);
      success("Follow-Up deleted successfully");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      queryClient.invalidateQueries(["followUps"]);
      queryClient.invalidateQueries(["followUpAnalytics"]);
      queryClient.invalidateQueries(["overdueFollowUps"]);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete follow-up");
    }
  };

  const handleContactClick = (item) => {
    if (item.leadId && canDo("leads", "view")) {
      navigate(`/admin/dashboard?section=leads`);
    } else if (item.customerId && canDo("customers", "view")) {
      navigate(`/admin/dashboard?section=customers`);
    }
  };

  const totalPages = Math.ceil(serverTotal / pageSize) || 1;

  /* ── SVG Icons for StatCards (matching LeadManagement) ── */
  const iconTotal = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
  const iconDueToday = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
  const iconOverdue = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
  const iconCompleted = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const checkIsOverdue = (record) => {
    if (record.status === "Completed" || record.status === "Cancelled") return false;
    if (!record.scheduledDate) return false;
    const todayStr = new Date().toISOString().split("T")[0];
    return record.scheduledDate < todayStr;
  };

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="follow-up-activity"
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
          <h2>Follow-Ups</h2>
          <p>Track, schedule, and execute customer follow-ups and call history</p>
        </div>
        <div className="lm-header-actions">
          {canDo("follow-ups", "create") && (
            <button className="lm-add-btn" onClick={openAddModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Follow-Up
            </button>
          )}
        </div>
      </div>

      {/* ── Overdue Banner ── */}
      {overdueFollowUps.length > 0 && (
        <div className="lm-overdue-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            <strong>{overdueFollowUps.length}</strong> follow-up{overdueFollowUps.length > 1 ? "s" : ""} overdue
            {overdueFollowUps.length === 1
              ? ` (${overdueFollowUps[0].contactName})`
              : ` — ${overdueFollowUps.slice(0, 3).map((f) => f.contactName).join(", ")}${overdueFollowUps.length > 3 ? ` +${overdueFollowUps.length - 3} more` : ""}`}
          </span>
        </div>
      )}

      {/* ════════ KPI Stats Cards ════════ */}
      <div className="lm-list-stats-grid">
        <StatCard
          title="Total Follow-Ups"
          value={(analytics.total || 0).toLocaleString()}
          icon={iconTotal}
          color="blue"
        />
        <StatCard
          title="Due Today"
          value={(analytics.dueToday || 0).toLocaleString()}
          icon={iconDueToday}
          color="orange"
        />
        <StatCard
          title="Overdue"
          value={(analytics.overdue || 0).toLocaleString()}
          icon={iconOverdue}
          color="red"
        />
        <StatCard
          title="Completed"
          value={(analytics.completed7Days || 0).toLocaleString()}
          icon={iconCompleted}
          color="green"
        />
      </div>

      {/* ── Filters Bar ── */}
      <div className="lm-filters">
        <div className="lm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search contact, phone, email, Id"
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
              ...statuses.map((s) => ({ value: s, label: s }))
            ]}
          />
          <Dropdown
            value={typeFilter}
            onChange={(val) => { setTypeFilter(val); setCurrentPage(1); }}
            options={[
              { value: "All", label: "All Types" },
              ...types.map((t) => ({ value: t, label: t }))
            ]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>From:</span>
            <input
              type="date"
              className="lm-filter-date-inline"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
              title="From date"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>To:</span>
            <input
              type="date"
              className="lm-filter-date-inline"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
              title="To date"
            />
          </div>

          {(search || statusFilter !== "All" || typeFilter !== "All" || dateFrom || dateTo) && (
            <button
              type="button"
              className="lm-reset-filters-btn"
              onClick={() => {
                setSearch("");
                setStatusFilter("All");
                setTypeFilter("All");
                setDateFrom("");
                setDateTo("");
                setCurrentPage(1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset Filters
            </button>
          )}
        </div>
      </div>

          {/* ── Table Card ── */}
          <div className="lm-card">
            <div className="lm-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Next Follow-Up Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableLoader colSpan={6} />
                  ) : followUps.length === 0 ? (
                    <TableEmptyState
                      colSpan={6}
                      message="No follow-up records found matching your filters."
                      onReset={() => {
                        setSearch("");
                        setStatusFilter("All");
                        setTypeFilter("All");
                        setDateFrom("");
                        setDateTo("");
                        setCurrentPage(1);
                      }}
                    />
                  ) : (
                    followUps.map((item) => {
                      const isOverdue = checkIsOverdue(item);
                      return (
                        <tr key={item.id || item._id} className={isOverdue ? "lm-overdue-row" : ""}>
                          {/* ID */}
                          <td className="lm-td-id">{item.followUpId}</td>

                          {/* Contact */}
                          <td>
                            <div className="lm-client-info">
                              <button
                                type="button"
                                className="lm-client-link"
                                onClick={() => handleContactClick(item)}
                              >
                                {item.contactName}
                                {item.leadId && <span className="lm-badge-lead">Lead</span>}
                                {item.customerId && <span className="lm-badge-customer">Customer</span>}
                                {item.quotationId && <span className="lm-badge-quote">Quote</span>}
                              </button>
                              <span className="lm-client-email">
                                {item.contactPhone || item.contactEmail || "—"}
                              </span>
                            </div>
                          </td>

                          {/* Type */}
                          <td>
                            <span className="lm-type-pill">
                              {item.type === "Call" && "📞"}
                              {item.type === "Email" && "✉️"}
                              {item.type === "Site Visit" && "📌"}
                              {item.type === "WhatsApp" && "💬"}
                              {item.type === "Meeting" && "🤝"}
                              {item.type}
                            </span>
                          </td>

                          {/* Status */}
                          <td>
                            {isOverdue ? (
                              <span className="ls-tag ls-overdue" title="Overdue follow-up">
                                Overdue
                              </span>
                            ) : (
                              <span className={`ls-tag ls-${(item.status || "Pending").toLowerCase()}`}>
                                {item.status}
                              </span>
                            )}
                          </td>

                          {/* Next Date */}
                          <td>{item.nextFollowUpDate || item.scheduledDate || "—"}</td>

                          {/* Actions */}
                          <td>
                            <div className="act-actions">
                              <button
                                className="act-btn act-status"
                                title="Quick Status Update"
                                onClick={() => openStatusModal(item)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                              </button>
                              {canDo("follow-ups", "edit") && (
                                <button
                                  className="act-btn act-edit"
                                  title="Edit Follow-Up"
                                  onClick={() => openEditModal(item)}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                              )}
                              <ActivityLogButton
                                module="follow-ups"
                                onClick={() => setRecordActivityTarget({
                                  recordId: item.followUpId || item.id || item._id,
                                  recordLabel: item.contactName || item.followUpId,
                                  module: "follow-ups"
                                })}
                                title="View Follow-Up Activity Log"
                              />
                              {canDo("follow-ups", "delete") && (
                                <button
                                  className="act-btn act-delete"
                                  title="Delete Follow-Up"
                                  onClick={() => {
                                    setDeleteTarget(item);
                                    setShowDeleteDialog(true);
                                  }}
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {followUps.length > 0 && (
              <div className="lm-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="lm-overlay">
          <div className="lm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px" }}>
            <div className="lm-modal-header">
              <h3>{formik.values.isEdit ? `Edit Follow-Up (${editingRecord?.followUpId})` : "Add Follow-Up"}</h3>
              <button className="lm-modal-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form noValidate onSubmit={formik.handleSubmit}>
              <div className="lm-form-grid">
                {/* Link-To Selector on Create */}
                {!formik.values.isEdit && (
                  <div className="lm-form-group lm-form-full">
                    <label style={{ fontSize: "13px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "6px" }}>
                      Link Follow-Up To (Optional)
                    </label>
                    <div className="lm-link-toggle">
                      <button
                        type="button"
                        className={`lm-link-btn ${linkToType === "lead" ? "active" : ""}`}
                        onClick={() => {
                          setLinkToType("lead");
                          formik.setFieldValue("linkToType", "lead");
                          formik.setFieldValue("customerId", "");
                          formik.setFieldValue("quotationId", "");
                        }}
                      >
                        Lead
                      </button>
                      <button
                        type="button"
                        className={`lm-link-btn ${linkToType === "customer" ? "active" : ""}`}
                        onClick={() => {
                          setLinkToType("customer");
                          formik.setFieldValue("linkToType", "customer");
                          formik.setFieldValue("leadId", "");
                          formik.setFieldValue("quotationId", "");
                        }}
                      >
                        Customer
                      </button>
                      <button
                        type="button"
                        className={`lm-link-btn ${linkToType === "quotation" ? "active" : ""}`}
                        onClick={() => {
                          setLinkToType("quotation");
                          formik.setFieldValue("linkToType", "quotation");
                        }}
                      >
                        Quotation
                      </button>
                      <button
                        type="button"
                        className={`lm-link-btn ${linkToType === "other" ? "active" : ""}`}
                        onClick={() => {
                          setLinkToType("other");
                          formik.setFieldValue("linkToType", "other");
                          formik.setFieldValue("leadId", "");
                          formik.setFieldValue("customerId", "");
                          formik.setFieldValue("quotationId", "");
                        }}
                      >
                        Other
                      </button>
                    </div>

                    {linkToType === "lead" && (
                      <Dropdown
                        value={formik.values.leadId}
                        onChange={(val) => {
                          formik.setFieldValue("leadId", val);
                          formik.setFieldTouched("leadId", true);
                          handleRecordSelect("lead", val);
                        }}
                        options={leadsList.map((l) => ({
                          value: l.leadId || l._id,
                          label: `${l.leadId} - ${l.name} (${l.phone || l.email || "No Phone"})`
                        }))}
                        placeholder="-- Select Lead --"
                        variant="form"
                        searchable={true}
                        hasError={formik.touched.leadId && !!formik.errors.leadId}
                      />
                    )}

                    {linkToType === "customer" && (
                      <Dropdown
                        value={formik.values.customerId}
                        onChange={(val) => {
                          formik.setFieldValue("customerId", val);
                          formik.setFieldTouched("customerId", true);
                          handleRecordSelect("customer", val);
                        }}
                        options={customersList.map((c) => ({
                          value: c.customerId || c._id,
                          label: `${c.customerId} - ${c.name} (${c.phone || c.email || "No Phone"})`
                        }))}
                        placeholder="-- Select Customer --"
                        variant="form"
                        searchable={true}
                        hasError={formik.touched.customerId && !!formik.errors.customerId}
                      />
                    )}

                    {linkToType === "quotation" && (
                      <Dropdown
                        value={formik.values.quotationId}
                        onChange={(val) => {
                          formik.setFieldValue("quotationId", val);
                          formik.setFieldTouched("quotationId", true);
                          handleRecordSelect("quotation", val);
                        }}
                        options={quotationsList.map((q) => {
                          const clientName = q.client || q.clientName || q.customerName || q.customer || q.name || "Client";
                          return {
                            value: q.quotationId || q._id,
                            label: `${q.quotationId} - ${clientName}`
                          };
                        })}
                        placeholder="-- Select Quotation --"
                        variant="form"
                        searchable={true}
                        hasError={formik.touched.quotationId && !!formik.errors.quotationId}
                      />
                    )}
                  </div>
                )}

                <div className="lm-form-group">
                  <label>Contact Name <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="contactName"
                    value={formik.values.contactName}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Full contact name"
                    className={formik.touched.contactName && formik.errors.contactName ? "input-has-error" : ""}
                  />
                  {formik.touched.contactName && formik.errors.contactName && (
                    <span className="form-field-error">{formik.errors.contactName}</span>
                  )}
                </div>

                <div className="lm-form-group">
                  <label>Phone Number (Optional)</label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input
                      type="text"
                      name="contactPhone"
                      maxLength={10}
                      value={formik.values.contactPhone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        formik.setFieldValue("contactPhone", val);
                      }}
                      onBlur={formik.handleBlur}
                      placeholder="98765 43210"
                      className={formik.touched.contactPhone && formik.errors.contactPhone ? "input-has-error" : ""}
                    />
                  </div>
                  {formik.touched.contactPhone && formik.errors.contactPhone && (
                    <span className="form-field-error">{formik.errors.contactPhone}</span>
                  )}
                </div>

                <div className="lm-form-group">
                  <label>Email Address (Optional)</label>
                  <input
                    type="email"
                    name="contactEmail"
                    placeholder="email@domain.com"
                    value={formik.values.contactEmail}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.contactEmail && formik.errors.contactEmail ? "input-has-error" : ""}
                  />
                  {formik.touched.contactEmail && formik.errors.contactEmail && (
                    <span className="form-field-error">{formik.errors.contactEmail}</span>
                  )}
                </div>

                <div className="lm-form-group">
                  <label>Follow-Up Type <span style={{ color: "#ef4444" }}>*</span></label>
                  <Dropdown
                    value={formik.values.type}
                    onChange={(val) => {
                      formik.setFieldValue("type", val);
                      formik.setFieldTouched("type", true);
                    }}
                    options={types.map((t) => ({ value: t, label: t }))}
                    variant="form"
                    hasError={formik.touched.type && !!formik.errors.type}
                  />
                  {formik.touched.type && formik.errors.type && (
                    <span className="form-field-error">{formik.errors.type}</span>
                  )}
                </div>

                <div className="lm-form-group">
                  <label>Next Follow-Up Date (Optional)</label>
                  <input
                    type="date"
                    name="nextFollowUpDate"
                    min={new Date().toISOString().split("T")[0]}
                    value={formik.values.nextFollowUpDate}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.nextFollowUpDate && formik.errors.nextFollowUpDate ? "input-has-error" : ""}
                  />
                  {formik.touched.nextFollowUpDate && formik.errors.nextFollowUpDate && (
                    <span className="form-field-error">{formik.errors.nextFollowUpDate}</span>
                  )}
                </div>

                {formik.values.isEdit && (
                  <div className="lm-form-group lm-form-full">
                    <label>Status</label>
                    <Dropdown
                      value={formik.values.status}
                      onChange={(val) => {
                        formik.setFieldValue("status", val);
                        formik.setFieldTouched("status", true);
                      }}
                      options={statuses.map((s) => ({ value: s, label: s }))}
                      variant="form"
                      hasError={formik.touched.status && !!formik.errors.status}
                    />
                    {formik.touched.status && formik.errors.status && (
                      <span className="form-field-error">{formik.errors.status}</span>
                    )}
                  </div>
                )}

                {(formik.values.status === "Completed" || formik.values.isEdit) && (
                  <div className="lm-form-group lm-form-full">
                    <div className="lm-textarea-header">
                      <label>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Outcome / Call Summary {formik.values.status === "Completed" && <span style={{ color: "#ef4444" }}>*</span>}
                      </label>
                      <span className="lm-char-counter">{formik.values.outcome.length} / 1000</span>
                    </div>
                    <textarea
                      name="outcome"
                      rows="3"
                      className={`lm-notes-textarea ${formik.touched.outcome && formik.errors.outcome ? "input-has-error" : ""}`}
                      placeholder="Enter call outcome, meeting discussion points or agreed next steps..."
                      value={formik.values.outcome}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    />
                    {formik.touched.outcome && formik.errors.outcome && (
                      <span className="form-field-error">{formik.errors.outcome}</span>
                    )}
                  </div>
                )}

                <div className="lm-form-group lm-form-full">
                  <div className="lm-textarea-header">
                    <label>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Follow-Up Notes & Agenda
                    </label>
                    <span className="lm-char-counter">{formik.values.notes.length} / 1000</span>
                  </div>
                  <textarea
                    name="notes"
                    rows="3"
                    className={`lm-notes-textarea ${formik.touched.notes && formik.errors.notes ? "input-has-error" : ""}`}
                    placeholder="Key discussion points, customer requirements, quotation details or preparation notes..."
                    value={formik.values.notes}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  />
                  {formik.touched.notes && formik.errors.notes && (
                    <span className="form-field-error">{formik.errors.notes}</span>
                  )}
                </div>
              </div>

              <div className="lm-modal-actions">
                <button type="button" className="lm-cancel-btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="lm-save-btn" disabled={submitting || formik.isSubmitting}>
                  {(submitting || formik.isSubmitting) ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="lm-spinner" style={{ width: "14px", height: "14px" }}></span>
                      Saving...
                    </span>
                  ) : formik.values.isEdit ? (
                    "Save Changes"
                  ) : (
                    "Create Follow-Up"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Status Update Modal ── */}
      {showStatusModal && (
        <div className="lm-overlay">
          <div className="lm-modal" style={{ maxWidth: "480px" }}>
            <div className="lm-modal-header">
              <h3>Update Status ({statusTarget?.followUpId})</h3>
              <button className="lm-modal-close" onClick={() => setShowStatusModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="lm-form-grid" style={{ padding: "20px 24px" }}>
              <div className="lm-form-group lm-form-full">
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px" }}>New Status:</label>
                <Dropdown
                  value={quickStatus}
                  onChange={(val) => setQuickStatus(val)}
                  options={statuses.map((s) => ({ value: s, label: s }))}
                  variant="form"
                />
              </div>

              <div className="lm-form-group lm-form-full">
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                  Outcome / Remarks:
                </label>
                <textarea
                  rows="3"
                  className="lm-notes-textarea"
                  placeholder="Enter call outcome, meeting discussion points, or remarks..."
                  value={quickOutcome}
                  onChange={(e) => setQuickOutcome(e.target.value)}
                />
              </div>
            </div>
            <div className="lm-modal-actions">
              <button type="button" className="lm-cancel-btn" onClick={() => setShowStatusModal(false)}>
                Cancel
              </button>
              <button type="button" className="lm-submit-btn" onClick={handleSaveQuickStatus}>
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {showDeleteDialog && (
        <ConfirmDialog
          isOpen={showDeleteDialog}
          onClose={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
          onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
          onConfirm={handleDeleteConfirm}
          title="Delete Follow-Up Record"
          message={`Are you sure you want to delete follow-up ${deleteTarget?.followUpId} for ${deleteTarget?.contactName}? This action cannot be undone.`}
          confirmLabel="Delete Follow-Up"
          cancelLabel="Cancel"
          variant="danger"
        />
      )}
    </div>
  );
};

export default FollowUpManagement;
