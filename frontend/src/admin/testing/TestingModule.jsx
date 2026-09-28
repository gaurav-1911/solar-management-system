import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { testingSchema } from "../../utils/AdminValidation";
import { testingAPI, installationAPI, commissioningAPI, projectApprovalAPI } from "../../services";
import { createProfilePdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import { compressImageFile } from "../../utils/imageCompress";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast, Dropdown, Pagination, ImageLightbox, SelectWithOther } from "../../components/common";
import "./TestingModule.css";

const normalizeTest = (doc) => ({
  ...doc,
  id: doc.testId || doc.id || doc._id,
  inverterTest: doc.inverterTest || {},
  earthingTest: doc.earthingTest || {},
  insulationTest: doc.insulationTest || {},
  voltageTest: doc.voltageTest || {},
  currentTest: doc.currentTest || {},
  performance: doc.performance || {},
  safety: doc.safety || {},
  finalInspection: doc.finalInspection || {},
  params: doc.params || {},
});


const fileDisplayName = (f) =>
  f && typeof f === "object" ? f.name || f.originalName || "Unnamed file" : String(f || "");

const isPdfDoc = (f) => {
  const name = fileDisplayName(f);
  return /\.pdf$/i.test(name) || (f && f.mimeType === "application/pdf");
};

