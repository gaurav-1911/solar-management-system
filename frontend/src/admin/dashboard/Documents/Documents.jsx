import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useFormik } from "formik";
import { Pagination, Dropdown, TableLoader, TableEmptyState } from "../../../components/common";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import { useLocalToast, ToastRenderer } from "../../../components/common/Toast";
import StatCard from "../StatCard/StatCard";
import { documentValidationSchema } from "../../../utils/AdminValidation";
import { documentAPI, documentCategoryAPI } from "../../../services/api";
import { sortCategories } from "../../../utils/helpers";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import "../../../styles/ActionButtons.css";
import "./documents.css";

/**
 * DocumentManagement
 * Static (mock-data) document repository for a solar management system.
 * Centralized storage, role-based access, bulk ops.
 *
 * Self-contained: swap the *_DATA constants and handler stubs marked
 * "// TODO: connect to API" to wire this up to a real backend.
 */

/* --------------------------------- data --------------------------------- */

// eslint-disable-next-line no-unused-vars
const COMPANY = {
  name: "Suryoday Solar Pvt. Ltd.",
  state: "Gujarat",
};

const FILE_ICONS = {
  pdf: "📄",
  image: "🖼️",
  spreadsheet: "📊",
  word: "📝",
  drawing: "📐",
  other: "📁",
};

const FILE_COLORS = {
  pdf: "#c1443c",
  image: "#2563eb",
  spreadsheet: "#16a34a",
  word: "#2563eb",
  drawing: "#9333ea",
  other: "#5c6f68",
};

const DEFAULT_CATEGORIES = [
  { id: "customer", label: "Customer Documents", description: "KYC, Agreements, IDs & Contracts", color: "#2563eb", icon: "👤" },
  { id: "project", label: "Project Documents", description: "Designs, Layouts & Installation Reports", color: "#9333ea", icon: "📋" },
  { id: "financial", label: "Financial Documents", description: "Invoices, Quotations & Payment Records", color: "#2f8f5b", icon: "💰" },
  { id: "technical", label: "Technical Documents", description: "Datasheets, Manuals & Specifications", color: "#0d9488", icon: "🔧" },
  { id: "warranty", label: "Warranty Documents", description: "Certificates, Claims & Service Records", color: "#ea580c", icon: "🛡️" },
  { id: "legal", label: "Legal Documents", description: "Compliance, Approvals & Government Forms", color: "#c1443c", icon: "⚖️" },
  { id: "vendor", label: "Vendor Documents", description: "Purchase Orders & Supplier Agreements", color: "#6366f1", icon: "🏭" },
  { id: "employee", label: "Employee Documents", description: "Certificates, IDs & Employment Records", color: "#0891b2", icon: "👥" },
];

const ACCESS_ROLES = [
  { id: "admin", label: "Admin Only", desc: "Super admin and company admin only" },
  { id: "finance", label: "Finance Team", desc: "Admin + Accountants" },
  { id: "team", label: "Team", desc: "All team members involved with the entity" },
  { id: "all", label: "All Users", desc: "Anyone including customers (read-only)" },
];

const STATUS_META = {
  approved: { label: "Approved", tone: "success" },
  pending: { label: "Pending Review", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
  draft: { label: "Draft", tone: "neutral" },
};

const SORT_OPTIONS = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "name-asc", label: "Name A-Z" },
  { key: "name-desc", label: "Name Z-A" },
  { key: "size", label: "Largest First" },
];

const TABS = [
  { key: "library", label: "Document Library" },
  { key: "categories", label: "Categories" },
  { key: "access", label: "Access & Permissions" },
];

/* ------------------------------- helpers ------------------------------- */

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function formatSize(bytes) {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(1) + " KB";
  return bytes + " B";
}

function getCategoryLabel(id, categories = DEFAULT_CATEGORIES) {
  return (categories || DEFAULT_CATEGORIES).find((c) => c.id === id)?.label ?? id;
}

function getFileExtension(filename) {
  return filename.split(".").pop()?.toLowerCase() ?? "other";
}

function getFileType(filename) {
  const ext = getFileExtension(filename);
  if (["pdf"].includes(ext)) return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (["xls", "xlsx", "csv", "numbers", "ods"].includes(ext)) return "spreadsheet";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "word";
  if (["dwg", "dxf", "skp", "stl", "3dm"].includes(ext)) return "drawing";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "other";
  return "other";
}

/* ── Fetch the stored file bytes as a blob (shared by preview + download) ── */
async function fetchStoredFileBlob(doc) {
  try {
    const res = await documentAPI.download(doc.id);
    return { ok: true, blob: res.data };
  } catch (err) {
    let message = "Download failed";
    try {
      const blob = err.response?.data;
      if (blob instanceof Blob && blob.type?.includes("application/json")) {
        const parsed = JSON.parse(await blob.text());
        if (parsed?.message) message = parsed.message;
      }
    } catch {
      /* keep default message */
    }
    return { ok: false, message };
  }
}

/* ── Download the actual file bytes stored in the database ── */
async function downloadStoredFile(doc) {
  const result = await fetchStoredFileBlob(doc);
  if (!result.ok) return result;
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.originalName || doc.name || "document";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { ok: true };
}

