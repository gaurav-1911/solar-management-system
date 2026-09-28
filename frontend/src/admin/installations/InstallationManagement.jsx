import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Pagination, Dropdown, ImageLightbox, PageLoader, TableLoader } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import "./InstallationManagement.css";
import "../inventory/InventoryManagement.css";
import { useFormik } from "formik";
import { installationSchema } from "../../utils/AdminValidation";
import { installationAPI, technicianAPI, siteSurveyAPI, projectApprovalAPI, productAPI, inventoryAPI, quotationAPI, testingAPI } from "../../services";
import { compressImageFile } from "../../utils/imageCompress";
import { jsPDF } from "jspdf";
import { titleCaseCategory, sortCategories } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";

const INSTALLATION_DRAFT_KEY = "solar.installationDraft.v1";

const normalizeInstall = (doc) => ({
  ...doc,
  id: doc.installationId || doc.id || doc._id,
});

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
      className="im-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, alt || "preview") : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

/* ── In-memory cache for stored photo previews ──
   Every modal open used to re-download every stored photo from MongoDB
   (each ~1-2s). Cache each file's blob URL per installation so repeated
   view/edit opens are instant. Cleared after create/update/delete so edits
   never show stale files. */
const installFileCache = new Map();

const getCachedInstallFile = (key) => installFileCache.get(key) || null;

const setCachedInstallFile = (key, url) => {
  if (installFileCache.has(key)) URL.revokeObjectURL(installFileCache.get(key));
  installFileCache.set(key, url);
  return url;
};

const clearInstallFileCache = (installId) => {
  if (!installId) return;
  const prefix = `${installId}:`;
  for (const key of [...installFileCache.keys()]) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(installFileCache.get(key));
      installFileCache.delete(key);
    }
  }
};

