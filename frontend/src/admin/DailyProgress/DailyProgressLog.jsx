import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { dailyProgressLogSchema, clampNumberInput } from "../../utils/AdminValidation";
import { dailyProgressLogAPI, technicianAPI, projectApprovalAPI, installationAPI, siteSurveyAPI, fileUrl } from "../../services";
import { createProfilePdf } from "../../utils/pdfLayout";
import { AreaChart, Area, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Pagination, Dropdown, ImageLightbox, TableLoader } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./DailyProgressLog.css";

const normalizeLog = (doc) => ({
  ...doc,
  id: doc.logId || doc.id || doc._id,
});

const formatLogDate = (date) => {
  if (!date) return "";
  const yyyy = String(date).slice(0, 4);
  const mm = String(date).slice(5, 7);
  const dd = String(date).slice(8, 10);
  return `${dd}/${mm}/${yyyy}`;
};

const formatLogDateInput = (date) => {
  if (!date) return "";
  return String(date).slice(0, 10);
};

const STATUS_OPTIONS = ["Not Started", "In Progress", "Completed", "Delayed", "Blocked"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Sunday-start getDay() → Monday-first index (Mon=0 … Sun=6)
const weekdayIndex = (date) => {
  if (!date) return -1;
  const day = new Date(`${String(date).slice(0, 10)}T00:00:00`).getDay();
  return day >= 0 ? (day + 6) % 7 : -1;
};

const fileLabel = (item) => (typeof item === "string" ? item : item?.name || "");
const fileHref = (item) => (typeof item === "string" ? fileUrl(item) : fileUrl(item?.url));

// Modern glassmorphism tooltip shared by the analytics charts.
// Colors are keyed by dataKey (gradient fills report "url(#…)" which is
// not a valid CSS background), so the dot always renders a solid color.
const CHART_SERIES_COLORS = { hours: "#6366f1", planned: "#e2e8f0", completed: "#10b981" };
const ChartTip = ({ active, payload, label, suffix }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="dp-chart-tip">
      <span className="dp-chart-tip-label">{label}</span>
      {payload.map((p, i) => (
        <span key={i} className="dp-chart-tip-row">
          <i className="dp-chart-tip-dot" style={{ background: CHART_SERIES_COLORS[p.dataKey] || "#94a3b8" }} />
          <span>{p.name}</span>
          <b>{p.value}{suffix ? ` ${suffix}` : ""}</b>
        </span>
      ))}
    </div>
  );
};

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const initialFormData = {
  date: today,
  project: "", technician: "", workPerformed: "", status: "Not Started",
  completedTasks: "", pendingTasks: "",
  materials: "", qty: "",
  delayStatus: "No", delayReason: "",
  weather: "Sunny", weatherDesc: "",
  gpsLat: "", gpsLng: "",
  images: [], videos: [], materialUsage: [],
  nextDayPlan: "", issuesFound: "", customerRemarks: "",
};

