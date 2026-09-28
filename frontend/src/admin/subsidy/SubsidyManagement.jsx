import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { subsidySchema } from "../../utils/AdminValidation";
import { Pagination, Dropdown, useToast, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { subsidyAPI, invoiceAPI, receiptAPI, creditNoteAPI, projectApprovalAPI, customerAPI, siteSurveyAPI, fileUrl } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { formatDate as formatDateHelper, formatCurrency as formatCurrencyHelper } from "../../utils/helpers";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./SubsidyManagement.css";

/* ──────────────────────────────────────────────
   Data Constants
   ────────────────────────────────────────────── */

const SCHEMES = [
  "PM Surya Ghar Yojana",
  "State Government Subsidies",
  "Residential Subsidy Programs",
  "Commercial Incentive Programs",
];

const SUBSIDY_STATUSES = [
  "Draft",
  "Submitted",
  "Under Verification",
  "Approved",
  "Rejected",
  "Subsidy Released",
];

const APPROVAL_STATUSES = ["Pending", "Approved", "Rejected"];

const CUSTOMER_TYPES = ["Individual", "Business", "Government", "NGO"];
const PROJECT_TYPES = ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"];

const REQUIRED_DOCUMENTS = [
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "pan", label: "PAN Card" },
  { key: "electricityBill", label: "Electricity Bill" },
  { key: "bankDetails", label: "Bank Details" },
  { key: "propertyDocs", label: "Property Documents" },
  { key: "installCert", label: "Installation Certificate" },
  { key: "netMeterApproval", label: "Net Meter Approval" },
];

const PAYMENT_STATUSES = ["Pending", "Processing", "Released", "Failed"];

const initialForm = {
  customerName: "",
  customerId: "",
  projectName: "",
  schemeName: "PM Surya Ghar Yojana",
  applicationDate: "",
  status: "Draft",
  notes: "",
  customerType: "Individual",
  projectType: "Residential",
  eligibleCapacity: "",
  subsidyPercent: "",
  ratePerKw: "1000",
  calculationMethod: "percentage",
  subsidyAmount: "",
  approvalStatus: "Pending",
  approverName: "",
  approvalDate: "",
  approvalRemarks: "",
  paymentStatus: "Pending",
  paymentDate: "",
  releasedAmount: "",
  transactionRef: "",
  documents: [],
  submissionDate: "",
  submittedBy: "",
  currentStage: "Application Created",
};



/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const formatDate = (iso) => iso ? formatDateHelper(iso) : "—";
const formatCurrency = formatCurrencyHelper;

// PM Surya Ghar Yojana slab structure — ₹30,000/kW for the first 2 kW,
// ₹18,000/kW for the next 3 kW, capped at ₹78,000 total.
const SLAB_RATE_1 = 30000;
const SLAB_RATE_2 = 18000;
const SLAB_CAP = 78000;

function calcSlabSubsidy(cap) {
  const c = Math.max(0, parseFloat(cap) || 0);
  const first = Math.min(c, 2);
  const second = Math.max(0, Math.min(c - 2, 3));
  const raw = first * SLAB_RATE_1 + second * SLAB_RATE_2;
  return { first, second, amount: Math.min(raw, SLAB_CAP), capped: raw > SLAB_CAP };
}

