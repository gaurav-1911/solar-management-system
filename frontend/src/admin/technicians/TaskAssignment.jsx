import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Pagination, Dropdown, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { taskAssignmentSchema } from "../../utils/AdminValidation";
import { taskAssignmentAPI, technicianAPI, leadAPI, siteSurveyAPI, installationAPI } from "../../services/api";
import { createProfilePdf } from "../../utils/pdfLayout";
import { formatDate, toISODate } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import "./TaskAssignment.css";

const JOB_PRIORITIES = ["Low", "Medium", "High"];
const JOB_STATUSES = ["Pending", "In Progress", "Completed"];
const PAGE_SIZES = [5, 10, 15, 25];

function getPriorityClass(p) {
  return p === "High" ? "tm-priority-high" : p === "Medium" ? "tm-priority-medium" : "tm-priority-low";
}

function getStatusClass(s) {
  return s === "Completed" ? "tm-status-done" : s === "In Progress" ? "tm-status-progress" : "tm-status-pending";
}

const TaskAssignment = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { user, canDo } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  // A technician's customers are gathered from every place the app links them:
  //  - leads assigned to the technician (lead.assigned stores the tech name)
  //  - site surveys done by the technician (survey.technicianName + customerName)
  //  - installations assigned to the technician (installation.technicianName + customerName)
  const [leads, setLeads] = useState([]);
  const [siteSurveys, setSiteSurveys] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("All");
  const [jobStatusFilter, setJobStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showJobPage, setShowJobPage] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const anyModalOpen = showViewModal || showDeleteDialog;

  // â”€â”€ Fetch task assignments from API â”€â”€
  const fetchJobs = useCallback(async () => {
    setFetchLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (jobStatusFilter !== "All") params.status = jobStatusFilter;
      if (technicianFilter !== "All") params.technicianName = technicianFilter;
      if (priorityFilter !== "All") params.priority = priorityFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await taskAssignmentAPI.getAll(params);
      if (response.data?.success) {
        const rows = response.data.data || [];
        setJobs(rows);
        setServerTotal(response.data.pagination?.total || rows.length || 0);
      }
    } catch (err) {
      console.error("Fetch jobs error:", err);
      const msg = err.response?.data?.message || "Failed to fetch task assignments";
      toastError(msg);
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, jobStatusFilter, technicianFilter, priorityFilter, dateFrom, dateTo, toastError]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Debounce the search input so keystrokes don't fire an API call each ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // â”€â”€ Fetch technicians for the dropdown â”€â”€
  useEffect(() => {
    let cancelled = false;
    const loadTechnicians = async () => {
      try {
        const res = await technicianAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        if (!cancelled) setTechnicians(docs);
      } catch (err) {
        console.warn("Failed to load technicians:", err?.message);
      }
    };
    loadTechnicians();
    return () => { cancelled = true; };
  }, []);

  // Technicians see only the tasks assigned to them. Once the roster loads,
  // auto-select the logged-in technician's own name in the filter (tasks are
  // keyed by technicianName). If the account name doesn't match any roster
  // name, fall back to showing all tasks.
  useEffect(() => {
    if (user?.role !== "technician") return;
    if (technicianFilter !== "All") return; // user already picked a filter
    if (technicians.length === 0) return;   // roster still loading
    const myName = user?.name;
    if (myName && technicians.some((t) => t.name === myName)) {
      setTechnicianFilter(myName);
    }
  }, [user, technicians, technicianFilter]);

  // â”€â”€ Fetch leads for the technician's customer dropdown â”€â”€
  useEffect(() => {
    let cancelled = false;
    const loadLeads = async () => {
      try {
        const res = await leadAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        if (!cancelled) setLeads(docs);
      } catch (err) {
        console.warn("Failed to load leads:", err?.message);
      }
    };
    loadLeads();
    return () => { cancelled = true; };
  }, []);

  // â”€â”€ Fetch site surveys + installations for the customer dropdown â”€â”€
  useEffect(() => {
    let cancelled = false;
    const loadLinks = async () => {
      try {
        const [svRes, instRes] = await Promise.all([
          siteSurveyAPI.getAll({ page: 1, limit: 100 }),
          installationAPI.getAll({ page: 1, limit: 100 }),
        ]);
        if (!cancelled) {
          setSiteSurveys(svRes.data?.data || []);
          setInstallations(instRes.data?.data || []);
        }
      } catch (err) {
        console.warn("Failed to load surveys/installations:", err?.message);
      }
    };
    loadLinks();
    return () => { cancelled = true; };
  }, []);

  // â”€â”€ Prevent background scroll when modals are open â”€â”€
  useEffect(() => {
    const content = document.querySelector(".dashboard-content");
    if (!content) return;
    if (anyModalOpen) {
      content.style.overflow = "hidden";
    } else {
      content.style.overflow = "";
    }
    return () => { content.style.overflow = ""; };
  }, [anyModalOpen]);

  // â”€â”€ Formik â”€â”€
  const jobFormik = useFormik({
    initialValues: {
      technicianName: "",
      technicianId: "",
      customerName: "",
      leadId: "",
      installationId: "",
      jobTitle: "",
      jobDescription: "",
      assignedDate: today,
      dueDate: "",
      priority: "Medium",
      status: "Pending",
    },
    validationSchema: taskAssignmentSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      try {
        const payload = { ...values };
        if (!payload.dueDate) payload.dueDate = null;

        // Auto-fill technicianId from the selected technician (dropdown stores name only)
        const selectedTech = technicians.find((t) => t.name === values.technicianName);
        if (selectedTech) payload.technicianId = selectedTech.technicianId;

        if (editingJob) {
          const response = await taskAssignmentAPI.update(editingJob._id, payload);
          if (response.data?.success) {
            success(`Task assignment updated successfully`);
            fetchJobs();
          }
        } else {
          const response = await taskAssignmentAPI.create(payload);
          if (response.data?.success) {
            success(`Task assignment created successfully`);
            fetchJobs();
          }
        }
        setShowJobPage(false);
        setEditingJob(null);
        resetForm();
      } catch (err) {
        console.error("Save job error:", err);
        const msg = err.response?.data?.message || "Failed to save task assignment";
        toastError(msg);
      } finally {
        setLoading(false);
      }
    },
  });

  // â”€â”€ Technician dropdown options (shared by the form and the toolbar filter) â”€â”€
  const technicianOptions = useMemo(() => {
    const opts = technicians
      .filter((t) => t.name)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((t) => ({ value: t.name, label: t.name }));
    // Keep the currently-edited technician selectable even if not in the fetched list
    if (editingJob?.technicianName && !opts.some((o) => o.value === editingJob.technicianName)) {
      opts.unshift({ value: editingJob.technicianName, label: editingJob.technicianName });
    }
    return opts;
  }, [technicians, editingJob]);

  const normalizeName = (s) => String(s || "").trim().toLowerCase();

  const customerOptions = useMemo(() => {
    const techName = jobFormik.values.technicianName;
    if (!techName) return [];
    const techKey = normalizeName(techName);

    const byName = new Map(); // customer name (normalized) -> best leadId

    const add = (rawName, leadId) => {
      const name = (rawName || "").trim();
      if (!name) return;
      const key = normalizeName(name);
      if (!byName.has(key)) byName.set(key, { name, leadId: leadId || "" });
      else if (!byName.get(key).leadId && leadId) byName.get(key).leadId = leadId;
    };

    // 1) Leads assigned to this technician
    leads.forEach((l) => {
      if (normalizeName(l.assigned) === techKey) add(l.name, l.leadId);
    });
    // 2) Site surveys performed by this technician
    siteSurveys.forEach((s) => {
      if (normalizeName(s.technicianName) === techKey) add(s.customerName, s.leadId);
    });
    // 3) Installations assigned to this technician
    installations.forEach((i) => {
      if (normalizeName(i.technicianName) === techKey) add(i.customerName, i.leadId);
    });

    const opts = [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.name, label: c.name }));

    if (editingJob?.customerName && !opts.some((o) => o.value === editingJob.customerName)) {
      opts.unshift({ value: editingJob.customerName, label: editingJob.customerName });
    }
    return opts;
  }, [leads, siteSurveys, installations, jobFormik.values.technicianName, editingJob]);

  // Auto-fill the Lead ID and Installation ID from whichever sources matched
  // the selected customer for this technician. Each ID is resolved independently:
  //  - leadId: assigned lead â†’ site survey â†’ installation (all carry leadId)
  //  - installationId: prefer an installation for this customer + technician;
  //    fall back to any installation for the customer (name or leadId match) so
  //    the ID still fills even if the installation's technicianName differs.
  const handleCustomerSelect = (customerName) => {
    jobFormik.setFieldValue("customerName", customerName);
    if (!customerName) {
      jobFormik.setFieldValue("leadId", "");
      jobFormik.setFieldValue("installationId", "");
      return;
    }
    const techName = jobFormik.values.technicianName;
    const techKey = normalizeName(techName);
    const custKey = normalizeName(customerName);

    // An installation for this customer + technician (preferred)
    const installForTech = installations.find(
      (i) =>
        i.installationId &&
        normalizeName(i.technicianName) === techKey &&
        normalizeName(i.customerName) === custKey
    );

    // Lead ID: prefer the assigned lead, fall back to a survey/installation
    let lead = leads.find(
      (l) => normalizeName(l.assigned) === techKey && normalizeName(l.name) === custKey
    );
    if (!lead) {
      const survey = siteSurveys.find(
        (s) => normalizeName(s.technicianName) === techKey && normalizeName(s.customerName) === custKey
      );
      lead = survey || installForTech || undefined;
    }

    // Installation ID: prefer a customer+technician match, otherwise any
    // installation with a real ID belonging to this customer (by name, or by
    // the leadId resolved above). Skip draft rows with no installationId so a
    // pending record can't shadow a valid one.
    const installation =
      installForTech ||
      installations.find(
        (i) => i.installationId && normalizeName(i.customerName) === custKey
      ) ||
      (lead?.leadId
        ? installations.find(
            (i) => i.installationId && normalizeName(i.leadId) === normalizeName(lead.leadId)
          )
        : undefined);

    // If no lead/survey matched, pull the leadId from the matched installation
    const finalLeadId = lead?.leadId || installation?.leadId || "";

    jobFormik.setFieldValue("leadId", finalLeadId);
    jobFormik.setFieldValue("installationId", installation?.installationId || "");
  };

  // â”€â”€ Stats â”€â”€
  // Technicians only ever see the tasks assigned to them. The server fetch is
  // filtered to their name (see the auto-filter effect), and this client-side
  // guard also hides anyone else's rows during the brief initial load.
  const isTechUser = user?.role === "technician";
  const myName = isTechUser ? user?.name : "";
  const visibleJobs = isTechUser && myName
    ? jobs.filter((j) => j.technicianName === myName)
    : jobs;

  const stats = useMemo(() => ({
    total: serverTotal,
    completed: visibleJobs.filter((j) => j.status === "Completed").length,
    inProgress: visibleJobs.filter((j) => j.status === "In Progress").length,
    pending: visibleJobs.filter((j) => j.status === "Pending").length,
  }), [visibleJobs, serverTotal]);

  // â”€â”€ Pagination (server-side) â”€â”€
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(serverTotal / pageSize));
  }, [serverTotal, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // â”€â”€ Open Add/Edit form â”€â”€
  const openJobPage = useCallback((job = null) => {
    setEditingJob(job);
    if (job) {
      jobFormik.setValues({
        technicianName: job.technicianName,
        technicianId: job.technicianId,
        customerName: job.customerName,
        leadId: job.leadId,
        installationId: job.installationId,
        jobTitle: job.jobTitle,
        jobDescription: job.jobDescription || "",
        assignedDate: toISODate(job.assignedDate) || today,
        dueDate: toISODate(job.dueDate),
        priority: job.priority,
        status: job.status,
      });
    } else {
      jobFormik.resetForm();
      jobFormik.setValues({
        technicianName: "",
        technicianId: "",
        customerName: "",
        leadId: "",
        installationId: "",
        jobTitle: "",
        jobDescription: "",
        assignedDate: today,
        dueDate: "",
        priority: "Medium",
        status: "Pending",
      });
    }
    jobFormik.setTouched({});
    setShowJobPage(true);
  }, [jobFormik, today]);

  // â”€â”€ Open View modal â”€â”€
  const openViewModal = useCallback((job) => {
    setViewRecord(job);
    setShowViewModal(true);
  }, []);

  // â”€â”€ Confirm Delete â”€â”€
  const confirmDelete = useCallback((job) => {
    setDeleteTarget(job);
    setShowDeleteDialog(true);
  }, []);

  // â”€â”€ Handle Delete â”€â”€
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const response = await taskAssignmentAPI.delete(deleteTarget._id);
      if (response.data?.success) {
        success(`Task assignment deleted successfully`);
        fetchJobs();
      }
    } catch (err) {
      console.error("Delete job error:", err);
      const msg = err.response?.data?.message || "Failed to delete task assignment";
      toastError(msg);
    } finally {
      setLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  // â”€â”€ Download Job Log â”€â”€

const downloadJobLog = async (job) => {
  const doc = await createProfilePdf({
    bannerName: job.jobTitle,
    bannerSubtitle: `Job ID: ${job._id}`,
    bannerRight: [`Status: ${job.status || "—"}`, `Priority: ${job.priority || "—"}`],
    sections: [
      {
        title: "Job Details",
        fields: [
          ["Description", job.jobDescription || "N/A"],
          ["Technician", `${job.technicianName} (${job.technicianId})`],
          ["Customer", job.customerName],
          ["Lead ID", job.leadId],
          ["Installation ID", job.installationId],
          ["Assigned Date", formatDate(job.assignedDate)],
          ["Due Date", job.dueDate ? formatDate(job.dueDate) : "N/A"],
        ],
      },
    ],
  });

  doc.save(
    `JobLog_${job.technicianName}_${formatDate(job.assignedDate)}.pdf`
  );

  success(`Job log downloaded for ${job.jobTitle}`);
};

  return (
    <div className="tm-page">
      {!showJobPage && (
        <>
          {/* Page Header */}
          <div className="tm-header">
            <div>
              <h1 className="tm-title">Task Assignment</h1>
              <p className="tm-subtitle">Assign and manage technician jobs, track priorities, deadlines, and job status across the team.</p>
            </div>
            <div className="tm-header-actions">
              {canDo("task-assignment", "create") && (
              <button className="tm-btn tm-btn-primary" onClick={() => openJobPage(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Assign Job
              </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="tech-stats-grid">
            <StatCard
              title="Total Jobs"
              value={stats.total.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>}
              color="blue"
            />
            <StatCard
              title="Completed"
              value={stats.completed.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
              color="green"
            />
            <StatCard
              title="In Progress"
              value={stats.inProgress.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              color="yellow"
            />
            <StatCard
              title="Pending"
              value={stats.pending.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
              color="orange"
            />
          </div>

          {/* Toolbar */}
          <div className="tm-section">
            <div className="tm-toolbar">
              <div className="tm-toolbar-row">
                <div className="tm-search">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by Name, ID, Customer, or Job Title" />
                  {search && (
                    <button className="tm-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                {!isTechUser && (
                  <Dropdown value={technicianFilter} onChange={(val) => { setTechnicianFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Technicians" }, ...technicianOptions]} />
                )}
                <Dropdown value={jobStatusFilter} onChange={(val) => { setJobStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Statuses" }, ...JOB_STATUSES.map((s) => ({ value: s, label: s }))]} />
                <Dropdown value={priorityFilter} onChange={(val) => { setPriorityFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Priorities" }, ...JOB_PRIORITIES.map((p) => ({ value: p, label: p }))]} />
                <input type="date" className="tm-filter-date-inline" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
                <input type="date" className="tm-filter-date-inline" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />
              </div>
            </div>

            {/* Table */}
            <div className="tm-table-card">
              <div className="tm-table-wrapper">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Technician Name</th>
                      <th>Technician ID</th>
                      <th>Customer Name</th>
                      <th>Job Title</th>
                      <th>Assigned Date</th>
                      <th>Due Date</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetchLoading ? (
                      <TableLoader colSpan={9} />
                    ) : visibleJobs.length === 0 ? (
                      <TableEmptyState colSpan={9} title="No jobs found" subtitle="Try adjusting your search or filters." />
                    ) : (
                      visibleJobs.map((job) => (
                        <tr key={job._id}>
                          <td className="tm-td-name">{job.technicianName}</td>
                          <td className="tm-td-id">{job.technicianId}</td>
                          <td>{job.customerName}</td>
                          <td className="tm-td-title">{job.jobTitle}</td>
                          <td>{formatDate(job.assignedDate)}</td>
                          <td>{job.dueDate ? formatDate(job.dueDate) : "\u2014"}</td>
                          <td><span className={`tm-priority-badge ${getPriorityClass(job.priority)}`}>{job.priority}</span></td>
                          <td><span className={`tm-status-badge ${getStatusClass(job.status)}`}>{job.status}</span></td>
                          <td>
                            <div className="act-actions">
                              <button className="act-btn act-view" onClick={() => openViewModal(job)} title="View">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                              </button>
                              {canDo("task-assignment", "edit") && (
                              <button className="act-btn act-edit" onClick={() => openJobPage(job)} title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                              )}
                              {canDo("task-assignment", "delete") && (
                              <button className="act-btn act-delete" onClick={() => confirmDelete(job)} title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                              </button>
                              )}
                              <ActivityLogButton
                                module="task-assignment"
                                onClick={() => {
                                  const taskId = job._id || job.id;
                                  navigate(`/admin/task-assignment-activity/${taskId}`, {
                                    state: { target: { recordId: taskId, recordLabel: job.jobTitle || job.technicianName, module: "task-assignment" } },
                                  });
                                }}
                                title="View Task Activity Log"
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {jobs.length > 0 && (
                <div className="tm-pagination-row">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={stats.total}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                    pageSizeOptions={PAGE_SIZES}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Full-page Job Form */}
      {showJobPage && (
        <div className="tm-form-page">
          <div className="tm-form-page-header">
            <button className="tm-btn tm-back-btn" onClick={() => setShowJobPage(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Jobs
            </button>
            <h2>{editingJob ? "Edit Job" : "Assign New Job"}</h2>
          </div>
          <form onSubmit={jobFormik.handleSubmit} className="tm-form-page-body" noValidate>
            <div className="tm-form-section">
              <div className="tm-section-header">
                <span className="tm-section-number">1</span>
                <h4>Job Information</h4>
              </div>
              <div className="tm-form-grid">
                <div className="tm-form-field tm-full-width">
                  <label>Technician Name <span className="tm-req">*</span></label>
                  <Dropdown
                    value={jobFormik.values.technicianName}
                    onChange={(val) => {
                      const techChanged = val !== jobFormik.values.technicianName;
                      jobFormik.setFieldValue("technicianName", val);
                      // Auto-fill the technician ID from the selected technician
                      const tech = technicians.find((t) => t.name === val);
                      jobFormik.setFieldValue("technicianId", tech?.technicianId || "");
                      // The customer list depends on the technician â€” clear any
                      // previously selected customer/lead/installation when the tech changes
                      if (techChanged) {
                        jobFormik.setFieldValue("customerName", "");
                        jobFormik.setFieldValue("leadId", "");
                        jobFormik.setFieldValue("installationId", "");
                      }
                    }}
                    options={[{ value: "", label: "Select Technician" }, ...technicianOptions]}
                    placeholder="Select Technician"
                    variant="form"
                  />
                  {jobFormik.errors.technicianName && jobFormik.touched.technicianName && <span className="tm-field-error">{jobFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Technician ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="technicianId"
                    value={jobFormik.values.technicianId}
                    onChange={jobFormik.handleChange}
                    onBlur={jobFormik.handleBlur}
                    placeholder="Auto-filled from technician name"
                    readOnly
                    title="Auto-filled from the selected technician"
                    className="tm-input-readonly"
                  />
                  {jobFormik.errors.technicianId && jobFormik.touched.technicianId && <span className="tm-field-error">{jobFormik.errors.technicianId}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Customer Name <span className="tm-req">*</span></label>
                  <Dropdown
                    value={jobFormik.values.customerName}
                    onChange={handleCustomerSelect}
                    options={[{ value: "", label: "Select Customer" }, ...customerOptions]}
                    placeholder="Select Customer"
                    variant="form"
                    disabled={!jobFormik.values.technicianName}
                    emptyMessage="No customers assigned to this technician"
                  />
                  {jobFormik.errors.customerName && jobFormik.touched.customerName && <span className="tm-field-error">{jobFormik.errors.customerName}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Lead ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="leadId"
                    value={jobFormik.values.leadId}
                    onChange={jobFormik.handleChange}
                    onBlur={jobFormik.handleBlur}
                    placeholder="Auto-filled from selected customer"
                    readOnly
                    title="Auto-filled from the selected customer"
                    className="tm-input-readonly"
                  />
                  {jobFormik.errors.leadId && jobFormik.touched.leadId && <span className="tm-field-error">{jobFormik.errors.leadId}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Installation ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="installationId"
                    value={jobFormik.values.installationId}
                    onChange={jobFormik.handleChange}
                    onBlur={jobFormik.handleBlur}
                    placeholder="Auto-filled from selected customer"
                    title="Auto-filled from the selected customer's installation"
                  />
                  {jobFormik.errors.installationId && jobFormik.touched.installationId && <span className="tm-field-error">{jobFormik.errors.installationId}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Job Title <span className="tm-req">*</span></label>
                  <input type="text" name="jobTitle" value={jobFormik.values.jobTitle} onChange={jobFormik.handleChange} onBlur={jobFormik.handleBlur} maxLength={150} placeholder="e.g. 5kW Inverter Installation" />
                  {jobFormik.errors.jobTitle && jobFormik.touched.jobTitle && <span className="tm-field-error">{jobFormik.errors.jobTitle}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Job Description</label>
                  <textarea name="jobDescription" value={jobFormik.values.jobDescription} onChange={jobFormik.handleChange} placeholder="Describe the job in detail" rows={3} maxLength={1000} />
                  {jobFormik.errors.jobDescription && jobFormik.touched.jobDescription && <span className="tm-field-error">{jobFormik.errors.jobDescription}</span>}
                </div>
              </div>
            </div>
            <div className="tm-form-section">
              <div className="tm-section-header">
                <span className="tm-section-number">2</span>
                <h4>Schedule &amp; Priority</h4>
              </div>
              <div className="tm-form-grid">
                <div className="tm-form-field">
                  <label>Assigned Date <span className="tm-req">*</span></label>
                  <input type="date" name="assignedDate" value={jobFormik.values.assignedDate} onChange={jobFormik.handleChange} onBlur={jobFormik.handleBlur} />
                  {jobFormik.errors.assignedDate && jobFormik.touched.assignedDate && <span className="tm-field-error">{jobFormik.errors.assignedDate}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Due Date</label>
                  <input type="date" name="dueDate" value={jobFormik.values.dueDate} onChange={jobFormik.handleChange} onBlur={jobFormik.handleBlur} min={jobFormik.values.assignedDate} />
                  {jobFormik.errors.dueDate && jobFormik.touched.dueDate && <span className="tm-field-error">{jobFormik.errors.dueDate}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Priority</label>
                  <Dropdown
                    value={jobFormik.values.priority}
                    onChange={(val) => jobFormik.setFieldValue("priority", val)}
                    options={JOB_PRIORITIES.map((p) => ({ value: p, label: p }))}
                    variant="form"
                  />
                  {jobFormik.errors.priority && jobFormik.touched.priority && <span className="tm-field-error">{jobFormik.errors.priority}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Job Status <span className="tm-req">*</span></label>
                  <Dropdown
                    value={jobFormik.values.status}
                    onChange={(val) => jobFormik.setFieldValue("status", val)}
                    options={JOB_STATUSES.map((s) => ({ value: s, label: s }))}
                    variant="form"
                  />
                  {jobFormik.errors.status && jobFormik.touched.status && <span className="tm-field-error">{jobFormik.errors.status}</span>}
                </div>
              </div>
            </div>
            <div className="tm-form-page-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowJobPage(false)} disabled={loading || jobFormik.isSubmitting}>Cancel</button>
              <button type="submit" className="tm-btn tm-btn-primary" disabled={loading || jobFormik.isSubmitting || !jobFormik.isValid}>
                {loading || jobFormik.isSubmitting ? <><span className="tm-spinner"></span> Saving...</> : editingJob ? "Update Job" : "Assign Job"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Job Modal */}
      {showViewModal && viewRecord && (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Job Details</h3></div>
              <button className="vm-modal-close" onClick={() => { setShowViewModal(false); setViewRecord(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Record ID</span>
                  <span style={{ fontSize: '13px', color: '#1a2332', fontWeight: 600 }}>{viewRecord._id}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Technician</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.technicianName} ({viewRecord.technicianId})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.customerName}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lead ID</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.leadId}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Installation ID</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.installationId}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job Title</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.jobTitle}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned Date</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{formatDate(viewRecord.assignedDate)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due Date</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.dueDate ? formatDate(viewRecord.dueDate) : "\u2014"}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</span>
                  <span><span className={`tm-priority-badge ${getPriorityClass(viewRecord.priority)}`}>{viewRecord.priority}</span></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
                  <span><span className={`tm-status-badge ${getStatusClass(viewRecord.status)}`}>{viewRecord.status}</span></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created At</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.createdAt ? new Date(viewRecord.createdAt).toLocaleString() : "\u2014"}</span>
                </div>
              </div>
              {viewRecord.jobDescription && (
                <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Description</div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{viewRecord.jobDescription}</p>
                </div>
              )}
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close-primary" onClick={() => { setShowViewModal(false); setViewRecord(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Job"
        message={`Are you sure you want to delete this task assignment?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
        loading={loading}
      />
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
                  {showLogModal.leadId || showLogModal._id}
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
                    <span className={`cm-status-badge cm-status-${(showLogModal.status || "").toLowerCase().replace(" ", "")}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.status || "Pending"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Priority</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>{showLogModal.priority || "Medium"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Assigned Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.assignedDate || "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Due Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.dueDate || "—"}
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
                  Job Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Job Title</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.jobTitle}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technicianName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Lead Reference ID</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.leadId || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Site Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.siteAddress || "—"}</div>
                  </div>
                </div>

                {showLogModal.jobDescription && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Log Remarks &amp; Description</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.jobDescription}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadJobLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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
};

export default TaskAssignment;
