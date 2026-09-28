import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormik } from "formik";
import "./customermanagement.css";
import { Dropdown, Pagination, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../components/common/Toast";
import StatCard from "../dashboard/StatCard/StatCard";
import { customerValidationSchema } from "../../utils/AdminValidation";
import { customerAPI } from "../../services/api";
import { createProfilePdf } from "../../utils/pdfLayout";
import { useAuth } from "../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../common/GenericDetailActivityLog";
import { formatDateDDMMYYYY } from "../../utils/helpers";
import "../../styles/ActionButtons.css";


/* ─────────── Constants ─────────── */

const statuses = ["Active", "Inactive"];
const types = ["Residential", "Commercial", "Industrial", "Agricultural", "Individual", "Business", "Government", "NGO"];

const emptyForm = {
  name: "", email: "", phone: "", type: "Residential", address: "",
  capacity: "", status: "Active", notes: "", lastService: "",
};

/* ─────────── Component ─────────── */

const CustomerManagement = () => {
  const { success, error: toastError } = useToast();
  const { canDo } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  /* ── State ── */
  const [customers, setCustomers] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewCustomer, setViewCustomer] = useState(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showLogModal, setShowLogModal] = useState(null);
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  // Reset internal detail/activity log sub-views when sidebar or route navigation occurs
  useEffect(() => {
    setViewCustomer(null);
    setRecordActivityTarget(null);
  }, [location.pathname, location.search, location.key]);

  // Analytics (server driven)
  const [analytics, setAnalytics] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  /* ── Fetch Customers (server-side pagination/filtering via TanStack Query) ── */
  const { data: customerData, isLoading: loading } = useQuery({
    queryKey: ["customers", currentPage, pageSize, debouncedSearch, statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "All") params.status = statusFilter;
      if (typeFilter !== "All") params.type = typeFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await customerAPI.getAll(params);
      return response.data;
    },
    keepPreviousData: true,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["customerAnalytics"],
    queryFn: async () => {
      const response = await customerAPI.getAnalytics();
      return response.data.data;
    },
  });

  // Sync analytics data
  useEffect(() => {
    if (analyticsData) {
      setAnalytics(analyticsData);
    }
  }, [analyticsData]);

  // Sync customers table data
  useEffect(() => {
    if (customerData?.success) {
      const list = customerData.data || [];
      setCustomers(
        [...list].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        )
      );
      setServerTotal(customerData.pagination?.total || list.length || 0);
    }
  }, [customerData]);

  /* ── Debounce search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Clamp page when total shrinks ── */
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, serverTotal, pageSize]);

  /* ── Formik Form ── */
  const formik = useFormik({
    initialValues: emptyForm,
    validationSchema: customerValidationSchema,
    onSubmit: async (values) => {
      setSubmitting(true);
      const wasEdit = !!editingCustomer;
      try {
        const payload = {
          name: values.name,
          email: values.email,
          phone: "+91" + (values.phone || "").replace(/\D/g, ""),
          type: values.type,
          status: values.status,
          address: values.address,
          capacity: values.capacity || "",
          notes: values.notes || "",
          lastService: values.lastService || "—",
        };

        let saved = null;
        if (editingCustomer) {
          const response = await customerAPI.update(editingCustomer.id || editingCustomer._id, payload);
          if (response.data.success) {
            success(response.data.message || "Customer updated successfully.");
            saved = response.data.data;
          }
        } else {
          const response = await customerAPI.create(payload);
          if (response.data.success) {
            success(response.data.message || "Customer created successfully.");
            saved = response.data.data;
          }
          setCurrentPage(1);
        }
        setShowModal(false);
        setEditingCustomer(null);
        // Update the table instantly from the server response; the stat cards
        // refresh with their own cheap analytics query.
        if (saved) {
          upsertCustomer({ ...saved, id: saved.id || saved._id });
          if (!wasEdit) setServerTotal((t) => (t || 0) + 1);
        }
        queryClient.invalidateQueries(["customers"]);
        queryClient.invalidateQueries(["customerAnalytics"]);
      } catch (err) {
        console.error("Save customer error:", err);
        const msg = err.response?.data?.message || (editingCustomer ? "Failed to update customer" : "Failed to create customer");
        toastError(msg);
      } finally {
        setSubmitting(false);
      }
    },
  });

  /* ── Helpers ── */
  const formatDate = formatDateDDMMYYYY;

  /* ── Local list helpers (instant updates without a full refetch) ── */
  const customerMatchesFilters = useCallback((c) => {
    if (statusFilter !== "All" && (c.status || "") !== statusFilter) return false;
    if (typeFilter !== "All" && (c.type || "") !== typeFilter) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      const hay = `${c.name || ""} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [statusFilter, typeFilter, debouncedSearch]);

  const upsertCustomer = useCallback((c) => {
    const id = c.id || c._id;
    setCustomers((prev) => {
      if (prev.some((x) => (x.id || x._id) === id)) {
        // Edit — drop ONLY this row when it no longer matches the active filters
        if (!customerMatchesFilters(c)) {
          return prev.filter((x) => (x.id || x._id) !== id);
        }
        return prev.map((x) => ((x.id || x._id) === id ? c : x));
      }
      // Create — only show it when it belongs in the currently filtered list
      return customerMatchesFilters(c) ? [...prev, c] : prev;
    });
  }, [customerMatchesFilters]);

  /* ── Download Customer Log CSV ── */
  const handleDownloadCSV = () => {
    if (customers.length === 0) return;
    const headers = ["Customer ID", "Name", "Email", "Phone", "Type", "Status", "Capacity (kW)", "Address", "Created Date"];
    const rows = customers.map((c) => [
      `"${(c.customerId || c.id || c._id || "").replace(/"/g, '""')}"`,
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.phone || "").replace(/"/g, '""')}"`,
      `"${(c.type || "").replace(/"/g, '""')}"`,
      `"${(c.status || "").replace(/"/g, '""')}"`,
      `"${(c.capacity || "").replace(/"/g, '""')}"`,
      `"${(c.address || "").replace(/"/g, '""')}"`,
      `"${(c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "").replace(/"/g, '""')}"`,
    ].join(","));

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `customers_log_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ── Pagination (server-side) ── */
  const totalPages = useMemo(() => Math.max(1, Math.ceil(serverTotal / pageSize)), [serverTotal, pageSize]);

  /* ── Analytics derived values ── */
  const totalCustomersCount = useMemo(() => analytics?.totalCustomers ?? serverTotal, [analytics, serverTotal]);
  const activeCustomersCount = useMemo(() => analytics?.activeCustomers ?? 0, [analytics]);
  const residentialCount = useMemo(() => analytics?.residentialCount ?? 0, [analytics]);
  const commercialCount = useMemo(() => analytics?.commercialCount ?? 0, [analytics]);
  // const activePercentage = analytics?.activePercentage ?? 0;

  // const typeTotal = residentialCount + commercialCount;
  // const residentialPct =
  //   typeTotal > 0 ? parseFloat(((residentialCount / typeTotal) * 100).toFixed(1)) : 0;
  // const commercialPct =
  //   typeTotal > 0 ? parseFloat(((commercialCount / typeTotal) * 100).toFixed(1)) : 0;

  /* ── SVG Icons for StatCards ── */
  const iconTotalCustomers = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
  const iconActive = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
  const iconResidential = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
  const iconCommercial = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
    </svg>
  );

  /* ── Modal Handlers ── */
  const openAddModal = () => {
    setEditingCustomer(null);
    formik.resetForm({ values: emptyForm });
    setShowModal(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    formik.resetForm({
      values: {
        name: customer.name || "",
        email: customer.email || "",
        phone: String(customer.phone || "").replace(/\D/g, "").slice(-10),
        type: customer.type || "Residential",
        address: customer.address || "",
        capacity: customer.capacity || "",
        status: customer.status || "Active",
        notes: customer.notes || "",
        lastService: customer.lastService && customer.lastService !== "—" ? customer.lastService : "",
      },
    });
    setShowModal(true);
  };

  const openViewModal = (customer) => {
    setViewCustomer(customer);
  };

  const handleClientClick = (customer) => {
    if (canDo("customers", "view")) {
      navigate(`/admin/customer-progress?customerId=${encodeURIComponent(customer.customerId || customer.id || customer._id)}`);
    }
  };

  const handleCreateSurvey = (customer) => {
    if (!customer.leadId) return;
    const params = new URLSearchParams({
      createForLead: customer.leadId,
      customerId: customer.customerId || customer.id || "",
      customerName: customer.name || "",
      projectType: customer.type || "",
    });
    navigate(`/admin/site-survey?${params.toString()}`);
  };

  /* ── Status Change ── */
  const changeStatus = async (id, newStatus) => {
    const customer = customers.find((c) => (c.id || c._id) === id);
    if (!customer) return;

    const oldStatus = customer.status;
    if (oldStatus === newStatus) return;

    setStatusLoadingId(id);
    try {
      const response = await customerAPI.updateStatus(id, newStatus);
      if (response.data.success) {
        success(response.data.message || `Customer status changed to "${newStatus}".`);
        upsertCustomer({ ...customer, status: newStatus });
        queryClient.invalidateQueries(["customers"]);
        queryClient.invalidateQueries(["customerAnalytics"]);
      }
    } catch (err) {
      console.error("Update customer status error:", err);
      const msg = err.response?.data?.message || "Failed to update customer status";
      toastError(msg);
    } finally {
      setStatusLoadingId(null);
    }
  };

  /* ── Delete ── */
  const confirmDelete = (id) => {
    setDeleteTarget(id);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const response = await customerAPI.delete(deleteTarget);
      if (response.data.success) {
        success("Customer deleted successfully.");
        const id = deleteTarget;
        setCustomers((prev) => prev.filter((c) => (c.id || c._id) !== id));
        setServerTotal((t) => Math.max(0, (t || 0) - 1));
        queryClient.invalidateQueries(["customers"]);
        queryClient.invalidateQueries(["customerAnalytics"]);
      }
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete customer error:", err);
      // [FLOW-06] Show dependency details if the backend returns them
      const deps = err.response?.data?.dependencies;
      const msg = err.response?.data?.message || "Failed to delete customer";
      if (deps && deps.length > 0) {
        const detail = deps.map((d) => `• ${d.count} ${d.module}${d.count > 1 ? "s" : ""}`).join("\n");
        toastError(`${msg}\n\nLinked records:\n${detail}`);
      } else {
        toastError(msg);
      }
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Download Log ── */
const downloadCustomerLog = async (customer) => {
  const doc = await createProfilePdf({
    bannerName: customer.name,
    bannerSubtitle: `Customer ID: ${customer.customerId || customer.id}`,
    bannerRight: [
      `Status: ${customer.status || "—"}`,
      `Type: ${customer.type || "—"}`,
    ],
    sections: [
      {
        title: "Contact Information",
        fields: [
          ["Email", customer.email],
          ["Phone", customer.phone],
          ["Address", customer.address],
        ],
      },
      {
        title: "Account Details",
        fields: [
          ["Capacity", customer.capacity],
          ["Join Date", customer.joinDate],
          ["Total Projects", customer.totalProjects],
          ["Last Service", customer.lastService],
        ],
      },
    ],
    notes: customer.notes,
  });

  const safeName = (customer.name || "Customer")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");

  doc.save(`CustomerLog_${safeName}.pdf`);

  success("Customer log downloaded successfully.");
};
  const deletedCustomerName = customers.find(
    (c) => (c.id || c._id) === deleteTarget
  )?.name;

  /* ── Render ── */
  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="customer-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="cm-container">
      {/* ── Header ── */}
      <div className="cm-header">
        <div className="cm-header-left">
          <h2>Customer Management</h2>
          <p>Manage your solar installation customers, their contracts, and service history</p>
        </div>
        <div className="cm-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {canDo("customers", "create") && (
          <button className="cm-add-btn" onClick={openAddModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Customer
          </button>
          )}
        </div>
      </div>

      {/* ── Stats Cards (Dashboard-style KPI) ── */}
      <div className="cm-stats-grid">
        <StatCard
          title="Total Customers"
          value={totalCustomersCount.toLocaleString()}
          change={0}
          icon={iconTotalCustomers}
          color="blue"
        />
        <StatCard
          title="Active"
          value={activeCustomersCount.toLocaleString()}
          // change={activePercentage}
          icon={iconActive}
          color="green"
        />
        <StatCard
          title="Residential"
          value={residentialCount.toLocaleString()}
          // change={residentialPct}
          icon={iconResidential}
          color="purple"
        />
        <StatCard
          title="Commercial"
          value={commercialCount.toLocaleString()}
          // change={commercialPct}
          icon={iconCommercial}
          color="orange"
        />
      </div>

      {/* ── Filters ── */}
      <div className="cm-filters">
        <div className="cm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search customer by name, email or phone" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
          {search && (
            <button className="cm-search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="cm-filter-selects">
          <Dropdown
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "All Status" }, ...statuses.map((s) => ({ value: s, label: s }))]}
          />
          <Dropdown
            value={typeFilter}
            onChange={(val) => { setTypeFilter(val); setCurrentPage(1); }}
            options={[{ value: "All", label: "All Types" }, ...types.map((t) => ({ value: t, label: t }))]}
          />
          <input type="date" className="cm-filter-date-inline" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="From date" />
          <input type="date" className="cm-filter-date-inline" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="To date" />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="cm-card">
        <div className="cm-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoader colSpan={7} />
              ) : customers.length === 0 ? (
                <TableEmptyState colSpan={7} title="No customers found" subtitle="Try adjusting your search or filters." />
              ) : (
                customers.map((c) => (
                  <tr key={c.id || c._id}>
                    <td className="cm-td-id">{c.customerId || c.id}</td>
                    <td>
                      <div className="cm-client-info">
                        <button
                          type="button"
                          className={`cm-client-link${canDo("customers", "view") ? "" : " cm-client-link-readonly"}`}
                          onClick={() => handleClientClick(c)}
                          title={canDo("customers", "view") ? `View ${c.name}'s customer profile & project progress` : c.name}
                        >
                          {c.name}
                        </button>
                        <span className="cm-client-email">{c.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`cm-type-badge cm-type-${(c.type || "").toLowerCase()}`}>{c.type}</span>
                    </td>
                    <td>
                      {canDo("customers", "edit") ? (
                        <Dropdown
                          value={c.status}
                          onChange={(val) => changeStatus(c.id || c._id, val)}
                          options={statuses.map((s) => ({ value: s, label: s }))}
                          variant="inline"
                          size="sm"
                          disabled={statusLoadingId === (c.id || c._id)}
                        />
                      ) : (
                        <span className={`cm-status-badge cm-status-${(c.status || "").toLowerCase()}`}>{c.status || "—"}</span>
                      )}
                    </td>
                    <td className="cm-td-capacity">{c.capacity}</td>
                    <td className="cm-td-addr">{c.address}</td>
                    <td>
                      <div className="act-actions">
                        <button className="act-btn act-view" title="View Details" onClick={() => openViewModal(c)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <ActivityLogButton
                          module="customers"
                          onClick={() => {
                            const custId = c._id || c.id;
                            navigate(`/admin/customer-activity/${custId}`, {
                              state: { target: { recordId: custId, recordLabel: c.name || c.customerId, module: "customers" } },
                            });
                          }}
                          title="View Customer Activity Log"
                        />
                        {canDo("customers", "edit") && (
                        <button className="act-btn act-edit" title="Edit" onClick={() => openEditModal(c)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        )}
                        {canDo("customers", "delete") && (
                        <button className="act-btn act-delete" title="Delete" onClick={() => confirmDelete(c.id || c._id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                        )}
                                                {canDo("site-survey", "create") && c.leadId && (
                          <button
                            className={`cm-survey-btn${c.hasSurvey ? " cm-survey-btn-disabled" : ""}`}
                            title={c.hasSurvey ? "Site survey already completed for this customer" : "Create Site Survey"}
                            onClick={() => !c.hasSurvey && handleCreateSurvey(c)}
                            disabled={!!c.hasSurvey}
                          >
                            Create Site Survey
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
        {customers.length > 0 && (
          <div className="cm-pagination-row">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={serverTotal}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              variant="table"
              onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
              disabled={submitting}
            />
          </div>
        )}
      </div>

      {/* ════════ View Customer Modal ════════ */}
      {viewCustomer && (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title">
                <h3>{viewCustomer.name}</h3>
                <span className="vm-modal-subtitle">{viewCustomer.customerId || viewCustomer.id}</span>
              </div>
              <button className="vm-modal-close" onClick={() => setViewCustomer(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="vm-view-body">
              <div className="cm-view-section">
                <h4>Contact Information</h4>
                <div className="cm-view-grid">
                  <div className="cm-view-item">
                    <span className="cm-view-label">Customer ID</span>
                    <span className="cm-view-value">{viewCustomer.customerId || viewCustomer.id}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Email</span>
                    <span className="cm-view-value">{viewCustomer.email}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Phone</span>
                    <span className="cm-view-value">{viewCustomer.phone}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Address</span>
                    <span className="cm-view-value">{viewCustomer.address}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Capacity</span>
                    <span className="cm-view-value cm-view-value-highlight">{viewCustomer.capacity}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Join Date</span>
                    <span className="cm-view-value">{formatDate(viewCustomer.joinDate)}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Total Projects</span>
                    <span className="cm-view-value">{viewCustomer.totalProjects ?? 0}</span>
                  </div>
                  <div className="cm-view-item">
                    <span className="cm-view-label">Last Service</span>
                    <span className="cm-view-value">{formatDate(viewCustomer.lastService)}</span>
                  </div>
                </div>
              </div>
              <div className="cm-view-section">
                <h4>Notes</h4>
                <p className="cm-view-notes">
                  {viewCustomer.notes || <span className="cm-na">No notes added yet.</span>}
                </p>
              </div>
            </div>
            <div className="vm-modal-footer">
              <button className="vm-btn-close-primary" onClick={() => setViewCustomer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Add / Edit Modal ════════ */}
      {showModal && (
        <div className="cm-overlay">
          <div className="cm-modal">
            <div className="cm-modal-header">
              <h3>{editingCustomer ? "Edit Customer" : "Add Customer"}</h3>
              <button className="cm-modal-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form noValidate onSubmit={formik.handleSubmit}>
              <div className="cm-form-grid">
                <div className="cm-form-group">
                  <label>Customer Name <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="name"
                    value={formik.values.name}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Full name"
                    className={formik.touched.name && formik.errors.name ? "input-has-error" : ""}
                  />
                  {formik.touched.name && formik.errors.name && (
                    <span className="form-field-error">{formik.errors.name}</span>
                  )}
                </div>
                <div className="cm-form-group">
                  <label>Email <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="email@domain.com"
                    className={formik.touched.email && formik.errors.email ? "input-has-error" : ""}
                  />
                  {formik.touched.email && formik.errors.email && (
                    <span className="form-field-error">{formik.errors.email}</span>
                  )}
                </div>
                <div className="cm-form-group">
                  <label>Phone <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="phone-input-group">
                    <span className="phone-prefix">+91</span>
                    <input
                      type="text"
                      name="phone"
                      value={formik.values.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        formik.setFieldValue("phone", val);
                      }}
                      onBlur={formik.handleBlur}
                      placeholder="98765 43210"
                      className={formik.touched.phone && formik.errors.phone ? "input-has-error" : ""}
                    />
                  </div>
                  {formik.touched.phone && formik.errors.phone && (
                    <span className="form-field-error">{formik.errors.phone}</span>
                  )}
                </div>
                <div className="cm-form-group">
                  <label>Capacity</label>
                  <input
                    type="text"
                    name="capacity"
                    value={formik.values.capacity}
                    onChange={(e) => {
                      // Allow up to 3 digits (+ optional decimal & kW suffix); ignore extra digits.
                      const v = e.target.value;
                      if (v === "" || /^\d{0,3}(\.\d*)?\s*(kW|kw|KW)?$/.test(v)) formik.handleChange(e);
                    }}
                    onBlur={formik.handleBlur}
                    placeholder="e.g. 5kW"
                    maxLength={10}
                    className={formik.errors.capacity && (formik.touched.capacity || (formik.values.capacity && parseFloat(formik.values.capacity) > 50)) ? "input-has-error" : ""}
                  />
                  {(formik.touched.capacity || (formik.values.capacity && parseFloat(formik.values.capacity) > 50)) && formik.errors.capacity && (
                    <span className="form-field-error">{formik.errors.capacity}</span>
                  )}
                </div>
                <div className="cm-form-group">
                  <label>Type <span style={{ color: "#ef4444" }}>*</span></label>
                  <Dropdown
                    value={formik.values.type}
                    onChange={(val) => formik.setFieldValue("type", val)}
                    options={types.map((t) => ({ value: t, label: t }))}
                    variant="form"
                  />
                </div>
                <div className="cm-form-group">
                  <label>Status <span style={{ color: "#ef4444" }}>*</span></label>
                  <Dropdown
                    value={formik.values.status}
                    onChange={(val) => formik.setFieldValue("status", val)}
                    options={statuses.map((s) => ({ value: s, label: s }))}
                    variant="form"
                  />
                </div>
                <div className="cm-form-group">
                  <label>Last Service</label>
                  <input
                    type="date"
                    name="lastService"
                    value={formik.values.lastService}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  />
                </div>
                <div className="cm-form-group cm-form-full">
                  <label>Address <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    type="text"
                    name="address"
                    value={formik.values.address}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Street, City"
                    maxLength={200}
                    className={formik.touched.address && formik.errors.address ? "input-has-error" : ""}
                  />
                  {formik.touched.address && formik.errors.address && (
                    <span className="form-field-error">{formik.errors.address}</span>
                  )}
                </div>
                <div className="cm-form-group cm-form-full">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    className="cm-form-textarea"
                    value={formik.values.notes}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Customer notes..."
                    rows="2"
                  />
                </div>
              </div>
              <div className="cm-modal-actions">
                <button type="submit" className="cm-save-btn" disabled={submitting || !formik.isValid}>
                  {submitting ? (
                    <>
                      <span className="cm-spinner cm-spinner-light"></span>
                      {editingCustomer ? "Updating..." : "Saving..."}
                    </>
                  ) : (
                    editingCustomer ? "Update" : "Add Customer"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════ Delete Confirmation ════════ */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Customer"
        message={`Are you sure you want to delete ${deletedCustomerName || "this customer"}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
        loading={submitting}
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
                  {showLogModal.customerId || showLogModal.id || showLogModal._id}
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
                      {showLogModal.status || "Active"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Date Registered / Joined</span>
                    <span style={{ fontWeight: "500", color: "#1e293b" }}>
                      {showLogModal.joinDate ? new Date(showLogModal.joinDate).toLocaleDateString("en-IN") : new Date(showLogModal.createdAt).toLocaleDateString("en-IN")}
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
                  Customer Profile Details
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.name}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Email Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.email}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Phone Number</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.phone}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Type</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.type}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Solar Capacity</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.capacity || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Total Projects</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.totalProjects || 0}</div>
                  </div>
                </div>
                
                {showLogModal.address && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Installation Address</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.address}</div>
                  </div>
                )}

                {showLogModal.notes && (
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Log Remarks &amp; Notes</div>
                    <div style={{ fontWeight: "500", color: "#475569", marginTop: "2px", fontStyle: "italic", whiteSpace: "pre-line" }}>
                      "{showLogModal.notes}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { downloadCustomerLog(showLogModal); setShowLogModal(null); }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
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

export default CustomerManagement;
