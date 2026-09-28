import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLoader } from "../../components/common";
import {
  technicianAPI,
  attendanceAPI,
  dailyReportAPI,
  technicianTaskAPI,
  taskAssignmentAPI,
} from "../../services";
import { fetchAllPages } from "../../utils";
// Reuse the Technician Management page styles (tm-*) for the cards, sections,
// badges and filter tabs so this page looks identical to the rest of the module.
import "../technicians/TechnicianManagement.css";
import "./TechnicianDetails.css";

/* ── Helpers (mirror TechnicianManagement) ── */

const toDateInput = (value) => {
  if (!value) return "";
  const str = String(value);
  if (str.length === 10 && !str.includes("T")) return str;
  const d = new Date(value);
  if (isNaN(d.getTime())) return str.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const normalizeTechnician = (doc) => ({
  ...doc,
  id: doc.technicianId || doc.id || doc._id,
  joinDate: doc.joinDate ? toDateInput(doc.joinDate) : doc.joinDate,
});

const normalizeReport = (doc) => ({
  ...doc,
  id: doc.reportId || doc.id || doc._id,
  date: doc.date ? toDateInput(doc.date) : doc.date,
});

const normalizeTask = (doc) => ({
  ...doc,
  id: doc.taskId || doc.id || doc._id,
});

const normalizeAttendance = (doc) => ({
  ...doc,
  id: doc.attendanceId || doc.id || doc._id,
  date: doc.date ? toDateInput(doc.date) : doc.date,
});

const getTaskStatusClass = (s) =>
  s === "Completed" ? "tm-tsk-done" : s === "In Progress" ? "tm-tsk-progress" : "tm-tsk-new";

const getAttStatusClass = (s) =>
  s === "Present" ? "tm-att-present" : s === "Absent" ? "tm-att-absent" : s === "Half Day" ? "tm-att-half" : "tm-att-leave";

const getTechStatusClass = (s) =>
  s === "Available" ? "tm-status-done" : s === "Busy" ? "tm-status-progress" : s === "On Leave" ? "tm-status-pending" : "tm-status-inactive";

const TechnicianDetails = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const techId = (searchParams.get("id") || "").trim();
  const techName = (searchParams.get("name") || "").trim();

  const [technicians, setTechnicians] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  // "daily" (today) | "monthly" (this month) | "overall" (all records)
  const [filter, setFilter] = useState("overall");

  /* ── Load all technician-related datasets on mount ── */
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        const [techRes, attRes, repRes, taskRes, jobRes] = await Promise.allSettled([
          fetchAllPages(technicianAPI.getAll),
          fetchAllPages(attendanceAPI.getAll),
          fetchAllPages(dailyReportAPI.getAll),
          fetchAllPages(technicianTaskAPI.getAll),
          fetchAllPages(taskAssignmentAPI.getAll),
        ]);
        if (cancelled) return;
        if (techRes.status === "fulfilled") setTechnicians(techRes.value.map(normalizeTechnician));
        if (attRes.status === "fulfilled") setAttendance(attRes.value.map(normalizeAttendance));
        if (repRes.status === "fulfilled") setDailyReports(repRes.value.map(normalizeReport));
        if (taskRes.status === "fulfilled") setTasks(taskRes.value.map(normalizeTask));
        if (jobRes.status === "fulfilled") setJobs(jobRes.value.map((d) => ({ ...d, id: d._id })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // The technician this page was opened for.
  const tech = useMemo(
    () =>
      technicians.find(
        (t) =>
          (techId && (t.id === techId || t.technicianId === techId)) ||
          (techName && (t.name === techName || (t.name || "").toLowerCase() === techName.toLowerCase()))
      ) || null,
    [technicians, techId, techName]
  );

  // Records filtered by the selected range.
  const detailData = useMemo(() => {
    if (!tech) return null;
    const today = toDateInput(new Date());
    const monthPrefix = today.slice(0, 7);
    const inRange = (dateStr) =>
      filter === "overall" ? true : filter === "monthly" ? (dateStr || "").startsWith(monthPrefix) : dateStr === today;
    const matchTech = (r) => r.technicianId === tech.id || r.technicianName === tech.name;
    return {
      jobs: jobs.filter((j) => j.technicianId === tech.id && inRange(toDateInput(j.assignedDate))),
      tasks: tasks.filter((t) => matchTech(t) && inRange(toDateInput(t.createdAt))),
      attendance: attendance.filter((a) => matchTech(a) && inRange(a.date)),
      reports: dailyReports.filter((r) => matchTech(r) && inRange(r.date)),
    };
  }, [tech, filter, jobs, tasks, attendance, dailyReports]);

  const presentDays = (detailData?.attendance || []).reduce((sum, a) => {
    if (a.status === "Present") return sum + 1;
    if (a.status === "Half Day") return sum + 0.5;
    return sum;
  }, 0);

  const renderSections = () => {
    if (!detailData) return null;
    return (
      <>
        {/* Tasks */}
        <div className="tm-history-section">
          <h4>Tasks</h4>
          {detailData.tasks.length === 0 ? <p className="tm-history-empty">No tasks in this range.</p> : (
            <div className="tm-history-list">
              {detailData.tasks.map((t) => (
                <div key={t.id} className="tm-history-item">
                  <div className="tm-history-item-header"><span className="tm-td-id">{t.id}</span><span className={`tm-status-badge ${getTaskStatusClass(t.status)}`}>{t.status}</span></div>
                  <p className="tm-history-item-title">{t.taskName}</p>
                  <span className="tm-history-item-date">{toDateInput(t.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance */}
        <div className="tm-history-section">
          <h4>Attendance</h4>
          {detailData.attendance.length === 0 ? <p className="tm-history-empty">No attendance records in this range.</p> : (
            <div className="tm-history-list">
              {detailData.attendance.map((a) => (
                <div key={a.id} className="tm-history-item">
                  <div className="tm-history-item-header"><span className="tm-td-id">{a.id}</span><span className={`tm-att-badge ${getAttStatusClass(a.status)}`}>{a.status}</span></div>
                  <span className="tm-history-item-date">{a.date} | {a.checkIn || "—"} - {a.checkOut || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Reports */}
        <div className="tm-history-section">
          <h4>Daily Reports</h4>
          {detailData.reports.length === 0 ? <p className="tm-history-empty">No reports submitted in this range.</p> : (
            <div className="tm-history-list">
              {detailData.reports.map((r) => (
                <div key={r.id} className="tm-history-item">
                  <div className="tm-history-item-header"><span className="tm-td-id">{r.id}</span><span className="tm-history-item-date">{r.date}</span></div>
                  <p className="tm-history-item-title">{r.workSummary}</p>
                  <span className="tm-history-item-date">{r.hoursWorked}h worked{r.assignedJob ? ` · ${r.assignedJob}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule (assigned jobs) */}
        <div className="tm-history-section">
          <h4>Schedule (Assigned Jobs)</h4>
          {detailData.jobs.length === 0 ? <p className="tm-history-empty">No jobs assigned in this range.</p> : (
            <div className="tm-history-list">
              {detailData.jobs.map((j) => (
                <div key={j.id} className="tm-history-item">
                  <div className="tm-history-item-header"><span className="tm-td-id">{j.id}</span><span className={`tm-status-badge ${j.status === "Completed" ? "tm-status-done" : j.status === "In Progress" ? "tm-status-progress" : "tm-status-pending"}`}>{j.status}</span></div>
                  <p className="tm-history-item-title">{j.jobTitle}{j.customerName ? ` — ${j.customerName}` : ""}</p>
                  <span className="tm-history-item-date">{toDateInput(j.assignedDate)}{j.dueDate ? ` — ${toDateInput(j.dueDate)}` : ""}{j.priority ? ` · ${j.priority} priority` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="tm-page td-page">
      {/* Back button — top-left */}
      <div className="td-back-row">
        <button className="tm-btn tm-btn-secondary" onClick={() => navigate("/admin/technicians")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back to Technicians
        </button>
      </div>

      {/* Page Header */}
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Technician Details{tech ? ` — ${tech.id}` : ""}</h1>
          <p className="tm-subtitle">Tasks, attendance, reports, and schedule for the selected technician.</p>
        </div>
      </div>

      {loading ? (
        <PageLoader minHeight="250px" />
      ) : !tech ? (
        <div className="td-state">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
          <p>Technician not found</p>
          <span>The requested technician could not be located.</span>
          <button className="tm-btn tm-btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/admin/technicians")}>Back to Technicians</button>
        </div>
      ) : (
        <div className="td-content">
          {/* Profile card */}
          <div className="tm-table-card td-profile-card">
            <div className="tm-tech-profile-header">
              <div className="tm-tech-avatar-lg">{(tech.name || "").split(" ").map((n) => n[0]).join("")}</div>
              <div className="tm-tech-profile-info">
                <h3>{tech.name}</h3>
                <span className="tm-td-id">{tech.id}</span>
                <span className={`tm-status-badge ${getTechStatusClass(tech.status)}`}>{tech.status}</span>
              </div>
            </div>
            <div className="tm-tech-detail-grid">
              <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Phone</span><span>{tech.phone}</span></div>
              <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Email</span><span>{tech.email}</span></div>
              <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Experience</span><span>{tech.experience}</span></div>
              <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Join Date</span><span>{tech.joinDate}</span></div>
            </div>
            {/* Skills section hidden — not needed
            <div className="tm-tech-detail-item" style={{ flexDirection: "column", gap: 8 }}>
              <span className="tm-tech-detail-label">Skills</span>
              <div className="tm-skill-tags">{(tech.skills || []).map((s) => <span key={s} className="tm-skill-tag">{s}</span>)}</div>
            </div>
            */}
          </div>

          {/* Range filter: daily / monthly / overall */}
          <div className="tm-detail-filter-tabs">
            {[
              { value: "daily", label: "Daily" },
              { value: "monthly", label: "Monthly" },
              { value: "overall", label: "Overall" },
            ].map((f) => (
              <button
                key={f.value}
                className={`tm-detail-filter-btn ${filter === f.value ? "active" : ""}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Summary cards for the selected range */}
          {detailData && (
            <div className="tm-perf-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div className="tm-perf-card tm-pc-green"><span className="tm-perf-label">Tasks</span><span className="tm-perf-value">{detailData.tasks.filter((t) => t.status === "Completed").length}/{detailData.tasks.length}</span></div>
              <div className="tm-perf-card tm-pc-blue"><span className="tm-perf-label">Attendance</span><span className="tm-perf-value">{presentDays}/{detailData.attendance.length}</span></div>
              <div className="tm-perf-card tm-pc-yellow"><span className="tm-perf-label">Reports</span><span className="tm-perf-value">{detailData.reports.length}</span></div>
              <div className="tm-perf-card tm-pc-purple"><span className="tm-perf-label">Jobs</span><span className="tm-perf-value">{detailData.jobs.length}</span></div>
            </div>
          )}

          {renderSections()}
        </div>
      )}
    </div>
  );
};

export default TechnicianDetails;
