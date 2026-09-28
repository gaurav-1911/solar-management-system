import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useFormik } from "formik";
import { productSchema } from "../../utils/AdminValidation";
import { productAPI, productCategoryAPI, vendorAPI, inventoryAPI, purchaseOrderAPI } from "../../services/api";
import { Dropdown, Pagination, ConfirmDialog, TableLoader, PageLoader } from "../../components/common";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { sortCategories, sortById } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./ProductCatalog.css";

const DEFAULT_CATEGORIES = [
  { id: "solar-panels", label: "Solar Panels", color: "#2563eb" },
  { id: "inverters", label: "Inverters", color: "#16a34a" },
  { id: "batteries", label: "Batteries", color: "#ca8a04" },
  { id: "solar-water-pumps", label: "Solar Water Pumps", color: "#9333ea" },
  { id: "charge-controllers", label: "Charge Controllers", color: "#2c5364" },
  { id: "mounting-structures", label: "Mounting Structures", color: "#dc2626" },
  { id: "connectors", label: "Connectors", color: "#0891b2" },
  { id: "cables", label: "Cables", color: "#6366f1" },
];

const COLORS = [
  "#2c5364",
  "#16a34a",
  "#2563eb",
  "#ca8a04",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#6366f1",
];

// Preset swatches offered in the "Add Category" modal.
const CATEGORY_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#2c5364",
  "#dc2626",
  "#0891b2",
  "#6366f1",
  "#0d9488",
  "#ea580c",
  "#db2777",
  "#4f46e5",
];

// Preset emoji icons offered in the Add/Edit Category modal.
const CATEGORY_ICONS = [
  "📦",
  "☀️",
  "⚡",
  "🔋",
  "💧",
  "🔌",
  "🛠️",
  "🔗",
  "🪢",
  "📡",
  "🖥️",
  "🌱",
  "🏭",
  "🚗",
  "💡",
  "🧰",
  "📐",
  "🔩",
  "⚙️",
  "🔆",
  "🌡️",
  "📊",
  "🏠",
  "♻️",
];

// Turns "Solar Trackers" into the slug "solar-trackers" used as the category key.
const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Categories that ship with a hand-drawn SVG icon; everything else uses the
// user-chosen emoji icon in the Categories tab cards.
const SVG_CATEGORY_KEYS = [
  "solar-panels",
  "inverters",
  "batteries",
  "solar-water-pumps",
  "charge-controllers",
  "mounting-structures",
  "connectors",
  "cables",
];

// Maps a server product document into the shape this page expects. The display
// id comes from the server-generated sequential productId (PRD-001, PRD-002,
// ...); legacy products without one fall back to a short Mongo _id fragment.
// Stock arrives pre-mirrored from the linked Inventory item (backend), so the
// Product Catalog always shows the same stock as Inventory Management.
const toProduct = (p) => ({
  ...p,
  id:
    p.productId ||
    `PRD-${String(p._id || "").slice(-4).toUpperCase() || "0000"}`,
  costPrice: p.costPrice || p.price || 0,
  specs: p.specs || {},
  status:
    p.stock === 0
      ? "Out of Stock"
      : p.stock <= p.minStock
        ? "Low Stock"
        : "In Stock",
});

// Best-effort mapping from Inventory categories (fixed enum) to product
// category keys (dynamic). Only clean 1:1 pairs are mapped; for the rest the
// current category selection is left untouched.
const INVENTORY_TO_PRODUCT_CATEGORY = {
  Panels: "solar-panels",
  Inverters: "inverters",
  Batteries: "batteries",
  Controllers: "charge-controllers",
  Mounting: "mounting-structures",
};

// A vendor can belong to multiple categories. New vendors store an array in
// `categories`; legacy vendors only have the single-string `category` field.
// This helper normalizes both shapes into an array for filtering.
const getVendorCategories = (vendor) => {
  if (Array.isArray(vendor?.categories) && vendor.categories.length) {
    return vendor.categories.filter(Boolean);
  }
  return vendor?.category ? [vendor.category] : [];
};

