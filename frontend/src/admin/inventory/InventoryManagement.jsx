import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pagination, Dropdown, ConfirmDialog, TableLoader } from "../../components/common";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { inventoryAPI, vendorAPI, purchaseOrderAPI, productAPI, warehouseAPI } from "../../services/api";
import { inventorySchema } from "../../utils/AdminValidation";
import { titleCaseCategory, sortCategories, formatDateDDMMYYYY } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./InventoryManagement.css";

// Full option lists matching the server model's enums, used so the Add/Edit
// form always offers every valid category/location even before any items exist.
const CATEGORY_OPTIONS = [
  "Panels",
  "Inverters",
  "Batteries",
  "Accessories",
  "Mounting",
  "Wiring",
  "Controllers",
];

// Vendor category labels (e.g. "Solar Panels", "Charge Controllers") don't map
// 1:1 onto the fixed Inventory categories, so known labels are translated and
// anything else falls back to a keyword match (e.g. "Monocrystalline Panels").
const VENDOR_TO_INVENTORY_CATEGORY = {
  "solar panels": "Panels",
  panels: "Panels",
  inverters: "Inverters",
  batteries: "Batteries",
  "charge controllers": "Controllers",
  controllers: "Controllers",
  "mounting structures": "Mounting",
  mounting: "Mounting",
  cables: "Wiring",
  wiring: "Wiring",
  connectors: "Wiring",
  accessories: "Accessories",
  "solar water pumps": "Accessories",
  "water pumps": "Accessories",
  "electrical components": "Accessories",
  switchgear: "Accessories",
};

// A vendor can belong to multiple categories. New vendors store an array in
// `categories`; legacy vendors only have the single-string `category` field.
// This helper normalizes both shapes into an array.
const getVendorCategories = (vendor) => {
  if (Array.isArray(vendor?.categories) && vendor.categories.length) {
    return vendor.categories.filter(Boolean);
  }
  return vendor?.category ? [vendor.category] : [];
};

