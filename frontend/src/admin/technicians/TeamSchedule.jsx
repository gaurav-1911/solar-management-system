import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Pagination, Dropdown, TableLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { teamScheduleSchema } from "../../utils/AdminValidation";
import { teamScheduleAPI, technicianAPI } from "../../services/api";
import { createProfilePdf } from "../../utils/pdfLayout";
import { formatDate, toISODate } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import "./TeamSchedule.css";

const SHIFT_TYPES = ["Morning", "Afternoon", "Night", "Full Day"];
const SCHEDULE_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];
const PAGE_SIZES = [5, 10, 15, 25];

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function getStatusClass(s) {
  return s === "Completed" ? "tm-status-done" : s === "In Progress" ? "tm-status-progress" : s === "Cancelled" ? "tm-att-absent" : "tm-status-pending";
}

function getShiftClass(shift) {
  switch (shift) {
    case "Morning": return "tm-icon-blue";
    case "Afternoon": return "tm-icon-yellow";
    case "Night": return "tm-att-leave";
    case "Full Day": return "tm-icon-green";
    default: return "";
  }
}

const TeamSchedule = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();

  const [schedules, setSchedules] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);

  // ── Fetch schedules from API ──
  const fetchSchedules = useCallback(async () => {
    setFetchLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (shiftFilter !== "All") params.shift = shiftFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await teamScheduleAPI.getAll(params);
      if (response.data?.success) {
        const rows = response.data.data || [];
        setSchedules(rows);
        setServerTotal(response.data.pagination?.total || rows.length || 0);
      }
    } catch (err) {
      console.error("Fetch schedules error:", err);
      const msg = err.response?.data?.message || "Failed to fetch team schedules";
      toastError(msg);
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, shiftFilter, statusFilter, dateFrom, dateTo, toastError]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // ── Debounce the search input so keystrokes don't fire an API call each ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch technicians for the dropdown ──
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

  // ── Formik ──
  const scheduleFormik = useFormik({
    initialValues: {
      technicianName: "",
      technicianId: "",
      date: today,
      shift: "",
      shiftStart: "",
      shiftEnd: "",
      jobAssignment: "",
      siteLocation: "",
      status: "Scheduled",
      notes: "",
    },
    validationSchema: teamScheduleSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      try {
        const payload = { ...values };

        // Auto-fill technicianId from the selected technician (dropdown stores name only)
        const selectedTech = technicians.find((t) => t.name === values.technicianName);
        if (selectedTech) payload.technicianId = selectedTech.technicianId;

        if (editingSchedule) {
          const response = await teamScheduleAPI.update(editingSchedule._id, payload);
          if (response.data?.success) {
            success(`Schedule updated successfully`);
            fetchSchedules();
          }
        } else {
          const response = await teamScheduleAPI.create(payload);
          if (response.data?.success) {
            success(`Schedule created successfully`);
            fetchSchedules();
          }
        }
        setShowModal(false);
        setEditingSchedule(null);
        resetForm();
      } catch (err) {
        console.error("Save schedule error:", err);
        const msg = err.response?.data?.message || "Failed to save schedule";
        toastError(msg);
      } finally {
        setLoading(false);
      }
    },
  });

  // ── Technician dropdown options (shared by the form) ──
  const technicianOptions = useMemo(() => {
    const opts = technicians
      .filter((t) => t.name)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((t) => ({ value: t.name, label: t.name }));
    // Keep the currently-edited technician selectable even if not in the fetched list
    if (editingSchedule?.technicianName && !opts.some((o) => o.value === editingSchedule.technicianName)) {
      opts.unshift({ value: editingSchedule.technicianName, label: editingSchedule.technicianName });
    }
    return opts;
  }, [technicians, editingSchedule]);

  // ── Handle Technician Change (auto-fill technician ID) ──
  const handleTechnicianChange = useCallback((val) => {
    scheduleFormik.setFieldValue("technicianName", val);
    const tech = technicians.find((t) => t.name === val);
    scheduleFormik.setFieldValue("technicianId", tech?.technicianId || "");
  }, [technicians, scheduleFormik]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total: serverTotal,
    scheduled: schedules.filter((s) => s.status === "Scheduled").length,
    inProgress: schedules.filter((s) => s.status === "In Progress").length,
    completed: schedules.filter((s) => s.status === "Completed").length,
  }), [schedules, serverTotal]);

  // ── Pagination (server-side) ──
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(serverTotal / pageSize));
  }, [serverTotal, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // ── Open Add/Edit modal ──
  const openScheduleModal = useCallback((schedule = null) => {
    setEditingSchedule(schedule);
    if (schedule) {
      scheduleFormik.setValues({
        technicianName: schedule.technicianName,
        technicianId: schedule.technicianId,
        date: toISODate(schedule.date) || today,
        shift: schedule.shift,
        shiftStart: schedule.shiftStart,
        shiftEnd: schedule.shiftEnd,
        jobAssignment: schedule.jobAssignment,
        siteLocation: schedule.siteLocation,
        status: schedule.status,
        notes: schedule.notes || "",
      });
    } else {
      scheduleFormik.resetForm();
      scheduleFormik.setValues({
        technicianName: "",
        technicianId: "",
        date: today,
        shift: "",
        shiftStart: "",
        shiftEnd: "",
        jobAssignment: "",
        siteLocation: "",
        status: "Scheduled",
        notes: "",
      });
    }
    scheduleFormik.setTouched({});
    setShowModal(true);
  }, [scheduleFormik]);

  // ── Open View modal ──
  const openViewModal = useCallback((schedule) => {
    setViewRecord(schedule);
    setShowViewModal(true);
  }, []);

  // ── Confirm Delete ──
  const confirmDelete = useCallback((target) => {
    setDeleteTarget(target);
    setShowDeleteDialog(true);
  }, []);

  // ── Handle Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const response = await teamScheduleAPI.delete(deleteTarget._id);
      if (response.data.success) {
        success(`Schedule deleted successfully`);
        fetchSchedules();
      }
    } catch (err) {
      console.error("Delete schedule error:", err);
      const msg = err.response?.data?.message || "Failed to delete schedule";
      toastError(msg);
    } finally {
      setLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  // ── Download Schedule Log ──


const downloadScheduleLog = async (s) => {
  const doc = await createProfilePdf({
    bannerName: s.technicianName,
    bannerSubtitle: `Schedule ID: ${s._id}`,
    bannerRight: [`Status: ${s.status || "—"}`],
    sections: [
      {
        title: "Schedule Details",
        fields: [
          ["Technician", `${s.technicianName} (${s.technicianId})`],
          ["Date", formatDate(s.date)],
          ["Shift", s.shift],
          ["Shift Time", `${s.shiftStart} - ${s.shiftEnd}`],
          ["Job Assignment", s.jobAssignment],
          ["Site Location", s.siteLocation],
        ],
      },
    ],
    notes: s.notes,
  });

  const fileDate = toISODate(s.date) || "date";

  doc.save(`ScheduleLog_${s.technicianName}_${fileDate}.pdf`);

  success(`Schedule log downloaded for ${s.technicianName}`);
};

  return (
    <div className="tm-page">
      {/* Page Header */}
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Team Schedule</h1>
          <p className="tm-subtitle">Manage technician work schedules, shift assignments, and daily job allocations across the team.</p>
        </div>
        <div className="tm-header-actions">
          {canDo("team-schedule", "create") && (
          <button className="tm-btn tm-btn-primary" onClick={() => openScheduleModal(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Schedule
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="tech-stats-grid">
        <StatCard
          title="Total Schedules"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="blue"
        />
        <StatCard
          title="Scheduled"
          value={stats.scheduled.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="blue"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>}
          color="yellow"
        />
        <StatCard
          title="Completed"
          value={stats.completed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
      </div>

      {/* Toolbar */}
      <div className="tm-toolbar">
        <div className="tm-toolbar-row">
          <div className="tm-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by Name, ID, Job, or Location" />
            {search && (
              <button className="tm-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={shiftFilter} onChange={(val) => { setShiftFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Shifts" }, ...SHIFT_TYPES.map((s) => ({ value: s, label: s }))]} />
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Statuses" }, ...SCHEDULE_STATUSES.map((s) => ({ value: s, label: s }))]} />
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
                <th>Date</th>
                <th>Shift</th>
                <th>Time</th>
                <th>Job Assignment</th>
                <th>Site Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fetchLoading ? (
                <TableLoader colSpan={9} />
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan="9" className="tm-empty">
                    <div className="tm-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      <p>No schedules found</p>
                      <span>Try adjusting search/filter or add a new schedule.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s._id}>
                    <td className="tm-td-name">{s.technicianName}</td>
                    <td className="tm-td-id">{s.technicianId}</td>
                    <td>{formatDate(s.date)}</td>
                    <td><span className={`tm-priority-badge ${getShiftClass(s.shift)}`}>{s.shift}</span></td>
                    <td>{s.shiftStart} - {s.shiftEnd}</td>
                    <td className="tm-td-title">{s.jobAssignment}</td>
                    <td>{s.siteLocation}</td>
                    <td><span className={`tm-status-badge ${getStatusClass(s.status)}`}>{s.status}</span></td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" onClick={() => openViewModal(s)} title="View">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        {canDo("team-schedule", "edit") && (
                        <button className="act-btn act-edit" onClick={() => openScheduleModal(s)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        )}
                        {canDo("team-schedule", "delete") && (
                        <button className="act-btn act-delete" onClick={() => confirmDelete(s)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                        )}
                        <ActivityLogButton
                          module="team-schedule"
                          onClick={() => {
                            const schId = s._id || s.id;
                            navigate(`/admin/team-schedule-activity/${schId}`, {
                              state: { target: { recordId: schId, recordLabel: s.jobAssignment || s.technicianName, module: "team-schedule" } },
                            });
                          }}
                          title="View Schedule Activity Log"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {schedules.length > 0 && (
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal tm-form-sm">
            <div className="tm-modal-header">
              <h3>{editingSchedule ? "Edit Schedule" : "Add New Schedule"}</h3>
              <button className="tm-modal-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={scheduleFormik.handleSubmit} className="tm-modal-body" id="scheduleForm" noValidate>
              <div className="tm-form-grid">
                <div className="tm-form-field tm-full-width">
                  <label>Technician Name <span className="tm-req">*</span></label>
                  <Dropdown
                    value={scheduleFormik.values.technicianName}
                    onChange={handleTechnicianChange}
                    options={[{ value: "", label: "Select Technician" }, ...technicianOptions]}
                    placeholder="Select Technician"
                    variant="form"
                  />
                  {scheduleFormik.errors.technicianName && scheduleFormik.touched.technicianName && <span className="tm-field-error">{scheduleFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Technician ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="technicianId"
                    value={scheduleFormik.values.technicianId}
                    onChange={scheduleFormik.handleChange}
                    onBlur={scheduleFormik.handleBlur}
                    placeholder="Auto-filled from technician name"
                    readOnly
                    title="Auto-filled from the selected technician"
                    className="tm-input-readonly"
                  />
                  {scheduleFormik.errors.technicianId && scheduleFormik.touched.technicianId && <span className="tm-field-error">{scheduleFormik.errors.technicianId}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Date <span className="tm-req">*</span></label>
                  <input type="date" name="date" value={scheduleFormik.values.date} onChange={scheduleFormik.handleChange} onBlur={scheduleFormik.handleBlur} min={today} />
                  {scheduleFormik.errors.date && scheduleFormik.touched.date && <span className="tm-field-error">{scheduleFormik.errors.date}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Shift <span className="tm-req">*</span></label>
                  <Dropdown
                    value={scheduleFormik.values.shift}
                    onChange={(val) => scheduleFormik.setFieldValue("shift", val)}
                    options={[{ value: "", label: "Select Shift" }, ...SHIFT_TYPES.map((s) => ({ value: s, label: s }))]}
                    variant="form"
                  />
                  {scheduleFormik.errors.shift && scheduleFormik.touched.shift && <span className="tm-field-error">{scheduleFormik.errors.shift}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Shift Start</label>
                  <input type="time" name="shiftStart" value={scheduleFormik.values.shiftStart} onChange={scheduleFormik.handleChange} />
                </div>
                <div className="tm-form-field">
                  <label>Shift End</label>
                  <input type="time" name="shiftEnd" value={scheduleFormik.values.shiftEnd} onChange={scheduleFormik.handleChange} />
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Job Assignment <span className="tm-req">*</span></label>
                  <input type="text" name="jobAssignment" value={scheduleFormik.values.jobAssignment} onChange={scheduleFormik.handleChange} onBlur={scheduleFormik.handleBlur} placeholder="e.g. 5kW Inverter Installation" maxLength={100} />
                  {scheduleFormik.errors.jobAssignment && scheduleFormik.touched.jobAssignment && <span className="tm-field-error">{scheduleFormik.errors.jobAssignment}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Site Location <span className="tm-req">*</span></label>
                  <input type="text" name="siteLocation" value={scheduleFormik.values.siteLocation} onChange={scheduleFormik.handleChange} onBlur={scheduleFormik.handleBlur} placeholder="e.g. Rooftop Alpha, Pune" maxLength={150} />
                  {scheduleFormik.errors.siteLocation && scheduleFormik.touched.siteLocation && <span className="tm-field-error">{scheduleFormik.errors.siteLocation}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Status</label>
                  <Dropdown
                    value={scheduleFormik.values.status}
                    onChange={(val) => scheduleFormik.setFieldValue("status", val)}
                    options={SCHEDULE_STATUSES.map((s) => ({ value: s, label: s }))}
                    variant="form"
                  />
                  {scheduleFormik.errors.status && scheduleFormik.touched.status && <span className="tm-field-error">{scheduleFormik.errors.status}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Notes</label>
                  <textarea name="notes" value={scheduleFormik.values.notes} onChange={scheduleFormik.handleChange} placeholder="Additional notes or instructions" rows={3} maxLength={500} />
                </div>
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowModal(false)} disabled={loading || scheduleFormik.isSubmitting}>Cancel</button>
              <button type="submit" form="scheduleForm" className="tm-btn tm-btn-primary" disabled={loading || scheduleFormik.isSubmitting || !scheduleFormik.isValid}>
                {loading || scheduleFormik.isSubmitting ? <><span className="tm-spinner"></span> Saving...</> : editingSchedule ? "Update Schedule" : "Create Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Schedule Modal */}
      {showViewModal && viewRecord && (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Schedule Details</h3></div>
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
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{formatDate(viewRecord.date)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shift</span>
                  <span><span className={`tm-priority-badge ${getShiftClass(viewRecord.shift)}`}>{viewRecord.shift}</span></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shift Time</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.shiftStart} - {viewRecord.shiftEnd}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job Assignment</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.jobAssignment}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Site Location</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.siteLocation}</span>
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
              {viewRecord.notes && (
                <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Notes</div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{viewRecord.notes}</p>
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
        title="Delete Schedule"
        message={`Are you sure you want to delete this schedule?`}
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
                  {showLogModal.technicianName || showLogModal._id}
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
                      {showLogModal.status || "Scheduled"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date Scheduled</span>
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
                  Schedule Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technicianName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Shift / Type</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.shift}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Start Time</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.startTime}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>End Time</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.endTime}</div>
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
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadScheduleLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default TeamSchedule;
