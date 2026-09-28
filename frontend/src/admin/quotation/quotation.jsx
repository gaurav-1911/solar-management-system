import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import "./quotation.css";
import "../SolarDesign/SolarDesign.css";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { Pagination, Dropdown, TableLoader, PageLoader, TableEmptyState } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import StatCard from "../dashboard/StatCard/StatCard";
import { quotationValidationSchema } from "../../utils/AdminValidation";
import { quotationAPI, solarDesignAPI, productAPI, vendorAPI } from "../../services";
import { createProfilePdf, formatCurrencyPdf } from "../../utils/pdfLayout";
import { titleCaseCategory, formatDateDDMMYYYY } from "../../utils/helpers";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import { useAuth } from "../../context/AuthContext";

// Legacy fallback labels for old quotations saved with the pre-product keys.
// New quotations only use real Product Catalog products (keyed by productId).
const itemsCatalog = {
  panel: { label: "Solar Panel (550W)" },
  inverter: { label: "Inverter (5kW)" },
  battery: { label: "Battery (Li-ion 5kWh)" },
  structure: { label: "Mounting Structure" },
  labor: { label: "Installation Labor" },
  accessories: { label: "Accessories" },
};


const GST_RATE = 18;

const SUBSIDY_SCHEMES = [
  { value: "PM Surya Ghar Yojana", label: "PM Surya Ghar Yojana" },
  { value: "State Government Subsidies", label: "State Government Subsidies" },
  { value: "Residential Subsidy Programs", label: "Residential Subsidy Programs" },
  { value: "Commercial Incentive Programs", label: "Commercial Incentive Programs" },
];

const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");
const formatDate = formatDateDDMMYYYY;
const vld = (d) => (d ? formatDate(d) : "—");

const QUOTATION_STATUSES = ["Draft", "Pending Approval", "Sent", "Negotiating", "Approved", "Rejected"];

// Status is edited only from the form — the table shows it as a read-only pill.
// All statuses are always selectable in the form (no workflow restrictions).
const statusOptionsFor = (status) => {
  const current = status || "Draft";
  return QUOTATION_STATUSES.map((s) => ({
    value: s,
    label: s === current ? `${s} (current)` : s,
  }));
};