/* ── Preview a newly picked local doc (image / PDF via object URL) ── */
function LocalTestDoc({ file, onZoom }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return <div className="tm-preview-loading" />;
  if (isPdfDoc({ name: file.name, mimeType: file.type })) {
    return <iframe src={src} title={file.name} className="tm-doc-preview tm-doc-preview-pdf" />;
  }
  return (
    <img
      src={src}
      alt={file.name}
      className="tm-doc-preview tm-doc-preview-img"
      onClick={onZoom ? () => onZoom(src, file.name) : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

/* ── In-memory cache for stored file previews ──
   Every modal open used to re-download every stored doc/photo from MongoDB
   (each ~1-2s). Cache each file's blob URL per test record so repeated
   view/edit opens are instant. Cleared after create/update/delete so edits
   never show stale files. */
const testFileCache = new Map();

const getCachedTestFile = (key) => testFileCache.get(key) || null;

const setCachedTestFile = (key, url) => {
  if (testFileCache.has(key)) URL.revokeObjectURL(testFileCache.get(key));
  testFileCache.set(key, url);
  return url;
};

const clearTestFileCache = (testId) => {
  if (!testId) return;
  const prefix = `${testId}:`;
  for (const key of [...testFileCache.keys()]) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(testFileCache.get(key));
      testFileCache.delete(key);
    }
  }
};

/* ── Fetch + preview a stored test document from the database ── */
function StoredTestDoc({ testId, doc, index, onZoom }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!testId || !doc || !doc.hasFile) {
      setSrc("");
      return undefined;
    }
    const cacheKey = `${testId}:doc:${index}`;
    const cached = getCachedTestFile(cacheKey);
    if (cached) {
      setSrc(cached);
      return undefined;
    }
    testingAPI
      .downloadDoc(testId, index)
      .then((res) => {
        if (cancelled) return;
        setSrc(setCachedTestFile(cacheKey, URL.createObjectURL(res.data)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, doc, index]);
  if (failed) {
    return <div className="tm-preview-error">Failed to load document</div>;
  }
  if (!src) return <div className="tm-preview-loading" />;
  if (isPdfDoc(doc)) {
    return <iframe src={src} title={fileDisplayName(doc)} className="tm-doc-preview tm-doc-preview-pdf" />;
  }
  return (
    <img
      src={src}
      alt={fileDisplayName(doc)}
      className="tm-doc-preview tm-doc-preview-img"
      onClick={onZoom ? () => onZoom(src, fileDisplayName(doc)) : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

/* ── Preview a newly picked local photo (object URL) ── */
function LocalTestPhoto({ file, onZoom }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return <div className="tm-photo-preview-loading" />;
  return (
    <img
      src={src}
      alt={file.name}
      className="tm-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, file.name) : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

/* ── Fetch + preview a stored test photo from the database ── */
function StoredTestPhoto({ testId, photo, index, onZoom }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!testId || !photo || !photo.hasFile) {
      setSrc("");
      return undefined;
    }
    const cacheKey = `${testId}:photo:${index}`;
    const cached = getCachedTestFile(cacheKey);
    if (cached) {
      setSrc(cached);
      return undefined;
    }
    testingAPI
      .downloadPhoto(testId, index)
      .then((res) => {
        if (cancelled) return;
        setSrc(setCachedTestFile(cacheKey, URL.createObjectURL(res.data)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, photo, index]);
  if (failed) {
    return (
      <div className="tm-photo-preview-error" title="Failed to load photo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  if (!src) return <div className="tm-photo-preview-loading" />;
  return (
    <img
      src={src}
      alt={fileDisplayName(photo)}
      className="tm-photo-preview-img"
      onClick={onZoom ? () => onZoom(src, fileDisplayName(photo)) : undefined}
      title={onZoom ? "Click to view full size" : undefined}
    />
  );
}

// New test records store multiple strings in `stringTests` (an array). Older
// records only have a single `stringTest` object — normalize both to an array
// so every screen can render them uniformly.
const toStringTests = (test) => {
  // Prefer the array whenever it exists — even an intentionally emptied one —
  // so deleting all strings never resurrects stale legacy data.
  if (Array.isArray(test?.stringTests)) return test.stringTests;
  if (test?.stringTest && typeof test.stringTest === "object" && !Array.isArray(test.stringTest)) {
    return [test.stringTest];
  }
  return [];
};

const formatTestDate = (date) => {
  if (!date) return "";
  const yyyy = String(date).slice(0, 4);
  const mm = String(date).slice(5, 7);
  const dd = String(date).slice(8, 10);
  return `${dd}/${mm}/${yyyy}`;
};

const formatTestDateInput = (date) => {
  if (!date) return "";
  return String(date).slice(0, 10);
};

// eslint-disable-next-line no-unused-vars
const COLORS = ["#16a34a", "#dc2626", "#ca8a04", "#2563eb", "#9333ea", "#2c5364"];
const PAGE_SIZES = [10, 20, 50, 100];

const TEST_RESULTS = ["Pass", "Fail"];
const TESTING_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];
// ── Select dropdown option lists (each gets an "Other" option for custom entry) ──
const STRING_NUMBERS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];
const STRING_STATUSES = ["Pass", "Fail"];
const INVERTER_MODELS = ["Huawei", "Growatt", "Sungrow", "Solis", "GoodWe", "Fronius", "ABB", "Delta", "SMA", "Waaree"];
const INVERTER_STATUSES = ["Pass", "Fail"];
const EARTHING_RESULTS = ["Pass", "Fail"];
const EARTHING_RESISTANCES = ["0.5", "1", "1.5", "2", "2.5", "3", "5"];
const INSULATION_VALUES = ["100", "200", "300", "500", "750", "1000"];
const VOLTAGE_VALUES = ["220", "230", "240", "380", "400", "415", "440"];
const CURRENT_VALUES = ["5", "8", "10", "12", "15", "20", "25", "30", "40", "50"];
const PERFORMANCE_STATUSES = ["Verified", "Not Verified"];
const SAFETY_STATUSES = ["Compliant", "Not Compliant"];
const INSPECTION_STATUSES = ["Approved", "Rejected"];
const REMARKS_OPTIONS = [
  "All Parameters OK",
  "Testing Completed",
  "Voltage Stable",
  "Current Stable",
  "Earthing OK",
  "Insulation Passed",
  "Panel Cleaning Done",
  "Shading Checked",
  "Wiring Checked",
  "Grid Connection OK",
  "Recheck Required",
  "Cleaning Required",
  "Retest Scheduled",
  "Documentation Pending",
  "Customer Signature Pending",
];
const INSULATION_STATUSES = ["Pass", "Fail"];
const VOLTAGE_STATUSES = ["Pass", "Fail"];
const CURRENT_STATUSES = ["Pass", "Fail"];


const initialFormData = {
  customerName: "",
  projectName: "",
  leadId: "",
  installationId: "",
  testDate: new Date().toISOString().split("T")[0],
  engineerName: "",
  status: "Scheduled",
  testResult: "Pass",
  remarks: "",
  stringTests: [{ stringNumber: "S1", status: "Pass", remarks: "" }],
  inverterTest: { model: "", status: "Pass", remarks: "" },
  earthingTest: { result: "Pass", resistance: "", remarks: "" },
  insulationTest: { value: "", status: "Pass" },
  voltageTest: { value: "", status: "Pass" },
  currentTest: { value: "", status: "Pass" },
  performance: { status: "Verified", remarks: "" },
  safety: { status: "Compliant", remarks: "" },
  finalInspection: { status: "Approved", remarks: "" },
  params: { voc: "", isc: "", acVoltage: "", frequency: "", earthing: "", inverterEff: "", pr: "" },
  docs: [],
  photos: [],
  isDraft: false,
};

const TestingModule = () => {
  // eslint-disable-next-line no-unused-vars
  const { success, error: toastError, warning, info } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { canDo } = useAuth();
  const [tests, setTests] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [inspectionFilter, setInspectionFilter] = useState("All");
  const [engineerFilter, setEngineerFilter] = useState("All");
  const [draftFilter, setDraftFilter] = useState("All");
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
  const [editingTest, setEditingTest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Lead IDs that already have a commissioning record — used to disable the
  // "Create Commissioning" button so duplicate records cannot be created.
  const [commissionedLeadIds, setCommissionedLeadIds] = useState([]);
  // Installation details shown when the Installation ID is clicked in the table.
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installDetails, setInstallDetails] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);
  const [installations, setInstallations] = useState([]);
  const [projectApprovals, setProjectApprovals] = useState([]);

  // eslint-disable-next-line no-unused-vars

  // Pre-fill target captured from the Project Approval / Installation tables
  // (?createForLead=L-XXX) — opens the new-test form automatically.
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  // Set once the form's dropdown data (installations) has loaded, so the
  // pre-fill effect only runs when the Lead dropdown can reflect the value.
  const [formDataReady, setFormDataReady] = useState(false);
  // Lead pre-selected from another module — kept in state (not formik) so the
  // dropdown below can reference it before the formik object is created.
  const [prefillLeadId, setPrefillLeadId] = useState("");
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);

  const anyModalOpen = showViewModal || showDeleteDialog;

  // Fetch all tests (for stats cards, engineer dropdown, testedLeadIds, etc.)
  useEffect(() => {
    let cancelled = false;
    testingAPI.getAll({ page: 1, limit: 1000 })
      .then((res) => {
        const docs = res.data?.data || [];
        if (!cancelled) setTests(docs.map(normalizeTest));
      })
      .catch((err) => console.warn("Failed to load tests:", err?.message));
    return () => { cancelled = true; };
  }, []);

  // Load which leads already have a commissioning record so the
  // "Create Commissioning" button can be disabled for those rows.
  useEffect(() => {
    commissioningAPI.getStats().then((res) => {
      if (res.data?.data?.recordedLeadIds) {
        setCommissionedLeadIds(res.data.data.recordedLeadIds);
      }
    }).catch(() => {});
  }, []);

  // Load installations and project approvals for lead dropdown filtering
  useEffect(() => {
    let cancelled = false;
    const loadFormData = async () => {
      try {
        const [installRes, approvalRes] = await Promise.all([
          installationAPI.getAll({ page: 1, limit: 100 }),
          projectApprovalAPI.getAll({ page: 1, limit: 100 }),
        ]);
        if (cancelled) return;
        setInstallations(installRes.data?.data || []);
        setProjectApprovals(approvalRes.data?.data || []);
      } catch (err) {
        console.warn("Failed to load form data:", err?.message);
      } finally {
        if (!cancelled) setFormDataReady(true);
      }
    };
    loadFormData();
    return () => { cancelled = true; };
  }, []);

  // Leads that already have a test record — hidden from the "New Test"
  // form so a lead can't be tested twice. In edit mode the lead of the
  // record being edited stays visible so it can be saved unchanged.
  const testedLeadIds = useMemo(
    () => new Set((tests || []).map((t) => t.leadId).filter(Boolean)),
    [tests]
  );

  // Map leadId -> projectName from project approvals (for table display)
  const projectNameByLead = useMemo(() => {
    const map = {};
    (projectApprovals || []).forEach((a) => {
      if (a.leadId && a.projectName) map[a.leadId] = a.projectName;
    });
    return map;
  }, [projectApprovals]);

  // Project options - show completed installations that haven't been tested yet
  // Project name comes from project approvals via projectNameByLead map
  const projectOptions = useMemo(() => {
    const seen = new Set();
    const options = (installations || [])
      .filter((i) => i.leadId && String(i.installationStatus || "").toLowerCase() === "completed")
      .filter((i) => !testedLeadIds.has(i.leadId) || i.leadId === editingTest?.leadId)
      .sort((a, b) => (projectNameByLead[a.leadId] || "").localeCompare(projectNameByLead[b.leadId] || ""))
      .filter((i) => {
        if (seen.has(i.leadId)) return false;
        seen.add(i.leadId);
        return true;
      })
      .map((i) => ({ value: i.leadId, label: projectNameByLead[i.leadId] || i.customerName || i.leadId }));
    // In edit mode, the project being edited must always appear in the
    // dropdown even if it no longer passes the install filters.
    if (editingTest?.leadId && !seen.has(editingTest.leadId)) {
      const editLabel = projectNameByLead[editingTest.leadId] || editingTest.customerName || editingTest.leadId;
      options.unshift({
        value: editingTest.leadId,
        label: editLabel,
      });
      seen.add(editingTest.leadId);
    }
    // A lead pre-selected from the Installation tables must
    // stay selectable even if it isn't in the fetched list.
    if (prefillLeadId && !seen.has(prefillLeadId)) {
      const label = (projectApprovals || []).find((a) => a.leadId === prefillLeadId)?.projectName || prefillLeadId;
      options.unshift({ value: prefillLeadId, label });
    }
    return options;
  }, [installations, testedLeadIds, projectNameByLead, editingTest?.leadId, prefillLeadId]);

  // Handle project selection - auto-fetch customer name, project name, installation ID, and technician
  const handleProjectSelect = (leadId) => {
    formik.setFieldValue("leadId", leadId);
    if (!leadId) {
      formik.setFieldValue("customerName", "");
      formik.setFieldValue("projectName", "");
      formik.setFieldValue("installationId", "");
      formik.setFieldValue("engineerName", "");
      return;
    }
    const installation = (installations || []).find((i) => i.leadId === leadId);
    if (installation) {
      formik.setFieldValue("customerName", installation.customerName || "");
      formik.setFieldValue("projectName", projectNameByLead[leadId] || "");
      formik.setFieldValue("installationId", installation.installationId || "");
      formik.setFieldValue("engineerName", installation.technicianName || "");
      // Load materials directly from the installation record
      const instMats = (installation.materials || []).map((m) => ({
        productId: m.productId || "",
        productName: m.productName || "",
        category: m.category || "",
        brand: m.brand || "",
        price: typeof m.price === "number" ? m.price : null,
        stock: typeof m.stock === "number" ? m.stock : 0,
        quantity: Math.max(0, Number(m.quantity) || 0),
        quotedQty: Math.max(0, Number(m.quotedQty) || Number(m.quantity) || 0),
        status: m.status || "Available",
      }));
      formik.setFieldValue("materials", instMats);
    }
    // Fallback: if installation has no materials, try loading from quotation
const loadQuotationMaterials = async () => {
  try {
    const quoteRes = await quotationAPI.getAll({
      page: 1,
      limit: 100,
    });

    const quote = (quoteRes.data?.data || []).find(
      (q) => String(q.leadId) === String(leadId)
    );

    if (quote && quote.items && Object.keys(quote.items).length > 0) {
      const items =
        quote.items instanceof Map
          ? Object.fromEntries(quote.items)
          : quote.items || {};

      const productRes = await fetch(
        `${
          process.env.REACT_APP_API_URL || "http://localhost:5000/api"
        }/products?page=1&limit=10000`
      );

      if (!productRes.ok) {
        throw new Error(`Failed to fetch products: ${productRes.status}`);
      }

      const productData = await productRes.json();
      const allProducts = productData?.data || [];

      const mats = Object.entries(items)
        .map(([k, item]) => {
          if (!item || Number(item.qty) <= 0) {
            return null;
          }

          const p = allProducts.find(
            (x) =>
              String(x._id) === String(k) ||
              (x.productId && String(x.productId) === String(k))
          );

          if (!p) {
            return null;
          }

          const qty = Math.max(
            1,
            Math.floor(Number(item.qty)) || 1
          );

          return {
            productId: p.productId || p._id || "",
            productName: p.name || "",
            category: p.category || "",
            brand: p.brand || "",
            price:
              typeof item.price === "number"
                ? item.price
                : typeof p.price === "number"
                  ? p.price
                  : null,
            stock:
              typeof p.stock === "number"
                ? p.stock
                : 0,
            quantity: qty,
            quotedQty: qty,
            status: "Available",
          };
        })
        .filter(Boolean);

      if (
        mats.length > 0 &&
        (!formik.values.materials ||
          formik.values.materials.length === 0)
      ) {
        formik.setFieldValue("materials", mats);
      }
    } else if (
      !formik.values.materials ||
      formik.values.materials.length === 0
    ) {
      formik.setFieldValue("materials", []);
    }
  } catch (err) {
    console.warn(
      "Failed to load quotation materials:",
      err?.message || err
    );

    formik.setFieldValue("materials", []);
  }
};
  };

  const formik = useFormik({
    initialValues: { ...initialFormData },
    validationSchema: testingSchema,
    onSubmit: async (values) => {
      const subStatuses = [
        ...(Array.isArray(values.stringTests)
          ? values.stringTests.map((s) => s?.status).filter(Boolean)
          : []),
        values.inverterTest.status,
        values.earthingTest.result,
        values.insulationTest.status,
        values.voltageTest.status,
        values.currentTest.status,
      ];
      const electricalTest = subStatuses.includes("Fail") ? "Fail" : "Pass";

      const payload = {
        ...values,
        customerName: values.customerName.trim(),
        remarks: values.remarks.trim(),
        isDraft: false,
        electricalTest,
        // Keep only filled string rows (the old single-object stringTest is no
        // longer sent — multiple strings are stored in the stringTests array).
        stringTests: (Array.isArray(values.stringTests) ? values.stringTests : [])
          .filter((s) => s && String(s.stringNumber || "").trim())
          .map((s) => ({
            stringNumber: String(s.stringNumber || "").trim(),
            status: s.status || "Pass",
            remarks: (s.remarks || "").trim(),
          })),
      };

      // Show the saving state early — file compression can take a moment and
      // the button must stay disabled while the files are being prepared.
      setLoading(true);

      let submitData;
      if (editingTest && !editingTest._id) {
        submitData = {
          ...payload,
          docs: values.docs.map((d) => (typeof d === "object" && d ? d.name : d)),
          photos: values.photos.map((p) => (typeof p === "object" && p ? p.name : p)),
        };
      } else {
        submitData = new FormData();
        // Structured fields travel as a single "data" JSON field — the route's
        // parseMultipartBody expands it back into req.body for Joi validation.
        const { docs, photos, ...rest } = payload;
        submitData.append("data", JSON.stringify(rest));
        const keptDocs = (docs || []).filter((d) => !(d && d.file));
        const newDocs = (docs || []).filter((d) => d && d.file);
        submitData.append("docsKeep", JSON.stringify(keptDocs.map((d) => d._origIndex)));
        // Large photos are compressed client-side before upload so saving is
        // several times faster; PDFs and small images pass through untouched.
        // All files are compressed in parallel so multiple uploads don't wait
        // for each other's compression to finish.
        const compressedDocs = await Promise.all(
          newDocs.map((d) => compressImageFile(d.file))
        );
        for (const f of compressedDocs) {
          submitData.append("docs", f);
        }
        const keptPhotos = (photos || []).filter((p) => !(p && p.file));
        const newPhotos = (photos || []).filter((p) => p && p.file);
        submitData.append("photosKeep", JSON.stringify(keptPhotos.map((p) => p._origIndex)));
        const compressedPhotos = await Promise.all(
          newPhotos.map((p) => compressImageFile(p.file))
        );
        for (const f of compressedPhotos) {
          submitData.append("photos", f);
        }
      }

      try {
        if (editingTest) {
          if (editingTest._id) {
            const res = await testingAPI.update(editingTest._id, submitData);
            const updated = normalizeTest(res.data.data);
            setTests((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
            success(`Test ${updated.id} updated successfully`);
            clearTestFileCache(updated._id);
          } else {
            setTests((prev) => prev.map((t) => (t.id === editingTest.id ? { ...t, ...submitData } : t)));
            success(`Test ${editingTest.id} updated successfully`);
            clearTestFileCache(editingTest.id);
          }
        } else {
          const res = await testingAPI.create(submitData);
          const created = normalizeTest(res.data.data);
          // Newest first — prepend so the new test record appears on top.
          setTests((prev) => [created, ...prev]);
          success(`Test ${created.id} created successfully`);
        }
        setShowFormPage(false);
        setEditingTest(null);
        formik.resetForm();
      } catch (err) {
        toastError(err.response?.data?.message || "Failed to save test record. Please try again.");
      } finally {
        setLoading(false);
      }
    },
  });

  // Section 13 "Test Parameters": auto-fill derived values from the
  // measurements entered in the test sections above. Params only sync while
  // the source field has a value — clearing a test never wipes the summary.
  // Note: `formik` is intentionally NOT a dependency — its identity changes
  // on every render, which would loop setFieldValue() infinitely.
  useEffect(() => {
    const { currentTest = {}, voltageTest = {}, earthingTest = {}, params = {} } = formik.values;
    const updates = {};
    if (currentTest.value) updates.isc = String(currentTest.value);
    if (voltageTest.value) updates.acVoltage = String(voltageTest.value);
    if (earthingTest.resistance) updates.earthing = String(earthingTest.resistance);
    if (!params.frequency) updates.frequency = "50";
    const keys = Object.keys(updates);
    if (keys.length) {
      keys.forEach((key) => formik.setFieldValue(`params.${key}`, updates[key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formik.values.currentTest?.value, formik.values.voltageTest?.value, formik.values.earthingTest?.resistance, formik.values.params?.frequency]);

  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    if (anyModalOpen) content.style.overflow = 'hidden';
    else content.style.overflow = '';
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);


  const filteredTests = useMemo(() => {
    let result = [...tests];
    const q = search.toLowerCase();

    if (q) result = result.filter((t) =>
      t.id.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      (t.projectName || "").toLowerCase().includes(q) ||
      t.leadId.toLowerCase().includes(q) ||
      t.installationId.toLowerCase().includes(q) ||
      t.engineerName.toLowerCase().includes(q)
    );

    if (statusFilter !== "All") result = result.filter((t) => t.testResult === statusFilter);
    if (inspectionFilter !== "All") result = result.filter((t) => t.finalInspection.status === inspectionFilter);
    if (engineerFilter !== "All") result = result.filter((t) => t.engineerName === engineerFilter);
    if (dateFrom) result = result.filter((t) => formatTestDateInput(t.testDate) >= dateFrom);
    if (dateTo) result = result.filter((t) => formatTestDateInput(t.testDate) <= dateTo);
    if (draftFilter === "Draft") result = result.filter((t) => t.isDraft);
    else if (draftFilter === "Completed") result = result.filter((t) => !t.isDraft);

    return result;
  }, [tests, search, statusFilter, inspectionFilter, engineerFilter, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: tests.length,
    passed: tests.filter((t) => t.testResult === "Pass").length,
    failed: tests.filter((t) => t.testResult === "Fail").length,
    approved: tests.filter((t) => t.finalInspection.status === "Approved").length,
  }), [tests]);

  const totalPages = Math.max(1, Math.ceil(serverTotal || filteredTests.length / pageSize));
  const paginatedTests = filteredTests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const getInProgressClass = (r) => r === "In Progress" ? "tm-result-progress" : "";
  const handleCreateCommissioning = (t) => {
    if (!t?.leadId) return;
    const params = new URLSearchParams({
      createForLead: t.leadId,
      customerName: t.customerName || "",
    });
    navigate(`/admin/commissioning?${params.toString()}`);
  };

  // Capture the pre-fill target (from the Project Approval table) once and
  // consume the URL params so revisiting the module doesn't re-open the form.
  useEffect(() => {
    const leadId = (searchParams.get("createForLead") || "").trim();
    if (!leadId) return;
    prefillRef.current = {
      leadId,
      customerName: (searchParams.get("customerName") || "").trim(),
    };
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill || prefillAppliedRef.current || !formDataReady) return;
    prefillAppliedRef.current = true;
    setEditingTest(null);
    setPrefillLeadId(prefill.leadId);
    formik.setFieldValue("leadId", prefill.leadId);
    if (prefill.customerName) formik.setFieldValue("customerName", prefill.customerName);
    handleProjectSelect(prefill.leadId);
    setShowFormPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDataReady]);

  const openAddModal = () => {
    setEditingTest(null);
    formik.resetForm();
    setShowFormPage(true);
  };

  const openEditModal = (test) => {
    setEditingTest(test);
    formik.setValues({
      customerName: test.customerName,
      projectName: test.projectName || "",
      leadId: test.leadId,
      installationId: test.installationId,
      testDate: formatTestDateInput(test.testDate),
      engineerName: test.engineerName,
      status: test.status || "Scheduled",
      testResult: test.testResult,
      remarks: test.remarks || "",
      stringTests: toStringTests(test).map((s) => ({ ...s })),
      inverterTest: { ...test.inverterTest },
      earthingTest: { ...test.earthingTest },
      insulationTest: { ...test.insulationTest },
      voltageTest: { ...test.voltageTest },
      currentTest: { ...test.currentTest },
      performance: { ...test.performance },
      safety: { ...test.safety },
      finalInspection: { ...test.finalInspection },
      params: { ...test.params },
      isDraft: test.isDraft || false,
      docs: [...(test.docs || [])].map((d, i) => (typeof d === "object" && d ? { ...d, _origIndex: i } : { name: String(d || ""), _origIndex: i })),
      photos: [...(test.photos || [])].map((p, i) => (typeof p === "object" && p ? { ...p, _origIndex: i } : { name: String(p || ""), _origIndex: i })),
    }, false);
    formik.setTouched({});
    setShowFormPage(true);
  };

  const openViewModal = (test) => {
    setSelectedTest(test);
    setShowViewModal(true);
  };

  const openInstallationModal = async (test) => {
    if (!test || !test.installationId) return;
    setShowInstallModal(true);
    setInstallDetails(null);
    const findMatch = (list) =>
      (list || []).find(
        (i) =>
          (i.installationId && i.installationId === test.installationId) ||
          (test.leadId && i.leadId === test.leadId)
      );
    const cached = findMatch(installations);
    if (cached) {
      setInstallDetails(cached);
      return;
    }
    try {
      const res = await installationAPI.getAll({ page: 1, limit: 1000 });
      const found = findMatch(res.data?.data || []);
      if (found) setInstallDetails(found);
      else {
        toastError("Installation details not found");
        setShowInstallModal(false);
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to load installation details");
      setShowInstallModal(false);
    }
  };



  const confirmDelete = (test) => {
    setDeleteTarget(test);
    setShowDeleteDialog(true);
  };const downloadTestLog = async (test) => {
  const doc = await createProfilePdf({
    bannerName: test.customerName,
    bannerSubtitle: `Test ID: ${test.id}`,
    bannerRight: [`Result: ${test.testResult || "—"}`],
    sections: [
      {
        title: "Basic Information",
        fields: [
          ["Installation ID", test.installationId],
          ["Test Date", formatTestDate(test.testDate) || "—"],
          ["Engineer", test.engineerName],
        ],
      },
      {
        title: "Electrical Test",
        fields: [["Status", test.electricalTest]],
      },
      {
        title: "Final Inspection",
        fields: [
          ["Status", test.finalInspection?.status || "N/A"],
          ["Inspector", test.finalInspection?.inspector || "N/A"],
        ],
      },
    ],
    notes: test.finalInspection?.remarks,
  });

  const safeCustomer = (test.customerName || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`TestLog_${safeCustomer}.pdf`);

  success("Test log downloaded");
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
        await testingAPI.delete(deleteTarget._id);
        setTests((prev) => prev.filter((t) => t._id !== deleteTarget._id));
        success(`Test ${deleteTarget.id} deleted`);
        clearTestFileCache(deleteTarget._id);
      } else {
        setTests((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        success(`Test ${deleteTarget.id} deleted`);
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete test record. Please try again.");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  const handleDocUpload = (e) => {
    const files = e.target.files;
    if (!files) return;
    const newDocs = [];
    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        newDocs.push({ file, name: file.name, mimeType: file.type || "", size: file.size });
      }
    });
    if (newDocs.length) formik.setFieldValue("docs", [...formik.values.docs, ...newDocs]);
    e.target.value = "";
  };

  const handlePhotoUpload = (e) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos = [];
    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (["jpg", "jpeg", "png"].includes(ext)) {
        newPhotos.push({ file, name: file.name, mimeType: file.type || "", size: file.size });
      }
    });
    if (newPhotos.length) formik.setFieldValue("photos", [...formik.values.photos, ...newPhotos]);
    e.target.value = "";
  };

  const removeDoc = (idx) => {
    formik.setFieldValue("docs", formik.values.docs.filter((_, i) => i !== idx));
  };

  const removePhoto = (idx) => {
    formik.setFieldValue("photos", formik.values.photos.filter((_, i) => i !== idx));
  };

  /* ── Dynamic String Test rows ── */
  const addStringRow = () => {
    const count = (formik.values.stringTests || []).length;
    formik.setFieldValue("stringTests", [
      ...(formik.values.stringTests || []),
      { stringNumber: `S${count + 1}`, status: "Pass", remarks: "" },
    ]);
  };

  const removeStringRow = (idx) => {
    formik.setFieldValue(
      "stringTests",
      (formik.values.stringTests || []).filter((_, i) => i !== idx)
    );
  };

  /* ── Save as Draft ── */
  const handleSaveDraft = async () => {
    const values = formik.values;
    const payload = {
      ...values,
      customerName: (values.customerName || "").trim(),
      remarks: (values.remarks || "").trim(),
      electricalTest: "In Progress",
      isDraft: true,
      stringTests: (Array.isArray(values.stringTests) ? values.stringTests : [])
        .filter((s) => s && String(s.stringNumber || "").trim())
        .map((s) => ({
          stringNumber: String(s.stringNumber || "").trim(),
          status: s.status || "",
          remarks: (s.remarks || "").trim(),
        })),
    };

    setSavingDraft(true);
    try {
      if (editingTest && editingTest._id) {
        const res = await testingAPI.update(editingTest._id, payload);
        const updated = normalizeTest(res.data.data);
        setTests((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
        success(`Draft ${updated.id} saved successfully`);
        clearTestFileCache(updated._id);
      } else {
        const submitData = new FormData();
        const { docs, photos, ...rest } = payload;
        submitData.append("data", JSON.stringify(rest));
        const newDocs = (docs || []).filter((d) => d && d.file);
        const keptDocs = (docs || []).filter((d) => !(d && d.file));
        submitData.append("docsKeep", JSON.stringify(keptDocs.map((d) => d._origIndex)));
        const compressedDocs = await Promise.all(newDocs.map((d) => compressImageFile(d.file)));
        for (const f of compressedDocs) submitData.append("docs", f);
        const newPhotos = (photos || []).filter((p) => p && p.file);
        const keptPhotos = (photos || []).filter((p) => !(p && p.file));
        submitData.append("photosKeep", JSON.stringify(keptPhotos.map((p) => p._origIndex)));
        const compressedPhotos = await Promise.all(newPhotos.map((p) => compressImageFile(p.file)));
        for (const f of compressedPhotos) submitData.append("photos", f);
        const res = await testingAPI.create(submitData);
        const created = normalizeTest(res.data.data);
        setTests((prev) => [created, ...prev]);
        success(`Draft ${created.id} saved successfully`);
      }
      setShowFormPage(false);
      setEditingTest(null);
      formik.resetForm();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Sub-tab state for detailed sections
 

  const getInstallClass = (val) => {
    if (val === "Completed") return "tm-badge-pass";
    if (val === "In Progress") return "tm-badge-warn";
    if (val === "On Hold" || val === "Cancelled") return "tm-badge-fail";
    return "tm-badge";
  };

  const getPassFailClass = (val) => {
    if (val === "Pass" || val === "Approved" || val === "Verified" || val === "Compliant") return "tm-badge-pass";
    if (val === "Fail" || val === "Rejected" || val === "Non-Compliant" || val === "Not Verified") return "tm-badge-fail";
    return "tm-badge-warn";
  };

  const renderFormPage = () => (
    <div className="tm-form-page">
      <div className="tm-form-page-header">
        <button className="tm-btn tm-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Tests
        </button>
        <h2>{editingTest ? `Edit Test ${editingTest.id}` : "New Test Record"}</h2>
      </div>
      <form onSubmit={formik.handleSubmit} className="tm-form-page-body" noValidate>
          {/* Section 1: Electrical Testing */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">1</span><h4>Project Details</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Select Project <span className="tm-req">*</span></label><Dropdown value={formik.values.leadId} onChange={handleProjectSelect} options={projectOptions} variant="form" placeholder="Select Project" emptyMessage={projectOptions.length === 0 && installations.length > 0 ? "All approved projects already tested" : "No approved projects with installations"} disabled={!!editingTest} />{formik.errors.leadId && formik.touched.leadId && <span className="tm-err">{formik.errors.leadId}</span>}</div>
              <div className="tm-field"><label>Customer Name <span className="tm-req">*</span></label><input type="text" name="customerName" value={formik.values.customerName} readOnly placeholder="Auto-filled from selected project" className="tm-input-readonly" title="Auto-filled from selected project" /></div>
              <div className="tm-field"><label>Installation ID <span className="tm-req">*</span></label><input type="text" name="installationId" value={formik.values.installationId} readOnly placeholder="Auto-filled from selected project" className="tm-input-readonly" title="Auto-filled from selected project" /></div>
              <div className="tm-field"><label>Test Date <span className="tm-req">*</span></label><input type="date" name="testDate" value={formik.values.testDate} onChange={formik.handleChange} className={formik.errors.testDate && formik.touched.testDate ? "tm-input-error" : ""} />{formik.errors.testDate && formik.touched.testDate && <span className="tm-err">{formik.errors.testDate}</span>}</div>
              <div className="tm-field"><label>Technician Name <span className="tm-req">*</span></label><input type="text" name="engineerName" value={formik.values.engineerName} readOnly placeholder="Auto-filled from selected project" className="tm-input-readonly" title="Auto-filled from installation technician" /></div>
              <div className="tm-field"><label>Status <span className="tm-req">*</span></label><Dropdown value={formik.values.status} onChange={(val) => formik.setFieldValue("status", val)} options={TESTING_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" />{formik.errors.status && formik.touched.status && <span className="tm-err">{formik.errors.status}</span>}</div>
              <div className="tm-field"><label>Test Result <span className="tm-req">*</span></label><Dropdown value={formik.values.testResult} onChange={(val) => formik.setFieldValue("testResult", val)} options={TEST_RESULTS.map((r) => ({ value: r, label: r }))} variant="form" />{formik.errors.testResult && formik.touched.testResult && <span className="tm-err">{formik.errors.testResult}</span>}</div>
              <div className="tm-field tm-full-width"><label>Remarks</label><input type="text" value={formik.values.remarks || ""} onChange={(e) => formik.setFieldValue("remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 2: String Testing (multiple strings) */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">2</span><h4>String Testing</h4></div>
            <div className="tm-string-table-wrap">
              <table className="tm-string-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>String Number <span className="tm-req">*</span></th>
                    <th>Status <span className="tm-req">*</span></th>
                    <th>Remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(formik.values.stringTests || []).map((row, idx) => (
                    <tr key={idx}>
                      <td className="tm-string-idx">{idx + 1}</td>
                      <td>
                        <input type="text" value={row.stringNumber || ""} onChange={(e) => formik.setFieldValue(`stringTests.${idx}.stringNumber`, e.target.value)} placeholder="e.g. S1" maxLength={50} className="tm-input-sm" />
                      </td>
                      <td>
                        <Dropdown value={row.status || "Pass"} onChange={(val) => formik.setFieldValue(`stringTests.${idx}.status`, val)} options={STRING_STATUSES.map((s) => ({ value: s, label: s }))} variant="table" />
                      </td>
                      <td>
                        <input type="text" value={row.remarks || ""} onChange={(e) => formik.setFieldValue(`stringTests.${idx}.remarks`, e.target.value)} placeholder="Remarks" maxLength={500} className="tm-input-sm" />
                      </td>
                      <td>
                        <button type="button" className="tm-string-remove" title="Remove string" onClick={() => removeStringRow(idx)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tm-string-add-row">
              <button type="button" className="tm-btn tm-btn-secondary" onClick={addStringRow}>
                + Add String
              </button>
            </div>
          </div>

          {/* Section 3: Inverter Testing */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">3</span><h4>Inverter Testing</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Inverter Model <span className="tm-req">*</span></label><input type="text" value={formik.values.inverterTest.model || ""} onChange={(e) => formik.setFieldValue("inverterTest.model", e.target.value)} placeholder="e.g. Huawei Sun2000" maxLength={100} className={formik.errors.inverterTest?.model && formik.touched.inverterTest?.model ? "tm-input-error" : ""} />{formik.errors.inverterTest?.model && formik.touched.inverterTest?.model && <span className="tm-err">{formik.errors.inverterTest?.model}</span>}</div>
              <div className="tm-field"><label>Status</label><Dropdown value={formik.values.inverterTest.status || "Pass"} onChange={(val) => formik.setFieldValue("inverterTest.status", val)} options={INVERTER_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" /></div>
              <div className="tm-field tm-full-width"><label>Remarks</label><input type="text" value={formik.values.inverterTest.remarks || ""} onChange={(e) => formik.setFieldValue("inverterTest.remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 4: Earthing Testing */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">4</span><h4>Earthing Testing</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Result</label><Dropdown value={formik.values.earthingTest.result || "Pass"} onChange={(val) => formik.setFieldValue("earthingTest.result", val)} options={EARTHING_RESULTS.map((s) => ({ value: s, label: s }))} variant="form" /></div>
              <div className="tm-field"><label>Resistance (Ω) <span className="tm-req">*</span></label><input type="text" value={formik.values.earthingTest.resistance || ""} onChange={(e) => formik.setFieldValue("earthingTest.resistance", e.target.value)} placeholder="e.g. 2.5" maxLength={20} className={formik.errors.earthingTest?.resistance && formik.touched.earthingTest?.resistance ? "tm-input-error" : ""} />{formik.errors.earthingTest?.resistance && formik.touched.earthingTest?.resistance && <span className="tm-err">{formik.errors.earthingTest?.resistance}</span>}</div>
              <div className="tm-field tm-full-width"><label>Remarks</label><input type="text" value={formik.values.earthingTest.remarks || ""} onChange={(e) => formik.setFieldValue("earthingTest.remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 5: Insulation Resistance */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">5</span><h4>Insulation Resistance Testing</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Resistance Value (MΩ) <span className="tm-req">*</span></label><input type="text" value={formik.values.insulationTest.value || ""} onChange={(e) => formik.setFieldValue("insulationTest.value", e.target.value)} placeholder="e.g. 500" maxLength={20} className={formik.errors.insulationTest?.value && formik.touched.insulationTest?.value ? "tm-input-error" : ""} />{formik.errors.insulationTest?.value && formik.touched.insulationTest?.value && <span className="tm-err">{formik.errors.insulationTest?.value}</span>}</div>
              <div className="tm-field"><label>Status</label><Dropdown value={formik.values.insulationTest.status || "Pass"} onChange={(val) => formik.setFieldValue("insulationTest.status", val)} options={INSULATION_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" /></div>
            </div>
          </div>

          {/* Section 6: Voltage Testing */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">6</span><h4>Voltage Testing</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Voltage Value (V) <span className="tm-req">*</span></label><input type="text" value={formik.values.voltageTest.value || ""} onChange={(e) => formik.setFieldValue("voltageTest.value", e.target.value)} placeholder="e.g. 230" maxLength={20} className={formik.errors.voltageTest?.value && formik.touched.voltageTest?.value ? "tm-input-error" : ""} />{formik.errors.voltageTest?.value && formik.touched.voltageTest?.value && <span className="tm-err">{formik.errors.voltageTest?.value}</span>}</div>
              <div className="tm-field"><label>Status</label><Dropdown value={formik.values.voltageTest.status || "Pass"} onChange={(val) => formik.setFieldValue("voltageTest.status", val)} options={VOLTAGE_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" /></div>
            </div>
          </div>

          {/* Section 7: Current Testing */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">7</span><h4>Current Testing</h4></div>
            <div className="tm-form-grid">              <div className="tm-field"><label>Current Value (A) <span className="tm-req">*</span></label><input type="text" value={formik.values.currentTest.value || ""} onChange={(e) => formik.setFieldValue("currentTest.value", e.target.value)} placeholder="e.g. 15" maxLength={20} className={formik.errors.currentTest?.value && formik.touched.currentTest?.value ? "tm-input-error" : ""} />{formik.errors.currentTest?.value && formik.touched.currentTest?.value && <span className="tm-err">{formik.errors.currentTest?.value}</span>}</div>

              <div className="tm-field"><label>Status</label><Dropdown value={formik.values.currentTest.status || "Pass"} onChange={(val) => formik.setFieldValue("currentTest.status", val)} options={CURRENT_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" /></div>
            </div>
          </div>

          {/* Section 8: Performance Verification */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">8</span><h4>Performance Verification</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Status <span className="tm-req">*</span></label><Dropdown value={formik.values.performance.status || "Verified"} onChange={(val) => formik.setFieldValue("performance.status", val)} options={PERFORMANCE_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" />{formik.errors.performance?.status && formik.touched.performance?.status && <span className="tm-err">{formik.errors.performance?.status}</span>}</div>
              <div className="tm-field"><label>Remarks</label><input type="text" value={formik.values.performance.remarks || ""} onChange={(e) => formik.setFieldValue("performance.remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 9: Safety Compliance */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">9</span><h4>Safety Compliance Check</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Status <span className="tm-req">*</span></label><Dropdown value={formik.values.safety.status || "Compliant"} onChange={(val) => formik.setFieldValue("safety.status", val)} options={SAFETY_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" />{formik.errors.safety?.status && formik.touched.safety?.status && <span className="tm-err">{formik.errors.safety?.status}</span>}</div>
              <div className="tm-field"><label>Remarks</label><input type="text" value={formik.values.safety.remarks || ""} onChange={(e) => formik.setFieldValue("safety.remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 10: Final Inspection */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">10</span><h4>Final Inspection</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Status <span className="tm-req">*</span></label><Dropdown value={formik.values.finalInspection.status || "Approved"} onChange={(val) => formik.setFieldValue("finalInspection.status", val)} options={INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))} variant="form" />{formik.errors.finalInspection?.status && formik.touched.finalInspection?.status && <span className="tm-err">{formik.errors.finalInspection?.status}</span>}</div>
              <div className="tm-field"><label>Remarks</label><input type="text" value={formik.values.finalInspection.remarks || ""} onChange={(e) => formik.setFieldValue("finalInspection.remarks", e.target.value)} placeholder="Remarks" maxLength={500} /></div>
            </div>
          </div>

          {/* Section 11-12: Documents & Photos */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">11</span><h4>Testing Documents</h4></div>
            <div className="tm-upload-area">
              <button type="button" className="tm-btn tm-btn-secondary" onClick={() => docInputRef.current?.click()}>Upload Document</button>
              <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocUpload} style={{ display: "none" }} multiple />
              <span className="tm-upload-hint">Supported: PDF, JPG, PNG</span>
            </div>
            {formik.values.docs.length > 0 && (
              <div className="tm-file-list">
                {formik.values.docs.map((d, i) => {
                  const stored = d && typeof d === "object" && !d.file;
                  return (
                    <div key={i} className="tm-file-item tm-file-item-preview">
                      <div className="tm-file-item-top">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        <span title={fileDisplayName(d)}>{fileDisplayName(d)}</span>
                        <button type="button" className="tm-file-remove" onClick={() => removeDoc(i)}>×</button>
                      </div>
                      {stored ? (
                        editingTest?._id && d.hasFile ? (
                          <StoredTestDoc testId={editingTest._id} doc={d} index={d._origIndex} onZoom={setZoomImage} />
                        ) : null
                      ) : (
                        d && d.file ? <LocalTestDoc file={d.file} onZoom={setZoomImage} /> : null
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">12</span><h4>Testing Photos</h4></div>
            <div className="tm-upload-area">
              <button type="button" className="tm-btn tm-btn-secondary" onClick={() => photoInputRef.current?.click()}>Upload Photos</button>
              <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png" onChange={handlePhotoUpload} style={{ display: "none" }} multiple />
              <span className="tm-upload-hint">Supported: JPG, JPEG, PNG</span>
            </div>
            {formik.values.photos.length > 0 && (
              <div className="tm-photo-grid">
                {formik.values.photos.map((p, i) => {
                  const stored = p && typeof p === "object" && !p.file;
                  return (
                    <div key={i} className="tm-photo-cell">
                      <div className="tm-photo-cell-top">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        <span title={fileDisplayName(p)}>{fileDisplayName(p)}</span>
                        <button type="button" className="tm-file-remove" onClick={() => removePhoto(i)}>×</button>
                      </div>
                      {stored ? (
                        editingTest?._id && p.hasFile ? (
                          <StoredTestPhoto testId={editingTest._id} photo={p} index={p._origIndex} onZoom={setZoomImage} />
                        ) : null
                      ) : (
                        p && p.file ? <LocalTestPhoto file={p.file} onZoom={setZoomImage} /> : null
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 13: Test Parameters */}
          <div className="tm-form-section">
            <div className="tm-section-header"><span className="tm-section-num">13</span><h4>Test Parameters</h4></div>
            <div className="tm-form-grid">
              <div className="tm-field"><label>Voc (V)</label><input type="text" value={formik.values.params.voc} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.voc", v); }} placeholder="e.g. 380" maxLength={20} /></div>
              <div className="tm-field"><label>Isc (A)</label><input type="text" value={formik.values.params.isc} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.isc", v); }} placeholder="e.g. 8.2" maxLength={20} /></div>
              <div className="tm-field"><label>AC Voltage (V)</label><input type="text" value={formik.values.params.acVoltage} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.acVoltage", v); }} placeholder="e.g. 230" maxLength={20} /></div>
              <div className="tm-field"><label>Frequency (Hz)</label><input type="text" value={formik.values.params.frequency} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.frequency", v); }} placeholder="e.g. 50" maxLength={20} /></div>
              <div className="tm-field"><label>Earthing (Ω)</label><input type="text" value={formik.values.params.earthing} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.earthing", v); }} placeholder="e.g. 2.1" maxLength={20} /></div>
              <div className="tm-field"><label>Inverter Eff. (%)</label><input type="text" value={formik.values.params.inverterEff} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.inverterEff", v); }} placeholder="e.g. 97.2" maxLength={20} /></div>
              <div className="tm-field"><label>PR (%)</label><input type="text" value={formik.values.params.pr} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) formik.setFieldValue("params.pr", v); }} placeholder="e.g. 82" maxLength={20} /></div>
            </div>
          </div>

          <div className="tm-form-page-footer">
            <button type="button" className="tm-btn tm-btn-cancel" onClick={() => setShowFormPage(false)} disabled={loading || savingDraft || formik.isSubmitting}>Cancel</button>
            <button type="button" className="tm-btn tm-btn-draft" onClick={handleSaveDraft} disabled={loading || savingDraft || formik.isSubmitting}>{savingDraft ? <><span className="tm-spinner"></span> Saving Draft...</> : "Save Draft"}</button>
            <button type="submit" className="tm-btn tm-btn-primary" disabled={loading || savingDraft || formik.isSubmitting}>{loading || formik.isSubmitting ? <><span className="tm-spinner"></span> Saving...</> : editingTest ? "Update Test" : "Save Test"}</button>
          </div>
        </form>
    </div>
  );

  const renderViewModal = () => {
    if (!selectedTest) return null;
    const d = selectedTest;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>Test Details — {d.id}</h3>
            </div>
            <button className="vm-modal-close" onClick={() => setShowViewModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="tm-view-grid-2">
              <div className="tm-view-stat"><span className="tm-view-lbl">Test ID</span><span className="tm-view-val">{d.id}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Customer</span><span className="tm-view-val">{d.customerName}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Lead ID</span><span className="tm-view-val">{d.leadId}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Installation</span><span className="tm-view-val">{d.installationId}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Test Date</span><span className="tm-view-val">{formatTestDate(d.testDate) || "—"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Engineer</span><span className="tm-view-val">{d.engineerName}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Result</span><span className="tm-view-val"><span className={`tm-badge ${getPassFailClass(d.testResult)}`}>{d.testResult}</span></span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Inspection</span><span className="tm-view-val"><span className={`tm-badge ${getPassFailClass(d.finalInspection.status)}`}>{d.finalInspection.status}</span></span></div>
            </div>
            <div className="tm-view-detail-grid">
              <div className="tm-view-card"><h5>String Test</h5>{toStringTests(d).map((s, i) => (<p key={i}>{s.stringNumber}: <span className={`tm-badge ${getPassFailClass(s.status)}`}>{s.status}</span>{s.remarks ? ` — ${s.remarks}` : ""}</p>))}{toStringTests(d).length === 0 && <p>—</p>}</div>
              <div className="tm-view-card"><h5>Inverter Test</h5><p>{d.inverterTest.model}: <span className={`tm-badge ${getPassFailClass(d.inverterTest.status)}`}>{d.inverterTest.status}</span></p><p className="tm-view-rm">{d.inverterTest.remarks}</p></div>
              <div className="tm-view-card"><h5>Earthing Test</h5><p>{d.earthingTest.resistance}Ω: <span className={`tm-badge ${getPassFailClass(d.earthingTest.result)}`}>{d.earthingTest.result}</span></p><p className="tm-view-rm">{d.earthingTest.remarks}</p></div>
              <div className="tm-view-card"><h5>Performance</h5><p><span className={`tm-badge ${getPassFailClass(d.performance.status)}`}>{d.performance.status}</span></p><p className="tm-view-rm">{d.performance.remarks}</p></div>
              <div className="tm-view-card"><h5>Safety</h5><p><span className={`tm-badge ${getPassFailClass(d.safety.status)}`}>{d.safety.status}</span></p><p className="tm-view-rm">{d.safety.remarks}</p></div>
              <div className="tm-view-card"><h5>Final Inspection</h5><p><span className={`tm-badge ${getPassFailClass(d.finalInspection.status)}`}>{d.finalInspection.status}</span></p><p className="tm-view-rm">{d.finalInspection.remarks}</p></div>
            </div>
            <div className="tm-view-params">
              <h5>Test Parameters</h5>
              <div className="tm-param-grid">
                <span><strong>Voc:</strong> {d.params.voc || "—"}</span>
                <span><strong>Isc:</strong> {d.params.isc || "—"}</span>
                <span><strong>AC V:</strong> {d.params.acVoltage || "—"}</span>
                <span><strong>Freq:</strong> {d.params.frequency || "—"}</span>
                <span><strong>Earth:</strong> {d.params.earthing || "—"}Ω</span>
                <span><strong>Inv Eff:</strong> {d.params.inverterEff || "—"}</span>
                <span><strong>PR:</strong> {d.params.pr || "—"}</span>
              </div>
            </div>
            {d.docs?.length > 0 && <div className="tm-view-files"><h5>Documents</h5><div className="tm-file-list">{d.docs.map((doc, i) => <div key={i} className="tm-file-item tm-file-item-preview"><div className="tm-file-item-top"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg><span title={fileDisplayName(doc)}>{fileDisplayName(doc)}</span></div>{d._id && doc && typeof doc === "object" && doc.hasFile ? <StoredTestDoc testId={d._id} doc={doc} index={i} onZoom={setZoomImage} /> : null}</div>)}</div></div>}
            {d.photos?.length > 0 && <div className="tm-view-files"><h5>Photos</h5><div className="tm-photo-grid">{d.photos.map((p, i) => <div key={i} className="tm-photo-cell"><div className="tm-photo-cell-top"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg><span title={fileDisplayName(p)}>{fileDisplayName(p)}</span></div>{d._id && p && typeof p === "object" && p.hasFile ? <StoredTestPhoto testId={d._id} photo={p} index={i} onZoom={setZoomImage} /> : null}</div>)}</div></div>}
            {d.remarks && <div className="tm-view-notes"><h5>Remarks</h5><p>{d.remarks}</p></div>}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowViewModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const renderInstallationModal = () => {
    if (!installDetails) {
      return (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Installation Details</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowInstallModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="tm-empty-state"><span className="tm-spinner"></span><p>Loading installation details...</p></div>
            </div>
          </div>
        </div>
      );
    }
    const inst = installDetails;
    const materialsCount = (inst.materials || []).length;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>Installation Details — {inst.installationId || inst.id}</h3>
            </div>
            <button className="vm-modal-close" onClick={() => setShowInstallModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="tm-view-grid-2">
              <div className="tm-view-stat"><span className="tm-view-lbl">Installation ID</span><span className="tm-view-val">{inst.installationId || inst.id}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Customer</span><span className="tm-view-val">{inst.customerName || "—"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Lead ID</span><span className="tm-view-val">{inst.leadId || "—"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Date</span><span className="tm-view-val">{formatTestDate(inst.installationDate) || "—"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Time</span><span className="tm-view-val">{inst.installationTime || "—"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Status</span><span className="tm-view-val"><span className={`tm-badge ${getInstallClass(inst.installationStatus)}`}>{inst.installationStatus || "—"}</span></span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Technician</span><span className="tm-view-val">{inst.technicianName || "Unassigned"}</span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Verification</span><span className="tm-view-val"><span className={`tm-badge ${inst.verificationStatus === "Verified" ? "tm-badge-pass" : "tm-badge-fail"}`}>{inst.verificationStatus || "Not Verified"}</span></span></div>
              <div className="tm-view-stat"><span className="tm-view-lbl">Materials</span><span className="tm-view-val">{materialsCount > 0 ? `${materialsCount} item${materialsCount > 1 ? "s" : ""}` : "—"}</span></div>
            </div>
            {inst.installationAddress && <div className="tm-view-notes"><h5>Site Address</h5><p>{inst.installationAddress}</p></div>}
            {inst.verificationNotes && <div className="tm-view-notes"><h5>Verification Notes</h5><p>{inst.verificationNotes}</p></div>}
            {inst.notes && <div className="tm-view-notes"><h5>Notes</h5><p>{inst.notes}</p></div>}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowInstallModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="testing-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="tm-page">
      {!showFormPage && (<>
      {/* Page Header */}
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Testing Module</h1>
          <p className="tm-subtitle">Conduct and manage electrical tests including string, inverter, earthing, insulation, and performance testing.</p>
        </div>
        <div className="tm-header-actions">
          {canDo("testing", "create") && (
          <button className="tm-btn tm-btn-primary" onClick={() => openAddModal()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Test Record
          </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="tm-stats-grid">
        <StatCard
          title="Total Tests"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>}
          color="purple"
        />
        <StatCard
          title="Passed"
          value={stats.passed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          color="green"
        />
        <StatCard
          title="Failed"
          value={stats.failed.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
          color="red"
        />
        <StatCard
          title="Approved"
          value={stats.approved.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
          color="blue"
        />
      </div>

      {/* Charts */}
      {/* <div className="tm-charts">
        <div className="tm-chart-card tm-chart-wide">
          <div className="tm-chart-head">
            <h3>Test Results Trend</h3>
            <span className="tm-chart-sub">Monthly pass / fail</span>
          </div>
          {trendData.length === 0 ? (
            <div className="tm-chart-empty">No test data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmGradPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="tmGradFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                <Area type="monotone" dataKey="passed" name="Passed" stroke="#16a34a" strokeWidth={2.5} fill="url(#tmGradPass)" dot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#dc2626" strokeWidth={2.5} fill="url(#tmGradFail)" dot={{ r: 3, fill: "#dc2626", strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="tm-chart-card">
          <div className="tm-chart-head">
            <h3>Test Types</h3>
            <span className="tm-chart-sub">Passed by category</span>
          </div>
          <div className="tm-donut-wrap">
            <ResponsiveContainer width="100%" height={240}>

              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={6}>
                  {typeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
              </PieChart>
            </ResponsiveContainer>
            {typeData.length === 0 ? (
              <div className="tm-chart-empty">No test data yet</div>
            ) : (
              <div className="tm-donut-center">
                <span className="tm-donut-center-value">{typeData.reduce((s, r) => s + r.value, 0)}</span>
                <span className="tm-donut-center-label">Passed</span>
              </div>
            )}
          </div>
        </div>
      </div> */}

      {/* Tabs */}
      {/* <div className="tm-section-tabs">
        {tabs.map((tab) => (
          <button key={tab.id} className={`tm-section-btn ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
        ))}
      </div> */}
{/* 
      {activeTab === "electrical" && (
        <div className="tm-sub-tabs">
          {subTabs.map((st) => (
            <button key={st.id} className={`tm-sub-tab ${activeSubTab === st.id ? "active" : ""}`} onClick={() => setActiveSubTab(st.id)}>{st.label}</button>
          ))}
        </div>
      )} */}
      {/* ====== ALL TESTS TABLE ====== */}
      <div className="tm-section">
          <div className="tm-toolbar">
            <div className="tm-toolbar-row">
              <div className="tm-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search by ID, Customer, Lead, Installation, Engineer" />
                {search && (
                  <button className="test-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Result" }, ...TEST_RESULTS.map((r) => ({ value: r, label: r }))]} />
              <Dropdown value={inspectionFilter} onChange={(val) => { setInspectionFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Inspection" }, ...INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))]} />
              <Dropdown value={engineerFilter} onChange={(val) => { setEngineerFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Technician" }, ...[...new Set(tests.map((t) => t.engineerName).filter(Boolean))].map((name) => ({ value: name, label: name }))]} />
              <Dropdown value={draftFilter} onChange={(val) => { setDraftFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Status" }, { value: "Draft", label: "Draft" }, { value: "Completed", label: "Completed" }]} />
              <input type="date" className="tm-inline-date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
              <input type="date" className="tm-inline-date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />

            </div>
          </div>

          <div className="tm-table-card">
            <div className="tm-table-wrapper">
              <table className="tm-table">
                <thead>
                  <tr>
                    <th>Test ID</th>
                    <th>Customer / Project</th>
                    <th>Installation ID</th>
                    <th>Test Date</th>
                    <th>Engineer</th>
                    <th>Electrical Test</th>
                    <th>Final Inspection</th>
                    <th>Overall Result</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTests.length === 0 ? (
                    <tr><td colSpan="9" className="tm-empty"><div className="tm-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg><p>No test records found</p><span>Try adjusting search/filter or create a new test record.</span></div></td></tr>
                  ) : (
                    paginatedTests.map((t) => (
                      <tr key={t.id}>
                        <td className="tm-td-id">{t.id}</td>
                        <td className="tm-td-name">
                          <span className="tm-td-name-text">{t.customerName || "—"}</span>
                          {projectNameByLead[t.leadId] && <div className="tm-td-sub">{projectNameByLead[t.leadId]}</div>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="tm-inst-link" onClick={() => openInstallationModal(t)} title="View installation details">{t.installationId || "—"}</button>
                        </td>
                        <td>{formatTestDate(t.testDate) || "—"}</td>
                        <td>{t.engineerName}</td>
                        <td><span className={`tm-badge ${getPassFailClass(t.electricalTest)}`}>{t.electricalTest}</span></td>
                        <td><span className={`tm-badge ${getPassFailClass(t.finalInspection.status)}`}>{t.finalInspection.status}</span></td>
                        <td><span className={`tm-badge ${getPassFailClass(t.testResult)} ${getInProgressClass(t.testResult)}`}>{t.testResult}</span>{t.isDraft && <span className="tm-badge tm-badge-draft" style={{ marginLeft: 6 }}>Draft</span>}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="act-actions">
                            <button className="act-btn act-view" onClick={() => openViewModal(t)} title="View Details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                            <ActivityLogButton
                              module="testing"
                              onClick={() => setRecordActivityTarget({ recordId: t.serverId || t._id || t.id, recordLabel: t.testId || t.customerName, module: "testing" })}
                              title="View Testing Activity Log"
                            />
                            {canDo("testing", "edit") && (
                            <button className="act-btn act-edit" onClick={() => openEditModal(t)} title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                            )}
                            {canDo("testing", "delete") && (
                            <button className="act-btn act-delete" onClick={() => confirmDelete(t)} title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button>
                            )}
                            {canDo("commissioning", "create") && t.leadId && (
                              <button
                                className={`tm-commission-btn ${t.testResult === "Pass" && !commissionedLeadIds.includes(t.leadId) ? "" : "tm-commission-btn-disabled"}`}
                                onClick={() => t.testResult === "Pass" && !commissionedLeadIds.includes(t.leadId) && handleCreateCommissioning(t)}
                                disabled={t.testResult !== "Pass" || commissionedLeadIds.includes(t.leadId)}
                                title={commissionedLeadIds.includes(t.leadId) ? "A commissioning record already exists for this lead" : t.testResult === "Pass" ? "Create Commissioning & Handover" : "Testing must Pass before commissioning"}
                              >
                                Create Commissioning
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
            {filteredTests.length > 0 && (
              <div className="tm-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal || filteredTests.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  variant="table"
                  onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                  pageSizeOptions={PAGE_SIZES}
                />
              </div>
            )}
          </div>
        </div>

      </>)}

      {/* Modals */}
      {showFormPage && renderFormPage()}
      {showViewModal && renderViewModal()}
      {showInstallModal && renderInstallationModal()}

      {zoomImage && (
        <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Test Record"
        message={`Are you sure you want to delete test ${deleteTarget?.id} for ${deleteTarget?.customerName}?`}
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
                  {showLogModal.testId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Test Result</span>
                    <span className={`cm-status-badge cm-status-${(showLogModal.testResult || "").toLowerCase()}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.testResult || "Pass"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Test Date</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.testDate ? formatTestDate(showLogModal.testDate) : "—"}
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
                  Testing Parameters &amp; Info
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.customerName}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Installation ID</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.installationId || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Lead ID</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.leadId || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Engineer / Technician</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.engineerName || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Electrical Test</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.electricalTest || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Final Inspection</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.finalInspection?.status || "—"}</div>
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
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadTestLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default TestingModule;