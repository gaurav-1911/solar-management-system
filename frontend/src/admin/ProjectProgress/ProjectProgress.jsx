import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { projectProgressSchema, clampNumberInput } from "../../utils/AdminValidation";
import { Dropdown, Pagination, SelectWithOther, TableLoader, PageLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useLocalToast, ToastRenderer } from "../../components/common/Toast";
import {
  commissioningAPI,
  installationAPI,
  projectApprovalAPI,
  projectProgressAPI,
  purchaseOrderAPI,
  quotationAPI,
  siteSurveyAPI,
  solarDesignAPI,
  testingAPI,
} from "../../services";
import { createProfilePdf, formatCurrencyPdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import "./ProjectProgress.css";

/* ────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────── */

const MILESTONE_KEYS = [
  { key: "leadCreated", label: "Lead Created" },
  { key: "surveyCompleted", label: "Survey Completed" },
  { key: "quotationApproved", label: "Quotation Approved" },
  { key: "paymentReceived", label: "Payment Received" },
  { key: "materialProcured", label: "Material Procured" },
  { key: "installationStarted", label: "Installation Started" },
  { key: "testingCompleted", label: "Testing Completed" },
  { key: "commissioningCompleted", label: "Commissioning Completed" },
  { key: "handoverCompleted", label: "Handover Completed" },
];

const MILESTONE_STATUSES = ["Not Started", "In Progress", "Completed"];
const HEALTH_SCORES = ["Excellent", "Good", "Average", "Poor"];
const RISK_LEVELS = ["Low", "Medium", "High"];
const DELAY_OPTIONS = ["No", "Yes"];

// GST rate applied on quotation totals (mirrors Solar/src/utils/quotationHelpers.js).
// Used to recompute the GST amount whenever the Actual Project Cost changes.
const GST_RATE = 0.18;

// Dependent Activity presets for the Dependency Tracking section — the last
// "Other" item in the dropdown lets the user type any custom activity.
const DEPENDENT_ACTIVITIES = [
  "Material Procurement",
  "Panel Installation",
  "Foundation Work",
  "Survey Completion",
  "Testing Phase",
  "Testing & Commissioning",
  "Commissioning",
  "Grid Connection",
  "Handover",
];

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const initialFormState = {
  projectName: "",
  customerName: "",
  leadId: "",
  startDate: "",
  expectedEndDate: "",
  milestones: {
    leadCreated: "Not Started",
    surveyCompleted: "Not Started",
    quotationApproved: "Not Started",
    paymentReceived: "Not Started",
    materialProcured: "Not Started",
    installationStarted: "Not Started",
    testingCompleted: "Not Started",
    commissioningCompleted: "Not Started",
    handoverCompleted: "Not Started",
  },
  completionPercentage: 0,
  delayStatus: "No",
  delayReason: "",
  resources: [],
  actualProjectCost: "",
  approvedBudget: "",
  riskLevel: "Low",
  riskDescription: "",
  dependentActivity: "",
  dependencyStatus: "Not Started",
  healthScore: "Good",
};

/* ────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */

function getCurrentMilestone(milestones) {
  const order = MILESTONE_KEYS.map((m) => m.key);
  for (let i = order.length - 1; i >= 0; i--) {
    if (milestones[order[i]] === "Completed") return MILESTONE_KEYS[i].label;
  }
  return MILESTONE_KEYS[0].label;
}

function calcCompletion(milestones) {
  const completed = MILESTONE_KEYS.filter(
    (m) => milestones[m.key] === "Completed",
  ).length;
  return Math.round((completed / MILESTONE_KEYS.length) * 100);
}

// Standalone version of deriveMilestones that takes data as params
// (used by the useEffect that re-derives milestones for the table)
function deriveMilestonesFromData(leadId, base, installationsArr, siteSurveysArr, quotationsArr, approvalsArr, testsArr, commissioningsArr) {
  if (!leadId || !base) return null;
  const b = { ...base };
  const installation = (installationsArr || []).find((i) => i.leadId === leadId);
  const survey = (siteSurveysArr || []).find(
    (s) => s.leadId === leadId || (installation?.customerName && s.customerName === installation.customerName),
  );
  const quotation = (quotationsArr || []).find((q) => q.leadId === leadId);
  const approval = (approvalsArr || []).find((a) => a.leadId === leadId);
  const test = (testsArr || []).find((t) => t.leadId === leadId);
  const commissioning = (commissioningsArr || []).find((c) => c.leadId === leadId);

  b.leadCreated = "Completed";
  if (survey) b.surveyCompleted = "Completed";
  if (quotation) {
    b.quotationApproved =
      quotation.status === "Approved"
        ? "Completed"
        : quotation.status === "Rejected"
          ? "Not Started"
          : "In Progress";
  }
  if (approval?.status === "Approved") b.quotationApproved = "Completed";
  if (installation) {
    b.installationStarted =
      installation.installationStatus === "Completed"
        ? "Completed"
        : "In Progress";
  }
  if (installation && Array.isArray(installation.materials) && installation.materials.some((m) => (typeof m === "string" ? m === "Available" : m && m.status === "Available" && Number(m.quantity) > 0))) {
    b.materialProcured =
      installation.installationStatus === "Completed"
        ? "Completed"
        : "In Progress";
  }
  if (test) {
    b.testingCompleted =
      test.testResult === "Pass" ? "Completed" : "In Progress";
  }
  if (commissioning) {
    const commissioned =
      commissioning.gridConnected === "Connected" &&
      commissioning.netMeterInstalled === "Installed" &&
      commissioning.discomApproval === "Approved";
    const handedOver =
      commissioned &&
      commissioning.customerSigned === "Signed" &&
      commissioning.documentsDelivered === "Delivered" &&
      commissioning.warrantyRegistered === true;
    b.commissioningCompleted = commissioned ? "Completed" : "In Progress";
    b.handoverCompleted = handedOver ? "Completed" : "In Progress";
  }
  return b;
}

function getProjectStatus(healthScore, delayStatus, completionPercentage) {
  if (Number(completionPercentage) >= 100) return "Completed";
  if (delayStatus === "Yes") return "Delayed";
  if (healthScore === "Excellent" || healthScore === "Good")
    return "In Progress";
  if (healthScore === "Poor") return "Blocked";
  return "In Progress";
}

// eslint-disable-next-line no-unused-vars
function getHealthNumeric(score) {
  const map = { Excellent: 95, Good: 75, Average: 50, Poor: 25 };
  return map[score] || 75;
}



function getStatusClass(s) {
  const map = {
    Completed: "pp-status-completed",
    "In Progress": "pp-status-progress",
    Delayed: "pp-status-delayed",
    Blocked: "pp-status-blocked",
    "Not Started": "pp-status-notstarted",
  };
  return map[s] || "";
}

function getHealthClass(s) {
  const map = {
    Excellent: "pp-health-excellent",
    Good: "pp-health-good",
    Average: "pp-health-average",
    Poor: "pp-health-poor",
  };
  return map[s] || "";
}

function getMilestoneStatusClass(s) {
  const map = {
    Completed: "ms-completed",
    "In Progress": "ms-progress",
    "Not Started": "ms-pending",
  };
  return map[s] || "ms-pending";
}

// Normalize a backend document into the shape the UI expects.
function normalizeProject(doc) {
  return {
    ...doc,
    id: doc.projectId || doc.id || doc._id,
    startDate: doc.startDate ? String(doc.startDate).slice(0, 10) : "",
    expectedEndDate: doc.expectedEndDate
      ? String(doc.expectedEndDate).slice(0, 10)
      : "",
    milestones: doc.milestones || {},
    resources: doc.resources || [],
  };
}

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

const ProjectProgress = () => {
  const navigate = useNavigate();
  const { canDo } = useAuth();
  const { toast, showToast, success, error } = useLocalToast();

  // ── Data state ──
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    healthScore: "All",
    completionRange: "All",
    currentMilestone: "All",
    projectStatus: "All",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState([]);
  const [siteSurveys, setSiteSurveys] = useState([]);
  const [solarDesigns, setSolarDesigns] = useState([]);
  const [projectApprovals, setProjectApprovals] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [tests, setTests] = useState([]);
  const [commissionings, setCommissionings] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  const location = useLocation();
  // ── Form page state ──
  const [showFormPage, setShowFormPage] = useState(false);

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    setShowFormPage(false);
  }, [location.key, location.state]);
  const [editingProject, setEditingProject] = useState(null);
  const [viewProject, setViewProject] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newResource, setNewResource] = useState({ name: "", role: "" });
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // Effective GST rate for the selected quotation, used to recompute the GST
  // amount live whenever the Actual Project Cost is changed.
  const gstRateRef = useRef(GST_RATE);

  // ── Load projects from the backend on mount ──
  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      try {
        const params = { page: 1, limit: 1000 };
        if (search.trim()) params.search = search.trim();
        if (filters.projectStatus !== 'All') params.status = filters.projectStatus;
        if (filters.healthScore !== 'All') params.health = filters.healthScore;
        const res = await projectProgressAPI.getAll(params);
        const docs = res.data?.data || [];
        if (!cancelled) {
          setProjects(docs.map(normalizeProject));
          setServerTotal(res.data?.pagination?.total || docs.length);
        }
      } catch (err) {
        console.warn("Failed to load project progress:", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadProjects();
    return () => { cancelled = true; };
  }, []);

  // Load installations, site surveys, solar designs, project approvals,
  // quotations and test records so the form can auto-derive names/statuses
  // from real backend data. Each fetch is isolated (allSettled) so one
  // failing API never blocks the others from loading.
  useEffect(() => {
    let cancelled = false;
    const loadFormData = async () => {
      const [inst, surv, des, apr, quot, tst, comm, purch] = await Promise.allSettled([
        installationAPI.getAll({ page: 1, limit: 100 }),
        siteSurveyAPI.getAll({ page: 1, limit: 100 }),
        solarDesignAPI.getAll({ page: 1, limit: 100 }),
        projectApprovalAPI.getAll({ page: 1, limit: 100 }),
        quotationAPI.getAll({ page: 1, limit: 100 }),
        testingAPI.getAll({ page: 1, limit: 100 }),
        commissioningAPI.getAll({ page: 1, limit: 100 }),
        // Purchase orders drive the real actual-cost figure, so fetch a large
        // batch rather than the default page to avoid silently undercounting.
        purchaseOrderAPI.getAll({ page: 1, limit: 10000 }),
      ]);
      if (cancelled) return;
      if (inst.status === "fulfilled") setInstallations(inst.value?.data?.data || []);
      if (surv.status === "fulfilled") setSiteSurveys(surv.value?.data?.data || []);
      if (des.status === "fulfilled") setSolarDesigns(des.value?.data?.data || []);
      if (apr.status === "fulfilled") setProjectApprovals(apr.value?.data?.data || []);
      else if (apr.status === "rejected") console.warn("Failed to load project approvals:", apr.reason?.message);
      if (quot.status === "fulfilled") setQuotations(quot.value?.data?.data || []);
      if (tst.status === "fulfilled") setTests(tst.value?.data?.data || []);
      if (comm.status === "fulfilled") setCommissionings(comm.value?.data?.data || []);
      if (purch.status === "fulfilled") setPurchaseOrders(purch.value?.data?.data || []);
    };
    loadFormData();
    return () => { cancelled = true; };
  }, []);

  // After related data (installations, surveys, etc.) loads, re-derive
  // milestones for every project so the table always shows correct
  // completion % and current milestone from real backend records.
  useEffect(() => {
    if (!installations.length && !siteSurveys.length) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (!p.leadId) return p;
        const derived = deriveMilestonesFromData(
          p.leadId,
          { ...p.milestones },
          installations,
          siteSurveys,
          quotations,
          projectApprovals,
          tests,
          commissionings,
        );
        if (!derived) return p;
        return {
          ...p,
          milestones: derived,
          completionPercentage: calcCompletion(derived),
        };
      })
    );
  }, [installations, siteSurveys, quotations, projectApprovals, tests, commissionings]);

  const formik = useFormik({
    initialValues: { ...initialFormState, startDate: today },
    validationSchema: projectProgressSchema,
    onSubmit: async (values, { setFieldError }) => {
      if (!values.startDate) {
        setFieldError("startDate", "Start date is required");
        return;
      }
      const minStart = new Date(editingProject ? editingProject.startDate : today);
      minStart.setHours(0, 0, 0, 0);
      if (new Date(values.startDate) < minStart) {
        setFieldError("startDate", editingProject ? `Date cannot be earlier than the original (${editingProject.startDate})` : "Start date cannot be in the past");
        return;
      }
      if (!editingProject && !values.expectedEndDate) {
        setFieldError("expectedEndDate", "Expected end date is required");
        return;
      }
      if (values.expectedEndDate) {
        const minEnd = new Date(editingProject ? editingProject.expectedEndDate : today);
        minEnd.setHours(0, 0, 0, 0);
        if (new Date(values.expectedEndDate) < minEnd) {
          setFieldError("expectedEndDate", editingProject ? `Date cannot be earlier than the original (${editingProject.expectedEndDate})` : "Expected end date cannot be in the past");
          return;
        }
      }
      setLoading(true);
      const pct = values.completionPercentage ?? calcCompletion(values.milestones);
      const healthScore = values.healthScore;
      const projectStatus = getProjectStatus(healthScore, values.delayStatus, pct);
      const projectData = {
        projectName: values.projectName.trim(),
        customerName: values.customerName.trim(),
        leadId: values.leadId || "",
        startDate: values.startDate,
        expectedEndDate: values.expectedEndDate || null,
        milestones: values.milestones,
        completionPercentage: pct,
        delayStatus: values.delayStatus,
        delayReason: values.delayReason.trim(),
        resources: values.resources,
        actualProjectCost: Number(values.actualProjectCost) || 0,
        approvedBudget: Number(values.approvedBudget) || 0,
        gstAmount,
        riskLevel: values.riskLevel,
        riskDescription: values.riskDescription.trim(),
        dependentActivity: values.dependentActivity.trim(),
        dependencyStatus: values.dependencyStatus,
        healthScore,
        projectStatus,
      };
      try {
        if (editingProject) {
          if (editingProject._id) {
            const res = await projectProgressAPI.update(editingProject._id, projectData);
            const updated = normalizeProject(res.data.data);
            setProjects((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
            showToast(`Project ${updated.id} updated successfully`, "success");
          } else {
            setProjects((prev) => prev.map((p) => p.id === editingProject.id ? { ...p, ...projectData } : p));
            showToast(`Project ${editingProject.id} updated successfully`, "success");
          }
        } else {
          // Guard: never allow a second entry for a lead that already has one.
          const existingForLead = (projects || []).find(
            (p) => values.leadId && p.leadId === values.leadId
          );
          if (existingForLead) {
            showToast(`A project progress entry (${existingForLead.id}) already exists for lead ${values.leadId}. Edit that entry instead of creating a duplicate.`, "error");
            return;
          }
          const res = await projectProgressAPI.create(projectData);
          const created = normalizeProject(res.data.data);
          setProjects((prev) => [...prev, created]);
          showToast(`Project ${created.id} created successfully`, "success");
        }
        formik.resetForm();
        setEditingProject(null);
        setTimeout(() => setShowFormPage(false), 0);
      } catch (err) {
        showToast(err.response?.data?.message || "Failed to save project. Please try again.", "error");
      } finally {
        setLoading(false);
      }
    },
  });

  // ── Derived data ──
  // Only projects whose Project Approval has been approved should appear in
  // Project Progress. Match by leadId first, then fall back to
  // projectName + customerName (the same key the backend uses when it
  // auto-creates a progress record from an approved approval).
  const approvedProjects = useMemo(() => {
    const approvals = projectApprovals || [];
    return projects
      .filter((p) =>
        approvals.some(
          (a) =>
            a.status === "Approved" &&
            ((p.leadId && a.leadId && p.leadId === a.leadId) ||
              (p.projectName === a.projectName &&
                p.customerName === a.customerName)),
        ),
      )
      .map((p) => {
        const approval = approvals.find(
          (a) => a.status === "Approved" && ((p.leadId && a.leadId && p.leadId === a.leadId) || (p.projectName === a.projectName && p.customerName === a.customerName)),
        );
        if (approval?.projectName && approval.projectName !== p.projectName) {
          return { ...p, projectName: approval.projectName };
        }
        return p;
      });
  }, [projects, projectApprovals]);

  const filtered = useMemo(() => {
    let result = [...approvedProjects];
    const q = search.toLowerCase().trim();

    if (q) {
      result = result.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q),
      );
    }

    if (filters.healthScore !== "All") {
      result = result.filter((p) => p.healthScore === filters.healthScore);
    }
    if (filters.completionRange !== "All") {
      const [min, max] = filters.completionRange.split("-").map(Number);
      result = result.filter((p) => {
        if (max)
          return p.completionPercentage >= min && p.completionPercentage <= max;
        return p.completionPercentage >= min;
      });
    }
    if (filters.currentMilestone !== "All") {
      result = result.filter(
        (p) => getCurrentMilestone(p.milestones) === filters.currentMilestone,
      );
    }
    if (filters.projectStatus !== "All") {
      result = result.filter((p) => p.projectStatus === filters.projectStatus);
    }

    return result;
  }, [approvedProjects, search, filters]);

  const totalPages = Math.max(1, Math.ceil(serverTotal || filtered.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // ── Charts data ──
  const budgetChartData = useMemo(() => {
    return approvedProjects
      .filter((p) => p.approvedBudget > 0)
      .map((p) => ({
        name: p.projectName.split(" ").slice(0, 2).join(" "),
        budget: Math.round(p.approvedBudget / 1000),
        spent: Math.round(p.actualProjectCost / 1000),
      }));
  }, [approvedProjects]);

  // Planned vs Actual timeline derived from real project data instead of a
  // static series. The timeline spans from the earliest project start to the
  // latest expected end (or today, whichever is later). For every sampled
  // point across that window:
  //  - "planned" is the average expected progress (linear 0→100 over each
  //    project's start → expected-end window),
  //  - "actual" ramps 0 → completionPercentage up to today and holds flat
  //    afterwards (handed-over projects stay pinned at 100).
  const progressTimeline = useMemo(() => {
    const parseDay = (s) => {
      if (!s) return null;
      const d = new Date(String(s).slice(0, 10) + "T00:00:00");
      return isNaN(d.getTime()) ? null : d;
    };

    // Auto-created records (from Project Approval) carry only a startDate —
    // fall back to a default 60-day window so they still chart. Records
    // without any start date are skipped.
    const DEFAULT_DURATION_DAYS = 60;
    const projectWindow = (p) => {
      const s = parseDay(p.startDate);
      if (!s) return null;
      const e =
        parseDay(p.expectedEndDate) ||
        new Date(s.getTime() + DEFAULT_DURATION_DAYS * 86400000);
      if (e <= s) return null;
      return { s, e };
    };

    const windows = approvedProjects
      .map(projectWindow)
      .filter(Boolean);

    if (!windows.length) return [];

    const today = new Date();
    const minStart = new Date(Math.min(...windows.map((w) => w.s.getTime())));
    const anchorEnd = new Date(
      Math.max(...windows.map((w) => w.e.getTime()), today.getTime()),
    );

    const totalDays = Math.max(1, (anchorEnd - minStart) / 86400000);
    const pointCount = Math.min(10, Math.max(4, Math.round(totalDays / 7)));

    const points = [];
    for (let i = 1; i <= pointCount; i += 1) {
      const pointDate = new Date(
        minStart.getTime() + ((anchorEnd - minStart) * i) / pointCount,
      );
      let plannedSum = 0;
      let actualSum = 0;
      let count = 0;

      approvedProjects.forEach((p) => {
        const win = projectWindow(p);
        if (!win) return;
        const { s, e } = win;
        const duration = e - s;
        if (duration <= 0) return;

        count += 1;
        const planned = Math.min(
          100,
          Math.max(0, ((pointDate - s) / duration) * 100),
        );

        const completed =
          p.milestones?.handoverCompleted === "Completed";
        const pct = completed
          ? 100
          : Math.min(100, Math.max(0, Number(p.completionPercentage) || 0));
        let actual;
        if (pointDate <= s) actual = 0;
        else if (pointDate >= today) actual = pct;
        else actual = ((pointDate - s) / (today - s)) * pct;

        plannedSum += planned;
        actualSum += Math.min(100, Math.max(0, actual));
      });

      if (count > 0) {
        points.push({
          week: pointDate.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          planned: Math.round(plannedSum / count),
          actual: Math.round(actualSum / count),
        });
      }
    }
    return points;
  }, [approvedProjects]);

  // ── Stats ──
  const stats = useMemo(
    () => ({
      total: approvedProjects.length,
      completed: approvedProjects.filter(
        (p) => p.milestones.handoverCompleted === "Completed",
      ).length,
      inProgress: approvedProjects.filter((p) => p.projectStatus === "In Progress")
        .length,
      delayed: approvedProjects.filter((p) => p.delayStatus === "Yes").length,
      totalBudget: approvedProjects.reduce((s, p) => s + (p.approvedBudget || 0), 0),
    }),
    [approvedProjects],
  );

  // ── Handlers ──
  const handleFilterChange = (key) => (val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  // ── Form page logic ──
  // Only leads that already have a Commissioning & Handover record can be
  // added to Project Progress (a project is commissioned only after testing
  // has been completed). Leads already present in Project Progress are
  // excluded so a project can't be added twice — except the one currently
  // being edited, which stays visible so it can be saved unchanged.
  const leadOptions = useMemo(() => {
    const commissionedLeadIds = new Set(
      (commissionings || [])
        .filter((c) => c.leadId)
        .map((c) => c.leadId),
    );
    const progressLeadIds = new Set(
      (projects || [])
        .map((p) => p.leadId)
        .filter(Boolean),
    );
    const seen = new Set();
    return (installations || [])
      .filter((i) => i.leadId && commissionedLeadIds.has(i.leadId))
      .filter(
        (i) =>
          !progressLeadIds.has(i.leadId) || i.leadId === editingProject?.leadId,
      )
      .sort((a, b) =>
        String(a.leadId).localeCompare(String(b.leadId), undefined, {
          numeric: true,
        }),
      )
      .filter((i) => {
        if (seen.has(i.leadId)) return false;
        seen.add(i.leadId);
        return true;
      })
      .map((i) => ({
        value: i.leadId,
        label: i.customerName ? `${i.leadId} — ${i.customerName}` : i.leadId,
      }));
  }, [installations, commissionings, projects, editingProject?.leadId]);

  // A material counts as selected when the row is "Available" with a
  // positive quantity (current object format), or a legacy "Available" string.
  const hasSelectedMaterials = (installation) =>
    Array.isArray(installation?.materials) &&
    installation.materials.some((m) => {
      if (typeof m === "string") return m === "Available";
      return m && m.status === "Available" && Number(m.quantity) > 0;
    });

  // Find the site survey for a lead — first by leadId, then fall back to
  // customerName for surveys created via a customer (CUS-XXXX) without a lead.
  const findSurvey = (leadId, customerName) => {
    const byLead = (siteSurveys || []).find(
      (s) => s.leadId && s.leadId === leadId,
    );
    if (byLead) return byLead;
    if (customerName) {
      return (siteSurveys || []).find(
        (s) => s.customerName === customerName,
      );
    }
    return undefined;
  };

  // Auto-derive milestone statuses from existing backend records for the
  // selected lead. Only milestones backed by real data are overwritten;
  // payment/material/commissioning/handover stay manual.
  const deriveMilestones = (leadId, baseOverride = null) => {
    if (!leadId) return null;
    const base = baseOverride ? { ...baseOverride } : { ...formik.values.milestones };
    const installation = (installations || []).find(
      (i) => i.leadId === leadId,
    );
    const survey = findSurvey(leadId, installation?.customerName);
    const quotation = (quotations || []).find((q) => q.leadId === leadId);
    const approval = (projectApprovals || []).find((a) => a.leadId === leadId);
    const test = (tests || []).find((t) => t.leadId === leadId);
    const commissioning = (commissionings || []).find(
      (c) => c.leadId === leadId,
    );

    base.leadCreated = "Completed";
    if (survey) base.surveyCompleted = "Completed";
    if (quotation) {
      base.quotationApproved =
        quotation.status === "Approved"
          ? "Completed"
          : quotation.status === "Rejected"
            ? "Not Started"
            : "In Progress";
    }
    if (approval?.status === "Approved") base.quotationApproved = "Completed";
    if (installation) {
      base.installationStarted =
        installation.installationStatus === "Completed"
          ? "Completed"
          : "In Progress";
    }
    if (installation && hasSelectedMaterials(installation)) {
      base.materialProcured =
        installation.installationStatus === "Completed"
          ? "Completed"
          : "In Progress";
    }
    if (test) {
      base.testingCompleted =
        test.testResult === "Pass" ? "Completed" : "In Progress";
    }
    if (commissioning) {
      const commissioned =
        commissioning.gridConnected === "Connected" &&
        commissioning.netMeterInstalled === "Installed" &&
        commissioning.discomApproval === "Approved";
      const handedOver =
        commissioned &&
        commissioning.customerSigned === "Signed" &&
        commissioning.documentsDelivered === "Delivered" &&
        commissioning.warrantyRegistered === true;
      base.commissioningCompleted = commissioned ? "Completed" : "In Progress";
      base.handoverCompleted = handedOver ? "Completed" : "In Progress";
    }
    return base;
  };

  const handleLeadSelect = (leadId) => {
    formik.setFieldValue("leadId", leadId);
    const installation = (installations || []).find((i) => i.leadId === leadId);
    formik.setFieldValue(
      "customerName",
      installation?.customerName || "",
    );
    const survey = findSurvey(leadId, installation?.customerName);
    const approval = (projectApprovals || []).find((a) => a.leadId === leadId);
    const design = (solarDesigns || []).find((d) => d.leadId === leadId);
    formik.setFieldValue(
      "projectName",
      approval?.projectName ||
        survey?.projectName ||
        design?.projectName ||
        "",
    );

    if (leadId) {
      const milestones = deriveMilestones(leadId);
      formik.setFieldValue("milestones", milestones);
      formik.setFieldValue(
        "completionPercentage",
        calcCompletion(milestones),
      );

      const quotation = (quotations || []).find((q) => q.leadId === leadId);
      // Remember the GST rate actually applied on the quotation total so the
      // GST amount can be recomputed when the Actual Project Cost changes.
      gstRateRef.current =
        quotation && Number(quotation.total) > 0
          ? (Number(quotation.gst) || 0) / Number(quotation.total)
          : GST_RATE;

      // The Actual Project Cost is the real money spent on the project. When
      // an installation exists for this lead its material cost (qty × unit
      // price) is the source of truth — never fall back to the quotation
      // total once materials were installed.
      const installationMaterials = Array.isArray(installation?.materials)
        ? installation.materials
        : [];
      const installTotal = installationMaterials.reduce((sum, m) => {
        if (!m || typeof m !== "object" || m.status !== "Available") return sum;
        const qty = Number(m.quantity || 0);
        const price = Number(m.price);
        if (qty <= 0 || !Number.isFinite(price) || price <= 0) return sum;
        return sum + qty * price;
      }, 0);

      if (quotation && quotation.total != null) {
        // Approved Budget = Quotation total WITHOUT GST. The GST applied on
        // that total is fetched into the GST Amount field below it.
        formik.setFieldValue("approvedBudget", quotation.total);
        // Actual Project Cost = the installation's material cost when one
        // exists, otherwise it starts equal to the approved budget.
        formik.setFieldValue(
          "actualProjectCost",
          installTotal > 0 ? installTotal : quotation.total
        );
      } else if (approval?.estimatedCost != null) {
        // No quotation for this lead yet — fall back to the approval's Est.
        // Cost; GST Amount is derived from the approved budget. When an
        // installation exists, prefer its material cost.
        formik.setFieldValue("approvedBudget", approval.estimatedCost);
        formik.setFieldValue(
          "actualProjectCost",
          installTotal > 0 ? installTotal : approval.estimatedCost
        );
      } else {
        // Fallback when no quotation/approval exists yet: actual cost = real
        // spend (the sum of this lead's purchase order totals, cancelled
        // orders excluded) or the quotation/design estimate when no purchase
        // orders exist.
        gstRateRef.current = GST_RATE;
        const leadPOs = (purchaseOrders || []).filter(
          (p) => p.leadId === leadId && p.status !== "Cancelled",
        );
        const spentTotal = leadPOs.reduce(
          (sum, p) => sum + (Number(p.total) || 0),
          0,
        );
        if (spentTotal > 0) {
          formik.setFieldValue("actualProjectCost", spentTotal);
        } else {
          const derivedActualCost =
            quotation?.grandTotal ?? design?.estimatedSystemCost;
          if (derivedActualCost != null) {
            formik.setFieldValue("actualProjectCost", derivedActualCost);
          }
        }
      }
    }
  };

  const openFormPage = (project = null) => {
    setNewResource({ name: "", role: "" });
    if (project) {
      setEditingProject(project);
      // Keep the effective GST rate in sync with the saved values so editing
      // the actual cost still recomputes GST consistently.
      gstRateRef.current =
        Number(project.actualProjectCost) > 0 && Number(project.gstAmount) > 0
          ? Number(project.gstAmount) / Number(project.actualProjectCost)
          : GST_RATE;
      // Re-derive milestone statuses from real backend records (installation,
      // survey, quotation, approval, testing, commissioning) so an existing
      // project never shows stale "Not Started" milestones. Manually-entered
      // statuses (payment, etc.) are preserved via the saved milestones base.
      const derivedMilestones = project.leadId
        ? deriveMilestones(project.leadId, { ...project.milestones })
        : null;
      formik.setValues({
        projectName: project.projectName,
        customerName: project.customerName,
        leadId: project.leadId || "",
        startDate: project.startDate,
        expectedEndDate: project.expectedEndDate,
        milestones: derivedMilestones || { ...project.milestones },
        completionPercentage: derivedMilestones
          ? calcCompletion(derivedMilestones)
          : project.completionPercentage,
        delayStatus: project.delayStatus,
        delayReason: project.delayReason,
        resources: [...project.resources],
        actualProjectCost: project.actualProjectCost ? String(project.actualProjectCost) : "",
        approvedBudget: project.approvedBudget ? String(project.approvedBudget) : "",
        riskLevel: project.riskLevel,
        riskDescription: project.riskDescription,
        dependentActivity: project.dependentActivity,
        dependencyStatus: project.dependencyStatus,
        healthScore: project.healthScore,
      }, false);
      formik.setTouched({});
    } else {
      setEditingProject(null);
      gstRateRef.current = GST_RATE;
      formik.setValues({
        ...initialFormState,
        startDate: today,
      }, false);
    }
    setShowFormPage(true);
  };

  // GST Amount is always visible and non-editable: it is derived at render
  // time from the Actual Project Cost when entered, otherwise from the
  // Approved Budget, using the quotation's effective GST rate.
  const gstAmount = useMemo(() => {
    const rate = gstRateRef.current || GST_RATE;
    const cost = Number(formik.values.actualProjectCost);
    const budget = Number(formik.values.approvedBudget);
    const base = cost > 0 ? cost : budget > 0 ? budget : 0;
    return base > 0 ? Math.round(base * rate) : 0;
  }, [formik.values.actualProjectCost, formik.values.approvedBudget]);

  const openView = (project) => {
    setViewProject(project);
  };

  const closeView = () => {
    setViewProject(null);
  };

  // ── Form helpers ──
  const handleMilestoneChange = (key) => (val) => {
    const newMilestones = { ...formik.values.milestones, [key]: val };
    const pct = calcCompletion(newMilestones);
    formik.setFieldValue("milestones", newMilestones);
    formik.setFieldValue("completionPercentage", pct);
  };

  const handleAddResource = () => {
    if (!newResource.name.trim() || !newResource.role.trim()) {
      showToast("Resource name and role are required", "error");
      return;
    }
    formik.setFieldValue("resources", [...formik.values.resources, { ...newResource }]);
    setNewResource({ name: "", role: "" });
  };

  const handleRemoveResource = (idx) => {
    formik.setFieldValue("resources", formik.values.resources.filter((_, i) => i !== idx));
  };

  const confirmDelete = (project) => {
    setDeleteTarget(project);
    setShowDeleteDialog(true);
  };

  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      return;
    }
    setDeleteLoading(true);
    try {
      if (deleteTarget._id) {
        await projectProgressAPI.delete(deleteTarget._id);
        setProjects((prev) => prev.filter((p) => p._id !== deleteTarget._id));
        showToast(`Project ${deleteTarget.id} deleted successfully`, "success");
      } else {
        setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        showToast(`Project ${deleteTarget.id} deleted successfully`, "success");
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to delete project. Please try again.", "error");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  // ── Download log ──
const downloadLog = async (p) => {
  const doc = await createProfilePdf({
    bannerName: p.projectName,
    bannerSubtitle: `Project ID: ${p.id}`,
    bannerRight: [`Status: ${p.projectStatus || "—"}`, `Health: ${p.healthScore || "—"}`],
    sections: [
      {
        title: "Project Details",
        fields: [
          ["Customer", p.customerName],
          ["Completion", `${p.completionPercentage}%`],
          ["Start Date", p.startDate],
          ["Expected End", p.expectedEndDate || "—"],
          ["Budget", formatCurrencyPdf(p.approvedBudget)],
          ["Cost Incurred", formatCurrencyPdf(p.actualProjectCost)],
          ["Risk Level", p.riskLevel],
          ["Delay Status", p.delayStatus],
          ["Current Milestone", getCurrentMilestone(p.milestones)],
        ],
      },
      {
        title: "Milestones",
        fields: MILESTONE_KEYS.map((m) => [m.label, p.milestones?.[m.key] || "Not Started"]),
      },
    ],
  });

  const safeProject = (p.projectName || "Project")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`ProjectLog_${safeProject}.pdf`);

  showToast("Project Log downloaded successfully", "success");
};

  // ── Milestone display helper ──
  const renderMilestoneBar = (project) => {
    const completed = MILESTONE_KEYS.filter(
      (m) => project.milestones[m.key] === "Completed",
    ).length;
    const inProgress = MILESTONE_KEYS.filter(
      (m) => project.milestones[m.key] === "In Progress",
    ).length;
    const total = MILESTONE_KEYS.length;
    return (
      <div className="pp-ms-bar">
        <div className="pp-ms-track">
          <div
            className="pp-ms-fill pp-ms-completed"
            style={{ width: `${(completed / total) * 100}%` }}
          />
          <div
            className="pp-ms-fill pp-ms-progress"
            style={{ width: `${(inProgress / total) * 100}%` }}
          />
        </div>
        <span className="pp-ms-count">
          {completed}/{total}
        </span>
      </div>
    );
  };

  const getCompletionRangeOptions = () => [
    { value: "All", label: "All Completion %" },
    { value: "0-25", label: "0% – 25%" },
    { value: "26-50", label: "26% – 50%" },
    { value: "51-75", label: "51% – 75%" },
    { value: "76-99", label: "76% – 99%" },
    { value: "100-100", label: "100%" },
  ];

  const getMilestoneFilterOptions = () => [
    { value: "All", label: "All Milestones" },
    ...MILESTONE_KEYS.map((m) => ({ value: m.label, label: m.label })),
  ];

  const getHealthFilterOptions = () => [
    { value: "All", label: "All Health Scores" },
    ...HEALTH_SCORES.map((s) => ({ value: s, label: s })),
  ];

  const getStatusFilterOptions = () => [
    { value: "All", label: "All Status" },
    { value: "Completed", label: "Completed" },
    { value: "In Progress", label: "In Progress" },
    { value: "Delayed", label: "Delayed" },
    { value: "Blocked", label: "Blocked" },
    { value: "Not Started", label: "Not Started" },
  ];

  /* ══════════════════════════════════════════════════════════
     FORM PAGE RENDER
     ══════════════════════════════════════════════════════════ */

  // Budget vs Spent comparison bars: the Budget bar is BLUE and scales with
  // the Approved Budget, the Spent bar is GREEN and scales with the Actual
  // Project Cost. Both bars share a track sized to the larger of the two.
  const renderBudgetCompare = () => {
    const budget = Number(formik.values.approvedBudget) || 0;
    const spent = Number(formik.values.actualProjectCost) || 0;
    if (budget <= 0 || spent <= 0) return null;
    const maxVal = Math.max(budget, spent);
    return (
      <div className="pp-budget-compare">
        <div className="pp-budget-row">
          <span>Budget</span>
          <span className="pp-budget-bar-wrap">
            <span
              className="pp-budget-bar pp-budget-bar-budget"
              style={{ width: `${(budget / maxVal) * 100}%` }}
            />
          </span>
          <span>₹{budget.toLocaleString()}</span>
        </div>
        <div className="pp-budget-row">
          <span>Spent</span>
          <span className="pp-budget-bar-wrap">
            <span
              className="pp-budget-bar pp-budget-bar-spent"
              style={{ width: `${(spent / maxVal) * 100}%` }}
            />
          </span>
          <span>₹{spent.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  const renderFormPage = () => (
    <div className="pp-form-page">
      <div className="pp-form-page-header">
        <button className="pp-back-btn" onClick={() => setShowFormPage(false)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Projects
        </button>
        <h2>
          {editingProject
            ? `Edit Project ${editingProject.id}`
            : "New Project Timeline"}
        </h2>
      </div>

      <form onSubmit={formik.handleSubmit} className="pp-form-page-body" noValidate>
        <div className="pp-form-grid">
          {/* Section 1: Project Timeline */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">1</span>
              <h4>Project Timeline</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Linked Lead</label>
                <Dropdown value={formik.values.leadId} onChange={handleLeadSelect} options={leadOptions} variant="form" placeholder="Select lead (optional)" emptyMessage="No commissioned projects available" />
              </div>
              <div className="pp-fld">
                <label>Customer Name <span className="pp-req">*</span></label>
                <input type="text" name="customerName" value={formik.values.customerName} readOnly placeholder="Auto-filled from selected lead" title="Auto-filled from selected lead" className={formik.errors.customerName && formik.touched.customerName ? "pp-input-error" : ""} />
                {formik.errors.customerName && formik.touched.customerName && <span className="pp-err">{formik.errors.customerName}</span>}
              </div>
              <div className="pp-fld">
                <label>Project Name <span className="pp-req">*</span></label>
                <input type="text" name="projectName" value={formik.values.projectName} readOnly placeholder="Auto-filled from selected project" className={formik.errors.projectName && formik.touched.projectName ? "pp-input-error" : ""} />
                {formik.errors.projectName && formik.touched.projectName && <span className="pp-err">{formik.errors.projectName}</span>}
              </div>
              <div className="pp-fld">
                <label>Start Date <span className="pp-req">*</span></label>
                <input type="date" name="startDate" min={today} value={formik.values.startDate} onChange={formik.handleChange} className={formik.errors.startDate && formik.touched.startDate ? "pp-input-error" : ""} />
                {formik.errors.startDate && formik.touched.startDate && <span className="pp-err">{formik.errors.startDate}</span>}
              </div>
              <div className="pp-fld">
                <label>Expected End Date <span className="pp-req">*</span></label>
                <input type="date" name="expectedEndDate" min={today} value={formik.values.expectedEndDate} onChange={formik.handleChange} className={formik.errors.expectedEndDate && formik.touched.expectedEndDate ? "pp-input-error" : ""} />
                {formik.errors.expectedEndDate && formik.touched.expectedEndDate && <span className="pp-err">{formik.errors.expectedEndDate}</span>}
              </div>
            </div>
          </div>

          {/* Section 2: Milestone Tracking */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">2</span>
              <h4>Milestone Tracking</h4>
            </div>
            <div className="pp-fsect-body pp-ms-form-grid">
              {MILESTONE_KEYS.map((m) => (
                <div key={m.key} className="pp-ms-form-row">
                  <span className="pp-ms-form-label">{m.label}</span>
                  <Dropdown value={formik.values.milestones[m.key]} onChange={(val) => handleMilestoneChange(m.key)(val)} options={MILESTONE_STATUSES.map((s) => ({ value: s, label: s }))} variant="inline" size="sm" />
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Completion & Delay */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">3</span>
              <h4>Completion &amp; Delay</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Completion Percentage (%)</label>
                <div className="pp-pct-input-wrap">
                  <input type="number" name="completionPercentage" min="0" max="100" value={formik.values.completionPercentage} readOnly tabIndex={-1} title="Auto-calculated from the milestones below" placeholder="Auto-calculated" />
                  <div className="pp-pct-indicator">
                    <div className="pp-pct-ind-fill" style={{ width: `${Math.min(formik.values.completionPercentage || 0, 100)}%`, background: formik.values.completionPercentage >= 100 ? "#16a34a" : "#2563eb" }} />
                  </div>
                </div>
                {formik.errors.completionPercentage && formik.touched.completionPercentage && <span className="pp-err">{formik.errors.completionPercentage}</span>}
              </div>
              <div className="pp-fld">
                <label>Delay Status</label>
                <Dropdown value={formik.values.delayStatus} onChange={(val) => formik.setFieldValue("delayStatus", val)} options={DELAY_OPTIONS.map((d) => ({ value: d, label: d }))} variant="form" />
              </div>
              {formik.values.delayStatus === "Yes" && (
                <div className="pp-fld">
                  <label>Delay Reason <span className="pp-req">*</span></label>
                  <textarea name="delayReason" value={formik.values.delayReason} onChange={formik.handleChange} placeholder="Describe the reason for delay..." rows={2} maxLength={500} className={formik.errors.delayReason && formik.touched.delayReason ? "pp-input-error" : ""} />
                  {formik.errors.delayReason && formik.touched.delayReason && <span className="pp-err">{formik.errors.delayReason}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Resource Allocation */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">4</span>
              <h4>Resource Allocation</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-resource-add">
                <input type="text" placeholder="Resource name" value={newResource.name} onChange={(e) => setNewResource((p) => ({ ...p, name: e.target.value }))} maxLength={50} />
                <input type="text" placeholder="Role" value={newResource.role} onChange={(e) => setNewResource((p) => ({ ...p, role: e.target.value }))} maxLength={50} />
                <button type="button" className="pp-btn-sm" onClick={handleAddResource}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add
                </button>
              </div>
              {formik.values.resources.length > 0 && (
                <div className="pp-resource-list">
                  {formik.values.resources.map((r, idx) => (
                    <div key={idx} className="pp-resource-item">
                      <div className="pp-resource-info">
                        <span className="pp-resource-name">{r.name}</span>
                        <span className="pp-resource-role">{r.role}</span>
                      </div>
                      <button type="button" className="pp-resource-rm" onClick={() => handleRemoveResource(idx)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {formik.values.resources.length === 0 && (
                <p className="pp-resource-empty">No resources added yet</p>
              )}
              {formik.errors.resources && (
                <span className="pp-err" style={{ gridColumn: "1 / -1", textAlign: "center" }}>
                  {formik.errors.resources}
                </span>
              )}
            </div>
          </div>

          {/* Section 5: Cost & Budget */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">5</span>
              <h4>Cost &amp; Budget Tracking</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Actual Project Cost (₹)</label>
                <input type="number" name="actualProjectCost" min="0" value={formik.values.actualProjectCost} onChange={clampNumberInput(formik, 10000000000)} placeholder="e.g. 252000" className={formik.errors.actualProjectCost && formik.touched.actualProjectCost ? "pp-input-error" : ""} />
                {formik.errors.actualProjectCost && formik.touched.actualProjectCost && <span className="pp-err">{formik.errors.actualProjectCost}</span>}
              </div>
              <div className="pp-fld">
                <label>Approved Budget (₹)</label>
                <input type="number" name="approvedBudget" min="0" value={formik.values.approvedBudget} onChange={clampNumberInput(formik, 10000000000)} placeholder="e.g. 350000" className={formik.errors.approvedBudget && formik.touched.approvedBudget ? "pp-input-error" : ""} />
                {formik.errors.approvedBudget && formik.touched.approvedBudget && <span className="pp-err">{formik.errors.approvedBudget}</span>}
              </div>
              <div className="pp-fld">
                <label>GST Amount (₹)</label>
                <input type="number" name="gstAmount" min="0" value={gstAmount} readOnly title="Auto-calculated from the Actual Project Cost" placeholder="Auto-calculated" />
              </div>
              {renderBudgetCompare()}
            </div>
          </div>

          {/* Section 6: Risk Tracking */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">6</span>
              <h4>Risk Tracking</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Risk Level <span className="pp-req">*</span></label>
                <Dropdown value={formik.values.riskLevel} onChange={(val) => formik.setFieldValue("riskLevel", val)} options={RISK_LEVELS.map((r) => ({ value: r, label: r }))} variant="form" />
                {formik.errors.riskLevel && formik.touched.riskLevel && <span className="pp-err">{formik.errors.riskLevel}</span>}
              </div>
              <div className="pp-fld">
                <label>Risk Description</label>
                <textarea name="riskDescription" value={formik.values.riskDescription} onChange={formik.handleChange} placeholder="Describe the risks..." rows={2} maxLength={500} />
              </div>
            </div>
          </div>

          {/* Section 7: Dependency Tracking */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">7</span>
              <h4>Dependency Tracking</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Dependent Activity <span className="pp-req">*</span></label>
                <SelectWithOther
                  value={formik.values.dependentActivity}
                  options={DEPENDENT_ACTIVITIES}
                  onChange={(v) => formik.setFieldValue("dependentActivity", v)}
                  placeholder="Select dependent activity"
                />
                {formik.errors.dependentActivity && formik.touched.dependentActivity && <span className="pp-err">{formik.errors.dependentActivity}</span>}
              </div>
              <div className="pp-fld">
                <label>Dependency Status <span className="pp-req">*</span></label>
                <Dropdown value={formik.values.dependencyStatus} onChange={(val) => formik.setFieldValue("dependencyStatus", val)} options={MILESTONE_STATUSES.concat(["Delayed"]).map((s) => ({ value: s, label: s }))} variant="form" />
                {formik.errors.dependencyStatus && formik.touched.dependencyStatus && <span className="pp-err">{formik.errors.dependencyStatus}</span>}
              </div>
            </div>
          </div>

          {/* Section 8: Health Score */}
          <div className="pp-fsect">
            <div className="pp-fsect-hdr">
              <span className="pp-fsect-num">8</span>
              <h4>Project Health Score</h4>
            </div>
            <div className="pp-fsect-body">
              <div className="pp-fld">
                <label>Health Score <span className="pp-req">*</span></label>
                <div className="pp-health-selector">
                  {HEALTH_SCORES.map((hs) => (
                    <button key={hs} type="button" className={`pp-health-opt ${getHealthClass(hs)} ${formik.values.healthScore === hs ? "pp-health-opt-active" : ""}`} onClick={() => formik.setFieldValue("healthScore", hs)}>
                      {hs}
                    </button>
                  ))}
                </div>
                {formik.errors.healthScore && formik.touched.healthScore && <span className="pp-err">{formik.errors.healthScore}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="pp-form-page-footer">
          <button type="button" className="pp-btn pp-btn-cancel" onClick={() => setShowFormPage(false)}>Cancel</button>
          <button type="submit" className="pp-btn pp-btn-primary" disabled={loading}>{loading ? "Saving..." : editingProject ? "Update Project" : "Create Project"}</button>
        </div>
      </form>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     VIEW MODAL RENDER
     ══════════════════════════════════════════════════════════ */

  const renderViewModal = () => {
    if (!viewProject) return null;
    const p = viewProject;
    return (
      <div className="pp-overlay">
        <div className="pp-modal pp-modal-view">
          <div className="pp-modal-header">
            <h3>
              {p.id} — {p.projectName}
            </h3>
            <button className="pp-modal-close" onClick={closeView}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="pp-view-body">
            {/* Quick Info */}
            <div className="pp-view-quick">
              <div className="pp-view-qitem">
                <span className="pp-view-qlabel">Customer</span>
                <span className="pp-view-qvalue">{p.customerName}</span>
              </div>
              <div className="pp-view-qitem">
                <span className="pp-view-qlabel">Status</span>
                <span
                  className={`pp-status-badge ${getStatusClass(p.projectStatus)}`}
                >
                  {p.projectStatus}
                </span>
              </div>
              <div className="pp-view-qitem">
                <span className="pp-view-qlabel">Health Score</span>
                <span
                  className={`pp-health-badge ${getHealthClass(p.healthScore)}`}
                >
                  {p.healthScore}
                </span>
              </div>
              <div className="pp-view-qitem">
                <span className="pp-view-qlabel">Completion</span>
                <span className="pp-view-qvalue">
                  {p.completionPercentage}%
                </span>
              </div>
            </div>

            {/* Milestones */}
            <div className="pp-view-section">
              <h4>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2c5364"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Milestones
              </h4>
              <div className="pp-view-milestones">
                {MILESTONE_KEYS.map((m) => (
                  <div
                    key={m.key}
                    className={`pp-view-ms ${getMilestoneStatusClass(p.milestones[m.key])}`}
                  >
                    <div className="pp-view-ms-dot">
                      {p.milestones[m.key] === "Completed"
                        ? "✓"
                        : p.milestones[m.key] === "In Progress"
                          ? "◐"
                          : "○"}
                    </div>
                    <div className="pp-view-ms-info">
                      <span className="pp-view-ms-label">{m.label}</span>
                      <span
                        className={`pp-view-ms-status ${getMilestoneStatusClass(p.milestones[m.key])}`}
                      >
                        {p.milestones[m.key]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="pp-view-section">
              <h4>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2c5364"
                  strokeWidth="2"
                >
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <polyline points="8 5 3 12 8 19" />
                </svg>
                Timeline
              </h4>
              <div className="pp-view-timeline">
                <div className="pp-view-tl-item">
                  <strong>Start:</strong> {p.startDate}
                </div>
                <div className="pp-view-tl-connector" />
                <div className="pp-view-tl-item">
                  <strong>End:</strong> {p.expectedEndDate || "—"}
                </div>
                <div className="pp-view-tl-connector" />
                <div className="pp-view-tl-item">
                  <strong>Current Milestone:</strong>{" "}
                  {getCurrentMilestone(p.milestones)}
                </div>
              </div>
            </div>

            {/* Delay */}
            {p.delayStatus === "Yes" && (
              <div className="pp-view-section">
                <h4>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Delay
                </h4>
                <div className="pp-view-delay">
                  <div className="pp-view-delay-icon">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="pp-view-delay-reason">{p.delayReason}</p>
                </div>
              </div>
            )}

            {/* Resources */}
            <div className="pp-view-section">
              <h4>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2c5364"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                Resources ({p.resources.length})
              </h4>
              {p.resources.length > 0 ? (
                <div className="pp-view-resources">
                  {p.resources.map((r, i) => (
                    <div key={i} className="pp-view-resource">
                      <div className="pp-view-res-avatar">
                        {r.name.charAt(0)}
                      </div>
                      <div className="pp-view-res-info">
                        <span className="pp-view-res-name">{r.name}</span>
                        <span className="pp-view-res-role">{r.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="pp-view-na">No resources assigned</span>
              )}
            </div>

            {/* Costs */}
            <div className="pp-view-section">
              <h4>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2c5364"
                  strokeWidth="2"
                >
                  <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" />
                </svg>
                Costs
              </h4>
              <div className="pp-view-costs">
                <div className="pp-view-cost-item">
                  <span className="pp-view-cost-label">Budget</span>
                  <span className="pp-view-cost-value">
                    ₹{(p.approvedBudget || 0).toLocaleString()}
                  </span>
                </div>
                <div className="pp-view-cost-item">
                  <span className="pp-view-cost-label">GST</span>
                  <span className="pp-view-cost-value">
                    ₹{(p.gstAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div className="pp-view-cost-item">
                  <span className="pp-view-cost-label">Spent</span>
                  <span className="pp-view-cost-value">
                    ₹{(p.actualProjectCost || 0).toLocaleString()}
                  </span>
                </div>
                <div className="pp-view-cost-item">
                  <span className="pp-view-cost-label">Remaining</span>
                  <span
                    className={`pp-view-cost-value ${(p.approvedBudget || 0) - (p.actualProjectCost || 0) < 0 ? "pp-cost-over" : "pp-cost-under"}`}
                  >
                    ₹{((p.approvedBudget || 0) - (p.actualProjectCost || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Risk */}
            <div className="pp-view-section">
              <h4>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2c5364"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                </svg>
                Risk
              </h4>
              <span
                className={`pp-risk-badge pp-risk-${p.riskLevel.toLowerCase()}`}
              >
                {p.riskLevel}
              </span>
              {p.riskDescription && (
                <p className="pp-view-risk-desc">{p.riskDescription}</p>
              )}
              {(p.dependentActivity || p.dependencyStatus) && (
                <div className="pp-view-dep">
                  <p>
                    <strong>Dependent:</strong> {p.dependentActivity} —{" "}
                    {p.dependencyStatus}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="pp-modal-footer">
            <button
              className="modal-footer-close-primary"
              onClick={closeView}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  if (showFormPage) {
    return (
      <>
        {renderFormPage()}
        <ToastRenderer toast={toast} />
      </>
    );
  }

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="project-progress-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <>
      <div className="pp-module">
        {/* Page Header */}
        <div className="pp-header">
          <div>
            <h1 className="pp-title">Project Progress Reporting</h1>
            <p className="pp-subtitle">
              Track project milestones, monitor budgets, and manage timelines
              for all solar installations.
            </p>
          </div>
          <div className="pp-header-actions">
          </div>
        </div>

        {/* ── Stats Cards ── */}
        <div className="pp-stats-grid">
          <StatCard
            title="Total Projects"
            value={stats.total.toLocaleString()}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>}
            color="blue"
          />
          <StatCard
            title="In Progress"
            value={stats.inProgress.toLocaleString()}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            color="orange"
          />
          <StatCard
            title="Completed"
            value={stats.completed.toLocaleString()}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
            color="green"
          />
          <StatCard
            title="Total Budget"
            value={`₹${(stats.totalBudget / 100000).toFixed(1)}L`}
            icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
            color="teal"
          />
        </div>

        {/* ── Charts ── */}
        <div className="pp-charts">
          <div className="chart-card">
            <h3>Planned vs Actual Progress</h3>
            {progressTimeline.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={progressTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="planned"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#2c5364"
                    fill="#2c5364"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="pp-chart-empty">No project data to chart yet</div>
            )}
          </div>
          <div className="chart-card">
            <h3>Budget vs Spent</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v) => `₹${v}K`}
                />
                <Tooltip formatter={(v) => `₹${v}K`} />
                <Legend />
                <Bar dataKey="budget" fill="#ca8a04" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="pp-toolbar">
          <div className="pp-toolbar-row">
            <div className="pp-search">
              <svg
                width="16"
                height="16"
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
                placeholder="Search by Project ID, Name or Customer"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {search && (
                <button
                  className="pp-search-clear"
                  onClick={() => setSearch("")}
                >
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
              value={filters.healthScore}
              onChange={handleFilterChange("healthScore")}
              options={getHealthFilterOptions()}
            />
            <Dropdown
              value={filters.currentMilestone}
              onChange={handleFilterChange("currentMilestone")}
              options={getMilestoneFilterOptions()}
            />
            <Dropdown
              value={filters.projectStatus}
              onChange={handleFilterChange("projectStatus")}
              options={getStatusFilterOptions()}
            />
            <Dropdown
              value={filters.completionRange}
              onChange={handleFilterChange("completionRange")}
              options={getCompletionRangeOptions()}
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div className="pp-table-card">
          {loading ? (
            <PageLoader minHeight="300px" />
          ) : (
            <>
              <div className="pp-table-scroll">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>
                        Project ID
                      </th>
                      <th>
                        Project
                      </th>
                      <th>Customer</th>
                      <th>
                        Completion
                      </th>
                      <th>Milestones</th>
                      <th>
                        Health
                      </th>
                      <th>
                        Timeline
                      </th>
                      <th>Actual Cost</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <TableEmptyState colSpan={10} title="No approved projects found" subtitle="Try adjusting your search or filters." />
                    ) : (
                      filtered.map((p) => (
                  <tr key={p.id}>
                     <td>
                      <div className="pp-project-cell">
                        <span className="pp-project-id">{p.id}</span>
                      </div>
                    </td>
                    <td>
                      <div className="pp-project-cell">
                        <span className="pp-project-name">{p.projectName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="pp-customer-cell">
                        <span className="pp-customer-name">
                          {p.customerName}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="pp-pct-cell">
                        <div className="pp-pct-bar-wrap">
                          <div className="pp-pct-bar">
                            <div
                              className="pp-pct-fill"
                              style={{
                                width: `${p.completionPercentage}%`,
                                background:
                                  p.completionPercentage === 100
                                    ? "#16a34a"
                                    : p.delayStatus === "Yes"
                                      ? "#dc2626"
                                      : p.completionPercentage >= 50
                                        ? "#2563eb"
                                        : "#f59e0b",
                              }}
                            />
                          </div>
                          <span
                            className={`pp-pct-num ${p.completionPercentage === 100 ? "pp-pct-done" : ""}`}
                          >
                            {p.completionPercentage}%
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="pp-ms-cell">
                        {renderMilestoneBar(p)}
                        <span className="pp-ms-current">
                          {getCurrentMilestone(p.milestones)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`pp-health-badge ${getHealthClass(p.healthScore)}`}
                      >
                        {p.healthScore}
                      </span>
                    </td>
                    <td>
                      <div className="pp-timeline-cell">
                        <span className="pp-date">{p.startDate}</span>
                        <span className="pp-date-arrow">→</span>
                        <span className="pp-date">
                          {p.expectedEndDate || "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="pp-budget-cell">
                        ₹{(p.actualProjectCost || 0).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pp-status-badge ${getStatusClass(p.projectStatus)}`}
                      >
                        {p.projectStatus}
                      </span>
                    </td>
                    <td>
                      <div className="act-actions">
                        <button
                          className="act-btn act-view"
                          title="View Details"
                          onClick={() => openView(p)}
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
                          module="project-progress"
                          onClick={() => {
                            const pId = p.serverId || p._id || p.id;
                            navigate(`/admin/project-progress-activity/${pId}`, {
                              state: { target: { recordId: pId, recordLabel: p.projectId || p.name || p.customerName, module: "project-progress" } },
                            });
                          }}
                          title="View Project Activity Log"
                        />
                        {canDo("project-progress", "edit") && (
                        <button
                          className="act-btn act-edit"
                          title="Edit Project"
                          onClick={() => openFormPage(p)}
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
                        {canDo("project-progress", "delete") && (
                        <button
                          className="act-btn act-delete"
                          title="Delete Project"
                          onClick={() => confirmDelete(p)}
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
          <div className="pp-pagination-row">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={serverTotal || filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              variant="table"
              onPageSizeChange={(size) => {
                setPageSize(Number(size));
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 20, 50, 100]}
              disabled={loading}
            />
          </div>
          </>
          )}
        </div>
      </div>

      {/* View Modal */}
      {renderViewModal()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Project"
        message={`Are you sure you want to delete project "${deleteTarget?.id} — ${deleteTarget?.projectName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteDialog(false);
          setDeleteTarget(null);
        }}
        loading={deleteLoading}
      />

      <ToastRenderer toast={toast} />
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
                  {showLogModal.projectId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Project Phase</span>
                    <span className="cm-status-badge cm-status-active" style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.currentPhase || "Initiation"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Health Status</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>{showLogModal.healthStatus || "Normal"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Start Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.startDate ? new Date(showLogModal.startDate).toLocaleDateString("en-IN") : "—"}
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
                  Project Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Project Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.projectName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customerName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Capacity</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.capacity} kW</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectProgress;