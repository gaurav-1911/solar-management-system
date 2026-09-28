import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { siteSurveySchema, clampNumberInput } from "../../utils/AdminValidation";
import { Pagination, Dropdown, ImageLightbox, TableLoader, TableEmptyState, PageLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { siteSurveyAPI, leadAPI, technicianAPI, customerAPI, solarDesignAPI } from "../../services";
import { createProfilePdf } from "../../utils/pdfLayout";
import { compressImageFile } from "../../utils/imageCompress";
import { getAddressFromCoordinates } from "../../utils/geocoding";
import SolarMap from "../../components/map/SolarMap";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./SiteSurvey.css";


const ROOF_TYPE_OPTIONS = ["RCC Roof", "Metal Roof", "Tile Roof", "Asbestos Roof", "Tin Roof", "Other"];

const SHADOW_OPTIONS = ["No Shadow", "Partial Shadow", "Heavy Shadow"];

const VISIT_STATUSES = ["Scheduled", "Completed", "Cancelled"];
const SURVEY_DRAFT_KEY = "solar.siteSurveyDraft.v1";


const initialFormData = {
  customerName: "",
  projectName: "",
  projectType: "Residential",
  leadId: "",
  technicianId: "",
  technicianName: "",
  visitDate: "",
  visitTime: "",
  visitStatus: "Scheduled",
  notes: "",
  roofType: "",
  customRoofType: "",
  roofLength: "",
  roofWidth: "",
  roofAngle: "",
  shadowAnalysis: "",
  shadowNotes: "",
  monthlyUnits: "",
  latitude: "",
  longitude: "",
  electricityBill: null,
  sitePhotos: [],
  surveyNotes: "",
};


const normalizeSurvey = (doc) => ({
  ...doc,
  id: doc.surveyId || doc.id || doc._id,
  visitDate: doc.visitDate ? toDateInput(doc.visitDate) : doc.visitDate,
  customerName: doc.customerName || "",
  sitePhotos: doc.sitePhotos || [],
});

const toDateInput = (value) => {
  if (!value) return "";
  const str = String(value);
  // Already a bare YYYY-MM-DD (no time component) - pass through unchanged to
  // avoid UTC re-parsing shifts in negative-offset timezones.
  if (str.length === 10 && !str.includes("T")) return str;
  const d = new Date(value);
  if (isNaN(d.getTime())) return str.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/* ── Preview a newly selected (local) file before it is saved ── */
function LocalFilePreview({ file, alt, onZoom }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || "preview"}
      className="ss-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, alt || "preview") : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

// A bill is a PDF when the MIME type says so or the filename ends in .pdf
// (legacy records only stored the name, so the extension is the fallback).
const isPdfBill = (bill) =>
  bill?.mimeType === "application/pdf" || /\.[pP][dD][fF]$/.test(bill?.name || "");

/* ── Preview a newly selected (local) electricity bill (image or PDF) ── */
function LocalBillPreview({ file, alt }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return null;
  return (
    <div className="ss-bill-preview">
      {isPdfBill(file) ? (
        <iframe src={src} title={alt || "bill preview"} className="ss-bill-preview-pdf" />
      ) : (
        <img src={src} alt={alt || "bill preview"} className="ss-bill-preview-img" />
      )}
    </div>
  );
}

const surveyFileCache = new Map();

const getCachedSurveyFile = (key) => surveyFileCache.get(key) || null;

const setCachedSurveyFile = (key, url) => {
  if (surveyFileCache.has(key)) URL.revokeObjectURL(surveyFileCache.get(key));
  surveyFileCache.set(key, url);
  return url;
};

const clearSurveyFileCache = (surveyId) => {
  if (!surveyId) return;
  const prefix = `${surveyId}:`;
  for (const key of [...surveyFileCache.keys()]) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(surveyFileCache.get(key));
      surveyFileCache.delete(key);
    }
  }
};

/* ── Fetch + preview the stored electricity bill from the database (like Documents) ── */
function StoredBillPreview({ surveyId, bill }) {
  const [src, setSrc] = useState("");
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSrc("");
    if (!surveyId || !bill || !bill.hasFile) {
      setStatus("error");
      return undefined;
    }
    const cacheKey = `${surveyId}:bill`;
    const cached = getCachedSurveyFile(cacheKey);
    if (cached) {
      setSrc(cached);
      setStatus("ready");
      return undefined;
    }
    siteSurveyAPI
      .downloadBill(surveyId)
      .then((res) => {
        if (cancelled) return;
        const mime = isPdfBill(bill) ? "application/pdf" : bill?.mimeType || "image/jpeg";
        const typed = res.data?.type === mime ? res.data : new Blob([res.data], { type: mime });
        setSrc(setCachedSurveyFile(cacheKey, URL.createObjectURL(typed)));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, bill]);

  if (status === "error") {
    return (
      <div className="ss-bill-preview-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Failed to load bill preview</span>
      </div>
    );
  }
  if (status !== "ready" || !src) {
    return <div className="ss-bill-preview-loading" />;
  }
  return (
    <div className="ss-bill-preview">
      {isPdfBill(bill) ? (
        <iframe src={src} title={bill.name || "bill preview"} className="ss-bill-preview-pdf" />
      ) : (
        <img src={src} alt={bill.name || "bill preview"} className="ss-bill-preview-img" />
      )}
    </div>
  );
}

