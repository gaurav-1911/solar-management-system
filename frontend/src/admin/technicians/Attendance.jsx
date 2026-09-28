import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Pagination, Dropdown, TableLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { attendanceSchema } from "../../utils/AdminValidation";
import { attendanceAPI, technicianAPI } from "../../services/api";
import { createProfilePdf } from "../../utils/pdfLayout";
import { formatDate, toISODate, deriveTechnicianId } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import "./Attendance.css";

const ATTENDANCE_STATUSES = ["Present", "Absent", "Half Day", "Leave"];
const PAGE_SIZES = [5, 10, 15, 25];

function getAttStatusClass(status) {
  if (status === "Present") return "tm-att-present";
  if (status === "Absent") return "tm-att-absent";
  if (status === "Half Day") return "tm-att-half";
  return "tm-att-leave";
}

const Attendance = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { user, canDo } = useAuth();
  // Technicians see and add only their own attendance records.
  const isTechUser = user?.role === "technician";
  const myName = isTechUser ? user?.name : "";

  const [attendance, setAttendance] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [attStatusFilter, setAttStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showAttModal, setShowAttModal] = useState(false);
  const [editingAtt, setEditingAtt] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);

  // ── Fetch attendance records from API ──
  const fetchAttendance = useCallback(async () => {
    setFetchLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (attStatusFilter !== "All") params.status = attStatusFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      // Technicians are limited to their own records server-side.
      if (isTechUser && myName) params.technicianName = myName;

      const response = await attendanceAPI.getAll(params);
      if (response.data?.success) {
        const rows = response.data.data || [];
        setAttendance(rows);
        setServerTotal(response.data.pagination?.total || rows.length || 0);
      }
    } catch (err) {
      console.error("Fetch attendance error:", err);
      // Fallback: try to show error message from server
      const msg = err.response?.data?.message || "Failed to fetch attendance records";
      showError(msg);
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, attStatusFilter, dateFrom, dateTo, showError, isTechUser, myName]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

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
  const attFormik = useFormik({
    initialValues: {
      technicianName: "",
      technicianId: "",
      date: "",
      checkIn: "",
      checkOut: "",
      status: "Present",
    },
    validationSchema: attendanceSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      try {
        // Prepare payload — always send technicianId from the form
        const payload = { ...values };

        // Auto-fill technicianId from the selected technician (form stores name only)
        const selectedTech = technicians.find((t) => t.name === values.technicianName);
        payload.technicianId = selectedTech?.technicianId || values.technicianId || "";

        if (editingAtt) {
          const response = await attendanceAPI.update(editingAtt._id, payload);
          if (response.data?.success) {
            success(`Attendance record updated successfully`);
            fetchAttendance();
          }
        } else {
          const response = await attendanceAPI.create(payload);
          if (response.data?.success) {
            success(`Attendance record created successfully`);
            fetchAttendance();
          }
        }
        setShowAttModal(false);
        setEditingAtt(null);
        resetForm();
      } catch (err) {
        console.error("Save attendance error:", err);
        const msg = err.response?.data?.message || "Failed to save attendance record";
        showError(msg);
      } finally {
        setLoading(false);
      }
    },
  });

  // ── Prevent background scroll when modals are open ──
  useEffect(() => {
    const content = document.querySelector(".dashboard-content");
    if (!content) return;
    if (showAttModal || showViewModal || showDeleteDialog) {
      content.style.overflow = "hidden";
    } else {
      content.style.overflow = "";
    }
    return () => { content.style.overflow = ""; };
  }, [showAttModal, showViewModal, showDeleteDialog]);

  // ── Stats (computed from current page data for quick view; could also come from API) ──
  const stats = useMemo(() => {
    return {
      total: serverTotal,
      present: attendance.filter((a) => a.status === "Present").length,
      absent: attendance.filter((a) => a.status === "Absent").length,
      halfDay: attendance.filter((a) => a.status === "Half Day").length,
      leave: attendance.filter((a) => a.status === "Leave").length,
    };
  }, [attendance, serverTotal]);

  // ── Pagination is now server-side ──
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(serverTotal / pageSize));
  }, [serverTotal, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // ── Open Add/Edit modal ──
  const openAttModal = useCallback((att = null) => {
    setEditingAtt(att);
    if (att) {
      attFormik.setValues({
        technicianName: att.technicianName,
        technicianId: att.technicianId,
        date: toISODate(att.date),
        checkIn: att.checkIn || "",
        checkOut: att.checkOut || "",
        status: att.status,
      });
    } else {
      attFormik.resetForm();
      // Technicians always add attendance for themselves. Resolve their
      // technician ID from the roster (case-insensitive), then from any of
      // their earlier attendance records, then fall back to a stable ID
      // derived from the account name — so the save never fails on an empty ID
      // when the account has no matching roster entry.
      const me = isTechUser ? technicians.find((t) => String(t.name || "").toLowerCase() === String(myName || "").toLowerCase()) : null;
      const prevAtt = isTechUser ? attendance.find((a) => String(a.technicianName || "").toLowerCase() === String(myName || "").toLowerCase()) : null;
      attFormik.setValues({
        technicianName: isTechUser ? myName : "",
        technicianId: isTechUser ? (me?.technicianId || prevAtt?.technicianId || deriveTechnicianId(myName)) : "",
        date: "",
        checkIn: "",
        checkOut: "",
        status: "Present",
      });
    }
    attFormik.setTouched({});
    setShowAttModal(true);
  }, [attFormik]);

  // ── Open View modal ──
  const openViewModal = useCallback((att) => {
    setViewRecord(att);
    setShowViewModal(true);
  }, []);

  // ── Confirm Delete ──
  const confirmDelete = useCallback((att) => {
    setDeleteTarget(att);
    setShowDeleteDialog(true);
  }, []);

  // ── Handle Delete ──
  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await attendanceAPI.delete(deleteTarget._id);
      if (response.data?.success) {
        success(`Attendance record deleted successfully`);
        fetchAttendance();
      }
    } catch (err) {
      console.error("Delete attendance error:", err);
      const msg = err.response?.data?.message || "Failed to delete attendance record";
      showError(msg);
    } finally {
      setLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  // ── Download Attendance Log ──
const downloadAttendanceLog = async (a) => {
  const doc = await createProfilePdf({
    bannerName: a.technicianName,
    bannerSubtitle: `Attendance ID: ${a._id}`,
    bannerRight: [`Status: ${a.status || "—"}`],
    sections: [
      {
        title: "Attendance Details",
        fields: [
          ["Technician", `${a.technicianName} (${a.technicianId})`],
          ["Date", formatDate(a.date)],
          ["Check-In", a.checkIn || "N/A"],
          ["Check-Out", a.checkOut || "N/A"],
        ],
      },
    ],
  });

  doc.save(`AttendanceLog_${a.technicianName}.pdf`);

  success(`Attendance log downloaded for ${a.technicianName}`);
};

  // Absent / Leave records have no working hours — check-in/check-out are disabled
  const noWorkHours = attFormik.values.status === "Absent" || attFormik.values.status === "Leave";

  return (
    <div className="tm-page">
      {/* Page Header */}
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Attendance Management</h1>
          <p className="tm-subtitle">Track and manage technician attendance, check-in/check-out times, and leave records.</p>
        </div>
        <div className="tm-header-actions">
          {canDo("attendance", "create") && (
          <button className="tm-btn tm-btn-primary" onClick={() => openAttModal(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Attendance
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="tm-stats-grid">
        <StatCard
          title="Present"
          value={stats.present.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Absent"
          value={stats.absent.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="orange"
        />
        <StatCard
          title="Half Day"
          value={stats.halfDay.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="blue"
        />
        <StatCard
          title="Leave"
          value={stats.leave.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="purple"
        />
      </div>

      {/* Toolbar */}
      <div className="tm-toolbar">
        <div className="tm-toolbar-row">
          <div className="tm-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by Name or ID" />
            {search && (
              <button className="tm-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={attStatusFilter} onChange={(val) => { setAttStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "All Statuses" }, ...ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s }))]} />
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
                <th>Check-In</th>
                <th>Check-Out</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fetchLoading ? (
                <TableLoader colSpan={7} />
              ) : attendance.length === 0 ? (
                <tr>
                  <td colSpan="7" className="tm-empty">
                    <div className="tm-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      <p>No attendance records found</p>
                      <span>Try adjusting search or filters, or add a new attendance record.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                attendance.map((a) => (
                  <tr key={a._id}>
                    <td className="tm-td-name">{a.technicianName}</td>
                    <td className="tm-td-id">{a.technicianId}</td>
                    <td>{formatDate(a.date)}</td>
                    <td>{a.checkIn || "\u2014"}</td>
                    <td>{a.checkOut || "\u2014"}</td>
                    <td><span className={`tm-att-badge ${getAttStatusClass(a.status)}`}>{a.status}</span></td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" onClick={() => openViewModal(a)} title="View">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        {canDo("attendance", "edit") && (
                        <button className="act-btn act-edit" onClick={() => openAttModal(a)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        )}
                        {canDo("attendance", "delete") && (
                        <button className="act-btn act-delete" onClick={() => confirmDelete(a)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                        )}
                        <ActivityLogButton
                          module="attendance"
                          onClick={() => {
                            const attId = a._id || a.id;
                            navigate(`/admin/attendance-activity/${attId}`, {
                              state: { target: { recordId: attId, recordLabel: a.technicianName || a.date, module: "attendance" } },
                            });
                          }}
                          title="View Attendance Activity Log"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {attendance.length > 0 && (
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
      {showAttModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal tm-form-sm">
            <div className="tm-modal-header">
              <h3>{editingAtt ? "Edit Attendance" : "Add Attendance"}</h3>
              <button className="tm-modal-close" onClick={() => setShowAttModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={attFormik.handleSubmit} className="tm-modal-body" id="attendanceForm" noValidate>
              <div className="tm-form-grid">
                <div className="tm-form-field tm-full-width">
                  <label>Technician Name <span className="tm-req">*</span></label>
                  {isTechUser ? (
                    <input
                      type="text"
                      name="technicianName"
                      value={attFormik.values.technicianName || myName}
                      disabled
                      title="Attendance is always marked for yourself"
                    />
                  ) : (
                  <Dropdown
                    value={attFormik.values.technicianName}
                    onChange={(val) => {
                      attFormik.setFieldValue("technicianName", val);
                      // Store the matching technicianId in the background so it can be sent with the payload
                      const tech = technicians.find((t) => t.name === val);
                      attFormik.setFieldValue("technicianId", tech?.technicianId || "");
                    }}
                    options={(() => {
                      const opts = technicians
                        .filter((t) => t.name)
                        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                        .map((t) => ({ value: t.name, label: t.name }));
                      // Keep the currently-edited technician selectable even if not in the fetched list
                      if (editingAtt?.technicianName && !opts.some((o) => o.value === editingAtt.technicianName)) {
                        opts.unshift({ value: editingAtt.technicianName, label: editingAtt.technicianName });
                      }
                      return [{ value: "", label: "Select Technician" }, ...opts];
                    })()}
                    placeholder="Select Technician"
                    variant="form"
                  />
                  )}
                  {attFormik.errors.technicianName && attFormik.touched.technicianName && <span className="tm-field-error">{attFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Date <span className="tm-req">*</span></label>
                  <input type="date" name="date" value={attFormik.values.date} onChange={attFormik.handleChange} onBlur={attFormik.handleBlur} />
                  {attFormik.errors.date && attFormik.touched.date && <span className="tm-field-error">{attFormik.errors.date}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Status <span className="tm-req">*</span></label>
                  <Dropdown
                    value={attFormik.values.status}
                    onChange={(val) => {
                      attFormik.setFieldValue("status", val);
                      // Absent / Leave records have no working hours — clear any entered times
                      if (val === "Absent" || val === "Leave") {
                        attFormik.setFieldValue("checkIn", "");
                        attFormik.setFieldValue("checkOut", "");
                      }
                    }}
                    options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: s }))}
                    variant="form"
                  />
                  {attFormik.errors.status && attFormik.touched.status && <span className="tm-field-error">{attFormik.errors.status}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Check-In Time</label>
                  <input
                    type="time"
                    name="checkIn"
                    value={attFormik.values.checkIn}
                    onChange={attFormik.handleChange}
                    onBlur={attFormik.handleBlur}
                    disabled={noWorkHours}
                  />
                  {attFormik.errors.checkIn && attFormik.touched.checkIn && <span className="tm-field-error">{attFormik.errors.checkIn}</span>}
                  {noWorkHours && (
                    <span className="tm-form-hint">Not applicable for {attFormik.values.status} status</span>
                  )}
                </div>
                <div className="tm-form-field">
                  <label>Check-Out Time</label>
                  <input
                    type="time"
                    name="checkOut"
                    value={attFormik.values.checkOut}
                    onChange={attFormik.handleChange}
                    disabled={noWorkHours}
                  />
                </div>
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowAttModal(false)} disabled={loading || attFormik.isSubmitting}>Cancel</button>
              <button type="submit" form="attendanceForm" className="tm-btn tm-btn-primary" disabled={loading || attFormik.isSubmitting || !attFormik.isValid}>
                {loading || attFormik.isSubmitting ? <><span className="tm-spinner"></span> Saving...</> : editingAtt ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Attendance Modal */}
      {showViewModal && viewRecord && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Attendance Details</h3></div>
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
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Technician Name</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.technicianName}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Technician ID</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.technicianId}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{formatDate(viewRecord.date)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check-In</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.checkIn || "\u2014"}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check-Out</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.checkOut || "\u2014"}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
                  <span><span className={`tm-att-badge ${getAttStatusClass(viewRecord.status)}`}>{viewRecord.status}</span></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created At</span>
                  <span style={{ fontSize: '13px', color: '#1a2332' }}>{viewRecord.createdAt ? new Date(viewRecord.createdAt).toLocaleString() : "\u2014"}</span>
                </div>
              </div>
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
        title="Delete Attendance"
        message={`Are you sure you want to delete this attendance record for ${deleteTarget ? deleteTarget.technicianName : ""}?`}
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
                      {showLogModal.status || "Present"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Attendance Date</span>
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
                  Attendance Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technicianName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Check-in Time</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.checkIn || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Check-out Time</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.checkOut || "—"}</div>
                  </div>
                </div>

                {showLogModal.remarks && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Log Remarks &amp; Notes</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.remarks}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadAttendanceLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default Attendance;
