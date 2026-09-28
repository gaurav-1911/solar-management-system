import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Pagination, Dropdown, TableLoader, TableEmptyState, PageLoader } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { projectApprovalAPI, quotationAPI, installationAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import "./ProjectApproval.css";
import "../quotation/quotation.css";
import "../../styles/ActionButtons.css";

const STATUS_OPTIONS = ["All", "Pending", "Under Review", "Approved", "Rejected"];

const statusBadgeClass = (status) => {
  switch (status) {
    case "Approved": return "pa-badge pa-badge-success";
    case "Rejected": return "pa-badge pa-badge-danger";
    case "Under Review": return "pa-badge pa-badge-warning";
    case "Pending": return "pa-badge pa-badge-pending";
    default: return "pa-badge";
  }
};

const quotationPillClass = (status) =>
  ({ Approved: "qs-ap", Sent: "qs-st", Negotiating: "qs-ng", Rejected: "qs-rj", "Pending Approval": "qs-pa", Draft: "qs-dr" })[status] || "";

const formatCurrency = (val) =>
  `₹${Number(val).toLocaleString("en-IN")}`;

// Format a stored date as DD/MM/YYYY only.
const formatDateOnly = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

// Format a stored date as Indian time (IST) — DD/MM/YYYY, HH:MM:SS (24-hour).
const formatIndianDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
};