/* ── Fetch + preview a stored site photo from the database (like Documents) ── */
function StoredSurveyPhoto({ surveyId, photo, index, onZoom }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!surveyId || !photo || !photo.hasFile) {
      setSrc("");
      return undefined;
    }
    const cacheKey = `${surveyId}:photo:${index}`;
    const cached = getCachedSurveyFile(cacheKey);
    if (cached) {
      setSrc(cached);
      return undefined;
    }
    siteSurveyAPI
      .downloadPhoto(surveyId, index)
      .then((res) => {
        if (cancelled) return;
        const mime = photo?.mimeType || "image/jpeg";
        const typed = res.data?.type === mime ? res.data : new Blob([res.data], { type: mime });
        setSrc(setCachedSurveyFile(cacheKey, URL.createObjectURL(typed)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, photo, index]);

  if (failed) {
    return (
      <div className="ss-photo-preview-error" title="Failed to load photo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  if (!src) {
    return <div className="ss-photo-preview-loading" />;
  }
  return (
    <img
      src={src}
      alt={(photo && photo.name) || "site photo"}
      className="ss-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, (photo && photo.name) || "site photo") : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

/* ── Customer details card (like the Customer page view) ── */
const CustomerDetailsCard = ({ customer }) => {
  if (!customer) return null;
  return (
    <div className="ss-customer-card">
      <div className="ss-customer-card-top">
        <div className="ss-customer-avatar">
          {String(customer.name || "?").charAt(0).toUpperCase()}
        </div>
        <div className="ss-customer-name">
          <h3>{customer.name}</h3>
          <div className="ss-customer-badges">
            <span className="ss-customer-badge ss-customer-badge-id">
              {customer.customerId}
            </span>
            <span className={`ss-customer-badge ss-customer-badge-status ss-customer-badge-${String(customer.status || "").toLowerCase()}`}>
              {customer.status}
            </span>
            <span className="ss-customer-badge ss-customer-badge-type">
              {customer.type}
            </span>
            {customer.leadId && (
              <span className="ss-customer-badge ss-customer-badge-lead">From Lead {customer.leadId}</span>
            )}
          </div>
        </div>
      </div>
      <div className="ss-customer-grid">
        <div className="ss-customer-item">
          <span className="ss-customer-label">Email</span>
          <span className="ss-customer-value">{customer.email}</span>
        </div>
        <div className="ss-customer-item">
          <span className="ss-customer-label">Phone</span>
          <span className="ss-customer-value">{customer.phone}</span>
        </div>
        <div className="ss-customer-item ss-customer-item-wide">
          <span className="ss-customer-label">Address</span>
          <span className="ss-customer-value">{customer.address}</span>
        </div>
        <div className="ss-customer-item">
          <span className="ss-customer-label">Capacity</span>
          <span className="ss-customer-value">{customer.capacity || "—"}</span>
        </div>
        <div className="ss-customer-item">
          <span className="ss-customer-label">Join Date</span>
          <span className="ss-customer-value">{customer.joinDate || "—"}</span>
        </div>
        <div className="ss-customer-item">
          <span className="ss-customer-label">Total Projects</span>
          <span className="ss-customer-value">{customer.totalProjects ?? 0}</span>
        </div>
      </div>
      {customer.notes && (
        <div className="ss-customer-notes">
          <span className="ss-customer-label">Notes</span>
          <p>{customer.notes}</p>
        </div>
      )}
    </div>
  );
};

const SiteSurvey = () => {
  const { success, error: toastError } = useToast();
  const { canDo, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  // Lead IDs that already have a solar design — used to disable the
  // "Create Design" button so duplicate records cannot be created.
  const [designedLeadIds, setDesignedLeadIds] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roofTypeFilter, setRoofTypeFilter] = useState("All");
  const [technicianFilter, setTechnicianFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const location = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [showFormPage, setShowFormPage] = useState(false);

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    if (!searchParams.get("createForLead")) {
      setShowFormPage(false);
    }
  }, [location.key, location.state]);
  const [editingSurvey, setEditingSurvey] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SURVEY_DRAFT_KEY) || "null")?.savedAt || null; } catch { return null; }
  });
  const [viewCustomer, setViewCustomer] = useState(null);
  const [viewCustomerLoading, setViewCustomerLoading] = useState(false);


  const [leads, setLeads] = useState([]);
 
  const [leadsReady, setLeadsReady] = useState(false);
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  const [prefillCustomer, setPrefillCustomer] = useState(null);

  // Technicians from the Technician module — populate the "Technician" dropdown.
  const [technicians, setTechnicians] = useState([]);

  // Customers from the Customer module — used to carry the customer's type
  // (Residential/Commercial/...) over to the survey's Project Type field.
  const [customers, setCustomers] = useState([]);

  // GPS map: live coordinates from the browser + reverse-geocoded address
  const [liveAddress, setLiveAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  // Address for the survey currently open in the view-details modal
  const [viewAddress, setViewAddress] = useState("");
  const [viewGeocoding, setViewGeocoding] = useState(false);

  const formik = useFormik({
    initialValues: { ...initialFormData, visitDate: new Date().toISOString().split("T")[0] },
    validationSchema: siteSurveySchema,
    onSubmit: async (values, { setFieldError }) => {
      if (!values.visitDate) {
        setFieldError("visitDate", "Visit date is required");
        return;
      }
      const minDate = new Date(editingSurvey ? editingSurvey.visitDate : new Date().toISOString().split("T")[0]);
      minDate.setHours(0, 0, 0, 0);
      if (new Date(values.visitDate) < minDate) {
        setFieldError("visitDate", editingSurvey ? `Date cannot be earlier than the original date (${editingSurvey.visitDate})` : "Date cannot be in the past");
        return;
      }
      const area = parseFloat(values.roofLength) * parseFloat(values.roofWidth);

      const payload = {
        customerName: values.customerName.trim(),
        projectName: values.projectName.trim(),
        projectType: values.projectType,
        leadId: values.leadId.trim(),
        technicianId: values.technicianId,
        technicianName: technicians.find((t) => (t.technicianId || t.id) === values.technicianId)?.name || values.technicianName || "",
        visitDate: values.visitDate,
        visitTime: values.visitTime,
        visitStatus: values.visitStatus,
        notes: values.notes.trim(),
        roofType: values.roofType === "Other" ? values.customRoofType.trim() : values.roofType,
        customRoofType: values.roofType === "Other" ? values.customRoofType.trim() : "",
        roofLength: parseFloat(values.roofLength),
        roofWidth: parseFloat(values.roofWidth),
        roofArea: parseFloat(area.toFixed(2)),
        roofAngle: parseFloat(values.roofAngle),
        shadowAnalysis: values.shadowAnalysis,
        shadowNotes: values.shadowNotes.trim(),
        monthlyUnits: parseFloat(values.monthlyUnits) || 0,
        latitude: values.latitude.trim(),
        longitude: values.longitude.trim(),
        surveyNotes: values.surveyNotes.trim(),
      };

      // Local demo rows (no _id) keep the simple { name } metadata shape.
      // Everything saved through the API (new surveys + DB edits) sends the
      // actual file bytes as multipart/form-data, stored in MongoDB like the
      // Documents module. Existing stored files are referenced by keep-indices
      // so their bytes are never re-uploaded.
      let submitData;
      if (editingSurvey && !editingSurvey._id) {
        submitData = { ...payload, electricityBill: values.electricityBill, sitePhotos: values.sitePhotos };
      } else {
        submitData = new FormData();
        Object.keys(payload).forEach((key) => submitData.append(key, payload[key]));

        const bill = values.electricityBill;
        if (bill) {
          // Large photos are compressed client-side before upload so saving is
          // several times faster; PDFs and small images pass through untouched.
          if (bill.file) submitData.append("electricityBill", await compressImageFile(bill.file));
          else submitData.append("billKeep", "true");
        } else {
          submitData.append("billKeep", "false");
        }

        const existingPhotos = values.sitePhotos.filter((p) => !p.file);
        const newPhotos = values.sitePhotos.filter((p) => p.file);
        submitData.append("sitePhotosKeep", JSON.stringify(existingPhotos.map((p) => p._origIndex)));
        // All photos are compressed in parallel so multiple uploads don't wait
        // for each other's compression to finish.
        const compressedSitePhotos = await Promise.all(
          newPhotos.map((p) => compressImageFile(p.file))
        );
        for (const f of compressedSitePhotos) {
          submitData.append("sitePhotos", f);
        }
      }

      if (editingSurvey) {
        // Demo rows (no _id) keep the old local-only update; DB rows go through the API
        if (!editingSurvey._id) {
          setSurveys((prev) => prev.map((s) => (s.id === editingSurvey.id ? { ...s, ...submitData } : s)));
          success(`Survey ${editingSurvey.id} updated successfully`);
          clearSurveyFileCache(editingSurvey.id);
        } else {
          try {
            const res = await siteSurveyAPI.update(editingSurvey._id, submitData);
            const updated = normalizeSurvey(res.data.data);
            setSurveys((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
            success(`Survey ${updated.id} updated successfully`);
            clearSurveyFileCache(updated._id);
          } catch (err) {
            toastError(err.response?.data?.message || "Failed to update survey. Please try again.");
            return;
          }
        }
      } else {
        try {
          const res = await siteSurveyAPI.create(submitData);
          const created = normalizeSurvey(res.data.data);
          // Newest first — prepend so the new survey appears on top.
          setSurveys((prev) => [created, ...prev]);
          success(`Survey ${created.id} created successfully`);
        } catch (err) {
          toastError(err.response?.data?.message || "Failed to create survey. Please try again.");
          return;
        }
      }

      setShowFormPage(false);
      setEditingSurvey(null);
      formik.resetForm();
      localStorage.removeItem(SURVEY_DRAFT_KEY);
      setDraftSavedAt(null);
    },
  });

  const saveSurveyDraft = () => {
    // File inputs cannot be restored by browsers. Save the completed fields
    // and stored-file metadata so the survey can be continued safely.
    const { electricityBill, sitePhotos, ...fields } = formik.values;
    const savedAt = new Date().toISOString();
    localStorage.setItem(SURVEY_DRAFT_KEY, JSON.stringify({
      values: {
        ...fields,
        electricityBill: electricityBill?.file ? null : electricityBill,
        sitePhotos: (sitePhotos || []).filter((photo) => !photo.file),
      },
      savedAt,
    }));
    setDraftSavedAt(savedAt);
    success("Survey draft saved on this device.");
  };

  const discardSurveyDraft = () => {
    localStorage.removeItem(SURVEY_DRAFT_KEY);
    setDraftSavedAt(null);
    success("Saved survey draft discarded.");
  };

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSurvey, setReportSurvey] = useState(null);

  // Full-size image viewer for photo thumbnails (click to zoom)
  const [zoomImage, setZoomImage] = useState(null); // { src, alt }

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load real surveys from MongoDB (via backend API) on mount
  useEffect(() => {
    let cancelled = false;
    const loadSurveys = async () => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: pageSize };
        if (search.trim()) params.search = search.trim();
        if (statusFilter !== 'All') params.status = statusFilter;
        const res = await siteSurveyAPI.getAll(params);
        const docs = res.data?.data || [];
        if (!cancelled) {
          setSurveys(docs.map(normalizeSurvey));
          setServerTotal(res.data?.pagination?.total || docs.length);
        }
      } catch (err) {
        // Backend unreachable - keep demo data visible so the page still works
        console.warn("Failed to load site surveys:", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadSurveys();
    return () => { cancelled = true; };
  }, [currentPage, pageSize, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    solarDesignAPI.getStats().then((res) => {
      if (!cancelled && res.data?.data?.designedLeadIds) {
        setDesignedLeadIds(res.data.data.designedLeadIds);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load leads from the Lead module for the "Select Lead" dropdown.
  // Only converted leads are eligible for a site survey.
  const loadLeads = useCallback(async () => {
    try {
      const res = await leadAPI.getAll({ page: 1, limit: 100, status: "Converted" });
      const docs = res.data?.data || [];
      setLeads(docs);
    } catch (err) {
      // Backend unreachable - dropdown stays empty but the form still works
      console.warn("Failed to load leads:", err?.message);
    } finally {
      setLeadsReady(true);
    }
  }, []);

  useEffect(() => {
    const leadId = (searchParams.get("createForLead") || "").trim();
    if (!leadId) return;
    prefillRef.current = {
      leadId,
      customerId: (searchParams.get("customerId") || "").trim(),
      customerName: (searchParams.get("customerName") || "").trim(),
      projectType: (searchParams.get("projectType") || "").trim(),
    };
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill?.customerId) return;
    let cancelled = false;
    customerAPI
      .getProfile(prefill.customerId)
      .then((res) => {
        if (!cancelled && res.data?.data?.customer) {
          setPrefillCustomer(res.data.data.customer);
        }
      })
      .catch(() => {
        // Customer record unavailable — the form still works without the card.
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill || prefillAppliedRef.current || !leadsReady) return;
    prefillAppliedRef.current = true;
    const lead = leads.find((l) => (l.leadId || l.id) === prefill.leadId);
    if (lead) {
      handleLeadSelect(prefill.leadId);
    } else {
      formik.setFieldValue("leadId", prefill.leadId);
      formik.setFieldValue("customerName", prefill.customerName || "");
    }
    if (prefill.projectType) formik.setFieldValue("projectType", prefill.projectType);
    setShowFormPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsReady]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Load technicians from the Technician module for the "Technician" dropdown
  useEffect(() => {
    let cancelled = false;
    const loadTechnicians = async () => {
      try {
        const res = await technicianAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        if (!cancelled) setTechnicians(docs);
      } catch (err) {
        // Backend unreachable - dropdown stays empty but the form still works
        console.warn("Failed to load technicians:", err?.message);
      }
    };
    loadTechnicians();
    return () => { cancelled = true; };
  }, []);

  // Load customers so the selected lead's customer type can auto-fill the
  // survey's Project Type field.
  useEffect(() => {
    let cancelled = false;
    const loadCustomers = async () => {
      try {
        const res = await customerAPI.getAll({ page: 1, limit: 100 });
        const docs = res.data?.data || [];
        if (!cancelled) setCustomers(docs);
      } catch (err) {
        // Backend unreachable — Project Type just stays on its default value.
        console.warn("Failed to load customers:", err?.message);
      }
    };
    loadCustomers();
    return () => { cancelled = true; };
  }, []);

  const billInputRef = useRef(null);
  const photoInputRef = useRef(null);

  // Lock the main dashboard-content scroll when any overlay/modal is open
  const anyModalOpen = showViewModal || showReportModal || showDeleteDialog;

  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;

    if (anyModalOpen) {
      content.style.overflow = 'hidden';
    } else {
      content.style.overflow = '';
    }

    return () => {
      content.style.overflow = '';
    };
  }, [anyModalOpen]);

  const roofArea = useMemo(() => {
    const l = parseFloat(formik.values.roofLength);
    const w = parseFloat(formik.values.roofWidth);
    if (!isNaN(l) && !isNaN(w) && l > 0 && w > 0) return (l * w).toFixed(2);
    return "";
  }, [formik.values.roofLength, formik.values.roofWidth]);

  // Dropdown options: customers from the Customer module that don't already have
  // a site survey, ordered alphabetically by name. A customer can only get one
  // survey, so any customer whose leadId is already linked to an existing
  // (persisted) survey is hidden.
  const leadOptions = useMemo(() => {
    const surveyedLeadIds = new Set(
      surveys.filter((s) => s._id).map((s) => s.leadId).filter(Boolean)
    );
    if (editingSurvey?.leadId) {
      surveyedLeadIds.delete(editingSurvey.leadId);
    }
    const opts = customers
      .filter((c) => c.leadId && !surveyedLeadIds.has(c.leadId))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((c) => ({ value: c.leadId, label: c.name || c.leadId }));
    if (editingSurvey?.leadId && !opts.some((o) => o.value === editingSurvey.leadId)) {
      const editingCustomer = customers.find((c) => c.leadId === editingSurvey.leadId);
      opts.unshift({ value: editingSurvey.leadId, label: editingCustomer?.name || editingSurvey.customerName || editingSurvey.leadId });
    }

    const prefill = prefillRef.current;
    if (prefill?.leadId && !opts.some((o) => o.value === prefill.leadId)) {
      opts.unshift({
        value: prefill.leadId,
        label: prefill.customerName ? `${prefill.leadId} — ${prefill.customerName}` : prefill.leadId,
      });
    }
    return opts;
  }, [customers, editingSurvey, surveys]);

  // Dropdown options: every technician from the Technician module, sorted by
  // name. If the survey being edited references a technician that isn't in the
  // fetched list, keep it selectable so the existing value never disappears.
  const technicianOptions = useMemo(() => {
    const techNumber = (id) => {
      const m = String(id || "").match(/(\d+)\s*$/);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    const opts = [...technicians]
      .filter((t) => t.technicianId)
      .sort((a, b) => techNumber(a.technicianId) - techNumber(b.technicianId))
      .map((t) => ({ value: t.technicianId, label: `${t.technicianId} — ${t.name}` }));
    if (editingSurvey?.technicianId && !opts.some((o) => o.value === editingSurvey.technicianId)) {
      opts.unshift({
        value: editingSurvey.technicianId,
        label: editingSurvey.technicianName || editingSurvey.technicianId,
      });
    }
    return opts;
  }, [technicians, editingSurvey]);

  // Selecting a customer auto-fills the customer name, site address, and
  // project type from the Customer module.
  const handleLeadSelect = (leadId) => {
    formik.setFieldValue("leadId", leadId);
    if (!leadId) {
      formik.setFieldValue("customerName", "");
      formik.setFieldValue("notes", "");
      formik.setFieldValue("technicianId", "");
      formik.setFieldValue("technicianName", "");
      return;
    }
    const customer = customers.find((c) => c.leadId === leadId);
    if (customer) {
      formik.setFieldValue("customerName", customer.name || "");
      formik.setFieldValue("notes", customer.address || "");
      if (customer.type) {
        formik.setFieldValue("projectType", customer.type);
      }
      // Auto-select the technician assigned during lead-to-customer conversion
      if (customer.technicianId) {
        formik.setFieldValue("technicianId", customer.technicianId);
        formik.setFieldValue("technicianName", customer.technicianName || "");
      }
    }
  };

  // The map in the GPS section reports the browser's position here, which
  // auto-fills the latitude/longitude fields (as strings, per the schema).
  const handleSurveyLocationFound = useCallback((coords) => {
    formik.setFieldValue("latitude", coords.latitude != null ? String(coords.latitude) : "");
    formik.setFieldValue("longitude", coords.longitude != null ? String(coords.longitude) : "");
  }, [formik]);

  // Reverse-geocode the coordinates currently in the GPS section and show the
  // address. Debounced so typing in the fields doesn't hammer the API.
  const geocodeTimerRef = useRef(null);
  useEffect(() => {
    const lat = String(formik.values.latitude ?? "").trim();
    const lng = String(formik.values.longitude ?? "").trim();
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    if (!showFormPage || !lat || !lng) {
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
  }, [showFormPage, formik.values.latitude, formik.values.longitude]);

  // Reverse-geocode the selected survey's coordinates so the view-details
  // modal shows the address instead of raw latitude/longitude.
  useEffect(() => {
    let cancelled = false;
    setViewAddress("");
    const s = selectedSurvey;
    const lat = String(s?.latitude ?? "").trim();
    const lng = String(s?.longitude ?? "").trim();
    if (!showViewModal || !s || !lat || !lng) return;
    setViewGeocoding(true);
    getAddressFromCoordinates(lat, lng)
      .then((data) => {
        if (!cancelled) setViewAddress(data?.display_name || "Address unavailable");
      })
      .catch((err) => {
        console.warn("Failed to resolve address:", err?.message);
        if (!cancelled) setViewAddress("Address unavailable");
      })
      .finally(() => {
        if (!cancelled) setViewGeocoding(false);
      });
    return () => { cancelled = true; };
  }, [showViewModal, selectedSurvey]);

  const filteredSurveys = useMemo(() => {
    let result = [...surveys];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          (s.id || "").toLowerCase().includes(q) ||
          (s.customerName || "").toLowerCase().includes(q) ||
          (s.technicianName || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((s) => s.visitStatus === statusFilter);
    }

    if (roofTypeFilter !== "All") {
      result = result.filter((s) => s.roofType === roofTypeFilter);
    }

    if (technicianFilter !== "All") {
      result = result.filter((s) => (s.technicianId || "") === technicianFilter);
    }

    if (dateFrom) {
      result = result.filter((s) => s.visitDate >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((s) => s.visitDate <= dateTo);
    }

    // Always display records in descending ID order (SVY-012 → SVY-001 → ...)
    // so the newest surveys appear on top.
    result.sort((a, b) => {
      const idNumber = (id) => {
        const m = String(id || "").match(/(\d+)$/);
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
      };
      return idNumber(b.id) - idNumber(a.id);
    });

    return result;
  }, [surveys, search, statusFilter, roofTypeFilter, technicianFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(serverTotal || filteredSurveys.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openFormPage = (survey = null) => {
    if (survey) {
      setEditingSurvey(survey);
      formik.setValues({
        customerName: survey.customerName,
        projectName: survey.projectName || "",
        projectType: survey.projectType || "Residential",
        leadId: survey.leadId,
        technicianId: survey.technicianId,
        technicianName: survey.technicianName || "",
        visitDate: survey.visitDate,
        visitTime: survey.visitTime,
        visitStatus: survey.visitStatus,
        notes: survey.notes,
        roofType: survey.roofType,
        customRoofType: survey.customRoofType || "",
        roofLength: String(survey.roofLength),
        roofWidth: String(survey.roofWidth),
        roofAngle: String(survey.roofAngle),
        shadowAnalysis: survey.shadowAnalysis,
        shadowNotes: survey.shadowNotes,
        monthlyUnits: survey.monthlyUnits != null ? String(survey.monthlyUnits) : "",
        latitude: survey.latitude,
        longitude: survey.longitude,
        electricityBill: survey.electricityBill || null,
        // Remember the index of each stored photo so edits can keep the exact
        // stored file bytes (only new photos are uploaded).
        sitePhotos: (survey.sitePhotos || []).map((p, i) => ({ ...p, _origIndex: i })),
        surveyNotes: survey.surveyNotes,
      });
    } else {
      setEditingSurvey(null);
      try {
        const draft = JSON.parse(localStorage.getItem(SURVEY_DRAFT_KEY) || "null");
        if (draft?.values) {
          formik.setValues({
            ...initialFormData,
            visitDate: new Date().toISOString().split("T")[0],
            ...draft.values,
          });
          setDraftSavedAt(draft.savedAt || null);
        } else {
          formik.resetForm();
        }
      } catch {
        formik.resetForm();
      }
    }

    // Auto-select the logged-in technician in the technician dropdown
    if (user?.role === "technician" && technicians.length) {
      const matchedTech = technicians.find(
        (t) => (t.email || "").toLowerCase() === (user.email || "").toLowerCase()
      );
      if (matchedTech) {
        const techVal = matchedTech.technicianId || matchedTech._id || "";
        const techNameVal = matchedTech.name || "";
        formik.setFieldValue("technicianId", techVal);
        formik.setFieldValue("technicianName", techNameVal);
      }
    }

    setShowFormPage(true);
  };

  const openViewModal = (survey) => {
    setSelectedSurvey(survey);
    setShowViewModal(true);
  };

  const openCustomerModal = async (survey) => {
    if (!canDo("customers", "view")) return;
    const key = survey.customerId || survey.leadId;
    if (!key) return;
    setViewCustomerLoading(true);
    setViewCustomer(null);
    try {
      const res = await customerAPI.getProfile(key);
      if (res.data?.data?.customer) {
        setViewCustomer(res.data.data.customer);
      } else {
        toastError("Customer details not found");
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to load customer details");
    } finally {
      setViewCustomerLoading(false);
    }
  };

  const openReportModal = (survey) => {
    setReportSurvey(survey);
    setShowReportModal(true);
  };

  const handleCreateDesign = (survey) => {
    if (!survey.leadId) return;
    const params = new URLSearchParams({
      createForLead: survey.leadId,
      customerId: survey.customerId || "",
      customerName: survey.customerName || "",
      projectName: survey.projectName || "",
    });
    navigate(`/admin/solar-design?${params.toString()}`);
  };

  const confirmDelete = (survey) => {
    setDeleteTarget(survey);
    setShowDeleteDialog(true);
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
        await siteSurveyAPI.delete(deleteTarget._id);
        setSurveys((prev) => prev.filter((s) => s._id !== deleteTarget._id));
        success(`Survey ${deleteTarget.id} deleted successfully`);
        clearSurveyFileCache(deleteTarget._id);
      } else {
        setSurveys((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        success(`Survey ${deleteTarget.id} deleted successfully`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setSurveys((prev) => prev.filter((s) => s._id !== deleteTarget._id));
        success(`Survey ${deleteTarget.id} was already deleted`);
      } else {
        toastError(err.response?.data?.message || "Failed to delete survey. Please try again.");
      }
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  const handleBillUpload = (e) => {
    if (!e || !e.target || !e.target.files) return;
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      toastError("Only PDF, JPG, and PNG files are allowed");
      return;
    }
    formik.setFieldValue("electricityBill", { name: file.name, file, size: file.size, mimeType: file.type });
    if (billInputRef.current) billInputRef.current.value = "";
  };

  const handlePhotoUpload = (e) => {
    if (!e || !e.target || !e.target.files) return;
    const files = Array.from(e.target.files);
    const valid = [];
    for (const file of files) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (["jpg", "jpeg", "png"].includes(ext)) {
        valid.push({ name: file.name, file, size: file.size, mimeType: file.type });
      }
    }
    if (valid.length < files.length) {
      toastError("Only JPG, JPEG, and PNG files are accepted");
    }
    if (valid.length > 0) {
      formik.setFieldValue("sitePhotos", [...formik.values.sitePhotos, ...valid]);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const removePhoto = (index) => {
    formik.setFieldValue("sitePhotos", formik.values.sitePhotos.filter((_, i) => i !== index));
  };

  const removeBill = () => {
    formik.setFieldValue("electricityBill", null);
  };

  // Download a stored survey file (electricity bill / site photo) from the DB
  const downloadSurveyBlob = async (request, filename) => {
    try {
      const res = await request;
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = "Failed to download file. Please try again.";
      try {
        const blob = err.response?.data;
        if (blob instanceof Blob && blob.type?.includes("application/json")) {
          const parsed = JSON.parse(await blob.text());
          if (parsed?.message) message = parsed.message;
        } else if (err.response?.data?.message) {
          message = err.response.data.message;
        }
      } catch {
        /* keep the fallback message */
      }
      toastError(message);
    }
  };

  const downloadBillFile = (survey) => {
    if (!survey?._id || !survey.electricityBill) return;
    downloadSurveyBlob(siteSurveyAPI.downloadBill(survey._id), survey.electricityBill.name || "electricity-bill");
  };

  const downloadPhotoFile = (survey, photo, index) => {
    if (!survey?._id || !photo) return;
    downloadSurveyBlob(siteSurveyAPI.downloadPhoto(survey._id, index), photo.name || `site-photo-${index + 1}`);
  };

  const formatTime12h = (time24) => {
    if (!time24) return "—";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "Completed": return "ss-badge-completed";
      case "Scheduled": return "ss-badge-scheduled";
      case "Cancelled": return "ss-badge-cancelled";
      default: return "";
    }
  };

  // Inline status edit straight from the table — saves immediately via the API
  // (backend accepts a partial update with just { visitStatus }), updates the
  // local list and shows a toast. While saving, the dropdown is disabled.
  const [savingStatusId, setSavingStatusId] = useState(null);
  const handleQuickStatusChange = async (survey, newStatus) => {
    if (!newStatus || newStatus === survey.visitStatus) return;
    if (survey._id) {
      if (savingStatusId) return;
      setSavingStatusId(survey._id);
      try {
        const res = await siteSurveyAPI.update(survey._id, { visitStatus: newStatus });
        const updated = normalizeSurvey(res.data.data);
        setSurveys((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
        success(`Survey ${updated.id} status updated to ${newStatus}`);
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to update status. Please try again.");
      } finally {
        setSavingStatusId(null);
      }
    } else {
      // Local-only row (no _id) — update in place without hitting the API
      setSurveys((prev) => prev.map((s) => (s.id === survey.id ? { ...s, visitStatus: newStatus } : s)));
      success(`Survey ${survey.id} status updated to ${newStatus}`);
    }
  };

  const stats = useMemo(
    () => ({
      total: surveys.length,
      scheduled: surveys.filter((s) => s.visitStatus === "Scheduled").length,
      completed: surveys.filter((s) => s.visitStatus === "Completed").length,
      cancelled: surveys.filter((s) => s.visitStatus === "Cancelled").length,
    }),
    [surveys]
  );

  const renderFormPage = () => (
    <div className="ss-form-page">
      <div className="ss-form-page-header">
        <button className="ss-btn ss-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Surveys
        </button>
        <h2>{editingSurvey ? `Edit Survey ${editingSurvey.id}` : "Schedule New Site Visit"}</h2>
      </div>
        <form onSubmit={formik.handleSubmit} className="ss-form-page-body" noValidate>
          {!editingSurvey && draftSavedAt && !prefillRef.current && (
            <div className="ss-draft-notice">
              <span>Draft restored — last saved {new Date(draftSavedAt).toLocaleString("en-IN")}.</span>
              <button type="button" onClick={discardSurveyDraft}>Discard draft</button>
            </div>
          )}
          {/* Section 1: Schedule Site Visit */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">1</span>
              <h4>Schedule Site Visit</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field">
                <label>Select Customer <span className="ss-required">*</span></label>
                <Dropdown
                  value={formik.values.leadId}
                  onChange={handleLeadSelect}
                  options={leadOptions.length > 0 ? [{ value: "", label: "Select Customer" }, ...leadOptions] : []}
                  placeholder="Select Customer"
                  emptyMessage="No available customers — all leads already have site surveys"
                  variant="form"
                  disabled={!!editingSurvey}
                />
                {formik.errors.leadId && formik.touched.leadId && <span className="ss-field-error">{formik.errors.leadId}</span>}
              </div>
              <div className="ss-form-field">
                <label>Project Name <span className="ss-required">*</span></label>
                <input
                  type="text"
                  name="projectName"
                  value={formik.values.projectName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="e.g. Rooftop Solar – Green Villa"
                  className={formik.errors.projectName && formik.touched.projectName ? "ss-input-error" : ""}
                />
                {formik.errors.projectName && formik.touched.projectName && <span className="ss-field-error">{formik.errors.projectName}</span>}
              </div>
              <div className="ss-form-field">
                <label>Project Type <span className="ss-required">*</span></label>
                <Dropdown
                  value={formik.values.projectType}
                  onChange={(val) => formik.setFieldValue("projectType", val)}
                  options={[
                    { value: "Residential", label: "Residential" },
                    { value: "Commercial", label: "Commercial" },
                    { value: "Industrial", label: "Industrial" },
                    { value: "Agricultural", label: "Agricultural" },
                    { value: "Individual", label: "Individual" },
                    { value: "Business", label: "Business" },
                    { value: "Government", label: "Government" },
                    { value: "NGO", label: "NGO" },
                  ]}
                  variant="form"
                />
                {formik.errors.projectType && formik.touched.projectType && <span className="ss-field-error">{formik.errors.projectType}</span>}
              </div>
              <div className="ss-form-field">
                <label>Technician <span className="ss-required">*</span></label>
                <Dropdown
                  value={formik.values.technicianId}
                  onChange={(val) => formik.setFieldValue("technicianId", val)}
                  options={[{ value: "", label: "Select Technician" }, ...technicianOptions]}
                  variant="form"
                />
                {formik.errors.technicianId && formik.touched.technicianId && <span className="ss-field-error">{formik.errors.technicianId}</span>}
              </div>
              <div className="ss-form-field">
                <label>Visit Date <span className="ss-required">*</span></label>
                <input type="date" name="visitDate" value={formik.values.visitDate} onChange={formik.handleChange} min={editingSurvey ? editingSurvey.visitDate : new Date().toISOString().split("T")[0]} className={formik.errors.visitDate && formik.touched.visitDate ? "ss-input-error" : ""} />
                {formik.errors.visitDate && formik.touched.visitDate && <span className="ss-field-error">{formik.errors.visitDate}</span>}
              </div>
              <div className="ss-form-field">
                <label>Visit Time <span className="ss-required">*</span></label>
                <div
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector('input[type="time"]');
                    if (input) {
                      input.showPicker?.();
                      input.focus();
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="time"
                    name="visitTime"
                    value={formik.values.visitTime}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    onClick={(e) => e.target.showPicker?.()}
                    style={{ cursor: "pointer" }}
                    className={formik.errors.visitTime && formik.touched.visitTime ? "ss-input-error" : ""}
                  />
                </div>
                {formik.errors.visitTime && formik.touched.visitTime && <span className="ss-field-error">{formik.errors.visitTime}</span>}
              </div>
              <div className="ss-form-field">
                <label>Visit Status</label>
                <Dropdown value={formik.values.visitStatus} onChange={(val) => formik.setFieldValue("visitStatus", val)} options={VISIT_STATUSES.map((st) => ({ value: st, label: st }))} variant="form" />
              </div>
              <div className="ss-form-field ss-full-width">
                <label>Notes</label>
                <textarea name="notes" value={formik.values.notes} onChange={formik.handleChange} placeholder="Enter any additional notes about the visit" rows={2} maxLength={201} className={(formik.values.notes || "").length > 200 ? "ss-input-error" : ""} />
                {(formik.values.notes || "").length > 200 && <span className="ss-field-error">Notes cannot exceed 200 characters</span>}
              </div>
            </div>
          </div>

          {/* Section 2: Roof Type Selection */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">2</span>
              <h4>Roof Type Selection</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field ss-full-width">
                <label>Select Roof Type <span className="ss-required">*</span></label>
                <div className="ss-roof-options">
                  {ROOF_TYPE_OPTIONS.map((type) => (
                    <label key={type} className={`ss-roof-option ${formik.values.roofType === type ? "active" : ""}`}>
                      <input type="radio" name="roofType" value={type} checked={formik.values.roofType === type} onChange={formik.handleChange} />
                      <span className="ss-roof-option-label">{type}</span>
                    </label>
                  ))}
                </div>
                {formik.errors.roofType && formik.touched.roofType && <span className="ss-field-error">{formik.errors.roofType}</span>}
              </div>
              {formik.values.roofType === "Other" && (
                <div className="ss-form-field ss-full-width">
                  <label>Specify Roof Type <span className="ss-required">*</span></label>
                  <input type="text" name="customRoofType" value={formik.values.customRoofType} onChange={formik.handleChange} placeholder="Enter custom roof type" maxLength={100} className={formik.errors.customRoofType && formik.touched.customRoofType ? "ss-input-error" : ""} />
                  {formik.errors.customRoofType && formik.touched.customRoofType && <span className="ss-field-error">{formik.errors.customRoofType}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Roof Size Calculation */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">3</span>
              <h4>Roof Size Calculation</h4>
            </div>
            <div className="ss-form-grid ss-form-grid-3">
              <div className="ss-form-field">
                <label>Roof Length (meters) <span className="ss-required">*</span></label>
                <input type="text" value={formik.values.roofLength} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d{0,3}(\.\d)?$/.test(v)) formik.setFieldValue("roofLength", v); }} placeholder="e.g. 20" maxLength={5} className={formik.errors.roofLength && (formik.touched.roofLength || (formik.values.roofLength !== "" && parseFloat(formik.values.roofLength) > 100)) ? "ss-input-error" : ""} />
                {(formik.touched.roofLength || (formik.values.roofLength !== "" && parseFloat(formik.values.roofLength) > 100)) && formik.errors.roofLength && <span className="ss-field-error">{formik.errors.roofLength}</span>}
              </div>
              <div className="ss-form-field">
                <label>Roof Width (meters) <span className="ss-required">*</span></label>
                <input type="text" value={formik.values.roofWidth} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d{0,3}(\.\d)?$/.test(v)) formik.setFieldValue("roofWidth", v); }} placeholder="e.g. 15" maxLength={5} className={formik.errors.roofWidth && (formik.touched.roofWidth || (formik.values.roofWidth !== "" && parseFloat(formik.values.roofWidth) > 100)) ? "ss-input-error" : ""} />
                {(formik.touched.roofWidth || (formik.values.roofWidth !== "" && parseFloat(formik.values.roofWidth) > 100)) && formik.errors.roofWidth && <span className="ss-field-error">{formik.errors.roofWidth}</span>}
              </div>
              <div className="ss-form-field">
                <label>Calculated Roof Area (sq. meters)</label>
                <div className="ss-calculated-field">
                  <span className="ss-calculated-value">{roofArea ? `${roofArea} m²` : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Roof Angle Measurement */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">4</span>
              <h4>Roof Angle Measurement</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field">
                <label>Roof Angle (Degree) <span className="ss-required">*</span></label>
                <input type="number" value={formik.values.roofAngle} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d{0,3}(\.\d)?$/.test(v)) formik.setFieldValue("roofAngle", v); }} placeholder="0° - 90°" min="0" max="90" step="any" maxLength={5} className={formik.errors.roofAngle && (formik.touched.roofAngle || (formik.values.roofAngle !== "" && parseFloat(formik.values.roofAngle) > 90)) ? "ss-input-error" : ""} />
                {(formik.touched.roofAngle || (formik.values.roofAngle !== "" && parseFloat(formik.values.roofAngle) > 90)) && formik.errors.roofAngle && <span className="ss-field-error">{formik.errors.roofAngle}</span>}
              </div>
              {formik.values.roofAngle && !isNaN(parseFloat(formik.values.roofAngle)) && (
                <div className="ss-form-field">
                  <label>Angle Preview</label>
                  <div className="ss-angle-preview">
                    <div className="ss-angle-visual">
                      <svg width="100" height="60" viewBox="0 0 100 60">
                        <line x1="10" y1="50" x2="90" y2="50" stroke="#d1d5db" strokeWidth="2" />
                        <line x1="10" y1="50" x2={10 + 80 * Math.cos((-parseFloat(formik.values.roofAngle) * Math.PI) / 180)} y2={50 - 80 * Math.sin((parseFloat(formik.values.roofAngle) * Math.PI) / 180)} stroke="#2c5364" strokeWidth="2" />
                      </svg>
                    </div>
                    <span className="ss-angle-value">{formik.values.roofAngle}°</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Shadow Analysis */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">5</span>
              <h4>Shadow Analysis</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field ss-full-width">
                <label>Shadow Condition <span className="ss-required">*</span></label>
                <div className="ss-shadow-options">
                  {SHADOW_OPTIONS.map((opt) => (
                    <label key={opt} className={`ss-shadow-option ${formik.values.shadowAnalysis === opt ? "active" : ""} ${opt === "No Shadow" ? "ss-shadow-none" : opt === "Partial Shadow" ? "ss-shadow-partial" : "ss-shadow-heavy"}`}>
                      <input type="radio" name="shadowAnalysis" value={opt} checked={formik.values.shadowAnalysis === opt} onChange={formik.handleChange} />
                      <span className="ss-shadow-option-icon">
                        {opt === "No Shadow" && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                          </svg>
                        )}
                        {opt === "Partial Shadow" && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5" />
                            <path d="M12 2a10 10 0 000 20" fill="currentColor" opacity="0.3" />
                          </svg>
                        )}
                        {opt === "Heavy Shadow" && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.5 19H9a7 7 0 110-14h9.5" fill="currentColor" opacity="0.5" />
                          </svg>
                        )}
                      </span>
                      <span className="ss-shadow-option-label">{opt}</span>
                    </label>
                  ))}
                </div>
                {formik.errors.shadowAnalysis && formik.touched.shadowAnalysis && <span className="ss-field-error">{formik.errors.shadowAnalysis}</span>}
              </div>
              <div className="ss-form-field ss-full-width">
                <label>Shadow Notes</label>
                <textarea name="shadowNotes" value={formik.values.shadowNotes} onChange={formik.handleChange} placeholder="Enter shadow observation notes" rows={2} maxLength={201} className={(formik.values.shadowNotes || "").length > 200 ? "ss-input-error" : ""} />
                {(formik.values.shadowNotes || "").length > 200 && <span className="ss-field-error">Shadow notes cannot exceed 200 characters</span>}
              </div>
            </div>
          </div>

          {/* Section 6: GPS Coordinates */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">6</span>
              <h4>GPS Coordinates Capture</h4>
            </div>
            <div className="ss-location-map">
              <SolarMap
                onLocationFound={handleSurveyLocationFound}
                height={260}
                showCoords={false}
                initialPosition={editingSurvey && editingSurvey.latitude != null && editingSurvey.longitude != null
                  ? { latitude: editingSurvey.latitude, longitude: editingSurvey.longitude }
                  : null}
              />
              <span className={`ss-location-map-hint ${formik.values.latitude && formik.values.longitude ? "found" : ""}`}>
                {formik.values.latitude && formik.values.longitude
                  ? "Coordinates captured — verify below and continue."
                  : "Detecting your current location..."}
              </span>
              <div className={`ss-address-box ${liveAddress ? "has-address" : ""}`}>
                <span className="ss-address-label">Address</span>
                <span className="ss-address-value">
                  {geocoding ? "Resolving address..." : liveAddress || "—"}
                </span>
              </div>
            </div>
            <div className="ss-form-grid ss-form-grid-2">
              <div className="ss-form-field">
                <label>Latitude <span className="ss-required">*</span></label>
                <input type="text" name="latitude" value={formik.values.latitude} onChange={formik.handleChange} placeholder="e.g. 28.5802" maxLength={10} className={formik.errors.latitude && formik.touched.latitude ? "ss-input-error" : ""} />
                {formik.errors.latitude && formik.touched.latitude && <span className="ss-field-error">{formik.errors.latitude}</span>}
              </div>
              <div className="ss-form-field">
                <label>Longitude <span className="ss-required">*</span></label>
                <input type="text" name="longitude" value={formik.values.longitude} onChange={formik.handleChange} placeholder="e.g. 77.3189" maxLength={10} className={formik.errors.longitude && formik.touched.longitude ? "ss-input-error" : ""} />
                {formik.errors.longitude && formik.touched.longitude && <span className="ss-field-error">{formik.errors.longitude}</span>}
              </div>
            </div>
          </div>

          {/* Section 7: Electricity Bill Upload */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">7</span>
              <h4>Electricity Bill Upload</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field ss-full-width">
                <label>Upload Electricity Bill (PDF, JPG, PNG) <span className="ss-required">*</span></label>
                {formik.values.electricityBill ? (
                  <>
                    <div className="ss-file-preview">
                      <div className="ss-file-info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="ss-file-name">{formik.values.electricityBill.name}</span>
                      </div>
                      <div className="ss-file-actions">
                        {formik.values.electricityBill.hasFile && editingSurvey?._id && (
                          <button type="button" className="ss-file-download" onClick={() => downloadBillFile(editingSurvey)}>Download</button>
                        )}
                        <button type="button" className="ss-file-replace" onClick={() => billInputRef.current?.click()}>Replace</button>
                        <button type="button" className="ss-file-remove" onClick={removeBill}>Remove</button>
                      </div>
                    </div>
                    {/* Inline preview of the bill: locally selected file or stored DB bytes */}
                    {formik.values.electricityBill.file ? (
                      <LocalBillPreview file={formik.values.electricityBill.file} alt={formik.values.electricityBill.name} />
                    ) : formik.values.electricityBill.hasFile && editingSurvey?._id ? (
                      <StoredBillPreview surveyId={editingSurvey._id} bill={formik.values.electricityBill} />
                    ) : null}
                  </>
                ) : (
                  <div className="ss-upload-zone" onClick={() => billInputRef.current?.click()}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Click to upload electricity bill</span>
                    <span className="ss-upload-hint">PDF, JPG, PNG formats accepted</span>
                  </div>
                )}
                <input ref={billInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleBillUpload} />
                {formik.errors.electricityBill && formik.touched.electricityBill && <span className="ss-field-error">{formik.errors.electricityBill}</span>}
              </div>
              <div className="ss-form-field ss-full-width">
                <label>Monthly Electricity Units (kWh) <span className="ss-required">*</span></label>
                <input type="number" name="monthlyUnits" value={formik.values.monthlyUnits} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d{0,5}(\.\d{0,2})?$/.test(v)) formik.setFieldValue("monthlyUnits", v); }} placeholder="e.g. 900" min="0" max="10000" step="any" className={formik.errors.monthlyUnits && (formik.touched.monthlyUnits || (formik.values.monthlyUnits !== "" && parseFloat(formik.values.monthlyUnits) > 10000)) ? "ss-input-error" : ""} />
                <span className="ss-field-hint">Auto-fills the Solar Design monthly consumption</span>
                {(formik.touched.monthlyUnits || (formik.values.monthlyUnits !== "" && parseFloat(formik.values.monthlyUnits) > 10000)) && formik.errors.monthlyUnits && <span className="ss-field-error">{formik.errors.monthlyUnits}</span>}
              </div>
            </div>
          </div>

          {/* Section 8: Site Photos Upload */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">8</span>
              <h4>Site Photos Upload</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field ss-full-width">
                <label>Upload Site Photos (JPG, JPEG, PNG) <span className="ss-required">*</span></label>
                <div className="ss-photos-grid">
                  {formik.values.sitePhotos.map((photo, idx) => {
                    const storedIndex = photo._origIndex != null ? photo._origIndex : idx;
                    return (
                      <div key={idx} className="ss-photo-thumb">
                        {photo.file ? (
                          <LocalFilePreview file={photo.file} alt={photo.name} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                        ) : photo.hasFile && editingSurvey?._id ? (
                          <StoredSurveyPhoto surveyId={editingSurvey._id} photo={photo} index={storedIndex} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                        ) : (
                          <div className="ss-photo-placeholder">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                        )}
                        <span className="ss-photo-name">{photo.name}</span>
                        {photo.hasFile && editingSurvey?._id && (
                          <button type="button" className="ss-photo-download" onClick={() => downloadPhotoFile(editingSurvey, photo, storedIndex)} title="Download photo">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        )}
                        <button type="button" className="ss-photo-remove" onClick={() => removePhoto(idx)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                  <div className="ss-photo-add" onClick={() => photoInputRef.current?.click()}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Photo</span>
                  </div>
                </div>
                {formik.errors.sitePhotos && formik.touched.sitePhotos && <span className="ss-field-error">{formik.errors.sitePhotos}</span>}
                <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png" multiple style={{ display: "none" }} onChange={handlePhotoUpload} />
              </div>
            </div>
          </div>

          {/* Section 9: Survey Notes */}
          <div className="ss-form-section">
            <div className="ss-section-header">
              <span className="ss-section-number">9</span>
              <h4>Survey Notes</h4>
            </div>
            <div className="ss-form-grid">
              <div className="ss-form-field ss-full-width">
                <label>Additional Survey Notes</label>
                <textarea name="surveyNotes" value={formik.values.surveyNotes} onChange={formik.handleChange} placeholder="Enter detailed observations, recommendations, and any other notes from the site survey" rows={4} maxLength={201} className={(formik.values.surveyNotes || "").length > 200 ? "ss-input-error" : ""} />
                {(formik.values.surveyNotes || "").length > 200 && <span className="ss-field-error">Additional survey notes cannot exceed 200 characters</span>}
              </div>
            </div>
          </div>

          <div className="ss-form-page-footer">
            <button type="button" className="ss-btn ss-btn-cancel" onClick={() => setShowFormPage(false)} disabled={formik.isSubmitting}>Cancel</button>
            {!editingSurvey && <button type="button" className="ss-btn ss-btn-secondary" onClick={saveSurveyDraft} disabled={formik.isSubmitting}>Save Draft</button>}
            <button type="submit" className="ss-btn ss-btn-primary" disabled={formik.isSubmitting}>
              {formik.isSubmitting ? "Saving…" : editingSurvey ? "Update Survey" : "Save Survey"}
            </button>
          </div>
        </form>
    </div>
  );

  const renderViewModal = () => {
    if (!selectedSurvey) return null;
    const s = selectedSurvey;
    return (
      <div className="ss-overlay">
        <div className="ss-view-modal">
          <div className="ss-modal-header">
            <div className="ss-modal-title">
              <h3>Survey Details — {s.id}</h3>
              {s.customerName && <span className="ss-modal-subtitle">{s.customerName}</span>}
            </div>
            <button className="ss-modal-close" onClick={() => setShowViewModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="ss-view-body">
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
                <div className="ss-view-item"><span className="ss-view-label">Visit Status</span><span className={`ss-badge ${getStatusClass(s.visitStatus)}`}>{s.visitStatus}</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Notes</span><span className="ss-view-value">{s.notes || "—"}</span></div>
              </div>
            </div>

            <div className="ss-view-section">
              <h4>Roof Information</h4>
              <div className="ss-view-grid">
                <div className="ss-view-item"><span className="ss-view-label">Roof Type</span><span className="ss-view-value">{s.roofType}</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Roof Area</span><span className="ss-view-value">{s.roofArea} m²</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Roof Length</span><span className="ss-view-value">{s.roofLength} m</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Roof Width</span><span className="ss-view-value">{s.roofWidth} m</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Roof Angle</span><span className="ss-view-value">{s.roofAngle}°</span></div>
              </div>
            </div>

            <div className="ss-view-section">
              <h4>Shadow & GPS</h4>
              <div className="ss-view-grid">
                <div className="ss-view-item"><span className="ss-view-label">Shadow Analysis</span><span className="ss-view-value">{s.shadowAnalysis}</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Shadow Notes</span><span className="ss-view-value">{s.shadowNotes || "—"}</span></div>
                <div className="ss-view-item"><span className="ss-view-label">Monthly Units</span><span className="ss-view-value">{s.monthlyUnits != null ? `${s.monthlyUnits} kWh` : "—"}</span></div>
                <div className="ss-view-item"><span className="ss-view-label">GPS Location</span><span className="ss-view-value">{viewGeocoding ? "Resolving address..." : viewAddress || "—"}</span></div>
              </div>
            </div>

            <div className="ss-view-section">
              <h4>Files & Photos</h4>
              <div className="ss-view-documents-grid">
                <div className="ss-view-item">
                  <span className="ss-view-label">Electricity Bill</span>
                  {s.electricityBill ? (
                    <>
                      <div className="ss-view-file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="ss-view-file-name">{s.electricityBill.name}</span>
                        {s.electricityBill.hasFile && s._id && (
                          <button type="button" className="ss-file-download-btn" onClick={() => downloadBillFile(s)} title="Download electricity bill">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download
                          </button>
                        )}
                      </div>
                      {s.electricityBill.hasFile && s._id && (
                        <StoredBillPreview surveyId={s._id} bill={s.electricityBill} />
                      )}
                    </>
                  ) : (
                    <span className="ss-view-value">Not uploaded</span>
                  )}
                </div>
                <div className="ss-view-item">
                  <span className="ss-view-label">Site Photos</span>
                  <span className="ss-view-value">{s.sitePhotos.length > 0 ? `${s.sitePhotos.length} photo(s) uploaded` : "No photos uploaded"}</span>
                         {s.sitePhotos.length > 0 && (
                <div className="ss-view-photos">
                  {s.sitePhotos.map((p, i) => (
                    <div key={i} className="ss-view-photo-card">
                      {s._id && p.hasFile ? (
                        <StoredSurveyPhoto surveyId={s._id} photo={p} index={i} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                      ) : (
                        <div className="ss-view-photo-placeholder">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        </div>
                      )}
                      <span className="ss-view-photo-name">{p.name}</span>
                      {s._id && p.hasFile && (
                        <button
                          type="button"
                          className="ss-view-photo-download"
                          onClick={() => downloadPhotoFile(s, p, i)}
                          title="Download photo"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
                </div>

           
              </div>
          
            </div>

            <div className="ss-view-section">
              <h4>Survey Notes</h4>
              <p className="ss-view-notes">{s.surveyNotes || "No additional notes."}</p>
            </div>
          </div>
          <div className="ss-modal-footer">
            <button className="modal-footer-close" onClick={() => setShowViewModal(false)}>Close</button>
            <button className="ss-btn ss-btn-primary" onClick={() => { setShowViewModal(false); openReportModal(s); }}>View Report</button>
          </div>
        </div>
      </div>
    );
  };

  const renderReportModal = () => {
    if (!reportSurvey) return null;
    const s = reportSurvey;



const handleDownload = async () => {
  const photos = s.sitePhotos?.length
    ? s.sitePhotos.map((p) => p.name).join(", ")
    : "None";

  const doc = await createProfilePdf({
    bannerName: s.customerName,
    bannerSubtitle: `Survey ID: ${s.id}`,
    bannerRight: [`Visit Status: ${s.visitStatus || "—"}`],
    sections: [
      {
        title: "Basic Information",
        fields: [
          ["Lead ID", s.leadId],
          ["Technician", s.technicianName || s.technicianId || "—"],
          ["Visit Date", s.visitDate],
          ["Visit Time", formatTime12h(s.visitTime)],
        ],
      },
      {
        title: "Roof Information",
        fields: [
          ["Roof Type", s.roofType],
          ["Roof Length", `${s.roofLength} m`],
          ["Roof Width", `${s.roofWidth} m`],
          ["Roof Area", `${s.roofArea} m²`],
          ["Roof Angle", `${s.roofAngle}°`],
        ],
      },
      {
        title: "Shadow Analysis",
        fields: [
          ["Shadow Analysis", s.shadowAnalysis],
          ["Shadow Notes", s.shadowNotes || "None"],
          ["Monthly Units", s.monthlyUnits != null ? `${s.monthlyUnits} kWh` : "—"],
        ],
      },
      {
        title: "GPS Coordinates",
        fields: [
          ["Latitude", s.latitude],
          ["Longitude", s.longitude],
        ],
      },
      {
        title: "Files & Documents",
        fields: [
          ["Electricity Bill", s.electricityBill ? s.electricityBill.name : "Not uploaded"],
          ["Site Photos", photos],
        ],
      },
    ],
    notes: s.surveyNotes || "No additional notes.",
  });

  const safeCustomer = (s.customerName || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`SurveyReport_${safeCustomer}.pdf`);

  success("Report downloaded successfully");
};

    return (
      <div className="ss-overlay">
        <div className="ss-report-modal">
          <div className="ss-modal-header">
            <h3>Survey Report - {s.id}</h3>
            <button className="ss-modal-close" onClick={() => setShowReportModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="ss-report-body">
            <div className="ss-report-paper">
              <div className="ss-report-title">SITE SURVEY REPORT</div>
              

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">Visit Information</th></tr>
                </thead>
                <tbody>
                  <tr><td>Survey ID</td><td>{s.id}</td></tr>
                  <tr><td>Customer Name</td><td>{s.customerName}</td></tr>
                  <tr><td>Lead ID</td><td>{s.leadId}</td></tr>
                  <tr><td>Technician</td><td>{s.technicianName || s.technicianId || "—"}</td></tr>
                  <tr><td>Visit Date</td><td>{s.visitDate}</td></tr>
                  <tr><td>Visit Time</td><td>{formatTime12h(s.visitTime)}</td></tr>
                  <tr><td>Visit Status</td><td><span className={`ss-badge ${getStatusClass(s.visitStatus)}`}>{s.visitStatus}</span></td></tr>
                  <tr><td>Notes</td><td>{s.notes || "—"}</td></tr>
                </tbody>
              </table>

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">Roof Information</th></tr>
                </thead>
                <tbody>
                  <tr><td>Roof Type</td><td>{s.roofType}</td></tr>
                  <tr><td>Roof Length</td><td>{s.roofLength} m</td></tr>
                  <tr><td>Roof Width</td><td>{s.roofWidth} m</td></tr>
                  <tr><td>Roof Area</td><td>{s.roofArea} m²</td></tr>
                  <tr><td>Roof Angle</td><td>{s.roofAngle}°</td></tr>
                </tbody>
              </table>

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">Shadow Analysis</th></tr>
                </thead>
                <tbody>
                  <tr><td>Shadow Condition</td><td>{s.shadowAnalysis}</td></tr>
                  <tr><td>Shadow Notes</td><td>{s.shadowNotes || "—"}</td></tr>
                  <tr><td>Monthly Units</td><td>{s.monthlyUnits != null ? `${s.monthlyUnits} kWh` : "—"}</td></tr>
                </tbody>
              </table>

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">GPS Coordinates</th></tr>
                </thead>
                <tbody>
                  <tr><td>Latitude</td><td>{s.latitude}</td></tr>
                  <tr><td>Longitude</td><td>{s.longitude}</td></tr>
                </tbody>
              </table>

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">Files & Documents</th></tr>
                </thead>
                <tbody>
                  <tr><td>Electricity Bill</td><td>{s.electricityBill ? s.electricityBill.name : "Not uploaded"}</td></tr>
                  <tr><td>Site Photos</td><td>{s.sitePhotos.length > 0 ? s.sitePhotos.map((p) => p.name).join(", ") : "None"}</td></tr>
                </tbody>
              </table>

              <table className="ss-report-table">
                <thead>
                  <tr><th colSpan="2">Survey Notes</th></tr>
                </thead>
                <tbody>
                  <tr><td colSpan="2">{s.surveyNotes || "No additional notes."}</td></tr>
                </tbody>
              </table>

              <div className="ss-report-footer">
                <span>Generated on: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</span>
              </div>
            </div>
          </div>
          <div className="ss-modal-footer">
            <button className="modal-footer-close" onClick={() => setShowReportModal(false)}>Close</button>
            <button className="ss-btn ss-btn-primary" onClick={handleDownload}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Report
            </button>
          </div>
        </div>
      </div>
    );
  };

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="site-survey-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="ss-page">
      {showFormPage ? renderFormPage() : (
        <>
      {/* Page Header */}
      <div className="ss-header">
        <div>
          <h1 className="ss-title">Site Survey</h1>
          <p className="ss-subtitle">Schedule and manage site visits, roof analysis, shadow assessment, and survey reports.</p>
        </div>          <div className="ss-header-actions">
              {canDo("site-survey", "create") && (
              <button className="ss-btn ss-btn-primary" onClick={() => openFormPage(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New Survey
              </button>
              )}
            </div>
      </div>

      {/* Stats */}
      <div className="ss-stats-grid">
        <StatCard
          title="Total Surveys"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
        <StatCard
          title="Scheduled"
          value={stats.scheduled.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Completed"
          value={stats.completed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Cancelled"
          value={stats.cancelled.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
      </div>

      {/* Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-toolbar-row">
          <div className="ss-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search by Survey ID, Customer, or Technician" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
            {search && (
              <button className="ss-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Status" }, ...VISIT_STATUSES.map((st) => ({ value: st, label: st }))]} />
          <Dropdown value={roofTypeFilter} onChange={(val) => { setRoofTypeFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Roof Type" }, ...ROOF_TYPE_OPTIONS.map((rt) => ({ value: rt, label: rt }))]} />
          <Dropdown value={technicianFilter} onChange={(val) => { setTechnicianFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Technician" }, ...technicianOptions]} />
          <input type="date" className="ss-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
          <input type="date" className="ss-inline-date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />
        </div>
      </div>

      {/* Table */}
      <div className="ss-table-card">
        <div className="ss-table-wrapper">
          <table className="ss-table">
            <thead>
              <tr>
                <th>Survey ID</th>
                <th>Project</th>
                <th>Customer</th>
                <th>Technician</th>
                <th>Visit Date</th>
                <th>Roof Type</th>
                <th>Roof Area</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={9} />
              ) : filteredSurveys.length === 0 ? (
                <TableEmptyState colSpan={9} title="No surveys found" subtitle="Try adjusting your search or filters." />
              ) : (
                filteredSurveys.map((survey) => (
                  <tr key={survey.id}>
                    <td className="ss-td-id">{survey.id}</td>
                    <td className="ss-td-project ss-td-nowrap">{survey.projectName || "—"}</td>
                    <td className="ss-td-name">
                      {survey.customerId || survey.leadId ? (
                        canDo("customers", "view") ? (
                          <button
                            className="ss-customer-link"
                            onClick={() => openCustomerModal(survey)}
                            title="View customer details"
                          >
                            {survey.customerName}
                          </button>
                        ) : (
                          <span className="ss-td-name-text">{survey.customerName}</span>
                        )
                      ) : (
                        <span className="ss-td-name-text">{survey.customerName}</span>
                      )}
                    </td>
                    <td className="ss-td-nowrap">{survey.technicianName || survey.technicianId || "—"}</td>
                    <td className="ss-td-nowrap">{survey.visitDate}</td>
                    <td>
                      <span className="ss-roof-tag">{survey.roofType}</span>
                    </td>
                    <td className="ss-td-area">{survey.roofArea} m²</td>
                    <td>
                      {canDo("site-survey", "edit") ? (
                        <Dropdown
                          value={survey.visitStatus}
                          onChange={(val) => handleQuickStatusChange(survey, val)}
                          options={VISIT_STATUSES.map((st) => ({ value: st, label: st }))}
                          variant="inline"
                          size="sm"
                          disabled={savingStatusId !== null}
                          className={`ss-inline-status ss-inline-${survey.visitStatus?.toLowerCase()}`}
                          placeholder={survey.visitStatus}
                        />
                      ) : (
                        <span className={`ss-badge ${getStatusClass(survey.visitStatus)}`}>{survey.visitStatus}</span>
                      )}
                    </td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" title="View Details" onClick={() => openViewModal(survey)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <ActivityLogButton
                          module="site-survey"
                          onClick={() => {
                            const surveyId = survey.serverId || survey._id || survey.id;
                            navigate(`/admin/site-survey-activity/${surveyId}`, {
                              state: { target: { recordId: surveyId, recordLabel: survey.surveyId || survey.projectName || survey.customerName, module: "site-survey" } },
                            });
                          }}
                          title="View Site Survey Activity Log"
                        />
                        {canDo("site-survey", "edit") && (
                        <button className="act-btn act-edit" title="Edit Survey" onClick={() => openFormPage(survey)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        )}
                        {canDo("site-survey", "delete") && (
                        <button className="act-btn act-delete" title="Delete Survey" onClick={() => confirmDelete(survey)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                        )}
                                                {canDo("solar-design", "create") && survey.leadId && (() => {
                          const alreadyDesigned = designedLeadIds.includes(survey.leadId);
                          const completed = survey.visitStatus === "Completed";
                          return (
                            <button
                              className={`ss-design-btn${completed && !alreadyDesigned ? "" : " ss-design-btn-disabled"}`}
                              title={
                                alreadyDesigned ? "A solar design already exists for this lead"
                                : completed ? "Create a solar design from this survey"
                                : "Complete this survey first to create a solar design"
                              }
                              onClick={() => completed && !alreadyDesigned && handleCreateDesign(survey)}
                              disabled={!completed || alreadyDesigned}
                            >
                              Create Design
                            </button>
                          );
})()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredSurveys.length > 0 && (
          <div className="ss-pagination-row">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={serverTotal || filteredSurveys.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {showViewModal && renderViewModal()}
      {showReportModal && renderReportModal()}
      {(viewCustomer || viewCustomerLoading) && (
        <div className="ss-overlay">
          <div className="ss-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ss-modal-header">
              <div className="ss-modal-title">
                <h3>Customer Details</h3>
                {viewCustomer && <span className="ss-modal-subtitle">{viewCustomer.customerId}</span>}
              </div>
              <button className="ss-modal-close" onClick={() => setViewCustomer(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="ss-view-body">
              {viewCustomerLoading ? (
                <PageLoader minHeight="200px" />
              ) : (
                <CustomerDetailsCard customer={viewCustomer} />
              )}
            </div>
            <div className="ss-modal-footer">
              <button className="modal-footer-close" onClick={() => setViewCustomer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {zoomImage && (
        <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />
      )}
        </>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Survey"
        message={`Are you sure you want to delete survey ${deleteTarget?.id}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
        loading={deleteLoading}
      />
    </div>
  );
};

export default SiteSurvey;