const DailyProgressLog = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [projects, setProjects] = useState([]);
  const [materialName, setMaterialName] = useState("");
  const [materialQty, setMaterialQty] = useState("");
  // Maps project name → technician name (from installations)
  const [projectTechnicianMap, setProjectTechnicianMap] = useState({});
  // Maps project name → materials array (from installations)
  const [projectMaterialsMap, setProjectMaterialsMap] = useState({});
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [techFilter, setTechFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showFormPage, setShowFormPage] = useState(false);

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    setShowFormPage(false);
  }, [location.key, location.state]);
  const [editingLog, setEditingLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalData, setLogModalData] = useState(null);
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const imgInputRef = useRef(null);
  const vidInputRef = useRef(null);

  const anyModalOpen = showViewModal || showDeleteDialog;

  const requestSeq = useRef(0);

  const loadLogs = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter !== "All") params.status = statusFilter;
      if (techFilter !== "All") params.technician = techFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const res = await dailyProgressLogAPI.getAll(params);
      if (seq !== requestSeq.current) return; // stale response — discard
      const docs = res.data?.data || [];
      setLogs(docs.map(normalizeLog));
      setTotal(res.data?.pagination?.total || docs.length);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.warn("Failed to load daily progress logs:", err?.message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [currentPage, pageSize, search, statusFilter, techFilter, dateFrom, dateTo]);

  const loadAllLogs = useCallback(async () => {
    try {
      const res = await dailyProgressLogAPI.getAll({ page: 1, limit: 1000 });
      const docs = (res.data?.data || []).map(normalizeLog);
      setAllLogs(docs);
      // Fallback option lists so the form stays usable even if the
      // technician / project-approval APIs are unavailable.
      setTechnicians((prev) => (prev.length ? prev : [...new Set(docs.map((l) => l.technician).filter(Boolean))]));
      setProjects((prev) => (prev.length ? prev : [...new Set(docs.map((l) => l.project).filter(Boolean))]));
    } catch (err) {
      console.warn("Failed to load analytics data:", err?.message);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const [techRes, projRes] = await Promise.allSettled([
        technicianAPI.getAll({ page: 1, limit: 100 }),
        projectApprovalAPI.getAll({ page: 1, limit: 100 }),
      ]);
      if (techRes.status === "fulfilled") {
        const techs = (techRes.value.data?.data || []).map((t) => t.name).filter(Boolean);
        if (techs.length) setTechnicians([...new Set(techs)]);
      }
      if (projRes.status === "fulfilled") {
        const projs = (projRes.value.data?.data || []).map((p) => p.projectName).filter(Boolean);
        if (projs.length) setProjects([...new Set(projs)]);
      }
    } catch (err) {
      console.warn("Failed to load dropdown options:", err?.message);
    }
  }, []);

  // Load installations to build project → technician mapping and project → materials mapping
  const loadInstallationTechs = useCallback(async () => {
    try {
      const res = await installationAPI.getAll({ page: 1, limit: 500 });
      const installs = res.data?.data || [];
      const techMap = {};
      const matMap = {};
      installs.forEach((inst) => {
        if (inst.projectName) {
          if (inst.technicianName) techMap[inst.projectName] = inst.technicianName;
          if (Array.isArray(inst.materials) && inst.materials.length > 0) {
            matMap[inst.projectName] = inst.materials.map((m) => ({
              name: m.productName || m.name || "",
              qty: Number(m.quantity) || 0,
            })).filter((m) => m.name);
          }
        }
      });
      setProjectTechnicianMap(techMap);
      setProjectMaterialsMap(matMap);
    } catch (err) {
      console.warn("Failed to load installation data:", err?.message);
    }
  }, []);

  useEffect(() => {
    loadAllLogs();
    loadOptions();
    loadInstallationTechs();
  }, [loadAllLogs, loadOptions, loadInstallationTechs]);

  // Debounced search + filter-driven fetch
  useEffect(() => {
    const t = setTimeout(loadLogs, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadLogs, search]);

  const formik = useFormik({
    initialValues: { ...initialFormData },
    validationSchema: dailyProgressLogSchema,
    onSubmit: async (values, { setFieldError }) => {
      if (!values.date) {
        setFieldError("date", "Date is required");
        return;
      }
      if (!editingLog) {
        const minDate = new Date(today);
        minDate.setHours(0, 0, 0, 0);
        if (new Date(values.date) < minDate) {
          setFieldError("date", "Date cannot be in the past");
          return;
        }
      }
      const usage = Array.isArray(values.materialUsage) ? values.materialUsage : [];
      const data = {
        ...values,
        materials: usage.length ? usage.map((u) => `${u.name} ×${u.qty}`).join(", ") : values.materials,
        qty: usage.length ? usage.reduce((s, u) => s + (Number(u.qty) || 0), 0) : (Number(values.qty) || 0),
        materialUsage: usage,
        workPerformed: values.workPerformed.trim(),
        pendingTasks: values.pendingTasks.trim(),
        issuesFound: values.issuesFound.trim(),
        nextDayPlan: values.nextDayPlan.trim(),
        customerRemarks: values.customerRemarks.trim(),
        delayReason: values.delayReason.trim(),
      };
      setLoading(true);
      try {
        if (editingLog) {
          const res = await dailyProgressLogAPI.update(editingLog._id || editingLog.id, data);
          const updated = normalizeLog(res.data.data);
          setLogs((p) => p.map((l) => (l._id === updated._id ? updated : l)));
          success(`Log ${updated.id} updated successfully`);
        } else {
          const res = await dailyProgressLogAPI.create(data);
          const created = normalizeLog(res.data.data);
          success(`Log ${created.id} created successfully`);
        }
        setShowFormPage(false); setEditingLog(null);
        formik.resetForm();
        loadAllLogs();
        loadLogs();
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save daily log. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });





  useEffect(() => {
    const el = document.querySelector('.dashboard-content');
    if (!el) return;
    el.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { el.style.overflow = ''; };
  }, [anyModalOpen]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const stats = useMemo(() => ({
    total: allLogs.length,
    completed: allLogs.filter((l) => l.status === "Completed").length,
    inProgress: allLogs.filter((l) => l.status === "In Progress").length,
    delayed: allLogs.filter((l) => l.status === "Delayed" || l.status === "Blocked").length,
  }), [allLogs]);

  const weeklyHours = useMemo(() => {
    const buckets = WEEKDAYS.map((day) => ({ day, hours: 0 }));
    allLogs.forEach((l) => {
      const idx = weekdayIndex(l.date);
      if (idx >= 0 && idx < 7) buckets[idx].hours += 8;
    });
    return buckets;
  }, [allLogs]);

  const weeklyTasks = useMemo(() => {
    const buckets = WEEKDAYS.map((day) => ({ day, completed: 0, planned: 0 }));
    allLogs.forEach((l) => {
      const idx = weekdayIndex(l.date);
      if (idx >= 0 && idx < 7) {
        buckets[idx].planned += 1;
        if (l.status === "Completed") buckets[idx].completed += 1;
      }
    });
    return buckets;
  }, [allLogs]);

  // Totals for the chart headers — recomputed automatically as data changes.
  const totalHours = weeklyHours.reduce((s, d) => s + d.hours, 0);
  const totalPlanned = weeklyTasks.reduce((s, d) => s + d.planned, 0);
  const totalCompleted = weeklyTasks.reduce((s, d) => s + d.completed, 0);

  const getStatusClass = (s) => s === "Completed" ? "dp-badge-completed" : s === "In Progress" ? "dp-badge-progress" : s === "Delayed" ? "dp-badge-delayed" : "dp-badge-blocked";

  const openAdd = () => {
    setEditingLog(null);
    formik.resetForm({ values: { ...initialFormData, date: today } });
    setMaterialName("");
    setMaterialQty("");
    setShowFormPage(true);
  };
  const openEdit = (log) => {
    setEditingLog(log);
    formik.setValues({
      date: formatLogDateInput(log.date), project: log.project, technician: log.technician,
      workPerformed: log.workPerformed, status: log.status,
      completedTasks: log.completedTasks || "",
      pendingTasks: log.pendingTasks || "", materials: log.materials || "",
      qty: String(log.qty || ""),
      delayStatus: log.delayStatus || "No", delayReason: log.delayReason || "",
      weather: log.weather || "Sunny", weatherDesc: log.weatherDesc || "",
      gpsLat: log.gpsLat || "", gpsLng: log.gpsLng || "",
      images: [...(log.images || [])], videos: [...(log.videos || [])],
      materialUsage: Array.isArray(log.materialUsage) ? log.materialUsage.map((m) => ({ name: m.name, qty: m.qty })) : [],
      nextDayPlan: log.nextDayPlan || "", issuesFound: log.issuesFound || "",
      customerRemarks: log.customerRemarks || "",
    }, false);
    setMaterialName("");
    setMaterialQty("");
    setShowFormPage(true);
  };
  const openView = (log) => { setSelectedLog(log); setShowViewModal(true); };
  const confirmDelete = (log) => { setDeleteTarget(log); setShowDeleteDialog(true); };

  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await dailyProgressLogAPI.delete(deleteTarget._id || deleteTarget.id);
      setLogs((p) => p.filter((l) => (l._id || l.id) !== (deleteTarget._id || deleteTarget.id)));
      success(`Log ${deleteTarget.id} deleted`);
      loadAllLogs();
      loadLogs();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete daily log. Please try again.");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
    setShowDeleteDialog(false); setDeleteTarget(null);
  };const downloadProgressLog = async (l) => {
  const doc = await createProfilePdf({
    bannerName: l.project,
    bannerSubtitle: `Log ID: ${l.id}`,
    bannerRight: [`Status: ${l.status || "—"}`],
    sections: [
      {
        title: "Basic Details",
        fields: [
          ["Date", formatLogDate(l.date) || "—"],
          ["Technician", l.technician],
        ],
      },
      {
        title: "Work Details",
        fields: [
          ["Work Performed", l.workPerformed],
          ["Completed Tasks", l.completedTasks || "—"],
          ["Pending Tasks", l.pendingTasks || "—"],
          ["Next Day Plan", l.nextDayPlan || "—"],
        ],
      },
      {
        title: "Materials & Resources",
        fields: [
          [
            "Materials Used",
            l.materialUsage?.length
              ? l.materialUsage.map((m) => `${m.name} ×${m.qty}`).join(", ")
              : l.materials || "—",
          ],
          ["Quantity", l.qty || "—"],
        ],
      },
      {
        title: "Delay",
        fields: [
          ["Delay Status", l.delayStatus],
          ["Delay Reason", l.delayReason || "—"],
        ],
      },
      {
        title: "Weather & Location",
        fields: [
          ["Weather", `${l.weather}${l.weatherDesc ? ` (${l.weatherDesc})` : ""}`],
          ["GPS", `${l.gpsLat}, ${l.gpsLng}`],
        ],
      },
      {
        title: "Details",
        fields: [
          ["Issues Found", l.issuesFound || "—"],
          ["Customer Remarks", l.customerRemarks || "—"],
        ],
      },
    ],
  });

  const safeProject = (l.project || "Project")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`ProgressLog_${safeProject}.pdf`);

  success("Progress log downloaded successfully");
};

  const uploadFiles = async (fileList, field) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const allowedExt = field === "images" ? ["jpg", "jpeg", "png"] : ["mp4", "mov", "avi"];
    const accepted = files.filter((f) => allowedExt.includes(f.name.split(".").pop().toLowerCase()));
    if (!accepted.length) {
      toastError("Unsupported file type selected");
      return;
    }
    const fd = new FormData();
    accepted.forEach((f) => fd.append("files", f));
    const setUploading = field === "images" ? setUploadingImages : setUploadingVideos;
    setUploading(true);
    try {
      const res = await dailyProgressLogAPI.upload(fd);
      const items = res.data?.data || [];
      formik.setFieldValue(field, [...formik.values[field], ...items]);
    } catch (err) {
      toastError(err.response?.data?.message || "File upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };
  const handleImgUpload = (e) => { uploadFiles(e.target.files, "images"); e.target.value = ""; };
  const handleVidUpload = (e) => { uploadFiles(e.target.files, "videos"); e.target.value = ""; };
  const removeImg = (i) => formik.setFieldValue("images", formik.values.images.filter((_, idx) => idx !== i));
  const removeVid = (i) => formik.setFieldValue("videos", formik.values.videos.filter((_, idx) => idx !== i));

  const usageList = formik.values.materialUsage || [];
  const addMaterial = () => {
    const name = materialName.trim();
    const qty = Number(materialQty);
    if (!name) {
      toastError("Enter a material name");
      return;
    }
    if (!qty || qty < 1) {
      toastError("Enter a valid quantity (at least 1)");
      return;
    }
    const current = formik.values.materialUsage || [];
    // Merge into existing row if same material name
    const existingIdx = current.findIndex((m) => String(m.name).toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      const merged = current.map((m, i) =>
        i === existingIdx ? { ...m, qty: (Number(m.qty) || 0) + qty } : m
      );
      formik.setFieldValue("materialUsage", merged);
    } else {
      formik.setFieldValue("materialUsage", [...current, { name, qty }]);
    }
    setMaterialName("");
    setMaterialQty("");
  };
  const removeMaterial = (idx) => {
    formik.setFieldValue("materialUsage", (formik.values.materialUsage || []).filter((_, i) => i !== idx));
  };

  // When a project is selected, auto-fill the technician name and materials from installation data
  const handleProjectSelect = (projectName) => {
    formik.setFieldValue("project", projectName);
    if (projectName && projectTechnicianMap[projectName]) {
      formik.setFieldValue("technician", projectTechnicianMap[projectName]);
    } else {
      formik.setFieldValue("technician", "");
    }
    if (projectName && projectMaterialsMap[projectName]) {
      formik.setFieldValue("materialUsage", projectMaterialsMap[projectName]);
    } else {
      formik.setFieldValue("materialUsage", []);
    }
  };

  const projectOptions = useMemo(() => [
    { value: "", label: "Select Project" },
    ...projects.map((p) => ({ value: p, label: p })),
  ], [projects]);

  const renderFormPage = () => (
    <div className="dp-form-page">
      <div className="dp-form-page-header">
        <button className="dp-btn dp-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Daily Logs
        </button>
        <h2>{editingLog ? `Edit Log ${editingLog.id}` : "New Daily Log"}</h2>
      </div>
        <form onSubmit={formik.handleSubmit} className="dp-form-page-body" noValidate>
          {/* 1. Daily Work Entry */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">1</span><h4>Daily Work Entry</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld"><label>Date <span className="dp-req">*</span></label><input type="date" name="date" value={formik.values.date} onChange={formik.handleChange} min={editingLog ? undefined : today} className={formik.errors.date && formik.touched.date ? "dp-input-error" : ""} />{formik.errors.date && formik.touched.date && <span className="dp-err">{formik.errors.date}</span>}</div>
              <div className="dp-fld"><label>Technician Name <span className="dp-req">*</span></label><input type="text" name="technician" value={formik.values.technician} readOnly placeholder="Auto-filled from project" style={{ background: "#f8fafc", cursor: "default" }} title="Auto-filled from selected project" />{formik.values.project && projectTechnicianMap[formik.values.project] && <span className="dp-hint">Auto-filled from project installation data</span>}{!formik.values.project && <span className="dp-hint">Select a project to auto-fill</span>}{formik.errors.technician && formik.touched.technician && <span className="dp-err">{formik.errors.technician}</span>}</div>
              <div className="dp-fld"><label>Project Name <span className="dp-req">*</span></label><Dropdown value={formik.values.project} onChange={handleProjectSelect} options={projectOptions} variant="form" />{formik.errors.project && formik.touched.project && <span className="dp-err">{formik.errors.project}</span>}</div>
              <div className="dp-fld"><label>Status</label><input type="text" name="status" value={formik.values.status} onChange={formik.handleChange} placeholder="e.g. In Progress, Completed" /></div>
              <div className="dp-fld dp-fw"><label>Work Performed Today <span className="dp-req">*</span></label><textarea name="workPerformed" value={formik.values.workPerformed} onChange={formik.handleChange} placeholder="Describe all work done today in detail..." rows={4} maxLength={2000} className={formik.errors.workPerformed && formik.touched.workPerformed ? "dp-input-error" : ""} />{formik.errors.workPerformed && formik.touched.workPerformed && <span className="dp-err">{formik.errors.workPerformed}</span>}</div>
            </div>
          </div>

          {/* 2. Tasks Done Today */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">2</span><h4>Tasks Done Today</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld dp-fw"><label>Completed Tasks</label><textarea name="completedTasks" value={formik.values.completedTasks} onChange={formik.handleChange} placeholder="List all tasks completed today..." rows={3} maxLength={1000} /></div>
              <div className="dp-fld dp-fw"><label>Pending Tasks</label><textarea name="pendingTasks" value={formik.values.pendingTasks} onChange={formik.handleChange} placeholder="List tasks still pending..." rows={3} maxLength={1000} /></div>
            </div>
          </div>

          {/* 3. Next Day Plan */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">3</span><h4>Planning</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld"><label>Next Day Plan</label><input type="text" name="nextDayPlan" value={formik.values.nextDayPlan} onChange={formik.handleChange} placeholder="e.g. Continue panel installation" maxLength={500} /></div>
            </div>
          </div>

          {/* 4. Material Usage */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">4</span><h4>Material Usage</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld"><label>Material Name</label><input type="text" value={materialName} onChange={(e) => setMaterialName(e.target.value)} placeholder="e.g. Solar Panel 550W" /></div>
              <div className="dp-fld"><label>Quantity Used</label><div className="dp-mat-qty-row"><input type="number" min="1" value={materialQty} onChange={(e) => { const v = e.target.value; if (v === "") { setMaterialQty(v); return; } const n = Number(v); if (isNaN(n) || n < 1) return; setMaterialQty(v); }} placeholder="e.g. 5" /><button type="button" className="dp-btn dp-btn-sec" onClick={addMaterial}>Add</button></div></div>
              <div className="dp-fld dp-fw">
                {formik.values.project && projectMaterialsMap[formik.values.project] && usageList.length > 0 && <span className="dp-hint">Auto-filled from project installation data</span>}
                {usageList.length > 0 && (
                  <div className="dp-file-list">{usageList.map((m, i) => (
                    <div key={i} className="dp-file-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg><span>{m.name} × {m.qty}</span><button type="button" className="dp-file-rm" onClick={() => removeMaterial(i)}>×</button></div>
                  ))}</div>
                )}
                {usageList.length === 0 && formik.values.materials && <span className="dp-hint">Previously recorded: {formik.values.materials}</span>}
              </div>
            </div>
          </div>

          {/* 5. Delay */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">6</span><h4>Delay Tracking</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld"><label>Any Delay?</label><Dropdown value={formik.values.delayStatus} onChange={(val) => formik.setFieldValue("delayStatus", val)} options={[{value:"No",label:"No"},{value:"Yes",label:"Yes"}]} variant="form" /></div>
              {formik.values.delayStatus === "Yes" && <div className="dp-fld"><label>Delay Reason</label><input type="text" name="delayReason" value={formik.values.delayReason} onChange={formik.handleChange} placeholder="e.g. Material delivery delayed" maxLength={500} /></div>}
              <div className="dp-fld"><label>Weather <span className="dp-req">*</span></label><Dropdown value={formik.values.weather} onChange={(val) => formik.setFieldValue("weather", val)} options={[{value:"Sunny",label:"Sunny"},{value:"Cloudy",label:"Cloudy"},{value:"Rainy",label:"Rainy"},{value:"Windy",label:"Windy"},{value:"Partly Cloudy",label:"Partly Cloudy"},{value:"Other",label:"Other"}]} variant="form" />{formik.errors.weather && formik.touched.weather && <span className="dp-err">{formik.errors.weather}</span>}</div>
              {formik.values.weather === "Other" && <div className="dp-fld"><label>Weather Description</label><input type="text" name="weatherDesc" value={formik.values.weatherDesc} onChange={formik.handleChange} placeholder="Describe weather" maxLength={500} /></div>}
            </div>
          </div>

          {/* 7. Image Upload */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">7</span><h4>Site Photos</h4></div>
            <div className="dp-upload-bar">
              <button type="button" className="dp-btn dp-btn-sec" onClick={() => imgInputRef.current?.click()} disabled={uploadingImages}>{uploadingImages ? "Uploading..." : "Upload Images"}</button>
              <input ref={imgInputRef} type="file" accept=".jpg,.jpeg,.png" onChange={handleImgUpload} style={{ display: "none" }} multiple />
              <span className="dp-upload-hint">JPG, JPEG, PNG</span>
            </div>
            {formik.values.images.length > 0 && <div className="dp-media-grid">{formik.values.images.map((n, i) => <div key={i} className="dp-media-cell"><img src={fileHref(n)} alt={fileLabel(n)} className="dp-media-img" onClick={() => setZoomImage({ src: fileHref(n), alt: fileLabel(n) })} title="Click to view full size" /><span className="dp-media-name" title={fileLabel(n)}>{fileLabel(n)}</span><button type="button" className="dp-file-rm dp-media-rm" onClick={() => removeImg(i)}>×</button></div>)}</div>}
          </div>

          {/* 8. Video Upload */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">8</span><h4>Site Videos</h4></div>
            <div className="dp-upload-bar">
              <button type="button" className="dp-btn dp-btn-sec" onClick={() => vidInputRef.current?.click()} disabled={uploadingVideos}>{uploadingVideos ? "Uploading..." : "Upload Videos"}</button>
              <input ref={vidInputRef} type="file" accept=".mp4,.mov,.avi" onChange={handleVidUpload} style={{ display: "none" }} multiple />
              <span className="dp-upload-hint">MP4, MOV, AVI</span>
            </div>
            {formik.values.videos.length > 0 && <div className="dp-media-grid">{formik.values.videos.map((n, i) => <div key={i} className="dp-media-cell"><video src={fileHref(n)} controls preload="metadata" className="dp-media-video" /><span className="dp-media-name" title={fileLabel(n)}>{fileLabel(n)}</span><button type="button" className="dp-file-rm dp-media-rm" onClick={() => removeVid(i)}>×</button></div>)}</div>}
          </div>

          {/* 9. Additional Details */}
          <div className="dp-fsect">
            <div className="dp-fsect-hdr"><span className="dp-fsect-num">9</span><h4>Additional Details</h4></div>
            <div className="dp-fgrid">
              <div className="dp-fld dp-fw"><label>Issues Found</label><input type="text" name="issuesFound" value={formik.values.issuesFound} onChange={formik.handleChange} placeholder="e.g. Material shortage, design mismatch" maxLength={500} /></div>
              <div className="dp-fld dp-fw"><label>Customer Remarks</label><input type="text" name="customerRemarks" value={formik.values.customerRemarks} onChange={formik.handleChange} placeholder="e.g. Customer satisfied with progress" maxLength={500} /></div>
            </div>
          </div>

          <div className="dp-modal-ftr">
            <button type="button" className="dp-btn dp-btn-cancel" onClick={() => setShowFormPage(false)}>Cancel</button>
            <button type="submit" className="dp-btn dp-btn-primary" disabled={loading}>{loading ? <><span className="dp-spinner"></span> Saving...</> : editingLog ? "Update Log" : "Save Log"}</button>
          </div>
        </form>
    </div>
  );

  const renderView = () => {
    if (!selectedLog) return null;
    const d = selectedLog;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>{d.id} — Daily Log Detail</h3></div>
            <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="dp-vgrid2">
              <div className="dp-vstat"><span className="dp-vlbl">Project</span><span className="dp-vval">{d.project}</span></div>
              <div className="dp-vstat"><span className="dp-vlbl">Technician</span><span className="dp-vval">{d.technician}</span></div>
              <div className="dp-vstat"><span className="dp-vlbl">Date</span><span className="dp-vval">{formatLogDate(d.date) || "—"}</span></div>
              <div className="dp-vstat"><span className="dp-vlbl">Status</span><span className="dp-vval"><span className={`dp-badge ${getStatusClass(d.status)}`}>{d.status}</span></span></div>
            </div>
            <div className="dp-vsect"><h5>Work Performed</h5><p>{d.workPerformed}</p></div>
            <div className="dp-vsect"><h5>Completed Tasks</h5><p>{d.completedTasks || "—"}</p></div>
            <div className="dp-vsect"><h5>Pending Tasks</h5><p>{d.pendingTasks || "—"}</p></div>
            <div className="dp-vsect"><h5>Materials Used</h5>{d.materialUsage?.length ? d.materialUsage.map((m, i) => <p key={i}>• {m.name} × {m.qty}</p>) : <p>{d.materials || "—"}{d.qty ? ` (Qty: ${d.qty})` : ""}</p>}</div>
            <div className="dp-vsect"><h5>Issues Found</h5><p className={d.issuesFound === "None" || !d.issuesFound ? "dp-issue-none" : "dp-issue-yes"}>{d.issuesFound || "None"}</p></div>
            <div className="dp-vsect"><h5>Next Day Plan</h5><p>{d.nextDayPlan || "—"}</p></div>
            <div className="dp-vsect"><h5>Customer Remarks</h5><p>{d.customerRemarks || "—"}</p></div>
            {d.delayStatus === "Yes" && <div className="dp-vsect"><h5>Delay Reason</h5><p className="dp-issue-yes">{d.delayReason}</p></div>}

            {d.images?.length > 0 && <div className="dp-vsect"><h5>Images ({d.images.length})</h5><div className="dp-media-grid">{d.images.map((n, i) => <div key={i} className="dp-media-cell"><img src={fileHref(n)} alt={fileLabel(n)} className="dp-media-img" onClick={() => setZoomImage({ src: fileHref(n), alt: fileLabel(n) })} title="Click to view full size" /><span className="dp-media-name" title={fileLabel(n)}>{fileLabel(n)}</span></div>)}</div></div>}
            {d.videos?.length > 0 && <div className="dp-vsect"><h5>Videos ({d.videos.length})</h5><div className="dp-media-grid">{d.videos.map((n, i) => <div key={i} className="dp-media-cell"><video src={fileHref(n)} controls preload="metadata" className="dp-media-video" /><span className="dp-media-name" title={fileLabel(n)}>{fileLabel(n)}</span></div>)}</div></div>}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowViewModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="daily-progress-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="dp-page">
      {showFormPage ? renderFormPage() : (
        <>
      {/* Page Header */}
      <div className="dp-header">
        <div>
          <h1 className="dp-title">Daily Progress Log</h1>
          <p className="dp-subtitle">Track daily work logs, technician progress, weekly hours, and task completion status.</p>
        </div>
        <div className="dp-header-actions">
          {canDo("daily-progress", "create") && (
          <button className="dp-btn dp-btn-primary" onClick={() => openAdd()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Daily Entry
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="dp-stats-grid">
        <StatCard
          title="Total Logs"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="purple"
        />
        <StatCard
          title="Completed"
          value={stats.completed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          color="green"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="blue"
        />
        <StatCard
          title="Delayed/Blocked"
          value={stats.delayed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="orange"
        />
      </div>

      {/* Charts — 2 modern, data-driven graphs */}
      <div className="dp-charts">
        <div className="dp-chart-card">
          <div className="dp-chart-head">
            <div className="dp-chart-title">
              <span className="dp-chart-ico dp-ico-violet"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></span>
              <h3>Weekly Work Hours</h3>
            </div>
            <span className="dp-chart-badge">{totalHours} hrs</span>
          </div>
          <ResponsiveContainer width="100%" height={235}>
            <AreaChart data={weeklyHours} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="dpGradHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={4} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTip suffix="hrs" />} cursor={{ stroke: "#c7d2fe", strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="hours" name="Hours" stroke="#6366f1" strokeWidth={2.5} fill="url(#dpGradHours)" dot={{ r: 3.5, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5.5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="dp-chart-card">
          <div className="dp-chart-head">
            <div className="dp-chart-title">
              <span className="dp-chart-ico dp-ico-emerald"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span>
              <h3>Task Completion</h3>
            </div>
            <div className="dp-chart-head-right">
              <span className="dp-chart-badge dp-chart-badge-emerald">{totalCompleted}/{totalPlanned} done</span>
              <div className="dp-chart-legend">
                <span><i style={{ background: "#e2e8f0" }} />Planned</span>
                <span><i style={{ background: "#10b981" }} />Completed</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={235}>
            <ComposedChart data={weeklyTasks} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="dpGradDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={4} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
              <Bar dataKey="planned" name="Planned" fill="#e2e8f0" radius={[6, 6, 0, 0]} barSize={20} />
              <Bar dataKey="completed" name="Completed" fill="url(#dpGradDone)" radius={[6, 6, 0, 0]} barSize={20} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-row">
          <div className="dp-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by ID, Project, or Technician" />
            {search && (
              <button className="dp-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Status" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s }))]} />
          <Dropdown value={techFilter} onChange={(val) => { setTechFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Technician" }, ...technicians.map((t) => ({ value: t, label: t }))]} />
          <input type="date" className="dp-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
          <input type="date" className="dp-inline-date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />

        </div>
      </div>

      {/* Table */}
      <div className="dp-table-card">
        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Log ID</th>
                <th>Date</th>
                <th>Project</th>
                <th>Technician</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <TableLoader colSpan={6} />
              ) : logs.length === 0 ? (
                <tr><td colSpan={6}><div className="dp-empty"><div className="dp-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg><p>No daily logs found</p><span>Try adjusting your search or filters</span></div></div></td></tr>
              ) : logs.map((l) => (
                <tr key={l._id || l.id}>
                  <td className="dp-td-id">{l.id}</td>
                  <td className="dp-td-date">{formatLogDate(l.date) || "—"}</td>
                  <td><div className="dp-td-name">{l.project}</div></td>
                  <td>{l.technician}</td>
                  <td><span className={`dp-badge ${getStatusClass(l.status)}`}>{l.status}</span></td>
                  <td>
                    <div className="act-actions">
                      <button className="act-btn act-view" onClick={() => openView(l)} title="View Details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                      <ActivityLogButton
                        module="daily-progress"
                        onClick={() => {
                          const logId = l.serverId || l._id || l.id;
                          navigate(`/admin/daily-progress-activity/${logId}`, {
                            state: { target: { recordId: logId, recordLabel: l.logId || l.project, module: "daily-progress" } },
                          });
                        }}
                        title="View Daily Progress Activity Log"
                      />
                      {canDo("daily-progress", "edit") && (
                      <button className="act-btn act-edit" onClick={() => openEdit(l)} title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                      )}
                      {canDo("daily-progress", "delete") && (
                      <button className="act-btn act-delete" onClick={() => confirmDelete(l)} title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dp-pag-row">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            variant="table"
            onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
            disabled={loading}
          />
        </div>
      </div>

      {/* Modals */}
      {showViewModal && renderView()}
      {zoomImage && (
        <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />
      )}
      {/* ════════ Log Details & Change Summary Modal ════════ */}
      {showLogModal && logModalData && (
        <div className="cm-overlay">
          <div className="cm-view-modal" style={{ maxWidth: "550px" }}>
            <div className="cm-view-modal-header" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: "14px" }}>
              <div className="cm-view-modal-title">
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#1a2332" }}>
                  Log Details &amp; Change Summary
                </h3>
                <span className="cm-td-id" style={{ marginTop: "4px", display: "inline-block" }}>
                  {logModalData.id || logModalData._id}
                </span>
              </div>
              <button className="cm-modal-close" onClick={() => setShowLogModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
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
                    <span className={`cm-status-badge cm-status-${(logModalData.status || "").toLowerCase()}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {logModalData.status || "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {formatLogDate(logModalData.date) || "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Last Modified</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {logModalData.updatedAt ? new Date(logModalData.updatedAt).toLocaleString("en-IN") : "No changes logged"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Log Details Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Progress Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Project</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{logModalData.project || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{logModalData.technician || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Work Performed</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{logModalData.workPerformed || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Completed Tasks</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{logModalData.completedTasks || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Pending Tasks</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{logModalData.pendingTasks || "—"}</div>
                  </div>

                </div>

                {logModalData.delayReason && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Delay Reason</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{logModalData.delayReason}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(false)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadProgressLog(logModalData); setShowLogModal(false); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}      <ConfirmDialog isOpen={showDeleteDialog} onCancel={() => setShowDeleteDialog(false)} onConfirm={handleDelete} title="Delete Daily Log" message={`Are you sure you want to delete ${deleteTarget?.id}?`} confirmLabel="Delete" variant="danger" loading={deleteLoading} />
    </div>
  );
};

export default DailyProgressLog;
