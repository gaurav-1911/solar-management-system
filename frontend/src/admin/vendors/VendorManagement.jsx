import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { vendorSchema } from "../../utils/AdminValidation";
import { vendorAPI, purchaseOrderAPI, vendorPaymentAPI, inventoryAPI, productAPI, leadAPI } from "../../services/api";
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import "./VendorManagement.css";
import { Dropdown, Pagination, ConfirmDialog } from "../../components/common";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { titleCaseCategory, sortCategories, sortById } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";



const COLORS = ["#2c5364", "#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#9333ea"];

const TABS = [
  { id: "vendors", label: "Vendors" },
  { id: "purchase-orders", label: "Purchase Orders" },
  { id: "payments", label: "Payments" },
  { id: "performance", label: "Performance" },
];
// Categories offered in the Add/Edit Vendor form come from the Inventory
// page's category list (same values as the inventory model's enum) so a
// vendor's categories line up with what inventory items actually use.
const INVENTORY_CATEGORIES = [
  "Panels",
  "Inverters",
  "Batteries",
  "Accessories",
  "Mounting",
  "Wiring",
  "Controllers",
];
const toVendor = (v) => ({
  ...v,
  id:
    v.vendorId ||
    `VND-${String(v._id || "").slice(-4).toUpperCase() || "0000"}`,
  rating: v.rating ?? 0,
  totalOrders: v.totalOrders ?? 0,
  totalSpend: v.totalSpend ?? 0,
  deliveryScore: v.deliveryScore ?? 0,
  qualityScore: v.qualityScore ?? 0,
  responseTime: v.responseTime ?? 0,
});

const getVendorCategories = (v) => {
  if (Array.isArray(v?.categories) && v.categories.length) {
    return v.categories.filter(Boolean);
  }
  return v?.category ? [v.category] : [];
};

// Maps a server purchase order document into the shape this page expects. The
// display id falls back to the stored sequential id or a short fragment of the
// Mongo _id when nothing is present.
const toPO = (p) => ({
  ...p,
  id: p.purchaseOrderId || p.id || `PO-${String(p._id || "").slice(-4).toUpperCase() || "0000"}`,
  orderDate: p.orderDate || "",
  expectedDelivery: p.expectedDelivery || "",
  actualDelivery: p.actualDelivery || "",
  total: p.total ?? 0,
});

// Maps a server vendor payment document into the shape this page expects.
const toPayment = (p) => ({
  ...p,
  id: p.paymentId || p.id || `INV-${String(p._id || "").slice(-4).toUpperCase() || "0000"}`,
  poRef: p.poRef || "",
  dueDate: p.dueDate || "",
  paidDate: p.paidDate || "",
  amount: p.amount ?? 0,
});

const VendorManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const [activeTab, setActiveTab] = useState("vendors");
  const [searchQuery, setSearchQuery] = useState("");
   const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewingVendor, setViewingVendor] = useState(null);
  const [poVendorFilter, setPoVendorFilter] = useState("all");
  const [poSearchQuery, setPoSearchQuery] = useState("");
  const [paymentVendorFilter, setPaymentVendorFilter] = useState("all");
  const [paymentSearchQuery, setPaymentSearchQuery] = useState("");
  const [vendorsPage, setVendorsPage] = useState(1);
  const [vendorsPerPage, setVendorsPerPage] = useState(10);
  const [vendorsServerTotal, setVendorsServerTotal] = useState(0);
  const [poPage, setPoPage] = useState(1);
  const [poPerPage, setPoPerPage] = useState(10);
  const [poServerTotal, setPoServerTotal] = useState(0);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPerPage, setPaymentPerPage] = useState(10);
  const [paymentServerTotal, setPaymentServerTotal] = useState(0);

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // Reset internal detail sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setViewingVendor(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  // Purchase order + payment state (CRUD + modal control)
  const [poList, setPoList] = useState([]);
  const [paymentList, setPaymentList] = useState([]);
  const [poLoading, setPoLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [showPOModal, setShowPOModal] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [deletePOTarget, setDeletePOTarget] = useState(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);

  // Vendor CRUD state
  const [vendorsList, setVendorsList] = useState([]);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cross-module inventory & products data for PO selection and auto-restock
  const [inventoryList, setInventoryList] = useState([]);
  const [productsList, setProductsList] = useState([]);

  // Leads from the backend so a purchase order can be linked to the project
  // it is buying materials for (drives actual project cost in Project Progress).
  const [leadsList, setLeadsList] = useState([]);

  // Scroll lock
  const anyModalOpen =
    viewingVendor ||
    showVendorModal ||
    deleteTarget ||
    showPOModal ||
    showPaymentModal ||
    deletePOTarget ||
    deletePaymentTarget;
  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    content.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);

  // Reusable loaders — also called after CRUD so every tab stays in sync with
  // the server (e.g. a new purchase order immediately updates vendor totals).
  const loadVendorsFromServer = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { page: vendorsPage, limit: vendorsPerPage };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await vendorAPI.getAll(params);
      if (response.data?.success) {
        setVendorsList((response.data.data || []).map(toVendor));
        setVendorsServerTotal(response.data?.pagination?.total || (response.data.data || []).length);
      } else {
        toastError(response.data?.message || "Failed to load vendors.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to load vendors from server.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadPOsFromServer = async (silent = false) => {
    if (!silent) setPoLoading(true);
    try {
      const params = { page: poPage, limit: poPerPage };
      if (poSearchQuery.trim()) params.search = poSearchQuery.trim();
      const response = await purchaseOrderAPI.getAll(params);
      if (response.data?.success) {
        setPoList((response.data.data || []).map(toPO));
        setPoServerTotal(response.data?.pagination?.total || (response.data.data || []).length);
      } else {
        toastError(response.data?.message || "Failed to load purchase orders.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to load purchase orders from server.",
      );
    } finally {
      if (!silent) setPoLoading(false);
    }
  };

  useEffect(() => {
    loadVendorsFromServer();
  }, [vendorsPage, vendorsPerPage, searchQuery, statusFilter]);

  useEffect(() => {
    loadPOsFromServer();
  }, [poPage, poPerPage, poSearchQuery]);

  const loadPaymentsFromServer = async (silent = false) => {
    if (!silent) setPaymentLoading(true);
    try {
      const params = { page: paymentPage, limit: paymentPerPage };
      if (paymentSearchQuery.trim()) params.search = paymentSearchQuery.trim();
      const response = await vendorPaymentAPI.getAll(params);
      if (response.data?.success) {
        setPaymentList((response.data.data || []).map(toPayment));
        setPaymentServerTotal(response.data?.pagination?.total || (response.data.data || []).length);
      } else {
        toastError(response.data?.message || "Failed to load payments.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to load payments from server.",
      );
    } finally {
      if (!silent) setPaymentLoading(false);
    }
  };

  // Load vendor payments, inventory items, and products from the backend on mount.
  useEffect(() => {
    loadPaymentsFromServer();
    inventoryAPI.getAll({ limit: 10000 }).then((res) => {
      if (res.data?.success) setInventoryList(res.data.data || []);
    }).catch(() => {});
    productAPI.getAll({ limit: 10000 }).then((res) => {
      if (res.data?.success) setProductsList(res.data.data || []);
    }).catch(() => {});
    leadAPI.getAll({ limit: 10000 }).then((res) => {
      if (res.data?.success) setLeadsList(res.data.data || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalVendors = vendorsList.length;
  const activePOs = poList.filter((p) => ["Pending", "Approved", "Dispatched"].includes(p.status)).length;
  const totalSpend = vendorsList.reduce((sum, v) => sum + v.totalSpend, 0);
  const pendingPayments = paymentList.filter((p) => p.status === "Pending" || p.status === "Overdue");
  const pendingPaymentTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

  // Linked activity for the vendor currently being viewed (detail modal).
  const vendorPayments = viewingVendor
    ? paymentList.filter((p) => p.vendor === viewingVendor.name)
    : [];
  const vendorPaymentsCount = vendorPayments.length;
  const vendorPaidTotal = vendorPayments
    .filter((p) => p.status === "Paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const uniqueCategories = [
    ...new Set(vendorsList.flatMap((v) => getVendorCategories(v))),
  ];
  // Category filter options come from the actual vendor data (with the
  // inventory categories as an offline fallback) so every vendor category is
  // filterable. Options are sorted alphabetically with title-cased labels.
  const actualCategories = uniqueCategories.filter(Boolean);
  const categoryOptions = sortCategories(
    actualCategories.length > 0 ? actualCategories : [...INVENTORY_CATEGORIES],
  );

  // Chart data derived from the live vendor list.
  const vendorSpending = useMemo(
    () =>
      vendorsList.map((v) => ({
        name: v.name.length > 12 ? v.name.substring(0, 10) + "..." : v.name,
        spend: v.totalSpend,
        orders: v.totalOrders,
      })),
    [vendorsList],
  );

  const radarData = useMemo(
    () =>
      vendorsList.slice(0, 6).map((v) => ({
        vendor: v.name.split(" ")[0],
        delivery: v.deliveryScore,
        quality: v.qualityScore,
        response: Math.min(100, Math.round(((24 - v.responseTime) / 24) * 100)),
        rating: v.rating * 20,
      })),
    [vendorsList],
  );

  const vendorCategories = useMemo(() => {
    const countByCategory = {};
    vendorsList.forEach((v) => {
      const cats = getVendorCategories(v);
      (cats.length ? cats : ["Uncategorized"]).forEach((cat) => {
        countByCategory[cat] = (countByCategory[cat] || 0) + 1;
      });
    });
    return Object.entries(countByCategory).map(([name, value]) => ({ name, value }));
  }, [vendorsList]);

  // Guarded average helper so the Performance tab never shows NaN on empty data.
  const averageOf = (selector) =>
    vendorsList.length
      ? vendorsList.reduce((sum, v) => sum + selector(v), 0) / vendorsList.length
      : 0;

  const filteredVendors = useMemo(() => {
    return vendorsList.filter((v) => {
      if (statusFilter !== "all" && v.status.toLowerCase() !== statusFilter) return false;
      if (categoryFilter !== "all" && !getVendorCategories(v).includes(categoryFilter)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          getVendorCategories(v).some((c) => c.toLowerCase().includes(q)) ||
          v.country.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vendorsList, statusFilter, categoryFilter, searchQuery]);

  const filteredPOs = useMemo(() => {
    return poList.filter((p) => {
      if (poVendorFilter !== "all" && p.vendor !== poVendorFilter) return false;
      if (poSearchQuery) {
        const q = poSearchQuery.toLowerCase();
        return (
          (p.id || "").toLowerCase().includes(q) ||
          (p.vendor || "").toLowerCase().includes(q) ||
          (p.items || "").toLowerCase().includes(q) ||
          (p.status || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [poList, poVendorFilter, poSearchQuery]);

  const filteredPayments = useMemo(() => {
    return paymentList.filter((p) => {
      if (paymentVendorFilter !== "all" && p.vendor !== paymentVendorFilter) return false;
      if (paymentSearchQuery) {
        const q = paymentSearchQuery.toLowerCase();
        return (
          (p.id || "").toLowerCase().includes(q) ||
          (p.poRef || "").toLowerCase().includes(q) ||
          (p.vendor || "").toLowerCase().includes(q) ||
          (p.status || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [paymentList, paymentVendorFilter, paymentSearchQuery]);

  // Every selectable category for the vendor form: the inventory categories
  // plus any categories already in use by vendors (so editing legacy data
  // with old labels like "Solar Panels" still works). Sorted alphabetically
  // with title-cased labels for display.
  const allCategoryOptions = useMemo(() => {
    const set = new Set(INVENTORY_CATEGORIES);
    vendorsList.forEach((v) => getVendorCategories(v).forEach((c) => set.add(c)));
    return sortCategories([...set]).map((c) => ({
      value: c,
      label: titleCaseCategory(c),
    }));
  }, [vendorsList]);

  const handleVendorCategoriesChange = (next) => {
    vendorFormik.setFieldValue("categories", next || []);
    vendorFormik.setFieldTouched("categories", true);
    if (next && next.length) vendorFormik.setFieldError("categories", undefined);
  };

  const filteredVendorsTotalPages = Math.max(1, Math.ceil(vendorsServerTotal / vendorsPerPage));

  const filteredPOsTotalPages = Math.max(1, Math.ceil(poServerTotal / poPerPage));

  const filteredPaymentsTotalPages = Math.max(1, Math.ceil(paymentServerTotal / paymentPerPage));

  /* ────────── Vendor Formik ────────── */
  function getVendorInitialValues(vendor) {
    if (vendor) {
      return {
        name: vendor.name || "",
        categories: getVendorCategories(vendor),
        country: vendor.country || "",
        contactPerson: vendor.contactPerson || "",
        contactEmail: vendor.contactEmail || "",
        contactPhone: vendor.contactPhone || "",
        address: vendor.address || "",
        paymentTerms: vendor.paymentTerms || "Net 30",
        status: vendor.status || "Active",
        rating: vendor.rating ?? 0,
        deliveryScore: vendor.deliveryScore ?? 0,
        qualityScore: vendor.qualityScore ?? 0,
        responseTime: vendor.responseTime ?? 0,
      };
    }
    return {
      name: "",
      categories: [INVENTORY_CATEGORIES[0]],
      country: "",
      contactPerson: "",
      contactEmail: "",
      contactPhone: "",
      address: "",
      paymentTerms: "Net 30",
      status: "Active",
      rating: 0,
      deliveryScore: 0,
      qualityScore: 0,
      responseTime: 0,
    };
  }

  const vendorFormik = useFormik({
    initialValues: getVendorInitialValues(editingVendor),
    validationSchema: vendorSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      const categories = (values.categories || []).filter(Boolean);
      const data = {
        name: values.name.trim(),
        categories,
        // Legacy single-category field stays in sync (first category) so older
        // consumers that read `vendor.category` keep working.
        category: categories[0] || "",
        country: values.country.trim(),
        contactPerson: values.contactPerson.trim(),
        contactEmail: values.contactEmail.trim(),
        contactPhone: "+91" + (values.contactPhone || "").replace(/\D/g, ""),
        address: values.address.trim(),
        paymentTerms: values.paymentTerms,
        status: values.status,
        rating: Number(values.rating) || 0,
        qualityScore: Number(values.qualityScore) || 0,
        responseTime: Number(values.responseTime) || 0,
        since: new Date().getFullYear(),
      };

      try {
        if (editingVendor) {
          const response = await vendorAPI.update(editingVendor._id || editingVendor.id, data);
          if (response.data?.success) {
            const updated = toVendor(response.data.data);
            setVendorsList((prev) =>
              prev.map((v) => (v.id === editingVendor.id ? updated : v)),
            );
            success(response.data.message || `Vendor ${editingVendor.name} updated successfully.`);
            setEditingVendor(null);
            setShowVendorModal(false);
            // A rename cascades to POs/payments server-side — refresh to show it.
            loadVendorsFromServer(true);
            loadPOsFromServer(true);
            loadPaymentsFromServer(true);
          } else {
            toastError(response.data?.message || "Failed to update vendor.");
          }
        } else {
          const response = await vendorAPI.create(data);
          if (response.data?.success) {
            setVendorsList((prev) => [...prev, toVendor(response.data.data)]);
            success(response.data.message || `Vendor ${data.name} created successfully.`);
            setShowVendorModal(false);
            loadVendorsFromServer(true);
          } else {
            toastError(response.data?.message || "Failed to create vendor.");
          }
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to save vendor. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const openVendorModal = (vendor = null) => {
    setEditingVendor(vendor);
    setShowVendorModal(true);
  };

  const handleDeleteVendor = async () => {
    if (!deleteTarget) return;
    try {
      const response = await vendorAPI.delete(deleteTarget._id || deleteTarget.id);
      if (response.data?.success) {
        setVendorsList((prev) => prev.filter((v) => v.id !== deleteTarget.id));
        success(response.data.message || `Vendor ${deleteTarget.name} deleted.`);
        loadVendorsFromServer(true);
        loadPOsFromServer(true);
      } else {
        toastError(response.data?.message || "Failed to delete vendor.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete vendor. Please try again.",
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  /* ────────── Purchase Order Formik ────────── */
  function getPOInitialValues(po) {
    if (po) {
      return {
        vendor: po.vendor || "",
        leadId: po.leadId || "",
        items: po.items || "",
        total: po.total ?? "",
        orderDate: po.orderDate || "",
        expectedDelivery: po.expectedDelivery || "",
        actualDelivery: po.actualDelivery || "",
        status: po.status || "Pending",
        poItemPick: "",
      };
    }
    return {
      vendor: vendorsList.length ? vendorsList[0].name : "",
      leadId: "",
      items: "",
      total: "",
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDelivery: "",
      actualDelivery: "",
      status: "Pending",
      poItemPick: "",
    };
  }

  const poFormik = useFormik({
    initialValues: getPOInitialValues(editingPO),
    enableReinitialize: true,
    validate: (values) => {
      const errors = {};
      if (!values.vendor.trim()) errors.vendor = "Vendor is required";
      if (!values.items.trim()) errors.items = "Items description is required";
      if (values.total === "" || values.total === null || Number(values.total) < 0) {
        errors.total = "Enter a valid order total";
      }
      return errors;
    },
    onSubmit: async (values, { setSubmitting }) => {
      const vendorForPO = vendorsList.find((v) => v.name === values.vendor.trim());
      const data = {
        vendor: values.vendor.trim(),
        vendorId: vendorForPO?._id || null,
        leadId: values.leadId || "",
        items: values.items.trim(),
        total: Number(values.total),
        orderDate: values.orderDate,
        expectedDelivery: values.expectedDelivery,
        actualDelivery: values.actualDelivery || "",
        status: values.status,
      };

      try {
        // Auto-restock inventory stock when a PO is delivered. `shouldRestock`
        // is true only when stock should actually be added: a freshly created
        // PO marked Delivered, or an edit that transitions the PO TO Delivered
        // — so re-saving an already-delivered PO never double-restocks.
        const handlePOAutoRestock = async (poData, shouldRestock) => {
          if (!shouldRestock || poData.status !== "Delivered") return;
          try {
            const itemQuery = (poData.items || "").toLowerCase();
            const invRes = await inventoryAPI.getAll({ limit: 10000 });
            const allInv = invRes.data?.data || [];
            // 1) Exact match: the full inventory name or SKU appears in the PO.
            const matchedInv =
              allInv.find((inv) => {
                const invName = (inv.name || "").toLowerCase();
                const invSku = (inv.sku || "").toLowerCase();
                return (
                  (invName && itemQuery.includes(invName)) ||
                  (invSku && itemQuery.includes(invSku))
                );
              }) ||
              // 2) Token fallback: at least 2 significant words of the inventory
              // name must appear in the PO description (handles spec-heavy names
              // like "BYD HVS 10.2kWh Battery Units"). Among all candidates pick
              // the most specific one (most matching tokens) to avoid restocking
              // the wrong item on a loose overlap.
              allInv
                .map((inv) => {
                  const invName = (inv.name || "").toLowerCase();
                  const tokens = invName
                    .split(/[^a-z0-9.]+/)
                    .filter(
                      (t) =>
                        t.length > 2 &&
                        !["unit", "units", "system", "kit", "kits", "set", "sets", "panel", "panels"].includes(t),
                    );
                  return { inv, tokens };
                })
                .filter(
                  ({ tokens }) =>
                    tokens.length >= 2 && tokens.every((t) => itemQuery.includes(t)),
                )
                .sort((a, b) => b.tokens.length - a.tokens.length)
                .map(({ inv }) => inv)[0];
            if (matchedInv) {
              const qtyMatch = poData.items.match(/(\d+)\s*(x|pcs|units|nos)?/i);
              const addedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10;
              const newQty = (matchedInv.quantity || 0) + addedQty;
              await inventoryAPI.update(matchedInv._id, {
                quantity: newQty,
                lastRestocked: new Date(),
              });
              success(`📦 Inventory Restocked: Added ${addedQty} units to "${matchedInv.name}" (New Stock: ${newQty})`);
            }
          } catch {
            // ignore restock errors
          }
        };

        if (editingPO) {
          const response = await purchaseOrderAPI.update(editingPO._id || editingPO.id, data);
          if (response.data?.success) {
            const updated = toPO(response.data.data);
            setPoList((prev) => prev.map((p) => (p.id === editingPO.id ? updated : p)));
            success(response.data.message || `Purchase order ${editingPO.id} updated successfully.`);
            // Restock only when this edit transitions the PO to Delivered.
            handlePOAutoRestock(data, data.status === "Delivered" && editingPO.status !== "Delivered");
            setEditingPO(null);
            setShowPOModal(false);
            // Keep the vendor totals and the payment PO picker in sync.
            loadVendorsFromServer(true);
            loadPOsFromServer(true);
          } else {
            toastError(response.data?.message || "Failed to update purchase order.");
          }
        } else {
          const response = await purchaseOrderAPI.create(data);
          if (response.data?.success) {
            setPoList((prev) => [toPO(response.data.data), ...prev]);
            success(response.data.message || `Purchase order for ${data.vendor} created successfully.`);
            // A freshly created PO that's already Delivered restocks inventory.
            handlePOAutoRestock(data, data.status === "Delivered");
            setShowPOModal(false);
            // Keep the vendor totals and the payment PO picker in sync.
            loadVendorsFromServer(true);
            loadPOsFromServer(true);
          } else {
            toastError(response.data?.message || "Failed to create purchase order.");
          }
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to save purchase order. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const openPOModal = (po = null) => {
    setEditingPO(po);
    setShowPOModal(true);
  };

  const handleDeletePO = async () => {
    if (!deletePOTarget) return;
    try {
      const response = await purchaseOrderAPI.delete(deletePOTarget._id || deletePOTarget.id);
      if (response.data?.success) {
        setPoList((prev) => prev.filter((p) => p.id !== deletePOTarget.id));
        success(response.data.message || `Purchase order ${deletePOTarget.id} deleted.`);
        // Reflect the deletion in the vendor totals and the payment PO picker.
        loadVendorsFromServer(true);
        loadPOsFromServer(true);
      } else {
        toastError(response.data?.message || "Failed to delete purchase order.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete purchase order. Please try again.",
      );
    } finally {
      setDeletePOTarget(null);
    }
  };

  /* ────────── Payment Formik ────────── */
  function getPaymentInitialValues(payment) {
    if (payment) {
      return {
        vendor: payment.vendor || "",
        poRef: payment.poRef || "",
        amount: payment.amount ?? "",
        dueDate: payment.dueDate || "",
        paidDate: payment.paidDate || "",
        status: payment.status || "Pending",
      };
    }
    return {
      vendor: "",
      poRef: "",
      amount: "",
      dueDate: "",
      paidDate: "",
      status: "Pending",
    };
  }

  const paymentFormik = useFormik({
    initialValues: getPaymentInitialValues(editingPayment),
    enableReinitialize: true,
    validate: (values) => {
      const errors = {};
      if (!values.vendor.trim()) errors.vendor = "Vendor is required";
      if (!values.poRef.trim()) errors.poRef = "Select the purchase order this payment is for";
      if (values.amount === "" || values.amount === null || Number(values.amount) < 0) {
        errors.amount = "Enter a valid payment amount";
      }
      return errors;
    },
    onSubmit: async (values, { setSubmitting }) => {
      const vendorForPayment = vendorsList.find((v) => v.name === values.vendor.trim());
      const data = {
        vendor: values.vendor.trim(),
        vendorId: vendorForPayment?._id || null,
        poRef: values.poRef.trim(),
        amount: Number(values.amount),
        dueDate: values.dueDate,
        paidDate: values.paidDate || "",
        status: values.status,
      };

      try {
        if (editingPayment) {
          const response = await vendorPaymentAPI.update(editingPayment._id || editingPayment.id, data);
          if (response.data?.success) {
            const updated = toPayment(response.data.data);
            setPaymentList((prev) => prev.map((p) => (p.id === editingPayment.id ? updated : p)));
            success(response.data.message || `Payment ${editingPayment.id} updated successfully.`);
            setEditingPayment(null);
            setShowPaymentModal(false);
          } else {
            toastError(response.data?.message || "Failed to update payment.");
          }
        } else {
          const response = await vendorPaymentAPI.create(data);
          if (response.data?.success) {
            setPaymentList((prev) => [toPayment(response.data.data), ...prev]);
            success(response.data.message || `Payment of ₹${Number(values.amount).toLocaleString()} recorded.`);
            setShowPaymentModal(false);
          } else {
            toastError(response.data?.message || "Failed to record payment.");
          }
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to save payment. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const openPaymentModal = (payment = null) => {
    setEditingPayment(payment);
    setShowPaymentModal(true);
  };

  const handleDeletePayment = async () => {
    if (!deletePaymentTarget) return;
    try {
      const response = await vendorPaymentAPI.delete(deletePaymentTarget._id || deletePaymentTarget.id);
      if (response.data?.success) {
        setPaymentList((prev) => prev.filter((p) => p.id !== deletePaymentTarget.id));
        success(response.data.message || `Payment ${deletePaymentTarget.id} deleted.`);
      } else {
        toastError(response.data?.message || "Failed to delete payment.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete payment. Please try again.",
      );
    } finally {
      setDeletePaymentTarget(null);
    }
  };

  // Cross-tab navigation: jump straight to a vendor's linked purchase orders
  // or payments with the vendor filter pre-applied, or to a specific PO.
  const jumpToPOs = (vendorName) => {
    setViewingVendor(null);
    setActiveTab("purchase-orders");
    setPoVendorFilter(vendorName || "all");
  };

  const jumpToPayments = (vendorName) => {
    setViewingVendor(null);
    setActiveTab("payments");
    setPaymentVendorFilter(vendorName || "all");
  };

  const jumpToPO = (poId) => {
    setActiveTab("purchase-orders");
    setPoVendorFilter("all");
    setPoSearchQuery(poId || "");
  };

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000) {
      return "₹" + (amount / 1000).toFixed(0) + "K";
    }
    return "₹" + amount.toLocaleString();
  };

  const formatCurrencyFull = (amount) => {
    return "₹" + amount.toLocaleString();
  };

  const getPOStatusClass = (status) => {
    const map = {
      Pending: "po-pending",
      Approved: "po-approved",
      Dispatched: "po-dispatched",
      Delivered: "po-delivered",
      Cancelled: "po-cancelled",
    };
    return map[status] || "po-pending";
  };

  const getPaymentStatusClass = (status) => {
    const map = {
      Paid: "payment-paid",
      Pending: "payment-pending",
      Overdue: "payment-overdue",
    };
    return map[status] || "payment-pending";
  };

  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.3;
    const stars = [];
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#ca8a04" stroke="#ca8a04" strokeWidth="1">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      } else if (i === fullStars && hasHalf) {
        stars.push(
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="1">
            <defs>
              <linearGradient id="halfStar">
                <stop offset="50%" stopColor="#ca8a04" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#halfStar)" />
          </svg>
        );
      } else {
        stars.push(
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        );
      }
    }
    return stars;
  };

  const getPOStatusStep = (status) => {
    const map = { Pending: 0, Approved: 1, Dispatched: 2, Delivered: 3, Cancelled: -1 };
    return map[status] ?? 0;
  };

  /* Custom tooltip for PieChart — shows color dot + name + value */
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      return (
        <div className="perf-custom-tooltip">
          <span className="perf-tooltip-dot" style={{ background: entry.color || entry.fill }}></span>
          <span className="perf-tooltip-name">{entry.name}</span>
          <span className="perf-tooltip-value">{entry.value} vendor{entry.value !== 1 ? 's' : ''}</span>
        </div>
      );
    }
    return null;
  };

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="vendor-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="vendor-page">
      <header className="vendor-header">
        <div>
          <h1 className="vendor-header-title">Vendor Management</h1>
          <p className="vendor-header-subtitle">Manage your supplier relationships — track vendor details, purchase orders, payments, and performance metrics across your supply chain.</p>
        </div>
      </header>

      <div className="vm-stats-grid">
        <StatCard
          title="Total Vendors"
          value={totalVendors.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>}
          color="blue"
        />
        <StatCard
          title="Active POs"
          value={activePOs.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="green"
        />
        <StatCard
          title="Total Spend"
          value={formatCurrency(totalSpend)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="purple"
        />
        <StatCard
          title="Pending Payments"
          value={formatCurrency(pendingPaymentTotal)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="orange"
        />
      </div>

      <div className="vendor-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`vendor-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === "vendors" && <span className="vendor-tab-count">{totalVendors}</span>}
            {tab.id === "purchase-orders" && <span className="vendor-tab-count">{activePOs}</span>}
            {tab.id === "payments" && <span className="vendor-tab-count">{pendingPayments.length}</span>}
          </button>
        ))}
      </div>

      <div className="vendor-tab-content">

        {/* ===== VENDORS TAB ===== */}
        {activeTab === "vendors" && (
          <div className="vendor-vendors-section">
            <div className="vendor-filter-bar">
              <div className="vendor-filter-actions">
                <div className="vendor-filter-search">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search vendors by name, ID, category, or country"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button className="vendor-search-clear" onClick={() => setSearchQuery('')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <Dropdown
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  placeholder="All Status"
                />
                <Dropdown
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[
                    { value: "all", label: "All Categories" },
                    ...categoryOptions.map((cat) => ({
                      value: cat,
                      label: titleCaseCategory(cat),
                    })),
                  ]}
                  placeholder="All Categories"
                />
                <div className="vendor-filter-divider"></div>
                {canDo("vendors", "create") && (
                <button className="vendor-add-btn" onClick={() => openVendorModal(null)} disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Vendor
                </button>
                )}
              </div>
            </div>
            <div className="vendor-grid">
              {filteredVendors.length === 0 ? (
                <div className="vendor-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <p>{vendorsList.length === 0 ? "No vendors found. Click \"Add Vendor\" to create your first vendor." : "No vendors match your filters"}</p>
                </div>
              ) : (
                filteredVendors.map((vendor) => (
                  <div
                    key={vendor.id}
                    className="vendor-card"
                    onClick={() => setViewingVendor(vendor)}
                  >
                    <div className="vendor-card-header">
                      <div className="vendor-card-logo">
                        {getInitials(vendor.name)}
                      </div>
                      <div className="vendor-card-id-row">
                        <span className="vendor-card-id">{vendor.id}</span>
                        <span className={`vendor-status-badge ${vendor.status === "Active" ? "vendor-active" : "vendor-inactive"}`}>
                          {vendor.status}
                        </span>
                      </div>
                    </div>
                    <h4 className="vendor-card-name">{vendor.name}</h4>
                    <div className="vendor-card-categories">
                      {getVendorCategories(vendor).slice(0, 2).map((cat) => (
                        <span key={cat} className="vendor-card-category">{cat}</span>
                      ))}
                      {getVendorCategories(vendor).length > 2 && (
                        <span className="vendor-card-category vendor-card-category-more">+{getVendorCategories(vendor).length - 2}</span>
                      )}
                    </div>
                    <div className="vendor-card-rating">
                      <div className="star-rating">{renderStars(vendor.rating)}</div>
                      <span className="vendor-rating-value">{vendor.rating}</span>
                    </div>
                    <div className="vendor-card-details">
                      <div className="vendor-card-detail">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>{vendor.country}</span>
                      </div>
                      <div className="vendor-card-detail">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" />
                        </svg>
                        <span>{formatCurrency(vendor.totalSpend)}</span>
                      </div>
                      <div className="vendor-card-detail">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span>Since {vendor.since || "—"}</span>
                      </div>
                    </div>
                    <div className="vendor-card-contact">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>{vendor.contactPerson}</span>
                    </div>
                    <div className="vendor-card-actions">
                      <ActivityLogButton
                        module="vendors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const vendorId = vendor._id || vendor.id;
                          navigate(`/admin/vendor-activity/${vendorId}`, {
                            state: { target: { recordId: vendorId, recordLabel: vendor.name, module: "vendors" } },
                          });
                        }}
                        title="View Vendor Activity Log"
                      />
                      {canDo("vendors", "edit") && (
                      <button className="vendor-act-btn vendor-act-edit" onClick={(e) => { e.stopPropagation(); openVendorModal(vendor); }} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      )}
                      {canDo("vendors", "delete") && (
                      <button className="vendor-act-btn vendor-act-delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(vendor); }} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="product-pagination-row">
              <Pagination
                currentPage={vendorsPage}
                totalPages={filteredVendorsTotalPages}
                totalItems={vendorsServerTotal || filteredVendors.length}
                pageSize={vendorsPerPage}
                onPageChange={setVendorsPage}
                variant="table"
                onPageSizeChange={(val) => { setVendorsPerPage(Number(val)); setVendorsPage(1); }}
              />
            </div>

            {viewingVendor && (
              <div className="vendor-modal-overlay">
                <div className="vendor-modal">
                  <div className="vendor-modal-header">
                    <div className="inv-modal-title">
                      <h3>{viewingVendor.name}</h3>
                      <div className="vendor-card-categories inv-modal-cats">
                        {getVendorCategories(viewingVendor).map((cat) => (
                          <span key={cat} className="vendor-card-category">{cat}</span>
                        ))}
                      </div>
                      <span className={`vendor-status-badge ${viewingVendor.status === "Active" ? "vendor-active" : "vendor-inactive"}`}>
                        {viewingVendor.status}
                      </span>
                    </div>
                    <button className="inv-modal-close" onClick={() => setViewingVendor(null)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="vendor-modal-body">
                    <div className="vendor-detail-grid">
                      <div className="vendor-contact-card">
                        <h4>Contact Information</h4>
                        <div className="vendor-contact-items">
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Contact Person</span>
                              <span className="vendor-contact-value">{viewingVendor.contactPerson}</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Email</span>
                              <span className="vendor-contact-value">{viewingVendor.contactEmail}</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Phone</span>
                              <span className="vendor-contact-value">{viewingVendor.contactPhone}</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Address</span>
                              <span className="vendor-contact-value">{viewingVendor.address}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="vendor-contact-card">
                        <h4>Business Details</h4>
                        <div className="vendor-contact-items">
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                              <line x1="1" y1="10" x2="23" y2="10" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Payment Terms</span>
                              <span className="vendor-contact-value">{viewingVendor.paymentTerms}</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Total Spend</span>
                              <span className="vendor-contact-value">{formatCurrencyFull(viewingVendor.totalSpend)}</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                              <polyline points="17 6 23 6 23 12" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Total Orders</span>
                              <span className="vendor-contact-value">{viewingVendor.totalOrders} orders</span>
                            </div>
                          </div>
                          <div className="vendor-contact-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <div>
                              <span className="vendor-contact-label">Rating</span>
                              <span className="vendor-contact-value">{viewingVendor.rating} / 5.0</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="vendor-linked-activity">
                      <h4>Linked Activity</h4>
                      <div className="vendor-activity-grid">
                        <div className="vendor-activity-card">
                          <span className="vendor-activity-label">Purchase Orders</span>
                          <span className="vendor-activity-value">{viewingVendor.totalOrders}</span>
                          <span className="vendor-activity-sub">{formatCurrencyFull(viewingVendor.totalSpend)} total spend</span>
                          <button className="vendor-activity-btn" onClick={() => jumpToPOs(viewingVendor.name)}>
                            View Purchase Orders
                          </button>
                        </div>
                        <div className="vendor-activity-card">
                          <span className="vendor-activity-label">Payments</span>
                          <span className="vendor-activity-value">{vendorPaymentsCount}</span>
                          <span className="vendor-activity-sub">{formatCurrencyFull(vendorPaidTotal)} paid</span>
                          <button className="vendor-activity-btn" onClick={() => jumpToPayments(viewingVendor.name)}>
                            View Payments
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                     <div className="vendor-modal-footer">
                  <button className="modal-footer-close" onClick={() => setViewingVendor(null)}>
                    Close
                  </button>
                </div>
                </div>
             
              </div>

            )}
          </div>
        )}

        {/* ===== PURCHASE ORDERS TAB ===== */}
        {activeTab === "purchase-orders" && (
          <div className="vendor-po-section">
            <div className="vendor-filter-bar" style={{marginBottom:0}}>
              <div className="vendor-filter-actions">
                <div className="vendor-filter-search">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search purchase orders by ID, vendor, or items"
                    value={poSearchQuery}
                    onChange={(e) => setPoSearchQuery(e.target.value)}
                  />
                  {poSearchQuery && (
                    <button className="vendor-search-clear" onClick={() => setPoSearchQuery('')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <Dropdown
                  value={poVendorFilter}
                  onChange={setPoVendorFilter}
                  options={[
                    { value: "all", label: "All Vendors" },
                    ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                  ]}
                  placeholder="All Vendors"
                />
                <div className="vendor-filter-divider"></div>
                {canDo("vendors", "create") && (
                <button className="vendor-add-btn" onClick={() => openPOModal(null)} disabled={poLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Purchase Order
                </button>
                )}
              </div>
            </div>
            {!poLoading && (
            <div className="vendor-po-grid">
              {filteredPOs.length === 0 ? (
                <div className="vendor-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <p>{poList.length === 0 ? "No purchase orders found. Click \"Add Purchase Order\" to create your first order." : "No purchase orders match your filters"}</p>
                </div>
              ) : (
                filteredPOs.map((po) => {
                const currentStep = getPOStatusStep(po.status);
                const steps = ["Pending", "Approved", "Dispatched", "Delivered"];
                return (
                  <div key={po.id} className={`po-card ${po.status === "Cancelled" ? "po-cancelled-card" : ""}`}>
                    <div className="po-card-header">
                      <div className="po-card-id-row">
                        <span className="po-card-id">{po.id}</span>
                        <span className={`po-status-badge ${getPOStatusClass(po.status)}`}>
                          {po.status}
                        </span>
                      </div>
                      <span className="po-card-amount">{formatCurrencyFull(po.total)}</span>
                    </div>
                    <div className="po-card-vendor">
                      <div className="po-vendor-avatar">{getInitials(po.vendor)}</div>
                      <span>{po.vendor}</span>
                    </div>
                    {po.projectName && (
                      <div className="po-card-project">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 21h18" />
                          <path d="M5 21V7l7-4 7 4v14" />
                          <path d="M9 9h1" /><path d="M9 13h1" /><path d="M14 9h1" /><path d="M14 13h1" />
                        </svg>
                        <span title={`${po.projectName}${po.customerName ? ` — ${po.customerName}` : ""}`}>{po.projectName}</span>
                      </div>
                    )}
                    <p className="po-card-items">{po.items}</p>
                    <div className="po-card-dates">
                      <div className="po-date-item">
                        <span className="po-date-label">Ordered</span>
                        <span className="po-date-value">{po.orderDate}</span>
                      </div>
                      <div className="po-date-item">
                        <span className="po-date-label">Expected</span>
                        <span className="po-date-value">{po.expectedDelivery}</span>
                      </div>
                      <div className="po-date-item">
                        <span className="po-date-label">Actual</span>
                        <span className="po-date-value">{po.actualDelivery || "---"}</span>
                      </div>
                    </div>
                    {po.status !== "Cancelled" && (
                      <div className="po-timeline">
                        {steps.map((step, idx) => (
                          <div
                            key={step}
                            className={`po-timeline-step ${idx <= currentStep ? "completed" : ""} ${idx === currentStep ? "current" : ""}`}
                          >
                            <div className="po-timeline-dot"></div>
                            <span className="po-timeline-label">{step}</span>
                            {idx < steps.length - 1 && <div className="po-timeline-line"></div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {po.status === "Cancelled" && (
                      <div className="po-cancelled-notice">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        <span>Order cancelled</span>
                      </div>
                    )}
                    <div className="po-card-actions">
                      {canDo("vendors", "edit") && (
                      <button className="vendor-act-btn vendor-act-edit" onClick={(e) => { e.stopPropagation(); openPOModal(po); }} title="Edit Purchase Order">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                      )}
                      {canDo("vendors", "delete") && (
                      <button className="vendor-act-btn vendor-act-delete" onClick={(e) => { e.stopPropagation(); setDeletePOTarget(po); }} title="Delete Purchase Order">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                        Delete
                      </button>
                      )}
                    </div>
                  </div>
                );
              })
              )}
            </div>
            )}
            <div className="product-pagination-row">
              <Pagination
                currentPage={poPage}
                totalPages={filteredPOsTotalPages}
                totalItems={poServerTotal || filteredPOs.length}
                pageSize={poPerPage}
                onPageChange={setPoPage}
                variant="table"
                onPageSizeChange={(val) => { setPoPerPage(Number(val)); setPoPage(1); }}
              />
            </div>
          </div>
        )}

        {/* ===== PAYMENTS TAB ===== */}
        {activeTab === "payments" && (
          <div className="vendor-payments-section">
            <div className="vendor-filter-bar" style={{marginBottom:0}}>
              <div className="vendor-filter-actions">
                <div className="vendor-filter-search">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search payments by ID, reference, vendor, or status"
                    value={paymentSearchQuery}
                    onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  />
                  {paymentSearchQuery && (
                    <button className="vendor-search-clear" onClick={() => setPaymentSearchQuery('')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <Dropdown
                  value={paymentVendorFilter}
                  onChange={setPaymentVendorFilter}
                  options={[
                    { value: "all", label: "All Vendors" },
                    ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                  ]}
                  placeholder="All Vendors"
                />
                <div className="vendor-filter-divider"></div>
                {canDo("vendors", "create") && (
                <button className="vendor-add-btn" onClick={() => openPaymentModal(null)} disabled={paymentLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Record Payment
                </button>
                )}
              </div>
            </div>
            {!paymentLoading && (
            <div className="vendor-payments-grid">
              {filteredPayments.length === 0 ? (
                <div className="vendor-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" />
                  </svg>
                  <p>{paymentList.length === 0 ? "No payments recorded. Click \"Record Payment\" to log your first payment." : "No payments match your filters"}</p>
                </div>
              ) : (
                filteredPayments.map((payment) => (
                <div key={payment.id} className="payment-card">
                  <div className="payment-card-header">
                    <div className="payment-card-id-row">
                      <span className="payment-card-id">{payment.id}</span>
                      <span className={`payment-status-badge ${getPaymentStatusClass(payment.status)}`}>
                        {payment.status}
                      </span>
                    </div>
                    <span className="payment-card-amount">{formatCurrencyFull(payment.amount)}</span>
                  </div>
                  <div className="payment-card-vendor">
                    <div className="payment-vendor-avatar">{getInitials(payment.vendor)}</div>
                    <div className="payment-vendor-info">
                      <span className="payment-vendor-name">{payment.vendor}</span>
                      {payment.poRef ? (
                        <button className="payment-po-ref-link" onClick={() => jumpToPO(payment.poRef)} title={`View ${payment.poRef}`}>
                          Ref: {payment.poRef}
                        </button>
                      ) : (
                        <span className="payment-po-ref">No PO reference</span>
                      )}
                    </div>
                  </div>
                  <div className="payment-card-dates">
                    <div className="payment-date-item">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <div>
                        <span className="payment-date-label">Due Date</span>
                        <span className="payment-date-value">{payment.dueDate}</span>
                      </div>
                    </div>
                    <div className="payment-date-item">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={payment.paidDate ? "#16a34a" : "#d1d5db"} strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <div>
                        <span className="payment-date-label">Paid Date</span>
                        <span className={`payment-date-value ${payment.paidDate ? "" : "unpaid"}`}>
                          {payment.paidDate || "Not paid"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="payment-card-actions">
                    {canDo("vendors", "edit") && (
                    <button className="vendor-act-btn vendor-act-edit" onClick={() => openPaymentModal(payment)} title="Edit Payment">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                    )}
                    {canDo("vendors", "delete") && (
                    <button className="vendor-act-btn vendor-act-delete" onClick={() => setDeletePaymentTarget(payment)} title="Delete Payment">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Delete
                    </button>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
            )}
            <div className="product-pagination-row">
              <Pagination
                currentPage={paymentPage}
                totalPages={filteredPaymentsTotalPages}
                totalItems={paymentServerTotal || filteredPayments.length}
                pageSize={paymentPerPage}
                onPageChange={setPaymentPage}
                variant="table"
                onPageSizeChange={(val) => { setPaymentPerPage(Number(val)); setPaymentPage(1); }}
              />
            </div>
          </div>
        )}

        {/* ===== PERFORMANCE TAB ===== */}
        {activeTab === "performance" && (
          <div className="vendor-performance-section">
            <div className="perf-stats-row">
              <div className="perf-stat-card">
                <div className="perf-stat-icon perf-green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <div className="perf-stat-info">
                  <span className="perf-stat-label">Avg Delivery Score</span>
                  <span className="perf-stat-value">
                    {averageOf((v) => v.deliveryScore).toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="perf-stat-card">
                <div className="perf-stat-icon perf-blue">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <div className="perf-stat-info">
                  <span className="perf-stat-label">Avg Quality Score</span>
                  <span className="perf-stat-value">
                    {averageOf((v) => v.qualityScore).toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="perf-stat-card">
                <div className="perf-stat-icon perf-purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="perf-stat-info">
                  <span className="perf-stat-label">Avg Response Time</span>
                  <span className="perf-stat-value">
                    {averageOf((v) => v.responseTime).toFixed(0)}h
                  </span>
                </div>
              </div>
              <div className="perf-stat-card">
                <div className="perf-stat-icon perf-yellow">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <div className="perf-stat-info">
                  <span className="perf-stat-label">Avg Vendor Rating</span>
                  <span className="perf-stat-value">
                    {averageOf((v) => v.rating).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            <div className="perf-charts-grid">
              <div className="perf-chart-card">
                <div className="perf-chart-header">
                  <h3>Vendor Spending Comparison</h3>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={vendorSpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#9ca3af" angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      formatter={(value) => [`₹${value.toLocaleString()}`, "Total Spend"]}
                      contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
                    />
                    <Bar dataKey="spend" name="Total Spend" fill="#2c5364" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="perf-chart-card">
                <div className="perf-chart-header">
                  <h3>Performance Comparison (Top 6)</h3>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="vendor" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} stroke="#d1d5db" />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} />
                    <Radar name="Delivery" dataKey="delivery" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="Quality" dataKey="quality" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="Rating" dataKey="rating" stroke="#ca8a04" fill="#ca8a04" fillOpacity={0.1} strokeWidth={2} />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="perf-chart-card">
                <div className="perf-chart-header">
                  <h3>Vendor Categories</h3>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={vendorCategories}
                      cx="50%" cy="50%"
                      innerRadius={80} outerRadius={130}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {vendorCategories.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="perf-legend">
                  {vendorCategories.map((item, index) => (
                    <div key={item.name} className="perf-legend-item">
                      <span className="perf-legend-dot" style={{ background: COLORS[index % COLORS.length] }}></span>
                      <span className="perf-legend-name">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="perf-chart-card">
                <div className="perf-chart-header">
                  <h3>Top Performers</h3>
                </div>
                <div className="perf-ranking-list">
                  {[...vendorsList]
                    .sort((a, b) => b.rating - a.rating)
                    .slice(0, 5)
                    .map((v, idx) => (
                      <div key={v.id} className="perf-ranking-item">
                        <span className={`perf-rank rank-${idx + 1}`}>{idx + 1}</span>
                        <div className="perf-ranking-logo">{getInitials(v.name)}</div>
                        <div className="perf-ranking-info">
                          <span className="perf-ranking-name">{v.name}</span>
                          <span className="perf-ranking-category">{getVendorCategories(v).slice(0, 2).join(", ") || "—"}</span>
                        </div>
                        <div className="perf-ranking-scores">
                          <div className="perf-score-bar">
                            <span className="perf-score-label">D: {v.deliveryScore}</span>
                            <div className="perf-score-track">
                              <div className="perf-score-fill delivery-fill" style={{ width: `${v.deliveryScore}%` }}></div>
                            </div>
                          </div>
                          <div className="perf-score-bar">
                            <span className="perf-score-label">Q: {v.qualityScore}</span>
                            <div className="perf-score-track">
                              <div className="perf-score-fill quality-fill" style={{ width: `${v.qualityScore}%` }}></div>
                            </div>
                          </div>
                        </div>
                        <div className="perf-ranking-rating">
                          <div className="star-rating">{renderStars(v.rating)}</div>
                          <span className="perf-ranking-value">{v.rating}</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ──── Vendor Add/Edit Modal ──── */}
      {showVendorModal && (
        <div className="vendor-form-overlay">
          <div className="vendor-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vendor-form-header">
              <h3>{editingVendor ? `Edit Vendor: ${editingVendor.id}` : "Add New Vendor"}</h3>
              <button className="vendor-form-close" onClick={() => { setShowVendorModal(false); setEditingVendor(null); vendorFormik.resetForm(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={vendorFormik.handleSubmit} className="vendor-form-body" noValidate>
              <div className="vendor-form-grid">
                <div className="vendor-form-field">
                  <label>Vendor Name <span className="vm-required">*</span></label>
                  <input type="text" name="name" placeholder="Enter vendor name"
                    className={vendorFormik.touched.name && vendorFormik.errors.name ? "vf-input-error" : ""}
                    value={vendorFormik.values.name} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.name && vendorFormik.errors.name && <span className="vf-field-error">{vendorFormik.errors.name}</span>}
                </div>
                <div className="vendor-form-field vf-full-width">
                  <label>Categories <span className="vm-required">*</span><span className="vf-hint-inline">Select one or more</span></label>
                  <Dropdown
                    multiple
                    value={vendorFormik.values.categories || []}
                    onChange={handleVendorCategoriesChange}
                    options={allCategoryOptions}
                    variant="form"
                    placeholder="Select categories"
                  />
                  {vendorFormik.touched.categories && vendorFormik.errors.categories && (
                    <span className="vf-field-error">{vendorFormik.errors.categories}</span>
                  )}
                </div>
                <div className="vendor-form-field">
                  <label>Country <span className="vm-required">*</span></label>
                  <input type="text" name="country" placeholder="e.g. USA"
                    className={vendorFormik.touched.country && vendorFormik.errors.country ? "vf-input-error" : ""}
                    value={vendorFormik.values.country} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.country && vendorFormik.errors.country && <span className="vf-field-error">{vendorFormik.errors.country}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Contact Person <span className="vm-required">*</span></label>
                  <input type="text" name="contactPerson" placeholder="Enter contact name"
                    className={vendorFormik.touched.contactPerson && vendorFormik.errors.contactPerson ? "vf-input-error" : ""}
                    value={vendorFormik.values.contactPerson} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.contactPerson && vendorFormik.errors.contactPerson && <span className="vf-field-error">{vendorFormik.errors.contactPerson}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Contact Email <span className="vm-required">*</span></label>
                  <input type="email" name="contactEmail" placeholder="email@example.com"
                    className={vendorFormik.touched.contactEmail && vendorFormik.errors.contactEmail ? "vf-input-error" : ""}
                    value={vendorFormik.values.contactEmail} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.contactEmail && vendorFormik.errors.contactEmail && <span className="vf-field-error">{vendorFormik.errors.contactEmail}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Contact Phone <span className="vm-required">*</span></label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input type="text" name="contactPhone" placeholder="98765 43210"
                      className={vendorFormik.touched.contactPhone && vendorFormik.errors.contactPhone ? "vf-input-error" : ""}
                      value={vendorFormik.values.contactPhone} onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        vendorFormik.setFieldValue("contactPhone", val);
                      }} onBlur={vendorFormik.handleBlur} />
                  </div>
                  {vendorFormik.touched.contactPhone && vendorFormik.errors.contactPhone && <span className="vf-field-error">{vendorFormik.errors.contactPhone}</span>}
                </div>
                <div className="vendor-form-field vf-full-width">
                  <label>Address <span className="vm-required">*</span></label>
                  <textarea name="address" placeholder="Enter full address" rows={2}
                    className={vendorFormik.touched.address && vendorFormik.errors.address ? "vf-input-error" : ""}
                    value={vendorFormik.values.address} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.address && vendorFormik.errors.address && <span className="vf-field-error">{vendorFormik.errors.address}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Payment Terms <span className="vm-required">*</span></label>
                  <Dropdown
                    value={vendorFormik.values.paymentTerms}
                    onChange={(val) => vendorFormik.setFieldValue("paymentTerms", val)}
                    options={[
                      { value: "Net 15", label: "Net 15" },
                      { value: "Net 30", label: "Net 30" },
                      { value: "Net 45", label: "Net 45" },
                      { value: "Net 60", label: "Net 60" },
                    ]}
                    variant="form"
                  />
                  {vendorFormik.touched.paymentTerms && vendorFormik.errors.paymentTerms && <span className="vf-field-error">{vendorFormik.errors.paymentTerms}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Status <span className="vm-required">*</span></label>
                  <Dropdown
                    value={vendorFormik.values.status}
                    onChange={(val) => vendorFormik.setFieldValue("status", val)}
                    options={[
                      { value: "Active", label: "Active" },
                      { value: "Inactive", label: "Inactive" },
                    ]}
                    variant="form"
                  />
                  {vendorFormik.touched.status && vendorFormik.errors.status && <span className="vf-field-error">{vendorFormik.errors.status}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Rating (0–5)</label>
                  <input type="number" name="rating" min="0" max="5" step="0.1" placeholder="e.g. 4.5"
                    className={vendorFormik.touched.rating && vendorFormik.errors.rating ? "vf-input-error" : ""}
                    value={vendorFormik.values.rating} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.rating && vendorFormik.errors.rating && <span className="vf-field-error">{vendorFormik.errors.rating}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Quality Score (0–100)</label>
                  <input type="number" name="qualityScore" min="0" max="100" placeholder="e.g. 90"
                    className={vendorFormik.touched.qualityScore && vendorFormik.errors.qualityScore ? "vf-input-error" : ""}
                    value={vendorFormik.values.qualityScore} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.qualityScore && vendorFormik.errors.qualityScore && <span className="vf-field-error">{vendorFormik.errors.qualityScore}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Response Time (hours)</label>
                  <input type="number" name="responseTime" min="0" placeholder="e.g. 6"
                    className={vendorFormik.touched.responseTime && vendorFormik.errors.responseTime ? "vf-input-error" : ""}
                    value={vendorFormik.values.responseTime} onChange={vendorFormik.handleChange} onBlur={vendorFormik.handleBlur} />
                  {vendorFormik.touched.responseTime && vendorFormik.errors.responseTime && <span className="vf-field-error">{vendorFormik.errors.responseTime}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Delivery Score (auto)</label>
                  <input type="text" name="deliveryScore" value={`${vendorFormik.values.deliveryScore || 0}%`} disabled
                    title="Calculated automatically from delivered purchase orders" />
                  <span className="vf-field-hint">Calculated automatically from on-time purchase order deliveries.</span>
                </div>
              </div>
              <div className="vendor-form-footer">
                <button type="button" className="vf-btn vf-btn-cancel" onClick={() => { setShowVendorModal(false); setEditingVendor(null); vendorFormik.resetForm(); }}>Cancel</button>
                <button type="submit" className="vf-btn vf-btn-primary" disabled={vendorFormik.isSubmitting}>{vendorFormik.isSubmitting ? "Saving..." : editingVendor ? "Update Vendor" : "Add Vendor"}</button>
              </div>
              </form>
          </div>
        </div>
      )}

      {/* ──── Purchase Order Add/Edit Modal ──── */}
      {showPOModal && (
        <div className="vendor-form-overlay">
          <div className="vendor-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vendor-form-header">
              <h3>{editingPO ? `Edit Purchase Order: ${editingPO.id}` : "Add Purchase Order"}</h3>
              <button className="vendor-form-close" onClick={() => { setShowPOModal(false); setEditingPO(null); poFormik.resetForm(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={poFormik.handleSubmit} className="vendor-form-body" noValidate>
              <div className="vendor-form-grid">
                <div className="vendor-form-field">
                  <label>Vendor <span className="vm-required">*</span></label>
                  <Dropdown
                    value={poFormik.values.vendor}
                    onChange={(val) => poFormik.setFieldValue("vendor", val)}
                    options={[
                      ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                      ...(editingPO?.vendor &&
                      !vendorsList.some((v) => v.name === editingPO.vendor)
                        ? [{ value: editingPO.vendor, label: editingPO.vendor }]
                        : []),
                    ]}
                    variant="form"
                    placeholder={vendorsList.length === 0 ? "No vendors yet — add one in the Vendors tab" : "Select vendor"}
                  />
                  {poFormik.touched.vendor && poFormik.errors.vendor && <span className="vf-field-error">{poFormik.errors.vendor}</span>}
                </div>
                <div className="vendor-form-field vf-full-width">
                  <label>Linked Project / Lead (Optional)</label>
                  <Dropdown
                    value={poFormik.values.leadId || ""}
                    onChange={(val) => poFormik.setFieldValue("leadId", val)}
                    options={[
                      { value: "", label: "-- No project linked --" },
                      ...sortById(
                        leadsList.filter((l) => l.leadId),
                        "leadId",
                      ).map((l) => ({
                        value: l.leadId,
                        label: `${l.leadId} — ${l.name}`,
                      })),
                      ...(editingPO?.leadId &&
                      !leadsList.some((l) => l.leadId === editingPO.leadId)
                        ? [
                            {
                              value: editingPO.leadId,
                              label: `${editingPO.leadId} (removed lead)`,
                            },
                          ]
                        : []),
                    ]}
                    variant="form"
                    placeholder="-- No project linked --"
                  />
                  <span className="vf-field-hint">Linking the project lets this purchase order flow into that project's actual cost in Project Progress.</span>
                </div>
                <div className="vendor-form-field">
                  <label>Order Total (₹) <span className="vm-required">*</span></label>
                  <input
                    type="number"
                    name="total"
                    min="0"
                    placeholder="Enter order total"
                    value={poFormik.values.total}
                    onChange={poFormik.handleChange}
                    onBlur={poFormik.handleBlur}
                    className={poFormik.touched.total && poFormik.errors.total ? "vf-input-error" : ""}
                  />
                  {poFormik.touched.total && poFormik.errors.total && <span className="vf-field-error">{poFormik.errors.total}</span>}
                </div>
                {(inventoryList.length > 0 || productsList.length > 0) && (
                  <div className="vendor-form-field vf-full-width">
                    <label>Select Item from Inventory / Catalog (Optional)</label>
                    <Dropdown
                      value={poFormik.values.poItemPick || ""}
                      onChange={(val) => {
                        if (!val) return;
                        poFormik.setFieldValue("poItemPick", val);
                        const [type, id] = val.split(":");
                        if (type === "inv") {
                          const item = inventoryList.find((i) => i._id === id);
                          if (item) {
                            poFormik.setFieldValue("items", `10x ${item.name} (SKU: ${item.sku})`);
                            poFormik.setFieldValue("total", (item.unitPrice || 0) * 10);
                            if (item.supplier) poFormik.setFieldValue("vendor", item.supplier);
                          }
                        } else if (type === "prd") {
                          const prd = productsList.find((p) => p._id === id);
                          if (prd) {
                            poFormik.setFieldValue("items", `10x ${prd.name} (${prd.brand})`);
                            poFormik.setFieldValue("total", (prd.price || 0) * 10);
                          }
                        }
                      }}
                      options={[
                        ...inventoryList.map((i) => ({
                          value: `inv:${i._id}`,
                          label: `${i.name} (${i.sku}) — ₹${i.unitPrice}/unit (Stock: ${i.quantity})`,
                        })),
                        ...productsList.map((p) => ({
                          value: `prd:${p._id}`,
                          label: `${p.name} (${p.brand}) — ₹${p.price}`,
                        })),
                      ]}
                      variant="form"
                      placeholder="-- Choose registered item to pre-fill PO --"
                    />
                    <span className="vf-field-hint">Selecting an item auto-fills vendor, items description, and estimated price total.</span>
                  </div>
                )}
                <div className="vendor-form-field vf-full-width">
                  <label>Items Description <span className="vm-required">*</span></label>
                  <textarea
                    name="items"
                    rows="2"
                    placeholder="e.g. 40x Monocrystalline 400W Panels"
                    value={poFormik.values.items}
                    onChange={poFormik.handleChange}
                    onBlur={poFormik.handleBlur}
                    className={poFormik.touched.items && poFormik.errors.items ? "vf-input-error" : ""}
                  />
                  {poFormik.touched.items && poFormik.errors.items && <span className="vf-field-error">{poFormik.errors.items}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Order Date</label>
                  <input type="date" name="orderDate" value={poFormik.values.orderDate} onChange={poFormik.handleChange} />
                </div>
                <div className="vendor-form-field">
                  <label>Expected Delivery</label>
                  <input type="date" name="expectedDelivery" value={poFormik.values.expectedDelivery} onChange={poFormik.handleChange} />
                </div>
                <div className="vendor-form-field">
                  <label>Actual Delivery</label>
                  <input type="date" name="actualDelivery" value={poFormik.values.actualDelivery} onChange={poFormik.handleChange} />
                </div>
                <div className="vendor-form-field">
                  <label>Status</label>
                  <Dropdown
                    value={poFormik.values.status}
                    onChange={(val) => poFormik.setFieldValue("status", val)}
                    options={["Pending", "Approved", "Dispatched", "Delivered", "Cancelled"].map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    variant="form"
                    placeholder="Select status"
                  />
                </div>
              </div>
              <div className="vendor-form-footer">
                <button type="button" className="vf-btn vf-btn-cancel" onClick={() => { setShowPOModal(false); setEditingPO(null); poFormik.resetForm(); }}>Cancel</button>
                <button type="submit" className="vf-btn vf-btn-primary" disabled={poFormik.isSubmitting}>{poFormik.isSubmitting ? "Saving..." : editingPO ? "Update Purchase Order" : "Add Purchase Order"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──── Payment Add/Edit Modal ──── */}
      {showPaymentModal && (
        <div className="vendor-form-overlay">
          <div className="vendor-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vendor-form-header">
              <h3>{editingPayment ? `Edit Payment: ${editingPayment.id}` : "Record Payment"}</h3>
              <button className="vendor-form-close" onClick={() => { setShowPaymentModal(false); setEditingPayment(null); paymentFormik.resetForm(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={paymentFormik.handleSubmit} className="vendor-form-body" noValidate>
              <div className="vendor-form-grid">
                <div className="vendor-form-field">
                  <label>Vendor <span className="vm-required">*</span></label>
                  <Dropdown
                    value={paymentFormik.values.vendor}
                    onChange={(val) => {
                      const currentPO = poList.find((p) => p.id === paymentFormik.values.poRef);
                      if (currentPO && currentPO.vendor !== val) {
                        paymentFormik.setFieldValue("poRef", "");
                        paymentFormik.setFieldValue("amount", "");
                      }
                      paymentFormik.setFieldValue("vendor", val);
                    }}
                    options={[
                      ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                      ...(editingPayment?.vendor &&
                      !vendorsList.some((v) => v.name === editingPayment.vendor)
                        ? [{ value: editingPayment.vendor, label: editingPayment.vendor }]
                        : []),
                    ]}
                    variant="form"
                    placeholder={vendorsList.length === 0 ? "No vendors yet — add one in the Vendors tab" : "Select vendor"}
                  />
                  {paymentFormik.touched.vendor && paymentFormik.errors.vendor && <span className="vf-field-error">{paymentFormik.errors.vendor}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Purchase Order <span className="vm-required">*</span></label>
                  <Dropdown
                    value={paymentFormik.values.poRef}
                    onChange={(val) => {
                      paymentFormik.setFieldValue("poRef", val);
                      const po = poList.find((p) => p.id === val);
                      if (po) {
                        // Auto-fill vendor, amount and due date from the PO so a
                        // payment can never disagree with its purchase order.
                        paymentFormik.setFieldValue("vendor", po.vendor);
                        paymentFormik.setFieldValue("amount", po.total ?? "");
                        paymentFormik.setFieldValue(
                          "dueDate",
                          po.expectedDelivery ||
                            paymentFormik.values.dueDate ||
                            new Date().toISOString().slice(0, 10)
                        );
                      }
                    }}
                    options={[
                      ...sortById(
                        paymentFormik.values.vendor
                          ? poList.filter((p) => p.vendor === paymentFormik.values.vendor)
                          : poList,
                        "id",
                      ).map((p) => ({
                        value: p.id,
                        label: `${p.id} — ${p.vendor} (₹${Number(p.total || 0).toLocaleString()})`,
                      })),
                      ...(editingPayment?.poRef &&
                      !poList.some((p) => p.id === editingPayment.poRef)
                        ? [{ value: editingPayment.poRef, label: editingPayment.poRef }]
                        : []),
                    ]}
                    variant="form"
                    placeholder="Select a purchase order"
                  />
                  {paymentFormik.touched.poRef && paymentFormik.errors.poRef && <span className="vf-field-error">{paymentFormik.errors.poRef}</span>}
                  <span className="vf-field-hint">Vendor, amount and due date are filled automatically from the selected purchase order.</span>
                </div>
                <div className="vendor-form-field">
                  <label>Amount (₹) <span className="vm-required">*</span></label>
                  <input
                    type="number"
                    name="amount"
                    min="0"
                    placeholder="Enter payment amount"
                    value={paymentFormik.values.amount}
                    onChange={paymentFormik.handleChange}
                    onBlur={paymentFormik.handleBlur}
                    className={paymentFormik.touched.amount && paymentFormik.errors.amount ? "vf-input-error" : ""}
                  />
                  {paymentFormik.touched.amount && paymentFormik.errors.amount && <span className="vf-field-error">{paymentFormik.errors.amount}</span>}
                </div>
                <div className="vendor-form-field">
                  <label>Status</label>
                  <Dropdown
                    value={paymentFormik.values.status}
                    onChange={(val) => paymentFormik.setFieldValue("status", val)}
                    options={["Pending", "Paid", "Overdue"].map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    variant="form"
                    placeholder="Select status"
                  />
                </div>
                <div className="vendor-form-field">
                  <label>Due Date</label>
                  <input type="date" name="dueDate" value={paymentFormik.values.dueDate} onChange={paymentFormik.handleChange} />
                </div>
                <div className="vendor-form-field">
                  <label>Paid Date</label>
                  <input type="date" name="paidDate" value={paymentFormik.values.paidDate} onChange={paymentFormik.handleChange} />
                </div>
              </div>
              <div className="vendor-form-footer">
                <button type="button" className="vf-btn vf-btn-cancel" onClick={() => { setShowPaymentModal(false); setEditingPayment(null); paymentFormik.resetForm(); }}>Cancel</button>
                <button type="submit" className="vf-btn vf-btn-primary" disabled={paymentFormik.isSubmitting}>{paymentFormik.isSubmitting ? "Saving..." : editingPayment ? "Update Payment" : "Record Payment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──── Delete Confirmations ──── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Vendor"
        message={`Are you sure you want to delete ${deleteTarget?.name}?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteVendor}
        onCancel={() => setDeleteTarget(null)}
        loading={loading}
      />
      <ConfirmDialog
        isOpen={!!deletePOTarget}
        title="Delete Purchase Order"
        message={`Are you sure you want to delete purchase order ${deletePOTarget?.vendor}?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeletePO}
        onCancel={() => setDeletePOTarget(null)}
        loading={poLoading}
      />
      <ConfirmDialog
        isOpen={!!deletePaymentTarget}
        title="Delete Payment"
        message={`Are you sure you want to delete payment ${deletePaymentTarget?.vendor}?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeletePayment}
        onCancel={() => setDeletePaymentTarget(null)}
        loading={paymentLoading}
      />
    </div>
  );
};

export default VendorManagement;