/* ── Inline preview of the file bytes stored in the database ── */
function StoredFilePreview({ doc, maxHeight = 420 }) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error | unsupported
  const [url, setUrl] = useState("");

  const ft = getFileType(doc?.name || "");
  const mimeType = doc?.mimeType || "";
  const previewKind =
    mimeType.startsWith("image/") || ft === "image"
      ? "image"
      : mimeType === "application/pdf" || ft === "pdf"
        ? "pdf"
        : null;

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    if (!doc?.hasFile || !previewKind) {
      setStatus("unsupported");
      return () => {};
    }
    setStatus("loading");
    setUrl("");
    fetchStoredFileBlob(doc).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        return;
      }
      objectUrl = URL.createObjectURL(result.blob);
      setUrl(objectUrl);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.hasFile, previewKind]);

  const fixedHeight = status === "ready" ? maxHeight : undefined;

  return (
    <div className="doc-file-preview" style={{ height: fixedHeight, maxHeight }}>
      {status === "loading" && (
        <div className="doc-file-preview__placeholder">
          <span className="doc-file-preview__spinner" />
          <span className="cell-sub">Loading preview…</span>
        </div>
      )}
      {status === "ready" && previewKind === "image" && (
        <img
          src={url}
          alt={doc?.name || "document"}
          className="doc-file-preview__img"
        />
      )}
      {status === "ready" && previewKind === "pdf" && (
        <iframe
          src={url}
          title={doc?.name || "document"}
          className="doc-file-preview__pdf"
        />
      )}
      {status === "unsupported" && (
        <div className="doc-file-preview__placeholder">
          <span className="doc-file-preview__icon">{FILE_ICONS[ft] || FILE_ICONS.other}</span>
          <span className="cell-title">{doc?.name}</span>
          <span className="cell-sub">
            {doc?.hasFile
              ? "Inline preview isn't available for this file type — use Download File."
              : "No file is stored for this document."}
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="doc-file-preview__placeholder">
          <span className="doc-file-preview__icon">⚠️</span>
          <span className="cell-sub">Failed to load the file preview.</span>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" };
  return <span className={`pill pill--${meta.tone}`}>{meta.label}</span>;
}

function AccessBadge({ level }) {
  const meta = ACCESS_ROLES.find((r) => r.id === level);
  if (!meta) return <span className="access-badge">{level}</span>;
  return <span className={`access-badge access-badge--${level}`}>{meta.label}</span>;
}

function FileTypeBadge({ type }) {
  return (
    <span
      className="file-type-badge"
      style={{ background: `${FILE_COLORS[type] || FILE_COLORS.other}18`, color: FILE_COLORS[type] || FILE_COLORS.other }}
    >
      <span className="file-type-icon">{FILE_ICONS[type] || FILE_ICONS.other}</span>
      {type === "image" ? "Image" : type === "spreadsheet" ? "Sheet" : type === "drawing" ? "Drawing" : type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

/* --------------------------------- icons --------------------------------- */

const icons = {
  userPlus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  eye: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  pencil: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  list: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  building: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  activity: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  fileUp: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  share: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
};

const SORT_MAP = {
  newest: { sortField: "createdAt", sortDir: -1 },
  oldest: { sortField: "createdAt", sortDir: 1 },
  "name-asc": { sortField: "name", sortDir: 1 },
  "name-desc": { sortField: "name", sortDir: -1 },
  size: { sortField: "size", sortDir: -1 },
};

export default function DocumentManagement() {
  const { canDo, user } = useAuth();
  const canCreate = canDo("documents", "create");
  const canEdit = canDo("documents", "edit");
  const canDelete = canDo("documents", "delete");
  const [activeTab, setActiveTab] = useState("library");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [viewDoc, setViewDoc] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [docPage, setDocPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null); // doc awaiting approval
  const [rejectTarget, setRejectTarget] = useState(null); // doc awaiting rejection reason
  const [documents, setDocuments] = useState([]); // current library page (server-side)
  const [allDocuments, setAllDocuments] = useState([]); // full list (stats, categories, access)
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [categoryModal, setCategoryModal] = useState(null); // { mode: "add" } | { mode: "edit", category }
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const { toast, success, error: toastError } = useLocalToast();

  /* ── Map backend doc to the shape the UI expects ── */
  const mapDoc = useCallback((doc) => ({
    ...doc,
    id: doc._id,
    uploadedAt: doc.uploadedAt || doc.createdAt,
    modifiedAt: doc.modifiedAt || doc.updatedAt,
  }), []);



  /* ── Server-side data fetching (filter/sort/paginate on the API) ── */
  const fetchSeq = useRef(0); // guards against stale responses overwriting newer ones
  const fetchLibrary = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError("");
    try {
      const sort = SORT_MAP[sortBy] || SORT_MAP.newest;
      const params = {
        page: docPage,
        limit: pageSize,
        sortField: sort.sortField,
        sortDir: sort.sortDir,
      };
      if (search.trim()) params.search = search.trim();
      if (categoryFilter !== "all") params.category = categoryFilter;
      if (fileTypeFilter !== "all") params.fileType = fileTypeFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const res = await documentAPI.getAll(params);
      if (seq !== fetchSeq.current) return; // a newer request superseded this one
      const { data, pagination: pg } = res.data;
      setDocuments((data || []).map(mapDoc));
      setPagination({ total: pg.total, pages: pg.pages });
      if (docPage > 1 && pg.pages < docPage) setDocPage(1); // out-of-range page → refetch
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      setError(err.response?.data?.message || "Failed to load documents");
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [docPage, pageSize, search, categoryFilter, fileTypeFilter, statusFilter, sortBy, mapDoc]);

  const fetchAllDocuments = useCallback(async () => {
    try {
      const res = await documentAPI.getAll({ limit: 1000 });
      setAllDocuments((res.data.data || []).map(mapDoc));
    } catch {
      // stats/categories stay empty if this fails; the library shows its own error
    }
  }, [mapDoc]);

  // Always call the latest fetchLibrary (avoids stale closures in effects)
  const fetchLibraryRef = useRef(fetchLibrary);
  useEffect(() => {
    fetchLibraryRef.current = fetchLibrary;
  }, [fetchLibrary]);

  useEffect(() => {
    fetchAllDocuments();
  }, [fetchAllDocuments]);

  /* ── Dynamic categories (admin-managed) ── */
  const fetchCategories = useCallback(async () => {
    try {
      const res = await documentCategoryAPI.getAll({ limit: 100, sortField: "createdAt", sortDir: 1 });
      const list = res.data.data || [];
      setCategories(
        list.map((c) => ({
          id: c.key,
          label: c.label,
          description: c.description || "",
          color: c.color || "",
          icon: c.icon || "",
          _id: c._id,
          isSystem: c.isSystem,
        }))
      );
    } catch {
      // keep DEFAULT_CATEGORIES when the API is unavailable
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const isAdmin = useMemo(() => {
    return user?.role === "super_admin" || user?.role === "company_admin";
  }, [user]);

  const isCustomer = useMemo(() => {
    return user?.role === "customer";
  }, [user]);

  async function handleSaveCategory(payload) {
    try {
      if (categoryModal?.mode === "edit") {
        // key is immutable — never send it on edit
        await documentCategoryAPI.update(categoryModal.category._id, {
          label: payload.label,
          description: payload.description,
          color: payload.color,
          icon: payload.icon,
        });
        success("Category updated successfully");
      } else {
        await documentCategoryAPI.create(payload);
        success("Category created successfully");
      }
      setCategoryModal(null);
      fetchCategories();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to save category");
    }
  }

  const [deleteLoading, setDeleteLoading] = useState(false);
  async function handleDeleteCategory() {
    if (!categoryDeleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    const target = categoryDeleteTarget;
    try {
      await documentCategoryAPI.delete(target._id);
      success(`Category "${target.label}" deleted`);
      fetchCategories();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete category");
    } finally {
      setDeleteLoading(false);
      setCategoryDeleteTarget(null);
    }
  }

  // Single debounced effect for document library fetching to avoid page blinking
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      fetchLibraryRef.current();
      return;
    }
    const timer = setTimeout(() => {
      fetchLibraryRef.current();
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [docPage, pageSize, categoryFilter, fileTypeFilter, statusFilter, sortBy, search]);

  /* ── KPI Stats (computed from the full list) ── */
  const totalDocs = allDocuments.length;
  const totalCategories = categories.length;
  const totalSizeBytes = allDocuments.reduce((sum, d) => sum + (d.size || 0), 0);
  const totalSizeFormatted = totalSizeBytes >= 1_000_000_000
    ? (totalSizeBytes / 1_000_000_000).toFixed(1) + " GB"
    : totalSizeBytes >= 1_000_000
      ? (totalSizeBytes / 1_000_000).toFixed(1) + " MB"
      : totalSizeBytes >= 1_000
        ? (totalSizeBytes / 1_000).toFixed(1) + " KB"
        : totalSizeBytes + " B";
  const pendingDocs = allDocuments.filter((d) => d.status === "pending" || d.status === "draft").length;
  const approvedDocs = allDocuments.filter((d) => d.status === "approved").length;

  /* ── SVG Icons for StatCards ── */
  const iconDocs = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
  const iconCategories = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
    </svg>
  );
  const iconSize = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
  const iconPending = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
  const iconApproved = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  async function handleDeleteDocument() {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    const target = deleteTarget;
    try {
      await documentAPI.delete(target.id);
      success(`Document ${target.id} deleted`);
      setAllDocuments((prev) => prev.filter((d) => d.id !== target.id && d._id !== target.id));
      await fetchLibrary();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete document");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }

  async function handleApprove() {
    const target = reviewTarget;
    setReviewTarget(null);
    if (!target) return;
    const actorName = user?.name || "";
    try {
      await documentAPI.updateStatus(target.id, "approved", "", actorName);
      success(`Document "${target.name}" approved`);
      // Update stats instantly; only the current library page (10 rows) refetches
      setAllDocuments((prev) =>
        prev.map((d) => (d.id === target.id || d._id === target.id ? { ...d, status: "approved" } : d))
      );
      await fetchLibrary();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to approve document");
    }
  }

  async function handleReject(reason) {
    const target = rejectTarget;
    setRejectTarget(null);
    if (!target) return;
    const actorName = user?.name || "";
    try {
      await documentAPI.updateStatus(target.id, "rejected", reason, actorName);
      success(`Document "${target.name}" rejected`);
      // Update stats instantly; only the current library page (10 rows) refetches
      setAllDocuments((prev) =>
        prev.map((d) => (d.id === target.id || d._id === target.id ? { ...d, status: "rejected" } : d))
      );
      await fetchLibrary();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to reject document");
    }
  }

  async function handleUploadSubmit(uploadedFile, category) {
    if (!uploadedFile) return;

    const ft = getFileType(uploadedFile.name);

    // Send the actual file (multipart/form-data) so its bytes are stored in the DB
    // Note: uploadedBy + uploadedByRole are auto-set by the backend from the JWT
    const payload = new FormData();
    payload.append("file", uploadedFile);
    payload.append("name", uploadedFile.name);
    payload.append("category", category);
    payload.append("entityType", category === "customer" ? "customer" : "other");
    payload.append("fileType", ft);
    payload.append("access", "team");
    payload.append("status", "pending");
    payload.append("tags", category);

    try {
      const res = await documentAPI.create(payload);
      setShowUpload(false);
      success(`Document uploaded successfully`);
      // Update stats instantly; only the current library page (10 rows) refetches
      const created = res.data?.data;
      if (created) setAllDocuments((prev) => [mapDoc(created), ...prev]);
      await fetchLibrary();
    } catch (err) {
      toastError(err.response?.data?.message || "Upload failed");
    }
  }

  /* ── Download the actual file stored in the database ── */
  async function handleDownload(doc) {
    const result = await downloadStoredFile(doc);
    if (!result.ok) toastError(result.message);
  }

  return (
    <div className="doc-module">
      <header className="doc-header">
        <div>
          <h2>Document Management</h2>
          <p className="doc-subtitle">
            Store, organize, and manage all business documents securely in one
            centralized location with role-based access.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="doc-add-btn"
            onClick={() => setShowUpload(true)}
          >
            {icons.fileUp}
            Upload Documents
          </button>
        )}
      </header>

      {/* ── KPI Stats Grid (Dashboard-style with top border) ── */}
      <div className="doc-stats-grid">
        <StatCard
          title="Total Documents"
          value={totalDocs.toLocaleString()}
          change={0}
          icon={iconDocs}
          color="blue"
        />
        <StatCard
          title="Categories"
          value={totalCategories.toLocaleString()}
          change={0}
          icon={iconCategories}
          color="purple"
        />
        <StatCard
          title="Pending Review"
          value={pendingDocs.toLocaleString()}
          change={0}
          icon={iconPending}
          color="orange"
        />
        <StatCard
          title="Approved"
          value={approvedDocs.toLocaleString()}
          change={0}
          icon={iconApproved}
          color="green"
        />
      </div>

      <nav className="doc-tabs" role="tablist" aria-label="Document sections">
        {TABS.filter((tab) => !isCustomer || tab.key === "library").map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`doc-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="doc-tab-icon">
              {icons[tab.key === 'library' ? 'list' : tab.key === 'categories' ? 'building' : 'settings']}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="doc-content">
        {error && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
            ⚠️ {error}
          </div>
        )}
        {activeTab === "library" && (
          <LibraryPanel
            search={search}
            setSearch={setSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            fileTypeFilter={fileTypeFilter}
            setFileTypeFilter={setFileTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            documents={documents}
            totalItems={pagination.total}
            currentPage={docPage}
            totalPages={Math.max(1, pagination.pages)}
            pageSize={pageSize}
            onPageChange={setDocPage}
            onPageSizeChange={(val) => { setPageSize(Number(val)); setDocPage(1); }}
            onView={setViewDoc}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
            onApprove={(doc) => setReviewTarget(doc)}
            onReject={(doc) => setRejectTarget(doc)}
            onDownload={handleDownload}
            canApprove={canEdit && !isCustomer}
            canEdit={canEdit && !isCustomer}
            canDelete={canDelete && !isCustomer}
            canExport={canDo("documents", "export")}
            showToast={success}
            loading={loading}
            error={error}
            categories={categories}
          />
        )}
        {activeTab === "categories" && (
          <CategoriesPanel
            documents={allDocuments}
            categories={categories}
            isAdmin={isAdmin}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onAdd={() => setCategoryModal({ mode: "add" })}
            onEdit={(cat) => setCategoryModal({ mode: "edit", category: cat })}
            onDelete={setCategoryDeleteTarget}
          />
        )}
        {activeTab === "access" && <AccessPanel documents={allDocuments} categories={categories} showToast={success} showError={toastError} onSaved={fetchAllDocuments} />}
      </main>

      {viewDoc && (
        <DocumentDetailModal
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          categories={categories}
        />
      )}

      {editTarget && (
        <EditDocumentModal
          doc={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={async (updatedDoc) => {
            try {
              const payload = {
                name: updatedDoc.name,
                access: updatedDoc.access,
                tags: updatedDoc.tags,
                fileType: updatedDoc.fileType,
                size: updatedDoc.size,
              };
              if (updatedDoc.file) payload.file = updatedDoc.file;
              const res = await documentAPI.update(updatedDoc.id, payload);
              setEditTarget(null);
              success(`Document ${updatedDoc.id} updated`);
              // Update stats instantly from the server response (real stored
              // size included); only the current library page (10 rows) refetches
              const updatedServer = res.data?.data;
              if (updatedServer) {
                const mapped = mapDoc(updatedServer);
                setAllDocuments((prev) =>
                  prev.map((d) =>
                    d.id === mapped.id || d._id === mapped.id ? { ...d, ...mapped } : d
                  )
                );
              }
              await fetchLibrary();
            } catch (err) {
              toastError(err.response?.data?.message || "Failed to update document");
            }
          }}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleUploadSubmit}
          categories={categories}
          isCustomer={isCustomer}
        />
      )}

      {categoryModal && (
        <CategoryModal
          category={categoryModal.mode === "edit" ? categoryModal.category : null}
          categories={categories}
          onClose={() => setCategoryModal(null)}
          onSave={handleSaveCategory}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Document"
        message={`Are you sure you want to delete ${deleteTarget?.name}?`}
        confirmLabel="Delete Document"
        variant="danger"
        onConfirm={handleDeleteDocument}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />

      <ConfirmDialog
        isOpen={!!categoryDeleteTarget}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${categoryDeleteTarget?.label}"? Categories that are still in use cannot be deleted.`}
        confirmLabel="Delete Category"
        variant="danger"
        onConfirm={handleDeleteCategory}
        onCancel={() => setCategoryDeleteTarget(null)}
        loading={deleteLoading}
      />

      {reviewTarget && (
        <ApproveDocumentModal
          doc={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onConfirm={handleApprove}
        />
      )}

      {rejectTarget && (
        <RejectDocumentModal
          doc={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}
      <ToastRenderer toast={toast} />
    </div>
  );
}

/* ----------------------------- Document Library ----------------------------- */

function LibraryPanel({
  search, setSearch,
  categoryFilter, setCategoryFilter,
  fileTypeFilter, setFileTypeFilter,
  statusFilter, setStatusFilter,
  sortBy, setSortBy,
  documents, onView, onEdit, onDelete, onDownload,
  onApprove, onReject, canApprove,
  totalItems, currentPage, totalPages, pageSize, onPageChange, onPageSizeChange,
  showToast, loading, error, categories,
  canEdit = true, canDelete = true, canExport = true,
}) {
  const navigate = useNavigate();


  return (      <section aria-label="Document library">
      <div className="doc-filters">
        <div className="doc-search">
          <span className="doc-search-icon">{icons.search}</span>
          <input
            type="text"
            placeholder="Search by name, tags, or uploader"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="doc-search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="doc-filter-selects">
          <Dropdown value={categoryFilter} onChange={(val) => { setCategoryFilter(val); onPageChange(1); }} options={[{ value: "all", label: "All Categories" }, ...sortCategories(categories || DEFAULT_CATEGORIES, "label").map((c) => ({ value: c.id, label: c.label }))]} variant="filter" />
          <Dropdown value={fileTypeFilter} onChange={(val) => { setFileTypeFilter(val); onPageChange(1); }} options={[{ value: "all", label: "All Types" }, { value: "pdf", label: "PDF" }, { value: "image", label: "Images" }, { value: "spreadsheet", label: "Spreadsheets" }, { value: "word", label: "Word Docs" }, { value: "drawing", label: "Drawings" }, { value: "other", label: "Other" }]} variant="filter" />
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); onPageChange(1); }} options={[{ value: "all", label: "All Status" }, { value: "pending", label: "Pending Review" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "draft", label: "Draft" }]} variant="filter" />
          <Dropdown value={sortBy} onChange={(val) => { setSortBy(val); onPageChange(1); }} options={SORT_OPTIONS.map((opt) => ({ value: opt.key, label: opt.label }))} variant="filter" />
        </div>
      </div>

      <div className="doc-card">
        <div className="doc-table-wrapper">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-col-name">Document Name</th>
                <th className="doc-col-category">Category</th>
                <th className="doc-col-uploader">Uploaded By</th>
                <th className="doc-col-size">Size</th>
                <th className="doc-col-date">Uploaded Date</th>
                <th className="doc-col-status">Status</th>
                <th className="doc-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={7} />
              ) : documents.length === 0 ? (
                <TableEmptyState colSpan={7} title="No documents found" subtitle="Try adjusting your search or filters." />
              ) : (
                documents.map((doc) => {
                  const ft = getFileType(doc.name);
                  const color = FILE_COLORS[ft] || FILE_COLORS.other;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="doc-name-cell">
                          <span className="doc-file-icon" style={{ color }}>
                            {FILE_ICONS[ft] || FILE_ICONS.other}
                          </span>
                          <span className="cell-title doc-name-text">{doc.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="category-label">{getCategoryLabel(doc.category, categories || DEFAULT_CATEGORIES)}</span>
                      </td>
                      <td>
                        <div className="doc-uploader-cell">
                          <span className="cell-title">{doc.uploadedBy || "—"}</span>
                          {doc.uploadedByRole && (
                            <span className={`role-badge role-badge--${doc.uploadedByRole}`}>
                              {doc.uploadedByRole.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="nowrap-col">
                        <span className="cell-sub">{formatSize(doc.size)}</span>
                      </td>
                      <td className="nowrap-col">{formatDateTime(doc.uploadedAt)}</td>
                      <td>
                        <StatusPill status={doc.status} />
                      </td>
                      <td className="doc-col-actions">
                        <div className="act-actions">
                          {canApprove && doc.status === "pending" && (
                            <>
                              <button type="button" className="act-btn act-approve" onClick={() => onApprove(doc)} title="Approve"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></button>
                              <button type="button" className="act-btn act-reject" onClick={() => onReject(doc)} title="Reject"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                            </>
                          )}
                          <ActivityLogButton
                            module="documents"
                            onClick={() => {
                              const docId = doc._id || doc.id;
                              navigate(`/admin/document-activity/${docId}`, {
                                state: { target: { recordId: docId, recordLabel: doc.name || docId, module: "documents" } },
                              });
                            }}
                            title="View Document Activity Log"
                          />
                          <button type="button" className="act-btn act-view" onClick={() => onView(doc)} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                          {canEdit && (
                            <button type="button" className="act-btn act-edit" onClick={() => onEdit(doc)} title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                          )}
                          {canDelete && (
                            <button type="button" className="act-btn act-delete" onClick={() => onDelete(doc)} title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
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
        <div className="doc-pagination-row">
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Categories ------------------------------- */

const CATEGORY_COLORS = {
  customer: '#2563eb',
  project: '#9333ea',
  financial: '#2f8f5b',
  technical: '#0d9488',
  warranty: '#ea580c',
  legal: '#c1443c',
  vendor: '#6366f1',
  employee: '#0891b2',
};

const CATEGORY_ICONS = {
  customer: '👤',
  project: '📋',
  financial: '💰',
  technical: '🔧',
  warranty: '🛡️',
  legal: '⚖️',
  vendor: '🏭',
  employee: '👥',
};

function getFileTypeDistribution(docs) {
  const dist = {};
  docs.forEach((d) => {
    const ft = getFileType(d.name);
    dist[ft] = (dist[ft] || 0) + 1;
  });
  return dist;
}

function CategoryMiniPill({ type, count }) {
  const color = FILE_COLORS[type] || FILE_COLORS.other;
  return (
    <span className="cat-mini-pill" style={{ background: `${color}14`, color }}>
      {FILE_ICONS[type] || FILE_ICONS.other} {count}
    </span>
  );
}

function CategoriesPanel({ documents, categories, isAdmin, canCreate = true, canEdit = true, canDelete = true, onAdd, onEdit, onDelete }) {
  const docsByCategory = useMemo(() => {
    const map = {};
    (categories || DEFAULT_CATEGORIES).forEach((c) => {
      const docs = (documents || []).filter((d) => d.category === c.id);
      const lastActivity = docs.length > 0
        ? docs.reduce((latest, d) => new Date(d.uploadedAt) > new Date(latest.uploadedAt) ? d : latest).uploadedAt
        : null;
      const approved = docs.filter((d) => d.status === 'approved').length;
      const pending = docs.filter((d) => d.status === 'pending' || d.status === 'draft').length;
      const fileTypeDist = getFileTypeDistribution(docs);
      const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);
      map[c.id] = { ...c, docs, count: docs.length, lastActivity, approved, pending, fileTypeDist, totalSize };
    });
    return map;
  }, [documents, categories]);

  return (
    <section aria-label="Document categories">
      <div className="panel-heading">
        <h2>Document Categories</h2>
        <p>All documents organized by category for quick browsing and retrieval.</p>
      </div>

      {canCreate && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" className="doc-add-btn" onClick={onAdd}>
            {icons.userPlus}
            Add Category
          </button>
        </div>
      )}

      <div className="doc-card">
        <div className="doc-table-wrapper">
          <table className="cat-table">
            <thead>
              <tr>
                <th className="cat-col-name">Category</th>
                <th className="cat-col-desc">Description</th>
                <th className="cat-col-count">Documents</th>
                <th className="cat-col-size">Total Size</th>
                <th className="cat-col-types">File Types</th>
                <th className="cat-col-activity">Last Activity</th>
                <th className="cat-col-status">Status</th>
                {(canEdit || canDelete) && <th className="cat-col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {Object.values(docsByCategory).map((cat) => {
                const catColor = cat.color || CATEGORY_COLORS[cat.id] || '#5c6f68';
                return (
                  <tr key={cat.id}>
                    <td>
                      <div className="cat-name-cell">
                        <span className="cat-name-icon" style={{ background: `${catColor}14` }}>
                          {cat.icon || CATEGORY_ICONS[cat.id] || '📁'}
                        </span>
                        <div>
                          <div className="cell-title">{cat.label}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="cat-desc-text">{cat.description}</span>
                    </td>
                    <td>
                      <span className="cat-count-badge">{cat.count}</span>
                    </td>
                    <td className="nowrap-col">
                      <span className="cat-size-text">{formatSize(cat.totalSize)}</span>
                    </td>
                    <td>
                      <div className="cat-types-row">
                        {Object.entries(cat.fileTypeDist).map(([type, cnt]) => (
                          <CategoryMiniPill key={type} type={type} count={cnt} />
                        ))}
                        {Object.keys(cat.fileTypeDist).length === 0 && (
                          <span className="cell-sub">—</span>
                        )}
                      </div>
                    </td>
                    <td className="nowrap-col">
                      {cat.lastActivity ? (
                        <span className="cat-date-text">{formatDateTime(cat.lastActivity)}</span>
                      ) : (
                        <span className="cell-sub">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cat-status-row">
                        {cat.approved > 0 && (
                          <span className="pill pill--success" style={{ fontSize: 11 }}>{cat.approved} approved</span>
                        )}
                        {cat.pending > 0 && (
                          <span className="pill pill--warning" style={{ fontSize: 11 }}>{cat.pending} pending</span>
                        )}
                        {cat.count === 0 && (
                          <span className="cell-sub">No docs</span>
                        )}
                      </div>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="doc-col-actions">
                        <div className="act-actions">
                          {canEdit && (
                            <button type="button" className="act-btn act-edit" onClick={() => onEdit(cat)} title="Edit Category">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="act-btn act-delete" onClick={() => onDelete(cat)} title="Delete Category">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Access & Permissions --------------------------- */

function AccessPanel({ documents, categories, showToast, showError, onSaved }) {
  const [settings, setSettings] = useState(
    (categories || DEFAULT_CATEGORIES).map((c) => ({
      category: c.id,
      permission: c.id === "legal" || c.id === "employee" ? "admin" :
                  c.id === "financial" || c.id === "vendor" ? "finance" :
                  c.id === "warranty" ? "team" : "all",
    }))
  );
  const [saved, setSaved] = useState(false);

  function updatePermission(categoryId, value) {
    setSettings((prev) =>
      prev.map((s) => (s.category === categoryId ? { ...s, permission: value } : s))
    );
    setSaved(false);
  }

  async function savePermissions() {
    if (!documents || documents.length === 0) {
      setSaved(true);
      if (showToast) showToast("Permissions saved successfully");
      return;
    }
    const permMap = {};
    settings.forEach((s) => { permMap[s.category] = s.permission; });
    const changed = documents.filter((d) => (permMap[d.category] || d.access) !== d.access);
    try {
      await Promise.all(
        changed.map((d) => documentAPI.update(d.id, { access: permMap[d.category] || d.access }))
      );
      setSaved(true);
      if (showToast) showToast("Permissions saved successfully");
      if (onSaved) onSaved();
    } catch (err) {
      if (showError) showError(err.response?.data?.message || "Failed to save permissions");
    }
  }

  function resetPermissions() {
    setSettings(
      (categories || DEFAULT_CATEGORIES).map((c) => ({
        category: c.id,
        permission: c.id === "legal" || c.id === "employee" ? "admin" :
                    c.id === "financial" || c.id === "vendor" ? "finance" :
                    c.id === "warranty" ? "team" : "all",
      }))
    );
    setSaved(false);
  }

  const catLookup = {};
  (categories || DEFAULT_CATEGORIES).forEach((c) => { catLookup[c.id] = c; });

  return (
    <section aria-label="Access and permissions">
      <div className="panel-heading">
        <h2>Access &amp; Permissions</h2>
        <p>Control which roles can view documents in each category. Changes apply immediately.</p>
      </div>

      <div className="doc-card">
        <div className="doc-table-wrapper">
          <table className="acp-table">
            <thead>
              <tr>
                <th className="acp-col-category">Category</th>
                <th className="acp-col-desc">Description</th>
                <th className="acp-col-level">Access Level</th>
                <th className="acp-col-scope">Access Scope</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => {
                const cat = catLookup[setting.category];
                if (!cat) return null;
                const roleMeta = ACCESS_ROLES.find((r) => r.id === setting.permission);
                return (
                  <tr key={setting.category}>
                    <td className="cell-title">{cat.label}</td>
                    <td className="cell-sub">{cat.description}</td>
                    <td>
                      <Dropdown value={setting.permission} onChange={(val) => updatePermission(setting.category, val)} options={ACCESS_ROLES.map((role) => ({ value: role.id, label: role.label }))} variant="inline" size="sm" />
                    </td>
                    <td>
                      {roleMeta && <AccessBadge level={setting.permission} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="access-summary">
        <div className="panel-heading">
          <h2>Role Definitions</h2>
        </div>
        <div className="access-legend">
          {ACCESS_ROLES.map((role) => (
            <div key={role.id} className="access-legend__item">
              <AccessBadge level={role.id} />
              <span className="cell-sub">{role.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="access-actions" style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost btn--icon" onClick={resetPermissions}>
          {icons.close}
          Reset to Defaults
        </button>
        <button type="button" className="btn btn--primary btn--icon" onClick={savePermissions}>
          {icons.check}
          {saved ? 'Saved' : 'Save Permissions'}
        </button>
      </div>
    </section>
  );
}

/* -------------------------- Document Detail Modal -------------------------- */

function DocumentDetailModal({ doc, onClose, categories }) {
  const ft = getFileType(doc.name);

  return (
    <div className="vm-overlay">
      <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <div className="vm-modal-title">
            <h3>{doc.name}</h3>
            <StatusPill status={doc.status} />
            {doc.status === "approved" && doc.verifiedBy && (
              <span className="ver-audit ver-audit--approved">
                ✓ Verified by {doc.verifiedBy} · {formatDateTime(doc.verifiedAt)}
              </span>
            )}
            {doc.status === "rejected" && doc.rejectedBy && (
              <span className="ver-audit ver-audit--rejected">
                ✕ Rejected by {doc.rejectedBy}
                {doc.rejectionReason ? ` · ${doc.rejectionReason}` : ""}
              </span>
            )}
          </div>
          <button className="vm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="vm-view-body">
          {/* ── File Preview ── */}
          <div className="lm-view-section">
            <h4>File Preview</h4>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 72, height: 72, borderRadius: 12,
                  background: `${FILE_COLORS[ft] || FILE_COLORS.other}18`,
                  color: FILE_COLORS[ft] || FILE_COLORS.other,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 40, flexShrink: 0,
                }}
              >
                {FILE_ICONS[ft] || FILE_ICONS.other}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{doc.name}</div>
                <FileTypeBadge type={ft} />
                <span className="cell-sub" style={{ marginLeft: 8 }}>{formatSize(doc.size)}</span>
              </div>
            </div>
            {doc.hasFile && (
              <div style={{ marginTop: 14 }}>
                <StoredFilePreview doc={doc} maxHeight={420} />
              </div>
            )}
          </div>

          {/* ── Document Information ── */}
          <div className="lm-view-section">
            <h4>Document Information</h4>
            <div className="lm-view-grid">
              <div className="lm-view-item">
                <span className="lm-view-label">Document Name</span>
                <span className="lm-view-value">{doc.name}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Category</span>
                <span className="lm-view-value">{getCategoryLabel(doc.category, categories || DEFAULT_CATEGORIES)}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Uploaded By</span>
                <span className="lm-view-value">
                  {doc.uploadedBy || "—"}
                  {doc.uploadedByRole && (
                    <span className={`role-badge role-badge--${doc.uploadedByRole}`} style={{ marginLeft: 8 }}>
                      {doc.uploadedByRole.replace(/_/g, " ")}
                    </span>
                  )}
                </span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Uploaded At</span>
                <span className="lm-view-value">{formatDateTime(doc.uploadedAt)}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Last Modified</span>
                <span className="lm-view-value">{formatDateTime(doc.modifiedAt)}</span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Access Level</span>
                <span className="lm-view-value"><AccessBadge level={doc.access} /></span>
              </div>
              <div className="lm-view-item">
                <span className="lm-view-label">Tags</span>
                <span className="lm-view-value">
                  <div className="doc-detail__tags" style={{ marginTop: 2 }}>
                    {doc.tags.map((t) => (
                      <span key={t} className="doc-tag">{t}</span>
                    ))}
                  </div>
                </span>
              </div>
            </div>
          </div>

        </div>

        <div className="vm-modal-footer">
          <button type="button" className="vm-btn-close-primary" onClick={onClose}>
            {/* <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg> */}
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Upload Modal ----------------------------- */

/* ----------------------------- Upload Modal ----------------------------- */

function UploadModal({ onClose, onUpload, categories, isCustomer }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const formik = useFormik({
    initialValues: {
      category: isCustomer ? "customer" : "customer",
      name: "Document",
    },
    validationSchema: documentValidationSchema,
    onSubmit: async (values) => {
      if (isUploading) return;
      setIsUploading(true);
      try {
        await onUpload(file, values.category);
      } finally {
        setIsUploading(false);
      }
    },
  });

  function handleFileChange(e) {
    const selected = e.target.files[0];
    setFile(selected || null);
    if (selected) {
      formik.setFieldValue("name", selected.name);
    }
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal lm-modal--wide">
        <div className="lm-modal-header">
          <h3>
            {icons.fileUp}
            Upload Document
          </h3>
          <button className="lm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={(e) => { e.preventDefault(); formik.handleSubmit(e); }}>
          <div className="lm-form-grid">
            {!isCustomer && (
              <div className="lm-form-group">
                <label>Category</label>
                <Dropdown
                  value={formik.values.category}
                  onChange={(val) => formik.setFieldValue("category", val)}
                  options={sortCategories(categories || DEFAULT_CATEGORIES, "label").map((c) => ({ value: c.id, label: c.label }))}
                  variant="form"
                />
              </div>
            )}
            <div className="lm-form-group lm-form-full">
              <label>Select File <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="upload-dropzone">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.dwg,.dxf,.zip"
                  onChange={handleFileChange}
                  id="file-input"
                  style={{ display: "none" }}
                />
                {!file ? (
                  <label htmlFor="file-input" className="upload-placeholder">
                    <span className="upload-icon">📁</span>
                    <span>Drag & drop a file here or <strong>browse</strong></span>
                    <span className="cell-sub">Supports PDF, Word, Excel, Images, CAD drawings & archives</span>
                  </label>
                ) : (
                  <div className="upload-file-list">
                    <div className="upload-file-item">
                      <span className="upload-file-icon">{FILE_ICONS[getFileType(file.name)] || FILE_ICONS.other}</span>
                      <div className="upload-file-info">
                        <span className="cell-title">{file.name}</span>
                        <span className="cell-sub">{formatSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setFile(null)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={isUploading}>Cancel</button>
            <button type="submit" className="lm-save-btn" disabled={!file || isUploading}>
              {isUploading ? "Uploading…" : <>{icons.fileUp} Upload</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Category Modal ----------------------------- */

const CATEGORY_ICON_PRESETS = ["📁", "👤", "📋", "💰", "🔧", "🛡️", "⚖️", "🏭", "👥"];

function CategoryModal({ category, categories, onClose, onSave }) {
  const isEdit = !!category;
  const [form, setForm] = useState({
    key: category?.id || "",
    label: category?.label || "",
    description: category?.description || "",
    color: category?.color || "#2563eb",
    icon: category?.icon || "📁",
  });
  const [errors, setErrors] = useState({});

  function slugify(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function setField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (!isEdit && field === "label" && !prev.key) {
        next.key = slugify(value);
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.label.trim()) errs.label = "Label is required";
    const key = (form.key || slugify(form.label)).trim();
    if (!key) errs.key = "Key is required";
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) errs.key = "Key must be a slug (e.g. customer-documents)";
    else if (!isEdit && (categories || []).some((c) => c.id === key)) errs.key = "A category with this key already exists";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({
      key,
      label: form.label.trim(),
      description: form.description.trim(),
      color: form.color || "#2563eb",
      icon: form.icon || "📁",
    });
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>
            {icons[isEdit ? "pencil" : "userPlus"]}
            {isEdit ? "Edit Category" : "Add Category"}
          </h3>
          <button className="lm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group">
              <label>Key / ID <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="key"
                value={form.key}
                onChange={(e) => setField("key", slugify(e.target.value))}
                placeholder="e.g. customer-documents"
                readOnly={isEdit}
                className={errors.key ? "input-has-error" : ""}
              />
              {errors.key && <span className="form-field-error">{errors.key}</span>}
            </div>
            <div className="lm-form-group">
              <label>Label <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="label"
                value={form.label}
                onChange={(e) => setField("label", e.target.value)}
                placeholder="e.g. Customer Documents"
                className={errors.label ? "input-has-error" : ""}
              />
              {errors.label && <span className="form-field-error">{errors.label}</span>}
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Description</label>
              <input
                type="text"
                name="description"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="e.g. KYC, Agreements, IDs & Contracts"
              />
            </div>
            <div className="lm-form-group">
              <label>Icon</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="text"
                  name="icon"
                  value={form.icon}
                  onChange={(e) => setField("icon", e.target.value)}
                  style={{ width: 64, textAlign: "center" }}
                />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {CATEGORY_ICON_PRESETS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setField("icon", ic)}
                      style={{
                        border: form.icon === ic ? "2px solid #2563eb" : "1px solid #e5e7eb",
                        background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 15, padding: "2px 4px",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* <div className="lm-form-group">
              <label>Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  name="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : "#2563eb"}
                  onChange={(e) => setField("color", e.target.value)}
                  style={{ width: 48, height: 34, border: "none", background: "transparent", cursor: "pointer" }}
                />
                <input
                  type="text"
                  name="color"
                  value={form.color}
                  onChange={(e) => setField("color", e.target.value)}
                  placeholder="#2563eb"
                  style={{ width: 110 }}
                />
              </div>
            </div> */}
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="lm-save-btn">
              {icons.check} {isEdit ? "Save Changes" : "Create Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Edit Document Modal ----------------------------- */

function EditDocumentModal({ doc, onClose, onSave }) {
  const [uploadFile, setUploadFile] = useState(null);

  const formik = useFormik({
    initialValues: {
      name: doc.name || "",
      status: doc.status || "approved",
      access: doc.access || "all",
      tagInput: doc.tags ? doc.tags.join(", ") : "",
    },
    validationSchema: documentValidationSchema,
    onSubmit: (values) => {
      const tags = values.tagInput.split(",").map((t) => t.trim()).filter(Boolean);
      const ft = uploadFile ? getFileType(uploadFile.name) : doc.fileType;
      onSave({
        id: doc.id,
        name: uploadFile ? uploadFile.name : values.name,
        access: values.access,
        tags,
        fileType: ft,
        size: uploadFile ? uploadFile.size : doc.size,
        modifiedAt: new Date().toISOString(),
        file: uploadFile || undefined,
      });
    },
  });

  function handleFileChange(e) {
    const selected = e.target.files[0];
    setUploadFile(selected || null);
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>
            {icons.pencil}
            Edit Document
            {/* <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", marginLeft: 4 }}>{doc.id}</span> */}
          </h3>
          <button className="lm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={formik.handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group lm-form-full">
              <label>Document Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                name="name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Document name"
                className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
              />
              {formik.touched.name && formik.errors.name && (
                <span className="form-field-error">{formik.errors.name}</span>
              )}
            </div>
            <div className="lm-form-group">
              <label>Status</label>
              <div style={{ paddingTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StatusPill status={doc.status} />
                <span className="cell-sub" style={{ fontSize: 12 }}>
                  Change status with the Approve / Reject buttons in the library.
                </span>
              </div>
            </div>
            <div className="lm-form-group">
              <label>Access Level</label>
              <Dropdown
                value={formik.values.access}
                onChange={(val) => formik.setFieldValue("access", val)}
                options={ACCESS_ROLES.map((role) => ({
                  value: role.id,
                  label: role.label,
                }))}
                placeholder="Select access level"
                variant="form"
              />
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Tags (comma separated)</label>
              <input
                type="text"
                name="tagInput"
                value={formik.values.tagInput}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="e.g. kyc, contract, report"
              />
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Attach Document (optional)</label>
              <div className="upload-dropzone">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.dwg,.dxf,.zip"
                  onChange={handleFileChange}
                  id="edit-file-input"
                  style={{ display: "none" }}
                />
                {!uploadFile ? (
                  <label htmlFor="edit-file-input" className="upload-placeholder">
                    <span className="upload-icon">📁</span>
                    <span>Click to browse or drag & drop a new file</span>
                    <span className="cell-sub">Supports PDF, Word, Excel, Images, CAD & archives</span>
                  </label>
                ) : (
                  <div className="upload-file-list">
                    <div className="upload-file-item">
                      <span className="upload-file-icon">{FILE_ICONS[getFileType(uploadFile.name)] || FILE_ICONS.other}</span>
                      <div className="upload-file-info">
                        <span className="cell-title">{uploadFile.name}</span>
                        <span className="cell-sub">{formatSize(uploadFile.size)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setUploadFile(null)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="lm-save-btn">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Approve Document Modal ----------------------------- */

function ApproveDocumentModal({ doc, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>
            {icons.check}
            Approve Document
          </h3>
          <button className="lm-modal-close" onClick={onClose} disabled={submitting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <div className="lm-form-grid">
            <div className="lm-form-group lm-form-full">
              <label>Document</label>
              <div
                className="doc-name-cell"
                style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}
              >
                <span className="cell-title">{doc?.name}</span>
                <span className="cell-sub" style={{ display: "block", marginTop: 2 }}>
                  {getCategoryLabel(doc?.category, DEFAULT_CATEGORIES)} · {formatSize(doc?.size || 0)}
                </span>
              </div>
            </div>
            <div className="lm-form-group lm-form-full">
              <label>Document Preview</label>
              <StoredFilePreview doc={doc} maxHeight={360} />
            </div>
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="lm-save-btn" disabled={submitting}>
              {submitting ? "Approving…" : "Approve Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------- Reject Document Modal ----------------------------- */

function RejectDocumentModal({ doc, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lm-overlay">
      <div className="lm-modal">
        <div className="lm-modal-header">
          <h3>
            {icons.close}
            Reject Document
          </h3>
          <button className="lm-modal-close" onClick={onClose} disabled={submitting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <div className="lm-form-group lm-form-full">
            <label>Document</label>
            <div className="doc-name-cell" style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span className="cell-title">{doc?.name}</span>
              <span className="cell-sub" style={{ display: "block", marginTop: 2 }}>
                {getCategoryLabel(doc?.category, DEFAULT_CATEGORIES)}
              </span>
            </div>
          </div>
          <div className="lm-form-group lm-form-full">
            <label>
              Rejection Reason <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this document is being rejected..."
              rows={4}
              autoFocus
              style={{ width: "100%", resize: "vertical" }}
            />
            {!reason.trim() && (
              <span className="form-field-error">A reason is required to reject a document</span>
            )}
          </div>

          <div className="lm-modal-actions">
            <button type="button" className="lm-cancel-btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="lm-save-btn" disabled={!reason.trim() || submitting}>
              {submitting ? "Rejecting..." : "Reject Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
