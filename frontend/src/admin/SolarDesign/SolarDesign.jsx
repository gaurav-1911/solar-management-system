import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { solarDesignSchema } from "../../utils/AdminValidation";
import { Pagination, Dropdown, TableLoader, TableEmptyState, PageLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { solarDesignAPI, leadAPI, siteSurveyAPI, quotationAPI } from "../../services";
import { createProfilePdf, formatCurrencyPdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./SolarDesign.css";
import "../SiteSurvey/SiteSurvey.css";

const CAPACITY_OPTIONS = ["All", "3 kW", "5 kW", "7 kW", "10 kW", "15 kW", "20 kW", "25 kW"];
const PANEL_WATTAGE = 400;
const PEAK_SUN_HOURS = 4.5;
const RATE_PER_UNIT = 8.5;
const SELF_CONSUMPTION_RATIO = 0.72;
const SYSTEM_LIFESPAN = 25;
const DESIGN_DRAFT_KEY = "solar.solarDesignDraft.v1";

const initialFormData = {
  customerName: "",
  projectName: "",
  leadId: "",
  monthlyConsumption: "",
  roofLength: "",
  roofWidth: "",
  estimatedSystemCost: "",
};

const normalizeDesign = (doc) => ({
  ...doc,
  id: doc.designId || doc.id || doc._id,
  customerName: doc.customerName || "",
  leadId: doc.leadId || "",
});

function calcRecommendedCapacity(consumption) {
  if (!consumption || consumption <= 0) return 0;
  const raw = consumption / 130;
  return Math.round(raw * 2) / 2;
}

function calcPanels(capacity) {
  if (!capacity || capacity <= 0) return 0;
  return Math.ceil((capacity * 1000) / PANEL_WATTAGE);
}

function calcMonthlyProduction(capacity) {
  if (!capacity || capacity <= 0) return 0;
  return Math.round(capacity * PEAK_SUN_HOURS * 30);
}

function calcAnnualProduction(monthlyProd) {
  return monthlyProd * 12;
}

function calcMonthlySavings(monthlyProd) {
  return Math.round(monthlyProd * SELF_CONSUMPTION_RATIO * RATE_PER_UNIT);
}

function calcAnnualSavings(monthlySavings) {
  return monthlySavings * 12;
}

function calcROI(annualSavings, systemCost) {
  if (!systemCost || systemCost <= 0) return 0;
  // Annual ROI: what % of investment you earn back each year
  return +((annualSavings / systemCost) * 100).toFixed(1);
}

function calcPaybackPeriod(systemCost, annualSavings) {
  if (!annualSavings || annualSavings <= 0) return 0;
  return +((systemCost / annualSavings)).toFixed(1);
}

const SolarDesign = () => {
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [surveys, setSurveys] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [designs, setDesigns] = useState([]);
  const [search, setSearch] = useState("");
  const [capacityFilter, setCapacityFilter] = useState("All");
  const [consumptionMin, setConsumptionMin] = useState("");
  const [consumptionMax, setConsumptionMax] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Aggregates computed over ALL designs server-side (not just the current page).
  const [stats, setStats] = useState({ total: 0, avgCapacity: 0, avgPayback: 0, avgSavings: 0 });
  // Every lead that already has a design — from the stats endpoint, so the form
  // dropdown excludes them no matter which page is currently loaded.
  const [designedLeadIds, setDesignedLeadIds] = useState([]);
  // Lead IDs that already have a quotation — used to disable the
  // "Create Quotation" button so duplicate records cannot be created.
  const [quotedLeadIds, setQuotedLeadIds] = useState([]);

  const [showFormPage, setShowFormPage] = useState(false);

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    if (!searchParams.get("createForLead")) {
      setShowFormPage(false);
    }
  }, [location.key, location.state]);
  const [editingDesign, setEditingDesign] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DESIGN_DRAFT_KEY) || "null")?.savedAt || null; } catch { return null; }
  });

  // Leads from the Lead module — populate the "Select Lead" dropdown and
  // auto-fill the customer name when one is chosen.
  const [leads, setLeads] = useState([]);

  // Only leads that have a completed site survey are eligible for a solar design
  // (the backend enforces the same rule on save).
  const [surveyedLeadIds, setSurveyedLeadIds] = useState([]);
  // Survey records keyed by lead ID — lets the table show each design's linked
  // survey ID and open its details without an extra fetch per row.
  const [surveyByLeadId, setSurveyByLeadId] = useState({});
  // Site survey details shown when the Survey ID is clicked in the table.
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveyDetails, setSurveyDetails] = useState(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  // True once the leads / surveys requests settle so the pre-fill from the Site
  // Survey table can open the form even when an API call fails.
  const [leadsReady, setLeadsReady] = useState(false);
  const [surveysReady, setSurveysReady] = useState(false);

  // When the page is opened from the Site Survey table (?createForLead=L-XXX)
  // the new-design form opens automatically, pre-filled from that survey.
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);

  const formik = useFormik({
    initialValues: { ...initialFormData },
    validationSchema: solarDesignSchema,
    onSubmit: async (values, { resetForm }) => {
      const consumption = parseFloat(values.monthlyConsumption);
      const length = parseFloat(values.roofLength) || 0;
      const width = parseFloat(values.roofWidth) || 0;
      const systemCost = parseFloat(values.estimatedSystemCost) || 0;

      const capacity = calcRecommendedCapacity(consumption);
      const roofArea = length > 0 && width > 0 ? +(length * width).toFixed(2) : 0;
      const panels = calcPanels(capacity);
      const monthlyProd = calcMonthlyProduction(capacity);
      const annualProd = calcAnnualProduction(monthlyProd);
      const monthlySav = calcMonthlySavings(monthlyProd);
      const annualSav = calcAnnualSavings(monthlySav);
      const roi = calcROI(annualSav, systemCost);
      const payback = calcPaybackPeriod(systemCost, annualSav);

      const payload = {
        customerName: values.customerName.trim(),
        projectName: values.projectName.trim(),
        leadId: values.leadId.trim(),
        monthlyConsumption: consumption,
        roofLength: length > 0 ? length : null,
        roofWidth: width > 0 ? width : null,
        estimatedSystemCost: systemCost > 0 ? systemCost : null,
        recommendedCapacity: capacity,
        roofArea,
        panelCount: panels,
        monthlyProduction: monthlyProd,
        annualProduction: annualProd,
        monthlySavings: monthlySav,
        annualSavings: annualSav,
        roi,
        paybackPeriod: payback,
      };

      setLoading(true);
      try {
        if (editingDesign) {
          // Demo rows (no _id) keep the old local-only update; DB rows go through the API
          if (!editingDesign._id) {
            setDesigns((prev) =>
              prev.map((d) =>
                d.id === editingDesign.id
                  ? { ...d, ...payload }
                  : d
              )
            );
            success(`Design ${editingDesign.id} updated successfully`);
          } else {
            const res = await solarDesignAPI.update(editingDesign._id, payload);
            success(`Design ${res.data?.data?.designId || editingDesign.id} updated successfully`);
          }
        } else {
          const res = await solarDesignAPI.create(payload);
          success(`Design ${res.data?.data?.designId || "design"} created successfully`);
        }
        setShowFormPage(false);
        setEditingDesign(null);
        resetForm();
        localStorage.removeItem(DESIGN_DRAFT_KEY);
        setDraftSavedAt(null);
        // Reload the current page + stats so the table and cards reflect the change.
        await Promise.all([fetchDesigns(), fetchStats()]);
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save design. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });

  const saveDesignDraft = () => {
    const savedAt = new Date().toISOString();
    localStorage.setItem(DESIGN_DRAFT_KEY, JSON.stringify({ values: formik.values, savedAt }));
    setDraftSavedAt(savedAt);
    success("Solar design draft saved on this device.");
  };

  const discardDesignDraft = () => {
    localStorage.removeItem(DESIGN_DRAFT_KEY);
    setDraftSavedAt(null);
    success("Saved solar design draft discarded.");
  };

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [loading, setLoading] = useState(true);

  // Guards against out-of-order responses when the user pages / filters fast:
  // only the LATEST request may write to state.
  const fetchSeqRef = useRef(0);

  /* ── Server-side fetch of the CURRENT page (filters applied server-side) ── */
  const fetchDesigns = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (capacityFilter !== "All") params.capacity = parseInt(capacityFilter, 10);
      const min = parseFloat(consumptionMin);
      const max = parseFloat(consumptionMax);
      if (!isNaN(min)) params.minConsumption = min;
      if (!isNaN(max)) params.maxConsumption = max;
      const res = await solarDesignAPI.getAll(params);
      if (res.data?.success && seq === fetchSeqRef.current) {
        setDesigns((res.data.data || []).map(normalizeDesign));
        setServerTotal(res.data.pagination?.total || 0);
      }
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        console.warn("Failed to load solar designs:", err?.message);
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, pageSize, debouncedSearch, capacityFilter, consumptionMin, consumptionMax]);

  // Aggregate stats + designed lead IDs, computed over ALL designs server-side.
  const fetchStats = useCallback(async () => {
    try {
      const res = await solarDesignAPI.getStats();
      if (res.data?.success && res.data?.data) {
        setStats(res.data.data);
        setDesignedLeadIds(res.data.data.designedLeadIds || []);
      }
    } catch (err) {
      console.warn("Failed to load solar design stats:", err?.message);
    }
  }, []);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Refetch the table whenever page / size / filters change ── */
  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  /* ── Fetch stats once on mount (and again after mutations) ── */
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Load completed site surveys for the "Select Project" dropdown.
  useEffect(() => {
    let cancelled = false;
    const loadLeads = async () => {
      try {
        const res = await leadAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        if (!cancelled) {
          setLeads(docs);
        }
      } catch (err) {
        // Backend unreachable - dropdown stays empty but the form still works
        console.warn("Failed to load leads:", err?.message);
      } finally {
        if (!cancelled) setLeadsReady(true);
      }
    };
    const loadSurveys = async () => {
      try {
        const res = await siteSurveyAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        const ids = docs
          .filter((s) => s.visitStatus === "Completed" && s.leadId)
          .map((s) => s.leadId);
        const map = {};
        docs.forEach((s) => {
          if (s.leadId) map[s.leadId] = { ...s, id: s.surveyId || s.id || s._id };
        });
        if (!cancelled) {
          setSurveys(docs);
          setSurveyedLeadIds([...new Set(ids)]);
          setSurveyByLeadId(map);
        }
      } catch (err) {
        console.warn("Failed to load site surveys:", err?.message);
      } finally {
        if (!cancelled) setSurveysReady(true);
      }
    };
    loadLeads();
    loadSurveys();
    return () => { cancelled = true; };
  }, []);

  // Load which leads already have a quotation so the "Create Quotation"
  // button can be disabled for those rows.
  useEffect(() => {
    let cancelled = false;
    quotationAPI.getAll({ page: 1, limit: 1000 }).then((res) => {
      if (!cancelled) {
        const ids = (res.data?.data || []).map((q) => q.leadId).filter(Boolean);
        setQuotedLeadIds([...new Set(ids)]);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Capture the pre-fill target (from the Site Survey table) once and consume
  // the URL params so revisiting the module doesn't re-open the form.
  useEffect(() => {
    const leadId = (searchParams.get("createForLead") || "").trim();
    if (!leadId) return;
    prefillRef.current = {
      leadId,
      customerName: (searchParams.get("customerName") || "").trim(),
      projectName: (searchParams.get("projectName") || "").trim(),
    };
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill || prefillAppliedRef.current || !leadsReady || !surveysReady) return;
    prefillAppliedRef.current = true;
    const lead = leads.find((l) => (l.leadId || l.id) === prefill.leadId);
    if (lead) {
      handleProjectSelect(prefill.leadId);
    } else {
      formik.setFieldValue("leadId", prefill.leadId);
    }
    if (prefill.customerName) formik.setFieldValue("customerName", prefill.customerName);
    if (prefill.projectName) formik.setFieldValue("projectName", prefill.projectName);
    setShowFormPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsReady, surveysReady]);

  const projectOptions = useMemo(() => {
    // All lead IDs that already have a design (from the stats endpoint), so the
    // dropdown excludes them no matter which page is currently loaded.
    const usedLeadIds = new Set(designedLeadIds);
    if (editingDesign?.leadId) {
      usedLeadIds.delete(editingDesign.leadId);
    }
    const opts = surveys
      .filter((s) => s.leadId && !usedLeadIds.has(s.leadId))
      .sort((a, b) => (a.projectName || "").localeCompare(b.projectName || ""))
      .map((s) => ({ value: s.leadId, label: s.projectName || s.customerName || s.leadId }));
    if (editingDesign?.leadId && !opts.some((o) => o.value === editingDesign.leadId)) {
      const editingSurvey = surveys.find((s) => s.leadId === editingDesign.leadId);
      opts.unshift({ value: editingDesign.leadId, label: editingSurvey?.projectName || editingDesign.projectName || editingDesign.leadId });
    }
    // A lead pre-selected from the Site Survey table must stay selectable even
    // when it already has a design (so the form value never disappears).
    const prefill = prefillRef.current;
    if (prefill?.leadId && !opts.some((o) => o.value === prefill.leadId)) {
      opts.unshift({
        value: prefill.leadId,
        label: prefill.projectName || (prefill.customerName ? `${prefill.leadId} — ${prefill.customerName}` : prefill.leadId),
      });
    }
    return opts;
  }, [surveys, editingDesign, designedLeadIds]);
  // Backward-compat alias in case any other code references leadOptions.
  const leadOptions = projectOptions;

  // Selecting a project auto-fills customer name, roof dimensions and monthly
  // units directly from the site survey — no extra API call needed.
  const handleProjectSelect = (leadId) => {
    formik.setFieldValue("leadId", leadId);
    formik.setFieldValue("customerName", "");
    formik.setFieldValue("projectName", "");
    formik.setFieldValue("roofLength", "");
    formik.setFieldValue("roofWidth", "");
    formik.setFieldValue("monthlyConsumption", "");
    if (!leadId) return;
    const survey = surveys.find((s) => s.leadId === leadId);
    if (survey) {
      formik.setFieldValue("customerName", survey.customerName || "");
      formik.setFieldValue("projectName", survey.projectName || "");
      formik.setFieldValue("roofLength", survey.roofLength != null ? String(survey.roofLength) : "");
      formik.setFieldValue("roofWidth", survey.roofWidth != null ? String(survey.roofWidth) : "");
      formik.setFieldValue("monthlyConsumption", survey.monthlyUnits != null ? String(survey.monthlyUnits) : "");
    }
  };

  // Auto-calculated values from form
  const autoValues = useMemo(() => {
    const consumption = parseFloat(formik.values.monthlyConsumption);
    const length = parseFloat(formik.values.roofLength);
    const width = parseFloat(formik.values.roofWidth);
    const systemCost = parseFloat(formik.values.estimatedSystemCost);

    const capacity = calcRecommendedCapacity(consumption);
    const roofArea = (!isNaN(length) && !isNaN(width) && length > 0 && width > 0) ? +(length * width).toFixed(2) : 0;
    const panels = calcPanels(capacity);
    const monthlyProd = calcMonthlyProduction(capacity);
    const annualProd = calcAnnualProduction(monthlyProd);
    const monthlySav = calcMonthlySavings(monthlyProd);
    const annualSav = calcAnnualSavings(monthlySav);
    const roi = calcROI(annualSav, systemCost);
    const payback = calcPaybackPeriod(systemCost, annualSav);

    return { capacity, roofArea, panels, monthlyProd, annualProd, monthlySav, annualSav, roi, payback };
  }, [formik.values.monthlyConsumption, formik.values.roofLength, formik.values.roofWidth, formik.values.estimatedSystemCost]);

  // Lock main scroll when modals open
  const anyModalOpen = showViewModal || showDeleteDialog;

  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    if (anyModalOpen) {
      content.style.overflow = 'hidden';
    } else {
      content.style.overflow = '';
    }
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);

  // The server already filters + sorts (createdAt desc = newest first) and
  // returns only the current page, so the table renders `designs` directly.
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // Clamp the page when the total shrinks (delete / filter change).
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, serverTotal, pageSize]);

  // CRUD
  const openFormPage = (design = null) => {
    if (design) {
      setEditingDesign(design);
      formik.setValues({
        customerName: design.customerName,
        projectName: design.projectName || "",
        leadId: design.leadId,
        monthlyConsumption: String(design.monthlyConsumption),
        roofLength: design.roofLength != null ? String(design.roofLength) : "",
        roofWidth: design.roofWidth != null ? String(design.roofWidth) : "",
        estimatedSystemCost: design.estimatedSystemCost != null ? String(design.estimatedSystemCost) : "",
      });
    } else {
      setEditingDesign(null);
      try {
        const draft = JSON.parse(localStorage.getItem(DESIGN_DRAFT_KEY) || "null");
        if (draft?.values) {
          formik.setValues({ ...initialFormData, ...draft.values });
          setDraftSavedAt(draft.savedAt || null);
        } else {
          formik.resetForm();
        }
      } catch {
        formik.resetForm();
      }
    }
    setShowFormPage(true);
  };

  const openViewModal = (design) => {
    setSelectedDesign(design);
    setShowViewModal(true);
  };

  // Time helper matching the Site Survey module (24h "HH:MM" -> 12h).
  const formatTime12h = (time24) => {
    if (!time24) return "—";
    const [h, m] = String(time24).split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  };

  const getSurveyStatusClass = (status) => {
    switch (status) {
      case "Completed": return "ss-badge-completed";
      case "Scheduled": return "ss-badge-scheduled";
      case "Cancelled": return "ss-badge-cancelled";
      default: return "";
    }
  };

  const openSurveyModal = async (design) => {
    if (!design || !design.leadId) return;
    setShowSurveyModal(true);
    setSurveyDetails(null);
    setSurveyLoading(true);
    const cached = surveyByLeadId[design.leadId];
    if (cached) {
      setSurveyDetails(cached);
      setSurveyLoading(false);
      return;
    }
    try {
      const res = await siteSurveyAPI.getAll({ page: 1, limit: 1, leadId: design.leadId });
      const found = res.data?.data?.[0];
      if (found) {
        setSurveyDetails({ ...found, id: found.surveyId || found.id || found._id });
      } else {
        toastError("Site survey not found for this design");
        setShowSurveyModal(false);
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to load site survey details");
      setShowSurveyModal(false);
    } finally {
      setSurveyLoading(false);
    }
  };

  const confirmDelete = (design) => {
    setDeleteTarget(design);
    setShowDeleteDialog(true);
  };

  const handleCreateQuotation = (design) => {
    if (!design.leadId) return;
    const params = new URLSearchParams({
      createForDesign: design.designId || design.id || "",
      leadId: design.leadId,
      client: design.customerName || "",
      projectName: design.projectName || "",
    });
    navigate(`/admin/quotations?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      return;
    }
    setDeleteLoading(true);
    try {
      if (deleteTarget._id) {
        await solarDesignAPI.delete(deleteTarget._id);
        success(`Design ${deleteTarget.id} deleted successfully`);
        await Promise.all([fetchDesigns(), fetchStats()]);
      } else {
        setDesigns((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        success(`Design ${deleteTarget.id} deleted successfully`);
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete design. Please try again.");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

const downloadDesignLog = async (design) => {
  const payback =
    design.paybackPeriod >= 1
      ? `${design.paybackPeriod.toFixed(1)} Years`
      : `${(design.paybackPeriod * 12).toFixed(0)} Months`;

  const doc = await createProfilePdf({
    bannerName: design.customerName,
    bannerSubtitle: `Design ID: ${design.id}`,
    bannerRight: [`Lead ID: ${design.leadId || "—"}`],
    sections: [
      {
        title: "Consumption & Production",
        fields: [
          ["Monthly Consumption", `${design.monthlyConsumption} kWh`],
          ["Monthly Production", `${(design.monthlyProduction || 0).toLocaleString("en-IN")} kWh`],
          ["Annual Production", `${(design.annualProduction || 0).toLocaleString("en-IN")} kWh`],
        ],
      },
      {
        title: "System Design",
        fields: [
          ["Recommended Capacity", `${design.recommendedCapacity} kW`],
          ["Roof Area", `${design.roofArea} m²`],
          ["Roof Dimensions", `${design.roofLength} m × ${design.roofWidth} m`],
          ["Panel Count", design.panelCount],
        ],
      },
      {
        title: "Financials",
        fields: [
          ["Estimated System Cost", formatCurrencyPdf(design.estimatedSystemCost)],
          ["Monthly Savings", formatCurrencyPdf(design.monthlySavings)],
          ["Annual Savings", formatCurrencyPdf(design.annualSavings)],
          ["ROI", `${design.roi}%`],
          ["Payback Period", payback],
        ],
      },
    ],
  });

  const safeCustomer = (design.customerName || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`DesignLog_${safeCustomer}.pdf`);

  success("Design log downloaded successfully");
};



  const formatCurrency = (val) => (val != null && !isNaN(val) ? `₹${Number(val).toLocaleString("en-IN")}` : "₹0");

  const renderFormPage = () => (
    <div className="sd-form-page">
      <div className="sd-form-page-header">
        <button className="sd-btn sd-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Designs
        </button>
        <h2>{editingDesign ? `Edit Design ${editingDesign.id}` : "New Solar System Design"}</h2>
      </div>

        <form onSubmit={formik.handleSubmit} className="sd-form-page-body" noValidate>
          {!editingDesign && draftSavedAt && !prefillRef.current && (
            <div className="sd-draft-notice">
              <span>Draft restored — last saved {new Date(draftSavedAt).toLocaleString("en-IN")}.</span>
              <button type="button" onClick={discardDesignDraft}>Discard draft</button>
            </div>
          )}
          {/* Section 1: Monthly Consumption */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">1</span>
              <h4>Monthly Consumption Analysis</h4>
            </div>
            <div className="sd-form-grid">
              <div className="sd-form-field">
                <label>Select Project <span className="sd-required">*</span></label>
                <Dropdown
                  value={formik.values.leadId}
                  onChange={handleProjectSelect}
                  options={leadOptions.length > 0 ? [{ value: "", label: "Select Project" }, ...leadOptions] : []}
                  placeholder="Select Project"
                  emptyMessage={surveys.length === 0 ? "No completed site surveys — complete a survey first" : "No available projects — all projects already have a solar design"}
                  variant="form"
                  disabled={!!editingDesign}
                />
                {formik.errors.leadId && formik.touched.leadId && <span className="sd-field-error">{formik.errors.leadId}</span>}
              </div>
              <div className="sd-form-field">
                <label>Customer Name</label>
                <input
                  type="text"
                  name="customerName"
                  value={formik.values.customerName}
                  readOnly
                  title="Auto-filled from the selected project's site survey"
                  placeholder="Select a project to fill customer name"
                  className="sd-input-readonly"
                />
              </div>
              <div className="sd-form-field sd-full-width">
                <label>Monthly Electricity Consumption (Units/kWh) <span className="sd-required">*</span> <span title="Auto-filled from the site survey">(from survey)</span></label>
                <input type="text" name="monthlyConsumption" value={formik.values.monthlyConsumption} onChange={formik.handleChange} readOnly placeholder="Auto-filled from survey" className={formik.errors.monthlyConsumption && formik.touched.monthlyConsumption ? "sd-input-error" : ""} />
                {formik.errors.monthlyConsumption && formik.touched.monthlyConsumption && <span className="sd-field-error">{formik.errors.monthlyConsumption}</span>}
                {formik.values.monthlyConsumption && !formik.errors.monthlyConsumption && (
                  <span className="sd-field-hint">Auto-filled from site survey — {parseFloat(formik.values.monthlyConsumption).toLocaleString("en-IN")} Units/month</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Capacity Recommendation */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">2</span>
              <h4>Capacity Recommendation</h4>
            </div>
            <div className="sd-result-card">
              <div className="sd-result-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              <div className="sd-result-content">
                <span className="sd-result-value">{autoValues.capacity > 0 ? `${autoValues.capacity} kW` : "—"}</span>
                <span className="sd-result-label">Recommended Solar Capacity</span>
              </div>
            </div>
          </div>

          {/* Section 3: Roof Area */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">3</span>
              <h4>Roof Area Calculation</h4>
            </div>
            <div className="sd-form-grid sd-form-grid-3">
              <div className="sd-form-field">
                <label>Roof Length (Meters) <span title="Auto-filled from the site survey">(from survey)</span></label>
                <input type="text" name="roofLength" value={formik.values.roofLength} onChange={formik.handleChange} readOnly placeholder="Auto-filled from survey" className={formik.errors.roofLength && formik.touched.roofLength ? "sd-input-error" : ""} />
                {formik.errors.roofLength && formik.touched.roofLength && <span className="sd-field-error">{formik.errors.roofLength}</span>}
              </div>
              <div className="sd-form-field">
                <label>Roof Width (Meters) <span title="Auto-filled from the site survey">(from survey)</span></label>
                <input type="text" name="roofWidth" value={formik.values.roofWidth} onChange={formik.handleChange} readOnly placeholder="Auto-filled from survey" className={formik.errors.roofWidth && formik.touched.roofWidth ? "sd-input-error" : ""} />
                {formik.errors.roofWidth && formik.touched.roofWidth && <span className="sd-field-error">{formik.errors.roofWidth}</span>}
              </div>
              <div className="sd-form-field">
                <label>Total Roof Area (sq. meters)</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{autoValues.roofArea > 0 ? `${autoValues.roofArea} m²` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Panels */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">4</span>
              <h4>Number of Panels Calculation</h4>
            </div>
            <div className="sd-form-grid sd-form-grid-3">
              <div className="sd-form-field">
                <label>Panel Capacity (W)</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{PANEL_WATTAGE} W</span>
                </div>
              </div>
              <div className="sd-form-field">
                <label>Number of Panels Required</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{autoValues.panels > 0 ? autoValues.panels : "—"}</span>
                </div>
              </div>
              <div className="sd-form-field">
                <label>Total System Capacity</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{autoValues.capacity > 0 ? `${autoValues.capacity} kW` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Energy Production */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">5</span>
              <h4>Energy Production Estimation</h4>
            </div>
            <div className="sd-form-grid sd-form-grid-2">
              <div className="sd-form-field">
                <label>Estimated Monthly Energy Production</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{autoValues.monthlyProd > 0 ? `${autoValues.monthlyProd.toLocaleString("en-IN")} kWh` : "—"}</span>
                </div>
              </div>
              <div className="sd-form-field">
                <label>Estimated Annual Energy Production</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">{autoValues.annualProd > 0 ? `${autoValues.annualProd.toLocaleString("en-IN")} kWh` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: ROI */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">6</span>
              <h4>ROI Calculation</h4>
            </div>
            <div className="sd-form-grid sd-form-grid-2">
              <div className="sd-form-field">
                <label>Estimated System Cost (₹)</label>
                <input type="text" name="estimatedSystemCost" value={formik.values.estimatedSystemCost} onChange={formik.handleChange} placeholder="e.g. 385000" maxLength={12} className={formik.errors.estimatedSystemCost && formik.touched.estimatedSystemCost ? "sd-input-error" : ""} />
                {formik.errors.estimatedSystemCost && formik.touched.estimatedSystemCost && <span className="sd-field-error">{formik.errors.estimatedSystemCost}</span>}
              </div>
              <div className="sd-form-field">
                <label>Estimated Return on Investment (ROI)</label>
                <div className="sd-calculated-field">
                  <span className="sd-calculated-value">
                    {autoValues.roi > 0 && formik.values.estimatedSystemCost ? `${autoValues.roi}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 7: Savings */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">7</span>
              <h4>Savings Calculation</h4>
            </div>
            <div className="sd-form-grid sd-form-grid-2">
              <div className="sd-form-field">
                <label>Estimated Monthly Savings</label>
                <div className="sd-calculated-field sd-savings-field">
                  <span className="sd-calculated-value sd-savings-value">
                    {autoValues.monthlySav > 0 ? formatCurrency(autoValues.monthlySav) : "—"}
                  </span>
                </div>
              </div>
              <div className="sd-form-field">
                <label>Estimated Annual Savings</label>
                <div className="sd-calculated-field sd-savings-field">
                  <span className="sd-calculated-value sd-savings-value">
                    {autoValues.annualSav > 0 ? formatCurrency(autoValues.annualSav) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 8: Payback Period */}
          <div className="sd-form-section">
            <div className="sd-section-header">
              <span className="sd-section-number">8</span>
              <h4>Payback Period Calculation</h4>
            </div>
            <div className="sd-form-grid">
              <div className="sd-form-field sd-full-width">
                <label>Estimated Payback Period</label>
                <div className="sd-payback-display">
                  {autoValues.payback > 0 && formik.values.estimatedSystemCost ? (
                    <>
                      <span className="sd-payback-value">
                        {autoValues.payback >= 1
                          ? `${autoValues.payback.toFixed(1)} Years`
                          : `${(autoValues.payback * 12).toFixed(0)} Months`}
                      </span>
                      <span className="sd-payback-note">
                        Based on system cost of {formik.values.estimatedSystemCost ? formatCurrency(parseFloat(formik.values.estimatedSystemCost)) : "₹0"} and annual savings of {autoValues.annualSav > 0 ? formatCurrency(autoValues.annualSav) : "₹0"}
                      </span>
                    </>
                  ) : (
                    <span className="sd-payback-placeholder">Enter monthly consumption and system cost to calculate</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="sd-form-page-footer">
            <button type="button" className="sd-btn sd-btn-cancel" onClick={() => setShowFormPage(false)}>Cancel</button>
            {!editingDesign && <button type="button" className="sd-btn sd-btn-secondary" onClick={saveDesignDraft} disabled={loading}>Save Draft</button>}
            <button type="submit" className="sd-btn sd-btn-primary" disabled={loading}>
              {loading ? (
                <><span className="sd-spinner"></span> {editingDesign ? "Updating..." : "Saving..."}</>
              ) : (
                <>{editingDesign ? "Update Design" : "Save Design"}</>
              )}
            </button>
          </div>
        </form>
    </div>
  );

  const renderViewModal = () => {
    if (!selectedDesign) return null;
    const d = selectedDesign;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>Design Details — {d.id}</h3>
            </div>
            <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="sd-view-grid-2">
              <div className="sd-view-card sd-view-card-consumption">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg> Monthly Consumption</h4>
                <span className="sd-view-card-value">{d.monthlyConsumption} kWh</span>
              </div>
              <div className="sd-view-card sd-view-card-capacity">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></svg> Recommended Capacity</h4>
                <span className="sd-view-card-value">{d.recommendedCapacity} kW</span>
              </div>
              <div className="sd-view-card sd-view-card-roof">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 22L12 2l10 20H2z" /></svg> Roof Area</h4>
                <span className="sd-view-card-value">{d.roofArea} m²</span>
              </div>
              <div className="sd-view-card sd-view-card-panels">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg> Number of Panels</h4>
                <span className="sd-view-card-value">{d.panelCount} × {PANEL_WATTAGE}W</span>
              </div>
            </div>

            <div className="sd-view-grid-3">
              <div className="sd-view-info-card">
                <span className="sd-view-label">Design ID</span>
                <span className="sd-view-value">{d.id}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Customer Name</span>
                <span className="sd-view-value">{d.customerName}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Lead ID</span>
                <span className="sd-view-value">{d.leadId}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Monthly Production</span>
                <span className="sd-view-value">{(d.monthlyProduction || 0).toLocaleString("en-IN")} kWh</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Annual Production</span>
                <span className="sd-view-value">{(d.annualProduction || 0).toLocaleString("en-IN")} kWh</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">System Cost</span>
                <span className="sd-view-value">{formatCurrency(d.estimatedSystemCost)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Monthly Savings</span>
                <span className="sd-view-value sd-value-green">{formatCurrency(d.monthlySavings)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Annual Savings</span>
                <span className="sd-view-value sd-value-green">{formatCurrency(d.annualSavings)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">ROI</span>
                <span className="sd-view-value sd-value-blue">{d.roi}%</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Payback Period</span>
                <span className="sd-view-value sd-value-purple">                      {d.paybackPeriod >= 1 ? `${d.paybackPeriod.toFixed(1)} Years` : `${(d.paybackPeriod * 12).toFixed(0)} Months`}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Roof Dimensions</span>
                <span className="sd-view-value">{d.roofLength != null && d.roofWidth != null ? `${d.roofLength} m × ${d.roofWidth} m` : "—"}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Panel Wattage</span>
                <span className="sd-view-value">{PANEL_WATTAGE} W</span>
              </div>
            </div>
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowViewModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const renderSurveyModal = () => {
    const s = surveyDetails;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>Survey Details — {s ? s.id : "..."}</h3>
              {s?.customerName && <span className="vm-modal-subtitle">{s.customerName}</span>}
            </div>
            <button className="vm-modal-close" onClick={() => setShowSurveyModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            {!s ? (
              <PageLoader minHeight="200px" />
            ) : (
              <>
                <div className="ss-view-section">
                  <h4>Visit Information</h4>
                  <div className="ss-view-grid">
                    <div className="ss-view-item"><span className="ss-view-label">Survey ID</span><span className="ss-view-value">{s.id}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Lead ID</span><span className="ss-view-value">{s.leadId || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Customer ID</span><span className="ss-view-value">{s.customerId || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Customer Name</span><span className="ss-view-value">{s.customerName}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Project Type</span><span className="ss-view-value">{s.projectType || "Residential"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Technician</span><span className="ss-view-value">{s.technicianName || s.technicianId || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Visit Date</span><span className="ss-view-value">{s.visitDate}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Visit Time</span><span className="ss-view-value">{formatTime12h(s.visitTime)}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Visit Status</span><span className={`ss-badge ${getSurveyStatusClass(s.visitStatus)}`}>{s.visitStatus}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Notes</span><span className="ss-view-value">{s.notes || "—"}</span></div>
                  </div>
                </div>

                <div className="ss-view-section">
                  <h4>Roof Information</h4>
                  <div className="ss-view-grid">
                    <div className="ss-view-item"><span className="ss-view-label">Roof Type</span><span className="ss-view-value">{s.roofType || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Roof Area</span><span className="ss-view-value">{s.roofArea != null ? `${s.roofArea} m²` : "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Roof Length</span><span className="ss-view-value">{s.roofLength != null ? `${s.roofLength} m` : "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Roof Width</span><span className="ss-view-value">{s.roofWidth != null ? `${s.roofWidth} m` : "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Roof Angle</span><span className="ss-view-value">{s.roofAngle != null ? `${s.roofAngle}°` : "—"}</span></div>
                  </div>
                </div>

                <div className="ss-view-section">
                  <h4>Shadow & GPS</h4>
                  <div className="ss-view-grid">
                    <div className="ss-view-item"><span className="ss-view-label">Shadow Analysis</span><span className="ss-view-value">{s.shadowAnalysis || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Shadow Notes</span><span className="ss-view-value">{s.shadowNotes || "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">Monthly Units</span><span className="ss-view-value">{s.monthlyUnits != null ? `${s.monthlyUnits} kWh` : "—"}</span></div>
                    <div className="ss-view-item"><span className="ss-view-label">GPS Location</span><span className="ss-view-value">{s.gpsLocation || "—"}</span></div>
                  </div>
                </div>

                <div className="ss-view-section">
                  <h4>Files & Photos</h4>
                  <div className="ss-view-documents-grid">
                    <div className="ss-view-item">
                      <span className="ss-view-label">Electricity Bill</span>
                      <span className="ss-view-value">{s.electricityBill?.name || "Not uploaded"}</span>
                    </div>
                    <div className="ss-view-item">
                      <span className="ss-view-label">Site Photos</span>
                      <span className="ss-view-value">{(s.sitePhotos || []).length > 0 ? `${s.sitePhotos.length} photo(s) uploaded` : "No photos uploaded"}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowSurveyModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="solar-design-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="sd-page">
      {showFormPage ? renderFormPage() : (
        <>
      {/* Page Header */}
      <div className="sd-header">
        <div>
          <h1 className="sd-title">Solar System Design</h1>
          <p className="sd-subtitle">Design solar systems, calculate ROI, payback periods, and energy savings for customers.</p>
        </div>
        <div className="sd-header-actions">
          {canDo("solar-design", "create") && (
          <button className="sd-btn sd-btn-primary" onClick={() => openFormPage()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Design
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="sd-stats-grid">
        <StatCard
          title="Total Designs"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" /></svg>}
          color="blue"
        />
        <StatCard
          title="Avg Capacity"
          value={`${stats.avgCapacity.toFixed(1)} kW`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></svg>}
          color="orange"
        />
        <StatCard
          title="Avg Payback"
          value={`${stats.avgPayback.toFixed(1)} yrs`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="purple"
        />
        <StatCard
          title="Avg Monthly Savings"
          value={`${formatCurrency(stats.avgSavings)}/mo`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="green"
        />
      </div>

      {/* Toolbar */}
      <div className="sd-toolbar">
        <div className="sd-toolbar-row">
          <div className="sd-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by ID, Customer, or Project" />
            {search && (
              <button className="sd-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={capacityFilter} onChange={(val) => { setCapacityFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Capacity" }, ...CAPACITY_OPTIONS.filter(o => o !== "All").map((opt) => ({ value: opt, label: opt }))]} />
          <input type="number" className="sd-inline-input" value={consumptionMin} onChange={(e) => { setConsumptionMin(e.target.value); setCurrentPage(1); }} placeholder="Min Units" min="0" title="Min Consumption" />
          <input type="number" className="sd-inline-input" value={consumptionMax} onChange={(e) => { setConsumptionMax(e.target.value); setCurrentPage(1); }} placeholder="Max Units" min="0" title="Max Consumption" />

        </div>
      </div>

      {/* Table */}
      <div className="sd-table-card">
        {loading ? (
          <PageLoader minHeight="300px" />
        ) : (
          <>
            <div className="sd-table-wrapper">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Design ID</th>
                    <th>Survey</th>
                    <th>Project</th>
                    <th>Customer Name</th>
                    <th>Monthly Consumption</th>
                    <th>Recommended Capacity</th>
                    <th>Roof Area</th>
                    <th>No. of Panels</th>
                    <th>Est. Savings</th>
                    <th>Payback Period</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {designs.length === 0 ? (
                    <TableEmptyState colSpan={11} title="No solar designs found" subtitle="Try adjusting your search or filters." />
                  ) : (
                    designs.map((design) => (
                      <tr key={design.id}>
                        <td className="sd-td-id">{design.id}</td>
                        <td>
                          <button
                            className="sd-survey-link"
                            onClick={() => openSurveyModal(design)}
                            title="View site survey details"
                          >
                            {surveyByLeadId[design.leadId]?.id || "—"}
                          </button>
                        </td>
                        <td className="sd-td-project">{design.projectName || "—"}</td>
                        <td className="sd-td-name">{design.customerName}</td>
                        <td><strong>{design.monthlyConsumption}</strong> kWh</td>
                        <td><span className="sd-capacity-badge">{design.recommendedCapacity} kW</span></td>
                        <td>{design.roofArea ? `${design.roofArea} sq ft` : "—"}</td>
                        <td>{design.panelCount ? `${design.panelCount} panels` : "—"}</td>
                        <td className="sd-td-amount">{design.annualSavings ? formatCurrency(design.annualSavings) : "—"}/yr</td>
                        <td>{design.paybackPeriod ? `${design.paybackPeriod} yrs` : "—"}</td>
                        <td>
                          <div className="act-actions">
                            <button
                              className="act-btn act-view"
                              onClick={() => { setSelectedDesign(design); setShowViewModal(true); }}
                              title="View details"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <ActivityLogButton
                              module="solar-design"
                              onClick={() => {
                                const designId = design._id || design.id;
                                navigate(`/admin/solar-design-activity/${designId}`, {
                                  state: { target: { recordId: designId, recordLabel: design.designId || design.projectName || design.customerName, module: "solar-design" } },
                                });
                              }}
                              title="View Solar Design Activity Log"
                            />
                            {canDo("solar-design", "edit") && (
                            <button
                              className="act-btn act-edit"
                              onClick={() => openFormPage(design)}
                              title="Edit design"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                            )}
                            {canDo("solar-design", "delete") && (
                            <button
                              className="act-btn act-delete"
                              onClick={() => confirmDelete(design)}
                              title="Delete design"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                            )}
                            {canDo("quotations", "create") && (
                            <button
                              className="sd-quote-btn"
                              disabled={quotedLeadIds.includes(design.leadId)}
                              onClick={() => navigate(`/admin/quotations?createForDesign=${design.id}&leadId=${design.leadId}&customerName=${encodeURIComponent(design.customerName)}&projectName=${encodeURIComponent(design.projectName || "")}&capacity=${design.recommendedCapacity}&monthlyConsumption=${design.monthlyConsumption}`)}
                              title={quotedLeadIds.includes(design.leadId) ? "Quotation already created for this project" : "Create Quotation from this design"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                              Quotation
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

            {/* Pagination */}
            {serverTotal > 0 && (
              <div className="sd-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                  disabled={loading}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showViewModal && renderViewModal()}
      {showSurveyModal && renderSurveyModal()}
        </>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Solar Design"
        message={`Are you sure you want to delete design ${deleteTarget?.id} for ${deleteTarget?.customerName}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
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
                  {showLogModal.designId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Date Logged</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.createdAt ? new Date(showLogModal.createdAt).toLocaleDateString("en-IN") : "—"}
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
                  Design Information
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customerName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Proposed Capacity</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.recommendedCapacity} kW</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Estimated Cost</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.estimatedSystemCost ? `INR ${showLogModal.estimatedSystemCost}` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Payback Period</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.paybackPeriod} Years</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Estimated Savings</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>INR {showLogModal.monthlySavings} / month</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Panel Count</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.panelCount}</div>
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
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadDesignLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default SolarDesign;