const Quotations = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error } = useToast();
  const { canDo, user } = useAuth();
  const isCustomer = user?.role === "customer";
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  const [leadsReady, setLeadsReady] = useState(false);
  const [designsReady, setDesignsReady] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const getValidUntilClass = (q) => {
    if (!q.validUntil) return "";
    if (q.status === "Approved") {
      return "qs-valid-approved";
    }
    if (q.status === "Rejected") {
      return "qs-valid-closed";
    }
    if (q.validUntil < today) {
      return "qs-valid-expired";
    }
    return "qs-valid-active";
  };

  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modal, setModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [showActivityLogModal, setShowActivityLogModal] = useState(null);
  const [edit, setEdit] = useState(null);
  const [items, setItems] = useState({});
  const [viewModal, setViewModal] = useState(false);
  const [viewQ, setViewQ] = useState(null);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [designDetails, setDesignDetails] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedDesignId, setSelectedDesignId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [systemCapacity, setSystemCapacity] = useState(null); // kW from Solar Design
  const [selectedScheme, setSelectedScheme] = useState("PM Surya Ghar Yojana");
  const [itemsError, setItemsError] = useState("");
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null)
    const [saving, setSaving] = useState(false);
    const [statuses] = useState(QUOTATION_STATUSES)

    // Component-wise pricing: cascading dropdowns (Category → Product → Vendor)
    const [prodSearch, setProdSearch] = useState("");
    const [prodCategory, setProdCategory] = useState("All");
    const [selectedCat, setSelectedCat] = useState("");
    const [selectedProdKey, setSelectedProdKey] = useState("");
    const [selectedVendorFilter, setSelectedVendorFilter] = useState("");
    const [recordActivityTarget, setRecordActivityTarget] = useState(null);

    // Edit-mode snapshot of the saved quotation — used to show the effective
    // available stock (own reservation + remaining) and to skip no-change saves.
    const [originalSnapshot, setOriginalSnapshot] = useState(null);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setViewQ(null);
    setViewModal(false);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      if (filter !== 'All') params.status = filter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const res = await quotationAPI.getAll(params);
      setQuotes(res.data?.data || []);
      setServerTotal(res.data?.pagination?.total || (res.data?.data || []).length);
    } catch (err) {
      error(err.response?.data?.message || "Failed to load quotations.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, search, filter, dateFrom, dateTo, error]);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await quotationAPI.getAnalytics();
      setAnalytics(res.data?.data || null);
    } catch (err) {
      setAnalytics(null);
    }
  }, []);

  const loadDesigns = useCallback(async () => {
    try {
      const res = await solarDesignAPI.getAll({ page: 1, limit: 1000 });
      setDesigns(res.data?.data || []);
    } catch (err) {
      setDesigns([]);
    } finally {
      setDesignsReady(true);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await productAPI.getAll({ page: 1, limit: 1000 });
      setProducts(res.data?.data || []);
    } catch (err) {
      setProducts([]);
    }
  }, []);

  const loadVendors = useCallback(async () => {
    try {
      const res = await vendorAPI.getAll({ limit: 10000 });
      setVendors(res.data?.data || []);
    } catch (err) {
      setVendors([]);
    }
  }, []);

  useEffect(() => {
    loadQuotations();
    // All roles see analytics (stat cards). Only admin/staff need form data.
    loadAnalytics();
    if (!isCustomer) {
      loadDesigns();
      loadProducts();
      loadVendors();
    }
  }, [loadQuotations, loadAnalytics, loadDesigns, loadProducts, loadVendors, isCustomer]);

  // Capture the pre-fill target from URL params (when navigating from Solar
  // Design via "Create Quotation") once and clear the URL so revisiting the
  // module doesn't re-open the form.
  useEffect(() => {
    const leadId = (searchParams.get("leadId") || "").trim();
    if (!leadId) return;
    prefillRef.current = {
      leadId,
      client: (searchParams.get("client") || "").trim(),
      projectName: (searchParams.get("projectName") || "").trim(),
      designId: (searchParams.get("createForDesign") || "").trim(),
    };
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the pre-fill once designs have loaded so we can match the leadId
  // to a design record and open the create-quotation form automatically.
  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill || prefillAppliedRef.current || !designsReady) return;
    prefillAppliedRef.current = true;
    // Open the create-quotation modal and auto-select the project.

    openNew();
    // Small delay to let the modal render, then set the values.
    setTimeout(() => {
      handleProjectSelect(prefill.leadId);
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designsReady]);

  const productByKey = (k) => (products || []).find((p) => p.productId === k);

  const productVendorOf = (p) => {
    if (!p) return "";
    if (p.inventoryItemId && typeof p.inventoryItemId === "object" && p.inventoryItemId.supplier) {
      return p.inventoryItemId.supplier;
    }
    // No inventory link — match the brand against Vendor Management so the
    // picker shows the real vendor name instead of duplicating the brand.
    const brand = String(p.brand || "").trim().toLowerCase();
    if (!brand) return "";
    const hit = vendors.find((v) => {
      const name = String(v.name || "").trim().toLowerCase();
      return name && (name === brand || name.includes(brand) || brand.includes(name));
    });
    return hit ? hit.name : "";
  };

  const productCategories = useMemo(() => {
    const counts = {};
    (products || []).forEach((p) => {
      const c = p.category || "Other";
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (prodCategory !== "All" && (p.category || "Other") !== prodCategory) return false;
      if (!q) return true;
      return (
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.brand || "").toLowerCase().includes(q) ||
        String(productVendorOf(p) || "").toLowerCase().includes(q)
      );
    });
  }, [products, prodSearch, prodCategory, vendors]);

  // Effective stock available to THIS quotation while editing: remaining stock
  // plus any qty this quotation already reserved — so the picker/validation
  // never show a number reduced by this quotation's own items.
  const ownQtyOf = (k) => Number(originalSnapshot?.items?.[k]?.qty) || 0;
  const effStockOf = (k) => {
    const p = productByKey(k);
    const base = p ? Number(p.stock) || 0 : 0;
    return base + ownQtyOf(k);
  };

  /* ── Computed Stats ── */
  const stats = useMemo(() => {
    if (analytics && typeof analytics.totalQuotes === "number") {
      return analytics;
    }
    const approvedCount = quotes.filter((q) => q.status === "Approved").length;
    const pendingCount = quotes.filter((q) => ["Draft", "Pending Approval", "Sent", "Negotiating"].includes(q.status)).length;
    const totalRevenue = quotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0);
    return { totalQuotes: quotes.length, approvedCount, pendingCount, totalRevenue };
  }, [analytics, quotes]);

  const totalRevenueFormatted = `₹${Number(stats.totalRevenue || 0).toLocaleString("en-IN")}`;

  /* ── SVG Icons for StatCards ── */
  const iconTotalQuotes = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
  const iconApproved = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
  const iconPending = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
  const iconRevenue = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" />
    </svg>
  );

  /* ── Filtering (client-side over fetched data) ── */
  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes
      .filter((item) => {
        const matchesSearch =
          !q ||
          (item.client || "").toLowerCase().includes(q) ||
          (item.quotationId || item.id || "").toLowerCase().includes(q);
        const matchesStatus = filter === "All" || item.status === filter;
        const matchesDateFrom = !dateFrom || (item.createdAt && item.createdAt.slice(0, 10) >= dateFrom);
        const matchesDateTo = !dateTo || (item.createdAt && item.createdAt.slice(0, 10) <= dateTo);
        return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
      })
      // Newest quotation first — createdAt desc, then ObjectId desc so records
      // created on the same day still order newest → oldest. Newly created
      // quotations therefore appear at the top of the table.
      .sort((a, b) => {
        const byDate = String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        if (byDate !== 0) return byDate;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });
  }, [quotes, search, filter, dateFrom, dateTo]);

  /* ── Project options: pick from Solar Designs with completed status ── */
  // A project can only get one quotation, so any design that already has a
  // quotation is hidden from the dropdown. While editing, the quotation's own
  // project stays selectable.
  const projectOptions = useMemo(() => {
    const normalize = (name) => String(name || "").trim().toLowerCase();
    const quotedClientNames = new Set(
      quotes.map((q) => normalize(q.client)).filter(Boolean)
    );
    if (edit?.client) {
      quotedClientNames.delete(normalize(edit.client));
    }
    return (designs || [])
      .filter((d) => d.leadId && d.projectName && !quotedClientNames.has(normalize(d.customerName || d.client)))
      .sort((a, b) => (a.projectName || "").localeCompare(b.projectName || ""))
      .map((d) => ({ value: d.leadId, label: d.projectName }));
  }, [designs, quotes, edit]);

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // const totalPages = Math.max(1, Math.ceil(qs.length / pageSize));
  // const paginatedQuotes = qs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Page resets handled by loadQuotations dependencies.

  /* ── Formik Form ── */
  const formik = useFormik({
    initialValues: { client: "", status: "Draft", validUntil: "" },
    validationSchema: quotationValidationSchema,
    onSubmit: async () => {},
  });

  const handleFormSubmit = async (e) => {
    if (e) e.preventDefault();
    
    // 1. Mark all Formik fields as touched so field-level error messages display
    formik.setTouched({ client: true, status: true, validUntil: true });

    // 2. Validate Formik fields
    const formErrors = await formik.validateForm();

    // 3. Auto-add selected product from dropdown if user selected a product but didn't click "+ Add"
    let currentItems = { ...items };
    if (selectedProdKey && !currentItems[selectedProdKey] && effStockOf(selectedProdKey) > 0) {
      const p = productByKey(selectedProdKey);
      if (p) {
        currentItems[selectedProdKey] = { qty: 1, price: Number(p.price) || 0, label: p.name };
        setItems(currentItems);
        setSelectedProdKey("");
      }
    }

    // 4. Validate component-wise pricing items
    let hasItemsError = false;
    if (Object.keys(currentItems).length === 0) {
      setItemsError("Please add at least one component before saving.");
      hasItemsError = true;
    } else {
      const hasZeroQty = Object.entries(currentItems).some(([, v]) => Number(v.qty) < 1);
      if (hasZeroQty) {
        setItemsError("Each product must have a minimum quantity of 1.");
        hasItemsError = true;
      } else {
        const overStockItem = Object.entries(currentItems).find(([k, v]) => {
          const p = productByKey(k);
          return p && Number(v.qty) > effStockOf(k);
        });
        if (overStockItem) {
          const [, v] = overStockItem;
          const p = productByKey(overStockItem[0]);
          setItemsError(`"${v.label || p?.name}" exceeds available stock (${effStockOf(overStockItem[0])} units available).`);
          hasItemsError = true;
        } else {
          setItemsError("");
        }
      }
    }

    // 5. If Formik fields or items have errors, stop submission so inline red error messages display!
    if (Object.keys(formErrors).length > 0 || hasItemsError) {
      return;
    }

    // 6. All required fields are valid! Save quotation entry
    const payload = {
      leadId: selectedLeadId || "",
      designId: selectedDesignId || "",
      client: formik.values.client.trim(),
      projectName: projectName.trim(),
      status: formik.values.status,
      validUntil: formik.values.validUntil || null,
      items: Object.entries(currentItems).reduce((acc, [k, v]) => {
        acc[k] = { ...v, qty: Number(v.qty) || 0, price: Number(v.price) || 0 };
        return acc;
      }, {}),
    };

    setSaving(true);
    try {
      if (edit) {
        await quotationAPI.update(edit.id, payload);
        success("Quotation updated successfully.");
      } else {
        await quotationAPI.create(payload);
        success("Quotation created successfully.");
      }
      closeModal();
      await Promise.all([loadQuotations(), loadAnalytics()]);
    } catch (err) {
      error(err.response?.data?.message || "Failed to save quotation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = useMemo(() => {
    if (!formik.values.client || !selectedLeadId) return false;
    if (!formik.values.validUntil) return false;
    if (!formik.isValid) return false;
    const itemKeys = Object.keys(items);
    if (itemKeys.length === 0) return false;
    const hasInvalidQty = itemKeys.some((k) => Number(items[k]?.qty) < 1);
    if (hasInvalidQty) return false;
    const hasOverStock = itemKeys.some((k) => {
      const p = productByKey(k);
      return p && Number(items[k]?.qty) > effStockOf(k);
    });
    if (hasOverStock) return false;
    return true;
  }, [formik.values.client, formik.values.validUntil, formik.isValid, selectedLeadId, items, products, originalSnapshot]);

  const getDefaultValidUntil = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  };

  const closeModal = () => {
    setModal(false);
    setEdit(null);
    formik.resetForm();
    setItems({});
    setItemsError("");
    setProjectName("");
    setSelectedLeadId("");
    setSelectedDesignId("");
    setProdSearch("");
    setProdCategory("All");
    setSelectedCat("");
    setSelectedProdKey("");
    setSelectedVendorFilter("");
    setOriginalSnapshot(null);
  };

  // Selecting a project auto-fills client name, leadId, designId, and
  // projectName directly from the design record — no extra API calls needed.
  const handleProjectSelect = (leadId) => {
    formik.setFieldValue("client", "", true);
    formik.setFieldTouched("client", true, false);
    setProjectName("");
    setSelectedDesignId("");
    setSelectedLeadId("");
    setSystemCapacity(null);
    setSelectedScheme("PM Surya Ghar Yojana");
    if (!leadId) return;
    const design = (designs || []).find((d) => d.leadId === leadId);
    if (design) {
      formik.setFieldValue("client", design.customerName || "", true);
      formik.setFieldTouched("client", true, false);
      setProjectName(design.projectName || "");
      setSelectedLeadId(design.leadId || "");
      setSelectedDesignId(design.designId || design.id);
      setSystemCapacity(design.recommendedCapacity ?? null);
    }
  };

  // PM Surya Ghar Yojana slab subsidy calculation
  const SLAB_RATE_1 = 30000; // ₹30,000/kW for first 2 kW
  const SLAB_RATE_2 = 18000; // ₹18,000/kW for next 3 kW
  const SLAB_CAP = 78000;

  const calcSlabSubsidy = (cap) => {
    const c = Math.max(0, parseFloat(cap) || 0);
    const first = Math.min(c, 2);
    const second = Math.max(0, Math.min(c - 2, 3));
    const raw = first * SLAB_RATE_1 + second * SLAB_RATE_2;
    return { first, second, amount: Math.min(raw, SLAB_CAP), capped: raw > SLAB_CAP, raw };
  };

  const subsidyInfo = useMemo(() => {
    if (!systemCapacity || systemCapacity <= 0) return null;
    const cap = Math.max(0, parseFloat(systemCapacity) || 0);
    const scheme = SUBSIDY_SCHEMES.find((s) => s.value === selectedScheme) || SUBSIDY_SCHEMES[0];

    // Same slab calculation for all schemes
    const { first, second, amount, capped } = calcSlabSubsidy(cap);
    const slabs = [];
    if (first > 0) {
      slabs.push({
        label: "First 2 kW",
        range: `0 – ${first.toFixed(1)} kW`,
        rate: SLAB_RATE_1,
        amount: Math.round(first * SLAB_RATE_1)
      });
    }
    if (second > 0) {
      slabs.push({
        label: "Next 3 kW",
        range: `${Math.min(cap, 2).toFixed(1)} – ${Math.min(cap, 5).toFixed(1)} kW`,
        rate: SLAB_RATE_2,
        amount: Math.round(second * SLAB_RATE_2)
      });
    }
    return {
      schemeName: scheme.label,
      eligibleCapacity: cap,
      subsidyAmount: Math.round(amount),
      calculationMethod: "slab",
      slabs,
      capped,
      maxCap: SLAB_CAP,
      note: capped
        ? `Subsidy capped at ₹${SLAB_CAP.toLocaleString("en-IN")} as per ${scheme.label} guidelines.`
        : `Estimated subsidy under ${scheme.label}. Actual amount subject to government verification.`
    };
  }, [systemCapacity, selectedScheme]);

  const openNew = () => {
    setEdit(null);
    formik.resetForm({ values: { client: "", status: "Draft", validUntil: "" } });
    setItems({});
    setItemsError("");
    setProjectName("");
    setSelectedLeadId("");
    setSelectedDesignId("");
    setSystemCapacity(null);
    setSelectedScheme("PM Surya Ghar Yojana");
    setProdSearch("");
    setProdCategory("All");
    setSelectedCat("");
    setSelectedProdKey("");
    setSelectedVendorFilter("");
    setOriginalSnapshot(null);
    setModal(true);
  };

  const openEd = (q) => {
    setEdit(q);
    formik.resetForm({
      values: { client: q.client || "", status: q.status || "Draft", validUntil: q.validUntil || "" }
    });
    setProjectName(q.projectName || "");
    setSelectedLeadId(q.leadId || "");
    setSelectedDesignId(q.designId || "");
    setSystemCapacity(q.capacity ?? null);
    setSelectedScheme((q.subsidyInfo && q.subsidyInfo.schemeName) || "PM Surya Ghar Yojana");
    setItems({ ...(q.items || {}) });
    setProdSearch("");
    setProdCategory("All");
    setSelectedCat("");
    setSelectedProdKey("");
    setSelectedVendorFilter("");
    setOriginalSnapshot({
      client: q.client || "",
      projectName: q.projectName || "",
      status: q.status || "Draft",
      validUntil: q.validUntil || "",
      designId: q.designId || "",
      // Deep-ish copy so later immutable edits to the live items never leak
      // into the snapshot (keeps the no-change comparison and effStockOf safe).
      items: Object.fromEntries(
        Object.entries(q.items || {}).map(([key2, v2]) => [key2, { ...v2 }])
      )
    });
    setModal(true);
  };

  const openView = (q) => {
    const rawVersions = Array.isArray(q.versions) && q.versions.length > 0
      ? q.versions
      : [{
          version: q.version || 1,
          items: q.items || {},
          total: q.total || 0,
          gst: q.gst || 0,
          grandTotal: q.grandTotal || 0,
          status: q.status || "Draft",
          validUntil: q.validUntil || "",
          customerResponse: q.customerResponse || {},
          createdAt: q.createdAt || "",
          notes: "Initial Version"
        }];
    const normalizedQ = { ...q, versions: rawVersions };
    setViewQ(normalizedQ);
    setSelectedVersionIndex(rawVersions.length - 1);
    setViewModal(true);
  };

  const openDesignModal = async (q) => {
    if (!q) return;
    setShowDesignModal(true);
    setDesignDetails(null);
    const findMatch = (list) =>
      (list || []).find(
        (d) =>
          (q.designId && (d.designId || d.id) === q.designId) ||
          (q.leadId && d.leadId === q.leadId)
      );
    const cached = findMatch(designs);
    if (cached) {
      setDesignDetails(cached);
      return;
    }
    try {
      const res = await solarDesignAPI.getAll({ page: 1, limit: 1000 });
      const found = findMatch(res.data?.data || []);
      if (found) {
        setDesignDetails(found);
      } else {
        error("Solar design not found for this quotation");
        setShowDesignModal(false);
      }
    } catch (err) {
      error(err.response?.data?.message || "Failed to load solar design details");
      setShowDesignModal(false);
    }
  };

  const confirmDelete = (id) => {
    setDeleteTarget(id);
    setShowDeleteDialog(true);
  };

  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await quotationAPI.delete(deleteTarget);
      success("Quotation deleted successfully.");
      await Promise.all([loadQuotations(), loadAnalytics()]);
    } catch (err) {
      console.error(err);
      // [FLOW-06] Show dependency details if the backend returns them
      const deps = err.response?.data?.dependencies;
      const msg = err.response?.data?.message || "Failed to delete quotation.";
      if (deps && deps.length > 0) {
        const detail = deps.map((d) => `• ${d.count} ${d.module}${d.count > 1 ? "s" : ""}`).join("\n");
        error(`${msg}\n\nLinked records:\n${detail}`);
      } else {
        error(msg);
      }
    } finally {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      setDeleteLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    try {
      await quotationAPI.approve(approveTarget);
      success("Quotation approved successfully.");
      await loadQuotations();
    } catch (err) {
      console.error(err);
      error(err.response?.data?.message || "Failed to approve quotation.");
    } finally {
      setShowApproveDialog(false);
      setApproveTarget(null);
    }
  };

  const tog = (k) => {
    setItems((prev) => {
      if (prev[k]) {
        const c = { ...prev };
        delete c[k];
        return c;
      } else {
        const p = productByKey(k);
        return { ...prev, [k]: { qty: 1, price: p ? Number(p.price) || 0 : 10000, label: p ? p.name : "" } };
      }
    });
  };
  const updateItemField = (k, f, v) =>
    setItems((prev) => ({ ...prev, [k]: { ...prev[k], [f]: v } }));

  const removeItem = (k) =>
    setItems((prev) => {
      const c = { ...prev };
      delete c[k];
      return c;
    });

  // Once at least one component exists, clear the "component-wise pricing is
  // required" error (e.g. after the user adds an item back).
  useEffect(() => {
    if (Object.keys(items).length > 0) setItemsError("");
  }, [items]);

  const getItemLabel = (k, v) => v?.label || productByKey(k)?.name || itemsCatalog[k]?.label || k;

  const sc = (s) =>
    ({ Approved: "qs-ap", Sent: "qs-st", Negotiating: "qs-ng", Rejected: "qs-rj", "Pending Approval": "qs-pa", Draft: "qs-dr" })[s] || "";

  const liveTotals = useMemo(() => {
    let t = 0;
    Object.entries(items).forEach(([k, v]) => {
      if (v.qty && v.price) t += Number(v.qty) * Number(v.price);
    });
    const g = Math.round((t * GST_RATE) / 100);
    return { total: t, gst: g, grandTotal: t + g };
  }, [items]);