function generateId(arr) {
  // Next number comes from existing applicationNumbers (SUB-2026-001 -> 1),
  // not from item.id — API records use _id, not id.
  let maxNum = 0;
  (arr || []).forEach((item) => {
    const num = parseInt(String(item.applicationNumber || "").split("-").pop(), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  });
  return `SUB-2026-${String(maxNum + 1).padStart(3, "0")}`;
}

function getStatusClass(status) {
  switch (status) {
    case "Subsidy Released": return "sg-badge-released";
    case "Approved": return "sg-badge-approved";
    case "Rejected": return "sg-badge-rejected";
    case "Under Verification": return "sg-badge-verify";
    case "Submitted": return "sg-badge-submitted";
    case "Draft": return "sg-badge-draft";
    default: return "";
  }
}

function getPaymentStatusClass(status) {
  switch (status) {
    case "Released": return "sg-badge-released";
    case "Processing": return "sg-badge-verify";
    case "Failed": return "sg-badge-rejected";
    default: return "sg-badge-draft";
  }
}

// Human-readable file size (e.g. 1.4 MB)
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Is this document a previewable image (JPG/PNG)?
function isImageFile(url) {
  return typeof url === "string" && /\.(jpe?g|png)$/i.test(url);
}

// Is this document entry an image (by stored metadata, for DB-stored files)?
function isImageEntry(entry) {
  if (!entry) return false;
  if (/^image\//i.test(entry.mimeType || "")) return true;
  const name = entry.originalName || entry.fileName || "";
  return /\.(jpe?g|png)$/i.test(name);
}

const isPdfEntry = (entry) =>
  !!entry && (entry.mimeType === "application/pdf" || /\.pdf$/i.test(entry.originalName || entry.fileName || ""));

const docDisplayName = (entry) => entry?.originalName || entry?.fileName || entry?.name || "document";

/* ── Fetch + preview a stored subsidy document from the database ──
   Works for BOTH staged uploads (fileRef, before the application is saved)
   and saved documents (subsidyId + index). Images render as fixed-size
   thumbnails with click-to-zoom; PDFs render in an inline iframe. */
function StoredSubsidyDoc({ entry, subsidyId, docIndex }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  const fileRef = entry?.fileRef || "";
  const hasFile = !!(entry && entry.hasFile);
  const legacyUrl = entry?.fileUrl || "";

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setFailed(false);
    const isPending = !!fileRef;
    const isSaved = !!(subsidyId && hasFile && docIndex !== undefined);
    const isLegacy = !!(legacyUrl && !fileRef && !hasFile);

    if (isPending) {
      subsidyAPI
        .downloadPendingFile(fileRef)
        .then((res) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(res.data);
          setSrc(objectUrl);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    } else if (isSaved) {
      subsidyAPI
        .downloadDocument(subsidyId, docIndex)
        .then((res) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(res.data);
          setSrc(objectUrl);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    } else if (isLegacy) {
      setSrc(fileUrl(legacyUrl));
    } else {
      setSrc("");
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileRef, hasFile, legacyUrl, subsidyId, docIndex]);

  if (failed) return <div className="sg-doc-preview-error">Failed to load document</div>;
  if (!src) return null;
  if (isPdfEntry(entry)) {
    return <iframe src={src} title={docDisplayName(entry)} className="sg-doc-preview-pdf" />;
  }
  return (
    <img
      src={src}
      alt={docDisplayName(entry)}
      className="sg-doc-preview-img"
      onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
      title="Click to view full size"
    />
  );
}

/* ──────────────────────────────────────────────
   Subsidy Document Card (Section 4)
   Each required document becomes a card with
   upload + progress, file info, preview/download,
   replace/delete, metadata and verification.
   ────────────────────────────────────────────── */
function SubsidyDocCard({ doc, entry, uploadState, onUpload, onMetaChange, onVerify, onRemove, subsidyId, docIndex, canExport = true }) {
  const hasFile = !!(entry && (entry.fileUrl || entry.fileRef || entry.hasFile));
  const status = (entry && entry.verificationStatus) || "Pending";
  const uploading = !!(uploadState && uploadState.uploading);

  // Fetch the document bytes and open them in a new tab (Preview).
  const handlePreview = async () => {
    if (!entry) return;
    try {
      if (entry.fileUrl && !entry.fileRef && !entry.hasFile) {
        window.open(fileUrl(entry.fileUrl), "_blank", "noopener,noreferrer");
        return;
      }
      const res = entry.fileRef
        ? await subsidyAPI.downloadPendingFile(entry.fileRef)
        : await subsidyAPI.downloadDocument(subsidyId, docIndex);
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.warn("Failed to preview document:", err);
    }
  };

  // Fetch the document bytes and download them as a file.
  const handleDownload = async () => {
    if (!entry) return;
    try {
      let blob, name = docDisplayName(entry);
      if (entry.fileUrl && !entry.fileRef && !entry.hasFile) {
        const a = document.createElement("a");
        a.href = fileUrl(entry.fileUrl);
        a.download = name;
        a.click();
        return;
      }
      const res = entry.fileRef
        ? await subsidyAPI.downloadPendingFile(entry.fileRef)
        : await subsidyAPI.downloadDocument(subsidyId, docIndex);
      blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.warn("Failed to download document:", err);
    }
  };

  const fileInput = (onPick) => (
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png"
      hidden
      onChange={(e) => {
        const f = e.target.files && e.target.files[0];
        if (f) onPick(f);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className={`sg-doc-card ${hasFile ? "sg-doc-card-filled" : ""} ${status === "Verified" ? "sg-doc-card-verified" : status === "Rejected" ? "sg-doc-card-rejected" : ""}`}>
      <div className="sg-doc-card-head">
        <div className="sg-doc-card-title">
          <span className={`sg-doc-card-icon ${(isImageEntry(entry) || isImageFile(entry && entry.fileUrl)) ? "sg-doc-card-icon-img" : ""}`}>
            {(isImageEntry(entry) || isImageFile(entry && entry.fileUrl)) ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            )}
          </span>
          <span className="sg-doc-card-label">{doc.label}</span>
        </div>
        <span className={`sg-doc-chip sg-doc-chip-${status.toLowerCase()}`}>{status}</span>
      </div>

      {/* Upload / file area */}
      {uploading ? (
        <div className="sg-doc-uploading">
          <div className="sg-doc-progress-track">
            <div className="sg-doc-progress-fill" style={{ width: `${uploadState.progress || 0}%` }} />
          </div>
          <span className="sg-doc-progress-text">Uploading… {uploadState.progress || 0}%</span>
        </div>
      ) : hasFile ? (
        <div className="sg-doc-file">
          <div className="sg-doc-file-top">
            <span className="sg-doc-file-name" title={entry.fileName}>{entry.fileName}</span>
            <span className="sg-doc-file-size">{formatFileSize(entry.fileSize)}</span>
          </div>
          <div className="sg-doc-file-meta">
            {entry.uploadedBy && <span>Uploaded by <strong>{entry.uploadedBy}</strong></span>}
            {entry.uploadedDate && <span>{formatDate(entry.uploadedDate)}</span>}
          </div>
          {(subsidyId || (entry && entry.fileRef)) && (
            <StoredSubsidyDoc entry={entry} subsidyId={subsidyId} docIndex={docIndex} />
          )}
          <div className="sg-doc-file-actions">
            <button type="button" className="sg-doc-action" onClick={handlePreview} title="Preview">Preview</button>
            {canExport && (
            <button type="button" className="sg-doc-action" onClick={handleDownload} title="Download">Download</button>
            )}
            <label className="sg-doc-action" title="Replace">
              Replace
              {fileInput((f) => onUpload(f))}
            </label>
            <button type="button" className="sg-doc-action sg-doc-action-danger" onClick={onRemove} title="Delete">Delete</button>
          </div>
        </div>
      ) : (
        <label className="sg-doc-upload-area">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          <span>Click to upload</span>
          <small>PDF, JPG or PNG · max 25MB</small>
          {fileInput((f) => onUpload(f))}
        </label>
      )}

      {/* Metadata: number + issue date */}
      <div className="sg-doc-meta-grid">
        <div className="sg-doc-meta-field">
          <label>Document Number</label>
          <input
            type="text"
            value={(entry && entry.documentNumber) || ""}
            onChange={(e) => onMetaChange("documentNumber", e.target.value)}
            placeholder="e.g. 1234-5678-9012"
            maxLength={100}
          />
        </div>
        <div className="sg-doc-meta-field">
          <label>Issue Date</label>
          <input
            type="date"
            value={(entry && entry.issueDate) || ""}
            onChange={(e) => onMetaChange("issueDate", e.target.value)}
          />
        </div>
      </div>

      {/* Verification */}
      <div className="sg-doc-verify">
        <div className="sg-doc-meta-field sg-doc-verify-status">
          <label>Verification Status</label>
          <Dropdown
            value={status}
            onChange={(val) => onVerify(val)}
            options={[
              { value: "Pending", label: "Pending" },
              { value: "Verified", label: "Verified" },
              { value: "Rejected", label: "Rejected" },
            ]}
            variant="form"
            placeholder="Select status"
            disabled={!hasFile}
          />
          {!hasFile && <small className="sg-doc-verify-hint">Upload a file to verify</small>}
        </div>
        <div className="sg-doc-meta-field sg-doc-verify-remarks">
          <label>Verifier Remarks</label>
          <input
            type="text"
            value={(entry && entry.verifierRemarks) || ""}
            onChange={(e) => onMetaChange("verifierRemarks", e.target.value)}
            placeholder="Remarks…"
            maxLength={500}
          />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */

export default function SubsidyManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canDo } = useAuth();
  const { success: showToast } = useToast();

  // Data states
  const [applications, setApplications] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [fetchLoading, setFetchLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Billing data — only customers whose full payment is collected are
  // eligible for a government subsidy.
  const [billingInvoices, setBillingInvoices] = useState([]);
  const [billingReceipts, setBillingReceipts] = useState([]);
  const [billingCreditNotes, setBillingCreditNotes] = useState([]);
  const [projectApprovals, setProjectApprovals] = useState([]);
  const [customerMaster, setCustomerMaster] = useState([]);
  const [siteSurveys, setSiteSurveys] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Search state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Guards against out-of-order responses overwriting newer page/filter results.
  const fetchSeqRef = useRef(0);

  // Filter states
  const [schemeFilter, setSchemeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [approvalFilter, setApprovalFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");

  // Form page state
  const [showFormPage, setShowFormPage] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [eligibilityResult, setEligibilityResult] = useState(null);

  // Document upload progress keyed by document type ({ aadhaar: { progress, uploading } })
  const [uploadState, setUploadState] = useState({});
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setShowFormPage(false);
    setEditingApp(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key, location.state]);

  // ── Fetch subsidies from API ──
  const fetchSubsidies = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setFetchLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (schemeFilter !== "All") params.schemeName = schemeFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (approvalFilter !== "All") params.approvalStatus = approvalFilter;
      if (paymentFilter !== "All") params.paymentStatus = paymentFilter;

      const response = await subsidyAPI.getAll(params);
      if (seq === fetchSeqRef.current && response.data.success) {
        setApplications(response.data.data);
        setServerTotal(response.data.pagination?.total || response.data.data.length);
      }
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        console.error("Fetch subsidies error:", err);
        showToast(err.response?.data?.message || "Failed to fetch subsidy applications");
      }
    } finally {
      if (seq === fetchSeqRef.current) setFetchLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, schemeFilter, statusFilter, approvalFilter, paymentFilter, showToast]);

  const fetchBillingData = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const [invRes, rcpRes, cnRes, paRes, cusRes, ssRes] = await Promise.all([
        invoiceAPI.getAll({ page: 1, limit: 500 }),
        receiptAPI.getAll({ page: 1, limit: 500 }),
        creditNoteAPI.getAll({ page: 1, limit: 500 }),
        projectApprovalAPI.getAll({ page: 1, limit: 500 }),
        customerAPI.getAll({ page: 1, limit: 500 }),
        siteSurveyAPI.getAll({ page: 1, limit: 500 }),
      ]);
      if (invRes.data.success) setBillingInvoices(invRes.data.data);
      if (rcpRes.data.success) setBillingReceipts(rcpRes.data.data);
      if (cnRes.data.success) setBillingCreditNotes(cnRes.data.data);
      if (paRes.data.success) setProjectApprovals(paRes.data.data);
      if (cusRes.data.success) setCustomerMaster(cusRes.data.data);
      if (ssRes.data.success) setSiteSurveys(ssRes.data.data);
    } catch (err) {
      console.error("Fetch billing data error:", err);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubsidies();
    fetchBillingData();
  }, [fetchSubsidies, fetchBillingData]);

  /* ── Debounce the search input (one request after a pause, not per keystroke) ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ────────── Formik Setup ────────── */
  function getInitialFormValues(app) {
    if (app) {
      return {
        customerName: app.customerName,
        customerId: app.customerId || "",
        projectName: app.projectName || "",
        schemeName: app.schemeName,
        applicationDate: app.applicationDate,
        status: app.status,
        notes: app.notes || "",
        customerType: app.customerType,
        projectType: app.projectType,
        eligibleCapacity: String(app.eligibleCapacity || ""),
        subsidyPercent: String(app.subsidyPercent || ""),
        ratePerKw: String(app.ratePerKw || "1000"),
        calculationMethod: app.calculationMethod || (app.schemeName === "PM Surya Ghar Yojana" ? "slab" : "percentage"),
        subsidyAmount: String(app.subsidyAmount || ""),
        approvalStatus: app.approvalStatus,
        approverName: app.approverName || "",
        approvalDate: app.approvalDate || "",
        approvalRemarks: app.approvalRemarks || "",
        paymentStatus: app.paymentStatus,
        paymentDate: app.paymentDate || "",
        releasedAmount: String(app.releasedAmount || ""),
        transactionRef: app.transactionRef || "",
        // documents can be an array (new format) or the legacy boolean object
        // ({ aadhaar: true }) — migrate legacy entries so they are not lost on save.
        documents: Array.isArray(app.documents)
          ? app.documents.map((d) => ({ ...d }))
          : (app.documents && typeof app.documents === "object"
              ? REQUIRED_DOCUMENTS.filter((d) => app.documents[d.key]).map((d) => ({
                  documentType: d.key,
                  documentNumber: "",
                  issueDate: "",
                  uploadedBy: "",
                  verificationStatus: "Verified",
                  verifierRemarks: "",
                  fileName: "",
                  fileSize: 0,
                  fileType: "other",
                  fileUrl: ""
                }))
              : []),
        submissionDate: app.submissionDate || "",
        submittedBy: app.submittedBy || "",
        currentStage: app.currentStage,
      };
    }
    return {
      ...initialForm,
      applicationDate: todayISO(),
      approvalDate: todayISO(),
      paymentDate: todayISO(),
    };
  }

  const formik = useFormik({
    initialValues: getInitialFormValues(editingApp),
    validationSchema: subsidySchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      try {
        const payload = {
          applicationNumber: editingApp?.applicationNumber || generateId(applications),
          customerName: values.customerName.trim(),
          customerId: values.customerId.trim() || `C-${String(applications.length + 1).padStart(3, "0")}`,
          projectName: values.projectName.trim(),
          schemeName: values.schemeName,
          applicationDate: values.applicationDate,
          status: values.status,
          notes: values.notes.trim(),
          customerType: values.customerType,
          projectType: values.projectType,
          eligibleCapacity: parseFloat(values.eligibleCapacity) || null,
          subsidyPercent: values.calculationMethod === "slab" ? null : (parseFloat(values.subsidyPercent) || 0),
          ratePerKw: values.calculationMethod === "slab" ? null : (parseFloat(values.ratePerKw) || 1000),
          calculationMethod: values.calculationMethod,
          subsidyAmount: parseFloat(values.subsidyAmount) || 0,
          approvalStatus: values.approvalStatus,
          approverName: values.approverName.trim(),
          approvalDate: values.approvalDate || null,
          approvalRemarks: values.approvalRemarks.trim(),
          paymentStatus: values.paymentStatus,
          paymentDate: values.paymentDate || null,
          releasedAmount: parseFloat(values.releasedAmount) || null,
          transactionRef: values.transactionRef.trim(),
          documents: values.documents,
          submissionDate: values.submissionDate || values.applicationDate,
          submittedBy: values.submittedBy.trim() || "Admin",
          currentStage: values.status,
        };

        if (editingApp) {
          const response = await subsidyAPI.update(editingApp._id, payload);
          if (response.data.success) {
            showToast(`Application ${payload.applicationNumber} updated successfully`);
            fetchSubsidies();
          }
        } else {
          const response = await subsidyAPI.create(payload);
          if (response.data.success) {
            showToast(`Application ${payload.applicationNumber} created successfully`);
            fetchSubsidies();
          }
        }
        setShowFormPage(false);
        setEditingApp(null);
        resetForm();
      } catch (err) {
        console.error("Save subsidy error:", err);
        showToast(err.response?.data?.message || "Failed to save subsidy application");
      } finally {
        setLoading(false);
      }
    },
  });

  const generatedAppNumber = useMemo(() => !editingApp ? generateId(applications) : "", [editingApp, applications]);

  // ── Pagination (server-side) ──
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(serverTotal / pageSize));
  }, [serverTotal, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // View modal
  const [viewApp, setViewApp] = useState(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Lock scroll
  const anyModalOpen = !!viewApp || !!deleteTarget;
  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    content.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);

  /* ────────── Stats ────────── */
  const stats = useMemo(() => {
    const totalApps = applications.length;
    const totalSubsidy = applications.reduce((sum, a) => sum + a.subsidyAmount, 0);
    const released = applications.filter((a) => a.paymentStatus === "Released").reduce((sum, a) => sum + a.releasedAmount, 0);
    const pendingReview = applications.filter((a) => a.status === "Submitted" || a.status === "Under Verification").length;
    const approved = applications.filter((a) => a.status === "Approved" && a.paymentStatus !== "Released").reduce((sum, a) => sum + a.subsidyAmount, 0);
    return { totalApps, totalSubsidy, released, pendingReview, approved };
  }, [applications]);



  /* ────────── Eligibility Score Calculation ────────── */
  const handleCheckEligibility = () => {
    const { customerType, projectType, documents } = formik.values;
    const custScore = { Individual: 100, NGO: 90, Government: 80, Business: 70 };
    const projScore = { Residential: 100, Agricultural: 90, Commercial: 80, Industrial: 70, Individual: 100, NGO: 90, Government: 80, Business: 70 };

    const cs = custScore[customerType] || 0;
    const ps = projScore[projectType] || 0;

    const totalDocs = REQUIRED_DOCUMENTS.length;
    const docsArr = Array.isArray(documents) ? documents : [];
    // Only a document with an actual uploaded file can count as verified.
    const verifiedDocs = REQUIRED_DOCUMENTS.filter((d) => {
      const entry = docsArr.find((x) => x.documentType === d.key);
      return entry && entry.verificationStatus === "Verified" && (entry.fileUrl || entry.fileRef || entry.hasFile);
    }).length;
    const ds = Math.round((verifiedDocs / totalDocs) * 100);

    const overall = Math.round((cs * 0.35) + (ps * 0.30) + (ds * 0.35));

    const breakdown = [
      { label: "Customer Type", score: cs, weight: "35%", detail: customerType },
      { label: "Project Type", score: ps, weight: "30%", detail: projectType },
      { label: "Documents", score: ds, weight: "35%", detail: `${verifiedDocs}/${totalDocs} verified` },
    ];

    const verdict = overall >= 80 ? "Highly Eligible" : overall >= 60 ? "Eligible" : overall >= 40 ? "Partially Eligible" : "Not Eligible";

    setEligibilityResult({ overall, breakdown, verdict, verifiedDocs, totalDocs });
  };

  /* ────────── Form Handlers ────────── */
  // Projects from billing whose every invoice is fully paid — only these
  // are eligible for a subsidy (full payment collected = outstanding 0).
  const eligibleProjects = useMemo(() => {
    const byProject = new Map();
    billingInvoices.forEach((inv) => {
      const projKey = inv.projectName || "";
      if (!projKey) return;
      const paid = billingReceipts
        .filter((r) => r.invoiceNumber === inv.invoiceNumber)
        .reduce((s, r) => s + (Number(r.paymentAmount) || 0), 0);
      const credited = billingCreditNotes
        .filter((c) => c.invoiceNumber === inv.invoiceNumber)
        .reduce((s, c) => s + (Number(c.creditAmount) || 0), 0);
      const outstanding = Math.max(0, (Number(inv.totalAmount) || 0) - paid - credited);
      const entry = byProject.get(projKey) || { projectName: projKey, customerName: inv.customerName || "", customerId: inv.customerId || "", capacity: "", customerType: "", projectType: "", fullyPaid: true };
      if (outstanding > 0) entry.fullyPaid = false;
      if (inv.customerName && !entry.customerName) entry.customerName = inv.customerName;
      if (inv.customerId && !entry.customerId) entry.customerId = inv.customerId;
      byProject.set(projKey, entry);
    });
    // Merge capacity (kW) from Project Approvals
    projectApprovals.forEach((pa) => {
      const entry = pa.projectName ? byProject.get(pa.projectName) : null;
      if (!entry) return;
      if (pa.capacity) {
        const cap = String(pa.capacity);
        if (entry.capacity.indexOf(cap) === -1) {
          entry.capacity = entry.capacity ? `${entry.capacity}, ${cap}` : cap;
        }
      }
      if (pa.customerName && !entry.customerName) entry.customerName = pa.customerName;
      if (pa.customerId && !entry.customerId) entry.customerId = pa.customerId;
    });
    // Site Survey se Project Type
    siteSurveys.forEach((s) => {
      const entry = s.projectName ? byProject.get(s.projectName) : null;
      if (!entry) return;
      if (s.projectType && PROJECT_TYPES.includes(s.projectType) && !entry.projectType) {
        entry.projectType = s.projectType;
      }
    });
    // Customer master se Customer Type
    customerMaster.forEach((c) => {
      [...byProject.values()].forEach((entry) => {
        if (entry.customerName !== c.name) return;
        if (c.type && CUSTOMER_TYPES.includes(c.type) && !entry.customerType) {
          entry.customerType = c.type;
        }
        if ((c.type === "Residential" || c.type === "Commercial") && !entry.projectType) {
          entry.projectType = c.type;
        }
      });
    });
    return [...byProject.values()].filter((p) => p.fullyPaid);
  }, [billingInvoices, billingReceipts, billingCreditNotes, projectApprovals, customerMaster, siteSurveys]);

  const projectOptions = useMemo(() => {
    const alreadySubsidized = new Set(applications.map((a) => a.projectName).filter(Boolean));
    const opts = [
      { value: "", label: "Select Eligible Project" },
      ...eligibleProjects
        .filter((p) => !alreadySubsidized.has(p.projectName) || (editingApp && p.projectName === editingApp.projectName))
        .map((p) => ({ value: p.projectName, label: p.customerName ? `${p.projectName} — ${p.customerName}` : p.projectName })),
    ];
    if (editingApp?.projectName && !eligibleProjects.some((p) => p.projectName === editingApp.projectName)) {
      opts.push({ value: editingApp.projectName, label: editingApp.projectName });
    }
    return opts;
  }, [eligibleProjects, editingApp, applications]);

  // Slab breakdown for PM Surya Ghar method (rendered in Section 3)
  const slabInfo = useMemo(() => {
    if (formik.values.calculationMethod !== "slab") return null;
    const cap = parseFloat(formik.values.eligibleCapacity) || 0;
    if (!cap) return { first: 0, second: 0, amount: 0, capped: false, empty: true };
    return { ...calcSlabSubsidy(cap), empty: false };
  }, [formik.values.calculationMethod, formik.values.eligibleCapacity]);

  // Subsidy Amount — slab (PM Surya Ghar) ya percentage formula
  const calcSubsidyAmount = (cap, pct, rate, method) => {
    if (method === "slab") return String(Math.round(calcSlabSubsidy(cap).amount));
    return String(Math.round((cap || 0) * (rate || 1000) * (pct || 0) / 100));
  };

  const handleProjectSelect = (projectName) => {
    formik.setFieldValue("projectName", projectName);
    const proj = eligibleProjects.find((p) => p.projectName === projectName);
    const isSameEditingProject = editingApp?.projectName === projectName;
    formik.setFieldValue("customerName", proj ? proj.customerName : (isSameEditingProject ? editingApp.customerName || "" : ""));
    formik.setFieldValue("customerId", proj ? proj.customerId : (isSameEditingProject ? editingApp.customerId || "" : ""));
    formik.setFieldValue("customerType", proj && proj.customerType ? proj.customerType : "Individual");
    formik.setFieldValue("projectType", proj && proj.projectType ? proj.projectType : "Residential");
    setEligibilityResult(null);
    const cap = proj && proj.capacity ? (parseFloat(proj.capacity) || 0) : 0;
    formik.setFieldValue("eligibleCapacity", cap ? String(cap) : "");
    const pct = parseFloat(formik.values.subsidyPercent) || 0;
    const rate = parseFloat(formik.values.ratePerKw) || 1000;
    formik.setFieldValue("subsidyAmount", cap ? calcSubsidyAmount(cap, pct, rate, formik.values.calculationMethod) : "");
  };

  const openFormPage = (app = null) => {
    setEditingApp(app || null);
    setEligibilityResult(null);
    setShowFormPage(true);
  };

  // The common Dropdown reports a value directly (not an event) — adapt it
  // to the event-based handleFieldChange so all its side-effects still run.
  const handleDropdownChange = (field) => (val) =>
    handleFieldChange(field)({ target: { value: val } });

  const handleFieldChange = (field) => (e) => {
    const val = e.target.value;
    if (field === "eligibleCapacity" || field === "subsidyPercent" || field === "ratePerKw") {
      const newCap = parseFloat(field === "eligibleCapacity" ? val : formik.values.eligibleCapacity) || 0;
      const newPct = parseFloat(field === "subsidyPercent" ? val : formik.values.subsidyPercent) || 0;
      const newRate = parseFloat(field === "ratePerKw" ? val : formik.values.ratePerKw) || 1000;
      formik.setFieldValue(field, val);
      formik.setFieldValue("subsidyAmount", calcSubsidyAmount(newCap, newPct, newRate, formik.values.calculationMethod));
    } else if (field === "calculationMethod") {
      formik.setFieldValue(field, val);
      const newCap = parseFloat(formik.values.eligibleCapacity) || 0;
      const newPct = parseFloat(formik.values.subsidyPercent) || 0;
      const newRate = parseFloat(formik.values.ratePerKw) || 1000;
      formik.setFieldValue("subsidyAmount", calcSubsidyAmount(newCap, newPct, newRate, val));
    } else if (field === "schemeName") {
      formik.setFieldValue(field, val);
      // PM Surya Ghar Yojana -> slab method auto-select (and back to percentage otherwise)
      if (val === "PM Surya Ghar Yojana" && formik.values.calculationMethod !== "slab") {
        formik.setFieldValue("calculationMethod", "slab");
        const newCap = parseFloat(formik.values.eligibleCapacity) || 0;
        formik.setFieldValue("subsidyAmount", calcSubsidyAmount(newCap, 0, 1000, "slab"));
      } else if (val !== "PM Surya Ghar Yojana" && formik.values.calculationMethod === "slab") {
        formik.setFieldValue("calculationMethod", "percentage");
        const newCap = parseFloat(formik.values.eligibleCapacity) || 0;
        const newPct = parseFloat(formik.values.subsidyPercent) || 0;
        const newRate = parseFloat(formik.values.ratePerKw) || 1000;
        formik.setFieldValue("subsidyAmount", calcSubsidyAmount(newCap, newPct, newRate, "percentage"));
      }
    } else if (field === "paymentStatus") {
      formik.setFieldValue(field, val);
      // Payment Status = Released -> auto-fill Released Amount with the calculated subsidy amount
      if (val === "Released" && !formik.values.releasedAmount) {
        formik.setFieldValue("releasedAmount", formik.values.subsidyAmount);
      }
    } else {
      formik.setFieldValue(field, val);
    }
    if (field === "customerType" || field === "projectType") setEligibilityResult(null);
  };

  /* ────────── Document Management handlers ────────── */
  // Find the entry for a document type in the documents array.
  const docEntry = (key) =>
    (Array.isArray(formik.values.documents) ? formik.values.documents : []).find((d) => d.documentType === key);

  // Insert or patch an entry (by documentType) in the documents array.
  const upsertDoc = (key, patch) => {
    const arr = Array.isArray(formik.values.documents) ? [...formik.values.documents] : [];
    const idx = arr.findIndex((d) => d.documentType === key);
    if (idx === -1) {
      arr.push({
        documentType: key,
        documentNumber: "",
        issueDate: "",
        uploadedDate: new Date(),
        uploadedBy: "",
        verificationStatus: "Pending",
        verifierRemarks: "",
        fileName: "",
        storedName: "",
        fileSize: 0,
        fileType: "other",
        fileUrl: "",
        fileRef: "",
        mimeType: "",
        originalName: "",
        hasFile: false,
        ...patch,
      });
    } else {
      arr[idx] = { ...arr[idx], ...patch };
    }
    formik.setFieldValue("documents", arr);
  };

  // Upload a file for a document type (also used for "Replace").
  const handleDocUpload = async (key, file) => {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      showToast("Only PDF, JPG or PNG files are allowed");
      return;
    }
    setUploadState((s) => ({ ...s, [key]: { progress: 0, uploading: true } }));
    // Remember the previous staged file so it can be cleaned up after a successful replace.
    const previousEntry = docEntry(key);
    const previousFileRef = previousEntry?.fileRef || "";
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await subsidyAPI.upload(fd, (pct) =>
        setUploadState((s) => ({ ...s, [key]: { progress: pct, uploading: true } }))
      );
      if (res.data.success) {
        const info = res.data.data;
        upsertDoc(key, {
          uploadedDate: info.uploadedDate,
          uploadedBy: info.uploadedBy,
          fileName: info.originalName,
          originalName: info.originalName,
          mimeType: info.mimeType,
          fileSize: info.fileSize,
          fileType: info.fileType,
          fileRef: info.fileRef,
          hasFile: true,
          verificationStatus: "Pending",
        });
        // Replace: remove the old staged file from the server (best-effort, non-blocking).
        if (previousFileRef && previousFileRef !== info.fileRef) {
          subsidyAPI.deleteFile(previousFileRef).catch(() => {});
        }
        const label = REQUIRED_DOCUMENTS.find((d) => d.key === key)?.label || "Document";
        showToast(`${label} uploaded successfully`);
      }
    } catch (err) {
      console.error("Upload doc error:", err);
      showToast(err.response?.data?.message || "Upload failed");
    } finally {
      setUploadState((s) => ({ ...s, [key]: { progress: 0, uploading: false } }));
    }
  };

  // Update metadata (documentNumber / issueDate / verifierRemarks) for a document.
  const handleDocMetaChange = (key, field, value) => {
    upsertDoc(key, { [field]: value });
  };

  // Set verification status (Pending / Verified / Rejected).
  const handleDocVerify = (key, status) => {
    upsertDoc(key, { verificationStatus: status });
    setEligibilityResult(null);
  };

  // Remove a document entry (and delete its staged file from the server).
  const handleDocRemove = (key) => {
    const entry = docEntry(key);
    const fileRef = entry?.fileRef || "";
    formik.setFieldValue(
      "documents",
      (Array.isArray(formik.values.documents) ? formik.values.documents : []).filter((d) => d.documentType !== key)
    );
    // Only staged (not-yet-saved) files are deleted here — saved documents are
    // removed from the record on the next update.
    if (fileRef) {
      subsidyAPI.deleteFile(fileRef).catch(() => {});
    }
    setEligibilityResult(null);
  };

  /* ────────── Delete Handler ────────── */
  const confirmDelete = (app) => {
    setDeleteTarget(app);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const response = await subsidyAPI.delete(deleteTarget._id);
      if (response.data.success) {
        showToast(`Application ${deleteTarget.applicationNumber} deleted`);
        fetchSubsidies();
      }
    } catch (err) {
      console.error("Delete subsidy error:", err);
      showToast(err.response?.data?.message || "Failed to delete application");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };



  /* ────────── Form Page ────────── */
  const renderFormPage = () => (
    <div className="sg-form-page">
      <div className="sg-form-page-header">
        <button className="sg-btn sg-back-btn" onClick={() => { setShowFormPage(false); setEditingApp(null); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Applications
        </button>
        <h2>{editingApp ? `Edit Application ${editingApp.applicationNumber}` : "Create Application"}</h2>
      </div>

      <form onSubmit={formik.handleSubmit} className="sg-form-page-body" noValidate>
        {/* Section 1: Application Details */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">1</span>
            <h4>Application Details</h4>
          </div>
          <div className="sg-form-grid">
            <div className="sg-form-field">
              <label>Select Project <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.projectName}
                onChange={handleProjectSelect}
                options={projectOptions}
                variant="form"
                placeholder={customersLoading ? "Loading projects..." : "Select Eligible Project"}
                emptyMessage={customersLoading ? "Loading..." : "No fully-paid projects yet"}
              />
              <span className="sg-field-hint">Only projects whose full payment has been collected (billing) are shown here.</span>
              {formik.touched.projectName && formik.errors.projectName && <span className="sg-field-error">{formik.errors.projectName}</span>}
            </div>
            <div className="sg-form-field">
              <label>Application Number</label>
              <input type="text" value={editingApp?.applicationNumber || generatedAppNumber} readOnly className="sg-field-readonly" />
            </div>
            <div className="sg-form-field">
              <label>Application Date <span className="sg-required">*</span></label>
              <input type="date" value={formik.values.applicationDate} onChange={handleFieldChange("applicationDate")} onBlur={formik.handleBlur} min={todayISO()} />
              {formik.touched.applicationDate && formik.errors.applicationDate && <span className="sg-field-error">{formik.errors.applicationDate}</span>}
            </div>
            <div className="sg-form-field">
              <label>Customer Name <span className="sg-required">*</span></label>
              <input type="text" value={formik.values.customerName} readOnly className="sg-field-readonly" placeholder="Auto-filled from selected project" />
            </div>
            <div className="sg-form-field">
              <label>Customer ID</label>
              <input type="text" value={formik.values.customerId} readOnly className="sg-field-readonly" placeholder="Auto-filled from selected project" />
            </div>
            <div className="sg-form-field sg-full-width">
              <label>Project Name</label>
              <input type="text" value={formik.values.projectName} readOnly className="sg-field-readonly" placeholder="Auto-filled from billing / project" />
            </div>
            <div className="sg-form-field">
              <label>Scheme Name <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.schemeName}
                onChange={handleDropdownChange("schemeName")}
                options={SCHEMES.map((s) => ({ value: s, label: s }))}
                variant="form"
                placeholder="Select scheme"
              />
              {formik.touched.schemeName && formik.errors.schemeName && <span className="sg-field-error">{formik.errors.schemeName}</span>}
            </div>
            <div className="sg-form-field">
              <label>Status <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.status}
                onChange={handleDropdownChange("status")}
                options={SUBSIDY_STATUSES.map((s) => ({ value: s, label: s }))}
                variant="form"
                placeholder="Select status"
              />
              {formik.touched.status && formik.errors.status && <span className="sg-field-error">{formik.errors.status}</span>}
            </div>
            <div className="sg-form-field sg-full-width">
              <label>Notes</label>
              <textarea value={formik.values.notes} onChange={handleFieldChange("notes")} onBlur={formik.handleBlur} placeholder="Enter notes..." rows={2} />
            </div>
          </div>
        </div>

        {/* Section 2: Eligibility Check */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">2</span>
            <h4>Eligibility Check</h4>
          </div>
          <div className="sg-form-grid">
            <div className="sg-form-field">
              <label>Customer Type <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.customerType}
                onChange={handleDropdownChange("customerType")}
                options={CUSTOMER_TYPES.map((t) => ({ value: t, label: t }))}
                variant="form"
                placeholder="Select customer type"
              />
              {formik.touched.customerType && formik.errors.customerType && <span className="sg-field-error">{formik.errors.customerType}</span>}
            </div>
            <div className="sg-form-field">
              <label>Project Type <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.projectType}
                onChange={handleDropdownChange("projectType")}
                options={PROJECT_TYPES.map((t) => ({ value: t, label: t }))}
                variant="form"
                placeholder="Select project type"
              />
              {formik.touched.projectType && formik.errors.projectType && <span className="sg-field-error">{formik.errors.projectType}</span>}
            </div>
            <div className="sg-form-field sg-full-width">
              <label>Eligibility Result</label>
              <div className="sg-eligibility-area">
                {!eligibilityResult ? (
                  <div className="sg-eligibility-idle">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" strokeWidth="2" /><circle cx="12" cy="8" r="1" fill="#9ca3af" stroke="none" /></svg>
                    <span>Fill in customer & project type, capacity, and documents above, then click <strong>Check Eligibility</strong></span>
                  </div>
                ) : (
                  <div className="sg-eligibility-result">
                    <div className="sg-eligibility-score-wrap">
                      <div className={`sg-eligibility-circle ${eligibilityResult.overall >= 80 ? "sg-ec-high" : eligibilityResult.overall >= 60 ? "sg-ec-good" : eligibilityResult.overall >= 40 ? "sg-ec-mid" : "sg-ec-low"}`}>
                        <span className="sg-ec-value">{eligibilityResult.overall}</span>
                        <span className="sg-ec-unit">%</span>
                      </div>
                      <div className="sg-eligibility-verdict">
                        <span className={`sg-ev-badge ${eligibilityResult.overall >= 60 ? "sg-ev-pass" : "sg-ev-fail"}`}>
                          {eligibilityResult.verdict}
                        </span>
                      </div>
                    </div>
                    <div className="sg-eligibility-breakdown">
                      {eligibilityResult.breakdown.map((item, i) => (
                        <div key={i} className="sg-eb-item">
                          <div className="sg-eb-header">
                            <span className="sg-eb-label">{item.label}</span>
                            <span className="sg-eb-detail">{item.detail}</span>
                            <span className="sg-eb-weight">{item.weight}</span>
                            <span className="sg-eb-score">{item.score}%</span>
                          </div>
                          <div className="sg-eb-bar-track">
                            <div className="sg-eb-bar-fill" style={{ width: `${item.score}%`, background: item.score >= 80 ? "#16a34a" : item.score >= 60 ? "#ca8a04" : "#dc2626" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button type="button" className="sg-btn sg-btn-eligibility" onClick={handleCheckEligibility}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  Check Eligibility
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Subsidy Amount Calculation */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">3</span>
            <h4>Subsidy Amount Calculation</h4>
          </div>
          <div className="sg-form-grid">
            <div className="sg-form-field">
              <label>Calculation Method <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.calculationMethod}
                onChange={handleDropdownChange("calculationMethod")}
                options={[
                  { value: "percentage", label: "Subsidy Percentage (%)" },
                  { value: "slab", label: "PM Surya Ghar Slab (₹/kW)" },
                ]}
                variant="form"
                placeholder="Select calculation method"
              />
              {formik.values.calculationMethod === "slab" && (
                <span className="sg-field-hint">Auto-selected for PM Surya Ghar Yojana — amount is calculated from capacity slabs (₹30,000/kW for first 2 kW, ₹18,000/kW for next 3 kW, max ₹78,000).</span>
              )}
            </div>
            <div className="sg-form-field">
              <label>Eligible Capacity (kW) <span className="sg-required">*</span></label>
              <input type="number" value={formik.values.eligibleCapacity} onChange={(e) => { const v = e.target.value; if (v === "") { handleFieldChange("eligibleCapacity")(e); return; } const n = Number(v); if (isNaN(n) || n < 0) return; if (n > 1000) { formik.setFieldValue("eligibleCapacity", "1000"); return; } handleFieldChange("eligibleCapacity")(e); }} onBlur={formik.handleBlur} placeholder="e.g. 5" min="0" step="0.1" />
              <span className="sg-field-hint">Auto-filled from the customer's Project Approval — you can edit it.</span>
              {formik.values.calculationMethod === "slab" && (parseFloat(formik.values.eligibleCapacity) || 0) > 10 && (
                <span className="sg-field-warning">PM Surya Ghar Yojana applies to residential systems up to 10 kW — subsidy remains capped at ₹78,000.</span>
              )}
              {formik.touched.eligibleCapacity && formik.errors.eligibleCapacity && <span className="sg-field-error">{formik.errors.eligibleCapacity}</span>}
            </div>
            {formik.values.calculationMethod === "percentage" ? (
              <>
                <div className="sg-form-field">
                  <label>Subsidy Percentage (%) <span className="sg-required">*</span></label>
                  <input type="number" value={formik.values.subsidyPercent} onChange={handleFieldChange("subsidyPercent")} onBlur={formik.handleBlur} placeholder="e.g. 40" min="0" max="100" />
                  {formik.touched.subsidyPercent && formik.errors.subsidyPercent && <span className="sg-field-error">{formik.errors.subsidyPercent}</span>}
                </div>
                <div className="sg-form-field">
                  <label>Rate Used (₹/kW) <span className="sg-required">*</span></label>
                  <input type="number" value={formik.values.ratePerKw} onChange={(e) => { const v = e.target.value; if (v === "") { handleFieldChange("ratePerKw")(e); return; } const n = Number(v); if (isNaN(n) || n < 0) return; if (n > 1000000) { formik.setFieldValue("ratePerKw", "1000000"); return; } handleFieldChange("ratePerKw")(e); }} onBlur={formik.handleBlur} placeholder="e.g. 1000" min="0" />
                  {formik.touched.ratePerKw && formik.errors.ratePerKw && <span className="sg-field-error">{formik.errors.ratePerKw}</span>}
                </div>
              </>
            ) : (
              <div className="sg-form-field">
                <label>Slab Breakdown</label>
                <div className="sg-calculated-field">
                  {slabInfo && !slabInfo.empty ? (
                    <span className="sg-calculated-value">
                      ₹{SLAB_RATE_1.toLocaleString("en-IN")}/kW × {slabInfo.first} kW{slabInfo.second > 0 ? ` + ₹${SLAB_RATE_2.toLocaleString("en-IN")}/kW × ${slabInfo.second} kW` : ""} = ₹{slabInfo.amount.toLocaleString("en-IN")}
                      {slabInfo.capped ? " (capped at ₹78,000)" : ""}
                    </span>
                  ) : (
                    <span className="sg-calculated-value">Enter capacity to see breakdown</span>
                  )}
                </div>
              </div>
            )}
            <div className="sg-form-field">
              <label>Calculated Subsidy Amount (₹)</label>
              <div className="sg-calculated-field">
                <span className="sg-calculated-value">
                  {formik.values.subsidyAmount ? formatCurrency(parseFloat(formik.values.subsidyAmount)) : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Document Management */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">4</span>
            <h4>Document Management</h4>
          </div>
          <p className="sg-section-hint">Upload each required document (PDF/JPG/PNG), fill in its number & issue date, then verify. Files are stored on the server and can be previewed or downloaded anytime.</p>
          <div className="sg-doc-card-grid">
            {REQUIRED_DOCUMENTS.map((doc) => {
              const docs = Array.isArray(formik.values.documents) ? formik.values.documents : [];
              const entry = docEntry(doc.key);
              const docIndex = docs.findIndex((d) => d.documentType === doc.key);
              return (
                <SubsidyDocCard
                  key={doc.key}
                  doc={doc}
                  entry={entry}
                  uploadState={uploadState[doc.key]}
                  subsidyId={editingApp?._id}
                  docIndex={docIndex === -1 ? undefined : docIndex}
                  onUpload={(f) => handleDocUpload(doc.key, f)}
                  onMetaChange={(field, v) => handleDocMetaChange(doc.key, field, v)}
                  onVerify={(s) => handleDocVerify(doc.key, s)}
                  onRemove={() => handleDocRemove(doc.key)}
                  canExport={canDo("subsidy", "export")}
                />
              );
            })}
          </div>
        </div>

        {/* Section 5: Approval Workflow */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">5</span>
            <h4>Approval Workflow</h4>
          </div>
          <div className="sg-form-grid">
            <div className="sg-form-field">
              <label>Approval Status <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.approvalStatus}
                onChange={handleDropdownChange("approvalStatus")}
                options={APPROVAL_STATUSES.map((s) => ({ value: s, label: s }))}
                variant="form"
                placeholder="Select approval status"
              />
              {formik.touched.approvalStatus && formik.errors.approvalStatus && <span className="sg-field-error">{formik.errors.approvalStatus}</span>}
            </div>
            <div className="sg-form-field">
              <label>Approver Name</label>
              <input type="text" value={formik.values.approverName} onChange={handleFieldChange("approverName")} onBlur={formik.handleBlur} placeholder="Enter approver name" />
            </div>
            <div className="sg-form-field">
              <label>Approval Date</label>
              <input type="date" value={formik.values.approvalDate} onChange={handleFieldChange("approvalDate")} onBlur={formik.handleBlur} min={todayISO()} />
            </div>
            <div className="sg-form-field">
              <label>Remarks</label>
              <textarea value={formik.values.approvalRemarks} onChange={handleFieldChange("approvalRemarks")} onBlur={formik.handleBlur} placeholder="Enter approval remarks..." rows={2} maxLength={500} />
            </div>
          </div>
        </div>

        {/* Section 6: Payment Tracking */}
        <div className="sg-form-section">
          <div className="sg-section-header">
            <span className="sg-section-number">6</span>
            <h4>Subsidy Payment Tracking</h4>
          </div>
          <div className="sg-form-grid">
            <div className="sg-form-field">
              <label>Payment Status <span className="sg-required">*</span></label>
              <Dropdown
                value={formik.values.paymentStatus}
                onChange={handleDropdownChange("paymentStatus")}
                options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
                variant="form"
                placeholder="Select payment status"
              />
              {formik.touched.paymentStatus && formik.errors.paymentStatus && <span className="sg-field-error">{formik.errors.paymentStatus}</span>}
            </div>
            <div className="sg-form-field">
              <label>Payment Date</label>
              <input type="date" value={formik.values.paymentDate} onChange={handleFieldChange("paymentDate")} onBlur={formik.handleBlur} min={todayISO()} />
            </div>
            <div className="sg-form-field">
              <label>Released Amount (₹)</label>
              <input type="number" value={formik.values.releasedAmount} onChange={(e) => { const v = e.target.value; if (v === "") { handleFieldChange("releasedAmount")(e); return; } const n = Number(v); if (isNaN(n) || n < 0) return; if (n > 10000000000) { formik.setFieldValue("releasedAmount", "10000000000"); return; } handleFieldChange("releasedAmount")(e); }} onBlur={formik.handleBlur} placeholder="e.g. 78000" min="0" />
              {formik.touched.releasedAmount && formik.errors.releasedAmount && <span className="sg-field-error">{formik.errors.releasedAmount}</span>}
            </div>
            <div className="sg-form-field">
              <label>Transaction Reference</label>
              <input type="text" value={formik.values.transactionRef} onChange={handleFieldChange("transactionRef")} onBlur={formik.handleBlur} placeholder="e.g. TX-SUB-001" maxLength={100} />
            </div>
          </div>
        </div>

        <div className="sg-form-page-footer">
          <button type="button" className="sg-btn sg-btn-cancel" onClick={() => { setShowFormPage(false); setEditingApp(null); }}>Cancel</button>
          <button type="submit" className="sg-btn sg-btn-primary">{editingApp ? "Update Application" : "Create Application"}</button>
        </div>
      </form>
    </div>
  );

  /* ────────── View Modal ────────── */
  const renderViewModal = () => {
    if (!viewApp) return null;
    const a = viewApp;
    const docsArr = Array.isArray(a.documents) ? a.documents : [];
    // Only documents with an actual uploaded file count as verified.
    const docCount = REQUIRED_DOCUMENTS.filter((d) => {
      const entry = docsArr.find((x) => x.documentType === d.key);
      return entry && entry.verificationStatus === "Verified" && (entry.fileUrl || entry.fileRef || entry.hasFile);
    }).length;

    return (
      <div className="sg-overlay">
        <div className="sg-modal sg-modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="sg-modal-header">
            <h3>Subsidy Application — {a.applicationNumber}</h3>
            <button className="sg-modal-close" onClick={() => setViewApp(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="sg-modal-body">
            <div className="sg-view-grid-2">
              <div className="sg-view-card sg-vc-primary">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> Application Info</h4>
                <div className="sg-view-card-grid">
                  <div><span className="sg-view-label">Number</span><span className="sg-view-value">{a.applicationNumber}</span></div>
                  <div><span className="sg-view-label">Date</span><span className="sg-view-value">{formatDate(a.applicationDate)}</span></div>
                  <div><span className="sg-view-label">Customer</span><span className="sg-view-value">{a.customerName}</span></div>
                  <div><span className="sg-view-label">Customer ID</span><span className="sg-view-value">{a.customerId}</span></div>
                  <div><span className="sg-view-label">Project</span><span className="sg-view-value">{a.projectName}</span></div>
                  <div><span className="sg-view-label">Scheme</span><span className="sg-view-value">{a.schemeName}</span></div>
                </div>
              </div>
              <div className="sg-view-card sg-vc-success">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg> Subsidy Details</h4>
                <div className="sg-view-card-grid">
                  <div><span className="sg-view-label">Capacity</span><span className="sg-view-value">{a.eligibleCapacity} kW</span></div>
                  <div><span className="sg-view-label">Subsidy %</span><span className="sg-view-value">{a.subsidyPercent}%</span></div>
                  <div><span className="sg-view-label">Subsidy Amount</span><span className="sg-view-value sg-value-green">{formatCurrency(a.subsidyAmount)}</span></div>
                  <div><span className="sg-view-label">Status</span><span className={`sg-badge ${getStatusClass(a.status)}`}>{a.status}</span></div>
                </div>
              </div>
            </div>

            <div className="sg-view-2col">
              <div className="sg-view-section">
                <h4>Document Verification ({docCount}/{REQUIRED_DOCUMENTS.length})</h4>
                <div className="sg-doc-grid sg-doc-view-grid">
                  {REQUIRED_DOCUMENTS.map((doc) => {
                    const entry = docsArr.find((x) => x.documentType === doc.key);
                    const st = entry?.verificationStatus || "Pending";
                    const stClass = st === "Verified" ? "sg-doc-verified" : st === "Rejected" ? "sg-doc-rejected" : "sg-doc-pending";
                    return (
                      <div key={doc.key} className={`sg-doc-item ${stClass}`}>
                        <span className="sg-doc-check">{st === "Verified" ? "✓" : st === "Rejected" ? "✗" : "○"}</span>
                        <span className="sg-doc-label">{doc.label}</span>
                        <span className="sg-doc-status">{st}</span>
                        {(entry?.fileUrl || entry?.fileRef || entry?.hasFile) && (
                          <StoredSubsidyDoc
                            entry={entry}
                            subsidyId={a._id}
                            docIndex={docsArr.findIndex((x) => x.documentType === doc.key)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="sg-view-section">
                <h4>Approval & Payment</h4>
                <div className="sg-view-card-grid">
                  <div><span className="sg-view-label">Approval</span><span>{a.approvalStatus}</span></div>
                  <div><span className="sg-view-label">Approver</span><span>{a.approverName || "—"}</span></div>
                  <div><span className="sg-view-label">Approved Date</span><span>{formatDate(a.approvalDate)}</span></div>
                  <div><span className="sg-view-label">Payment</span><span className={`sg-badge ${getPaymentStatusClass(a.paymentStatus)}`}>{a.paymentStatus}</span></div>
                  <div><span className="sg-view-label">Released</span><span>{a.releasedAmount ? formatCurrency(a.releasedAmount) : "—"}</span></div>
                  <div><span className="sg-view-label">TX Ref</span><span>{a.transactionRef || "—"}</span></div>
                </div>
              </div>
            </div>

            <div className="sg-view-section">
              <h4>Status Timeline</h4>
              <div className="sg-timeline">
                {SUBSIDY_STATUSES.map((step, i) => {
                  const idx = SUBSIDY_STATUSES.indexOf(step);
                  const currentIdx = SUBSIDY_STATUSES.indexOf(a.status);
                  const isDone = idx <= currentIdx;
                  return (
                    <div key={step} className={`sg-timeline-step ${isDone ? "sg-tl-done" : "sg-tl-pending"}`}>
                      <div className="sg-tl-dot">{isDone ? "✓" : i + 1}</div>
                      <div className="sg-tl-content">
                        <span className="sg-tl-label">{step}</span>
                        {step === "Submitted" && a.submissionDate && <span className="sg-tl-date">{formatDate(a.submissionDate)}</span>}
                        {step === "Approved" && a.approvalDate && <span className="sg-tl-date">{formatDate(a.approvalDate)}</span>}
                        {step === "Subsidy Released" && a.paymentDate && <span className="sg-tl-date">{formatDate(a.paymentDate)}</span>}
                      </div>
                      {i < SUBSIDY_STATUSES.length - 1 && <div className={`sg-tl-line ${isDone ? "sg-tl-done" : ""}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="sg-modal-footer">
            <button className="modal-footer-close-primary" onClick={() => setViewApp(null)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  /* ──────────────────────────────────────────────
     Render
     ────────────────────────────────────────────── */
  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="subsidy-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="sg-page">
      {showFormPage ? renderFormPage() : (
        <>
          {/* Page Header */}
          <div className="sg-header">
            <div>
              <h1 className="sg-title">Government Subsidy Management</h1>
              <p className="sg-subtitle">Manage subsidy applications, eligibility checks, document verification, approvals, and payment tracking.</p>
            </div>
            <div className="sg-header-actions">
              {canDo("subsidy", "create") && (
                <button className="sg-btn sg-btn-primary" onClick={() => openFormPage(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add New Application
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="subsidy-stats-grid">
            <StatCard
              title="Total Applications"
              value={stats.totalApps.toLocaleString()}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
              color="blue"
            />
            <StatCard
              title="Needs Review"
              value={stats.pendingReview.toLocaleString()}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
              color="orange"
            />
            <StatCard
              title="Subsidy Released"
              value={formatCurrency(stats.released)}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12" /><path d="M6 8h12" /><path d="M6 13l8.5 8" /><path d="M6 13h3a4 4 0 0 0 0-8" /></svg>}
              color="green"
            />
            <StatCard
              title="Subsidy Applied"
              value={formatCurrency(stats.totalSubsidy)}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
              color="purple"
            />
          </div>

          {/* Toolbar */}
          <div className="sg-toolbar">
            <div className="sg-toolbar-row">
              <div className="sg-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by Application Number, Customer Name, ID or Project" />
                {search && (
                  <button className="sg-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={schemeFilter} onChange={(val) => { setSchemeFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Scheme" }, ...SCHEMES.map((s) => ({ value: s, label: s }))]} />
              <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Subsidy" }, ...SUBSIDY_STATUSES.map((s) => ({ value: s, label: s }))]} />
              <Dropdown value={approvalFilter} onChange={(val) => { setApprovalFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Approval" }, ...APPROVAL_STATUSES.map((s) => ({ value: s, label: s }))]} />
              <Dropdown value={paymentFilter} onChange={(val) => { setPaymentFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Payment" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))]} />

            </div>
          </div>

          {/* Table */}
          <div className="sg-table-card">
            <div className="sg-table-wrapper">
              <table className="sg-table">
                <thead>
                  <tr>
                    <th>App Number</th>
                    <th>Customer Name</th>
                    <th>Project Name</th>
                    <th>Scheme Name</th>
                    <th>Subsidy Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fetchLoading ? (
                    <TableLoader colSpan={8} />
                  ) : applications.length === 0 ? (
                    <TableEmptyState colSpan={8} title="No subsidy applications found" subtitle="Try adjusting your search or filter criteria, or create a new application." />
                  ) : (
                    applications.map((a) => (
                      <tr key={a._id || a.id}>
                        <td className="sg-td-id">{a.applicationNumber}</td>
                        <td><div className="sg-td-name">{a.customerName}</div><div className="sg-td-sub">{a.customerId}</div></td>
                        <td><span className="sg-project-tag">{a.projectName}</span></td>
                        <td><span className="sg-scheme-badge">{a.schemeName.length > 20 ? a.schemeName.substring(0, 20) + "…" : a.schemeName}</span></td>
                        <td className="sg-td-amount">{formatCurrency(a.subsidyAmount)}</td>
                        <td><span className={`sg-badge ${getStatusClass(a.status)}`}>{a.status}</span></td>
                        <td><span className={`sg-badge-sm ${getPaymentStatusClass(a.paymentStatus)}`}>{a.paymentStatus}</span></td>
                        <td>
                          <div className="act-actions">
                            <button className="act-btn act-view" onClick={() => setViewApp(a)} title="View">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <ActivityLogButton
                              module="subsidy"
                              onClick={() => {
                                const sId = a._id || a.id;
                                navigate(`/admin/subsidy-activity/${sId}`, {
                                  state: { target: { recordId: sId, recordLabel: a.applicationNumber || a.customerName, module: "subsidy" } },
                                });
                              }}
                              title="View Subsidy Activity Log"
                            />
                            {canDo("subsidy", "edit") && (
                              <button className="act-btn act-edit" onClick={() => openFormPage(a)} title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                            )}
                            {canDo("subsidy", "delete") && (
                              <button className="act-btn act-delete" onClick={() => confirmDelete(a)} title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>                {applications.length > 0 && (
              <div className="sg-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  variant="table"
                  onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                  disabled={fetchLoading}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* View Modal */}
      {viewApp && renderViewModal()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Subsidy Application"
        message={`Are you sure you want to delete application ${deleteTarget?.applicationNumber} for ${deleteTarget?.customerName}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