// Maps one vendor category label onto the closest Inventory category, or null
// when nothing matches. Known labels use the explicit table; everything else
// matches when an inventory keyword appears in the label.
const mapVendorCategoryToInventory = (vc) => {
  const key = String(vc || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
  if (!key) return null;
  if (VENDOR_TO_INVENTORY_CATEGORY[key]) {
    return VENDOR_TO_INVENTORY_CATEGORY[key];
  }
  return CATEGORY_OPTIONS.find((c) => key.includes(c.toLowerCase())) || null;
};

const formatDate = formatDateDDMMYYYY;

// Maps a server inventory document into the shape this page expects. The display
// id comes from the server-generated sequential invId (INV-001, INV-002, ...);
// legacy items without one fall back to a short Mongo _id fragment.
const toItem = (i) => ({
  ...i,
  id:
    i.invId ||
    `INV-${String(i._id || "").slice(-4).toUpperCase() || "0000"}`,
  status:
    i.quantity === 0
      ? "Critical"
      : i.quantity <= i.minStock
        ? "Low Stock"
        : "In Stock",
});

const InventoryManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Reset showForm and selectedItem on sidebar navigation / route change
  useEffect(() => {
    setShowForm(false);
    setEditingItem(null);
    setSelectedItem(null);
  }, [location.pathname, location.search, location.key, location.state]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serverTotal, setServerTotal] = useState(0);
  // Summary stats computed over ALL inventory items server-side.
  const [stats, setStats] = useState({
    totalItems: 0,
    totalUnits: 0,
    totalValue: 0,
    lowStockCount: 0,
    categories: [],
  });
  const fetchSeqRef = useRef(0);

  // Warehouse names drive the Location dropdown. Populated from the Warehouses
  // page (via warehouseAPI) on mount — the list is live, so a fresh database
  // shows no locations until a warehouse is added there.
  const [warehouseOptions, setWarehouseOptions] = useState([]);

  const [vendorsList, setVendorsList] = useState([]);
  const [reorderItem, setReorderItem] = useState(null);
  const [reorderQty, setReorderQty] = useState(20);
  const [reorderVendor, setReorderVendor] = useState("");
  const [reorderSubmitting, setReorderSubmitting] = useState(false);
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);
  // Products that are linked to inventory items (via inventoryItemId).
  const [linkedProducts, setLinkedProducts] = useState([]);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setSelectedItem(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  // Server-side fetch of the CURRENT page — search / category / status filters
  // are applied server-side and the API's pagination metadata drives the pager.
  const fetchItems = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const params = { page: currentPage, limit: itemsPerPage };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (categoryFilter !== "All") params.category = categoryFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      const response = await inventoryAPI.getAll(params);
      if (seq === fetchSeqRef.current && response.data?.success) {
        setItems((response.data.data || []).map(toItem));
        setServerTotal(
          response.data.pagination?.total ||
            response.data.data?.length ||
            0,
        );
      }
    } catch (error) {
      if (seq === fetchSeqRef.current) {
        console.warn("Failed to load inventory:", error?.message);
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, categoryFilter, statusFilter]);

  // Summary stats over ALL items (total units, value, low-stock count,
  // distinct categories) — refetched after mutations.
  const fetchStats = useCallback(async () => {
    try {
      const res = await inventoryAPI.getStats();
      if (res.data?.success && res.data?.data) setStats(res.data.data);
    } catch (err) {
      console.warn("Failed to load inventory stats:", err?.message);
    }
  }, []);

  // Refetch the table whenever page / size / filters change.
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Stats once on mount.
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load vendors, linked products, and warehouse names for the form dropdowns
  // on mount (these are needed regardless of the current page).
  useEffect(() => {
    let isMounted = true;
    const fetchVendors = async () => {
      try {
        const res = await vendorAPI.getAll({ limit: 10000 });
        if (isMounted && res.data?.success) {
          setVendorsList(res.data.data || []);
        }
      } catch {
        // ignore offline fallback
      }
    };
    const fetchLinkedProducts = async () => {
      try {
        const res = await productAPI.getAll({
          limit: 10000,
          fields: "name,productId,inventoryItemId",
        });
        if (isMounted && res.data?.success) {
          setLinkedProducts(res.data.data || []);
        }
      } catch {
        // ignore — the linked-products column simply shows nothing
      }
    };
    const fetchWarehouses = async () => {
      try {
        const res = await warehouseAPI.getAll({ limit: 10000 });
        if (isMounted && res.data?.success) {
          const names = (res.data.data || [])
            .map((w) => w.name)
            .filter(Boolean);
          if (names.length > 0) setWarehouseOptions(names);
        }
      } catch {
        // ignore — fall back to the static default location list
      }
    };
    fetchVendors();
    fetchLinkedProducts();
    fetchWarehouses();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventoryFormik = useFormik({
    initialValues: {
      name: editingItem?.name || "",
      category: editingItem?.category || "Panels",
      quantity: editingItem?.quantity?.toString() || "",
      minStock: editingItem?.minStock?.toString() || "",
      unitPrice: editingItem?.unitPrice?.toString() || "",
      supplier: editingItem?.supplier || "",
      location: editingItem?.location || "",
    },
    validationSchema: inventorySchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      // A warehouse is required for the item's location — if none exist yet,
      // the user must create one on the Warehouses page first. Existing items
      // that already carry a location are still editable.
      if (locations.length === 0 && !values.location) {
        setSubmitting(false);
        toastError(
          "No warehouses exist yet — add one in the Warehouses page first so this item has a location.",
        );
        return;
      }
      // Reject duplicate item names before calling the API — the same item
      // must not be stored twice. A vendor adding stock for an existing item
      // should increase that item's quantity instead of creating a new record.
      // The backend enforces the same rule server-side (authoritative), this
      // guard just catches the common case instantly.
      if (!editingItem) {
        const duplicate = items.find(
          (i) =>
            String(i.name || "").trim().toLowerCase() ===
            String(values.name || "").trim().toLowerCase(),
        );
        if (duplicate) {
          setSubmitting(false);
          toastError(
            `An inventory item "${duplicate.name}" (${duplicate.id}) already exists — add the new stock to that existing item instead of creating a duplicate.`,
          );
          return;
        }
      }
      const payload = {
        name: values.name.trim(),
        category: values.category,
        quantity: parseInt(values.quantity) || 0,
        minStock: parseInt(values.minStock) || 0,
        unitPrice: parseFloat(values.unitPrice) || 0,
        supplier: values.supplier.trim(),
        location: values.location,
      };
      try {
        if (editingItem) {
          const response = await inventoryAPI.update(editingItem._id, payload);
          if (response.data?.success) {
            setEditingItem(null);
            success(response.data?.message || "Item updated successfully.");
            await Promise.all([fetchItems(), fetchStats()]);
          } else {
            toastError(response.data?.message || "Failed to update item.");
          }
        } else {
          const response = await inventoryAPI.create(payload);
          if (response.data?.success) {
            setShowForm(false);
            // Jump to page 1 so the newly created item (newest first) is visible.
            setCurrentPage(1);
            // Refresh linked products so the product auto-created for this item
            // shows up in the "Linked Products" column right away.
            productAPI
              .getAll({
                limit: 10000,
                fields: "name,productId,inventoryItemId",
              })
              .then((res) => {
                if (res.data?.success) setLinkedProducts(res.data.data || []);
              })
              .catch(() => {});
            success(response.data?.message || "Item added successfully.");
            await Promise.all([fetchItems(), fetchStats()]);
          } else {
            toastError(response.data?.message || "Failed to add item.");
          }
        }
        resetForm();
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to save item. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteItem = async (item) => {
    if (!item || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const response = await inventoryAPI.delete(item._id);
      if (response.data?.success) {
        if (selectedItem && selectedItem._id === item._id)
          setSelectedItem(null);
        success(response.data?.message || "Item deleted successfully.");
        await Promise.all([fetchItems(), fetchStats()]);
      } else {
        toastError(response.data?.message || "Failed to delete item.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete item. Please try again.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const categories =
    stats.categories && stats.categories.length > 0
      ? stats.categories
      : CATEGORY_OPTIONS;
  const locations = warehouseOptions;

  const isAnyModalOpen =
    showForm || editingItem || deleteConfirm || selectedItem;
  useEffect(() => {
    document.body.style.overflow = isAnyModalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAnyModalOpen]);

  const totalPages = Math.max(1, Math.ceil(serverTotal / itemsPerPage));

  // Reset to page 1 whenever a filter or the (debounced) search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, categoryFilter, statusFilter]);

  // If the current page no longer exists (e.g. deleting the last item on the
  // last page), step back to the nearest valid page.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(serverTotal / itemsPerPage));
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, serverTotal, itemsPerPage]);

  const totalItems = stats.totalItems || 0;
  const totalUnits = stats.totalUnits || 0;
  const totalValue = stats.totalValue || 0;
  const lowStockCount = stats.lowStockCount || 0;

  const getStockPercent = (item) => {
    const max = Math.max(item.minStock * 5, item.quantity);
    return Math.min((item.quantity / max) * 100, 100);
  };

  const getStockLevel = (item) => {
    if (item.quantity === 0) return "out";
    if (item.quantity <= item.minStock) return "low";
    return "ok";
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

  const categoryColors = {
    Panels: "#2563eb",
    Inverters: "#16a34a",
    Batteries: "#ca8a04",
    Accessories: "#0891b2",
    Mounting: "#dc2626",
    Wiring: "#6366f1",
    Controllers: "#9333ea",
  };

  const getCategoryColor = (cat) => categoryColors[cat] || "#6b7280";

  // Products linked to a given inventory item (via the product's inventoryItemId).
  const getLinkedProducts = (item) =>
    linkedProducts.filter((p) => {
      const id = p.inventoryItemId?._id || p.inventoryItemId;
      return id && String(id) === String(item._id);
    });

  // Inventory categories offered for the selected supplier: only the categories
  // matching the vendor's profile (like the Products page), falling back to the
  // full list when no vendor is chosen or nothing maps. The current selection
  // is always kept selectable so editing legacy items never blanks the field.
  // Options are sorted alphabetically with title-cased labels for display.
  const getCategoryOptions = (supplier, currentCategory) => {
    const vendor = vendorsList.find((v) => v.name === supplier);
    const vendorCats = vendor ? getVendorCategories(vendor) : [];
    let options =
      vendorCats.length === 0
        ? [...CATEGORY_OPTIONS]
        : [
            ...new Set(
              vendorCats
                .map((vc) => mapVendorCategoryToInventory(vc))
                .filter(Boolean),
            ),
          ];
    if (options.length === 0) options = [...CATEGORY_OPTIONS];
    if (currentCategory && !options.includes(currentCategory)) {
      options.push(currentCategory);
    }
    return sortCategories(options).map((c) => ({
      value: c,
      label: titleCaseCategory(c),
    }));
  };

  // When the vendor changes, narrow the category dropdown to that vendor's
  // profile and auto-select the first matching category if the current one no
  // longer fits. The decision is made against the raw vendor-mapped set (NOT
  // getCategoryOptions, which keeps the old category selectable for legacy
  // edits) so a stale category never survives a vendor switch.
  const handleVendorChange = (name) => {
    inventoryFormik.setFieldValue("supplier", name);
    const vendor = vendorsList.find((v) => v.name === name);
    const vendorCats = vendor ? getVendorCategories(vendor) : [];
    const options =
      vendorCats.length === 0
        ? [...CATEGORY_OPTIONS]
        : [
            ...new Set(
              vendorCats
                .map((vc) => mapVendorCategoryToInventory(vc))
                .filter(Boolean),
            ),
          ];
    const current = inventoryFormik.values.category;
    if (!current || !options.includes(current)) {
      inventoryFormik.setFieldValue(
        "category",
        options[0] || CATEGORY_OPTIONS[0],
      );
    }
  };

  // True when a vendor is selected but none of its categories map to an
  // inventory category — the dropdown then shows all categories with a hint.
  const vendorHasUnmappedCategories = (() => {
    const vendor = vendorsList.find(
      (v) => v.name === inventoryFormik.values.supplier,
    );
    const vendorCats = vendor ? getVendorCategories(vendor) : [];
    return (
      vendorCats.length > 0 &&
      !vendorCats.some((vc) => mapVendorCategoryToInventory(vc))
    );
  })();

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="inventory-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="inv-container">
      <header className="inv-header">
        <div>
          <h1 className="inv-header-title">Inventory Management</h1>
          <p className="inv-header-subtitle">
            Track and manage your warehouse stock — monitor quantities, supplier
            information, and inventory value across all categories.
          </p>
        </div>
      </header>

      <div className="inv-stats-grid">
        <StatCard
          title="Total Items"
          value={totalItems.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>}
          color="blue"
        />
        <StatCard
          title="Total Units"
          value={totalUnits.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /></svg>}
          color="green"
        />
        <StatCard
          title="Inventory Value"
          value={`₹${(totalValue / 100000).toFixed(1)}L`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="purple"
        />
        <StatCard
          title="Low Stock Alerts"
          value={lowStockCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="red"
        />
      </div>

      <div className="inv-filter-bar">
        <div className="inv-search-wrap">
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
            placeholder="Search inventory"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          {search && (
            <button
              className="inv-search-clear"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
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
          value={categoryFilter}
          onChange={(val) => {
            setCategoryFilter(val);
            setCurrentPage(1);
          }}
          options={[
            { value: "All", label: "All Categories" },
            ...sortCategories(categories).map((c) => ({
              value: c,
              label: titleCaseCategory(c),
            })),
          ]}
          placeholder="All Categories"
        />
        <Dropdown
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setCurrentPage(1);
          }}
          options={[
            { value: "All", label: "All Status" },
            { value: "In Stock", label: "In Stock" },
            { value: "Low Stock", label: "Low Stock" },
            { value: "Critical", label: "Critical" },
          ]}
          placeholder="All Status"
        />
        <div className="inv-view-toggle">
          <button
            className={`inv-view-btn ${viewMode === "table" ? "active" : ""}`}
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
            className={`inv-view-btn ${viewMode === "grid" ? "active" : ""}`}
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
        {canDo("inventory", "create") && (
        <button
          className="inv-add-btn"
          onClick={() => {
            setEditingItem(null);
            inventoryFormik.resetForm();
            setShowForm(true);
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
          Add Inventory
        </button>
        )}
      </div>

      {/* Add / Edit Form Modal */}
      {(showForm || editingItem) && (
        <div className="inv-modal-overlay">
          <div className="inv-form-modal">
            <div className="inv-modal-header">
              <h3>
                {editingItem
                  ? `Edit Item: ${editingItem.id}`
                  : "Add New Inventory Item"}
              </h3>
              <button
                className="inv-modal-close"
                onClick={() => {
                  inventoryFormik.resetForm();
                  setShowForm(false);
                  setEditingItem(null);
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
            <div className="inv-modal-body">
              <div className="inv-form-grid">
                                <div className="inv-form-field">
                  <label>Vendor</label>
                  {vendorsList.length > 0 ? (
                    <Dropdown
                      value={inventoryFormik.values.supplier}
                      onChange={(val) => handleVendorChange(val)}
                      options={[
                        ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                        ...(inventoryFormik.values.supplier &&
                        !vendorsList.some((v) => v.name === inventoryFormik.values.supplier)
                          ? [{ value: inventoryFormik.values.supplier, label: inventoryFormik.values.supplier }]
                          : []),
                      ]}
                      variant="form"
                      placeholder="Select a registered vendor"
                    />
                  ) : (
                    <input
                      type="text"
                      name="supplier"
                      placeholder="Enter supplier name"
                      value={inventoryFormik.values.supplier}
                      onChange={inventoryFormik.handleChange}
                      onBlur={inventoryFormik.handleBlur}
                    />
                  )}
                  {inventoryFormik.touched.supplier && inventoryFormik.errors.supplier && (
                    <span className="inv-field-error">{inventoryFormik.errors.supplier}</span>
                  )}
                </div>
                                <div className="inv-form-field">
                  <label>
                    Category
                  </label>
                  <Dropdown
                    value={inventoryFormik.values.category}
                    onChange={(val) => inventoryFormik.setFieldValue("category", val)}
                    options={getCategoryOptions(
                      inventoryFormik.values.supplier,
                      inventoryFormik.values.category,
                    )}
                    variant="form"
                    placeholder="Select category"
                  />
                  {vendorHasUnmappedCategories && (
                    <span className="inv-field-hint">
                      This vendor's categories don't match any inventory
                      category — all categories are shown.
                    </span>
                  )}
                </div>
                <div className="inv-form-field">
                  <label>
                    Item Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Enter item name"
                    className={inventoryFormik.touched.name && inventoryFormik.errors.name ? "input-error" : ""}
                    value={inventoryFormik.values.name}
                    onChange={inventoryFormik.handleChange}
                    onBlur={inventoryFormik.handleBlur}
                  />
                  {inventoryFormik.touched.name && inventoryFormik.errors.name && (
                    <span className="inv-field-error">{inventoryFormik.errors.name}</span>
                  )}
                </div>

                <div className="inv-form-field">
                  <label>
                    Quantity
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    placeholder="0"
                    className={inventoryFormik.touched.quantity && inventoryFormik.errors.quantity ? "input-error" : ""}
                    value={inventoryFormik.values.quantity}
                    onChange={inventoryFormik.handleChange}
                    onBlur={inventoryFormik.handleBlur}
                  />
                  {inventoryFormik.touched.quantity && inventoryFormik.errors.quantity && (
                    <span className="inv-field-error">{inventoryFormik.errors.quantity}</span>
                  )}
                </div>
                <div className="inv-form-field">
                  <label>Min Stock</label>
                  <input
                    type="number"
                    name="minStock"
                    placeholder="10"
                    className={inventoryFormik.touched.minStock && inventoryFormik.errors.minStock ? "input-error" : ""}
                    value={inventoryFormik.values.minStock}
                    onChange={inventoryFormik.handleChange}
                    onBlur={inventoryFormik.handleBlur}
                  />
                  {inventoryFormik.touched.minStock && inventoryFormik.errors.minStock && (
                    <span className="inv-field-error">{inventoryFormik.errors.minStock}</span>
                  )}
                </div>
                <div className="inv-form-field">
                  <label>
                    Unit Price (Rs.)
                  </label>
                  <input
                    type="number"
                    name="unitPrice"
                    placeholder="0"
                    className={inventoryFormik.touched.unitPrice && inventoryFormik.errors.unitPrice ? "input-error" : ""}
                    value={inventoryFormik.values.unitPrice}
                    onChange={inventoryFormik.handleChange}
                    onBlur={inventoryFormik.handleBlur}
                  />
                  {inventoryFormik.touched.unitPrice && inventoryFormik.errors.unitPrice && (
                    <span className="inv-field-error">{inventoryFormik.errors.unitPrice}</span>
                  )}
                </div>

                <div className="inv-form-field">
                  <label>Location</label>
                  <Dropdown
                    value={inventoryFormik.values.location}
                    onChange={(val) => inventoryFormik.setFieldValue("location", val)}
                    options={[
                      { value: "", label: locations.length === 0 ? "No warehouses yet — add one in Warehouses" : "Select Warehouse" },
                      ...locations.map((l) => ({ value: l, label: l }))
                    ]}
                    placeholder="Select Warehouse"
                    variant="form"
                  />
                  {inventoryFormik.touched.location && inventoryFormik.errors.location && (
                    <span className="inv-field-error">{inventoryFormik.errors.location}</span>
                  )}
                  <span className="inv-field-hint">
                    Warehouses are managed on the Warehouses page
                    (Inventory → Warehouses).
                  </span>
                </div>
              </div>
              {!editingItem && (
                <p
                  style={{
                    marginTop: "12px",
                    fontSize: "12px",
                    color: "#64748b",
                    lineHeight: "1.5",
                  }}
                >
                  A matching product is created automatically in the Product
                  Catalog when you save this item.
                </p>
              )}
            </div>
            <div className="inv-modal-footer">
              <button
                className="im-btn-cancel im-btn"
                onClick={() => {
                  inventoryFormik.resetForm();
                  setShowForm(false);
                  setEditingItem(null);
                }}
              >
                Cancel
              </button>
              <button
                className="im-btn-primary im-btn"
                onClick={inventoryFormik.handleSubmit}
                disabled={inventoryFormik.isSubmitting || !inventoryFormik.isValid}
              >
                {inventoryFormik.isSubmitting ? (editingItem ? "Saving..." : "Adding...") : editingItem ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}


      {viewMode === "table" && (
        <div className="inv-table-card">
          <div className="inv-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Unit Price</th>
                  <th>Total Value</th>
                  <th>Supplier</th>
                  <th>Linked Products</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableLoader colSpan={10} />
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan="10">
                      <div className="inv-empty-state">
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
                        <p>
                          {serverTotal === 0 &&
                          !search &&
                          categoryFilter === "All" &&
                          statusFilter === "All"
                            ? "No inventory items yet — add your first item."
                            : "No items match your filters"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const stockLevel = getStockLevel(item);
                    return (
                      <tr key={item.id}>
                        <td className="td-sku">{item.id}</td>
                        <td className="inv-td-name-col">
                          <div className="inv-td-name-wrap">
                            <div
                              className="inv-td-icon"
                              style={{
                                background: `${getCategoryColor(item.category)}15`,
                                color: getCategoryColor(item.category),
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
                                <rect x="2" y="4" width="20" height="16" rx="2" />
                                <line x1="2" y1="10" x2="22" y2="10" />
                                <line x1="12" y1="4" x2="12" y2="20" />
                              </svg>
                            </div>
                            <div className="inv-td-name-info">
                              <span className="inv-td-name-text" title={item.name}>
                                {item.name}
                              </span>
                              <span className="inv-td-name-sub">
                                {item.location}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="inv-cat-badge"
                            style={{
                              background: `${getCategoryColor(item.category)}15`,
                              color: getCategoryColor(item.category),
                            }}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td className="product-td-stock">
                          <div className="product-stock-cell">
                            <span
                              className="product-stock-num"
                              title={`min ${formatNum(item.minStock)}`}
                            >
                              {formatNum(item.quantity)}
                            </span>
                            <div
                              className={`product-stock-bar bar-${stockLevel}`}
                            >
                              <div
                                className="product-stock-fill"
                                style={{
                                  width: `${getStockPercent(item)}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="td-price">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="td-value">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                        <td className="td-supplier" title={item.supplier}>{item.supplier}</td>
                        <td>
                          {getLinkedProducts(item).length > 0 ? (
                            <span
                              className="inv-linked-badge"
                              title={getLinkedProducts(item)
                                .map((p) => `${p.productId || p._id} — ${p.name}`)
                                .join("\n")}
                            >
                              {getLinkedProducts(item).length}{" "}
                              {getLinkedProducts(item).length === 1
                                ? "product"
                                : "products"}
                            </span>
                          ) : (
                            <span className="inv-linked-none">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`product-status-badge status-${stockLevel}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="product-td-actions">
                          <div className="act-actions">
                            <button
                              className="act-btn act-view"
                              onClick={() => setSelectedItem(item)}
                              title="View"
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
                              module="inventory"
                              onClick={() => {
                                const invId = item._id || item.id;
                                navigate(`/admin/inventory-activity/${invId}`, {
                                  state: { target: { recordId: invId, recordLabel: item.name || item.sku, module: "inventory" } },
                                });
                              }}
                              title="View Inventory Activity Log"
                            />
                            <button
                              className="act-btn act-download"
                              onClick={() => {
                                setReorderItem(item);
                                setReorderVendor(item.supplier || (vendorsList[0]?.name || ""));
                                setReorderQty(Math.max(10, (item.minStock || 10) * 2 - item.quantity));
                              }}
                              title="Reorder / Create Purchase Order"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="20" y1="8" x2="20" y2="14" />
                                <line x1="17" y1="11" x2="23" y2="11" />
                              </svg>
                            </button>
                            {canDo("inventory", "edit") && (
                            <button
                              className="act-btn act-edit"
                              onClick={() => {
                                inventoryFormik.resetForm();
                                setEditingItem({ ...item });
                              }}
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
                            {canDo("inventory", "delete") && (
                            <button
                              className="act-btn act-delete"
                              onClick={() => setDeleteConfirm(item)}
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
              totalItems={serverTotal}
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

      {viewMode === "grid" && (
        <>
          <div className="inv-grid">
            {items.length === 0 ? (
              <div className="inv-empty-state inv-grid-full">
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
                <p>
                  {serverTotal === 0 &&
                  !search &&
                  categoryFilter === "All" &&
                  statusFilter === "All"
                    ? "No inventory items yet — add your first item."
                    : "No items match your filters"}
                </p>
              </div>
            ) : (
              items.map((item) => {
                const stockLevel = getStockLevel(item);
                return (
                  <div key={item.id} className="inv-grid-card">
                    <div
                      className="inv-grid-card-top"
                      style={{
                        background: `${getCategoryColor(item.category)}10`,
                      }}
                    >
                      <span
                        className={`status-badge inv-${item.status.toLowerCase().replace(" ", "-")}`}
                      >
                        {item.status}
                      </span>
                      <div
                        className="inv-grid-icon"
                        style={{ color: getCategoryColor(item.category) }}
                      >
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                          <line x1="12" y1="4" x2="12" y2="20" />
                        </svg>
                      </div>
                    </div>
                    <div className="inv-grid-card-body">
                      <div className="inv-grid-card-header">
                        <span className="inv-grid-sku">{item.id}</span>
                        <span
                          className="inv-cat-badge"
                          style={{
                            background: `${getCategoryColor(item.category)}15`,
                            color: getCategoryColor(item.category),
                          }}
                        >
                          {item.category}
                        </span>
                      </div>
                      <h3 className="inv-grid-name" title={item.name}>
                        {item.name}
                      </h3>
                      <div className="inv-grid-meta">
                        <div className="inv-grid-meta-item">
                          <span className="inv-grid-meta-label">Quantity</span>
                          <span className="inv-grid-meta-value">
                            {formatNum(item.quantity)}
                          </span>
                        </div>
                        <div className="inv-grid-meta-item">
                          <span className="inv-grid-meta-label">Price</span>
                          <span className="inv-grid-meta-value">
                            {formatCurrency(item.unitPrice)}
                          </span>
                        </div>
                        <div className="inv-grid-meta-item">
                          <span className="inv-grid-meta-label">Supplier</span>
                          <span className="inv-grid-meta-value">
                            {item.supplier}
                          </span>
                        </div>
                      </div>
                      <div className="inv-grid-stock">
                        <div className="inv-grid-stock-header">
                          <span className="inv-grid-stock-label">Stock Level</span>
                          <span className={`inv-stock-label stock-${stockLevel}`}>
                            {stockLevel === "ok"
                              ? "Healthy"
                              : stockLevel === "low"
                                ? "Low"
                                : "Critical"}
                          </span>
                        </div>
                        <div className={`inv-stock-bar bar-${stockLevel}`}>
                          <div
                            className="inv-stock-fill"
                            style={{ width: `${getStockPercent(item)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="inv-grid-actions">
                        <button
                          className="inv-grid-action view"
                          onClick={() => setSelectedItem(item)}
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
                          View
                        </button>
                        <button
                          className="inv-grid-action edit"
                          onClick={() => {
                            setEditingItem({ ...item });
                          }}
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
                          Edit
                        </button>
                        <button
                          className="inv-grid-action delete"
                          onClick={() => setDeleteConfirm(item)}
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
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={serverTotal}
            pageSize={itemsPerPage}
            onPageChange={setCurrentPage}
            variant="table"
            onPageSizeChange={(val) => {
              setItemsPerPage(Number(val));
              setCurrentPage(1);
            }}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Inventory Item"
        message={`Are you sure you want to delete ${deleteConfirm?.name} (${deleteConfirm?.id})?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          if (deleteConfirm) await handleDeleteItem(deleteConfirm);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
        loading={deleteLoading}
      />

      {selectedItem && (
        <div className="inv-modal-overlay">
          <div className="inv-modal">
            <div className="inv-modal-header">
              <div className="inv-modal-title">
                <h3>{selectedItem.name}</h3>
                <span className="inv-modal-subtitle">
                  {selectedItem.id} &middot; {selectedItem.category}
                </span>
                <span
                  className={`status-badge inv-${selectedItem.status.toLowerCase().replace(" ", "-")}`}
                >
                  {selectedItem.status}
                </span>
              </div>
              <button
                className="inv-modal-close"
                onClick={() => setSelectedItem(null)}
              >
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
            <div className="inv-modal-body">
              <div className="inv-view-section">
                <h4>Item Information</h4>
                <div className="inv-view-grid">
                  {/* <div className="inv-view-item">
                    <span className="inv-view-label">Item ID</span>
                    <span className="inv-view-value">{selectedItem.id}</span>
                  </div> */}
                  <div className="inv-view-item">
                    <span className="inv-view-label">Name</span>
                    <span className="inv-view-value">{selectedItem.name}</span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Category</span>
                    <span className="inv-view-value">
                      {selectedItem.category}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Quantity</span>
                    <span className="inv-view-value">
                      {selectedItem.quantity} units
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Min Stock</span>
                    <span className="inv-view-value">
                      {selectedItem.minStock} units
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Unit Price</span>
                    <span className="inv-view-value inv-view-highlight">
                      Rs. {selectedItem.unitPrice.toLocaleString()}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Total Value</span>
                    <span className="inv-view-value inv-view-highlight">
                      Rs.{" "}
                      {(
                        selectedItem.quantity * selectedItem.unitPrice
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Item ID</span>
                    <span className="inv-view-value">{selectedItem.id}</span>
                  </div>
                </div>
              </div>
              <div className="inv-view-section">
                <h4>Supplier &amp; Storage</h4>
                <div className="inv-view-grid">
                  <div className="inv-view-item">
                    <span className="inv-view-label">Supplier</span>
                    <span className="inv-view-value">
                      {selectedItem.supplier}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Location</span>
                    <span className="inv-view-value">
                      {selectedItem.location}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Last Restocked</span>
                    <span className="inv-view-value">
                      {formatDate(selectedItem.lastRestocked)}
                    </span>
                  </div>
                  <div className="inv-view-item">
                    <span className="inv-view-label">Status</span>
                    <span className="inv-view-value">
                      {selectedItem.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="inv-view-section">
                <h4>Linked Products</h4>
                {getLinkedProducts(selectedItem).length > 0 ? (
                  <div className="inv-view-grid">
                    {getLinkedProducts(selectedItem).map((p) => (
                      <div key={p._id} className="inv-view-item">
                        <span className="inv-view-label">
                          {p.productId || "Product"}
                        </span>
                        <span className="inv-view-value">{p.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="inv-linked-none">
                    No products are linked to this item yet. Link one from the
                    Products page using the "Link Inventory Item" option.
                  </p>
                )}
              </div>
            </div>
            <div className="inv-modal-footer">
              <button
                className="modal-footer-close-primary"
                onClick={() => setSelectedItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── Reorder Purchase Order Modal ──── */}
      {reorderItem && (
        <div className="inv-modal-overlay">
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-header">
              <h3>Create Purchase Order: {reorderItem.name}</h3>
              <button className="inv-modal-close" onClick={() => setReorderItem(null)}>✕</button>
            </div>
            <div className="inv-modal-body">
              <p style={{ marginBottom: "15px", fontSize: "14px", color: "#475569" }}>
                Current Stock: <strong>{reorderItem.quantity} units</strong> (Min Stock required: {reorderItem.minStock}). Restock this item by issuing a Purchase Order.
              </p>
              <div className="inv-form-grid" style={{ display: "grid", gap: "15px" }}>
                <div className="inv-form-field">
                  <label>Supplier / Vendor <span className="vm-required">*</span></label>
                  <Dropdown
                    value={reorderVendor}
                    onChange={(val) => setReorderVendor(val)}
                    options={[
                      ...vendorsList.map((v) => ({ value: v.name, label: v.name })),
                      ...(reorderItem.supplier &&
                      !vendorsList.some((v) => v.name === reorderItem.supplier)
                        ? [{ value: reorderItem.supplier, label: reorderItem.supplier }]
                        : []),
                    ]}
                    variant="form"
                    placeholder={vendorsList.length === 0 ? "No vendors yet — add one in the Vendors page" : "Select Vendor"}
                  />
                </div>
                <div className="inv-form-field">
                  <label>Reorder Quantity (units)</label>
                  <input
                    type="number"
                    min="1"
                    value={reorderQty}
                    onChange={(e) => setReorderQty(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="inv-form-field">
                  <label>Estimated Total Price (₹)</label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${((reorderItem.unitPrice || 0) * reorderQty).toLocaleString("en-IN")}`}
                    style={{ backgroundColor: "#f8fafc" }}
                  />
                </div>
              </div>
            </div>
            <div className="inv-modal-footer">
              <button className="vf-btn vf-btn-cancel" onClick={() => setReorderItem(null)}>Cancel</button>
              <button
                className="vf-btn vf-btn-primary"
                disabled={reorderSubmitting || !reorderVendor}
                onClick={async () => {
                  setReorderSubmitting(true);
                  try {
                    const poData = {
                      vendor: reorderVendor,
                      items: `${reorderQty}x ${reorderItem.name} (ID: ${reorderItem.id})`,
                      total: (reorderItem.unitPrice || 0) * reorderQty,
                      status: "Pending",
                      orderDate: new Date().toISOString().slice(0, 10),
                      expectedDelivery: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                    };
                    const res = await purchaseOrderAPI.create(poData);
                    if (res.data?.success) {
                      success(`Purchase Order for "${reorderVendor}" created successfully!`);
                      setReorderItem(null);
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
    </div>
  );
};

export default InventoryManagement;