/* ── Fetch + preview a stored installation photo from the database ── */
function StoredInstallPhoto({ installId, photo, index, onZoom }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!installId || !photo || !photo.hasFile) {
      setSrc("");
      return undefined;
    }
    const cacheKey = `${installId}:photo:${index}`;
    const cached = getCachedInstallFile(cacheKey);
    if (cached) {
      setSrc(cached);
      return undefined;
    }
    installationAPI
      .downloadPhoto(installId, index)
      .then((res) => {
        if (cancelled) return;
        setSrc(setCachedInstallFile(cacheKey, URL.createObjectURL(res.data)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [installId, photo, index]);

  if (failed) {
    return (
      <div className="im-photo-preview-error" title="Failed to load photo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  if (!src) {
    return <div className="im-photo-preview-loading" />;
  }
  return (
    <img
      src={src}
      alt={(photo && photo.name) || "site photo"}
      className="im-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, (photo && photo.name) || "site photo") : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

// Resolve a product's supplier (vendor) name: from its populated inventory
// link (product.inventoryItemId), or via the separately-loaded inventory
// list (by inventoryItemId, or by an inventory item auto-created from this
// product via inventory.productRef). When no supplier is found on the
// inventory link, the product's brand is used as a fallback so a vendor is
// always available (products created before inventory linking store no
// supplier, and the backend seeds inventory supplier from product.brand).
const getProductSupplier = (p, inventoryList) => {
  if (!p) return "";
  // The products API populates inventoryItemId — read the supplier directly.
  if (p.inventoryItemId && typeof p.inventoryItemId === "object" && p.inventoryItemId.supplier) {
    return p.inventoryItemId.supplier;
  }
  if (Array.isArray(inventoryList)) {
    const byInvId = inventoryList.find(
      (i) => i._id && p.inventoryItemId && typeof p.inventoryItemId !== "object" && String(i._id) === String(p.inventoryItemId)
    );
    if (byInvId?.supplier) return byInvId.supplier;
    const byRef = inventoryList.find(
      (i) => i.productRef && String(i.productRef) === String(p._id)
    );
    if (byRef?.supplier) return byRef.supplier;
  }
  // Fallback: the backend seeds inventory supplier from product.brand, so
  // brand is the closest available vendor for products without a link.
  return p.brand || "";
};

// Materials are saved as product objects (from the Product Catalog). Older
// records kept a plain array of "Available"/"Not Available" strings indexed
// against MATERIAL_CHECKLIST_ITEMS — normalize both shapes to objects here.
// Brand / vendor / stock are snapshots from the Product Catalog, re-resolved
// from the live product list when an old record does not store them.
const normalizeMaterials = (materials, products, inventoryList) => {
  if (!Array.isArray(materials) || materials.length === 0) return [];
  const productMap = new Map((products || []).map((p) => [p.productId || p._id, p]));
  // Legacy string materials are indexed against MATERIAL_CHECKLIST_ITEMS;
  // match that generic name against the live Product Catalog (exact first,
  // then word-overlap) so brand / vendor / stock snapshots can be filled in
  // for old records.
  const productByName = (name) => {
    const generic = String(name || "").toLowerCase();
    const exact = (products || []).find((p) => p.name && String(p.name).toLowerCase() === generic);
    if (exact) return exact;
    // Fuzzy: score every product by how many generic words appear in its
    // name, and pick the best score — order-independent.
    const words = generic.split(/[^a-z0-9]+/).filter(Boolean);
    if (!words.length) return null;
    let best = null;
    let bestScore = 0;
    for (const p of products || []) {
      const pn = String(p.name || "").toLowerCase();
      const score = words.reduce((n, w) => n + (pn.includes(w) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return bestScore > 0 ? best : null;
  };
  return materials.map((m, idx) => {
    if (typeof m === "string") {
      const genericName = MATERIAL_CHECKLIST_ITEMS[idx] || `Material ${idx + 1}`;
      const p = productByName(genericName);
      return {
        productId: p ? p.productId || p._id || "" : "",
        productName: p ? p.name : genericName,
        category: p?.category || "",
        brand: p?.brand || "",
        vendorName: getProductSupplier(p, inventoryList) || "",
        price: typeof p?.price === "number" ? p.price : null,
        stock: typeof p?.stock === "number" ? p.stock : null,
        quantity: 0,
        status: m === "Available" ? "Available" : "Not Available",
      };
    }
    const p = productMap.get(m.productId) || (m.productId ? productMap.get(String(m.productId)) : null);
    return {
      productId: m.productId || "",
      productName: m.productName || p?.name || `Material ${idx + 1}`,
      category: m.category || p?.category || "",
      brand: m.brand || p?.brand || "",
      vendorName: m.vendorName || getProductSupplier(p, inventoryList) || "",
      price: m.price !== undefined && m.price !== null
        ? m.price
        : typeof p?.price === "number"
        ? p.price
        : null,
      stock: m.stock !== undefined && m.stock !== null
        ? m.stock
        : typeof p?.stock === "number"
        ? p.stock
        : null,
      quantity: typeof m.quantity === "number" && m.quantity > 0 ? m.quantity : 0,
      quotedQty: typeof m.quotedQty === "number" ? m.quotedQty : (typeof m.quantity === "number" && m.quantity > 0 ? m.quantity : 0),
      status: m.status === "Available" ? "Available" : "Not Available",
    };
  });
};
const formatInstallDate = (date) => {
  if (!date) return "";
  const yyyy = String(date).slice(0, 4);
  const mm = String(date).slice(5, 7);
  const dd = String(date).slice(8, 10);
  return `${dd}/${mm}/${yyyy}`;
};

const formatPrice = (v) => {
  if (v === undefined || v === null || isNaN(Number(v))) return "";
  return `₹${Number(v).toLocaleString("en-IN")}`;
};

// Dropdown option body for a Product Catalog product: name on the first line,
// price + available stock on the second, so the installer sees both before
// picking a product.
const renderProductOption = (opt) => (
  <span className="im-prod-opt">
    <span className="im-prod-opt-name">{opt.label}</span>
    <span className="im-prod-opt-meta">
      {opt.priceLabel && <span className="im-prod-opt-price">{opt.priceLabel} / unit</span>}
      {typeof opt.stock === "number" && (
        <span className={`im-prod-opt-stock ${opt.stock === 0 ? "out" : ""}`}>
          {opt.stock === 0 ? "Out of stock" : `Stock: ${opt.stock}`}
        </span>
      )}
    </span>
  </span>
);

const formatDateInput = (date) => {
  if (!date) return "";
  return String(date).slice(0, 10);
};

const INSTALL_STATUSES = ["Pending", "Scheduled", "In Progress", "Completed", "On Hold"];
const VERIFICATION_STATUSES = ["Verified", "Not Verified"];

const MATERIAL_CHECKLIST_ITEMS = [
  "Solar Panels",
  "Inverter",
  "Mounting Structure",
  "DC Cable",
  "AC Cable",
  "Earthing Kit",
  "Connectors",
];

const TASK_STATUSES = ["To Do", "In Progress", "Completed"];

const initialFormData = {
  customerName: "",
  leadId: "",
  projectName: "",
  installationDate: "",
  installationTime: "",
  installationAddress: "",
  installationStatus: "Pending",
  notes: "",
  technicianName: "",
  technicianId: "",
  checklist: [],
  tasks: [],
  materials: [],
  materialRequests: [],
  sitePhotos: [],
  verificationStatus: "Not Verified",
  verificationNotes: "",
};

const InstallationManagement = () => {
  const navigate = useNavigate();
  const [installations, setInstallations] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [verificationFilter, setVerificationFilter] = useState("All");
  const [technicianFilter, setTechnicianFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [testedLeadIds, setTestedLeadIds] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [allInstalledLeadIds, setAllInstalledLeadIds] = useState([]);
  const [draftSavedAt, setDraftSavedAt] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSTALLATION_DRAFT_KEY) || "null")?.savedAt || null; } catch { return null; }
  });
  const location = useLocation();
  const [showFormPage, setShowFormPage] = useState(false);

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    if (!searchParams.get("createForLead")) {
      setShowFormPage(false);
    }
  }, [location.key, location.state]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalDetails, setApprovalDetails] = useState(null);
  const [editingInstall, setEditingInstall] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [siteSurveys, setSiteSurveys] = useState([]);
  const [projectApprovals, setProjectApprovals] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  const [formDataReady, setFormDataReady] = useState(false);

  // Material Checklist add-flow: Category → Brand → Vendor → (Product) → Qty
  const [matCat, setMatCat] = useState("");
  const [matBrand, setMatBrand] = useState("");
  const [matVendor, setMatVendor] = useState("");
  const [matProductId, setMatProductId] = useState("");
  const [matQty, setMatQty] = useState("");

  // Task management state
  const [newTaskName, setNewTaskName] = useState("");
  const [newLogTaskIndex, setNewLogTaskIndex] = useState(null);
  const [newLogDate, setNewLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [newLogDescription, setNewLogDescription] = useState("");

  // Material request state (for requesting additional materials not in quotation)
  const [showMaterialRequest, setShowMaterialRequest] = useState(false);
  const [matReqProductId, setMatReqProductId] = useState("");
  const [matReqName, setMatReqName] = useState("");
  const [matReqCategory, setMatReqCategory] = useState("");
  const [matReqBrand, setMatReqBrand] = useState("");
  const [matReqQty, setMatReqQty] = useState("");
  const [matReqReason, setMatReqReason] = useState("");

  const formik = useFormik({
    initialValues: { ...initialFormData, installationDate: new Date().toISOString().split("T")[0] },
    validationSchema: installationSchema,
    onSubmit: async (values, { setFieldError, resetForm }) => {
      // Date validation
      if (!values.installationDate) {
        setFieldError("installationDate", "Installation date is required");
        return;
      }
      const minDate = new Date(editingInstall ? editingInstall.installationDate : new Date().toISOString().split("T")[0]);
      minDate.setHours(0, 0, 0, 0);
      if (new Date(values.installationDate) < minDate) {
        setFieldError("installationDate", editingInstall ? `Date cannot be earlier than the original date (${formatInstallDate(editingInstall.installationDate)})` : "Date cannot be in the past");
        return;
      }

      // Technician required if not Pending
      if (values.installationStatus !== "Pending" && !values.technicianName) {
        setFieldError("technicianName", "Technician selection is mandatory");
        return;
      }

      const payload = {
        customerName: values.customerName.trim(),
        leadId: values.leadId.trim(),
        projectName: (values.projectName || "").trim(),
        installationDate: values.installationDate,
        installationTime: values.installationTime,
        installationAddress: values.installationAddress.trim(),
        installationStatus: values.installationStatus,
        notes: values.notes.trim(),
        technicianName: values.technicianName,
        technicianId: values.technicianId,
        checklist: values.checklist,
        tasks: values.tasks,
        materials: values.materials,
        verificationStatus: values.verificationStatus,
        verificationNotes: values.verificationNotes.trim(),
      };

      // Local demo rows (no _id) keep the simple { name } metadata shape.
      // Everything saved through the API (new records + DB edits) sends the
      // actual file bytes as multipart/form-data with the structured fields
      // packed into a JSON "data" field. Existing stored photos are referenced
      // by keep-indices so their bytes are never re-uploaded.
      // Show the saving state early — photo compression can take a moment and
      // the button must stay disabled while the files are being prepared.
      setLoading(true);

      let submitData;
      if (editingInstall && !editingInstall._id) {
        submitData = { ...payload, sitePhotos: values.sitePhotos };
      } else {
        submitData = new FormData();
        submitData.append("data", JSON.stringify(payload));
        const existingPhotos = values.sitePhotos.filter((p) => !p.file);
        const newPhotos = values.sitePhotos.filter((p) => p.file);
        submitData.append("sitePhotosKeep", JSON.stringify(existingPhotos.map((p) => p._origIndex)));
        // Large photos are compressed client-side before upload so saving is
        // several times faster; small images pass through untouched. All
        // photos are compressed in parallel so multiple uploads don't wait for
        // each other's compression to finish.
        const compressedPhotos = await Promise.all(
          newPhotos.map((p) => compressImageFile(p.file))
        );
        for (const f of compressedPhotos) {
          submitData.append("sitePhotos", f);
        }
      }

      // Prevent saving when a material quantity exceeds the available stock so
      // the user is told the product doesn't have enough units.
      const overStockMat = (values.materials || []).find(
        (m) =>
          m.status === "Available" &&
          m.quantity > 0 &&
          typeof m.stock === "number" &&
          m.quantity > m.stock
      );
      if (overStockMat) {
        setLoading(false);
        showToastMsg(
          `Insufficient stock: only ${overStockMat.stock} units of "${overStockMat.productName}" available (you entered ${overStockMat.quantity})`,
          "error"
        );
        return;
      }

      try {
        if (editingInstall) {
          if (editingInstall._id) {
            const res = await installationAPI.update(editingInstall._id, submitData);
            const updated = normalizeInstall(res.data.data);
            setInstallations((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
            showToastMsg(`Installation ${updated.id} updated successfully`);
            clearInstallFileCache(updated._id);
          } else {
            setInstallations((prev) => prev.map((d) => (d.id === editingInstall.id ? { ...d, ...submitData } : d)));
            showToastMsg(`Installation ${editingInstall.id} updated successfully`);
            clearInstallFileCache(editingInstall.id);
          }
        } else {
          const res = await installationAPI.create(submitData);
          const created = normalizeInstall(res.data.data);
          // Newest first — prepend so the new installation appears on top.
          setInstallations((prev) => [created, ...prev]);
          showToastMsg(`Installation ${created.id} created successfully`);
        }
        setShowFormPage(false);
        setEditingInstall(null);
        localStorage.removeItem(INSTALLATION_DRAFT_KEY);
        setDraftSavedAt(null);
        resetForm();
        if (editingInstall) {
          // Update — the row stays where it is; refresh the current page.
          await Promise.all([fetchInstallations(), fetchStats()]);
        } else {
          // Create — new installations sort to the top (page 1), so jump
          // there so the newly created row is visible.
          setCurrentPage(1);
          if (currentPage === 1) {
            await Promise.all([fetchInstallations(), fetchStats()]);
          } else {
            // The currentPage change triggers the refetch effect automatically.
            await fetchStats();
          }
        }
      } catch (err) {
        showToastMsg(err.response?.data?.message || "Failed to save installation. Please try again.", "error");
      } finally {
        setLoading(false);
      }
    },
  });

  const saveInstallationDraft = () => {
    const { sitePhotos, ...fields } = formik.values;
    const savedAt = new Date().toISOString();
    localStorage.setItem(INSTALLATION_DRAFT_KEY, JSON.stringify({
      values: {
        ...fields,
        sitePhotos: (sitePhotos || []).filter((photo) => !photo.file),
      },
      savedAt,
    }));
    setDraftSavedAt(savedAt);
    showToastMsg("Installation draft saved on this device.");
  };

  const discardInstallationDraft = () => {
    localStorage.removeItem(INSTALLATION_DRAFT_KEY);
    setDraftSavedAt(null);
    showToastMsg("Saved installation draft discarded.");
  };

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInstall, setSelectedInstall] = useState(null);

  // Full-size image viewer for photo thumbnails (click to zoom)
  const [zoomImage, setZoomImage] = useState(null); // { src, alt }

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);

  const [loading, setLoading] = useState(true);
  const [replacePhotoIndex, setReplacePhotoIndex] = useState(null);

  const photoInputRef = useRef(null);
  const timeInputRef = useRef(null);

  const anyModalOpen = showViewModal || showDeleteDialog;

  // Guards against out-of-order responses when the user pages / filters fast:
  // only the LATEST request may write to state.
  const fetchSeqRef = useRef(0);

  // Server-side fetch of the CURRENT page — search/status/verification/
  // technician/date filters are applied server-side and the API's pagination
  // metadata drives the pager.
  const fetchInstallations = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const params = { page: currentPage, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "All") params.status = statusFilter;
      if (verificationFilter !== "All") params.verification = verificationFilter;
      if (technicianFilter !== "All") params.technician = technicianFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const res = await installationAPI.getAll(params);
      if (seq === fetchSeqRef.current) {
        setInstallations((res.data?.data || []).map(normalizeInstall));
        setServerTotal(res.data?.pagination?.total || 0);
      }
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        console.warn("Failed to load installations:", err?.message);
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter, verificationFilter, technicianFilter, dateFrom, dateTo]);

  // Status counts + installed lead IDs computed over ALL installations server-side.
  const fetchStats = useCallback(async () => {
    try {
      const res = await installationAPI.getStats();
      if (res.data?.success && res.data?.data) {
        setStats(res.data.data);
        setAllInstalledLeadIds(res.data.data.installedLeadIds || []);
      }
    } catch (err) {
      console.warn("Failed to load installation stats:", err?.message);
    }
  }, []);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Refetch the table whenever page / size / filters change ── */
  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  /* ── Fetch stats once on mount (and again after mutations) ── */
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);


  const fetchTestedLeadIds = useCallback(async () => {
    try {
      const res = await testingAPI.getAll({ page: 1, limit: 1000 });
      const ids = (res.data?.data || []).map((t) => t.leadId).filter(Boolean);
      setTestedLeadIds([...new Set(ids)]);
    } catch {}
  }, []);

  // Re-fetch tested lead IDs whenever the user navigates back to this page
  // (e.g. after creating a testing record on the Testing page).
  useEffect(() => {
    fetchTestedLeadIds();
  }, [fetchTestedLeadIds, location.key]);

  useEffect(() => {
    let cancelled = false;
    const loadFormData = async () => {
      try {
        const [techRes, surveyRes, approvalRes, productRes, invRes, quoteRes] = await Promise.all([
          technicianAPI.getAll({ page: 1, limit: 100 }),
          siteSurveyAPI.getAll({ page: 1, limit: 100 }),
          projectApprovalAPI.getAll({ page: 1, limit: 100 }),
          productAPI.getAll({ page: 1, limit: 10000 }),
          inventoryAPI.getAll({ page: 1, limit: 10000 }),
          quotationAPI.getAll({ page: 1, limit: 1000 }),
        ]);
        if (cancelled) return;
        setTechnicians(techRes.data?.data || []);
        setSiteSurveys(surveyRes.data?.data || []);
        setProjectApprovals(approvalRes.data?.data || []);
        setProducts(productRes.data?.data || []);
        setInventoryList(invRes.data?.data || []);
        setQuotations(quoteRes.data?.data || []);
      } catch (err) {
        console.warn("Failed to load form data:", err?.message);
      } finally {
        if (!cancelled) setFormDataReady(true);
      }
    };
    loadFormData();
    return () => { cancelled = true; };
  }, []);

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
    if (!prefill || prefillAppliedRef.current || !formDataReady) return;
    prefillAppliedRef.current = true;
    formik.setFieldValue("leadId", prefill.leadId);
    if (prefill.customerName) formik.setFieldValue("customerName", prefill.customerName);
   
    handleLeadSelect(prefill.leadId, { silent: true });
    setShowFormPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDataReady]);

  // ── Material Checklist add-flow (Category → Brand → Vendor → Product → Qty)
  const materialCategories = useMemo(() => {
    const seen = new Set();
    return (products || []).filter((p) => p.category && !seen.has(p.category) && seen.add(p.category)).map((p) => p.category);
  }, [products]);

  const materialBrands = useMemo(() => {
    if (!matCat) return [];
    const seen = new Set();
    return (products || []).filter((p) => p.category === matCat && p.brand && !seen.has(p.brand) && seen.add(p.brand)).map((p) => p.brand);
  }, [products, matCat]);

  const materialVendors = useMemo(() => {
    if (!matCat || !matBrand) return [];
    const seen = new Set();
    const options = [];
    (products || []).forEach((p) => {
      if (p.category !== matCat || p.brand !== matBrand) return;
      const v = getProductSupplier(p, inventoryList);
      if (v && !seen.has(v)) { seen.add(v); options.push({ value: v, label: v }); }
    });
    return options;
  }, [products, inventoryList, matCat, matBrand]);

  const materialProductOptions = useMemo(() => {
    if (!matCat || !matBrand || !matVendor) return [];
    return (products || []).filter(
      (p) => p.category === matCat && p.brand === matBrand && getProductSupplier(p, inventoryList) === matVendor
    );
  }, [products, inventoryList, matCat, matBrand, matVendor]);

  const addTargetProduct = useMemo(() => {
    if (materialProductOptions.length === 1) return materialProductOptions[0];
    return materialProductOptions.find((p) => (p.productId || p._id || "") === matProductId) || null;
  }, [materialProductOptions, matProductId]);

  const canAddMaterial = !!addTargetProduct && matQty !== "" && Number(matQty) >= 1;

  const handleAddMaterial = () => {
    if (!addTargetProduct || !canAddMaterial) return;
    const qty = Number.isFinite(Math.floor(Number(matQty))) && Math.floor(Number(matQty)) >= 1 ? Math.floor(Number(matQty)) : 1;
    const catalogStock = typeof addTargetProduct.stock === "number" && addTargetProduct.stock >= 0 ? addTargetProduct.stock : 0;
    // Materials are limited only by the Product Catalog's available stock —
    // there is no per-lead quoted allocation anymore.
    if (qty > catalogStock) {
      showToastMsg(`Insufficient stock: only ${catalogStock} unit(s) of "${addTargetProduct.name}" available (you entered ${qty}).`, "error");
      return;
    }
    const stock = catalogStock;
    const entry = {
      productId: addTargetProduct.productId || addTargetProduct._id || "",
      productName: addTargetProduct.name || "",
      category: addTargetProduct.category || "",
      brand: addTargetProduct.brand || "",
      vendorName: getProductSupplier(addTargetProduct, inventoryList),
      price: typeof addTargetProduct.price === "number" ? addTargetProduct.price : null,
      stock,
      quantity: qty,
      status: "Available",
    };
    formik.setFieldValue("materials", [...formik.values.materials, entry]);
    setMatProductId("");
    setMatQty("");
  };

  const handleRemoveMaterial = (idx) => {
    formik.setFieldValue(
      "materials",
      formik.values.materials.filter((_, i) => i !== idx)
    );
  };

  // Total material cost: unit price × qty summed over the selected materials.
  // Only "Available" rows with a quantity count toward the total.
  const materialTotal = useMemo(() => {
    return (formik.values.materials || []).reduce((sum, m) => {
      if (!m || typeof m !== "object" || m.status !== "Available") return sum;
      const qty = Number(m.quantity || 0);
      const price = Number(m.price);
      if (qty <= 0 || !Number.isFinite(price) || price <= 0) return sum;
      return sum + qty * price;
    }, 0);
  }, [formik.values.materials]);

  const resetMaterialFlow = () => {
    setMatCat(""); setMatBrand(""); setMatVendor(""); setMatProductId(""); setMatQty("");
  };

  // ── Task management handlers
  const handleAddTask = () => {
    const name = newTaskName.trim();
    if (!name) return;
    formik.setFieldValue("tasks", [
      ...formik.values.tasks,
      { name, status: "To Do", dailyLogs: [] },
    ]);
    setNewTaskName("");
  };

  const handleRemoveTask = (taskIdx) => {
    formik.setFieldValue(
      "tasks",
      formik.values.tasks.filter((_, i) => i !== taskIdx)
    );
  };

  const handleTaskStatusChange = (taskIdx, newStatus) => {
    formik.setFieldValue(
      "tasks",
      formik.values.tasks.map((t, i) => i === taskIdx ? { ...t, status: newStatus } : t)
    );
  };

  const handleAddDailyLog = (taskIdx) => {
    if (!newLogDescription.trim()) return;
    const updatedTasks = formik.values.tasks.map((t, i) => {
      if (i !== taskIdx) return t;
      return {
        ...t,
        dailyLogs: [
          ...t.dailyLogs,
          { date: newLogDate || new Date().toISOString().split("T")[0], description: newLogDescription.trim() },
        ],
      };
    });
    formik.setFieldValue("tasks", updatedTasks);
    setNewLogDescription("");
    setNewLogDate(new Date().toISOString().split("T")[0]);
    setNewLogTaskIndex(null);
  };

  const handleRemoveDailyLog = (taskIdx, logIdx) => {
    const updatedTasks = formik.values.tasks.map((t, i) => {
      if (i !== taskIdx) return t;
      return { ...t, dailyLogs: t.dailyLogs.filter((_, j) => j !== logIdx) };
    });
    formik.setFieldValue("tasks", updatedTasks);
  };

  // Summary stats for tasks
  const taskStats = useMemo(() => {
    const tasks = formik.values.tasks || [];
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "Completed").length;
    const inProgress = tasks.filter((t) => t.status === "In Progress").length;
    return { total, completed, inProgress, toDo: total - completed - inProgress };
  }, [formik.values.tasks]);

  // ── Material request handlers (requesting additional materials not in quotation)
  const handleAddMaterialRequest = () => {
    const name = matReqName.trim();
    if (!name || !matReqQty || Number(matReqQty) < 1) return;
    formik.setFieldValue("materialRequests", [
      ...formik.values.materialRequests,
      {
        productId: matReqProductId || "",
        productName: name,
        category: matReqCategory.trim(),
        brand: matReqBrand.trim(),
        quantity: Math.floor(Number(matReqQty)),
        reason: matReqReason.trim(),
        status: "Pending",
      },
    ]);
    setMatReqProductId("");
    setMatReqName("");
    setMatReqCategory("");
    setMatReqBrand("");
    setMatReqQty("");
    setMatReqReason("");
    setShowMaterialRequest(false);
  };

  const handleRemoveMaterialRequest = (reqIdx) => {
    formik.setFieldValue(
      "materialRequests",
      formik.values.materialRequests.filter((_, i) => i !== reqIdx)
    );
  };

  // Map leadId -> projectName from project approvals (for table display)
  const projectNameByLead = useMemo(() => {
    const map = {};
    (projectApprovals || []).forEach((a) => {
      if (a.leadId && a.projectName) map[a.leadId] = a.projectName;
    });
    return map;
  }, [projectApprovals]);

  // Lead options come from the Site Survey module, but only for leads that have
  // approved project approvals. Each option shows the lead ID with its customer
  // name, and selecting one auto-fills the read-only Customer Name field.
  // An already-selected value (e.g. when editing) is kept in the list even if
  // that approval no longer exists.
  // Dropdown options: approved project approvals that don't already have an
  // installation. Shows project names. If the installation being edited
  // references a project not in the current list, keep it selectable.
  const projectOptions = useMemo(() => {
    const approvedApprovals = (projectApprovals || [])
      .filter((a) => a.status === "Approved" && a.leadId);

    const installedLeadIds = new Set(allInstalledLeadIds);
    if (formik.values.leadId) installedLeadIds.delete(formik.values.leadId);

    const seen = new Set();
    const options = approvedApprovals
      .filter((a) => !installedLeadIds.has(a.leadId))
      .sort((a, b) => (a.projectName || "").localeCompare(b.projectName || ""))
      .filter((a) => {
        if (seen.has(a.leadId)) return false;
        seen.add(a.leadId);
        return true;
      })
      .map((a) => ({ value: a.leadId, label: a.projectName || a.customerName || a.leadId }));
    if (formik.values.leadId && !seen.has(formik.values.leadId)) {
      const editing = approvedApprovals.find((a) => a.leadId === formik.values.leadId);
      options.unshift({ value: formik.values.leadId, label: editing?.projectName || formik.values.leadId });
    }
    return options;
  }, [projectApprovals, allInstalledLeadIds, formik.values.leadId]);

  const handleLeadSelect = (leadId, { silent } = {}) => {
    formik.setFieldValue("leadId", leadId);
    // Auto-fill project name from the project approval
    const approval = (projectApprovals || []).find((a) => a.leadId === leadId);
    formik.setFieldValue("projectName", approval?.projectName || "");
    const survey = (siteSurveys || []).find((s) => s.leadId === leadId);
    // Preserve the existing name when the chosen lead is not found in the
    // survey list (e.g. the fallback option shown while editing).
    formik.setFieldValue("customerName", survey ? survey.customerName : formik.values.customerName);
    // Auto-fill technician from the site survey assigned to this lead
    if (survey && survey.technicianId) {
      formik.setFieldValue("technicianId", survey.technicianId || "");
      formik.setFieldValue("technicianName", survey.technicianName || "");
    }
    // Auto-fill materials from the lead's quotation (same leadId) as a
    // convenience prefill. Availability comes from the Product Catalog's
    // stock — there is no per-lead quoted allocation anymore, so any product
    // (or extra quantity) can be added directly.
    const quote = (quotations || []).find((q) => q.leadId === leadId);
    if (quote?.items) {
      const mats = Object.entries(quote.items)
        .map(([k, item]) => {
          if (!item || Number(item.qty) <= 0) return null;
          const p = (products || []).find(
            (x) => String(x._id) === String(k) || (x.productId && String(x.productId) === String(k))
          );
          if (!p) return null;
          const catalogStock = typeof p.stock === "number" && p.stock >= 0 ? p.stock : 0;
          const qty = Math.max(1, Math.floor(Number(item.qty)) || 1);
          return {
            productId: p.productId || p._id || "",
            productName: p.name || "",
            category: p.category || "",
            brand: p.brand || "",
            vendorName: getProductSupplier(p, inventoryList) || "",
            price: typeof item.price === "number" ? item.price : (typeof p.price === "number" ? p.price : null),
            stock: catalogStock,
            quantity: qty,
            quotedQty: qty,
            status: catalogStock > 0 ? "Available" : "Not Available",
          };
        })
        .filter(Boolean);
      formik.setFieldValue("materials", mats);
      if (!silent) showToastMsg("Materials auto-filled from the lead's quotation.");
    } else {
      formik.setFieldValue("materials", []);
    }
  };

  const namedTechnicians = useMemo(() => technicians.filter((t) => t.name), [technicians]);

  // Product options for material request dropdown
  const matReqProductOptions = useMemo(() => {
    return (products || []).map((p) => ({
      value: p.productId || p._id || "",
      label: p.name || "",
      category: p.category || "",
      brand: p.brand || "",
      price: typeof p.price === "number" ? p.price : null,
    }));
  }, [products]);

  // Brand options for material request dropdown (filtered by selected category)
  const matReqBrandOptions = useMemo(() => {
    const seen = new Set();
    return (products || [])
      .filter((p) => {
        if (matReqCategory && p.category !== matReqCategory) return false;
        if (p.brand && !seen.has(p.brand)) {
          seen.add(p.brand);
          return true;
        }
        return false;
      })
      .map((p) => ({ value: p.brand, label: p.brand }));
  }, [products, matReqCategory]);

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

  const { success: toastSuccess, error: toastError } = useToast();
  const { canDo } = useAuth();
  const showToastMsg = useCallback((message, type = "success") => {
    if (type === "error") toastError(message);
    else toastSuccess(message);
  }, [toastSuccess, toastError]);

  // The server already filters + sorts (newest first) and returns only the
  // current page, so the table renders `installations` directly.
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // Clamp the page when the total shrinks (delete / filter change).
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, serverTotal, pageSize]);

  const handleCreateTesting = (inst) => {
    if (inst.installationStatus !== "Completed" || !inst.leadId) return;
    const params = new URLSearchParams({
      createForLead: inst.leadId || "",
      customerName: inst.customerName || "",
    });
    navigate(`/admin/testing?${params.toString()}`);
  };

  const openFormPage = (inst = null) => {
    resetMaterialFlow();
    if (inst) {
      setEditingInstall(inst);
      formik.setValues({
        customerName: inst.customerName,
        leadId: inst.leadId,
        projectName: inst.projectName || (projectApprovals.find((a) => a.leadId === inst.leadId) || {}).projectName || "",
        installationDate: formatDateInput(inst.installationDate),
        installationTime: inst.installationTime,
        installationAddress: inst.installationAddress,
        installationStatus: inst.installationStatus,
        notes: inst.notes || "",
        technicianName: inst.technicianName || "",
        technicianId: inst.technicianId || "",
        checklist: inst.checklist ? [...inst.checklist] : [],
        tasks: inst.tasks && inst.tasks.length ? inst.tasks.map((t) => ({
          name: t.name || "",
          status: t.status || "To Do",
          dailyLogs: Array.isArray(t.dailyLogs) ? t.dailyLogs.map((log) => ({
            date: log.date ? new Date(log.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            description: log.description || "",
          })) : [],
        })) : [],
        materials: inst.materials && inst.materials.length ? normalizeMaterials(inst.materials, products, inventoryList) : [],
        // Remember the index of each stored photo so edits keep the exact
        // stored file bytes (only new photos are uploaded) — matches the
        // Site Survey / Testing modules.
        sitePhotos: inst.sitePhotos ? inst.sitePhotos.map((p, i) => ({ ...p, _origIndex: i })) : [],
        materialRequests: inst.materialRequests && inst.materialRequests.length ? inst.materialRequests.map((r) => ({
          productName: r.productName || "",
          category: r.category || "",
          brand: r.brand || "",
          quantity: typeof r.quantity === "number" ? r.quantity : 1,
          reason: r.reason || "",
          status: r.status || "Pending",
        })) : [],
        verificationStatus: inst.verificationStatus || "Not Verified",
        verificationNotes: inst.verificationNotes || "",
      });
    } else {
      setEditingInstall(null);
      try {
        const draft = JSON.parse(localStorage.getItem(INSTALLATION_DRAFT_KEY) || "null");
        if (draft?.values) {
          formik.setValues({
            ...initialFormData,
            installationDate: new Date().toISOString().split("T")[0],
            materials: [],
            ...draft.values,
          });
          setDraftSavedAt(draft.savedAt || null);
        } else {
          const today = new Date().toISOString().split("T")[0];
          formik.resetForm({ values: { ...initialFormData, installationDate: today, materials: [] } });
        }
      } catch {
        const today = new Date().toISOString().split("T")[0];
        formik.resetForm({ values: { ...initialFormData, installationDate: today, materials: [] } });
      }
    }
    setShowFormPage(true);
  };

  const openViewModal = (inst) => {
    setSelectedInstall(inst);
    setShowViewModal(true);
  };

  const openApprovalModal = async (inst) => {
    if (!inst || !inst.leadId) return;
    setShowApprovalModal(true);
    setApprovalDetails(null);
    const findMatch = (list) =>
      (list || []).find((a) => a.leadId === inst.leadId);
    const cached = findMatch(projectApprovals);
    if (cached) {
      setApprovalDetails(cached);
      return;
    }
    try {
      const res = await projectApprovalAPI.getAll({ page: 1, limit: 1000 });
      const found = findMatch(res.data?.data || []);
      if (found) {
        setApprovalDetails(found);
      } else {
        showToastMsg("Project approval not found for this lead", "error");
        setShowApprovalModal(false);
      }
    } catch (err) {
      showToastMsg(err.response?.data?.message || "Failed to load project approval details", "error");
      setShowApprovalModal(false);
    }
  };

  const confirmDelete = (inst) => {
    setDeleteTarget(inst);
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
        await installationAPI.delete(deleteTarget._id);
        showToastMsg(`Installation ${deleteTarget.id} deleted successfully`);
        clearInstallFileCache(deleteTarget._id);
        await Promise.all([fetchInstallations(), fetchStats()]);
      } else {
        setInstallations((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        showToastMsg(`Installation ${deleteTarget.id} deleted successfully`);
      }
    } catch (err) {
      // [FLOW-06] Show dependency details if the backend returns them
      const deps = err.response?.data?.dependencies;
      const msg = err.response?.data?.message || "Failed to delete installation. Please try again.";
      if (deps && deps.length > 0) {
        const detail = deps.map((d) => `• ${d.count} ${d.module}${d.count > 1 ? "s" : ""}`).join("\n");
        showToastMsg(`${msg}\n\nLinked records:\n${detail}`, "error");
      } else {
        showToastMsg(msg, "error");
      }
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

const downloadInstallLog = (inst) => {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text("SOLAR INSTALLATION LOG", 20, 20);

  let y = 35;

  // Installation Details
  doc.setFontSize(12);
  doc.text(`Installation ID      : ${inst.id}`, 20, y); y += 10;
  doc.text(`Customer Name        : ${inst.customerName}`, 20, y); y += 10;
  doc.text(`Lead ID              : ${inst.leadId}`, 20, y); y += 10;
  doc.text(
    `Installation Date    : ${
      formatInstallDate(inst.installationDate) || "—"
    }`,
    20,
    y
  );
  y += 10;

  doc.text(
    `Installation Time    : ${inst.installationTime || "—"}`,
    20,
    y
  );
  y += 10;

  doc.text(
    `Installation Address : ${
      inst.installationAddress || "—"
    }`,
    20,
    y
  );
  y += 15;

  // Technician Details
  doc.setFontSize(14);
  doc.text("Technician Details", 20, y);
  y += 10;

  doc.setFontSize(12);
  doc.text(
    `Technician Name : ${inst.technicianName || "Unassigned"}`,
    20,
    y
  );
  y += 10;

  doc.text(
    `Technician ID   : ${inst.technicianId || "—"}`,
    20,
    y
  );
  y += 15;

  // Status
  doc.setFontSize(14);
  doc.text("Status", 20, y);
  y += 10;

  doc.setFontSize(12);
  doc.text(
    `Installation Status : ${inst.installationStatus}`,
    20,
    y
  );
  y += 10;

  doc.text(
    `Verification Status : ${inst.verificationStatus}`,
    20,
    y
  );
  y += 10;

  // Notes
  const notes = doc.splitTextToSize(
    `Notes: ${inst.notes || "—"}`,
    170
  );
  doc.text(notes, 20, y);
  y += notes.length * 7 + 5;

  const verificationNotes = doc.splitTextToSize(
    `Verification Notes: ${inst.verificationNotes || "—"}`,
    170
  );
  doc.text(verificationNotes, 20, y);
  y += verificationNotes.length * 7 + 10;

  // Footer
  doc.setLineWidth(0.5);
  doc.line(20, y, 190, y);

  doc.setFontSize(10);
  doc.text(
    `Generated on: ${new Date().toLocaleString()}`,
    20,
    y + 10
  );

  // Safe filename
  const safeCustomer = (inst.customerName || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  // Download PDF
  doc.save(`InstallationLog_${safeCustomer}.pdf`);

  showToastMsg("Installation log downloaded");
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
      showToastMsg("Only JPG, JPEG, and PNG files are accepted", "error");
    }
    if (valid.length > 0) {
      if (replacePhotoIndex !== null) {
        const updated = [...formik.values.sitePhotos];
        updated[replacePhotoIndex] = valid[0];
        formik.setFieldValue("sitePhotos", updated);
        setReplacePhotoIndex(null);
      } else {
        formik.setFieldValue("sitePhotos", [...formik.values.sitePhotos, ...valid]);
      }
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Download a stored installation photo from the database
  const downloadPhotoBlob = async (request, filename) => {
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
      let message = "Failed to download photo. Please try again.";
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
      showToastMsg(message, "error");
    }
  };

  const downloadInstallPhoto = (inst, photo, index) => {
    if (!inst?._id || !photo) return;
    downloadPhotoBlob(installationAPI.downloadPhoto(inst._id, index), photo.name || `site-photo-${index + 1}`);
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "Completed": return "im-badge-completed";
      case "In Progress": return "im-badge-progress";
      case "Scheduled": return "im-badge-scheduled";
      case "On Hold": return "im-badge-hold";
      default: return "im-badge-pending";
    }
  };

  const getVerificationClass = (status) => {
    return status === "Verified" ? "im-badge-verified" : "im-badge-unverified";
  };

  // Quick inline status update from the table dropdown
  const [inlineStatusUpdating, setInlineStatusUpdating] = useState(null);
  const handleInlineStatusChange = async (inst, newStatus) => {
    if (!inst || newStatus === inst.installationStatus) return;
    const serverId = inst.serverId || inst._id || inst.id;
    setInlineStatusUpdating(serverId);
    try {
      const res = await installationAPI.updateStatus(serverId, newStatus);
      const updated = normalizeInstall(res.data.data);
      setInstallations((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
      showToastMsg(`Status updated to "${newStatus}"`);
      await Promise.all([fetchStats(), fetchTestedLeadIds()]);
    } catch (err) {
      showToastMsg(err.response?.data?.message || "Failed to update status.", "error");
    } finally {
      setInlineStatusUpdating(null);
    }
  };

  const renderFormPage = () => (
    <div className="im-form-page">
      <div className="im-form-page-header">
        <button className="im-btn im-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Installations
        </button>
        <h2>{editingInstall ? `Edit Installation ${editingInstall.id}` : "Schedule New Installation"}</h2>
      </div>

      {!editingInstall && draftSavedAt && !prefillRef.current && (
        <div className="im-draft-notice">
          <span>Draft restored — last saved {new Date(draftSavedAt).toLocaleString("en-IN")}.</span>
          <button type="button" onClick={discardInstallationDraft}>Discard draft</button>
        </div>
      )}

        <form onSubmit={formik.handleSubmit} className="im-form-page-body" noValidate>
          {/* Section 1: Schedule Installation */}
          <div className="im-form-section">
            <div className="im-section-header">
              <span className="im-section-number">1</span>
              <h4>Schedule Installation</h4>
            </div>
            <div className="im-form-grid">
              <div className="im-form-field">
                <label>Select Project <span className="im-required">*</span></label>
                <Dropdown
                  value={formik.values.leadId}
                  onChange={handleLeadSelect}
                  options={projectOptions}
                  variant="form"
                  placeholder="Select Project"
                  emptyMessage={projectApprovals.length === 0 ? "No project approvals available yet" : projectOptions.length === 0 ? "All approved projects already have an installation" : "No approved projects found"}
                />
                {formik.errors.leadId && formik.touched.leadId && <span className="im-field-error">{formik.errors.leadId}</span>}
              </div>
              <div className="im-form-field">
                <label>Project Name</label>
                <input
                  type="text"
                  name="projectName"
                  value={formik.values.projectName}
                  readOnly
                  placeholder="Auto-filled from project"
                  className="im-input-readonly"
                />
              </div>
              <div className="im-form-field">
                <label>Customer Name <span className="im-required">*</span></label>
                <input
                  type="text"
                  name="customerName"
                  value={formik.values.customerName}
                  readOnly
                  placeholder="Auto-filled from the selected project"
                  title="Auto-filled from the selected project's approval"
                  className={`im-input-readonly ${formik.errors.customerName && formik.touched.customerName ? "im-input-error" : ""}`}
                />
                {formik.errors.customerName && formik.touched.customerName && <span className="im-field-error">{formik.errors.customerName}</span>}
              </div>
              <div className="im-form-field">
                <label>Installation Date <span className="im-required">*</span></label>
                <input
                  type="date"
                  name="installationDate"
                  value={formik.values.installationDate}
                  onChange={formik.handleChange}
                  min={editingInstall ? formatDateInput(editingInstall.installationDate) : new Date().toISOString().split("T")[0]}
                  className={formik.errors.installationDate && formik.touched.installationDate ? "im-input-error" : ""}
                />
                {formik.errors.installationDate && formik.touched.installationDate && <span className="im-field-error">{formik.errors.installationDate}</span>}
              </div>
              <div className="im-form-field">
                <label>Installation Time <span className="im-required">*</span></label>
                <input
                  ref={timeInputRef}
                  type="time"
                  name="installationTime"
                  value={formik.values.installationTime}
                  onChange={formik.handleChange}
                  onClick={() => {
                    try {
                      if (timeInputRef.current && typeof timeInputRef.current.showPicker === "function") {
                        timeInputRef.current.showPicker();
                      }
                    } catch (e) {
                      /* Ignore — picker may already be open or not supported */
                    }
                  }}
                  className={formik.errors.installationTime && formik.touched.installationTime ? "im-input-error" : ""}
                />
                {formik.errors.installationTime && formik.touched.installationTime && <span className="im-field-error">{formik.errors.installationTime}</span>}
              </div>
              <div className="im-form-field im-full-width">
                <label>Installation Address <span className="im-required">*</span></label>
                <textarea name="installationAddress" value={formik.values.installationAddress} onChange={formik.handleChange} placeholder="Enter complete installation address" rows={2} maxLength={201} className={(formik.values.installationAddress || "").length > 200 ? "im-input-error" : ""} />
                {(formik.values.installationAddress || "").length > 200 && <span className="im-field-error">Installation address cannot exceed 200 characters</span>}
              </div>
              <div className="im-form-field">
                <label>Installation Status <span className="im-required">*</span></label>
                <Dropdown value={formik.values.installationStatus} onChange={(val) => formik.setFieldValue("installationStatus", val)} options={INSTALL_STATUSES.map((st) => ({ value: st, label: st }))} variant="form" />
                {formik.errors.installationStatus && formik.touched.installationStatus && <span className="im-field-error">{formik.errors.installationStatus}</span>}
              </div>
              <div className="im-form-field">
                <label>Notes</label>
                <input type="text" name="notes" value={formik.values.notes} onChange={formik.handleChange} placeholder="Any additional notes" maxLength={101} className={(formik.values.notes || "").length > 100 ? "im-input-error" : ""} />
                {(formik.values.notes || "").length > 100 && <span className="im-field-error">Notes cannot exceed 100 characters</span>}
              </div>
              <div className="im-form-field">
                <label>Assign Technician <span className="im-required">*</span></label>
                <Dropdown
                  value={formik.values.technicianId || ""}
                  onChange={(val) => {
                    const tech = namedTechnicians.find((t) => (t.technicianId || "") === val);
                    formik.setFieldValue("technicianId", val);
                    formik.setFieldValue("technicianName", tech ? tech.name : "");
                  }}
                  options={namedTechnicians.map((t) => ({
                    value: t.technicianId || "",
                    label: `${t.name}${t.technicianId ? ` (${t.technicianId})` : ""}`,
                  }))}
                  variant="form"
                  placeholder="Select technician"
                  emptyMessage="No technicians available"
                />
                {formik.errors.technicianName && formik.touched.technicianName && <span className="im-field-error">{formik.errors.technicianName}</span>}
              </div>
            </div>
          </div>

          {/* Section 2: Installation Tasks */}
          <div className="im-form-section">
            <div className="im-section-header">
              <span className="im-section-number">2</span>
              <h4>Installation Tasks</h4>
              {formik.values.tasks.length > 0 && (
                <div className="im-task-summary">
                  <span className="im-task-stat im-task-stat-total">{taskStats.total} total</span>
                  {taskStats.inProgress > 0 && <span className="im-task-stat im-task-stat-progress">{taskStats.inProgress} in progress</span>}
                  {taskStats.completed > 0 && <span className="im-task-stat im-task-stat-done">{taskStats.completed} done</span>}
                </div>
              )}
            </div>

            {/* Add task bar */}
            <div className="im-task-addbar">
              <input
                type="text"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(); } }}
                placeholder="Enter task name (e.g. Mounting Structure, Wiring, Inverter Setup)"
                className="im-task-addbar-input"
                maxLength={100}
              />
              <button type="button" className="im-btn im-btn-primary im-task-addbar-btn" onClick={handleAddTask} disabled={!newTaskName.trim()}>Add Task</button>
            </div>

            {/* Task list */}
            {formik.values.tasks.length === 0 ? (
              <div className="im-tech-empty">
                No tasks added yet. Type a task name above and click "Add Task" to start tracking installation progress.
              </div>
            ) : (
              <div className="im-task-list">
                {formik.values.tasks.map((task, taskIdx) => (
                  <div key={taskIdx} className={`im-task-card im-task-${task.status.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="im-task-card-header">
                      <div className="im-task-card-title">
                        <span className="im-task-number">{taskIdx + 1}</span>
                        <span className="im-task-name">{task.name}</span>
                      </div>
                      <div className="im-task-card-actions">
                        <Dropdown
                          value={task.status}
                          onChange={(val) => handleTaskStatusChange(taskIdx, val)}
                          options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
                          variant="form"
                        />
                        <button type="button" className="im-task-remove-btn" onClick={() => handleRemoveTask(taskIdx)} title="Remove task">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Daily logs for this task */}
                    <div className="im-task-logs">
                      <div className="im-task-logs-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                        <span>Daily Progress Logs ({task.dailyLogs.length})</span>
                      </div>

                      {task.dailyLogs.length > 0 && (
                        <div className="im-task-log-list">
                          {task.dailyLogs.map((log, logIdx) => (
                            <div key={logIdx} className="im-task-log-entry">
                              <div className="im-task-log-date">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                {formatInstallDate(log.date)}
                              </div>
                              <div className="im-task-log-desc">{log.description}</div>
                              <button type="button" className="im-task-log-remove" onClick={() => handleRemoveDailyLog(taskIdx, logIdx)} title="Remove log">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add daily log form */}
                      {newLogTaskIndex === taskIdx ? (
                        <div className="im-task-log-form">
                          <div className="im-task-log-form-row">
                            <input
                              type="date"
                              value={newLogDate}
                              onChange={(e) => setNewLogDate(e.target.value)}
                              className="im-task-log-date-input"
                            />
                            <textarea
                              value={newLogDescription}
                              onChange={(e) => setNewLogDescription(e.target.value)}
                              placeholder="What was done today? What's remaining?"
                              rows={2}
                              maxLength={501}
                              className="im-task-log-desc-input"
                            />
                          </div>
                          <div className="im-task-log-form-actions">
                            <button type="button" className="im-btn-sm im-btn-cancel" onClick={() => { setNewLogTaskIndex(null); setNewLogDescription(""); setNewLogDate(new Date().toISOString().split("T")[0]); }}>Cancel</button>
                            <button type="button" className="im-btn-sm im-btn-change" onClick={() => handleAddDailyLog(taskIdx)} disabled={!newLogDescription.trim()}>Save Log</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="im-task-log-add-btn" onClick={() => { setNewLogTaskIndex(taskIdx); setNewLogDate(new Date().toISOString().split("T")[0]); setNewLogDescription(""); }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Add Today's Progress Log
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Materials Used */}
          <div className="im-form-section im-full-width">
            <div className="im-section-header">
              <span className="im-section-number">3</span>
              <h4>Materials Used</h4>
            </div>

            {/* Quoted materials — pre-filled from the lead's quotation */}
            {formik.values.materials.length === 0 ? (
              <div className="im-tech-empty">
                No materials found in the quotation for this project. Select a project first, or request additional materials below.
              </div>
            ) : (
              <>
                <div className="im-material-grid">
                  {formik.values.materials.map((mat, idx) => {
                    const qty = mat.quantity || 0;
                    const quotedQty = mat.quotedQty || 0;
                    const remaining = Math.max(0, quotedQty - qty);
                    const overUsed = quotedQty > 0 && qty > quotedQty;
                    return (
                      <div key={`${mat.productId || ""}-${idx}`} className={`im-mat-item ${overUsed ? "im-mat-out" : ""}`}>
                        <button
                          type="button"
                          className="im-mat-remove"
                          onClick={() => handleRemoveMaterial(idx)}
                          title="Remove material"
                        >×</button>
                        <div className="im-mat-info">
                          <span className="im-mat-name">
                            {mat.productName || `Material ${idx + 1}`}
                            {typeof mat.price === "number" && (
                              <span className="im-mat-price" title="Price per unit">{formatPrice(mat.price)} / unit</span>
                            )}
                          </span>
                          <div className="im-mat-meta">
                            {mat.brand && <span className="im-mat-cat">{mat.brand}</span>}
                            {mat.vendorName && mat.vendorName !== mat.brand && (
                              <span className="im-mat-cat">{mat.vendorName}</span>
                            )}
                            {mat.category && <span className="im-mat-cat">{mat.category}</span>}
                          </div>
                          <div className="im-mat-qty-info">
                            {quotedQty > 0 && <span className="im-mat-quoted">Provided: {quotedQty}</span>}
                            {qty > 0 && <span className="im-mat-used">Used: {qty}</span>}
                            {quotedQty > 0 && <span className={`im-mat-remaining ${remaining === 0 ? "zero" : ""}`}>Remaining: {remaining}</span>}
                          </div>
                        </div>
                        <div className="im-mat-controls">
                          <div className="im-mat-qty">
                            <label htmlFor={`im-mat-qty-${idx}`}>Qty Used</label>
                            <input
                              id={`im-mat-qty-${idx}`}
                              type="number"
                              min="0"
                              max={quotedQty > 0 ? quotedQty : 10000}
                              value={qty > 0 ? qty : ""}
                              placeholder="0"
                              className={overUsed ? "im-mat-input-error" : ""}
                              onChange={(e) => {
                                const text = e.target.value;
                                if (text === "") {
                                  formik.setFieldValue(
                                    "materials",
                                    formik.values.materials.map((v, i) =>
                                      i === idx ? { ...v, quantity: 0 } : v
                                    )
                                  );
                                  return;
                                }
                                if (!/^\d{0,5}$/.test(text)) return;
                                const qtyVal = Number(text);
                                if (!Number.isFinite(qtyVal) || qtyVal < 0) return;
                                // Enforce max = quoted qty if available
                                const maxAllowed = quotedQty > 0 ? quotedQty : 10000;
                                if (qtyVal > maxAllowed) return;
                                formik.setFieldValue(
                                  "materials",
                                  formik.values.materials.map((v, i) =>
                                    i === idx ? { ...v, quantity: qtyVal } : v
                                  )
                                );
                              }}
                            />
                            {overUsed && <span className="im-field-error">Cannot exceed provided qty ({quotedQty})</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Material summary: Used / Requested / Remaining */}
                <div className="im-mat-summary">
                  <div className="im-mat-summary-title">Material Summary</div>
                  <div className="im-mat-summary-grid">
                    <div className="im-mat-summary-card im-mat-summary-used">
                      <span className="im-mat-summary-label">Total Used</span>
                      <span className="im-mat-summary-value">
                        {formik.values.materials.reduce((s, m) => s + (m.quantity || 0), 0)} units
                      </span>
                    </div>
                    <div className="im-mat-summary-card im-mat-summary-requested">
                      <span className="im-mat-summary-label">Additional Requested</span>
                      <span className="im-mat-summary-value">
                        {(formik.values.materialRequests || []).reduce((s, r) => s + (r.quantity || 0), 0)} units
                      </span>
                    </div>
                    <div className="im-mat-summary-card im-mat-summary-remaining">
                      <span className="im-mat-summary-label">Remaining from Provided</span>
                      <span className="im-mat-summary-value">
                        {formik.values.materials.reduce((s, m) => s + Math.max(0, (m.quotedQty || 0) - (m.quantity || 0)), 0)} units
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="im-mat-totalbar">
              <div className="im-mat-totalbar-label">
                <span>Total Material Cost</span>
                <small>(qty used × unit price)</small>
              </div>
              <span className="im-mat-totalbar-value">{formatPrice(materialTotal)}</span>
            </div>

            {/* Request Additional Material */}
            <div className="im-mat-request-section">
              {!showMaterialRequest ? (
                <button type="button" className="im-task-log-add-btn" onClick={() => setShowMaterialRequest(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Need More? Request Additional Material
                </button>
              ) : (
                <div className="im-task-log-form">
                  <h4 className="im-mat-request-title">Request Additional Material</h4>
                  <div className="im-mat-request-grid">
                    <div className="im-form-field">
                      <label>Material <span className="im-required">*</span></label>
                      <Dropdown
                        value={matReqProductId}
                        onChange={(val) => {
                          setMatReqProductId(val);
                          const selected = matReqProductOptions.find((o) => o.value === val);
                          if (selected) {
                            setMatReqName(selected.label);
                            setMatReqCategory(selected.category);
                            setMatReqBrand(selected.brand);
                          }
                        }}
                        options={matReqProductOptions}
                        variant="form"
                        placeholder="Select material"
                        emptyMessage="No products available"
                      />
                    </div>
                    <div className="im-form-field">
                      <label>Brand</label>
                      <Dropdown
                        value={matReqBrand}
                        onChange={(val) => setMatReqBrand(val)}
                        options={matReqBrandOptions}
                        variant="form"
                        placeholder="Select brand"
                        emptyMessage="No brands available"
                      />
                    </div>
                    <div className="im-form-field">
                      <label>Category</label>
                      <input type="text" value={matReqCategory} readOnly placeholder="Auto-filled from product" className="im-input-readonly" />
                    </div>
                    <div className="im-form-field">
                      <label>Quantity <span className="im-required">*</span></label>
                      <input type="number" min="1" max="10000" value={matReqQty} onChange={(e) => { const v = e.target.value; if (v === "") { setMatReqQty(""); return; } if (!/^\d{0,5}$/.test(v)) return; setMatReqQty(v); }} placeholder="0" />
                    </div>
                  </div>
                  <div className="im-form-field im-full-width">
                    <label>Reason</label>
                    <textarea value={matReqReason} onChange={(e) => setMatReqReason(e.target.value)} placeholder="Why is this material needed? (optional)" rows={2} maxLength={501} />
                  </div>
                  <div className="im-task-log-form-actions">
                    <button type="button" className="im-btn-sm im-btn-cancel" onClick={() => { setShowMaterialRequest(false); setMatReqProductId(""); setMatReqName(""); setMatReqCategory(""); setMatReqBrand(""); setMatReqQty(""); setMatReqReason(""); }}>Cancel</button>
                    <button type="button" className="im-btn-sm im-btn-change" onClick={handleAddMaterialRequest} disabled={!matReqName.trim() || !matReqQty || Number(matReqQty) < 1}>Submit Request</button>
                  </div>
                </div>
              )}
            </div>

            {/* Show pending material requests */}
            {formik.values.materialRequests && formik.values.materialRequests.length > 0 && (
              <div className="im-mat-request-list">
                <h4 className="im-mat-request-list-title">Material Requests ({formik.values.materialRequests.length})</h4>
                {formik.values.materialRequests.map((req, reqIdx) => (
                  <div key={reqIdx} className="im-mat-request-item">
                    <button
                      type="button"
                      className="im-task-log-remove"
                      onClick={() => handleRemoveMaterialRequest(reqIdx)}
                      title="Remove request"
                      disabled={req.status === "Sent" || req.status === "Approved"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                    <div className="im-mat-request-info">
                      <span className="im-mat-request-name">{req.productName}</span>
                      <div className="im-mat-request-meta">
                        {req.category && <span className="im-mat-cat">{req.category}</span>}
                        {req.brand && <span className="im-mat-cat">{req.brand}</span>}
                        <span className="im-mat-cat">Qty: {req.quantity}</span>
                        {req.price > 0 && <span className="im-mat-cat">Price: {formatPrice(req.price)}</span>}
                      </div>
                      {req.reason && <div className="im-mat-request-reason">Reason: {req.reason}</div>}
                      {req.quotationId && (
                        <div className="im-mat-request-quotation">
                          Added to Quotation: <strong>{req.quotationId}</strong>
                          <button
                            type="button"
                            className="im-btn-sm im-btn-change"
                            onClick={() => {
                              const url = `${window.location.origin}/quotation/respond/${req.quotationId}`;
                              navigator.clipboard.writeText(url);
                              showToastMsg("Quotation link copied! Customer will see this in their quotation.");
                            }}
                            title="Copy quotation link"
                          >Copy Link</button>
                        </div>
                      )}
                    </div>
                    <div className="im-mat-request-actions">
                      <span className={`im-badge ${req.status === "Approved" ? "im-badge-completed" : req.status === "Rejected" ? "im-badge-hold" : req.status === "Sent" ? "im-badge-scheduled" : "im-badge-pending"}`}>{req.status}</span>
                      {req.status === "Pending" && editingInstall?._id && (
                        <button
                          type="button"
                          className="im-btn-sm im-btn-change"
                          onClick={async () => {
                            try {
                              const reqData = formik.values.materialRequests[reqIdx];
                              const payload = {
                                productName: reqData.productName,
                                category: reqData.category || "",
                                brand: reqData.brand || "",
                                productId: reqData.productId || "",
                                quantity: reqData.quantity,
                                reason: reqData.reason || "",
                              };
                              const res = await installationAPI.submitMaterialRequest(editingInstall._id, payload);
                              const newReqs = [...formik.values.materialRequests];
                              newReqs[reqIdx] = {
                                ...newReqs[reqIdx],
                                status: res.data.data.status || "Pending",
                                quotationId: res.data.data.quotationId,
                                quotationMongoId: res.data.data.quotationMongoId,
                                price: res.data.data.price,
                              };
                              formik.setFieldValue("materialRequests", newReqs);
                              showToastMsg(res.data.message || "Material request added to quotation");
                            } catch (err) {
                              showToastMsg(err.response?.data?.message || "Failed to submit request", "error");
                            }
                          }}
                        >Send for Approval</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Send Remaining Products to Customer */}
          {editingInstall && editingInstall._id && (formik.values.materials || []).some((m) => (m.quotedQty || 0) > (m.quantity || 0)) && !editingInstall.remainingProductsQuotationId && (
            <div className="im-form-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e40af" }}>Send Remaining Products to Customer</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {(formik.values.materials || []).filter((m) => (m.quotedQty || 0) > (m.quantity || 0)).length} product(s) with unused quantity will be sent as a quotation for billing.
                  </div>
                </div>
                <button
                  type="button"
                  className="im-btn-sm im-btn-change"
                  onClick={async () => {
                    try {
                      const res = await installationAPI.sendRemainingProducts(editingInstall._id);
                      showToastMsg(res.data.message || "Remaining products sent to customer");
                      setEditingInstall({ ...editingInstall, remainingProductsQuotationId: res.data.data.quotationId });
                    } catch (err) {
                      showToastMsg(err.response?.data?.message || "Failed to send remaining products", "error");
                    }
                  }}
                >Send to Customer</button>
              </div>
            </div>
          )}
          {editingInstall && editingInstall.remainingProductsQuotationId && (
            <div className="im-form-section">
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                <span style={{ fontSize: 13, color: "#065f46", fontWeight: 600 }}>Remaining products quotation sent: <strong>{editingInstall.remainingProductsQuotationId}</strong></span>
                <button
                  type="button"
                  className="im-btn-sm im-btn-change"
                  onClick={() => {
                    const url = `${window.location.origin}/quotation/respond/${editingInstall.remainingProductsQuotationId}`;
                    navigator.clipboard.writeText(url);
                    showToastMsg("Link copied! Share it with the customer.");
                  }}
                >Copy Link</button>
              </div>
            </div>
          )}

          {/* Section 4: Installation Photos */}
          <div className="im-form-section">
            <div className="im-section-header">
              <span className="im-section-number">4</span>
              <h4>Installation Photo Upload</h4>
            </div>
            <div className="im-form-grid">
              <div className="im-form-field im-full-width">
                <label>Upload Installation Photos (JPG, JPEG, PNG) <span className="im-required">*</span></label>
                <div className="im-photos-grid">
                  {formik.values.sitePhotos.map((photo, idx) => {
                    const storedIndex = photo._origIndex != null ? photo._origIndex : idx;
                    return (
                      <div key={idx} className="im-photo-item">
                        {photo.file ? (
                          <LocalFilePreview file={photo.file} alt={photo.name} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                        ) : photo.hasFile && editingInstall?._id ? (
                          <StoredInstallPhoto installId={editingInstall._id} photo={photo} index={storedIndex} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                        ) : (
                          <div className="im-photo-preview">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                        )}
                        <span className="im-photo-name">{photo.name}</span>
                        {photo.hasFile && editingInstall?._id && (
                          <button type="button" className="im-photo-download" onClick={() => downloadInstallPhoto(editingInstall, photo, storedIndex)} title="Download photo">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        )}
                        <button type="button" className="im-photo-replace" onClick={() => { setReplacePhotoIndex(idx); photoInputRef.current?.click(); }} title="Replace">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                          </svg>
                        </button>
                        <button type="button" className="im-photo-remove" onClick={() => formik.setFieldValue("sitePhotos", formik.values.sitePhotos.filter((_, i) => i !== idx))}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                  <div className="im-photo-add" onClick={() => { setReplacePhotoIndex(null); photoInputRef.current?.click(); }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Photo</span>
                  </div>
                </div>
                <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png" multiple style={{ display: "none" }} onChange={handlePhotoUpload} />
                {formik.errors.sitePhotos && formik.touched.sitePhotos && <span className="im-field-error">{formik.errors.sitePhotos}</span>}
              </div>
            </div>
          </div>

          {/* Section 6: Completion Verification */}
          <div className="im-form-section">
            <div className="im-section-header">
              <span className="im-section-number">5</span>
              <h4>Completion Verification</h4>
            </div>
            <div className="im-form-grid">
              <div className="im-form-field">
                <label>Verification Status <span className="im-required">*</span></label>
                <Dropdown value={formik.values.verificationStatus} onChange={(val) => formik.setFieldValue("verificationStatus", val)} options={VERIFICATION_STATUSES.map((st) => ({ value: st, label: st }))} variant="form" />
                {formik.errors.verificationStatus && formik.touched.verificationStatus && <span className="im-field-error">{formik.errors.verificationStatus}</span>}
              </div>
              <div className="im-form-field">
                <label>Verification Notes</label>
                <textarea name="verificationNotes" value={formik.values.verificationNotes} onChange={formik.handleChange} placeholder="Enter verification notes" rows={2} maxLength={201} className={(formik.values.verificationNotes || "").length > 200 ? "im-input-error" : ""} />
                {(formik.values.verificationNotes || "").length > 200 && <span className="im-field-error">Verification notes cannot exceed 200 characters</span>}
              </div>
            </div>
          </div>

          <div className="im-form-page-footer">
            <button type="button" className="im-btn im-btn-cancel" onClick={() => setShowFormPage(false)} disabled={loading || formik.isSubmitting}>Cancel</button>
            {!editingInstall && <button type="button" className="im-btn im-btn-secondary" onClick={saveInstallationDraft} disabled={formik.isSubmitting}>Save Draft</button>}
            <button type="submit" className="im-btn im-btn-primary" disabled={loading || formik.isSubmitting || !formik.isValid}>
              {loading || formik.isSubmitting ? <><span className="im-spinner"></span> {editingInstall ? "Updating..." : "Saving..."}</> : <>{editingInstall ? "Update Installation" : "Save Installation"}</>}
            </button>
          </div>
        </form>
    </div>
  );

  const renderViewModal = () => {
    if (!selectedInstall) return null;
    const d = selectedInstall;
    const materialsCount = d.materials ? d.materials.filter((m) => (typeof m === "object" ? m.status === "Available" : m === "Available")).length : 0;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>Installation Details — {d.id}</h3></div>
            <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="im-view-grid-2">
              <div className="im-view-card">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> Schedule</h4>
                <span className="im-view-card-value">{formatInstallDate(d.installationDate) || "Not scheduled"} {d.installationTime}</span>
              </div>
              <div className="im-view-card im-vc-tech">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Technician</h4>
                <span className="im-view-card-value">{d.technicianName || "Not assigned"}</span>
              </div>
              <div className="im-view-card im-vc-checklist">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg> Tasks</h4>
                <span className="im-view-card-value">{d.tasks ? d.tasks.filter((t) => t.status === "Completed").length : 0}/{d.tasks ? d.tasks.length : 0} completed</span>
              </div>
              <div className="im-view-card im-vc-materials">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg> Materials</h4>
                <span className="im-view-card-value">{materialsCount}/{d.materials ? d.materials.length : 0} available</span>
              </div>
            </div>

            <div className="im-view-info-grid">
              <div className="im-view-info-item"><span className="im-view-label">Installation ID</span><span className="im-view-value">{d.id}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Customer Name</span><span className="im-view-value">{d.customerName}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Lead ID</span><span className="im-view-value">{d.leadId}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Address</span><span className="im-view-value">{d.installationAddress}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Status</span><span className={`im-badge ${getStatusClass(d.installationStatus)}`}>{d.installationStatus}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Verification</span><span className={`im-badge ${getVerificationClass(d.verificationStatus)}`}>{d.verificationStatus}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Technician ID</span><span className="im-view-value">{d.technicianId || "—"}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Notes</span><span className="im-view-value">{d.notes || "—"}</span></div>
            </div>

            {d.materials && d.materials.length > 0 && (
              <div className="im-view-materials-section">
                <h4>Materials ({d.materials.length})</h4>
                <div className="im-view-materials">
                  {d.materials.map((m, i) => {
                    const isObj = typeof m === "object";
                    const name = isObj ? m.productName : MATERIAL_CHECKLIST_ITEMS[i];
                    const status = isObj ? m.status : m;
                    const qty = isObj && typeof m.quantity === "number" ? m.quantity : 0;
                    return (
                      <div key={i} className="im-view-material-item">
                        <span className="im-view-material-name">{name}</span>
                        {isObj && (m.brand || m.vendorName) && (
                          <span className="im-view-material-cat">{[m.brand, m.vendorName].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ")}</span>
                        )}
                        {isObj && m.category && <span className="im-view-material-cat">{m.category}</span>}
                        {isObj && typeof m.price === "number" && <span className="im-view-material-price" title="Price per unit (1 qty)">{formatPrice(m.price)} / unit</span>}
                        {qty > 0 && <span className="im-view-material-qty">Qty: {qty}</span>}
                        <span className={`im-badge ${status === "Available" ? "im-badge-verified" : "im-badge-unverified"}`}>{status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {d.tasks && d.tasks.length > 0 && (
              <div className="im-view-materials-section">
                <h4>Tasks ({d.tasks.length})</h4>
                <div className="im-task-list">
                  {d.tasks.map((task, i) => (
                    <div key={i} className={`im-task-card im-task-${(task.status || "to-do").replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="im-task-card-header">
                        <div className="im-task-card-title">
                          <span className="im-task-number">{i + 1}</span>
                          <span className="im-task-name">{task.name}</span>
                        </div>
                        <span className={`im-badge ${task.status === "Completed" ? "im-badge-completed" : task.status === "In Progress" ? "im-badge-progress" : "im-badge-pending"}`}>{task.status}</span>
                      </div>
                      {task.dailyLogs && task.dailyLogs.length > 0 && (
                        <div className="im-task-logs">
                          <div className="im-task-logs-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span>Progress Logs ({task.dailyLogs.length})</span>
                          </div>
                          <div className="im-task-log-list">
                            {task.dailyLogs.map((log, j) => (
                              <div key={j} className="im-task-log-entry">
                                <div className="im-task-log-date">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                  {formatInstallDate(log.date)}
                                </div>
                                <div className="im-task-log-desc">{log.description}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.materialRequests && d.materialRequests.length > 0 && (
              <div className="im-view-materials-section">
                <h4>Material Requests ({d.materialRequests.length})</h4>
                <div className="im-mat-request-list">
                  {d.materialRequests.map((req, i) => (
                    <div key={i} className="im-mat-request-item">
                      <div className="im-mat-request-info">
                        <span className="im-mat-request-name">{req.productName}</span>
                        <div className="im-mat-request-meta">
                          {req.category && <span className="im-mat-cat">{req.category}</span>}
                          {req.brand && <span className="im-mat-cat">{req.brand}</span>}
                          <span className="im-mat-cat">Qty: {req.quantity}</span>
                        </div>
                        {req.reason && <div className="im-mat-request-reason">Reason: {req.reason}</div>}
                      </div>
                      <span className={`im-badge ${req.status === "Approved" ? "im-badge-completed" : req.status === "Rejected" ? "im-badge-hold" : "im-badge-pending"}`}>{req.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.verificationNotes && (
              <div className="im-view-notes-section">
                <h4>Verification Notes</h4>
                <p>{d.verificationNotes}</p>
              </div>
            )}

            {d.sitePhotos && d.sitePhotos.length > 0 && (
              <div className="im-view-photos-section">
                <h4>Installation Photos ({d.sitePhotos.length})</h4>
                <div className="im-view-photos">
                  {d.sitePhotos.map((p, i) => (
                    <div key={i} className="im-view-photo-card">
                      {d._id && p.hasFile ? (
                        <StoredInstallPhoto installId={d._id} photo={p} index={i} onZoom={(src, alt) => setZoomImage({ src, alt })} />
                      ) : (
                        <div className="im-view-photo-placeholder">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                          </svg>
                        </div>
                      )}
                      <span className="im-view-photo-name">{p.name}</span>
                      {d._id && p.hasFile && (
                        <button
                          type="button"
                          className="im-view-photo-download"
                          onClick={() => downloadInstallPhoto(d, p, i)}
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
              </div>
            )}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowViewModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const getApprovalBadgeClass = (status) => {
    switch (status) {
      case "Approved": return "im-badge im-badge-completed";
      case "Rejected": return "im-badge im-badge-hold";
      case "Under Review": return "im-badge im-badge-progress";
      case "Pending": return "im-badge im-badge-pending";
      default: return "im-badge";
    }
  };

  const renderApprovalModal = () => {
    if (!approvalDetails) {
      return (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Project Approval Details</h3></div>
              <button className="vm-modal-close" onClick={() => setShowApprovalModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="vm-view-body">
              <PageLoader minHeight="200px" />
            </div>
          </div>
        </div>
      );
    }
    const a = approvalDetails;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>Project Approval Details — {a.approvalId || a.id || a._id}</h3></div>
            <button className="vm-modal-close" onClick={() => setShowApprovalModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="im-view-grid-2">
              <div className="im-view-card">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg> Status</h4>
                <span className={`im-badge ${getApprovalBadgeClass(a.status)}`}>{a.status || "—"}</span>
              </div>
              <div className="im-view-card">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg> Est. Cost</h4>
                <span className="im-view-card-value">{formatPrice(a.estimatedCost)}</span>
              </div>
              <div className="im-view-card">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg> Capacity</h4>
                <span className="im-view-card-value">{a.capacity ? `${a.capacity} kW` : "—"}</span>
              </div>
              <div className="im-view-card">
                <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> Submitted</h4>
                <span className="im-view-card-value">{formatInstallDate(a.submittedDate) || "—"}</span>
              </div>
            </div>

            <div className="im-view-info-grid">
              <div className="im-view-info-item"><span className="im-view-label">Approval ID</span><span className="im-view-value">{a.approvalId || a.id || a._id}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Design ID</span><span className="im-view-value">{a.designId || "—"}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Project Name</span><span className="im-view-value">{a.projectName || "—"}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Customer</span><span className="im-view-value">{a.customerName || "—"}</span></div>
              <div className="im-view-info-item"><span className="im-view-label">Lead ID</span><span className="im-view-value">{a.leadId || "—"}</span></div>
            </div>

            {a.comments && (
              <div className="im-view-notes-section">
                <h4>Comments</h4>
                <p>{a.comments}</p>
              </div>
            )}
          </div>          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowApprovalModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };




  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="installation-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="im-page">


      {showFormPage ? renderFormPage() : (
        <>
      {/* Page Header */}
      <div className="im-header">
        <div>
          <h1 className="im-title">Installation Management</h1>
          <p className="im-subtitle">Schedule installations, assign technicians, track progress, and manage material checklists.</p>
        </div>
        <div className="im-header-actions">
          {canDo("installations", "create") && (
          <button className="im-btn im-btn-primary" onClick={() => openFormPage()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Installation
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="im-stats-grid">
        <StatCard
          title="Total Installations"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>}
          color="blue"
        />
        <StatCard
          title="Pending"
          value={stats.pending.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="orange"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
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
      <div className="im-toolbar">
        <div className="im-toolbar-row">
          <div className="im-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by ID, Customer, Lead ID, or Technician" />
            {search && (
              <button className="im-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Status" }, ...INSTALL_STATUSES.map((st) => ({ value: st, label: st }))]} />
          <Dropdown value={verificationFilter} onChange={(val) => { setVerificationFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Verification" }, ...VERIFICATION_STATUSES.map((st) => ({ value: st, label: st }))]} />
          <Dropdown value={technicianFilter} onChange={(val) => { setTechnicianFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Technician" }, ...namedTechnicians.map((t) => ({ value: t.name, label: t.name }))]} />
          <input type="date" className="im-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
          <input type="date" className="im-inline-date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />

        </div>
      </div>

      {/* Table */}
      <div className="im-table-card">
        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                <th>Installation ID</th>
                <th>Customer Name</th>
                <th>Project Name</th>
                <th>Lead ID</th>
                <th>Installation Date</th>
                <th>Technician</th>
                <th>Installation Status</th>
                <th>Verification Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={8} />
              ) : installations.length === 0 ? (
                <tr>
                  <td colSpan="8" className="im-empty">
                    <div className="im-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                        <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                      </svg>
                      <p>No installations found</p>
                      <span>Try adjusting your search or filter criteria, or create a new installation.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                installations.map((inst) => (
                  <tr key={inst.id}>
                    <td className="im-td-id">{inst.id}</td>
                    <td className="im-td-name">{inst.customerName}</td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }} title={inst.projectName || ""}>{inst.projectName || "—"}</td>
                    <td>
                      <button className="im-approval-link" onClick={() => openApprovalModal(inst)} title="View project approval details">{inst.leadId || "—"}</button>
                    </td>
                    <td>{formatInstallDate(inst.installationDate) || "—"}</td>
                    <td>{inst.technicianName || <span className="im-unassigned">Unassigned</span>}</td>
                    <td>
                      {canDo("installations", "edit") ? (
                        <Dropdown
                          value={inst.installationStatus}
                          onChange={(val) => handleInlineStatusChange(inst, val)}
                          options={INSTALL_STATUSES.map((s) => ({ value: s, label: s }))}
                          variant="inline"
                          size="sm"
                          className={`im-inline-status im-inline-${inst.installationStatus?.toLowerCase().replace(/\s+/g, "-")}`}
                          disabled={inlineStatusUpdating === (inst.serverId || inst._id || inst.id)}
                          placeholder={inst.installationStatus}
                        />
                      ) : (
                        <span className={`im-badge ${getStatusClass(inst.installationStatus)}`}>{inst.installationStatus}</span>
                      )}
                    </td>
                    <td><span className={`im-badge ${getVerificationClass(inst.verificationStatus)}`}>{inst.verificationStatus}</span></td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" onClick={() => openViewModal(inst)} title="View Details">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <ActivityLogButton
                          module="installations"
                          onClick={() => {
                            const instId = inst.serverId || inst._id || inst.id;
                            navigate(`/admin/installation-activity/${instId}`, {
                              state: { target: { recordId: instId, recordLabel: inst.installationId || inst.customerName, module: "installations" } },
                            });
                          }}
                          title="View Installation Activity Log"
                        />
                        {canDo("installations", "edit") && (
                        <button className="act-btn act-edit" onClick={() => openFormPage(inst)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        )}
                        {canDo("installations", "delete") && (
                        <button className="act-btn act-delete" onClick={() => confirmDelete(inst)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                        )}
                        {canDo("testing", "create") && inst.leadId && (
                          <button
                            className={`im-testing-btn${inst.installationStatus === "Completed" && !testedLeadIds.includes(inst.leadId) ? "" : " im-testing-btn-disabled"}`}
                            title={
                              testedLeadIds.includes(inst.leadId) ? "A testing record already exists for this lead"
                              : inst.installationStatus === "Completed"
                                ? "Create a testing record for this installation"
                                : "Complete this installation first to create a testing record"
                            }
                            onClick={() => inst.installationStatus === "Completed" && !testedLeadIds.includes(inst.leadId) && handleCreateTesting(inst)}
                            disabled={inst.installationStatus !== "Completed" || testedLeadIds.includes(inst.leadId)}
                          >
                            Create Testing
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

        {serverTotal > 0 && (
          <div className="im-pagination-row">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={serverTotal}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {showViewModal && renderViewModal()}
      {showApprovalModal && renderApprovalModal()}
      {zoomImage && (
        <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />
      )}
        </>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Installation"
        message={`Are you sure you want to delete installation ${deleteTarget?.id} for ${deleteTarget?.customerName}?`}
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
                  {showLogModal.installationId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Status</span>
                    <span className={`cm-status-badge cm-status-${(showLogModal.status || "").toLowerCase().replace(" ", "")}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.status || "Pending"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Scheduled Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.scheduledDate ? new Date(showLogModal.scheduledDate).toLocaleDateString("en-IN") : "—"}
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
                  Installation Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customerName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Lead Reference ID</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.leadId || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Technician / Engineer</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.technicianName || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Electrical Verification</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.electricalVerification || "—"}</div>
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
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadInstallLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
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

export default InstallationManagement;