const ProjectApproval = () => {
  const { canDo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError } = useToast();

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  // Quotation details shown when the Design ID is clicked in the table.
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState(null);

  const [showActionDialog, setShowActionDialog] = useState(false);

  // Reset modal states on sidebar navigation / route change
  useEffect(() => {
    setShowViewModal(false);
    setSelectedApproval(null);
    setShowQuoteModal(false);
    setShowActionDialog(false);
  }, [location.pathname, location.search, location.key, location.state]);
  const [approvals, setApprovals] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // Lead IDs that already have an installation — used to disable the
  // "Create Installation" button so duplicate records cannot be created.
  const [installedLeadIds, setInstalledLeadIds] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Status counts computed over ALL approvals server-side (not just the page).
  const [stats, setStats] = useState({ total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0 });

  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState("");
  const [actionComment, setActionComment] = useState("");

  // Guards against out-of-order responses when the user pages / filters fast:
  // only the LATEST request may write to state.
  const fetchSeqRef = useRef(0);

  // Server-side fetch of the CURRENT page — the search/status filters are
  // applied server-side and the API's pagination metadata drives the pager.
  const fetchApprovals = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const params = { page: currentPage, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "All") params.status = statusFilter;
      const response = await projectApprovalAPI.getAll(params);
      if (seq === fetchSeqRef.current) {
        setApprovals(response?.data?.data || []);
        setServerTotal(response?.data?.pagination?.total || 0);
      }
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        console.error("Failed to load project approvals", err);
        setApprovals([]);
        setError("Unable to load project approvals right now.");
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await projectApprovalAPI.getStats();
      if (response?.data?.success && response.data.data) {
        setStats(response.data.data);
      }
    } catch (err) {
      console.warn("Failed to load project approval stats:", err);
    }
  }, []);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Refetch the table whenever page / size / filters change ── */
  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  /* ── Fetch stats once on mount (and again after status changes) ── */
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    installationAPI.getStats().then((res) => {
      if (res.data?.data?.installedLeadIds) {
        setInstalledLeadIds(res.data.data.installedLeadIds);
      }
    }).catch(() => {});
  }, []);

  // The server already filters + sorts (newest first) and returns only the
  // current page, so the table renders `approvals` directly.
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // Clamp the page when the total shrinks (filter change).
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, serverTotal, pageSize]);

  const openViewModal = (approval) => {
    setSelectedApproval(approval);
    setShowViewModal(true);
  };

  const openQuotationModal = async (approval) => {
    if (!approval) return;
    setShowQuoteModal(true);
    setQuoteDetails(null);
    try {
      const res = await quotationAPI.getAll({ page: 1, limit: 1000 });
      const list = res.data?.data || [];
      const found = list.find(
        (q) =>
          (approval.leadId && q.leadId === approval.leadId) ||
          (approval.designId && q.designId === approval.designId)
      );
      if (found) {
        setQuoteDetails(found);
      } else {
        toastError("Quotation not found for this project");
        setShowQuoteModal(false);
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to load quotation details");
      setShowQuoteModal(false);
    }
  };

  const openActionDialog = (approval, type) => {
    setActionTarget(approval);
    setActionType(type);
    setActionComment("");
    setShowActionDialog(true);
  };

  const confirmDelete = (approval) => {
    setDeleteTarget(approval);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await projectApprovalAPI.delete(deleteTarget._id || deleteTarget.id);
      success(`Project approval ${deleteTarget.approvalId || deleteTarget.id} deleted successfully`);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      await Promise.all([fetchApprovals(), fetchStats()]);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete project approval");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openCreateInstallation = (approval) => {
    const params = new URLSearchParams({
      createForLead: approval.leadId || "",
      customerName: approval.customerName || "",
      projectName: approval.projectName || "",
    });
    navigate(`/admin/installations?${params.toString()}`);
  };


  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [actionSubmitting, setActionSubmitting] = useState(false);
  const handleAction = async () => {
    if (!actionTarget || actionSubmitting) return;
    setActionSubmitting(true);
    const newStatus = actionType === "approve" ? "Approved" : "Rejected";
    let updated = false;

    try {
      await projectApprovalAPI.update(actionTarget._id || actionTarget.id, {
        status: newStatus,
        comments: actionComment,
      });
      success(`Project ${actionTarget.approvalId || actionTarget.id || actionTarget._id} ${newStatus.toLowerCase()} successfully`);
      updated = true;
    } catch (err) {
      console.error("Failed to update project approval", err);
      toastError("Unable to update project approval right now.");
    } finally {
      setActionSubmitting(false);
      setShowActionDialog(false);
      setActionTarget(null);
      setActionType("");
      setActionComment("");
      if (updated) {
        await Promise.all([fetchApprovals(), fetchStats()]);
      }
    }
  };

  const renderQuotationModal = () => {
    if (!quoteDetails) {
      return (
        <div className="vm-overlay">
          <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-header">
              <div className="vm-modal-title"><h3>Quotation Details</h3></div>
              <button className="vm-modal-close" onClick={() => setShowQuoteModal(false)}>
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
    const q = quoteDetails;
    const items = Object.entries(q.items || {});
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal" onClick={(e) => e.stopPropagation()}>
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>Quotation Details — {q.quotationId || q.id || q._id}</h3></div>
            <button className="vm-modal-close" onClick={() => setShowQuoteModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="qs-view-section">
              <div className="qs-vw-section-title">
                <span className="qs-vw-section-num">1</span>
                <h4>Quote Information</h4>
              </div>
              <div className="qs-view-grid">
                <div className="qs-view-item"><span className="qs-view-label">Client</span><span className="qs-view-value">{q.client || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Project Name</span><span className="qs-view-value">{q.projectName || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Status</span><span className={"qs-status-pill " + quotationPillClass(q.status)}>{q.status || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Version</span><span className="qs-view-value">v{q.version || 1}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Valid Until</span><span className="qs-view-value">{formatDateOnly(q.validUntil) || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Approved By</span><span className="qs-view-value">{q.approvedBy || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Lead ID</span><span className="qs-view-value">{q.leadId || "—"}</span></div>
                <div className="qs-view-item"><span className="qs-view-label">Design ID</span><span className="qs-view-value">{q.designId || "—"}</span></div>
              </div>
            </div>

            <div className="qs-view-section">
              <div className="qs-vw-section-title">
                <span className="qs-vw-section-num">2</span>
                <h4>Component Pricing</h4>
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
                    {items.map(([k, v]) => (
                      <tr key={k}>
                        <td className="qs-vw-td-name">{v?.label || k}</td>
                        <td>{v?.qty}</td>
                        <td>{formatCurrency(v?.price)}</td>
                        <td className="qs-vw-td-total">{formatCurrency((v?.qty || 0) * (v?.price || 0))}</td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="qs-e">No components</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="qs-view-section">
              <div className="qs-vw-section-title">
                <span className="qs-vw-section-num">3</span>
                <h4>Summary</h4>
              </div>
              <div className="qs-vw-summary">
                <div className="qs-vw-sum-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(q.total)}</span>
                </div>
                <div className="qs-vw-sum-row">
                  <span>GST (18%)</span>
                  <span style={{ color: "#2563eb" }}>+{formatCurrency(q.gst)}</span>
                </div>
                <div className="qs-vw-sum-row qs-vw-sum-grand">
                  <span>Grand Total</span>
                  <span>{formatCurrency(q.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setShowQuoteModal(false)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pa-page">
      {/* Header */}
      <div className="pa-header">
        <div>
          <h1 className="pa-title">Project Approval</h1>
          <p className="pa-subtitle">Review and approve solar project designs submitted for installation.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="pa-stats-grid">
        <StatCard
          title="Total Projects"
          value={stats.total.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
          color="blue"
        />
        <StatCard
          title="Pending"
          value={stats.pending.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          color="orange"
        />
        <StatCard
          title="Approved"
          value={stats.approved.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
          color="green"
        />
        <StatCard
          title="Rejected"
          value={stats.rejected.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
          color="red"
        />
      </div>

      {/* Toolbar */}
      <div className="pa-toolbar">
        <div className="pa-toolbar-row">
          <div className="pa-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search by ID, Design ID, Customer, Project, or Lead ID" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
            {search && (
              <button className="pa-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Status" }, ...STATUS_OPTIONS.filter((s) => s !== "All").map((s) => ({ value: s, label: s }))]} />
        </div>
      </div>

      {/* Table */}
      <div className="pa-table-card">
        <div className="pa-table-wrapper">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Approval ID</th>
                  <th>Design ID</th>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Capacity</th>
                  <th>Est. Cost</th>
                  <th>Submitted Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && approvals.length === 0 ? (
                  <TableLoader colSpan={9} />
                ) : approvals.length === 0 ? (
                  <TableEmptyState colSpan={9} title="No project approvals found" subtitle="Try adjusting your search or filters." />
                ) : (
                  approvals.map((a) => (
                    <tr key={a._id || a.id}>
                      <td className="pa-td-id">{a.approvalId || a.id || a._id}</td>
                      <td>
                        <button className="pa-quote-link" onClick={() => openQuotationModal(a)} title="View quotation details">{a.designId || "—"}</button>
                      </td>
                      <td className="pa-td-name-text">{a.projectName || "—"}</td>
                      <td>{a.customerName || "—"}</td>
                      <td>{a.capacity ? `${a.capacity} kW` : "—"}</td>
                      <td>{formatCurrency(a.estimatedCost || 0)}</td>
                      <td>{formatIndianDateTime(a.submittedDate)}</td>
                      <td><span className={statusBadgeClass(a.status)}>{a.status || "Pending"}</span></td>
                      <td>
                        <div className="pa-actions">
                          <button className="pa-action-btn pa-view-btn" onClick={() => openViewModal(a)} title="View">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          {canDo("project-approval", "edit") && a.status !== "Approved" && a.status !== "Rejected" && (
                            <>
                              <button className="pa-action-btn pa-approve-btn" onClick={() => openActionDialog(a, "approve")} title="Approve">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </button>
                              <button className="pa-action-btn pa-reject-btn" onClick={() => openActionDialog(a, "reject")} title="Reject">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </>
                          )}
                          {canDo("project-approval", "delete") && (
                            <button className="act-btn act-delete" onClick={() => confirmDelete(a)} title="Delete">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          )}
                          {canDo("installations", "create") && a.status === "Approved" && a.leadId && (() => {
                            const alreadyInstalled = installedLeadIds.includes(a.leadId);
                            return (
                              <button
                                className={`pa-install-btn${alreadyInstalled ? " pa-install-btn-disabled" : ""}`}
                                onClick={() => !alreadyInstalled && openCreateInstallation(a)}
                                disabled={alreadyInstalled}
                                title={alreadyInstalled ? "An installation already exists for this lead" : "Create Installation"}
                              >
                                Create Installation
                              </button>
                            );
})()}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </div>

        {serverTotal > 0 && (
          <div className="pa-pagination-row">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={serverTotal}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* View Modal */}
      {showViewModal && selectedApproval && (
        <div className="pa-overlay">
          <div className="pa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pa-modal-header">
              <h2>Approval Details — {selectedApproval.approvalId || selectedApproval.id}</h2>
              <button className="pa-modal-close" onClick={() => setShowViewModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="pa-view-grid">
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Approval ID</span>
                <span className="pa-view-val">{selectedApproval.approvalId || selectedApproval.id}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Design ID</span>
                <span className="pa-view-val">{selectedApproval.designId}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Project Name</span>
                <span className="pa-view-val">{selectedApproval.projectName}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Customer Name</span>
                <span className="pa-view-val">{selectedApproval.customerName}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Lead ID</span>
                <span className="pa-view-val">{selectedApproval.leadId}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Capacity</span>
                <span className="pa-view-val">{selectedApproval.capacity} kW</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Estimated Cost</span>
                <span className="pa-view-val">{formatCurrency(selectedApproval.estimatedCost)}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Submitted Date</span>
                <span className="pa-view-val">{formatIndianDateTime(selectedApproval.submittedDate)}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Status</span>
                <span className="pa-view-val">
                  <span className={statusBadgeClass(selectedApproval.status)}>{selectedApproval.status}</span>
                </span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Reviewed By</span>
                <span className="pa-view-val">{selectedApproval.reviewedBy || "—"}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Reviewed Date</span>
                <span className="pa-view-val">{formatIndianDateTime(selectedApproval.reviewedDate)}</span>
              </div>
              <div className="pa-view-stat">
                <span className="pa-view-lbl">Comments</span>
                <span className="pa-view-val">{selectedApproval.comments || "—"}</span>
              </div>
            </div>
            <div className="pa-modal-footer">
              <button className="modal-footer-close-primary" onClick={() => setShowViewModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showQuoteModal && renderQuotationModal()}

      {/* Approve/Reject Dialog */}
      {showActionDialog && actionTarget && (
        <div className="pa-overlay">
          <div className="pa-modal">
            <div className="pa-modal-header">
              <h2>{actionType === "approve" ? "Approve" : "Reject"} Project — {actionTarget.approvalId || actionTarget.id}</h2>
              <button className="pa-modal-close" onClick={() => setShowActionDialog(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="pa-comment-field">
              <label>Comment (Required)</label>
              <textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={actionType === "approve" ? "Enter approval remarks..." : "Enter reason for rejection..."}
                maxLength={500}
              />
            </div>
            <div className="pa-modal-footer">
              <button className="pa-btn pa-btn-cancel" onClick={() => setShowActionDialog(false)} disabled={actionSubmitting}>Cancel</button>
              <button
                className={actionType === "approve" ? "pa-btn pa-btn-approve" : "pa-btn pa-btn-reject"}
                onClick={handleAction}
                disabled={!actionComment.trim() || actionSubmitting}
              >
                {actionSubmitting ? (actionType === "approve" ? "Approving..." : "Rejecting...") : (actionType === "approve" ? "Approve" : "Reject")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Project Approval"
        message={`Are you sure you want to delete ${deleteTarget?.approvalId || deleteTarget?.id}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
      />
    </div>
  );
};

export default ProjectApproval;