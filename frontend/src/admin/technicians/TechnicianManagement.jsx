// Technician Management
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { Pagination, Dropdown, TableLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { technicianSchema, technicianAddSchema, locationSchema, dailyReportSchema, taskTrackingSchema } from "../../utils/AdminValidation";
import { technicianAPI, technicianLocationAPI, dailyReportAPI, technicianTaskAPI, taskAssignmentAPI, attendanceAPI, leadAPI, siteSurveyAPI, installationAPI } from "../../services";
import { fetchAllPages } from "../../utils";
import "./TechnicianManagement.css";
import { getAddressFromCoordinates } from "../../utils/geocoding";
import { deriveTechnicianId } from "../../utils/helpers";
import { createProfilePdf } from "../../utils/pdfLayout";
 import SolarMap from "../../components/map/SolarMap";
import { useAuth } from "../../context/AuthContext";

const TASK_STATUSES = ["Not Started", "In Progress", "Completed"];

const TECH_STATUS = ["Available", "Busy", "On Leave", "Inactive"];
const TECH_SKILLS = ["Inverter Installation", "Panel Mounting", "Wiring & Cabling", "Battery Systems", "IoT & Monitoring", "Site Survey", "Maintenance", "Earthing & Safety"];
const TECH_EXPERIENCE = ["0-1 Years", "1-3 Years", "3-5 Years", "5-10 Years", "10+ Years"];

const PAGE_SIZES = [5, 10, 15, 25];

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function generateReportId(length) {
  return `RPT-${String(length + 1).padStart(3, "0")}`;
}

// Backend documents use _id internally and a human-friendly technicianId (TECH-001) for display.
// Convert the stored ISO date to a local-timezone YYYY-MM-DD so the date doesn't shift by a day.
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

const normalizeLocation = (doc) => ({
  ...doc,
  id: doc._id,
  lastUpdated: doc.lastUpdated || doc.updatedAt || doc.createdAt,
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

// Resolve the customer a report belongs to by matching the report's technician
// and assigned job against the task assignments dataset.
const getReportCustomer = (report, jobs) => {
  const job = jobs.find(
    (j) =>
      j.technicianName === report.technicianName &&
      j.jobTitle &&
      report.assignedJob &&
      report.assignedJob.includes(j.jobTitle)
  );
  if (job?.customerName) return job.customerName;

  const m = String(report.assignedJob || "").match(/^(.*?)\s*-\s*(.*)$/);
  if (m && !/^[A-Z]+-\d+$/i.test(m[1].trim()) && !/^[0-9a-f]{24}$/i.test(m[1].trim())) {
    return m[1].trim();
  }
  return "\u2014";
};

const TechnicianManagement = () => {
  const { success, error: toastError } = useToast();
  const { user, canDo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Reset internal detail sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setShowViewTech(null);
    setShowTechHistory(null);
  }, [location.pathname, location.search, location.key]);
  // Technicians only use this page for their own live location — the other
  // tabs (list, reports, tasks, performance) stay hidden for them.
  const isTechUser = user?.role === "technician";
  const [activeSection, setActiveSection] = useState(isTechUser ? "location" : "list");
  const [jobs, setJobs] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [locations, setLocations] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [leads, setLeads] = useState([]);
  const [siteSurveys, setSiteSurveys] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [techSearch, setTechSearch] = useState("");
  const [techStatusFilter, setTechStatusFilter] = useState("All");
  const [techSkillFilter, setTechSkillFilter] = useState("All");
  const [techExpFilter, setTechExpFilter] = useState("All");
  const [techPage, setTechPage] = useState(1);
  const [techPageSize, setTechPageSize] = useState(10);
  const [techList, setTechList] = useState([]);
  const [techServerTotal, setTechServerTotal] = useState(0);
  const [techListLoading, setTechListLoading] = useState(true);
  const [showTechModal, setShowTechModal] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [showViewTech, setShowViewTech] = useState(null);
  const [showTechHistory, setShowTechHistory] = useState(null);

  // Clicking a technician's name opens a dedicated page with all of their data
  // (tasks, attendance, reports, schedule) and daily/monthly/overall filters.
  const openTechDetailsPage = (t) => {
    navigate(`/admin/technician-details?id=${encodeURIComponent(t.id)}&name=${encodeURIComponent(t.name || "")}`);
  };
  const [technicianFilter, setTechnicianFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewPageSize, setOverviewPageSize] = useState(10);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const [perfPage, setPerfPage] = useState(1);
  const [perfPageSize, setPerfPageSize] = useState(10);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);
  const [reportSearch, setReportSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationTechLocked, setLocationTechLocked] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [liveAddress, setLiveAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locationAddresses, setLocationAddresses] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showViewReport, setShowViewReport] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [deleteContext, setDeleteContext] = useState({ type: "", target: null });
  const [loading, setLoading] = useState(false);
  

  // ─── Technician List: server-side search / filter / pagination ───
  // The list tab queries the API with its filters (including the skill filter) so
  // filtering searches the entire database, not just the roster loaded on mount.
  const fetchTechList = useCallback(async () => {
    setTechListLoading(true);
    try {
      const params = { page: techPage, limit: techPageSize };
      if (techSearch) params.search = techSearch;
      if (techStatusFilter !== "All") params.status = techStatusFilter;
      if (techSkillFilter !== "All") params.skill = techSkillFilter;
      if (techExpFilter !== "All") params.experience = techExpFilter;

      const res = await technicianAPI.getAll(params);
      if (res.data?.success) {
        const docs = res.data.data || [];
        setTechList(docs.map(normalizeTechnician));
        setTechServerTotal(res.data.pagination?.total || docs.length);
      }
    } catch (err) {
      console.warn("Failed to load technician list:", err?.message);
      // Backend unreachable — fall back to filtering the roster loaded on mount
      const q = techSearch.toLowerCase();
      const filtered = technicians.filter((t) => {
        const matchSearch = !q || (t.name || "").toLowerCase().includes(q) || (t.id || "").toLowerCase().includes(q) || (t.phone || "").includes(q) || (t.email || "").toLowerCase().includes(q);
        const matchStatus = techStatusFilter === "All" || t.status === techStatusFilter;
        const matchSkill = techSkillFilter === "All" || (t.skills || []).includes(techSkillFilter);
        const matchExp = techExpFilter === "All" || t.experience === techExpFilter;
        return matchSearch && matchStatus && matchSkill && matchExp;
      });
      setTechList(filtered.slice((techPage - 1) * techPageSize, techPage * techPageSize));
      setTechServerTotal(filtered.length);
    } finally {
      setTechListLoading(false);
    }
  }, [techPage, techPageSize, techSearch, techStatusFilter, techSkillFilter, techExpFilter, technicians]);

  useEffect(() => {
    fetchTechList();
  }, [fetchTechList]);

  // Clamp the page when filters shrink the result set
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(techServerTotal / techPageSize));
    if (techPage > totalPages) setTechPage(totalPages);
  }, [techPage, techServerTotal, techPageSize]);

  // ─── Formik Instances ───
  const techFormik = useFormik({
    initialValues: {
      name: "", phone: "", email: "",skills: ["Site Survey"], experience: "", status: "Available", joinDate: "",
    },
    validationSchema: editingTech ? technicianSchema : technicianAddSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      const payload = {
        name: values.name.trim(),
        phone: values.phone.replace(/\D/g, ""),
        email: values.email.trim(),
        skills: values.skills,
        experience: values.experience,
        status: values.status,
        joinDate: values.joinDate,
      };
      try {
        if (editingTech) {
          if (editingTech._id) {
            const res = await technicianAPI.update(editingTech._id, payload);
            const updated = normalizeTechnician(res.data.data);
            setTechnicians((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
            success(`Technician ${updated.id} updated successfully`);
          } else {
            setTechnicians((prev) => prev.map((t) => t.id === editingTech.id ? { ...t, ...payload, phone: "+91 " + payload.phone } : t));
            success(`Technician ${editingTech.id} updated successfully`);
          }
        } else {
          const res = await technicianAPI.create(payload);
          const created = normalizeTechnician(res.data.data);
          setTechnicians((prev) => [...prev, created]);
          success(res.data?.message || `Technician ${created.id} created successfully`);
        }
        setShowTechModal(false);
        setEditingTech(null);
        resetForm();
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save technician. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });

  const locationFormik = useFormik({
    initialValues: {
      technicianName: "", technicianId: "", latitude: "", longitude: "", lastUpdated: "",
    },
    validationSchema: locationSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      const data = { ...values, lastUpdated: now };
      const tech = technicians.find((t) => t.name === values.technicianName);
      const technicianId = tech?.id || values.technicianId || "";
      const payload = {
        technicianName: values.technicianName,
        technicianId,
        latitude: values.latitude,
        longitude: values.longitude,
      };
      try {
        if (editingLocation && editingLocation._id) {
          const res = await technicianLocationAPI.update(editingLocation._id, payload);
          const updated = normalizeLocation(res.data.data);
          setLocations((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
          success(`Location updated for ${data.technicianName}`);
        } else if (editingLocation) {
          setLocations((prev) => prev.map((l) => l.technicianId === editingLocation.technicianId ? { ...l, ...data } : l));
          success(`Location updated for ${data.technicianName}`);
        } else {
          try {
            const res = await technicianLocationAPI.create(payload);
            setLocations((prev) => [...prev, normalizeLocation(res.data.data)]);
          } catch (err) {
            setLocations((prev) => [...prev, { ...data }]);
          }
          success(`Location saved for ${data.technicianName}`);
        }
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save location. Please try again.");
      }
      setShowLocationModal(false);
      setEditingLocation(null);
      resetForm();
    },
  });

  const reportFormik = useFormik({
    initialValues: {
      technicianName: "", date: new Date().toISOString().split("T")[0], assignedJob: "", workSummary: "", hoursWorked: "",
    },
    validationSchema: dailyReportSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      const tech = technicians.find((t) => t.name === values.technicianName);
      const technicianId = tech?.id || "";
      const payload = {
        technicianName: values.technicianName,
        technicianId,
        date: values.date,
        assignedJob: values.assignedJob || "",
        workSummary: values.workSummary,
        hoursWorked: parseFloat(values.hoursWorked),
      };
      try {
        if (editingReport && editingReport._id) {
          const res = await dailyReportAPI.update(editingReport._id, payload);
          const updated = normalizeReport(res.data.data);
          setDailyReports((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
          success(`Report ${updated.id} updated successfully`);
        } else if (editingReport) {
          setDailyReports((prev) => prev.map((r) => r.id === editingReport.id ? { ...r, ...values, hoursWorked: parseFloat(values.hoursWorked) } : r));
          success(`Report ${editingReport.id} updated successfully`);
        } else {
          try {
            const res = await dailyReportAPI.create(payload);
            const created = normalizeReport(res.data.data);
            setDailyReports((prev) => [...prev, created]);
            success(`Report ${created.id} created successfully`);
          } catch (err) {
            const newRpt = { id: generateReportId(dailyReports.length), ...values, hoursWorked: parseFloat(values.hoursWorked) };
            setDailyReports((prev) => [...prev, newRpt]);
            success(`Report ${newRpt.id} created successfully`);
          }
        }
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save report. Please try again.");
      }
      setLoading(false);
      setShowReportModal(false);
      setEditingReport(null);
      resetForm();
    },
  });

  const taskFormik = useFormik({
    initialValues: {
      technicianName: "", taskName: "", status: "Not Started",
      customerName: "", leadId: "", installationId: "",
    },
    validationSchema: taskTrackingSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      const tech = technicians.find((t) => t.name === values.technicianName);
      const technicianId = tech?.id || "";
      const payload = {
        technicianName: values.technicianName,
        technicianId,
        taskName: values.taskName.trim(),
        status: values.status,
        customerName: values.customerName,
        leadId: values.leadId,
        installationId: values.installationId,
      };
      try {
        if (editingTask && editingTask._id) {
          const res = await technicianTaskAPI.update(editingTask._id, payload);
          const updated = normalizeTask(res.data.data);
          setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
          success(`Task ${updated.id} updated successfully`);
        } else if (editingTask) {
          setTasks((prev) => prev.map((t) => t.id === editingTask.id ? { ...t, ...values, taskName: values.taskName.trim() } : t));
          success(`Task ${editingTask.id} updated successfully`);
        } else {
          try {
            const res = await technicianTaskAPI.create(payload);
            const created = normalizeTask(res.data.data);
            setTasks((prev) => [...prev, created]);
            success(`Task ${created.id} created successfully`);
          } catch (err) {
            const newTask = { id: `TSK-${String(tasks.length + 1).padStart(3, "0")}`, ...values, taskName: values.taskName.trim() };
            setTasks((prev) => [...prev, newTask]);
            success(`Task ${newTask.id} created successfully`);
          }
        }
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save task. Please try again.");
      }
      setShowTaskModal(false);
      setEditingTask(null);
      resetForm();
    },
  });

  const anyModalOpen = showTechModal || showViewTech || showTechHistory || showLocationModal || showReportModal || showTaskModal || showViewReport || showDeleteDialog;

  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    if (anyModalOpen) { content.style.overflow = 'hidden'; }
    else { content.style.overflow = ''; }
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);

  // Load real technicians from MongoDB (via backend API) on mount
  useEffect(() => {
    let cancelled = false;
    const loadTechnicians = async () => {
      try {
        const docs = await fetchAllPages(technicianAPI.getAll);
        if (!cancelled) {
          setTechnicians(docs.map(normalizeTechnician));
        }
      } catch (err) {
        // Backend unreachable - show an empty roster so the page stays usable
        console.warn("Failed to load technicians:", err?.message);
      }
    };
    loadTechnicians();
    return () => { cancelled = true; };
  }, []);

  // Load live locations, daily reports, and tasks from MongoDB (via backend API) on mount
  useEffect(() => {
    let cancelled = false;
    const loadLocations = async () => {
      try {
        const docs = await fetchAllPages(technicianLocationAPI.getAll);
        if (!cancelled) {
          setLocations(docs.map(normalizeLocation));
        }
      } catch (err) {
        console.warn("Failed to load locations:", err?.message);
      }
    };
    loadLocations();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadReports = async () => {
      try {
        const docs = await fetchAllPages(dailyReportAPI.getAll);
        if (!cancelled) {
          setDailyReports(docs.map(normalizeReport));
        }
      } catch (err) {
        console.warn("Failed to load reports:", err?.message);
      }
    };
    loadReports();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const docs = await fetchAllPages(technicianTaskAPI.getAll);
        if (!cancelled) {
          setTasks(docs.map(normalizeTask));
        }
      } catch (err) {
        console.warn("Failed to load tasks:", err?.message);
      }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, []);

  // Load real task assignments into the jobs dataset so the report form (and the
  // overview / performance tabs) reflect which technician works for which customer
  // and project. Starts empty when the backend is unreachable.
  useEffect(() => {
    let cancelled = false;
    const loadJobs = async () => {
      try {
        const docs = await fetchAllPages(taskAssignmentAPI.getAll);
        if (!cancelled) {
          setJobs(docs.map((d) => ({ ...d, id: d._id })));
        }
      } catch (err) {
        console.warn("Failed to load task assignments:", err?.message);
      }
    };
    loadJobs();
    return () => { cancelled = true; };
  }, []);

  // Load real attendance records so the overview / performance tabs reflect the
  // technician's actual presence data. Starts empty when the backend is unreachable.
  useEffect(() => {
    let cancelled = false;
    const loadAttendance = async () => {
      try {
        const docs = await fetchAllPages(attendanceAPI.getAll);
        if (!cancelled) {
          setAttendance(docs.map(normalizeAttendance));
        }
      } catch (err) {
        console.warn("Failed to load attendance:", err?.message);
      }
    };
    loadAttendance();
    return () => { cancelled = true; };
  }, []);

  // Load leads + site surveys + installations so the task form can offer the
  // selected technician's customers as a dropdown (same sources as Task Assignment).
  useEffect(() => {
    let cancelled = false;
    const loadCustomerLinks = async () => {
      try {
        const [leadRes, surveyRes, instRes] = await Promise.all([
          leadAPI.getAll({ page: 1, limit: 100 }),
          siteSurveyAPI.getAll({ page: 1, limit: 100 }),
          installationAPI.getAll({ page: 1, limit: 100 }),
        ]);
        if (!cancelled) {
          setLeads(leadRes.data?.data || []);
          setSiteSurveys(surveyRes.data?.data || []);
          setInstallations(instRes.data?.data || []);
        }
      } catch (err) {
        console.warn("Failed to load customer links:", err?.message);
      }
    };
    loadCustomerLinks();
    return () => { cancelled = true; };
  }, []);

  // Performance reports derived data
  const perfReports = useMemo(() => {
    return technicians.map((tech) => {
      // Attendance is measured for the current month only (dates are normalized
      // to local YYYY-MM-DD). Present counts as a full day, Half Day as half a
      // day, and Absent / Leave as zero.
      const monthPrefix = toDateInput(new Date()).slice(0, 7);
      const attRecords = attendance.filter(
        (a) => a.technicianName === tech.name && a.date && a.date.startsWith(monthPrefix)
      );
      const presentDays = attRecords.reduce((sum, a) => {
        if (a.status === "Present") return sum + 1;
        if (a.status === "Half Day") return sum + 0.5;
        return sum;
      }, 0);
      const totalDays = attRecords.length || 1;
      const techReports = dailyReports.filter((r) => r.technicianName === tech.name);
      const totalReports = techReports.length;
      const totalHours = techReports.reduce((s, r) => s + r.hoursWorked, 0);
      const techTasks = tasks.filter((t) => t.technicianName === tech.name);
      const taskCompleted = techTasks.filter((t) => t.status === "Completed").length;
      const taskTotal = techTasks.length || 1;
      return {
        technicianName: tech.name,
        technicianId: tech.id,
        attendancePresent: presentDays,
        attendanceTotal: totalDays,
        attendanceRate: Math.round((presentDays / totalDays) * 100),
        totalReports,
        totalHours,
        avgHours: totalReports > 0 ? (totalHours / totalReports).toFixed(1) : "0",
        taskCompleted,
        taskTotal,
        taskRate: Math.round((taskCompleted / taskTotal) * 100),
      };
    });
  }, [technicians, attendance, dailyReports, tasks]);

  // Compute performance for a specific tech
  const getTechPerformance = (techName) => {
    return perfReports.find((p) => p.technicianName === techName);
  };

  useEffect(() => {
    const overviewTotal = Math.max(1, Math.ceil(technicians.length / overviewPageSize));
    if (overviewPage > overviewTotal) setOverviewPage(overviewTotal);
  }, [overviewPage, overviewPageSize, technicians]);

  useEffect(() => {
    const taskFiltered = tasks.filter((t) => technicianFilter === "All" || t.technicianName === technicianFilter);
    const taskTotal = Math.max(1, Math.ceil(taskFiltered.length / taskPageSize));
    if (taskPage > taskTotal) setTaskPage(taskTotal);
  }, [taskPage, taskPageSize, technicianFilter, tasks]);

  useEffect(() => {
    const perfTotal = Math.max(1, Math.ceil(perfReports.length / perfPageSize));
    if (perfPage > perfTotal) setPerfPage(perfTotal);
  }, [perfPage, perfPageSize, perfReports]);

  const getTaskStatusClass = (s) => s === "Completed" ? "tm-tsk-done" : s === "In Progress" ? "tm-tsk-progress" : "tm-tsk-new";
  const getAttStatusClass = (s) => s === "Present" ? "tm-att-present" : s === "Absent" ? "tm-att-absent" : s === "Half Day" ? "tm-att-half" : "tm-att-leave";


  // ─── TECHNICIAN LIST CRUD ───
  const openTechModal = (tech = null) => {
    setEditingTech(tech);
    techFormik.setTouched({});
    if (tech) {
      techFormik.setValues({
        name: tech.name, phone: (tech.phone || "").replace(/\D/g, "").slice(-10), email: tech.email,
        skills: [...(tech.skills || [])], experience: tech.experience, status: tech.status, joinDate: tech.joinDate,
      });
    } else {
      techFormik.resetForm();
    }
    setShowTechModal(true);
  };

  const handleTechSkillToggle = (skill) => {
    const current = techFormik.values.skills;
    const skills = current.includes(skill) ? current.filter((s) => s !== skill) : [...current, skill];
    techFormik.setFieldValue("skills", skills);
  };

const downloadTechLog = async (tech) => {
  const techAtt = attendance.filter((a) => a.technicianId === tech.id);
  const techTasks = tasks.filter((t) => t.technicianName === tech.name);
  const techReports = dailyReports.filter((r) => r.technicianName === tech.name);

  const doc = await createProfilePdf({
    bannerName: tech.name,
    bannerSubtitle: `Technician ID: ${tech.id}`,
    bannerRight: [`Status: ${tech.status || "—"}`],
    sections: [
      {
        title: "Profile Details",
        fields: [
          ["Phone", tech.phone],
          ["Email", tech.email],
          // ["Skills", tech.skills.join(", ")], // hidden — not needed
          ["Experience", tech.experience],
          ["Join Date", tech.joinDate],
        ],
      },
      {
        title: "Summary",
        fields: [
          ["Attendance Records", techAtt.length],
          ["Tasks Assigned", techTasks.length],
          ["Daily Reports", techReports.length],
        ],
      },
    ],
  });

  doc.save(`Technician_Profile_${tech.name}.pdf`);

  success(`Technician profile downloaded for ${tech.name}`);
};

  // ─── LOCATION CRUD ───
  const openLocationModal = (loc = null, tech = null) => {
    setEditingLocation(loc);
    setLocationTechLocked(Boolean(loc || tech || isTechUser));
    locationFormik.setTouched({});
    if (loc) {
      locationFormik.setValues({
        technicianName: loc.technicianName, technicianId: loc.technicianId,
        latitude: loc.latitude != null ? String(loc.latitude) : "",
        longitude: loc.longitude != null ? String(loc.longitude) : "",
        lastUpdated: loc.lastUpdated,
      });
    } else if (tech) {
      locationFormik.setValues({
        technicianName: tech.name, technicianId: tech.id,
        latitude: "", longitude: "", lastUpdated: "",
      });
    } else if (isTechUser) {
      // Technicians add their own live location — pre-fill and lock the name.
      // Match the roster case-insensitively, then fall back to a stable ID
      // derived from the account name (their account may not exist in the
      // Technician roster at all).
      const me = technicians.find((t) => String(t.name || "").toLowerCase() === String(user?.name || "").toLowerCase());
      locationFormik.setValues({
        technicianName: user?.name || "",
        technicianId: me?.id || deriveTechnicianId(user?.name),
        latitude: "", longitude: "", lastUpdated: "",
      });
    } else {
      locationFormik.resetForm();
    }
    setShowLocationModal(true);
  };

  const handleLocationTechnicianChange = useCallback((val) => {
    locationFormik.setFieldValue("technicianName", val);
    const tech = technicians.find((t) => t.name === val);
    if (tech) locationFormik.setFieldValue("technicianId", tech.id);
  }, [technicians, locationFormik]);

  const handleLiveLocationFound = useCallback((coords) => {
    locationFormik.setFieldValue("latitude", coords.latitude != null ? String(coords.latitude) : "");
    locationFormik.setFieldValue("longitude", coords.longitude != null ? String(coords.longitude) : "");
  }, [locationFormik]);

  const geocodeTimerRef = useRef(null);
  useEffect(() => {
    const lat = String(locationFormik.values.latitude ?? "").trim();
    const lng = String(locationFormik.values.longitude ?? "").trim();
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    if (!showLocationModal || !lat || !lng) {
      setLiveAddress("");
      return;
    }
    geocodeTimerRef.current = setTimeout(async () => {
      setGeocoding(true);
      try {
        const data = await getAddressFromCoordinates(lat, lng);
        setLiveAddress(data?.display_name || "");
      } catch (err) {
        console.warn("Failed to resolve address:", err?.message);
        setLiveAddress("");
      } finally {
        setGeocoding(false);
      }
    }, 700);
    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [showLocationModal, locationFormik.values.latitude, locationFormik.values.longitude]);

  const resolvedAddressKeysRef = useRef(new Set());
  useEffect(() => {
    let cancelled = false;
    const queue = locations.filter((l) => l.latitude && l.longitude);
    (async () => {
      for (const loc of queue) {
        if (cancelled) return;
        const key = loc._id || loc.id || `${loc.latitude},${loc.longitude}`;
        if (resolvedAddressKeysRef.current.has(key)) continue;
        resolvedAddressKeysRef.current.add(key);
        try {
          const data = await getAddressFromCoordinates(loc.latitude, loc.longitude);
          if (!cancelled) {
            setLocationAddresses((prev) => ({ ...prev, [key]: data?.display_name || "Address unavailable" }));
          }
        } catch (err) {
          console.warn("Failed to resolve address:", err?.message);
          if (!cancelled) setLocationAddresses((prev) => ({ ...prev, [key]: "Address unavailable" }));
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    })();
    return () => { cancelled = true; };
  }, [locations]);

  // ─── REPORT CRUD ───
  const openReportModal = (report = null) => {
    setEditingReport(report);
    reportFormik.setTouched({});
    if (report) {
      reportFormik.setValues({
        technicianName: report.technicianName, date: report.date,
        assignedJob: report.assignedJob, workSummary: report.workSummary,
        hoursWorked: String(report.hoursWorked),
      });
    } else {
      reportFormik.resetForm();
    }
    setShowReportModal(true);
  };

  const handleReportTechnicianChange = useCallback((val) => {
    reportFormik.setFieldValue("technicianName", val);
    reportFormik.setFieldValue("assignedJob", "");
  }, [reportFormik]);

  // Customers / projects assigned to the technician selected in the report form
  // AND due on the report's selected date, pulled from the task assignments
  // (jobs) dataset — so the dropdown only shows that day's assigned jobs.
  const reportTechJobs = useMemo(() => {
    const name = reportFormik.values.technicianName;
    const date = reportFormik.values.date;
    if (!name) return [];
    return jobs.filter(
      (j) =>
        j.technicianName === name &&
        j.customerName &&
        j.jobTitle &&
        (!date || toDateInput(j.assignedDate) === date)
    );
  }, [jobs, reportFormik.values.technicianName, reportFormik.values.date]);

  const reportCustomerOptions = useMemo(() => {
    const seen = new Set();
    const opts = reportTechJobs
      .filter((j) => {
        const key = `${j.customerName} :: ${j.jobTitle}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((j) => ({ value: `${j.customerName} - ${j.jobTitle}`, label: `${j.customerName} - ${j.jobTitle}` }));
    // Keep the currently-edited job selectable even if it isn't on this day's list
    if (editingReport?.assignedJob && !opts.some((o) => o.value === editingReport.assignedJob)) {
      opts.unshift({ value: editingReport.assignedJob, label: editingReport.assignedJob });
    }
    return opts;
  }, [reportTechJobs, editingReport]);

  // ─── TASK CRUD ───
  const openTaskModal = (task = null) => {
    setEditingTask(task);
    taskFormik.setTouched({});
    if (task) {
      // The task model doesn't persist customer details — pull them from the
      // linked job (sourceAssignmentId points at the job that created this task,
      // or the job created from this task matches by jobTitle+technician).
      const linkedJob = task.sourceAssignmentId
        ? jobs.find((j) => j._id === task.sourceAssignmentId || j.id === task.sourceAssignmentId)
        : jobs.find((j) => j.sourceTaskId === task._id);
      taskFormik.setValues({
        technicianName: task.technicianName,
        taskName: task.taskName,
        status: task.status,
        customerName: linkedJob?.customerName || "",
        leadId: linkedJob?.leadId || "",
        installationId: linkedJob?.installationId || "",
      });
    } else {
      taskFormik.resetForm();
    }
    setShowTaskModal(true);
  };

  // The selected technician's customers (merged from leads, surveys, installations)
  const normalizeName = (s) => String(s || "").trim().toLowerCase();

  const taskCustomerOptions = useMemo(() => {
    const techName = taskFormik.values.technicianName;
    if (!techName) return [];
    const techKey = normalizeName(techName);
    const byName = new Map();
    const add = (rawName, leadId) => {
      const name = (rawName || "").trim();
      if (!name) return;
      const key = normalizeName(name);
      if (!byName.has(key)) byName.set(key, { name, leadId: leadId || "" });
      else if (!byName.get(key).leadId && leadId) byName.get(key).leadId = leadId;
    };
    leads.forEach((l) => {
      if (normalizeName(l.assigned) === techKey) add(l.name, l.leadId);
    });
    siteSurveys.forEach((s) => {
      if (normalizeName(s.technicianName) === techKey) add(s.customerName, s.leadId);
    });
    installations.forEach((i) => {
      if (normalizeName(i.technicianName) === techKey) add(i.customerName, i.leadId);
    });
    const opts = [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.name, label: c.name }));

    // Keep the currently-edited customer selectable even if it isn't in the lists
    const currentCustomer = taskFormik.values.customerName;
    if (currentCustomer && !opts.some((o) => o.value === currentCustomer)) {
      opts.unshift({ value: currentCustomer, label: currentCustomer });
    }
    return opts;
  }, [leads, siteSurveys, installations, taskFormik.values.technicianName, taskFormik.values.customerName]);

  // Auto-fill the Lead ID + Installation ID when a customer is picked.
  const handleTaskCustomerSelect = (customerName) => {
    taskFormik.setFieldValue("customerName", customerName);
    if (!customerName) {
      taskFormik.setFieldValue("leadId", "");
      taskFormik.setFieldValue("installationId", "");
      return;
    }
    const custKey = normalizeName(customerName);
    const techKey = normalizeName(taskFormik.values.technicianName);
    const installForTech = installations.find(
      (i) => i.installationId && normalizeName(i.technicianName) === techKey && normalizeName(i.customerName) === custKey
    );
    let lead =
      leads.find((l) => normalizeName(l.assigned) === techKey && normalizeName(l.name) === custKey) ||
      siteSurveys.find((s) => normalizeName(s.technicianName) === techKey && normalizeName(s.customerName) === custKey) ||
      installForTech ||
      undefined;
    const installation =
      installForTech ||
      installations.find((i) => i.installationId && normalizeName(i.customerName) === custKey) ||
      (lead?.leadId
        ? installations.find((i) => i.installationId && normalizeName(i.leadId) === normalizeName(lead.leadId))
        : undefined);
    taskFormik.setFieldValue("leadId", lead?.leadId || installation?.leadId || "");
    taskFormik.setFieldValue("installationId", installation?.installationId || "");
  };

  const handleTaskTechnicianChange = useCallback((val) => {
    const techChanged = val !== taskFormik.values.technicianName;
    taskFormik.setFieldValue("technicianName", val);
    if (techChanged) {
      taskFormik.setFieldValue("customerName", "");
      taskFormik.setFieldValue("leadId", "");
      taskFormik.setFieldValue("installationId", "");
    }
  }, [taskFormik]);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const confirmDelete = (type, target) => {
    setDeleteContext({ type, target });
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    const { type, target } = deleteContext;
    try {
      if (type === "technician") {
        if (target._id) {
          await technicianAPI.delete(target._id);
          setTechnicians((prev) => prev.filter((d) => d._id !== target._id));
          success(`Technician ${target.id} deleted successfully`);
        } else {
          setTechnicians((prev) => prev.filter((d) => d.id !== target.id));
          success(`Technician ${target.id} deleted`);
        }
      }
      else if (type === "job") { setJobs((prev) => prev.filter((d) => d.id !== target.id)); success(`Job ${target.id} deleted`); }
      else if (type === "attendance") { setAttendance((prev) => prev.filter((d) => d.id !== target.id)); success(`Attendance ${target.id} deleted`); }
      else if (type === "report") {
        if (target._id) {
          await dailyReportAPI.delete(target._id);
          setDailyReports((prev) => prev.filter((d) => d._id !== target._id));
          success(`Report ${target.id} deleted successfully`);
        } else {
          setDailyReports((prev) => prev.filter((d) => d.id !== target.id));
          success(`Report ${target.id} deleted`);
        }
      }
      else if (type === "task") {
        if (target._id) {
          await technicianTaskAPI.delete(target._id);
          setTasks((prev) => prev.filter((d) => d._id !== target._id));
          success(`Task ${target.id} deleted successfully`);
        } else {
          setTasks((prev) => prev.filter((d) => d.id !== target.id));
          success(`Task ${target.id} deleted`);
        }
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete item. Please try again.");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteContext({ type: "", target: null });
    }
  };

  // ─── PERFORMANCE REPORT ───

const downloadPerfReport = async (techName) => {
  const p = getTechPerformance(techName);
  if (!p) return;

  const doc = await createProfilePdf({
    bannerName: p.technicianName,
    bannerSubtitle: `Technician ID: ${p.technicianId}`,
    bannerRight: [`Attendance Rate: ${p.attendanceRate}%`],
    sections: [
      {
        title: "Attendance Summary",
        fields: [
          [
            "Days Present",
            `${p.attendancePresent % 1 === 0 ? p.attendancePresent : p.attendancePresent.toFixed(1)} / ${p.attendanceTotal}`,
          ],
        ],
      },
      {
        title: "Daily Reports",
        fields: [
          ["Total Reports", p.totalReports],
          ["Total Hours Worked", `${p.totalHours} h`],
          ["Avg Hours/Report", `${p.avgHours} h`],
        ],
      },
      {
        title: "Task Completion",
        fields: [
          ["Tasks Completed", `${p.taskCompleted} / ${p.taskTotal}`],
          ["Task Completion", `${p.taskRate}%`],
        ],
      },
    ],
  });

  doc.save(`Performance_Report_${techName.replace(/\s+/g, "_")}.pdf`);

  success(`Performance report downloaded for ${techName}`);
};

  const downloadTaskLog = async (t) => {
  const doc = await createProfilePdf({
    bannerName: t.taskName,
    bannerSubtitle: `Task ID: ${t.id}`,
    bannerRight: [`Status: ${t.status || "—"}`],
    sections: [
      {
        title: "Task Details",
        fields: [["Technician", t.technicianName]],
      },
    ],
  });

  doc.save(`TaskLog_${t.taskName}.pdf`);

  success(`Task log downloaded for ${t.taskName}`);
};

  const renderViewReport = (techName) => {
    const p = getTechPerformance(techName);
    if (!p) return null;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>Performance Report — {p.technicianName}</h3></div>
            <button className="vm-modal-close" onClick={() => setShowViewReport(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="tm-perf-grid">
              <div className="tm-perf-card"><span className="tm-perf-label">Attendance</span><span className="tm-perf-value">{p.attendanceRate}%</span></div>
              <div className="tm-perf-card tm-pc-blue"><span className="tm-perf-label">Reports</span><span className="tm-perf-value">{p.totalReports}</span></div>
              <div className="tm-perf-card tm-pc-purple"><span className="tm-perf-label">Hours</span><span className="tm-perf-value">{p.totalHours}h</span></div>
            </div>
            <div className="tm-perf-detail">
              <div className="tm-perf-bar-item">
                <span className="tm-perf-bar-label">Task Completion</span>
                <div className="tm-perf-bar-track"><div className="tm-perf-bar-fill" style={{ width: `${p.taskRate}%` }}></div></div>
                <span className="tm-perf-bar-value">{p.taskRate}%</span>
              </div>
              <div className="tm-perf-bar-item">
                <span className="tm-perf-bar-label">Attendance Rate</span>
                <div className="tm-perf-bar-track"><div className="tm-perf-bar-fill" style={{ width: `${p.attendanceRate}%` }}></div></div>
                <span className="tm-perf-bar-value">{p.attendanceRate}%</span>
              </div>
            </div>
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close" onClick={() => setShowViewReport(null)}>Close</button>
            {canDo("technicians", "export") && (
            <button className="vm-btn-primary" onClick={() => { downloadPerfReport(techName); }}>Download Report</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tm-page">
      {/* Page Header */}
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Technician Management</h1>
          <p className="tm-subtitle">Track technician locations, daily reports, task status, and performance metrics.</p>
        </div>
        <div className="tm-header-actions">
          {activeSection === "list" && canDo("technicians", "create") && (
            <button className="tm-btn tm-btn-primary" onClick={() => openTechModal(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
              Add Technician
            </button>
          )}
          {activeSection === "location" && canDo("technicians", "create") && (
            <button className="tm-btn tm-btn-primary" onClick={() => openLocationModal(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              Add Current Location
            </button>
          )}
          
          {activeSection === "reports" && canDo("technicians", "create") && (
            <button className="tm-btn tm-btn-primary" onClick={() => openReportModal(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Create Report
            </button>
          )}
          {activeSection === "tasks" && canDo("technicians", "create") && (
            <button className="tm-btn tm-btn-primary" onClick={() => openTaskModal(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Task
            </button>
          )}
        </div>
      </div>

      {/* Stats Row - above section tabs (hidden for technicians) */}
      {!isTechUser && (
      <div className="tech-stats-grid">
        <StatCard
          title="Total Technicians"
          value={technicians.length.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>}
          color="blue"
        />
        <StatCard
          title="Available"
          value={technicians.filter((t) => t.status === "Available").length.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Busy"
          value={technicians.filter((t) => t.status === "Busy").length.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="On Leave"
          value={technicians.filter((t) => t.status === "On Leave").length.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
          color="purple"
        />
      </div>
      )}

      {/* Section Tabs */}
      <div className="tm-section-tabs">
        {(isTechUser ? ["location"] : ["list", "location", "reports", "tasks", "overview", "performance"]).map((sec) => (
          <button key={sec} className={`tm-section-btn ${activeSection === sec ? "active" : ""}`} onClick={() => { setActiveSection(sec); }}>
            {sec === "list" && "Technician List"}
            {sec === "location" && "Live Location"}
            {sec === "reports" && "Daily Reports"}
            {sec === "tasks" && "Task Tracking"}
            {sec === "overview" && "Performance Overview"}
            {sec === "performance" && "Performance Reports"}
          </button>
        ))}
      </div>

      {/* ====== TECHNICIAN LIST SECTION ====== */}
      {activeSection === "list" && (
        <div className="tm-section">
          <div className="tm-toolbar">
            <div className="tm-toolbar-row">
              <div className="tm-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={techSearch} onChange={(e) => { setTechSearch(e.target.value); setTechPage(1); }} placeholder="Search by name, ID, phone, or email" />
                {techSearch && (
                  <button className="tm-search-clear" onClick={() => { setTechSearch(""); setTechPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={techStatusFilter} onChange={(val) => { setTechStatusFilter(val); setTechPage(1); }} options={[{ value: "All", label: "All Status" }, ...TECH_STATUS.map((s) => ({ value: s, label: s }))]} />
              {/* Skills filter hidden — not needed
              <Dropdown value={techSkillFilter} onChange={(val) => { setTechSkillFilter(val); setTechPage(1); }} options={[{ value: "All", label: "All Skills" }, ...TECH_SKILLS.map((s) => ({ value: s, label: s }))]} />
              */}
              <Dropdown value={techExpFilter} onChange={(val) => { setTechExpFilter(val); setTechPage(1); }} options={[{ value: "All", label: "All Experience" }, ...TECH_EXPERIENCE.map((e) => ({ value: e, label: e }))]} />
            </div>
          </div>

          <div className="tm-table-card">
            <div className="tm-table-wrapper">
              <table className="tm-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Technician</th><th>Phone</th><th>Email</th>{/* Skills */}<th>Experience</th><th>Status</th><th>Join Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {techListLoading ? (
                    <TableLoader colSpan={9} />
                  ) : techList.length === 0 ? (
                    <tr><td colSpan="9" className="tm-empty"><div className="tm-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg><p>No technicians found</p><span>Try adjusting search or filters.</span></div></td></tr>
                  ) : (
                      techList.map((t) => {
                        const initials = (t.name || "").split(" ").map((n) => n[0]).join("");
                        return (
                          <tr key={t.id}>
                            <td className="tm-td-id">{t.id}</td>
                            <td className="tm-td-name">
                              <div
                                className="tm-tech-name-cell"
                                onClick={() => openTechDetailsPage(t)}
                                title="View all data — tasks, attendance, reports, schedule"
                              >
                                <div className="tm-tech-avatar">{initials}</div>
                                <span>{t.name}</span>
                              </div>
                            </td>
                            <td>{t.phone}</td>
                            <td>{t.email}</td>
                            {/* Skills cell hidden */}
                            <td>{t.experience}</td>
                            <td><span className={`tm-status-badge ${t.status === "Available" ? "tm-status-done" : t.status === "Busy" ? "tm-status-progress" : t.status === "On Leave" ? "tm-status-pending" : "tm-status-inactive"}`}>{t.status}</span></td>
                            <td>{t.joinDate}</td>
                            <td>
                              <div className="act-actions">
                                <button className="act-btn act-view" onClick={() => setShowViewTech(t)} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                                {canDo("technicians", "edit") && (
                                <button className="act-btn act-edit" onClick={() => openTechModal(t)} title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                                )}
                                {canDo("technicians", "delete") && (
                                <button className="act-btn act-delete" onClick={() => confirmDelete("technician", t)} title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
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
            {techList.length > 0 && (
              <div className="tm-pagination-row">
                <Pagination currentPage={techPage} totalPages={Math.max(1, Math.ceil(techServerTotal / techPageSize))} totalItems={techServerTotal} pageSize={techPageSize} onPageChange={setTechPage} onPageSizeChange={(val) => { setTechPageSize(Number(val)); setTechPage(1); }} pageSizeOptions={PAGE_SIZES} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== OVERVIEW SECTION ====== */}
      {activeSection === "overview" && (
        <div className="tm-section">
          <div className="tm-table-card">
            <div className="tm-table-card-header">
              <h4>Performance Overview</h4>
            </div>
            <div className="tm-table-wrapper">
              <table className="tm-table">
                <thead>
                  <tr>
                    <th>Technician Name</th><th>Technician ID</th><th>Attendance Status</th><th>Current Location</th><th>Task Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {technicians.slice((overviewPage - 1) * overviewPageSize, overviewPage * overviewPageSize).map((tech) => {
                    const loc = locations.find((l) => l.technicianId === tech.id);
                    const todaysAtt = attendance.find((a) => a.technicianName === tech.name && a.date === toDateInput(new Date()));
                    const techTasksFiltered = tasks.filter((t) => t.technicianName === tech.name);
                    const tasksDone = techTasksFiltered.filter((t) => t.status === "Completed").length;
                    const tasksInProgress = techTasksFiltered.filter((t) => t.status === "In Progress").length;
                    return (
                      <tr key={tech.id}>
                        <td className="tm-td-name">{tech.name}</td>
                        <td className="tm-td-id">{tech.id}</td>
                        <td><span className={`tm-att-badge ${todaysAtt ? getAttStatusClass(todaysAtt.status) : "tm-att-absent"}`}>{todaysAtt ? todaysAtt.status : "Not Marked"}</span></td>
                        <td className="tm-td-loc">{loc ? `${loc.latitude}, ${loc.longitude}` : "—"}</td>
                        <td><span className={`tm-status-badge ${tasksDone === techTasksFiltered.length && techTasksFiltered.length > 0 ? "tm-status-done" : tasksInProgress > 0 ? "tm-status-progress" : "tm-status-pending"}`}>{tasksDone}/{techTasksFiltered.length}</span></td>
                        <td><div className="act-actions"><button type="button" className="act-btn act-view" onClick={() => setShowViewReport(tech.name)} title="View Report"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>{canDo("technicians", "export") && (<button type="button" className="act-btn act-log" onClick={() => downloadPerfReport(tech.name)} title="Download"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {technicians.length > 0 && (
              <div className="tm-pagination-row">
                <Pagination currentPage={overviewPage} totalPages={Math.max(1, Math.ceil(technicians.length / overviewPageSize))} totalItems={technicians.length} pageSize={overviewPageSize} onPageChange={setOverviewPage} onPageSizeChange={(val) => { setOverviewPageSize(Number(val)); setOverviewPage(1); }} pageSizeOptions={PAGE_SIZES} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== LOCATION SECTION ====== */}
      {activeSection === "location" && (
        <div className="tm-section">
          <div className="tm-toolbar">
          </div>
          <div className="tm-location-grid">
            {(isTechUser
              ? (() => {
                  // Technicians see exactly one card: their own. Built from the
                  // roster when the name matches, otherwise from their location
                  // records / a stable derived ID — so the card always appears.
                  const me = technicians.find((t) => String(t.name || "").toLowerCase() === String(user?.name || "").toLowerCase());
                  const myLocs = locations.filter((l) => String(l.technicianName || "").toLowerCase() === String(user?.name || "").toLowerCase());
                  return [{ id: me?.id || myLocs[0]?.technicianId || deriveTechnicianId(user?.name), name: user?.name || "Me" }];
                })()
              : technicians).map((tech) => {
              const loc = isTechUser
                ? locations.find((l) => String(l.technicianName || "").toLowerCase() === String(user?.name || "").toLowerCase())
                : locations.find((l) => l.technicianId === tech.id);
              const isRecent = loc && Date.now() - new Date(loc.lastUpdated).getTime() < 3600000;
              const addressKey = loc ? loc._id || loc.id || `${loc.latitude},${loc.longitude}` : "";
              const address = addressKey ? locationAddresses[addressKey] : "";
              return (
                <div key={tech.id} className={`tm-loc-card ${isRecent ? "online" : "offline"}`}>
                  <div className={`tm-loc-status-bar ${isRecent ? "online" : "offline"}`}></div>
                  <div className="tm-loc-content">
                    <div className="tm-loc-header">
                      <div className="tm-loc-avatar">{((tech.name || "")[0] || "")}{(tech.name || "").split(" ")[1]?.charAt(0)}</div>
                      <div className="tm-loc-info">
                        <h4>{tech.name}</h4>
                        <span>{tech.id}</span>
                      </div>
                      <div className="tm-loc-status-wrap">
                        <span className={`tm-loc-pulse ${isRecent ? "live" : ""}`}></span>
                        <span className={`tm-loc-badge ${isRecent ? "online" : "offline"}`}>
                          {isRecent ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>
                    {loc ? (
                      <div className="tm-loc-coords">
                        <div className="tm-loc-row">
                          <div className="tm-loc-icon-wrap lat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          </div>
                          <div className="tm-loc-detail tm-loc-address">
                            <span className="tm-loc-label">Address</span>
                            <span className="tm-loc-value">{address || "Resolving..."}</span>
                          </div>
                        </div>
                        <div className="tm-loc-row">
                          <div className="tm-loc-icon-wrap time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          </div>
                          <div className="tm-loc-detail">
                            <span className="tm-loc-label">Last Updated</span>
                            <span className="tm-loc-value">{loc.lastUpdated}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="tm-loc-empty">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>No location recorded</span>
                      </div>
                    )}
                    <div className="tm-loc-footer">
                      {canDo("technicians", "edit") && (
                      <button className="tm-loc-btn" onClick={() => openLocationModal(loc, tech)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Update Location
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====== DAILY REPORTS SECTION ====== */}
      {activeSection === "reports" && (
        <div className="tm-section">
          <div className="tm-toolbar">
            <div className="tm-toolbar-row">
              <div className="tm-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={reportSearch} onChange={(e) => { setReportSearch(e.target.value); setReportPage(1); }} placeholder="Search reports" />
                {reportSearch && (
                  <button className="tm-search-clear" onClick={() => { setReportSearch(""); setReportPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={technicianFilter} onChange={(val) => { setTechnicianFilter(val); }} options={[{ value: "All", label: "All Technicians" }, ...technicians.map((t) => ({ value: t.name, label: t.name }))]} />
              <input type="date" className="tm-filter-date-inline" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
              <input type="date" className="tm-filter-date-inline" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
            </div>
          </div>
          <div className="tm-report-grid">
            {(() => {
              const q = reportSearch.toLowerCase();
              const filtered = dailyReports.filter((r) => {
                const matchSearch = !q || (r.technicianName || "").toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q) || (r.assignedJob || "").toLowerCase().includes(q);
                const matchTech = technicianFilter === "All" || r.technicianName === technicianFilter;
                const matchDate = (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo);
                return matchSearch && matchTech && matchDate;
              });
              const reportTotalPages = Math.max(1, Math.ceil(filtered.length / reportPageSize));
              if (reportPage > reportTotalPages) setReportPage(reportTotalPages);
              const paginated = filtered.slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize);
              return filtered.length === 0 ? (
                <div className="tm-empty-state" style={{ gridColumn: "1/-1", padding: 48 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg><p>No reports found</p></div>
              ) : (
                paginated.map((r) => (
                  <div key={r.id} className="tm-report-card">
                    <div className="tm-report-meta-row">
                      <span className="tm-report-tech">{r.technicianName}</span>
                      <span className="tm-report-customer">{getReportCustomer(r, jobs)}</span>
                    </div>
                    <div className="tm-report-meta-row">
                      <span className="tm-report-date">{r.date}</span>
                      <span className="tm-report-hours">{r.hoursWorked}h</span>
                    </div>
                    <div className="tm-report-job">{r.assignedJob}</div>
                    <p className="tm-report-summary">{r.workSummary}</p>
                    <div className="tm-report-actions">
                      {canDo("technicians", "edit") && (
                      <button className="tm-link-btn" onClick={() => openReportModal(r)}>Edit</button>
                      )}
                      {canDo("technicians", "delete") && (
                      <button className="tm-link-btn tm-link-danger" onClick={() => confirmDelete("report", r)}>Delete</button>
                      )}
                    </div>
                  </div>
                ))
              );
            })()}
          </div>
          {(() => {
            const q = reportSearch.toLowerCase();
            const filtered = dailyReports.filter((r) => {
              const matchSearch = !q || (r.technicianName || "").toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q) || (r.assignedJob || "").toLowerCase().includes(q);
              const matchTech = technicianFilter === "All" || r.technicianName === technicianFilter;
              const matchDate = (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo);
              return matchSearch && matchTech && matchDate;
            });
            return filtered.length > 0 && (
              <div className="tm-pagination-row">
                <Pagination currentPage={reportPage} totalPages={Math.max(1, Math.ceil(filtered.length / reportPageSize))} totalItems={filtered.length} pageSize={reportPageSize} onPageChange={setReportPage} onPageSizeChange={(val) => { setReportPageSize(Number(val)); setReportPage(1); }} pageSizeOptions={PAGE_SIZES} />
              </div>
            );
          })()}
        </div>
      )}

      {/* ====== TASK TRACKING SECTION ====== */}
      {activeSection === "tasks" && (
        <div className="tm-section">
          <div className="tm-toolbar">
            <div className="tm-toolbar-row">
              <div className="tm-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={taskSearch} onChange={(e) => { setTaskSearch(e.target.value); setTaskPage(1); }} placeholder="Search tasks" />
                {taskSearch && (
                  <button className="tm-search-clear" onClick={() => { setTaskSearch(""); setTaskPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={technicianFilter} onChange={(val) => { setTechnicianFilter(val); setTaskPage(1); }} options={[{ value: "All", label: "All Technicians" }, ...technicians.map((t) => ({ value: t.name, label: t.name }))]} />
            </div>
          </div>
          <div className="tm-table-card">
            <div className="tm-table-wrapper">
              <table className="tm-table">
                <thead><tr><th>Task ID</th><th>Technician Name</th><th>Task Name</th><th>Completion Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {(() => {
                    const q = taskSearch.toLowerCase();
                    const filtered = tasks.filter((t) => {
                      const matchSearch = !q || (t.technicianName || "").toLowerCase().includes(q) || (t.taskName || "").toLowerCase().includes(q) || (t.id || "").toLowerCase().includes(q);
                      const matchTech = technicianFilter === "All" || t.technicianName === technicianFilter;
                      return matchSearch && matchTech;
                    });
                    return filtered.length === 0 ? (
                      <tr><td colSpan="5" className="tm-empty"><div className="tm-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg><p>No tasks found</p></div></td></tr>
                    ) : (
                      filtered.slice((taskPage - 1) * taskPageSize, taskPage * taskPageSize).map((t) => (
                        <tr key={t.id}>
                          <td className="tm-td-id">{t.id}</td>
                          <td className="tm-td-name">{t.technicianName}</td>
                          <td>{t.taskName}</td>
                          <td><span className={`tm-status-badge ${getTaskStatusClass(t.status)}`}>{t.status}</span></td>
                          <td>
                            <div className="act-actions">
                              <button className="act-btn act-view" onClick={() => openTaskModal(t)} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                              {canDo("technicians", "edit") && (
                              <button className="act-btn act-edit" onClick={() => openTaskModal(t)} title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                              )}
                              {canDo("technicians", "delete") && (
                              <button className="act-btn act-delete" onClick={() => confirmDelete("task", t)} title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
                              )}
                              {canDo("technicians", "export") && (
                              <button type="button" className="act-btn act-log" onClick={() => setShowLogModal(t)} title="Download Log"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    );
                  })()}
                </tbody>
              </table>
            </div>
            {(() => {
              const q = taskSearch.toLowerCase();
              const filtered = tasks.filter((t) => {
                const matchSearch = !q || (t.technicianName || "").toLowerCase().includes(q) || (t.taskName || "").toLowerCase().includes(q) || (t.id || "").toLowerCase().includes(q);
                const matchTech = technicianFilter === "All" || t.technicianName === technicianFilter;
                return matchSearch && matchTech;
              });
              return filtered.length > 0 && (
                <div className="tm-pagination-row">
                  <Pagination currentPage={taskPage} totalPages={Math.max(1, Math.ceil(filtered.length / taskPageSize))} totalItems={filtered.length} pageSize={taskPageSize} onPageChange={setTaskPage} onPageSizeChange={(val) => { setTaskPageSize(Number(val)); setTaskPage(1); }} pageSizeOptions={PAGE_SIZES} />
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ====== PERFORMANCE SECTION ====== */}
      {activeSection === "performance" && (
        <div className="tm-section">
          <div className="tm-perf-table-card">
            <div className="tm-table-card-header"><h4>Technician Performance Reports</h4></div>
            <div className="tm-table-wrapper">
              <table className="tm-table">
                <thead>
                  <tr><th>Technician Name</th><th>Technician ID</th><th>Attendance</th><th>Reports</th><th>Tasks Done</th><th>Task Rate</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {perfReports.slice((perfPage - 1) * perfPageSize, perfPage * perfPageSize).map((p) => (
                    <tr key={p.technicianId}>
                      <td className="tm-td-name">{p.technicianName}</td>
                      <td className="tm-td-id">{p.technicianId}</td>
                      <td>{p.attendanceRate}%</td>
                      <td>{p.totalReports}</td>
                      <td>{p.taskCompleted}/{p.taskTotal}</td>
                      <td><div className="tm-mini-bar"><div className="tm-mini-fill" style={{ width: `${p.taskRate}%` }}></div></div></td>
                      <td>
                        <div className="act-actions">
                          <button className="act-btn act-view" onClick={() => setShowViewReport(p.technicianName)} title="View Report"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                          {canDo("technicians", "export") && (
                          <button className="act-btn act-log" onClick={() => downloadPerfReport(p.technicianName)} title="Download Log"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {perfReports.length > 0 && (
              <div className="tm-pagination-row">
                <Pagination currentPage={perfPage} totalPages={Math.max(1, Math.ceil(perfReports.length / perfPageSize))} totalItems={perfReports.length} pageSize={perfPageSize} onPageChange={setPerfPage} onPageSizeChange={(val) => { setPerfPageSize(Number(val)); setPerfPage(1); }} pageSizeOptions={PAGE_SIZES} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== TECHNICIAN LIST MODALS ====== */}

      {/* Add/Edit Technician Modal */}
      {showTechModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal">
            <div className="tm-modal-header">
              <h3>{editingTech ? `Edit Technician — ${editingTech.id}` : "Add New Technician"}</h3>
              <button className="tm-modal-close" onClick={() => setShowTechModal(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <form onSubmit={techFormik.handleSubmit} className="tm-modal-body" id="techForm" noValidate>
              <div className="tm-form-grid">
                <div className="tm-form-field">
                  <label>Full Name <span className="tm-req">*</span></label>
                  <input type="text" name="name" value={techFormik.values.name} onChange={techFormik.handleChange} onBlur={techFormik.handleBlur} maxLength={50} placeholder="e.g. Rahul Mehta" className={techFormik.errors.name && techFormik.touched.name ? "tm-input-error" : ""} />
                  {techFormik.errors.name && techFormik.touched.name && <span className="tm-field-error">{techFormik.errors.name}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Phone Number <span className="tm-req">*</span></label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input type="text" name="phone" value={techFormik.values.phone} onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      techFormik.setFieldValue("phone", val);
                    }} onBlur={techFormik.handleBlur} maxLength={10} placeholder="98765 43210" className={techFormik.errors.phone && techFormik.touched.phone ? "tm-input-error" : ""} />
                  </div>
                  {techFormik.errors.phone && techFormik.touched.phone && <span className="tm-field-error">{techFormik.errors.phone}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Email <span className="tm-req">*</span></label>
                  <input type="email" name="email" value={techFormik.values.email} onChange={techFormik.handleChange} onBlur={techFormik.handleBlur} maxLength={100} placeholder="e.g. rahul@solarspms.com" className={techFormik.errors.email && techFormik.touched.email ? "tm-input-error" : ""} />
                  {techFormik.errors.email && techFormik.touched.email && <span className="tm-field-error">{techFormik.errors.email}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Experience <span className="tm-req">*</span></label>
                  <Dropdown value={techFormik.values.experience} onChange={(val) => techFormik.setFieldValue("experience", val)} options={[{ value: "", label: "Select Experience" }, ...TECH_EXPERIENCE.map((e) => ({ value: e, label: e }))]} variant="form" />
                  {techFormik.errors.experience && techFormik.touched.experience && <span className="tm-field-error">{techFormik.errors.experience}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Status</label>
                  <Dropdown value={techFormik.values.status} onChange={(val) => techFormik.setFieldValue("status", val)} options={TECH_STATUS.map((s) => ({ value: s, label: s }))} variant="form" />
                </div>
                <div className="tm-form-field">
                  <label>Join Date <span className="tm-req">*</span></label>
                  <input type="date" name="joinDate" value={techFormik.values.joinDate} onChange={techFormik.handleChange} onBlur={techFormik.handleBlur} min={editingTech ? undefined : today} />
                  {techFormik.errors.joinDate && techFormik.touched.joinDate && <span className="tm-field-error">{techFormik.errors.joinDate}</span>}
                </div>
                {/* Skills form field hidden — not needed
                <div className="tm-form-field tm-full-width">
                  <label>Skills <span className="tm-req">*</span></label>
                  <div className="tm-skill-checkboxes">
                    {TECH_SKILLS.map((skill) => (
                      <label key={skill} className={`tm-skill-checkbox ${techFormik.values.skills.includes(skill) ? "checked" : ""}`}>
                        <input type="checkbox" checked={techFormik.values.skills.includes(skill)} onChange={() => handleTechSkillToggle(skill)} />
                        <span>{skill}</span>
                      </label>
                    ))}
                  </div>
                  {techFormik.errors.skills && techFormik.touched.skills && <span className="tm-field-error">{techFormik.errors.skills}</span>}
                </div>
                */}
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowTechModal(false)}>Cancel</button>
              <button type="submit" form="techForm" className="tm-btn tm-btn-primary" disabled={loading}>{loading ? <><span className="tm-spinner"></span> Saving...</> : editingTech ? "Update Technician" : "Add Technician"}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Technician Modal */}
      {showViewTech && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Technician Profile — {showViewTech.id}</h3></div>
              <button className="vm-modal-close" onClick={() => setShowViewTech(null)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <div className="vm-view-body">
              <div className="tm-tech-profile-header">
                <div className="tm-tech-avatar-lg">{(showViewTech.name || "").split(" ").map((n) => n[0]).join("")}</div>
                <div className="tm-tech-profile-info">
                  <h3>{showViewTech.name}</h3>
                  <span className="tm-td-id">{showViewTech.id}</span>
                  <span className={`tm-status-badge ${showViewTech.status === "Available" ? "tm-status-done" : showViewTech.status === "Busy" ? "tm-status-progress" : showViewTech.status === "On Leave" ? "tm-status-pending" : "tm-status-inactive"}`}>{showViewTech.status}</span>
                </div>
              </div>
              <div className="tm-tech-detail-grid">
                <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Phone</span><span>{showViewTech.phone}</span></div>
                <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Email</span><span>{showViewTech.email}</span></div>
                <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Experience</span><span>{showViewTech.experience}</span></div>
                <div className="tm-tech-detail-item"><span className="tm-tech-detail-label">Join Date</span><span>{showViewTech.joinDate}</span></div>
              </div>
              {/* Skills section hidden — not needed
              <div className="tm-tech-detail-item" style={{ flexDirection: "column", gap: 8 }}>
                <span className="tm-tech-detail-label">Skills</span>
                <div className="tm-skill-tags">{showViewTech.skills.map((s) => <span key={s} className="tm-skill-tag">{s}</span>)}</div>
              </div>
              */}
              <div className="tm-tech-perf-summary">
                <h4>Performance Summary</h4>
                <div className="tm-perf-grid">
                  {(() => { const p = getTechPerformance(showViewTech.name); return p ? (
                    <>
                      <div className="tm-perf-card"><span className="tm-perf-label">Attendance</span><span className="tm-perf-value">{p.attendanceRate}%</span></div>
                      <div className="tm-perf-card tm-pc-blue"><span className="tm-perf-label">Reports</span><span className="tm-perf-value">{p.totalReports}</span></div>
                      <div className="tm-perf-card tm-pc-purple"><span className="tm-perf-label">Task Rate</span><span className="tm-perf-value">{p.taskRate}%</span></div>
                    </>
                  ) : <p style={{ color: "#9ca3af", gridColumn: "1/-1" }}>No performance data available.</p>; })()}
                </div>
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close-primary" onClick={() => setShowViewTech(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Technician History Modal */}
      {showTechHistory && (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Activity History — {showTechHistory.name}</h3></div>
              <button className="vm-modal-close" onClick={() => setShowTechHistory(null)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <div className="vm-view-body">
              <div className="tm-history-section">
                <h4>Assigned Jobs</h4>
                {jobs.filter((j) => j.technicianId === showTechHistory.id).length === 0 ? <p className="tm-history-empty">No jobs assigned yet.</p> : (
                  <div className="tm-history-list">
                    {jobs.filter((j) => j.technicianId === showTechHistory.id).map((j) => (
                      <div key={j.id} className="tm-history-item">
                        <div className="tm-history-item-header"><span className="tm-td-id">{j.id}</span><span className={`tm-status-badge ${j.status === "Completed" ? "tm-status-done" : j.status === "In Progress" ? "tm-status-progress" : "tm-status-pending"}`}>{j.status}</span></div>
                        <p className="tm-history-item-title">{j.jobTitle}</p>
                        <span className="tm-history-item-date">{j.assignedDate} — {j.dueDate}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="tm-history-section">
                <h4>Attendance Records</h4>
                {attendance.filter((a) => a.technicianId === showTechHistory.id).length === 0 ? <p className="tm-history-empty">No attendance records.</p> : (
                  <div className="tm-history-list">
                    {attendance.filter((a) => a.technicianId === showTechHistory.id).map((a) => (
                      <div key={a.id} className="tm-history-item">
                        <div className="tm-history-item-header"><span className="tm-td-id">{a.id}</span><span className={`tm-att-badge ${getAttStatusClass(a.status)}`}>{a.status}</span></div>
                        <span className="tm-history-item-date">{a.date} | {a.checkIn || "—"} - {a.checkOut || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="tm-history-section">
                <h4>Daily Reports</h4>
                {dailyReports.filter((r) => r.technicianName === showTechHistory.name).length === 0 ? <p className="tm-history-empty">No reports submitted.</p> : (
                  <div className="tm-history-list">
                    {dailyReports.filter((r) => r.technicianName === showTechHistory.name).map((r) => (
                      <div key={r.id} className="tm-history-item">
                        <div className="tm-history-item-header"><span className="tm-td-id">{r.id}</span><span className="tm-history-item-date">{r.date}</span></div>
                        <p className="tm-history-item-title">{r.workSummary}</p>
                        <span className="tm-history-item-date">{r.hoursWorked}h worked</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close" onClick={() => setShowTechHistory(null)}>Close</button>
              <button className="vm-btn-primary" onClick={() => downloadTechLog(showTechHistory)}>Download Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODALS ====== */}
      {showLocationModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal tm-form-sm">
            <div className="tm-modal-header">
              <h3>{editingLocation ? "Update Location" : "Save Current Location"}</h3>
              <button className="tm-modal-close" onClick={() => setShowLocationModal(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <form onSubmit={locationFormik.handleSubmit} className="tm-modal-body" id="locationForm" noValidate>
              <div className="tm-location-map">
                <SolarMap
                  onLocationFound={handleLiveLocationFound}
                  height={260}
                  showCoords={false}
                  initialPosition={editingLocation && editingLocation.latitude != null && editingLocation.longitude != null
                    ? { latitude: editingLocation.latitude, longitude: editingLocation.longitude }
                    : null}
                />
                <span className={`tm-location-map-hint ${locationFormik.values.latitude && locationFormik.values.longitude ? "found" : ""}`}>
                  {locationFormik.values.latitude && locationFormik.values.longitude
                    ? "Location ready — verify the coordinates below and save."
                    : "Detecting your current location..."}
                </span>
                <div className={`tm-address-box ${liveAddress ? "has-address" : ""}`}>
                  <span className="tm-address-label">Address</span>
                  <span className="tm-address-value">
                    {geocoding ? "Resolving address..." : liveAddress || "—"}
                  </span>
                </div>
              </div>
              <div className="tm-form-grid">
                <div className="tm-form-field tm-full-width">
                  <label>Technician <span className="tm-req">*</span></label>
                  {locationTechLocked && locationFormik.values.technicianName ? (
                    <input
                      type="text"
                      name="technicianName"
                      value={locationFormik.values.technicianName}
                      disabled
                      title="Technician is taken from the selected card and cannot be changed"
                    />
                  ) : (
                    <Dropdown value={locationFormik.values.technicianName} onChange={handleLocationTechnicianChange} options={[{ value: "", label: "Select Technician" }, ...technicians.map((t) => ({ value: t.name, label: t.name }))]} variant="form" />
                  )}
                  {locationFormik.errors.technicianName && locationFormik.touched.technicianName && <span className="tm-field-error">{locationFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Latitude <span className="tm-req">*</span></label>
                  <input type="text" name="latitude" value={locationFormik.values.latitude} onChange={locationFormik.handleChange} onBlur={locationFormik.handleBlur} placeholder="e.g. 18.5204" />
                  {locationFormik.errors.latitude && locationFormik.touched.latitude && <span className="tm-field-error">{locationFormik.errors.latitude}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Longitude <span className="tm-req">*</span></label>
                  <input type="text" name="longitude" value={locationFormik.values.longitude} onChange={locationFormik.handleChange} onBlur={locationFormik.handleBlur} placeholder="e.g. 73.8567" />
                  {locationFormik.errors.longitude && locationFormik.touched.longitude && <span className="tm-field-error">{locationFormik.errors.longitude}</span>}
                </div>
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowLocationModal(false)}>Cancel</button>
              <button type="submit" form="locationForm" className="tm-btn tm-btn-primary">Save Location</button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal tm-form-sm">
            <div className="tm-modal-header">
              <h3>{editingReport ? `Edit Report ${editingReport.id}` : "Create Daily Work Report"}</h3>
              <button className="tm-modal-close" onClick={() => setShowReportModal(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <form onSubmit={reportFormik.handleSubmit} className="tm-modal-body" id="reportForm" noValidate>
              <div className="tm-form-grid">
                <div className="tm-form-field">
                  <label>Technician <span className="tm-req">*</span></label>
                  <Dropdown value={reportFormik.values.technicianName} onChange={handleReportTechnicianChange} options={[{ value: "", label: "Select Technician" }, ...technicians.map((t) => ({ value: t.name, label: t.name }))]} variant="form" />
                  {reportFormik.errors.technicianName && reportFormik.touched.technicianName && <span className="tm-field-error">{reportFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Date <span className="tm-req">*</span></label>
                  <input
                    type="date"
                    name="date"
                    value={reportFormik.values.date}
                    onChange={(e) => {
                      reportFormik.setFieldValue("date", e.target.value);
                      // The job list depends on the date — clear a previously
                      // chosen job when the day changes
                      reportFormik.setFieldValue("assignedJob", "");
                    }}
                    onBlur={reportFormik.handleBlur}
                    min={today}
                  />
                  {reportFormik.errors.date && reportFormik.touched.date && <span className="tm-field-error">{reportFormik.errors.date}</span>}
                </div>
                <div className="tm-form-field">
                  <label>Assigned Job</label>
                  <Dropdown
                    value={reportFormik.values.assignedJob}
                    onChange={(val) => reportFormik.setFieldValue("assignedJob", val)}
                    options={reportCustomerOptions}
                    variant="form"
                    disabled={!reportFormik.values.technicianName}
                    placeholder={reportFormik.values.technicianName ? "Select that day's assigned job" : "Select a technician first"}
                    emptyMessage={
                      reportFormik.values.technicianName
                        ? "No jobs assigned to this technician on this date"
                        : "Select a technician first"
                    }
                  />
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>Shows the jobs assigned to this technician for the selected date</span>
                </div>
                <div className="tm-form-field">
                  <label>Hours Worked <span className="tm-req">*</span></label>
                  <input type="text" name="hoursWorked" value={reportFormik.values.hoursWorked} onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9.]/g, "");
                    const firstDot = val.indexOf(".");
                    if (firstDot !== -1) {
                      val = val.slice(0, firstDot + 1) + val.slice(firstDot + 1).replace(/\./g, "");
                    }
                    reportFormik.setFieldValue("hoursWorked", val);
                  }} onBlur={reportFormik.handleBlur} placeholder="e.g. 8.5" maxLength={5} />
                  {reportFormik.errors.hoursWorked && reportFormik.touched.hoursWorked && <span className="tm-field-error">{reportFormik.errors.hoursWorked}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Work Summary <span className="tm-req">*</span></label>
                  <textarea name="workSummary" value={reportFormik.values.workSummary} onChange={reportFormik.handleChange} onBlur={reportFormik.handleBlur} placeholder="Describe the work done today" rows={3} maxLength={500} />
                  {reportFormik.errors.workSummary && reportFormik.touched.workSummary && <span className="tm-field-error">{reportFormik.errors.workSummary}</span>}
                </div>
              
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowReportModal(false)}>Cancel</button>
              <button type="submit" form="reportForm" className="tm-btn tm-btn-primary" disabled={loading}>{loading ? <><span className="tm-spinner"></span> Saving...</> : editingReport ? "Update Report" : "Create Report"}</button>
            </div>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="tm-overlay">
          <div className="tm-form-modal tm-form-sm">
            <div className="tm-modal-header">
              <h3>{editingTask ? `Edit Task ${editingTask.id}` : "Add New Task"}</h3>
              <button className="tm-modal-close" onClick={() => setShowTaskModal(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
            </div>
            <form onSubmit={taskFormik.handleSubmit} className="tm-modal-body" id="taskForm" noValidate>
              <div className="tm-form-grid">
                <div className="tm-form-field tm-full-width">
                  <label>Technician <span className="tm-req">*</span></label>
                  <Dropdown value={taskFormik.values.technicianName} onChange={handleTaskTechnicianChange} options={[{ value: "", label: "Select Technician" }, ...technicians.map((t) => ({ value: t.name, label: t.name }))]} variant="form" />
                  {taskFormik.errors.technicianName && taskFormik.touched.technicianName && <span className="tm-field-error">{taskFormik.errors.technicianName}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Task Name <span className="tm-req">*</span></label>
                  <input type="text" name="taskName" value={taskFormik.values.taskName} onChange={taskFormik.handleChange} onBlur={taskFormik.handleBlur} placeholder="e.g. Install 5kW inverter" />
                  {taskFormik.errors.taskName && taskFormik.touched.taskName && <span className="tm-field-error">{taskFormik.errors.taskName}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Customer <span className="tm-req">*</span></label>
                  <Dropdown
                    value={taskFormik.values.customerName}
                    onChange={handleTaskCustomerSelect}
                    options={[{ value: "", label: "Select Customer" }, ...taskCustomerOptions]}
                    placeholder="Select Customer"
                    variant="form"
                    disabled={!taskFormik.values.technicianName}
                    emptyMessage="No customers assigned to this technician"
                  />
                  {taskFormik.errors.customerName && taskFormik.touched.customerName && <span className="tm-field-error">{taskFormik.errors.customerName}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Lead ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="leadId"
                    value={taskFormik.values.leadId}
                    onChange={taskFormik.handleChange}
                    onBlur={taskFormik.handleBlur}
                    placeholder="Auto-filled from selected customer"
                    readOnly
                    title="Auto-filled from the selected customer"
                    className="tm-input-readonly"
                  />
                  {taskFormik.errors.leadId && taskFormik.touched.leadId && <span className="tm-field-error">{taskFormik.errors.leadId}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Installation ID <span className="tm-req">*</span></label>
                  <input
                    type="text"
                    name="installationId"
                    value={taskFormik.values.installationId}
                    onChange={taskFormik.handleChange}
                    onBlur={taskFormik.handleBlur}
                    placeholder="Auto-filled from selected customer"
                    readOnly
                    title="Auto-filled from the selected customer's installation"
                    className="tm-input-readonly"
                  />
                  {taskFormik.errors.installationId && taskFormik.touched.installationId && <span className="tm-field-error">{taskFormik.errors.installationId}</span>}
                </div>
                <div className="tm-form-field tm-full-width">
                  <label>Completion Status <span className="tm-req">*</span></label>
                  <Dropdown value={taskFormik.values.status} onChange={(val) => taskFormik.setFieldValue("status", val)} options={TASK_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" />
                  {taskFormik.errors.status && taskFormik.touched.status && <span className="tm-field-error">{taskFormik.errors.status}</span>}
                </div>
              </div>
            </form>
            <div className="tm-modal-footer">
              <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowTaskModal(false)}>Cancel</button>
              <button type="submit" form="taskForm" className="tm-btn tm-btn-primary">{editingTask ? "Update Task" : "Add Task"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Report Modal */}
      {showViewReport && renderViewReport(showViewReport)}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={`Delete ${deleteContext.type.charAt(0).toUpperCase() + deleteContext.type.slice(1)}`}
        message={`Are you sure you want to delete this ${deleteContext.type}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteContext({ type: "", target: null }); }}
        loading={deleteLoading}
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
                  {showLogModal.technicianId || showLogModal._id}
                </span>
              </div>
              <button className="cm-modal-close" onClick={() => setShowLogModal(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="cm-view-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
              
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
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>{showLogModal.priority || "Medium"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Assigned Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.date || "—"}
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
                  Task Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Task Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.taskName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technicianName}</div>
                  </div>
                </div>

                {showLogModal.comments && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Comments &amp; Remarks</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.comments}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadTaskLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default TechnicianManagement;