const ProductCatalog = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced copy of the search box — the table only refetches after the user pauses typing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const location = useLocation();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Reset form and selectedProduct on sidebar navigation / route change
  useEffect(() => {
    setShowAddForm(false);
    setEditingProduct(null);
    setSelectedProduct(null);
  }, [location.pathname, location.search, location.key, location.state]);
  const [productsList, setProductsList] = useState([]);
  const [loading, setLoading] = useState(true);
  // Server-paginated rows for the "All Products" table + pagination metadata.
  const [currentPage, setCurrentPage] = useState(1);
  const [tableProducts, setTableProducts] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });

  const [vendorsList, setVendorsList] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [reorderProduct, setReorderProduct] = useState(null);
  const [reorderQty, setReorderQty] = useState(20);
  const [reorderVendor, setReorderVendor] = useState("");
  const [reorderSubmitting, setReorderSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesServerTotal, setCategoriesServerTotal] = useState(0);
  const [catPage, setCatPage] = useState(1);
  const [catPageSize, setCatPageSize] = useState(10);
  // "loading" | "ready" | "error" — lets the Categories tab distinguish a
  // genuinely empty database (empty state) from an unreachable API (fallback).
  const [categoriesStatus, setCategoriesStatus] = useState("loading");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryFormTarget, setCategoryFormTarget] = useState(null); // "add" | "edit" | null
  const [editingCategory, setEditingCategory] = useState(null); // category being edited (null = add mode)
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    label: "",
    color: "#2563eb",
    icon: "📦",
    description: "",
  });
  const [categoryFormError, setCategoryFormError] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  // True once the user creates a category this session; used so a still-pending
  // categories fetch never clobbers their freshly-added category.
  const categoriesCreatedRef = useRef(false);
  const { user } = useAuth();
  const isAdmin = useMemo(() => {
    return user?.role === "super_admin" || user?.role === "company_admin";
  }, [user]);

  const closeCategoryForm = () => {
    setShowCategoryForm(false);
    setCategoryFormError("");
    setEditingCategory(null);
    setCategoryForm({
      label: "",
      color: "#2563eb",
      icon: "📦",
      description: "",
    });
  };

  const openCategoryForm = (mode, category = null) => {
    // mode: "add-product" (from add form) | "edit-product" (from edit form) | "tab" | "edit" (card)
    const target =
      mode === "add-product" ? "add" : mode === "edit-product" ? "edit" : null;
    setCategoryFormTarget(target);
    setEditingCategory(category);
    setCategoryFormError("");
    setCategoryForm({
      label: category?.label || "",
      color: category?.color || "#2563eb",
      icon: category?.icon || "📦",
      description: category?.description || "",
    });
    setShowCategoryForm(true);
  };

  // Load product categories from the backend on mount. Categories are fully
  // dynamic: whatever the server returns (including an empty list) is shown.
  // The static DEFAULT_CATEGORIES fallback is ONLY used when the API itself is
  // unreachable, so a fresh database never displays fake non-editable entries.
  // Fetch all categories (full list for dropdowns) and vendor/inventory data
  useEffect(() => {
    let isMounted = true;
    const loadAll = async () => {
      try {
        const response = await productCategoryAPI.getAll({ limit: 1000 });
        if (!isMounted) return;
        if (response.data?.success) {
          const list = (response.data.data || []).map((c) => ({
            _id: c._id,
            id: c.key,
            label: c.label,
            color: c.color || "#5c6f68",
            icon: c.icon || "📦",
            description: c.description || "",
          }));
          setCategories((prev) => {
            if (categoriesCreatedRef.current) {
              const merged = [...list];
              prev.forEach((c) => {
                if (c._id && !merged.some((x) => x.id === c.id))
                  merged.push(c);
              });
              return merged;
            }
            return list;
          });
          setCategoriesStatus("ready");
        } else {
          setCategoriesStatus("error");
        }
      } catch {
        if (isMounted) {
          setCategories(DEFAULT_CATEGORIES);
          setCategoriesStatus("error");
        }
      }
      vendorAPI.getAll({ limit: 1000 }).then((res) => {
        if (isMounted && res.data?.success) setVendorsList(res.data.data || []);
      }).catch(() => {});
      inventoryAPI.getAll({ limit: 1000 }).then((res) => {
        if (isMounted && res.data?.success) setInventoryList(res.data.data || []);
      }).catch(() => {});
    };
    loadAll();
    return () => { isMounted = false; };
  }, []);

  const handleSaveCategory = async () => {
    const label = categoryForm.label.trim();
    if (!label) {
      setCategoryFormError("Category name is required");
      return;
    }
    setCategorySubmitting(true);
    try {
      const payload = {
        label,
        color: categoryForm.color,
        icon: categoryForm.icon || "📦",
        description: categoryForm.description.trim(),
      };

      if (editingCategory) {
        // Editing an existing category — key/slug is immutable.
        const response = await productCategoryAPI.update(editingCategory._id, payload);
        if (response.data?.success) {
          const updated = response.data.data;
          setCategories((prev) =>
            prev.map((c) =>
              c.id === updated.key
                ? {
                    ...c,
                    label: updated.label,
                    color: updated.color || "#5c6f68",
                    icon: updated.icon || "📦",
                    description: updated.description || "",
                  }
                : c,
            ),
          );
          closeCategoryForm();
          success(response.data?.message || "Category updated successfully.");
        } else {
          toastError(response.data?.message || "Failed to update category.");
        }
      } else {
        // Creating a brand-new category.
        const key = slugify(label);
        if (!key) {
          setCategoryFormError("Category name must include letters or numbers");
          setCategorySubmitting(false);
          return;
        }
        const response = await productCategoryAPI.create({
          key,
          ...payload,
        });
        if (response.data?.success) {
          const created = response.data.data;
          const newCategory = {
            _id: created._id,
            id: created.key,
            label: created.label,
            color: created.color || "#5c6f68",
            icon: created.icon || "📦",
            description: created.description || "",
          };
          categoriesCreatedRef.current = true;
          setCategories((prev) =>
            prev.some((c) => c.id === newCategory.id)
              ? prev
              : [...prev, newCategory],
          );
          // If the modal was opened from a product form, select the new category there
          if (categoryFormTarget === "add") {
            addFormik.setFieldValue("category", newCategory.id);
          } else if (categoryFormTarget === "edit") {
            editFormik.setFieldValue("category", newCategory.id);
          }
          closeCategoryForm();
          success(response.data?.message || "Category created successfully.");
        } else {
          toastError(response.data?.message || "Failed to create category.");
        }
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to save category. Please try again.",
      );
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    try {
      const response = await productCategoryAPI.delete(category._id);
      if (response.data?.success) {
        setCategories((prev) => prev.filter((c) => c.id !== category.id));
        if (categoryFilter === category.id) setCategoryFilter("all");
        success(response.data?.message || "Category deleted successfully.");
      } else {
        toastError(response.data?.message || "Failed to delete category.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete category. Please try again.",
      );
    }
  };

  // Debounce the search box so the table only queries the backend after the
  // user pauses typing (instead of firing a request on every keystroke).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Lightweight summary of ALL products (no specs field) for the stats row,
  // charts and the Categories / Brands / Stock tabs. Refetched after mutations.
  // inventoryItemId is fetched so the backend mirrors the linked Inventory
  // item's quantity onto stock (Inventory is the source of truth).
  useEffect(() => {
    let isMounted = true;
    productAPI
      .getAll({
        limit: 10000,
        fields:
          "name,brand,category,price,stock,minStock,warranty,productId,inventoryItemId",
      })
      .then((res) => {
        if (isMounted && res.data?.success) {
          setProductsList((res.data.data || []).map(toProduct));
        }
      })
      .catch(() => {
        // Stats/charts degrade gracefully; the table has its own error toast.
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-driven pagination: only the requested page is fetched. Re-runs on
  // page/page-size/filter/search changes.
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const params = { page: currentPage, limit: itemsPerPage };
    if (categoryFilter !== "all") params.category = categoryFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

    productAPI
      .getAll(params)
      .then((response) => {
        if (!isMounted) return;
        if (response.data?.success) {
          setTableProducts((response.data.data || []).map(toProduct));
          setPagination(
            response.data.pagination || {
              total: 0,
              page: currentPage,
              limit: itemsPerPage,
              totalPages: 0,
            },
          );
        } else {
          toastError(response.data?.message || "Failed to load products.");
        }
      })
      .catch((error) => {
        if (isMounted) {
          toastError(
            error.response?.data?.message ||
              "Failed to load products. Please try again.",
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [currentPage, itemsPerPage, categoryFilter, statusFilter, debouncedSearch, toastError]);

  // Reset to page 1 whenever a filter or the (debounced) search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, debouncedSearch]);

  // If the current page no longer exists (e.g. deleting the last item on the
  // last page — or deleting everything while on a page > 1), step back to the
  // nearest valid page so the user is never stranded on an empty page.
  useEffect(() => {
    const lastPage = Math.max(1, pagination.totalPages);
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [pagination.totalPages, currentPage]);

  // Chart data derived from the live product list.
  const brandData = useMemo(
    () =>
      [...new Set(productsList.map((p) => p.brand))].map((brand) => ({
        name: brand,
        value: productsList.filter((p) => p.brand === brand).length,
      })),
    [productsList],
  );
  const categoryData = useMemo(
    () =>
      categories.map((cat) => ({
        name: cat.label,
        count: productsList.filter((p) => p.category === cat.id).length,
      })),
    [productsList, categories],
  );

  // When an inventory item is picked in the "Link Inventory Item" dropdown,
  // auto-fill the product fields that already exist on that item (name,
  // brand/supplier, category, price, stock and min stock).
  const handleInventoryLinkChange = (formik, id) => {
    formik.setFieldValue("inventoryItemId", id);
    const inv = inventoryList.find((i) => String(i._id) === String(id));
    if (!inv) return;
    formik.setFieldValue("name", inv.name || "");
    // Pick-only vendor field: only fill the brand when the supplier is a
    // selectable option, so the displayed value always matches what's saved.
    if (inv.supplier && vendorOptions.includes(inv.supplier)) {
      formik.setFieldValue("brand", inv.supplier);
    }
    const mappedCat = INVENTORY_TO_PRODUCT_CATEGORY[inv.category];
    if (mappedCat && categories.some((c) => c.id === mappedCat)) {
      // Only auto-fill the category when it fits the linked vendor's category
      // profile (when a vendor is linked); otherwise leave the selection alone.
      const supplierVendor = vendorsList.find((v) => v.name === inv.supplier);
      const vCats = supplierVendor ? getVendorCategories(supplierVendor) : [];
      const catLabel = categories.find((c) => c.id === mappedCat)?.label || "";
      const fitsVendor =
        vCats.length === 0 ||
        vCats.some((vc) => vc.toLowerCase() === catLabel.toLowerCase());
      if (fitsVendor) formik.setFieldValue("category", mappedCat);
    }
    formik.setFieldValue("costPrice", inv.unitPrice ?? "");
    formik.setFieldValue("price", inv.unitPrice ?? "");
    formik.setFieldValue("stock", inv.quantity ?? 0);
    formik.setFieldValue("minStock", inv.minStock ?? "");
    // Clear stale touched/error state so the freshly filled fields validate cleanly
    formik.setTouched({});
    formik.setErrors({});
  };

  const addFormik = useFormik({
    initialValues: {
      name: "",
      brand: "",
      category: "solar-panels",
      costPrice: "",
      price: "",
      stock: "",
      minStock: "",
      warranty: "5",
      inventoryItemId: "",
    },
    validationSchema: productSchema,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setSubmitting(true);
      try {
        const stockNum = parseInt(values.stock) || 0;
        const minStockNum = parseInt(values.minStock) || 10;
        const response = await productAPI.create({
          name: values.name,
          brand: values.brand,
          category: values.category,
          costPrice: parseFloat(values.costPrice) || parseFloat(values.price) || 0,
          price: parseFloat(values.price),
          stock: stockNum,
          minStock: minStockNum,
          warranty: parseInt(values.warranty) || 0,
          inventoryItemId: values.inventoryItemId || null,
        });

        if (response.data?.success) {
          const created = response.data?.data;
          if (created) {
            const p = toProduct(created);
            // Keep the stats/charts/tabs fresh without a 10k-record refetch
            setProductsList((prev) => [p, ...prev]);
            setPagination((prev) => {
              const total = (prev.total || 0) + 1;
              return { ...prev, total, totalPages: Math.max(1, Math.ceil(total / itemsPerPage)) };
            });
            if (currentPage === 1 && productMatchesFilters(p)) {
              // Show the new product instantly at the top of page 1
              setTableProducts((prev) => [p, ...prev]);
            } else if (currentPage !== 1) {
              // On a later page — jump to page 1 (single fast page fetch)
              setCurrentPage(1);
            }
          }
          // Refresh the inventory list so the newly auto-created entry (or any
          // newly linked item) shows up in the Link Inventory Item dropdown.
          inventoryAPI
            .getAll({ limit: 10000 })
            .then((res) => {
              if (res.data?.success) setInventoryList(res.data.data || []);
            })
            .catch(() => {});
          resetForm();
          setShowAddForm(false);
          success(response.data?.message || "Product created successfully.");
        } else {
          toastError(response.data?.message || "Failed to create product.");
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to create product. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const editFormik = useFormik({
    initialValues: {
      name: editingProduct?.name || "",
      brand: editingProduct?.brand || "",
      category: editingProduct?.category || "solar-panels",
      costPrice: (() => {
        const invId = editingProduct?.inventoryItemId?._id || editingProduct?.inventoryItemId;
        const linkedInv = invId ? inventoryList.find((i) => String(i._id) === String(invId)) : null;
        return linkedInv?.unitPrice ?? editingProduct?.costPrice ?? editingProduct?.price ?? "";
      })(),
      price: editingProduct?.price || "",
      stock: editingProduct?.stock || "",
      minStock: editingProduct?.minStock || "",
      warranty: editingProduct?.warranty ?? "",
      inventoryItemId:
        editingProduct?.inventoryItemId?._id ||
        editingProduct?.inventoryItemId ||
        "",
    },
    validationSchema: productSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      setSubmitting(true);
      try {
        const stockNum = parseInt(values.stock) || 0;
        const minStockNum = parseInt(values.minStock) || 10;
        const response = await productAPI.update(editingProduct._id, {
          name: values.name,
          brand: values.brand,
          category: values.category,
          costPrice: parseFloat(values.costPrice) || parseFloat(values.price) || 0,
          price: parseFloat(values.price),
          stock: stockNum,
          minStock: minStockNum,
          warranty: parseInt(values.warranty) || 0,
        });

        if (response.data?.success) {
          const updated = response.data?.data;
          if (updated) {
            const pid = updated._id || editingProduct._id;
            const p = toProduct(updated);
            // Update the row instantly (no full refetch / page spinner)
            setProductsList((prev) => prev.map((x) => (x._id === pid ? p : x)));
            setTableProducts((prev) => {
              if (!prev.some((x) => x._id === pid)) return prev;
              // Drop the row when it no longer matches the active filters
              if (!productMatchesFilters(p)) {
                return prev.filter((x) => x._id !== pid);
              }
              return prev.map((x) => (x._id === pid ? p : x));
            });
          }
          setEditingProduct(null);
          success(response.data?.message || "Product updated successfully.");
        } else {
          toastError(response.data?.message || "Failed to update product.");
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to update product. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);
  const [stockPage, setStockPage] = useState(1);
  const [brandPage, setBrandPage] = useState(1);

  const totalProducts = productsList.length;
  const totalCategories = categories.length;
  const lowStockCount = productsList.filter(
    (p) => p.stock > 0 && p.stock <= p.minStock,
  ).length;
  const totalValue = productsList.reduce(
    (sum, p) => sum + p.price * p.stock,
    0,
  );

  // Filtering, search, sorting and pagination for the "All Products" table now
  // happen server-side — the backend returns only the current page + metadata.
  const totalPages = pagination.totalPages;

  const isAnyModalOpen =
    showAddForm ||
    editingProduct ||
    deleteConfirm ||
    selectedProduct ||
    showCategoryForm ||
    categoryDeleteTarget;
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAnyModalOpen]);

  const sortedStockProducts = useMemo(
    () => [...productsList].sort((a, b) => a.stock - b.stock),
    [productsList],
  );
  const stockTotalPages = Math.ceil(sortedStockProducts.length / itemsPerPage);
  const paginatedStockProducts = sortedStockProducts.slice(
    (stockPage - 1) * itemsPerPage,
    stockPage * itemsPerPage,
  );

  const uniqueBrands = useMemo(
    () => [...new Set(productsList.map((p) => p.brand))],
    [productsList],
  );

  // Vendor dropdown options: vendors from Vendor Management first, then any
  // existing product brands not backed by a vendor (keeps old data editable).
  const vendorOptions = useMemo(() => {
    const vendorNames = [
      ...new Set(vendorsList.map((v) => v.name).filter(Boolean)),
    ];
    const orphanBrands = uniqueBrands.filter(
      (b) => b && !vendorNames.includes(b),
    );
    return [...vendorNames, ...orphanBrands];
  }, [vendorsList, uniqueBrands]);

  // Dropdown options for Vendor field
  const vendorDropdownOptions = useMemo(() => {
    return [
      { value: "", label: "Select vendor" },
      ...vendorOptions.map((name) => ({ value: name, label: name })),
    ];
  }, [vendorOptions]);

  // When the vendor changes, the category dropdown narrows to that vendor's
  // categories. If the current category no longer fits, the first matching
  // category is auto-selected (or the field is cleared when none match).
  const handleBrandChange = (formik, val) => {
    const name = typeof val === "object" && val !== null && "target" in val ? val.target.value : val;
    formik.setFieldValue("brand", name);
    const vendor = vendorsList.find((v) => v.name === name);
    const vendorCats = vendor ? getVendorCategories(vendor) : [];
    const matched = categories.filter((cat) =>
      vendorCats.some((vc) => vc.toLowerCase() === cat.label.toLowerCase()),
    );
    const current = formik.values.category;
    if (matched.length) {
      if (!current || !matched.some((c) => c.id === current)) {
        formik.setFieldValue("category", matched[0].id);
      }
    } else if (vendorCats.length > 0 && current) {
      // The vendor has categories but none map to a product category — clear
      // the stale selection so the user picks again. A vendor with an empty
      // profile behaves like no vendor (all categories stay available).
      formik.setFieldValue("category", "");
    }
  };

  // Category options narrowed to the selected vendor's categories. With no
  // vendor chosen every category is offered; the current selection is always
  // kept visible so editing legacy products never blanks the field.
  const vendorCategoryOptions = (vendorName, currentCategory) => {
    const vendor = vendorsList.find((v) => v.name === vendorName);
    const vendorCats = vendor ? getVendorCategories(vendor) : [];
    const options = categories
      .filter(
        (cat) =>
          vendorCats.length === 0 ||
          vendorCats.some((vc) => vc.toLowerCase() === cat.label.toLowerCase()),
      )
      .map((cat) => ({ value: cat.id, label: cat.label }));
    if (currentCategory && !options.some((o) => o.value === currentCategory)) {
      const cur = categories.find((c) => c.id === currentCategory);
      if (cur) options.push({ value: cur.id, label: cur.label });
    }
    // Keep the current selection visible but present options alphabetically.
    return sortCategories(options, "label");
  };

  // Build Dropdown-compatible options for the "Link Inventory Item" field
  const inventoryDropdownOptions = useMemo(() => {
    const noneOption = { value: "", label: "None (auto-create in Inventory)" };
    const items = sortById(inventoryList, "invId").map((inv) => ({
      value: inv._id,
      label: `${inv.name}`,
    }));
    return [noneOption, ...items];
  }, [inventoryList]);

  const [brandsPerPage, setBrandsPerPage] = useState(10);
  const filteredBrands = useMemo(
    () =>
      uniqueBrands.filter((b) => brandFilter === "all" || brandFilter === b),
    [uniqueBrands, brandFilter],
  );
  const brandTotalPages = Math.ceil(filteredBrands.length / brandsPerPage);
  const paginatedBrands = filteredBrands.slice(
    (brandPage - 1) * brandsPerPage,
    brandPage * brandsPerPage,
  );

  const getStockStatus = (product) => {
    if (product.stock === 0) return "out";
    if (product.stock <= product.minStock) return "low";
    return "ok";
  };

  // Whether a product belongs in the currently filtered table view (used for
  // instant local updates after create/edit without refetching the server).
  const productMatchesFilters = (p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (statusFilter !== "all") {
      const st = getStockStatus(p);
      if (statusFilter === "in-stock" && st !== "ok") return false;
      if (statusFilter === "low-stock" && st !== "low") return false;
      if (statusFilter === "out-of-stock" && st !== "out") return false;
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      const hay = `${p.name || ""} ${p.brand || ""} ${p.productId || ""} ${p.id || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const getStockPercent = (product) => {
    const max = Math.max(product.minStock * 5, product.stock);
    return Math.min((product.stock / max) * 100, 100);
  };

  const getCategoryLabel = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.label : catId;
  };

  const getCategoryColor = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.color : "#6b7280";
  };

  const getCategoryIcon = (catId) => {
    const icons = {
      "solar-panels": (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      ),
      inverters: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="13 2 13 9 22 2 13 9" />
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72" />
        </svg>
      ),
      batteries: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="6" width="18" height="12" rx="2" />
          <line x1="23" y1="10" x2="23" y2="14" />
          <rect x="4" y="9" width="4" height="6" />
          <rect x="10" y="9" width="4" height="6" />
        </svg>
      ),
      "solar-water-pumps": (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22a8 8 0 008-8c0-3.4-2.1-6.3-5-7.4V4a2 2 0 00-4 0v2.6C6.1 7.7 4 10.6 4 14a8 8 0 008 8z" />
          <circle cx="12" cy="14" r="2" />
        </svg>
      ),
      "charge-controllers": (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
      "mounting-structures": (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 21h18" />
          <path d="M5 21V7l8-4v18" />
          <path d="M19 21V11l-6-4" />
          <line x1="9" y1="9" x2="9" y2="9.01" />
          <line x1="9" y1="13" x2="9" y2="13.01" />
          <line x1="9" y1="17" x2="9" y2="17.01" />
        </svg>
      ),
      connectors: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 2v4m10-4v4M3 8h4m10 0h4M5 12h14" />
          <rect x="3" y="12" width="18" height="10" rx="2" />
        </svg>
      ),
      cables: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
          <path d="M17 8l5-5" />
          <path d="M22 3v5h-5" />
        </svg>
      ),
    };
    return icons[catId] || icons["solar-panels"];
  };


  const formatCurrency = (val) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatNum = (val) => {
    return new Intl.NumberFormat("en-IN").format(val);
  };

  const handleAddProduct = () => {
    addFormik.submitForm();
  };

  const handleEditProduct = (product) => {
    setEditingProduct({
      ...product,
      costPrice: String(product.costPrice ?? product.price ?? ""),
      price: String(product.price),
      stock: String(product.stock),
      minStock: String(product.minStock),
    });
    editFormik.setTouched({});
    editFormik.setErrors({});
  };

  const handleViewProduct = (product) => {
    setSelectedProduct(product);
  };


const downloadProductLog = async (p) => {
  const doc = await createProfilePdf({
    bannerName: p.name,
    bannerSubtitle: `Product ID: ${p.id}`,
    bannerRight: [`Status: ${p.status || "—"}`, `Category: ${p.category || "—"}`],
    sections: [
      {
        title: "Product Details",
        fields: [
          ["Category", p.category],
          ["Brand", p.brand],
          ["Cost Price", formatCurrencyPdf(p.costPrice || 0)],
          ["Selling Price", formatCurrencyPdf(p.price)],
          ["Margin", formatCurrencyPdf(p.price - (p.costPrice || 0))],
          ["Stock", formatNum(p.stock)],
          ["Min Stock", formatNum(p.minStock)],
          ["Warranty", `${p.warranty} years`],
        ],
      },
    ],
  });

  const safeName = (p.name || "Product")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`ProductLog_${safeName}.pdf`);
};

  const handleSaveEdit = () => {
    editFormik.submitForm();
  };

  const handleDeleteProduct = async (product) => {
    try {
      await productAPI.delete(product._id);
      const pid = product._id;
      // Remove locally so the table + stats update instantly (no refetch)
      setProductsList((prev) => prev.filter((x) => x._id !== pid));
      setTableProducts((prev) => prev.filter((x) => x._id !== pid));
      setPagination((prev) => {
        const total = Math.max(0, (prev.total || 0) - 1);
        return { ...prev, total, totalPages: Math.max(1, Math.ceil(total / itemsPerPage)) };
      });
      if (selectedProduct && selectedProduct._id === product._id)
        setSelectedProduct(null);
      success("Product deleted successfully.");
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete product. Please try again.",
      );
    }
  };

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="products-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="product-page">
      <header className="product-header">
        <div>
          <h1 className="product-header-title">Product Catalog</h1>
          <p className="product-header-subtitle">
            Manage your solar product inventory — track stock levels,
            categories, brands, and pricing across all product lines.
          </p>
        </div>
      </header>

      {/* Stats Summary */}
      <div className="pc-stats-grid">
        <StatCard
          title="Total Products"
          value={totalProducts.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="12" y1="4" x2="12" y2="20" /></svg>}
          color="blue"
        />
        <StatCard
          title="Categories"
          value={totalCategories.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>}
          color="purple"
        />
        <StatCard
          title="Low Stock"
          value={lowStockCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="red"
        />
        <StatCard
          title="Total Value"
          value={`₹${totalValue.toLocaleString()}`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="green"
        />
      </div>

      {/* Tab Navigation */}
      <div className="product-tabs">
        <button
          className={`product-tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Products
          <span className="product-tab-count">{totalProducts}</span>
        </button>
        <button
          className={`product-tab-btn ${activeTab === "categories" ? "active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          Categories
          <span className="product-tab-count">{totalCategories}</span>
        </button>
        <button
          className={`product-tab-btn ${activeTab === "brands" ? "active" : ""}`}
          onClick={() => setActiveTab("brands")}
        >
          Vendors
          <span className="product-tab-count">{uniqueBrands.length}</span>
        </button>
        <button
          className={`product-tab-btn ${activeTab === "stock" ? "active" : ""}`}
          onClick={() => setActiveTab("stock")}
        >
          Stock
          {lowStockCount > 0 && (
            <span className="product-tab-count warning">{lowStockCount}</span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="product-tab-content">
        {loading ? (
          <PageLoader minHeight="300px" />
        ) : (
        <>
        {/* ===== ALL PRODUCTS TAB ===== */}
        {activeTab === "all" && (
          <div className="product-products-section">
            {/* Filter Bar */}
            <div className="product-filter-bar">
              <div className="product-filter-actions">
                <div className="product-filter-search">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search products by name, brand, ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="product-search-clear"
                      onClick={() => setSearchQuery("")}
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
                {/* Category Dropdown */}
                <Dropdown
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[
                    { value: "all", label: "All Categories" },
                    ...sortCategories(categories, "label").map((cat) => ({
                      value: cat.id,
                      label: cat.label,
                    })),
                  ]}
                  placeholder="All Categories"
                />
                {/* Status Dropdown */}
                <Dropdown
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "in-stock", label: "In Stock" },
                    { value: "low-stock", label: "Low Stock" },
                    { value: "out-of-stock", label: "Out of Stock" },
                  ]}
                  placeholder="All Status"
                />
                <div className="product-filter-divider"></div>
                <div className="product-view-toggle">
                  <button
                    className={`view-btn ${viewMode === "table" ? "active" : ""}`}
                    onClick={() => setViewMode("table")}
                    title="Table View"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
                  <button
                    className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
                    onClick={() => setViewMode("grid")}
                    title="Grid View"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                </div>
                {canDo("products", "create") && (
                <button
                  className="product-add-btn"
                  onClick={() => {
                    if (!showAddForm) addFormik.resetForm();
                    setShowAddForm(!showAddForm);
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Product
                </button>
                )}
              </div>
            </div>

            {/* Add Product Form */}
            {showAddForm && (
              <div className="product-form-overlay">
                <div
                  className="product-add-form"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="product-form-header">
                    <h3>Add New Product</h3>
                    <button
                      className="product-form-close"
                      onClick={() => {
                        addFormik.resetForm();
                        setShowAddForm(false);
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
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
                  <div className="product-form-grid">
                      <div className="product-form-field">
                      <label>Vendor</label>
                      <Dropdown
                        value={addFormik.values.brand}
                        onChange={(val) => handleBrandChange(addFormik, val)}
                        options={vendorDropdownOptions}
                        variant="form"
                        placeholder="Select vendor"
                      />
                      {addFormik.touched.brand && addFormik.errors.brand && (
                        <span className="product-field-error">
                          {addFormik.errors.brand}
                        </span>
                      )}
                    </div>
                  
                  
                    <div className="product-form-field">
                      <label>Category</label>
                      <div className="product-category-field-row">
                        <Dropdown
                          value={addFormik.values.category}
                          onChange={(val) => addFormik.setFieldValue("category", val)}
                          options={vendorCategoryOptions(
                            addFormik.values.brand,
                            addFormik.values.category,
                          )}
                          variant="form"
                        />
                      </div>
                      {addFormik.values.brand &&
                        vendorCategoryOptions(
                          addFormik.values.brand,
                          addFormik.values.category,
                        ).length === 0 && (
                          <span className="product-form-hint">
                            No categories match this vendor's profile — add one in Vendor Management.
                          </span>
                        )}
                    </div>
                      <div className="product-form-field">
                      <label>Product Name</label>
                      <input
                        type="text"
                        name="name"
                        placeholder="Enter product name"
                        className={addFormik.touched.name && addFormik.errors.name ? "input-error" : ""}
                        value={addFormik.values.name}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      {addFormik.touched.name && addFormik.errors.name && (
                        <span className="product-field-error">
                          {addFormik.errors.name}
                        </span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Link Inventory Item</label>
                      <Dropdown
                        value={addFormik.values.inventoryItemId || ""}
                        onChange={(val) => handleInventoryLinkChange(addFormik, val)}
                        options={inventoryDropdownOptions}
                        variant="form"
                        placeholder="None (auto-create in Inventory)"
                      />
                      {addFormik.values.inventoryItemId ? (
                        <span className="product-form-hint">
                          Stock is managed by this Inventory item — edit the quantity in the Inventory page.
                        </span>
                      ) : (
                        <span className="product-form-hint">
                          No inventory item linked — one is created automatically in Inventory Management when you save.
                        </span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Cost Price / Vendor Price (₹)</label>
                      <input
                        type="number"
                        name="costPrice"
                        placeholder="0.00"
                        value={addFormik.values.costPrice}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      <span className="product-form-hint">
                        Price from vendor — used to calculate margin.
                      </span>
                    </div>
                    <div className="product-form-field">
                      <label>Selling Price (₹)</label>
                      <input
                        type="number"
                        name="price"
                        placeholder="0.00"
                        className={addFormik.touched.price && addFormik.errors.price ? "input-error" : ""}
                        value={addFormik.values.price}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      {addFormik.touched.price && addFormik.errors.price && (
                        <span className="product-field-error">
                          {addFormik.errors.price}
                        </span>
                      )}
                      {addFormik.values.costPrice && addFormik.values.price && (
                        <span className="product-form-hint" style={{ color: parseFloat(addFormik.values.price) >= parseFloat(addFormik.values.costPrice) ? '#16a34a' : '#dc2626' }}>
                          Margin: ₹{(parseFloat(addFormik.values.price) - parseFloat(addFormik.values.costPrice)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Stock</label>
                      <input
                        type="number"
                        name="stock"
                        placeholder="0"
                        disabled={!!addFormik.values.inventoryItemId}
                        className={addFormik.touched.stock && addFormik.errors.stock ? "input-error" : ""}
                        value={addFormik.values.stock}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      {addFormik.touched.stock && addFormik.errors.stock && (
                        <span className="product-field-error">{addFormik.errors.stock}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Min Stock</label>
                      <input
                        type="number"
                        name="minStock"
                        placeholder="10"
                        disabled={!!addFormik.values.inventoryItemId}
                        className={addFormik.touched.minStock && addFormik.errors.minStock ? "input-error" : ""}
                        value={addFormik.values.minStock}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      {addFormik.touched.minStock && addFormik.errors.minStock && (
                        <span className="product-field-error">{addFormik.errors.minStock}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Warranty (years)</label>
                      <input
                        type="number"
                        name="warranty"
                        placeholder="e.g. 5"
                        className={addFormik.touched.warranty && addFormik.errors.warranty ? "input-error" : ""}
                        value={addFormik.values.warranty}
                        onChange={addFormik.handleChange}
                        onBlur={addFormik.handleBlur}
                      />
                      {addFormik.touched.warranty && addFormik.errors.warranty && (
                        <span className="product-field-error">{addFormik.errors.warranty}</span>
                      )}
                    </div>
                  </div>
                  <div className="product-form-actions">
                    <button
                      className="product-form-cancel"
                      onClick={() => {
                        addFormik.resetForm();
                        setShowAddForm(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="product-form-submit"
                      onClick={handleAddProduct}
                    >
                      Add Product
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Product Form */}
            {editingProduct && (
              <div className="product-form-overlay">
                <div
                  className="product-add-form"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="product-form-header">
                    <h3>Edit Product: {editingProduct.id}</h3>
                    <button
                      className="product-form-close"
                      onClick={() => {
                        editFormik.resetForm();
                        setEditingProduct(null);
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
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
                  <div className="product-form-grid">
                    <div className="product-form-field">
                      <label>Product Name</label>
                      <input
                        type="text"
                        name="name"
                        className={editFormik.touched.name && editFormik.errors.name ? "input-error" : ""}
                        value={editFormik.values.name}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      {editFormik.touched.name && editFormik.errors.name && (
                        <span className="product-field-error">{editFormik.errors.name}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Vendor</label>
                      <Dropdown
                        value={editFormik.values.brand}
                        onChange={(val) => handleBrandChange(editFormik, val)}
                        options={vendorDropdownOptions}
                        variant="form"
                        placeholder="Select vendor"
                      />
                      {editFormik.touched.brand && editFormik.errors.brand && (
                        <span className="product-field-error">{editFormik.errors.brand}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Category</label>
                      <div className="product-category-field-row">
                        <Dropdown
                          value={editFormik.values.category}
                          onChange={(val) => editFormik.setFieldValue("category", val)}
                          options={vendorCategoryOptions(
                            editFormik.values.brand,
                            editFormik.values.category,
                          )}
                          variant="form"
                        />
                      </div>
                      {editFormik.values.brand &&
                        vendorCategoryOptions(
                          editFormik.values.brand,
                          editFormik.values.category,
                        ).length === 0 && (
                          <span className="product-form-hint">
                            No categories match this vendor's profile — add one in Vendor Management.
                          </span>
                        )}
                    </div>
                                        <div className="product-form-field">
                      <label>Warranty (years)</label>
                      <input
                        type="number"
                        name="warranty"
                        placeholder="e.g. 5"
                        className={editFormik.touched.warranty && editFormik.errors.warranty ? "input-error" : ""}
                        value={editFormik.values.warranty}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      {editFormik.touched.warranty && editFormik.errors.warranty && (
                        <span className="product-field-error">{editFormik.errors.warranty}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Cost Price / Vendor Price (₹)</label>
                      <input
                        type="number"
                        name="costPrice"
                        className={editFormik.touched.costPrice && editFormik.errors.costPrice ? "input-error" : ""}
                        value={editFormik.values.costPrice}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      <span className="product-form-hint">
                        Price from vendor — used to calculate margin.
                      </span>
                    </div>
                    <div className="product-form-field">
                      <label>Selling Price (₹)</label>
                      <input
                        type="number"
                        name="price"
                        className={editFormik.touched.price && editFormik.errors.price ? "input-error" : ""}
                        value={editFormik.values.price}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      {editFormik.touched.price && editFormik.errors.price && (
                        <span className="product-field-error">{editFormik.errors.price}</span>
                      )}
                      {editFormik.values.costPrice && editFormik.values.price && (
                        <span className="product-form-hint" style={{ color: parseFloat(editFormik.values.price) >= parseFloat(editFormik.values.costPrice) ? '#16a34a' : '#dc2626' }}>
                          Margin: ₹{(parseFloat(editFormik.values.price) - parseFloat(editFormik.values.costPrice)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Stock</label>
                      <input
                        type="number"
                        name="stock"
                        disabled={!!editFormik.values.inventoryItemId}
                        className={editFormik.touched.stock && editFormik.errors.stock ? "input-error" : ""}
                        value={editFormik.values.stock}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      {editFormik.touched.stock && editFormik.errors.stock && (
                        <span className="product-field-error">{editFormik.errors.stock}</span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Min Stock</label>
                      <input
                        type="number"
                        name="minStock"
                        disabled={!!editFormik.values.inventoryItemId}
                        className={editFormik.touched.minStock && editFormik.errors.minStock ? "input-error" : ""}
                        value={editFormik.values.minStock}
                        onChange={editFormik.handleChange}
                        onBlur={editFormik.handleBlur}
                      />
                      {editFormik.touched.minStock && editFormik.errors.minStock && (
                        <span className="product-field-error">{editFormik.errors.minStock}</span>
                      )}
                    </div>
                  </div>
                  <div className="product-form-actions">
                    <button
                      className="product-form-cancel"
                      onClick={() => {
                        editFormik.resetForm();
                        setEditingProduct(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="product-form-submit"
                      onClick={handleSaveEdit}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation */}
            <ConfirmDialog
              isOpen={!!deleteConfirm}
              title="Delete Product"
              message={`Are you sure you want to delete ${deleteConfirm?.name}?`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={() => {
                handleDeleteProduct(deleteConfirm);
                setDeleteConfirm(null);
              }}
              onCancel={() => setDeleteConfirm(null)}
            />

            {/* Table View */}
            {viewMode === "table" && (
              <div className="product-table-wrap">
                <div className="product-table-scroll">
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Brand</th>
                        <th>Cost Price</th>
                        <th>Selling Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableProducts.length === 0 ? (
                        <tr>
                          <td colSpan="10">
                            <div className="product-empty">
                              <svg
                                width="48"
                                height="48"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#d1d5db"
                                strokeWidth="1.5"
                              >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <p>No products match your filters</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        tableProducts.map((p) => {
                          const stockStatus = getStockStatus(p);
                          return (
                            <tr key={p.id}>
                              <td className="product-td-id">{p.id}</td>
                              <td className="product-td-name">
                                <div className="product-td-name-wrap">
                                  <div
                                    className="product-td-icon"
                                    style={{
                                      background: `${getCategoryColor(p.category)}15`,
                                      color: getCategoryColor(p.category),
                                    }}
                                  >
                                    {getCategoryIcon(p.category)}
                                  </div>
                                  <div className="product-td-name-info">
                                    <span className="product-td-name-text">
                                      {p.name}
                                    </span>
                                    {p.inventoryItemId && (
                                      <span
                                        className="product-linked-badge"
                                        title={`Linked to ${p.inventoryItemId.name} (${p.inventoryItemId.quantity} @ ${p.inventoryItemId.location})`}
                                      >
                                        {p.inventoryItemId.invId || "INV"} · {p.inventoryItemId.location}
                                      </span>
                                    )}
                                    {p.specs &&
                                      Object.keys(p.specs).length > 0 && (
                                        <button
                                          className="product-spec-toggle"
                                          onClick={() =>
                                            setSelectedProduct(
                                              selectedProduct &&
                                                selectedProduct.id === p.id
                                                ? null
                                                : p,
                                            )
                                          }
                                        >
                                          {selectedProduct &&
                                          selectedProduct.id === p.id
                                            ? "Hide specs"
                                            : "View specs"}
                                        </button>
                                      )}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span
                                  className="product-cat-badge"
                                  style={{
                                    background: `${getCategoryColor(p.category)}15`,
                                    color: getCategoryColor(p.category),
                                  }}
                                >
                                  {getCategoryLabel(p.category)}
                                </span>
                              </td>
                              <td className="product-td-brand">{p.brand}</td>
                              <td className="product-td-price">
                                ₹
                                {(p.costPrice || 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="product-td-price">
                                <strong>₹
                                {p.price.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}</strong>
                              </td>
                              <td className="product-td-stock">
                                <div className="product-stock-cell">
                                  <span className="product-stock-num">
                                    {p.stock.toLocaleString()}
                                  </span>
                                  <div
                                    className={`product-stock-bar bar-${stockStatus}`}
                                  >
                                    <div
                                      className="product-stock-fill"
                                      style={{
                                        width: `${getStockPercent(p)}%`,
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`product-status-badge status-${stockStatus}`}
                                >
                                  {stockStatus === "ok"
                                    ? "In Stock"
                                    : stockStatus === "low"
                                      ? "Low Stock"
                                      : "Out of Stock"}
                                </span>
                              </td>
                              <td className="product-td-actions">
                                <div className="act-actions">
                                  <button
                                    className="act-btn act-view"
                                    onClick={() => handleViewProduct(p)}
                                    title="View Details"
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
                                    module="products"
                                    onClick={() => {
                                      const prId = p.serverId || p._id || p.id;
                                      navigate(`/admin/products-activity/${prId}`, {
                                        state: { target: { recordId: prId, recordLabel: p.productId || p.name, module: "products" } },
                                      });
                                    }}
                                    title="View Product Activity Log"
                                  />
                                  {canDo("products", "edit") && (
                                  <button
                                    className="act-btn act-edit"
                                    onClick={() => handleEditProduct(p)}
                                    title="Edit"
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
                                  {canDo("products", "delete") && (
                                  <button
                                    className="act-btn act-delete"
                                    onClick={() => setDeleteConfirm(p)}
                                    title="Delete"
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
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="product-pagination-row">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={pagination.total}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    variant="table"
                    onPageSizeChange={(val) => {
                      setItemsPerPage(Number(val));
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Expanded Specs Panel */}
            {selectedProduct && (
              <div className="product-form-overlay">
                <div
                  className="product-spec-panel"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="product-spec-panel-header">
                    <div className="product-spec-panel-title">
                      <div
                        className="product-spec-panel-icon"
                        style={{
                          background: `${getCategoryColor(selectedProduct.category)}15`,
                          color: getCategoryColor(selectedProduct.category),
                        }}
                      >
                        {getCategoryIcon(selectedProduct.category)}
                      </div>
                      <div>
                        <h3>{selectedProduct.name}</h3>
                        <span>
                          {selectedProduct.brand} &middot; {selectedProduct.id}
                        </span>
                      </div>
                    </div>
                    <button
                      className="product-spec-panel-close"
                      onClick={() => setSelectedProduct(null)}
                    >
                      <svg
                        width="18"
                        height="18"
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
                  <div className="product-spec-body">
                    <div className="product-spec-section">
                      <h4>Product Information</h4>
                      <div className="product-spec-grid">
                        {/* <div className="product-spec-item">
                          <span className="product-spec-key">Product ID</span>
                          <span className="product-spec-value">
                            {selectedProduct.id}
                          </span>
                        </div> */}
                        <div className="product-spec-item">
                          <span className="product-spec-key">Name</span>
                          <span className="product-spec-value">
                            {selectedProduct.name}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Brand</span>
                          <span className="product-spec-value">
                            {selectedProduct.brand}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Category</span>
                          <span className="product-spec-value">
                            {getCategoryLabel(selectedProduct.category)}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Cost Price</span>
                          <span className="product-spec-value">
                            $
                            {(selectedProduct.costPrice || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Selling Price</span>
                          <span className="product-spec-value product-spec-highlight">
                            $
                            {selectedProduct.price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Margin</span>
                          <span className="product-spec-value" style={{ color: (selectedProduct.price - (selectedProduct.costPrice || 0)) >= 0 ? '#16a34a' : '#dc2626' }}>
                            $
                            {(selectedProduct.price - (selectedProduct.costPrice || 0)).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Stock</span>
                          <span className="product-spec-value">
                            {selectedProduct.stock.toLocaleString()} units
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Min Stock</span>
                          <span className="product-spec-value">
                            {selectedProduct.minStock.toLocaleString()} units
                          </span>
                        </div>
                        <div className="product-spec-item">
                          <span className="product-spec-key">Status</span>
                          <span className="product-spec-value">
                            {selectedProduct.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {selectedProduct.specs &&
                      Object.keys(selectedProduct.specs).length > 0 && (
                        <div className="product-spec-section">
                          <h4>Specifications</h4>
                          <div className="product-spec-grid">
                            {Object.entries(selectedProduct.specs).map(
                              ([key, value]) => (
                                <div key={key} className="product-spec-item">
                                  <span className="product-spec-key">
                                    {key
                                      .replace(/([A-Z])/g, " $1")
                                      .replace(/^./, (s) => s.toUpperCase())}
                                  </span>
                                  <span className="product-spec-value">
                                    {value}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                  <div className="product-spec-footer">
                    <button
                      className="product-spec-footer-close"
                      onClick={() => setSelectedProduct(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Grid View */}
            {viewMode === "grid" && (
              <>
                <div className="product-grid">
                  {tableProducts.map((p) => {
                    const stockStatus = getStockStatus(p);
                    return (
                      <div key={p.id} className="product-card">
                        <div
                          className="product-card-image"
                          style={{
                            background: `${getCategoryColor(p.category)}10`,
                          }}
                        >
                          <div
                            className="product-card-image-icon"
                            style={{ color: getCategoryColor(p.category) }}
                          >
                            {getCategoryIcon(p.category)}
                          </div>
                          <span
                            className={`product-status-badge status-${stockStatus}`}
                          >
                            {stockStatus === "ok"
                              ? "In Stock"
                              : stockStatus === "low"
                                ? "Low Stock"
                                : "Out of Stock"}
                          </span>
                        </div>
                        <div className="product-card-body">
                          <div className="product-card-top">
                            <span className="product-card-id">{p.id}</span>
                          </div>
                          <h4 className="product-card-name">{p.name}</h4>
                          {p.inventoryItemId && (
                            <span
                              className="product-linked-badge"
                              title={`Linked to ${p.inventoryItemId.name} (${p.inventoryItemId.quantity} @ ${p.inventoryItemId.location})`}
                            >
                              {p.inventoryItemId.invId || "INV"} · {p.inventoryItemId.location}
                            </span>
                          )}
                          <div className="product-card-meta">
                            <span className="product-card-brand">
                              {p.brand}
                            </span>
                            <span
                              className="product-cat-badge"
                              style={{
                                background: `${getCategoryColor(p.category)}15`,
                                color: getCategoryColor(p.category),
                              }}
                            >
                              {getCategoryLabel(p.category)}
                            </span>
                          </div>
                          <div className="product-card-bottom">
                            <div className="product-card-pricing">
                              <span className="product-card-cost-price">
                                Cost: ₹
                                {(p.costPrice || 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                              <span className="product-card-price">
                                $
                                {p.price.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div className="product-card-stock">
                              <div className="product-stock-label">
                                <span>Stock: {p.stock.toLocaleString()}</span>
                              </div>
                              <div
                                className={`product-stock-bar bar-${stockStatus}`}
                              >
                                <div
                                  className="product-stock-fill"
                                  style={{ width: `${getStockPercent(p)}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                          <div className="product-card-actions">
                            <button
                              className="product-card-action view"
                              onClick={() => handleViewProduct(p)}
                              title="View"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            <button
                              className="product-card-action edit"
                              onClick={() => {
                                handleEditProduct(p);
                              }}
                              title="Edit"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              className="product-card-action delete"
                              onClick={() => setDeleteConfirm(p)}
                              title="Delete"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                            {canDo("products", "export") && (
                            <button
                              className="product-card-action log"
                              onClick={() => setShowLogModal(p)}
                              title="Download Log"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="product-pagination-row">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={pagination.total}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    variant="table"
                    onPageSizeChange={(val) => {
                      setItemsPerPage(Number(val));
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== CATEGORIES TAB ===== */}
        {activeTab === "categories" && (
          <div className="product-categories-section">
            <div className="product-section-header">
              <h3>Product Categories</h3>
              <div className="product-section-header-right">
                <span className="product-section-badge">
                  {totalCategories} categories
                </span>
                {canDo("products", "create") && (
                  <button
                    className="product-add-btn"
                    onClick={() => openCategoryForm("tab")}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Category
                  </button>
                )}
              </div>
            </div>

            {/* Add Category Form */}
            {showCategoryForm && (
              <div className="product-form-overlay">
                <div
                  className="product-add-form"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="product-form-header">
                    <h3>
                      {editingCategory ? "Edit Category" : "Add New Category"}
                    </h3>
                    <button
                      className="product-form-close"
                      onClick={closeCategoryForm}
                    >
                      <svg
                        width="18"
                        height="18"
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
                  <div className="product-form-grid">
                    <div className="product-form-field">
                      <label>Category Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Solar Trackers"
                        className={categoryFormError ? "input-error" : ""}
                        value={categoryForm.label}
                        onChange={(e) => {
                          setCategoryFormError("");
                          setCategoryForm((prev) => ({
                            ...prev,
                            label: e.target.value,
                          }));
                        }}
                      />
                      {categoryFormError && (
                        <span className="product-field-error">
                          {categoryFormError}
                        </span>
                      )}
                      {editingCategory ? (
                        <span className="product-form-hint">
                          Key: {editingCategory.id} (cannot be changed)
                        </span>
                      ) : (
                        <span className="product-form-hint">
                          Slug: {slugify(categoryForm.label) || "—"}
                        </span>
                      )}
                    </div>
                    <div className="product-form-field">
                      <label>Color</label>
                      <div className="product-category-colors">
                        {CATEGORY_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`product-category-color ${categoryForm.color === color ? "active" : ""}`}
                            style={{ background: color }}
                            onClick={() =>
                              setCategoryForm((prev) => ({ ...prev, color }))
                            }
                            aria-label={color}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="product-form-field">
                      <label>Icon</label>
                      <div className="product-category-icons">
                        {[
                          // Show the current icon first even if it was saved
                          // with a value outside the preset list.
                          ...(categoryForm.icon &&
                          !CATEGORY_ICONS.includes(categoryForm.icon)
                            ? [categoryForm.icon]
                            : []),
                          ...CATEGORY_ICONS,
                        ].map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className={`product-category-icon ${categoryForm.icon === icon ? "active" : ""}`}
                            onClick={() =>
                              setCategoryForm((prev) => ({ ...prev, icon }))
                            }
                            aria-label={`Icon ${icon}`}
                            title={icon}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="product-form-field">
                      <label>Description (optional)</label>
                      <input
                        type="text"
                        placeholder="Short description of this category"
                        value={categoryForm.description}
                        onChange={(e) =>
                          setCategoryForm((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="product-form-actions">
                    <button
                      className="product-form-cancel"
                      onClick={closeCategoryForm}
                    >
                      Cancel
                    </button>
                    <button
                      className="product-form-submit"
                      onClick={handleSaveCategory}
                      disabled={categorySubmitting}
                    >
                      {categorySubmitting
                        ? "Saving…"
                        : editingCategory
                          ? "Save Changes"
                          : "Create Category"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Category Confirmation */}
            <ConfirmDialog
              isOpen={!!categoryDeleteTarget}
              title="Delete Category"
              message={`Are you sure you want to delete "${categoryDeleteTarget?.label}"? Categories that still have products cannot be deleted.`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={() => {
                if (categoryDeleteTarget) handleDeleteCategory(categoryDeleteTarget);
                setCategoryDeleteTarget(null);
              }}
              onCancel={() => setCategoryDeleteTarget(null)}
            />

            {categoriesStatus === "error" && (
              <div className="cat-offline-note">
                Couldn&apos;t reach the server — showing a temporary sample list.
                Edit &amp; delete are disabled until the connection is back.
              </div>
            )}

            {categoriesStatus === "ready" && categories.length === 0 ? (
              <div className="cat-empty-state">
                <div className="cat-empty-icon">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </div>
                <h4>No categories yet</h4>
                <p>
                  Categories are fully dynamic — create, edit, or delete them
                  anytime from this page.
                </p>
                {canDo("products", "create") && (
                  <button
                    className="product-add-btn"
                    onClick={() => openCategoryForm("tab")}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Category
                  </button>
                )}
              </div>
            ) : (
            <div className="cat-grid">
              {(() => {
                const catTotalPages = Math.max(1, Math.ceil(categories.length / catPageSize));
                const safeCatPage = Math.min(catPage, catTotalPages);
                const paginatedCategories = categories.slice((safeCatPage - 1) * catPageSize, safeCatPage * catPageSize);
                return paginatedCategories.map((cat) => {
                const catProducts = productsList.filter(
                  (p) => p.category === cat.id,
                );
                const count = catProducts.length;
                const totalStock = catProducts.reduce((s, p) => s + p.stock, 0);
                const totalCatValue = catProducts.reduce(
                  (s, p) => s + p.price * p.stock,
                  0,
                );
                const lowCount = catProducts.filter(
                  (p) => p.stock > 0 && p.stock <= p.minStock,
                ).length;
                const outCount = catProducts.filter(
                  (p) => p.stock === 0,
                ).length;
                return (
                  <div
                    key={cat.id}
                    className="cat-card"
                    style={{ borderLeftColor: cat.color }}
                  >
                    <div className="cat-card-top">
                      <div
                        className="cat-card-icon"
                        style={{
                          background: `${cat.color}15`,
                          color: cat.color,
                        }}
                      >
                        {SVG_CATEGORY_KEYS.includes(cat.id) || !cat.icon ? (
                          getCategoryIcon(cat.id)
                        ) : (
                          <span className="product-cat-emoji">{cat.icon}</span>
                        )}
                      </div>
                      <div className="cat-card-header-info">
                        <h4 className="cat-card-name">{cat.label}</h4>
                        <span className="cat-card-count">
                          {count} product{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {canDo("products", "edit") && cat._id && (
                        <div className="cat-card-actions">
                          <button
                            className="cat-card-action-btn edit"
                            title="Edit category"
                            onClick={() => openCategoryForm("edit", cat)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          {canDo("products", "delete") && (
                          <button
                            className="cat-card-action-btn delete"
                            title="Delete category"
                            onClick={() => setCategoryDeleteTarget(cat)}
                          >
                            <svg
                              width="14"
                              height="14"
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
                      )}
                    </div>
                    <div className="cat-card-stats">
                      <div className="cat-card-stat">
                         <span className="cat-card-stat-label">Stock</span>
                        <span className="cat-card-stat-value">
                          {totalStock.toLocaleString()}
                        </span>
                       </div>
                      <div className="cat-card-stat">
                        <span className="cat-card-stat-label">Value</span>
                        <span className="cat-card-stat-value">
                          ${totalCatValue.toLocaleString()}
                        </span>
                      </div>
                      <div className="cat-card-stat">
                         <span className="cat-card-stat-label">Avg. Price</span>
                        <span className="cat-card-stat-value">
                          $
                          {count > 0
                            ? Math.round(totalCatValue / count).toLocaleString()
                            : 0}
                        </span>
                      </div>
                    </div>
                    {(lowCount > 0 || outCount > 0) && (
                      <div className="cat-card-alerts">
                        {outCount > 0 && (
                          <span className="cat-alert cat-alert-out">
                            {outCount} out of stock
                          </span>
                        )}
                        {lowCount > 0 && (
                          <span className="cat-alert cat-alert-low">
                            {lowCount} low stock
                          </span>
                        )}
                      </div>
                    )}
                    <div className="cat-card-products">
                      <span className="cat-card-products-label">Products</span>
                      {catProducts.map((p) => {
                        const ss = getStockStatus(p);
                        return (
                          <div key={p.id} className="cat-card-product-row">
                            <div className="cat-card-product-left">
                              <span className={`cat-dot dot-${ss}`}></span>
                              <span className="cat-card-product-name">
                                {p.name}
                              </span>
                            </div>
                            <span className="cat-card-product-price">
                              ${p.price.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });})()}
            {categories.length > catPageSize && (
              <div className="product-pagination-row" style={{ marginTop: 16 }}>
                <Pagination currentPage={catPage} totalPages={Math.max(1, Math.ceil(categories.length / catPageSize))} totalItems={categories.length} pageSize={catPageSize} onPageChange={setCatPage} onPageSizeChange={(val) => { setCatPageSize(Number(val)); setCatPage(1); }} />
              </div>
            )}
            </div>
            )}
            <div className="product-panel-row">
              <div className="product-panel-card">
                <div className="product-panel-header">
                  <h3>Category Distribution</h3>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="#9ca3af"
                      angle={-30}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "none",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Bar dataKey="count" name="Products" radius={[4, 4, 0, 0]}>
                      {categoryData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="product-panel-card">
                <div className="product-panel-header">
                  <h3>Brand Share</h3>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={brandData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {brandData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "none",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="product-legend">
                  {brandData.map((item, index) => (
                    <div key={item.name} className="product-legend-item">
                      <span
                        className="product-legend-dot"
                        style={{ background: COLORS[index % COLORS.length] }}
                      ></span>
                      <span className="product-legend-name">{item.name}</span>
                      <span className="product-legend-value">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== BRANDS TAB ===== */}
        {activeTab === "brands" && (
          <div className="product-brands-section">
            <div className="product-section-header">
              <h3>Brand Management</h3>
              <div className="product-section-header-right">
                <Dropdown
                  value={brandFilter}
                  onChange={setBrandFilter}
                  options={[
                    {
                      value: "all",
                      label: `All Brands`,
                    },
                    ...uniqueBrands.map((brand) => ({
                      value: brand,
                      label: `${brand}`,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="brand-cards">
              {paginatedBrands.map((brand, idx) => {
                const brandProducts = productsList.filter(
                  (p) => p.brand === brand,
                );
                const brandTotalStock = brandProducts.reduce(
                  (s, p) => s + p.stock,
                  0,
                );
                const brandTotalValue = brandProducts.reduce(
                  (s, p) => s + p.price * p.stock,
                  0,
                );
                const avgPrice =
                  brandProducts.length > 0
                    ? brandProducts.reduce((s, p) => s + p.price, 0) /
                      brandProducts.length
                    : 0;
                return (
                  <div key={brand} className="brand-card">
                    <div className="brand-card-header">
                      <div
                        className="brand-card-avatar"
                        style={{
                          background: `${COLORS[idx % COLORS.length]}15`,
                          color: COLORS[idx % COLORS.length],
                        }}
                      >
                        <span className="brand-card-initial">
                          {brand.charAt(0)}
                        </span>
                      </div>
                      <div className="brand-card-title">
                        <h4>{brand}</h4>
                        <span>{brandProducts.length} products</span>
                      </div>
                    </div>
                    <div className="brand-card-stats">
                      <div className="brand-card-stat">
                         <span className="brand-card-stat-label">
                          Total Value
                        </span>
                        <span className="brand-card-stat-value">
                          ${brandTotalValue.toLocaleString()}
                        </span>
                      </div>
                      <div className="brand-card-stat">
                        <span className="brand-card-stat-label">
                          Total Stock
                        </span>
                        <span className="brand-card-stat-value">
                          {brandTotalStock.toLocaleString()}
                        </span>
                       </div>
                      <div className="brand-card-stat">
                        <span className="brand-card-stat-label">
                          Avg. Price
                        </span>
                        <span className="brand-card-stat-value">
                          ${avgPrice.toFixed(0)}
                        </span>
                        </div>
                    </div>
                    <div className="brand-card-products">
                      {brandProducts.map((p) => {
                        const ss = getStockStatus(p);
                        return (
                          <div key={p.id} className="brand-card-product">
                            <div className="brand-card-product-info">
                              <span className="brand-card-product-name">
                                {p.name}
                              </span>
                              <span className="brand-card-product-category">
                                {getCategoryLabel(p.category)}
                              </span>
                            </div>
                            <div className="brand-card-product-right">
                              <span className="brand-card-product-price">
                                $
                                {p.price.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                              <span
                                className={`product-status-badge status-${ss}`}
                                style={{ fontSize: "10px", padding: "2px 8px" }}
                              >
                                {ss === "ok"
                                  ? "In Stock"
                                  : ss === "low"
                                    ? "Low"
                                    : "Out"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="product-pagination-row">
              <Pagination
                currentPage={brandPage}
                totalPages={brandTotalPages}
                totalItems={filteredBrands.length}
                pageSize={brandsPerPage}
                onPageChange={setBrandPage}
                variant="table"
                onPageSizeChange={(val) => {
                  setBrandsPerPage(Number(val));
                  setBrandPage(1);
                }}
              />
            </div>
          </div>
        )}

        {/* ===== STOCK TAB ===== */}
        {activeTab === "stock" && (
          <div className="product-stock-section">
            <div className="product-section-header">
              <h3>Stock Management</h3>
              <span className="product-section-badge">
                {lowStockCount} low stock alerts
              </span>
            </div>

            <div className="stock-alerts">
              {productsList
                .filter((p) => p.stock === 0 || p.stock <= p.minStock)
                .sort((a, b) => a.stock - b.stock)
                .map((p) => {
                  const stockStatus = getStockStatus(p);
                  return (
                    <div
                      key={p.id}
                      className={`stock-alert-card stock-${stockStatus}`}
                    >
                      <div className="stock-alert-icon">
                        {stockStatus === "out" ? (
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#dc2626"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                        ) : (
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#ca8a04"
                            strokeWidth="2"
                          >
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        )}
                      </div>
                      <div className="stock-alert-info">
                        <span className="stock-alert-name">{p.name}</span>
                        <span className="stock-alert-detail">
                          {stockStatus === "out"
                            ? "Out of Stock"
                            : `Low Stock - ${p.stock} of ${p.minStock} minimum`}
                        </span>
                      </div>
                      <div className="stock-alert-meta">
                        <span className="stock-alert-id">{p.id}</span>
                        <span
                          className="product-cat-badge"
                          style={{
                            background: `${getCategoryColor(p.category)}15`,
                            color: getCategoryColor(p.category),
                          }}
                        >
                          {getCategoryLabel(p.category)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="product-table-wrap">
              <div className="stock-table-header">
                <h4>All Stock Levels</h4>
              </div>
              <div className="product-table-scroll">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Stock</th>
                      <th>Min Stock</th>
                      <th>Stock Level</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStockProducts.map((p) => {
                      const stockStatus = getStockStatus(p);
                      return (
                        <tr key={p.id}>
                          <td className="product-td-id">{p.id}</td>
                          <td className="product-td-name">
                            <span className="product-td-name-text">
                              {p.name}
                            </span>
                          </td>
                          <td>
                            <span
                              className="product-cat-badge"
                              style={{
                                background: `${getCategoryColor(p.category)}15`,
                                color: getCategoryColor(p.category),
                              }}
                            >
                              {getCategoryLabel(p.category)}
                            </span>
                          </td>
                          <td className="product-td-stock">
                            <span className="product-stock-num">
                              {p.stock.toLocaleString()}
                            </span>
                          </td>
                          <td className="product-td-minstock">
                            {p.minStock.toLocaleString()}
                          </td>
                          <td className="product-td-level">
                            <div className="product-stock-cell">
                              <div
                                className={`product-stock-bar bar-${stockStatus}`}
                              >
                                <div
                                  className="product-stock-fill"
                                  style={{ width: `${getStockPercent(p)}%` }}
                                ></div>
                              </div>
                              <span className="product-stock-percent">
                                {Math.round(getStockPercent(p))}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`product-status-badge status-${stockStatus}`}
                            >
                              {stockStatus === "ok"
                                ? "In Stock"
                                : stockStatus === "low"
                                  ? "Low Stock"
                                  : "Out of Stock"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="product-pagination-row">
                <Pagination
                  currentPage={stockPage}
                  totalPages={stockTotalPages}
                  totalItems={sortedStockProducts.length}
                  pageSize={itemsPerPage}
                  onPageChange={setStockPage}
                  variant="table"
                  onPageSizeChange={(val) => {
                    setItemsPerPage(Number(val));
                    setStockPage(1);
                  }}
                />
              </div>
            </div>

            <div className="product-panel-row">
              <div className="product-panel-card">
                <div className="product-panel-header">
                  <h3>Stock by Category</h3>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={categories.map((cat) => ({
                      name:
                        cat.label.length > 12
                          ? cat.label.substring(0, 12) + "..."
                          : cat.label,
                      stock: productsList
                        .filter((p) => p.category === cat.id)
                        .reduce((s, p) => s + p.stock, 0),
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="#9ca3af"
                      angle={-30}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "none",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Bar
                      dataKey="stock"
                      name="Total Stock"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="product-panel-card">
                <div className="product-panel-header">
                  <h3>Stock Status Overview</h3>
                </div>
                <div className="stock-overview">
                  <div className="stock-overview-item">
                    <div className="stock-overview-ring ring-ok">
                      <svg width="60" height="60" viewBox="0 0 36 36">
                        <path
                          className="stock-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="3"
                        />
                        <path
                          className="stock-ring-fill"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#16a34a"
                          strokeWidth="3"
                          strokeDasharray={`${totalProducts > 0 ? (productsList.filter((p) => p.stock > p.minStock).length / totalProducts) * 100 : 0}, 100`}
                        />
                      </svg>
                      <span className="stock-ring-value">
                        {
                          productsList.filter((p) => p.stock > p.minStock)
                            .length
                        }
                      </span>
                    </div>
                    <span className="stock-overview-label">In Stock</span>
                  </div>
                  <div className="stock-overview-item">
                    <div className="stock-overview-ring ring-low">
                      <svg width="60" height="60" viewBox="0 0 36 36">
                        <path
                          className="stock-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="3"
                        />
                        <path
                          className="stock-ring-fill"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#ca8a04"
                          strokeWidth="3"
                          strokeDasharray={`${totalProducts > 0 ? (lowStockCount / totalProducts) * 100 : 0}, 100`}
                        />
                      </svg>
                      <span className="stock-ring-value">{lowStockCount}</span>
                    </div>
                    <span className="stock-overview-label">Low Stock</span>
                  </div>
                  <div className="stock-overview-item">
                    <div className="stock-overview-ring ring-out">
                      <svg width="60" height="60" viewBox="0 0 36 36">
                        <path
                          className="stock-ring-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="3"
                        />
                        <path
                          className="stock-ring-fill"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#dc2626"
                          strokeWidth="3"
                          strokeDasharray={`${totalProducts > 0 ? (productsList.filter((p) => p.stock === 0).length / totalProducts) * 100 : 0}, 100`}
                        />
                      </svg>
                      <span className="stock-ring-value">
                        {productsList.filter((p) => p.stock === 0).length}
                      </span>
                    </div>
                    <span className="stock-overview-label">Out of Stock</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      {/* ──── Reorder Purchase Order Modal ──── */}
      {reorderProduct && (
        <div className="product-form-overlay">
          <div className="product-add-form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="product-form-header">
              <h3>Create Purchase Order for {reorderProduct.name}</h3>
              <button className="product-form-close" onClick={() => setReorderProduct(null)}>✕</button>
            </div>
            <div style={{ padding: "20px" }}>
              <p style={{ marginBottom: "15px", fontSize: "14px", color: "#475569" }}>
                Current Product Stock: <strong>{reorderProduct.stock} units</strong> (Min Stock: {reorderProduct.minStock}). Create a Purchase Order to order more units from the vendor.
              </p>
              <div style={{ display: "grid", gap: "15px" }}>
                <div className="product-form-field">
                  <label>Vendor <span className="vm-required">*</span></label>
                  <Dropdown
                    value={reorderVendor}
                    onChange={(val) => setReorderVendor(val)}
                    options={[
                      ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                      ...(reorderProduct.brand &&
                      !vendorsList.some((v) => v.name === reorderProduct.brand)
                        ? [{ value: reorderProduct.brand, label: reorderProduct.brand }]
                        : []),
                    ]}
                    variant="form"
                    placeholder={vendorsList.length === 0 ? "No vendors yet — add one in the Vendors page" : "Select Vendor"}
                  />
                </div>
                <div className="product-form-field">
                  <label>Reorder Quantity (units)</label>
                  <input
                    type="number"
                    min="1"
                    value={reorderQty}
                    onChange={(e) => setReorderQty(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="product-form-field">
                  <label>Estimated Total Cost (₹)</label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${((reorderProduct.price || 0) * reorderQty).toLocaleString("en-IN")}`}
                    style={{ backgroundColor: "#f8fafc" }}
                  />
                </div>
              </div>
            </div>
            <div className="product-form-actions">
              <button
                className="product-form-cancel"
                onClick={() => setReorderProduct(null)}
              >
                Cancel
              </button>
              <button
                className="product-form-submit"
                disabled={reorderSubmitting || !reorderVendor}
                onClick={async () => {
                  setReorderSubmitting(true);
                  try {
                    const poData = {
                      vendor: reorderVendor,
                      items: `${reorderQty}x ${reorderProduct.name} (${reorderProduct.brand})`,
                      total: (reorderProduct.price || 0) * reorderQty,
                      status: "Pending",
                      orderDate: new Date().toISOString().slice(0, 10),
                      expectedDelivery: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                    };
                    const res = await purchaseOrderAPI.create(poData);
                    if (res.data?.success) {
                      success(`Purchase Order created successfully for ${reorderVendor}!`);
                      setReorderProduct(null);
                    } else {
                      toastError(res.data?.message || "Failed to create Purchase Order.");
                    }
                  } catch (err) {
                    toastError(err.response?.data?.message || "Error creating Purchase Order.");
                  } finally {
                    setReorderSubmitting(false);
                  }
                }}
              >
                {reorderSubmitting ? "Creating PO..." : "Place Purchase Order"}
              </button>
            </div>
          </div>
        </div>
      )}
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
                  {showLogModal.productId || showLogModal._id}
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
                    <span style={{ color: "#64748b" }}>Stock Status</span>
                    <span className={`cm-status-badge cm-status-${getStockStatus(showLogModal) === "in" ? "approved" : "closed"}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {getStockStatus(showLogModal) === "in" ? "In Stock" : getStockStatus(showLogModal) === "low" ? "Low Stock" : "Out of Stock"}
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
                  Product Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Product Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.name}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>SKU / Model</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.sku || showLogModal.id}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Category</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{getCategoryLabel(showLogModal.category)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Brand / Manufacturer</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.brand || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Price</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.price ? `₹${showLogModal.price.toLocaleString("en-IN")}` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Current Stock</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.stock} units (Min Alert Level: {showLogModal.minStock})</div>
                  </div>
                </div>

                {showLogModal.description && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Description</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.description}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadProductLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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
    </div>
  );
};

export default ProductCatalog;