const downloadQuotationLog = async (quotation) => {
  const doc = await createProfilePdf({
    bannerName: quotation.client || "Customer",
    bannerSubtitle: `Quotation ID: ${quotation.id}`,
    bannerRight: [
      `Status: ${quotation.status || "—"}`,
      `Version: v${quotation.version || "—"}`,
    ],
    sections: [
      {
        title: "Quotation Details",
        fields: [
          ["Customer", quotation.client || "N/A"],
          ["Amount", formatCurrencyPdf(quotation.grandTotal || quotation.total)],
          ["Version", `v${quotation.version || "N/A"}`],
        ],
      },
    ],
  });

  const safeCustomer = (quotation.client || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`QuotationLog_${safeCustomer}.pdf`);

  success("Quotation PDF generated successfully.");
};

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="quotation-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }
  const renderDesignModal = () => {
    if (!designDetails) {
      return (
        <div className="vm-overlay">
          <div className="vm-view-modal">
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>Solar Design Details</h3>
              </div>
              <button className="vm-modal-close" onClick={() => setShowDesignModal(false)}>
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
    const d = designDetails;
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title">
              <h3>Design Details — {d.designId || d.id}</h3>
            </div>
            <button className="vm-modal-close" onClick={() => setShowDesignModal(false)}>
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
                <span className="sd-view-card-value">{d.panelCount} × 400W</span>
              </div>
            </div>

            <div className="sd-view-grid-3">
              <div className="sd-view-info-card">
                <span className="sd-view-label">Design ID</span>
                <span className="sd-view-value">{d.designId || d.id}</span>
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
                <span className="sd-view-value">{fmt(d.estimatedSystemCost)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Monthly Savings</span>
                <span className="sd-view-value sd-value-green">{fmt(d.monthlySavings)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Annual Savings</span>
                <span className="sd-view-value sd-value-green">{fmt(d.annualSavings)}</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">ROI</span>
                <span className="sd-view-value sd-value-blue">{d.roi}%</span>
              </div>
              <div className="sd-view-info-card sd-view-card-highlight">
                <span className="sd-view-label">Payback Period</span>
                <span className="sd-view-value sd-value-purple">{d.paybackPeriod >= 1 ? `${d.paybackPeriod.toFixed(1)} Years` : `${(d.paybackPeriod * 12).toFixed(0)} Months`}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Roof Dimensions</span>
                <span className="sd-view-value">{d.roofLength != null && d.roofWidth != null ? `${d.roofLength} m × ${d.roofWidth} m` : "—"}</span>
              </div>
              <div className="sd-view-info-card">
                <span className="sd-view-label">Panel Wattage</span>
                <span className="sd-view-value">400 W</span>
              </div>
            </div>
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close" onClick={() => setShowDesignModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="qs-c">
        <div className="qs-h">
          <div className="qs-hl">
            <h2>Quotation Management</h2>
            <p>Generate accurate, tax-compliant, professional quotations with approval workflows</p>
          </div>
          {canDo("quotations", "create") && (
          <button className="qs-ab" onClick={openNew} disabled={loading}>+ Add Quotation</button>
          )}
        </div>

        <div className="qs-stats-grid">
          <StatCard
            title="Total Quotes"
            value={Number(stats.totalQuotes || 0).toLocaleString()}
            icon={iconTotalQuotes}
            color="blue"
          />
          <StatCard
            title="Approved"
            value={Number(stats.approvedCount || 0).toLocaleString()}
            icon={iconApproved}
            color="green"
          />
          <StatCard
            title="Pending"
            value={Number(stats.pendingCount || 0).toLocaleString()}
            icon={iconPending}
            color="orange"
          />
          <StatCard
            title="Total Revenue"
            value={totalRevenueFormatted}
            icon={iconRevenue}
            color="purple"
          />
        </div>

        <>
        <div className="qs-f">
          <div className="qs-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search quotation by ID or client"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="qs-search-clear" onClick={() => setSearch("")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown
            value={filter}
            onChange={(val) => setFilter(val)}
            options={[["All", "All"]].concat(statuses.map((s) => [s, s])).map(([v, l]) => ({ value: v, label: l }))}
            variant="filter"
          />
          <input type="date" className="qs-filter-date-inline" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
          <input type="date" className="qs-filter-date-inline" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
        </div>

        <div className="qs-card">
          <div className="qs-table-wrap">
            <table className="qs-t">
              <thead>
                <tr>
                  {["ID", "Version", "Design ID", "Project Name", "Client", "Total", "GST", "Grand Total", "Status", "Validity", "Approved", "Actions"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && filteredQuotes.length === 0 ? (
                  <TableLoader colSpan={12} />
                ) : (
                  filteredQuotes.map((q) => (
                    <tr key={q.id || q._id}>
                      <td className="qs-id">{q.quotationId || q.id}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>v{q.version || 1}</span>
                          {q.version > 1 && q.requestedItems && q.requestedItems.length > 0 && (
                            <span style={{ padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>NEW</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button className="qs-design-link" onClick={() => openDesignModal(q)} title="View solar design details">{q.designId || "—"}</button>
                      </td>
                      <td className="qs-project">
                        {q.projectName || "—"}
                        {q.type === "Material Request" && (
                          <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>Material Request</span>
                        )}
                        {q.type === "Remaining Products" && (
                          <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: '#dbeafe', color: '#1e40af' }}>Remaining Products</span>
                        )}
                      </td>
                      <td className="qs-client">{q.client}</td>
                      <td>{fmt(q.total)}</td>
                      <td className="qs-gst">+{fmt(q.gst)}</td>
                      <td className="qs-grand">{fmt(q.grandTotal)}</td>
                      <td>
                        <span className={"qs-status-pill " + sc(q.status)}>{q.status}</span>
                      </td>
                      <td className="qs-valid">
                        {q.validUntil ? (
                          <span className={`qs-date-badge ${getValidUntilClass(q)}`}>
                            {q.validUntil < today && q.status !== "Approved" && q.status !== "Rejected" && "Expired: "}
                            {formatDate(q.validUntil)}
                          </span>
                        ) : (
                          <span className="cm-na">—</span>
                        )}
                      </td>
                      <td className="qs-appr">{q.approvedBy}</td>
                      <td className="qs-act">
                        <div className="act-actions">
                          <button className="act-btn act-view" onClick={() => openView(q)} title="View">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <ActivityLogButton
                            module="quotations"
                            onClick={() => setRecordActivityTarget({ recordId: q.id || q._id, recordLabel: q.quotationId || q.client, module: "quotations" })}
                            title="View Quotation Activity Log"
                          />

                          {canDo("quotations", "edit") && (
                          <button className="act-btn act-edit" onClick={() => openEd(q)} title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          )}
                          {canDo("quotations", "edit") && (() => {
                            const emailSentVersion = q.emailSentVersion || 0;
                            const alreadySent = emailSentVersion >= (q.version || 1) && !!q.emailSentAt;
                            return (
                              <button
                                className="act-btn act-edit"
                                disabled={alreadySent}
                                style={{
                                  color: alreadySent ? '#9ca3af' : '#2563eb',
                                  cursor: alreadySent ? 'not-allowed' : 'pointer',
                                  opacity: alreadySent ? 0.4 : 1,
                                  position: 'relative'
                                }}
                                onClick={async () => {
                                  if (alreadySent) return;
                                  try {
                                    const res = await quotationAPI.sendEmail(q.id, {});
                                    if (res.data?.success) {
                                      success(res.data?.message || 'Email sent successfully!');
                                      loadQuotations();
                                    } else {
                                      error(res.data?.message || 'Failed to send email.');
                                    }
                                  } catch (err) {
                                    error(err.response?.data?.message || 'Failed to send email.');
                                  }
                                }}
                                title={alreadySent ? `Already sent on ${new Date(q.emailSentAt).toLocaleDateString('en-IN')}` : 'Send to Customer'}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                  <polyline points="22,6 12,13 2,6" />
                                </svg>
                              </button>
                            );
                          })()}
                          {canDo("quotations", "delete") && (
                          <button className="act-btn act-delete" onClick={() => confirmDelete(q.id)} title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <div className="qs-pagination-row">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={serverTotal}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  variant="table"
                  onPageSizeChange={(val) => { setPageSize(val); setCurrentPage(1); }}
                  disabled={loading}
                />
              </div>
              </div>
            </>
        </div>

      {modal && (
       
        <div className="qs-overlay" onClick={closeModal}>
          <div className="qs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qs-modal-header">
              <h3>{edit ? "Edit Quotation" : "Add Quotation"}</h3>
              <button className="qs-modal-close" onClick={closeModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form noValidate onSubmit={handleFormSubmit}>
              <div className="qs-form-body">
                <div className="qs-form-row">
                  <div className="qs-form-group">
                    <label>Select Project <span style={{ color: "#ef4444" }}>*</span></label>
                    <Dropdown
                      value={selectedLeadId}
                      onChange={handleProjectSelect}
                      options={projectOptions.length > 0 ? [{ value: "", label: "Select Project" }, ...projectOptions] : []}
                      placeholder="Select Project"
                      emptyMessage="No available projects — only projects with a completed solar design are shown"
                      variant="form"
                      className={formik.touched.client && formik.errors.client ? "input-has-error" : ""}
                    />
                    {formik.touched.client && formik.errors.client && (
                      <span className="form-field-error">{formik.errors.client}</span>
                    )}
                  </div>
                  <div className="qs-form-group">
                    <label>Customer Name</label>
                    <input
                      type="text"
                      name="customerName"
                      value={formik.values.client}
                      readOnly
                      title="Auto-filled from the selected project"
                      placeholder="Select a project to fill customer name"
                    />
                  </div>
                </div>

                <div className="qs-form-row">
                  <div className="qs-form-group">
                    <label>Status</label>
                    <Dropdown
                      value={formik.values.status}
                      onChange={(val) => formik.setFieldValue("status", val)}
                      options={statusOptionsFor(formik.values.status)}
                      variant="form"
                    />
                  </div>
                  <div className="qs-form-group">
                    <label>Valid Until <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="date"
                      name="validUntil"
                      value={formik.values.validUntil}
                      onChange={formik.handleChange}
                      min={new Date().toISOString().split("T")[0]}
                      className={formik.touched.validUntil && formik.errors.validUntil ? "input-has-error" : ""}
                    />
                    {formik.touched.validUntil && formik.errors.validUntil && (
                      <span className="form-field-error">{formik.errors.validUntil}</span>
                    )}
                  </div>
                </div>

                {/* System Capacity & Subsidy Estimate */}
                <div className="qs-form-row">
                  <div className="qs-form-group">
                    <label>System Capacity (kW)</label>
                    <input
                      type="text"
                      value={systemCapacity != null ? `${systemCapacity} kW` : "Select a project first"}
                      readOnly
                      title="Auto-filled from the selected project's Solar Design Capacity Recommendation"
                      style={{
                        background: systemCapacity != null ? '#f0fdf4' : '#f9fafb',
                        color: systemCapacity != null ? '#059669' : '#9ca3af',
                        fontWeight: systemCapacity != null ? 700 : 400,
                        fontSize: systemCapacity != null ? 15 : 13
                      }}
                    />
                  </div>
                </div>

                {/* Subsidy Estimate Section */}
                {systemCapacity != null && (
                  <div className="qs-subsidy-section">
                    <div className="qs-subsidy-header">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <div style={{ flex: 1 }}>
                        <h4>Subsidy Estimate</h4>
                        <p style={{ marginBottom: 0 }}>Estimated government subsidy for {systemCapacity} kW system</p>
                      </div>
                    </div>

                    {/* Scheme Dropdown */}
                    <div className="qs-subsidy-scheme-row">
                      <label className="qs-subsidy-scheme-label">Select Subsidy Scheme</label>
                      <Dropdown
                        value={selectedScheme}
                        onChange={(val) => setSelectedScheme(val)}
                        options={SUBSIDY_SCHEMES.map((s) => ({ value: s.value, label: s.label }))}
                        variant="form"
                        placeholder="Select scheme"
                      />
                    </div>

                    {subsidyInfo && (
                      <>
                        <div className="qs-subsidy-slabs">
                          {subsidyInfo.slabs.map((slab, idx) => {
                            const kW = slab.range.includes('–')
                              ? slab.range.split('–')[1]?.replace(' kW', '').trim()
                              : slab.range.replace(' kW', '').trim();
                            return (
                              <div key={idx} className="qs-subsidy-slab-row">
                                <div className="qs-subsidy-slab-info">
                                  <span className="qs-subsidy-slab-label">{slab.label}</span>
                                  <span className="qs-subsidy-slab-range">{slab.range}</span>
                                </div>
                                <div className="qs-subsidy-slab-calc">
                                  <span className="qs-subsidy-slab-rate">₹{slab.rate.toLocaleString('en-IN')}/kW</span>
                                  {slab.percent != null && (
                                    <span className="qs-subsidy-slab-rate" style={{ marginLeft: 4 }}>({slab.percent}%)</span>
                                  )}
                                  <span className="qs-subsidy-slab-eq">×</span>
                                  <span className="qs-subsidy-slab-unit">{kW} kW</span>
                                  <span className="qs-subsidy-slab-eq">=</span>
                                  <span className="qs-subsidy-slab-amount">₹{slab.amount.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="qs-subsidy-total">
                          <span>Estimated Subsidy Amount</span>
                          <span className="qs-subsidy-total-value">₹{subsidyInfo.subsidyAmount.toLocaleString('en-IN')}</span>
                        </div>

                        {subsidyInfo.capped && (
                          <div className="qs-subsidy-cap-note">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {subsidyInfo.note}
                          </div>
                        )}
                      </>
                    )}

                    <p className="qs-subsidy-disclaimer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                      </svg>
                      This is an estimate for customer reference only. Grand Total remains unchanged. Actual subsidy is subject to government verification and approval.
                    </p>
                  </div>
                )}

                <div className="qs-items-section">
                  <h4>Component-wise pricing <span style={{ color: "#ef4444" }}>*</span></h4>
                  <div className="qs-pc">
                    {products.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                        {/* Row 1: Category & Vendor Filters */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <Dropdown
                              value={selectedCat}
                              onChange={(val) => { setSelectedCat(val); setSelectedProdKey(""); setSelectedVendorFilter(""); }}
                              options={[
                                { value: "", label: "All Categories" },
                                ...productCategories.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` }))
                              ]}
                              placeholder="All Categories"
                              variant="form"
                            />
                          </div>
                          <div>
                            <Dropdown
                              value={selectedVendorFilter}
                              onChange={(val) => setSelectedVendorFilter(val)}
                              options={[
                                { value: "", label: "All Vendors" },
                                ...[...new Set(
                                  products
                                    .filter((p) => !selectedCat || p.category === selectedCat)
                                    .map((p) => productVendorOf(p))
                                    .filter(Boolean)
                                )].sort().map((v) => ({ value: v, label: v }))
                              ]}
                              placeholder="All Vendors"
                              variant="form"
                            />
                          </div>
                        </div>

                        {/* Row 2: Product Selector (Full Width) + Add Button */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Dropdown
                              value={selectedProdKey}
                              onChange={(val) => setSelectedProdKey(val)}
                              options={[
                                { value: "", label: "Select product" },
                                ...products
                                  .filter((p) => !selectedCat || p.category === selectedCat)
                                  .filter((p) => !selectedVendorFilter || (productVendorOf(p) || "").toLowerCase() === selectedVendorFilter.toLowerCase())
                                  .map((p) => ({
                                    value: p.productId,
                                    label: `${p.name}${p.brand ? ` (${p.brand})` : ""} — ${fmt(p.price)}${p.costPrice != null ? ` [Cost: ${fmt(p.costPrice)}]` : ""}${effStockOf(p.productId) === 0 ? " [Out of stock]" : ""}`,
                                    disabled: effStockOf(p.productId) === 0
                                  }))
                              ]}
                              placeholder="Select product"
                              variant="form"
                              searchable
                              searchPlaceholder="Search products"
                            />
                          </div>
                          <div style={{ flex: '0 0 auto' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedProdKey && !items[selectedProdKey]) {
                                  tog(selectedProdKey);
                                  setSelectedProdKey("");
                                }
                              }}
                              disabled={!selectedProdKey || !!items[selectedProdKey] || effStockOf(selectedProdKey) === 0}
                              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: !selectedProdKey || !!items[selectedProdKey] ? '#d1d5db' : '#2c5364', color: '#fff', fontWeight: 600, fontSize: 13, cursor: !selectedProdKey || !!items[selectedProdKey] ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', height: '42px' }}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Price reference table for negotiation */}
                    {selectedCat && (
                      <div style={{ marginTop: 10, marginBottom: 6 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px' }}>Price Reference ({selectedCat})</p>
                        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Product</th>
                                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Vendor</th>
                                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#16a34a', borderBottom: '1px solid #e5e7eb' }}>Cost Price</th>
                                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#2563eb', borderBottom: '1px solid #e5e7eb' }}>Selling Price</th>
                                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Margin</th>
                                <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {products
                                .filter((p) => p.category === selectedCat)
                                .filter((p) => !selectedVendorFilter || (productVendorOf(p) || '').toLowerCase() === selectedVendorFilter.toLowerCase())
                                .filter((p) => !selectedProdKey || p.productId === selectedProdKey)
                                .map((p) => {
                                  const stock = effStockOf(p.productId);
                                  const cp = p.costPrice;
                                  const sp = p.price;
                                  const margin = cp != null && sp > 0 ? sp - cp : null;
                                  const marginPct = cp != null && cp > 0 && sp > 0 ? Math.round(((sp - cp) / cp) * 100) : null;
                                  return (
                                    <tr key={p.productId} style={{ background: items[p.productId] ? '#f0fdf4' : '#fff' }}>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', color: '#1a2332', fontWeight: 500 }}>{p.name}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{productVendorOf(p) || '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{cp != null ? fmt(cp) : '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{fmt(sp)}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: margin != null ? (margin >= 0 ? '#16a34a' : '#dc2626') : '#9ca3af', fontWeight: 600 }}>
                                        {margin != null ? `${fmt(margin)} (${marginPct}%)` : '—'}
                                      </td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', color: stock === 0 ? '#dc2626' : '#6b7280' }}>
                                        {stock === 0 ? 'Out' : stock}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  {Object.entries(items).map(([k, v]) => {
                    const p = productByKey(k);
                    const avail = p ? effStockOf(k) : null;
                    const own = ownQtyOf(k);
                    const base = p ? Number(p.stock) || 0 : 0;
                    const overStock = avail !== null && Number(v.qty) > avail;
                    return (
                      <div key={k} className="qs-il">
                        <span className="qs-il-name">
                          {getItemLabel(k, v)}
                          {p && (
                            <em className={"qs-il-stock" + (avail === 0 ? " qs-il-stock-oos" : "")}>
                              {avail === 0 ? "Out of stock" : own > 0 ? `Quoted: ${own} · Left: ${base}` : `Stock: ${avail}`}
                            </em>
                          )}
                        </span>
                        <input
                          type="number"
                          value={v.qty}
                          onChange={(e) => updateItemField(k, "qty", e.target.value)}
                          className={"qs-ism" + ((Number(v.qty) < 1 || overStock) ? " qs-ism-err" : "")}
                          min="1"
                          max={avail !== null && avail > 0 ? avail : undefined}
                          title={overStock ? `Only ${avail} available for this quotation` : ""}
                        />
                        {Number(v.qty) < 1 && (
                          <span className="qs-il-err">Minimum 1 required</span>
                        )}
                        {overStock && (
                          <span className="qs-il-err">Only {avail} in stock</span>
                        )}
                        <input
                          type="number"
                          value={v.price || ""}
                          onChange={(e) => { const pv = e.target.value; if (pv === "") { updateItemField(k, "price", pv); return; } const n = Number(pv); if (isNaN(n) || n < 0) return; if (n > 10000000000) { updateItemField(k, "price", "10000000000"); return; } updateItemField(k, "price", pv); }}
                          className="qs-imd"
                          min="0"
                        />
                        {p && p.costPrice != null && (
                          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap', padding: '2px 8px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }} title="Cost Price — negotiate above this">
                            Cost: {fmt(p.costPrice)}
                          </span>
                        )}
                        {p && p.costPrice != null && v.price > 0 && (
                          <span style={{ fontSize: 10, color: Number(v.price) < Number(p.costPrice) ? '#dc2626' : '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {Number(v.price) < Number(p.costPrice)
                              ? `⚠ Below cost!`
                              : `Margin: ${fmt(Number(v.price) - Number(p.costPrice))} (${Math.round(((Number(v.price) - Number(p.costPrice)) / Number(p.costPrice)) * 100)}%)`
                            }
                          </span>
                        )}
                        <span className="qs-ilt">{fmt((v.qty || 0) * (v.price || 0))}</span>
                        <button
                          type="button"
                          className="qs-il-remove"
                          onClick={() => removeItem(k)}
                          title="Remove item"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {Object.keys(items).length === 0 && <p className="qs-ni">Add components above</p>}
                  {itemsError && <span className="form-field-error">{itemsError}</span>}
                </div>

                <div className="qs-sum">
                  <div className="qs-sr"><span>Total</span><span>{fmt(liveTotals.total)}</span></div>
                  <div className="qs-sr"><span>GST {GST_RATE}%</span><span>{fmt(liveTotals.gst)}</span></div>
                  <div className="qs-sr qs-sg"><span>Grand Total</span><span>{fmt(liveTotals.grandTotal)}</span></div>
                </div>
              </div>
              <div className="qs-modal-actions">
                <button
                  type="button"
                  className="qs-cancel-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="qs-save-btn" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="qs-btn-spinner"></span>
                      <span>Saving...</span>
                    </>
                  ) : edit ? (
                    "Update Quotation"
                  ) : (
                    "Add Quotation"
                  )}
                </button>
              </div>
            </form>
          </div>
      </div>
      )}

      {showDeleteDialog && (
        <ConfirmDialog
          isOpen={showDeleteDialog}
          title="Delete Quotation"
          message="Are you sure you want to delete this quotation?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
          loading={deleteLoading}
        />
      )}

      {showApproveDialog && (
        <ConfirmDialog
          isOpen={showApproveDialog}
          title="Approve Quotation"
          message="Are you sure you want to approve this quotation? This locks the quotation and creates a project approval."
          confirmLabel="Approve"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={handleApprove}
          onCancel={() => { setShowApproveDialog(false); setApproveTarget(null); }}
        />
      )}

      {showDesignModal && renderDesignModal()}

      {viewModal && viewQ && (() => {
        const versions = (Array.isArray(viewQ.versions) && viewQ.versions.length > 0)
          ? viewQ.versions
          : [{
              version: viewQ.version || 1,
              items: viewQ.items || {},
              total: viewQ.total || 0,
              gst: viewQ.gst || 0,
              grandTotal: viewQ.grandTotal || 0,
              status: viewQ.status || "Draft",
              validUntil: viewQ.validUntil || "",
              customerResponse: viewQ.customerResponse || {},
              createdAt: viewQ.createdAt || "",
              notes: "Initial Version"
            }];

        const activeIdx = Math.min(Math.max(0, selectedVersionIndex), versions.length - 1);
        const activeV = versions[activeIdx] || versions[0];
        const isLatest = activeIdx === versions.length - 1;
        const activeItems = activeV.items || {};

        // Resolve customer response (from active version snapshot or top-level viewQ)
        const resp = activeV.customerResponse?.action
          ? activeV.customerResponse
          : (isLatest ? viewQ.customerResponse : null);

        return (
          <div className="vm-overlay">
            <div className="vm-view-modal" style={{ maxWidth: "780px" }}>
              {/* Header */}
              <div className="vm-modal-header">
                <div className="vm-modal-title">
                  <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    Quotation Details — {viewQ.quotationId || viewQ.id}
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", background: "#e2e8f0", color: "#334155", borderRadius: 6 }}>
                      v{activeV.version || viewQ.version}
                    </span>
                    {isLatest && (
                      <span className="qs-vtab-badge-latest">Latest</span>
                    )}
                  </h3>
                </div>
                <button className="vm-modal-close" onClick={() => setViewModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Version Navigation Bar (Tabs) if multiple versions exist */}
              {versions.length > 1 && (
                <div className="qs-version-tabs-header">
                  <div className="qs-version-tabs-content">
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Versions ({versions.length}):
                  </span>
                  {versions.map((v, idx) => {
                    const isCurrentTab = idx === activeIdx;
                    const isLastTab = idx === versions.length - 1;
                    return (
                      <button
                        key={`vtab-${idx}`}
                        type="button"
                        className={`qs-vtab-btn ${isCurrentTab ? "active" : ""}`}
                        onClick={() => setSelectedVersionIndex(idx)}
                      >
                        <span>v{v.version}</span>
                        <span className="qs-vtab-price">{fmt(v.grandTotal)}</span>
                        {isLastTab && <span className="qs-vtab-badge-latest">Latest</span>}
                      </button>
                    );
                  })}
                </div>
                </div>
              )}

              <div className="vm-view-body">
                {/* Historical Snapshot Warning Banner */}
                {!isLatest && (
                  <div className="qs-history-banner">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      Viewing historical snapshot of <strong>Version {activeV.version}</strong> created on{" "}
                      {activeV.createdAt ? formatDate(activeV.createdAt.substring(0, 10)) : "—"}. Switch to Version {versions[versions.length - 1].version} for the current active quotation.
                    </span>
                  </div>
                )}

                {/* Section 1: Whole Quotation Information */}
                <div className="qs-view-section">
                  <div className="qs-vw-section-title">
                    <span className="qs-vw-section-num">1</span>
                    <h4>Whole Quotation Information</h4>
                  </div>
                  <div className="qs-view-grid">
                    <div className="qs-view-item">
                      <span className="qs-view-label">Client Name</span>
                      <span className="qs-view-value">{viewQ.client}</span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Project Name</span>
                      <span className="qs-view-value">
                        {viewQ.projectName || "—"}
                        {viewQ.type === "Material Request" && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                            Material Request
                          </span>
                        )}
                        {viewQ.type === "Remaining Products" && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: '#dbeafe', color: '#1e40af' }}>
                            Remaining Products
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Status</span>
                      <span className={"qs-status-pill " + sc(activeV.status || viewQ.status)}>
                        {activeV.status || viewQ.status}
                      </span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Quotation Version</span>
                      <span className="qs-view-value">
                        v{activeV.version || viewQ.version} of v{viewQ.version || versions.length}
                      </span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Valid Until</span>
                      <span className="qs-view-value">
                        {formatDate(activeV.validUntil || viewQ.validUntil) || "—"}
                      </span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Approved By</span>
                      <span className="qs-view-value">{viewQ.approvedBy || "Pending"}</span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Lead ID</span>
                      <span className="qs-view-value">{viewQ.leadId || "—"}</span>
                    </div>
                    <div className="qs-view-item">
                      <span className="qs-view-label">Design ID</span>
                      <span className="qs-view-value">{viewQ.designId || "—"}</span>
                    </div>
                    {viewQ.emailSentAt && (
                      <div className="qs-view-item">
                        <span className="qs-view-label">Email Sent</span>
                        <span className="qs-view-value">{new Date(viewQ.emailSentAt).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Customer Response Section */}
                {resp?.action && (
                  <div className={`qs-response-card ${resp.action.toLowerCase()}`}>
                    <div className="qs-vw-section-title" style={{ marginBottom: 12 }}>
                      <span className="qs-vw-section-num" style={{
                        background: resp.action === 'Approved' ? '#16a34a' : resp.action === 'Rejected' ? '#dc2626' : '#ca8a04',
                        color: '#ffffff'
                      }}>★</span>
                      <h4 style={{ color: resp.action === 'Approved' ? '#15803d' : resp.action === 'Rejected' ? '#b91c1c' : '#a16207' }}>
                        Customer Response &amp; Feedback
                      </h4>
                    </div>
                    <div className="qs-view-grid">
                      <div className="qs-view-item">
                        <span className="qs-view-label">Customer Action</span>
                        <span className="qs-view-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 12px', borderRadius: 14, fontSize: 12, fontWeight: 700,
                            background: resp.action === 'Approved' ? '#dcfce7' : resp.action === 'Rejected' ? '#fee2e2' : '#fef9c3',
                            color: resp.action === 'Approved' ? '#15803d' : resp.action === 'Rejected' ? '#b91c1c' : '#a16207'
                          }}>
                            {resp.action === 'Approved' && '✅ Approved'}
                            {resp.action === 'Rejected' && '❌ Rejected'}
                            {resp.action === 'Negotiating' && '💬 Negotiation Requested'}
                          </span>
                        </span>
                      </div>
                      {resp.respondedAt && (
                        <div className="qs-view-item">
                          <span className="qs-view-label">Response Date &amp; Time</span>
                          <span className="qs-view-value">{new Date(resp.respondedAt).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {resp.signature && (
                        <div className="qs-view-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="qs-view-label">Digital Signature</span>
                          <div style={{ display: 'inline-block', background: '#fff', border: '2px solid #cbd5e1', borderRadius: 10, padding: '12px 16px', marginTop: 6 }}>
                            <img src={resp.signature} alt="Customer Signature" style={{ maxWidth: 320, display: 'block' }} />
                          </div>
                        </div>
                      )}
                      {resp.reason && (
                        <div className="qs-view-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="qs-view-label">Reason / Negotiation Feedback</span>
                          <div style={{
                            marginTop: 6, padding: '12px 16px',
                            background: resp.action === 'Rejected' ? '#fef2f2' : resp.action === 'Negotiating' ? '#fefce8' : '#ffffff',
                            border: '1px solid ' + (resp.action === 'Rejected' ? '#fca5a5' : resp.action === 'Negotiating' ? '#fde047' : '#e2e8f0'),
                            borderRadius: 8
                          }}>
                            <span className="qs-view-value" style={{ whiteSpace: 'pre-wrap', color: '#1e293b', fontSize: 13, fontWeight: 500 }}>
                              "{resp.reason}"
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Section 3: Component Pricing Table for selected version */}
                <div className="qs-view-section">
                  <div className="qs-vw-section-title">
                    <span className="qs-vw-section-num">2</span>
                    <h4>Component Pricing (Version {activeV.version})</h4>
                  </div>
                  <div className="qs-view-table-wrap">
                    <table className="qs-view-table">
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(activeItems).map(([k, v]) => (
                          <tr key={k}>
                            <td className="qs-vw-td-name">{getItemLabel(k, v)}</td>
                            <td>{v?.qty}</td>
                            <td>{fmt(v?.price)}</td>
                            <td className="qs-vw-td-total">{fmt((v?.qty || 0) * (v?.price || 0))}</td>
                          </tr>
                        ))}
                        {Object.keys(activeItems).length === 0 && (
                          <tr>
                            <td colSpan={4} className="qs-e">No components</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="qs-vw-summary" style={{ marginTop: 14 }}>
                    <div className="qs-vw-sum-row">
                      <span>Subtotal</span>
                      <span>{fmt(activeV.total)}</span>
                    </div>
                    <div className="qs-vw-sum-row">
                      <span>GST ({GST_RATE}%)</span>
                      <span style={{ color: "#2563eb" }}>+{fmt(activeV.gst)}</span>
                    </div>
                    <div className="qs-vw-sum-row qs-vw-sum-grand">
                      <span>Grand Total (v{activeV.version})</span>
                      <span>{fmt(activeV.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Subsidy Estimate Section */}
                {viewQ.capacity > 0 && (
                  <div className="qs-view-section qs-view-subsidy">
                    <div className="qs-vw-section-title">
                      <span className="qs-vw-section-num" style={{ background: '#059669' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                      </span>
                      <h4>Subsidy Estimate — {(viewQ.subsidyInfo && viewQ.subsidyInfo.schemeName) || 'PM Surya Ghar Yojana'}</h4>
                    </div>
                    <div className="qs-view-grid" style={{ marginBottom: 12 }}>
                      <div className="qs-view-item">
                        <span className="qs-view-label">System Capacity</span>
                        <span className="qs-view-value" style={{ color: '#059669' }}>{viewQ.capacity} kW</span>
                      </div>
                      <div className="qs-view-item">
                        <span className="qs-view-label">Estimated Subsidy</span>
                        <span className="qs-view-value" style={{ color: '#059669', fontWeight: 700 }}>
                          ₹{((viewQ.subsidyInfo && viewQ.subsidyInfo.subsidyAmount) || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                    {viewQ.subsidyInfo && viewQ.subsidyInfo.slabs && viewQ.subsidyInfo.slabs.length > 0 && (
                      <div className="qs-subsidy-slabs" style={{ marginBottom: 10 }}>
                        {viewQ.subsidyInfo.slabs.map((slab, idx) => {
                          const kW = slab.range.includes('–')
                            ? slab.range.split('–')[1]?.replace(' kW', '').trim()
                            : slab.range.replace(' kW', '').trim();
                          return (
                            <div key={idx} className="qs-subsidy-slab-row">
                              <div className="qs-subsidy-slab-info">
                                <span className="qs-subsidy-slab-label">{slab.label}</span>
                                <span className="qs-subsidy-slab-range">{slab.range}</span>
                              </div>
                              <div className="qs-subsidy-slab-calc">
                                <span className="qs-subsidy-slab-rate">₹{slab.rate.toLocaleString('en-IN')}/kW</span>
                                {slab.percent != null && (
                                  <span className="qs-subsidy-slab-rate" style={{ marginLeft: 4 }}>({slab.percent}%)</span>
                                )}
                                <span className="qs-subsidy-slab-eq">×</span>
                                <span className="qs-subsidy-slab-unit">{kW} kW</span>
                                <span className="qs-subsidy-slab-eq">=</span>
                                <span className="qs-subsidy-slab-amount">₹{slab.amount.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {viewQ.subsidyInfo && viewQ.subsidyInfo.note && (
                      <p className="qs-subsidy-disclaimer" style={{ margin: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                        </svg>
                        {viewQ.subsidyInfo.note}
                      </p>
                    )}
                  </div>
                )}

                {/* Requested (NEW) Items Section */}
                {viewQ.requestedItems && viewQ.requestedItems.length > 0 && (
                  <div className="qs-view-section qs-view-section-new">
                    <div className="qs-vw-section-title">
                      <span className="qs-vw-section-num qs-vw-section-num-new">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                      <h4>Added Items (Material Requests)</h4>
                    </div>
                    <div className="qs-view-table-wrap">
                      <table className="qs-view-table qs-view-table-new">
                        <thead>
                          <tr>
                            <th>Component</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Subtotal</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewQ.requestedItems.map((r, idx) => (
                            <tr key={`req-${idx}`} className={
                              r.status === 'Pending' ? 'qs-vw-tr-new' :
                              r.status === 'Approved' ? 'qs-vw-tr-approved' : 'qs-vw-tr-rejected'
                            }>
                              <td className="qs-vw-td-name">
                                {r.label || r.productName || 'New Item'}
                                <span className="qs-new-badge">NEW</span>
                              </td>
                              <td>{r.qty || 0}</td>
                              <td>{fmt(r.price || 0)}</td>
                              <td className="qs-vw-td-total">{fmt((r.qty || 0) * (r.price || 0))}</td>
                              <td>
                                <span className={`qs-request-status qs-request-status-${(r.status || 'Pending').toLowerCase()}`}>
                                  {r.status === 'Pending' && '⏳ '}
                                  {r.status === 'Approved' && '✅ '}
                                  {r.status === 'Rejected' && '❌ '}
                                  {r.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Section 4: All Versions History & Price Negotiation Trail */}
                {versions.length > 0 && (
                  <div className="qs-view-section">
                    <div className="qs-vw-section-title">
                      <span className="qs-vw-section-num" style={{ background: "#475569" }}>3</span>
                      <h4>All Versions &amp; Negotiation History ({versions.length})</h4>
                    </div>
                    <div className="qs-ver-table-wrap">
                      <table className="qs-ver-table">
                        <thead>
                          <tr>
                            <th>Version</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Grand Total</th>
                            <th>Price Change</th>
                            <th>Customer Response / Notes</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((v, idx) => {
                            const prevV = idx > 0 ? versions[idx - 1] : null;
                            const diff = prevV ? (v.grandTotal || 0) - (prevV.grandTotal || 0) : 0;
                            const isSelected = idx === activeIdx;
                            const vResp = v.customerResponse?.action ? v.customerResponse : null;

                            return (
                              <tr key={`ver-row-${idx}`} className={isSelected ? "active-row" : ""}>
                                <td>
                                  <span style={{ fontWeight: 700, color: "#1e293b" }}>v{v.version}</span>
                                  {idx === versions.length - 1 && (
                                    <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", background: "#10b981", color: "#fff", borderRadius: 4, fontWeight: 700 }}>
                                      LATEST
                                    </span>
                                  )}
                                </td>
                                <td>{v.createdAt ? formatDate(v.createdAt.substring(0, 10)) : "—"}</td>
                                <td>
                                  <span className={"qs-status-pill " + sc(v.status)}>
                                    {v.status || "Draft"}
                                  </span>
                                </td>
                                <td>
                                  <strong style={{ color: "#059669" }}>{fmt(v.grandTotal)}</strong>
                                </td>
                                <td>
                                  {idx === 0 ? (
                                    <span className="qs-diff-badge qs-diff-same">Initial</span>
                                  ) : diff < 0 ? (
                                    <span className="qs-diff-badge qs-diff-drop" title="Price reduced after negotiation">
                                      📉 -{fmt(Math.abs(diff))}
                                    </span>
                                  ) : diff > 0 ? (
                                    <span className="qs-diff-badge qs-diff-raise" title="Price increased">
                                      📈 +{fmt(diff)}
                                    </span>
                                  ) : (
                                    <span className="qs-diff-badge qs-diff-same">No Change</span>
                                  )}
                                </td>
                                <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {vResp ? (
                                    <span style={{
                                      fontSize: 11, fontWeight: 600,
                                      color: vResp.action === 'Approved' ? '#16a34a' : vResp.action === 'Rejected' ? '#dc2626' : '#ca8a04'
                                    }}>
                                      {vResp.action === 'Approved' && '✅ Approved'}
                                      {vResp.action === 'Rejected' && '❌ Rejected'}
                                      {vResp.action === 'Negotiating' && `💬 Negotiating: ${vResp.reason || ''}`}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "#64748b" }}>{v.notes || "Standard version"}</span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedVersionIndex(idx)}
                                    style={{
                                      padding: "3px 10px",
                                      border: isSelected ? "1px solid #2c5364" : "1px solid #cbd5e1",
                                      borderRadius: 6,
                                      background: isSelected ? "#2c5364" : "#ffffff",
                                      color: isSelected ? "#ffffff" : "#475569",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer"
                                    }}
                                  >
                                    {isSelected ? "Viewing" : "View"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* View Footer */}
              <div className="vm-modal-footer">
                <button className="vm-btn-close" onClick={() => setViewModal(false)}>Close</button>
                <button className="vm-btn-primary" onClick={() => { downloadQuotationLog(viewQ); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  View Report
                </button>
              </div>
            </div>
          </div>
        );
      })()}
        {/* ); */}
      {/* })()} */}
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
                  {showLogModal.quotationId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Status</span>
                    <span className={`cm-status-badge cm-status-${(showLogModal.status || "").toLowerCase()}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.status || "Draft"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date Created</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.createdAt ? new Date(showLogModal.createdAt).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Valid Until</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.validUntil ? new Date(showLogModal.validUntil).toLocaleDateString("en-IN") : "Not set"}
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
                  Quotation Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Client Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.client}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Project Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.projectName || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Lead ID Reference</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.leadId || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Quotation Version</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>v{showLogModal.version || 1}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Subtotal</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{fmt(showLogModal.total || 0)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>GST ({GST_RATE}%)</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{fmt(showLogModal.gst || 0)}</div>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Grand Total Amount</div>
                    <div style={{ fontWeight: "600", color: "#2563eb", fontSize: "15px", marginTop: "2px" }}>{fmt(showLogModal.grandTotal || 0)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadQuotationLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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
  );
};

export default Quotations;