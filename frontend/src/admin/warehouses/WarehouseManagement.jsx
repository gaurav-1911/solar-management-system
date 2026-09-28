import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pagination, Dropdown, ConfirmDialog, TableLoader, FormField } from "../../components/common";
import StatCard from "../dashboard/StatCard/StatCard";
import { useToast } from "../../components/common/Toast";
import { useFormik } from "formik";
import { warehouseAPI } from "../../services/api";
import { warehouseSchema, toLocalPhone } from "../../utils/AdminValidation";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import "./WarehouseManagement.css";
import { formatDateDDMMYYYY } from "../../utils/helpers";

const WAREHOUSE_STATUSES = ["Active", "Inactive"];

// Adds display-only helpers on top of the server document. The inventory page
// uses the warehouse `name` as the item location, so the name is the key field.
const toWarehouse = (w) => ({
  ...w,
  id: w._id,
  displayCode:
    w.code || `WH-${String(w._id || "").slice(-4).toUpperCase() || "0000"}`,
});

const formatNum = (val) => new Intl.NumberFormat("en-IN").format(val || 0);

const formatDate = formatDateDDMMYYYY;

const WarehouseManagement = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [viewingWarehouse, setViewingWarehouse] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serverTotal, setServerTotal] = useState(0);

  // Reset internal detail sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setShowForm(false);
    setEditingWarehouse(null);
    setViewingWarehouse(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key, location.state]);
  // Summary stats computed over ALL warehouses server-side.
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalCapacity: 0,
  });
  const fetchSeqRef = useRef(0);

  // Server-side fetch of the CURRENT page — search / status filters are applied
  // server-side and the API's pagination metadata drives the pager.
  const fetchWarehouses = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const params = { page: currentPage, limit: itemsPerPage };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "All") params.status = statusFilter;
      const res = await warehouseAPI.getAll(params);
      if (seq === fetchSeqRef.current && res.data?.success) {
        setWarehouses((res.data.data || []).map(toWarehouse));
        setServerTotal(
          res.data.pagination?.total || res.data.data?.length || 0,
        );
      }
    } catch (error) {
      if (seq === fetchSeqRef.current) {
        console.warn("Failed to load warehouses:", error?.message);
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, statusFilter]);

  // Summary stats over ALL warehouses (total / active / inactive / capacity).
  const fetchStats = useCallback(async () => {
    try {
      const res = await warehouseAPI.getStats();
      if (res.data?.success && res.data?.data) setStats(res.data.data);
    } catch (err) {
      console.warn("Failed to load warehouse stats:", err?.message);
    }
  }, []);

  // Refetch the table whenever page / size / filters change.
  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // Stats once on mount.
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const warehouseFormik = useFormik({
    initialValues: {
      name: editingWarehouse?.name || "",
      address: editingWarehouse?.address || "",
      city: editingWarehouse?.city || "",
      contactPerson: editingWarehouse?.contactPerson || "",
      contactPhone: editingWarehouse?.contactPhone || "",
      capacity: editingWarehouse?.capacity?.toString() || "",
      status: editingWarehouse?.status || "Active",
      description: editingWarehouse?.description || "",
    },
    validationSchema: warehouseSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      const payload = {
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        contactPerson: values.contactPerson.trim(),
        // Strip spaces/dashes/parens so the stored value matches the backend
        // phone pattern (mirrors isValidPhone used by the Yup schema).
        contactPhone: values.contactPhone.trim().replace(/[\s\-()]/g, ""),
        capacity: parseFloat(values.capacity) || 0,
        status: values.status,
        description: values.description.trim(),
      };
      try {
        if (editingWarehouse) {
          const response = await warehouseAPI.update(
            editingWarehouse._id,
            payload,
          );
          if (response.data?.success) {
            setEditingWarehouse(null);
            success(response.data?.message || "Warehouse updated successfully.");
            await Promise.all([fetchWarehouses(), fetchStats()]);
          } else {
            toastError(response.data?.message || "Failed to update warehouse.");
          }
        } else {
          const response = await warehouseAPI.create(payload);
          if (response.data?.success) {
            setShowForm(false);
            // Warehouses sort oldest-first, so a new warehouse lands on the
            // LAST page — jump there so it's visible.
            setCurrentPage(
              Math.max(1, Math.ceil((serverTotal + 1) / itemsPerPage)),
            );
            success(response.data?.message || "Warehouse added successfully.");
            await Promise.all([fetchWarehouses(), fetchStats()]);
          } else {
            toastError(response.data?.message || "Failed to add warehouse.");
          }
        }
        resetForm();
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to save warehouse. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const response = await warehouseAPI.delete(deleteConfirm._id);
      if (response.data?.success) {
        if (viewingWarehouse && viewingWarehouse._id === deleteConfirm._id) {
          setViewingWarehouse(null);
        }
        success(response.data?.message || "Warehouse deleted successfully.");
        await Promise.all([fetchWarehouses(), fetchStats()]);
      } else {
        toastError(response.data?.message || "Failed to delete warehouse.");
      }
    } catch (error) {
      toastError(
        error.response?.data?.message ||
          "Failed to delete warehouse. Please try again.",
      );
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(serverTotal / itemsPerPage));

  // Reset to page 1 whenever a filter or the (debounced) search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  // If the current page no longer exists (e.g. deleting the last warehouse on
  // the last page), step back to the nearest valid page.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(serverTotal / itemsPerPage));
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, serverTotal, itemsPerPage]);

  const activeCount = stats.active || 0;
  const inactiveCount = stats.inactive || 0;
  const totalCapacity = stats.totalCapacity || 0;

  const isAnyModalOpen =
    showForm || editingWarehouse || viewingWarehouse || deleteConfirm;
  useEffect(() => {
    document.body.style.overflow = isAnyModalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAnyModalOpen]);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="warehouse-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="wh-container">
      <header className="wh-header">
        <div>
          <h1 className="wh-header-title">Warehouse Management</h1>
          <p className="wh-header-subtitle">
            Manage your storage locations — warehouses added here appear in the
            Inventory page's Location dropdown.
          </p>
        </div>
      </header>

      <div className="wh-stats-grid">
        <StatCard
          title="Total Warehouses"
          value={(stats.total || 0).toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>}
          color="blue"
        />
        <StatCard
          title="Active"
          value={activeCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Inactive"
          value={inactiveCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="4.93 4.93 19.07 19.07" /></svg>}
          color="orange"
        />
        <StatCard
          title="Total Capacity"
          value={formatNum(totalCapacity)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>}
          color="purple"
        />
      </div>

      <div className="wh-filter-bar">
        <div className="wh-search-wrap">
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
            placeholder="Search warehouses by name, code, city"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          {search && (
            <button
              className="wh-search-clear"
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
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setCurrentPage(1);
          }}
          options={[
            { value: "All", label: "All Status" },
            ...WAREHOUSE_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
          placeholder="All Status"
        />
        {canDo("warehouses", "create") && (
        <button
          className="wh-add-btn"
          onClick={() => {
            setEditingWarehouse(null);
            warehouseFormik.resetForm();
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
          Add Warehouse
        </button>
        )}
      </div>

        <div className="wh-table-card">
          <div className="wh-table-scroll">
            <table className="wh-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Warehouse</th>
                  <th>Address</th>
                  <th>Contact</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableLoader colSpan={7} />
                ) : warehouses.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="wh-empty-state">
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#d1d5db"
                          strokeWidth="1.5"
                        >
                          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        <p>
                          {serverTotal === 0 &&
                          !search &&
                          statusFilter === "All"
                            ? "No warehouses yet — add your first warehouse."
                            : "No warehouses match your filters"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  warehouses.map((w) => (
                    <tr key={w.id}>
                      <td className="wh-td-code">{w.displayCode}</td>
                      <td className="wh-td-name">
                        <div className="wh-td-name-wrap">
                          <div className="wh-td-icon">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                          </div>
                          <div className="wh-td-name-info">
                            <span className="wh-td-name-text" title={w.name}>
                              {w.name}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="wh-td-address" title={w.address}>
                          {w.address || "—"}
                        </span>
                        {w.city && (
                          <span className="wh-td-city">{w.city}</span>
                        )}
                      </td>
                      <td>
                        <span className="wh-td-contact">
                          {w.contactPerson || "—"}
                        </span>
                        {w.contactPhone && (
                          <span className="wh-td-phone">{w.contactPhone}</span>
                        )}
                      </td>
                      <td className="wh-td-capacity">
                        {formatNum(w.capacity)}
                      </td>
                      <td>
                        <span
                          className={`wh-status-badge ${w.status === "Active" ? "wh-active" : "wh-inactive"}`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="wh-td-actions">
                        <div className="act-actions">
                          <button
                            className="act-btn act-view"
                            onClick={() => setViewingWarehouse(w)}
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
                            module="warehouses"
                            onClick={() => {
                              const whId = w._id || w.id;
                              navigate(`/admin/warehouse-activity/${whId}`, {
                                state: { target: { recordId: whId, recordLabel: w.name || w.code, module: "warehouses" } },
                              });
                            }}
                            title="View Warehouse Activity Log"
                          />
                          {canDo("warehouses", "edit") && (
                          <button
                            className="act-btn act-edit"
                            onClick={() => {
                              warehouseFormik.resetForm();
                              setEditingWarehouse({ ...w });
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
                          {canDo("warehouses", "delete") && (
                          <button
                            className="act-btn act-delete"
                            onClick={() => setDeleteConfirm(w)}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination row sits INSIDE the card, below the scrollable
              table area — mirrors the Products "All Products" table. */}
          <div className="wh-pagination-row">
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
              disabled={loading}
            />
          </div>
        </div>

      {/* Add / Edit Form Modal */}
      {(showForm || editingWarehouse) && (
        <div className="wh-modal-overlay">
          <div className="wh-form-modal">
            <div className="wh-modal-header">
              <h3>
                {editingWarehouse
                  ? `Edit Warehouse: ${editingWarehouse.name}`
                  : "Add New Warehouse"}
              </h3>
              <button
                className="wh-modal-close"
                onClick={() => {
                  warehouseFormik.resetForm();
                  setShowForm(false);
                  setEditingWarehouse(null);
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
            <div className="wh-modal-body">
              <div className="wh-form-grid">
                <div className="wh-form-field">
                  <label>
                    Warehouse Name <span className="wh-req">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="e.g. Warehouse A"
                    className={
                      warehouseFormik.touched.name &&
                      warehouseFormik.errors.name
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.name}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.name &&
                    warehouseFormik.errors.name && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.name}
                      </span>
                    )}
                </div>

                <div className="wh-form-field wh-full-width">
                  <label>Address</label>
                  <input
                    type="text"
                    name="address"
                    placeholder="Street, area, landmark"
                    className={
                      warehouseFormik.touched.address &&
                      warehouseFormik.errors.address
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.address}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.address &&
                    warehouseFormik.errors.address && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.address}
                      </span>
                    )}
                </div>
                <div className="wh-form-field">
                  <label>City</label>
                  <input
                    type="text"
                    name="city"
                    placeholder="e.g. Pune"
                    className={
                      warehouseFormik.touched.city &&
                      warehouseFormik.errors.city
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.city}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.city &&
                    warehouseFormik.errors.city && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.city}
                      </span>
                    )}
                </div>
                <div className="wh-form-field">
                  <label>Capacity (units)</label>
                  <input
                    type="number"
                    name="capacity"
                    placeholder="0"
                    min="0"
                    className={
                      warehouseFormik.touched.capacity &&
                      warehouseFormik.errors.capacity
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.capacity}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.capacity &&
                    warehouseFormik.errors.capacity && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.capacity}
                      </span>
                    )}
                </div>
                <div className="wh-form-field">
                  <label>Status</label>
                  <Dropdown
                    value={warehouseFormik.values.status}
                    onChange={(val) => warehouseFormik.setFieldValue("status", val)}
                    options={WAREHOUSE_STATUSES.map((s) => ({
                      value: s,
                      label: s,
                    }))}
                    variant="form"
                    placeholder="Select status"
                  />
                </div>
                <div className="wh-form-field">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    name="contactPerson"
                    placeholder="Warehouse in-charge"
                    className={
                      warehouseFormik.touched.contactPerson &&
                      warehouseFormik.errors.contactPerson
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.contactPerson}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.contactPerson &&
                    warehouseFormik.errors.contactPerson && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.contactPerson}
                      </span>
                    )}
                </div>
                <div className="wh-form-field">
                  <label>Contact Phone</label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input
                      type="text"
                      name="contactPhone"
                      value={toLocalPhone(warehouseFormik.values.contactPhone)}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        warehouseFormik.setFieldValue("contactPhone", val);
                      }}
                      onBlur={warehouseFormik.handleBlur}
                      placeholder="98765 43210"
                      className={
                        warehouseFormik.touched.contactPhone &&
                        warehouseFormik.errors.contactPhone
                          ? "input-error"
                          : ""
                      }
                    />
                  </div>
                  {warehouseFormik.touched.contactPhone &&
                    warehouseFormik.errors.contactPhone && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.contactPhone}
                      </span>
                    )}
                </div>
                <div className="wh-form-field wh-full-width">
                  <label>Description</label>
                  <textarea
                    name="description"
                    rows="2"
                    placeholder="Optional notes about this warehouse"
                    className={
                      warehouseFormik.touched.description &&
                      warehouseFormik.errors.description
                        ? "input-error"
                        : ""
                    }
                    value={warehouseFormik.values.description}
                    onChange={warehouseFormik.handleChange}
                    onBlur={warehouseFormik.handleBlur}
                  />
                  {warehouseFormik.touched.description &&
                    warehouseFormik.errors.description && (
                      <span className="wh-field-error">
                        {warehouseFormik.errors.description}
                      </span>
                    )}
                </div>
              </div>
              <p className="wh-form-hint">
                Warehouse names appear in the Inventory page's Location dropdown
                and are stored on each inventory item.
              </p>
            </div>
            <div className="wh-modal-footer">
              <button
                className="wh-btn-cancel wh-btn"
                onClick={() => {
                  warehouseFormik.resetForm();
                  setShowForm(false);
                  setEditingWarehouse(null);
                }}
              >
                Cancel
              </button>
              <button
                className="wh-btn-primary wh-btn"
                onClick={warehouseFormik.handleSubmit}
                disabled={warehouseFormik.isSubmitting || !warehouseFormik.isValid}
              >
                {warehouseFormik.isSubmitting
                  ? "Saving…"
                  : editingWarehouse
                    ? "Save Changes"
                    : "Add Warehouse"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Warehouse Modal */}
      {viewingWarehouse && (
        <div className="wh-modal-overlay">
          <div className="wh-modal">
            <div className="wh-modal-header">
              <div className="wh-modal-title">
                <h3>{viewingWarehouse.name}</h3>
                <span className="wh-modal-subtitle">
                  {viewingWarehouse.displayCode}
                </span>
                <span
                  className={`wh-status-badge ${viewingWarehouse.status === "Active" ? "wh-active" : "wh-inactive"}`}
                >
                  {viewingWarehouse.status}
                </span>
              </div>
              <button
                className="wh-modal-close"
                onClick={() => setViewingWarehouse(null)}
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
            <div className="wh-modal-body">
              <div className="wh-view-section">
                <h4>Location</h4>
                <div className="wh-view-grid">
                  <div className="wh-view-item">
                    <span className="wh-view-label">Address</span>
                    <span className="wh-view-value">
                      {viewingWarehouse.address || "—"}
                    </span>
                  </div>
                  <div className="wh-view-item">
                    <span className="wh-view-label">City</span>
                    <span className="wh-view-value">
                      {viewingWarehouse.city || "—"}
                    </span>
                  </div>
                  <div className="wh-view-item">
                    <span className="wh-view-label">Capacity</span>
                    <span className="wh-view-value">
                      {formatNum(viewingWarehouse.capacity)} units
                    </span>
                  </div>
                </div>
              </div>
              <div className="wh-view-section">
                <h4>Contact</h4>
                <div className="wh-view-grid">
                  <div className="wh-view-item">
                    <span className="wh-view-label">Contact Person</span>
                    <span className="wh-view-value">
                      {viewingWarehouse.contactPerson || "—"}
                    </span>
                  </div>
                  <div className="wh-view-item">
                    <span className="wh-view-label">Contact Phone</span>
                    <span className="wh-view-value">
                      {viewingWarehouse.contactPhone || "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="wh-view-section">
                <h4>Details</h4>
                <div className="wh-view-grid">
                  <div className="wh-view-item">
                    <span className="wh-view-label">Description</span>
                    <span className="wh-view-value">
                      {viewingWarehouse.description || "—"}
                    </span>
                  </div>
                  <div className="wh-view-item">
                    <span className="wh-view-label">Created</span>
                    <span className="wh-view-value">
                      {formatDate(viewingWarehouse.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="wh-modal-footer">
              <button
                className="wh-btn-cancel wh-btn"
                onClick={() => setViewingWarehouse(null)}
              >
                Close
              </button>
              <button
                className="wh-btn-primary wh-btn"
                onClick={() => {
                  warehouseFormik.resetForm();
                  setEditingWarehouse({ ...viewingWarehouse });
                  setViewingWarehouse(null);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Warehouse"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? Items stored in this warehouse must be reassigned first.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        loading={deleting}
      />
    </div>
  );
};

export default WarehouseManagement;
