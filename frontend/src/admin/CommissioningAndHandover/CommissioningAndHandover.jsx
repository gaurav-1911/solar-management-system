import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useFormik } from "formik";
import { Pagination, Dropdown, TableLoader, TableEmptyState } from "../../components/common";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import StatCard from "../dashboard/StatCard/StatCard";
import { useLocalToast, ToastRenderer } from "../../components/common/Toast";
import {
  commissioningAPI,
  installationAPI,
  testingAPI,
  projectApprovalAPI,
} from "../../services";
import * as Yup from "yup";
import { useAuth } from "../../context/AuthContext";
import { ActivityLogButton } from "../../components/common/RecordActivityModal";
import { createProfilePdf } from "../../utils/pdfLayout";
import "../../styles/ActionButtons.css";
import "./CommissioningAndHandover.css";

/* ────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────── */

const GRID_STATUSES = ["Pending", "In Progress", "Connected"];
const DISCOM_STATUSES = ["Pending", "Approved", "Rejected"];
const NET_METER_STATUSES = ["Pending", "Installed"];
const SIGNED_STATUSES = ["Pending", "Signed"];
const DELIVERED_STATUSES = ["Pending", "Delivered"];

const initialFormData = {
  leadId: "",
  customerName: "",
  projectName: "",
  commissioningDate: "",
  gridConnected: "Pending",
  netMeterInstalled: "Pending",
  discomApproval: "Pending",
  handoverDate: "",
  customerSigned: "Pending",
  documentsDelivered: "Pending",
  trainingProvided: false,
  warrantyRegistered: false,
  remarks: "",
};

const validationSchema = Yup.object().shape({
  leadId: Yup.string().trim().required("Lead is required"),
});

/* ────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────── */

const normalizeRecord = (doc) => ({
  ...doc,
  id: doc.recordId || doc.id || doc._id,
  commissioningDate: doc.commissioningDate
    ? String(doc.commissioningDate).slice(0, 10)
    : "",
  handoverDate: doc.handoverDate ? String(doc.handoverDate).slice(0, 10) : "",
});

const toStatusOptions = (arr) => arr.map((s) => ({ value: s, label: s }));

const isCommissioned = (r) =>
  r.gridConnected === "Connected" &&
  r.netMeterInstalled === "Installed" &&
  r.discomApproval === "Approved";

const isHandedOver = (r) =>
  isCommissioned(r) &&
  r.customerSigned === "Signed" &&
  r.documentsDelivered === "Delivered" &&
  r.warrantyRegistered === true;

const getStatusInfo = (r) => {
  if (isHandedOver(r)) return { label: "Handed Over", className: "ch-badge-handover" };
  if (isCommissioned(r)) return { label: "Commissioned", className: "ch-badge-commissioned" };
  return { label: "Pending", className: "ch-badge-pending" };
};

const leadNumber = (id) => {
  const m = String(id || "").match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

const CommissioningAndHandover = () => {
  const navigate = useNavigate();
  const { toast, showToast } = useLocalToast();
  const { canDo } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installations, setInstallations] = useState([]);

  const [testings, setTestings] = useState([]);
  const [projectApprovals, setProjectApprovals] = useState([]);

  const [search, setSearch] = useState("");
  const [gridFilter, setGridFilter] = useState("All");
  const [discomFilter, setDiscomFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTotal, setServerTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Status counts computed over ALL records server-side (not just the page).
  const [stats, setStats] = useState({ total: 0, commissioned: 0, handedOver: 0, pending: 0 });
  // Every lead that already has a commissioning record — from the stats
  // endpoint, so the form dropdown excludes them no matter which page is loaded.
  const [recordedLeadIds, setRecordedLeadIds] = useState([]);

  const location = useLocation();
  const [showFormPage, setShowFormPage] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // Reset showFormPage to false (main list page) when navigating / clicking sidebar link
  useEffect(() => {
    if (!searchParams.get("createForLead")) {
      setShowFormPage(false);
    }
  }, [location.key, location.state]);
  const prefillRef = useRef(null);
  const prefillAppliedRef = useRef(false);
  // Keeps the pre-filled lead selectable even though it already has a record.
  const [prefillLeadId, setPrefillLeadId] = useState("");
  // True once the form's dropdown sources have settled so the pre-fill can
  // open the form even when an API call fails.
  const [sourcesReady, setSourcesReady] = useState(false);
  const [statsReady, setStatsReady] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Guards against out-of-order responses when the user pages / filters fast:
  // only the LATEST request may write to state.
  const fetchSeqRef = useRef(0);

  // Server-side fetch of the CURRENT page — search/grid/DISCOM filters are
  // applied server-side and the API's pagination metadata drives the pager.
  const fetchRecords = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (gridFilter !== "All") params.gridConnected = gridFilter;
      if (discomFilter !== "All") params.discomApproval = discomFilter;
      const res = await commissioningAPI.getAll(params);
      if (seq === fetchSeqRef.current) {
        setRecords((res.data?.data || []).map(normalizeRecord));
        setServerTotal(res.data?.pagination?.total || 0);
      }
    } catch (err) {
      if (seq === fetchSeqRef.current) {
        console.warn("Failed to load commissioning records:", err?.message);
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, gridFilter, discomFilter]);

  // Status counts + recorded lead IDs computed over ALL records server-side.
  const fetchStats = useCallback(async () => {
    try {
      const res = await commissioningAPI.getStats();
      if (res.data?.success && res.data?.data) {
        setStats(res.data.data);
        setRecordedLeadIds(res.data.data.recordedLeadIds || []);
      }
    } catch (err) {
      console.warn("Failed to load commissioning stats:", err?.message);
    } finally {
      setStatsReady(true);
    }
  }, []);

  /* ── Debounce the search input ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Refetch the table whenever page / size / filters change ── */
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  /* ── Fetch stats once on mount (and again after mutations) ── */
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Load lead-linked sources for auto-fill
  useEffect(() => {
    let cancelled = false;
    const loadSources = async () => {
      const [instRes, testRes, approvalRes] = await Promise.allSettled([
        installationAPI.getAll({ page: 1, limit: 100 }),
        testingAPI.getAll({ page: 1, limit: 100 }),
        projectApprovalAPI.getAll({ page: 1, limit: 100 }),
      ]);
      if (cancelled) return;
      if (instRes.status === "fulfilled") setInstallations(instRes.value?.data?.data || []);
      if (testRes.status === "fulfilled") setTestings(testRes.value?.data?.data || []);
      if (approvalRes.status === "fulfilled") setProjectApprovals(approvalRes.value?.data?.data || []);
      if (!cancelled) setSourcesReady(true);
    };
    loadSources();
    return () => { cancelled = true; };
  }, []);

  // Lock the main dashboard-content scroll when any overlay/modal is open
  const anyModalOpen = showDeleteDialog || !!viewRecord;

  useEffect(() => {
    const content = document.querySelector(".dashboard-content");
    if (!content) return;
    if (anyModalOpen) {
      content.style.overflow = "hidden";
    } else {
      content.style.overflow = "";
    }
    return () => { content.style.overflow = ""; };
  }, [anyModalOpen]);

  // Leads that already have a commissioning record — from the stats endpoint,
  // so the exclusion works no matter which page of the table is loaded.
  const recordedLeadIdsSet = useMemo(
    () => new Set(recordedLeadIds),
    [recordedLeadIds]
  );

  // Map leadId -> projectName from project approvals (for dropdown display)
  const projectNameByLead = useMemo(() => {
    const map = {};
    (projectApprovals || []).forEach((a) => {
      if (a.leadId && a.projectName) map[a.leadId] = a.projectName;
    });
    return map;
  }, [projectApprovals]);

  // Leads available for a new record — only tested installations with project names from project approvals.
  const projectOptions = useMemo(() => {
    // leadIds that have a completed test (Pass)
    const testedLeadIds = new Set(
      (testings || [])
        .filter((t) => t.testResult === "Pass" && t.leadId)
        .map((t) => t.leadId)
    );

    const seen = new Set();
    return (installations || [])
      .filter((i) => i.leadId && testedLeadIds.has(i.leadId))
      .filter(
        (i) =>
          !recordedLeadIdsSet.has(i.leadId) ||
          i.leadId === editingRecord?.leadId ||
          i.leadId === prefillLeadId
      )
      .sort((a, b) => (projectNameByLead[a.leadId] || a.customerName || "").localeCompare(projectNameByLead[b.leadId] || b.customerName || ""))
      .filter((i) => {
        if (seen.has(i.leadId)) return false;
        seen.add(i.leadId);
        return true;
      })
      .map((a) => ({
        value: a.leadId,
        label: projectNameByLead[a.leadId] || a.customerName || a.leadId,
      }));
  }, [installations, testings, recordedLeadIdsSet, editingRecord?.leadId, prefillLeadId, projectNameByLead]);

  const handleProjectSelect = (leadId) => {
    formik.setFieldValue("leadId", leadId);
    const installation = (installations || []).find((i) => i.leadId === leadId);
    formik.setFieldValue("customerName", installation?.customerName || "");
    formik.setFieldValue("projectName", projectNameByLead[leadId] || "");
  };

  const formik = useFormik({
    initialValues: { ...initialFormData },
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      const payload = {
        ...values,
        commissioningDate: values.commissioningDate || null,
        handoverDate: values.handoverDate || null,
      };
      try {
        if (editingRecord) {
          const res = await commissioningAPI.update(editingRecord._id, payload);
          const updated = normalizeRecord(res.data.data);
          setRecords((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
          showToast(`Record ${updated.id} updated successfully`, "success");
        } else {
          const res = await commissioningAPI.create(payload);
          const created = normalizeRecord(res.data.data);
          setRecords((prev) => [created, ...prev]);
          showToast(`Record ${created.id} created successfully`, "success");
        }
        setShowFormPage(false);
        setEditingRecord(null);
        formik.resetForm();
        if (editingRecord) {
          // Update — the row stays where it is; refresh the current page.
          await Promise.all([fetchRecords(), fetchStats()]);
        } else {
          // Create — new records sort to the top (page 1), so jump there so
          // the newly created row is visible.
          setCurrentPage(1);
          if (currentPage === 1) {
            await Promise.all([fetchRecords(), fetchStats()]);
          } else {
            // The currentPage change triggers the refetch effect automatically.
            await fetchStats();
          }
        }
      } catch (err) {
        showToast(err.response?.data?.message || "Failed to save record. Please try again.", "error");
      } finally {
        setSubmitting(false);
      }
    },
  });

  useEffect(() => {
    const leadId = (searchParams.get("createForLead") || "").trim();
    if (!leadId) return;
    prefillRef.current = {
      leadId,
      customerName: (searchParams.get("customerName") || "").trim(),
    };
    setSearchParams({}, { replace: true });
  }, []);

  useEffect(() => {
    const prefill = prefillRef.current;
    if (!prefill || prefillAppliedRef.current || !sourcesReady || !statsReady) return;
    prefillAppliedRef.current = true;
    setEditingRecord(null);
    setPrefillLeadId(prefill.leadId);
    formik.setValues(
      {
        ...initialFormData,
        leadId: prefill.leadId,
        customerName: prefill.customerName || "",
      },
      false
    );
    handleProjectSelect(prefill.leadId);
    setShowFormPage(true);
  }, [sourcesReady, statsReady]);

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));

  // Clamp the page when the total shrinks (delete / filter change).
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(serverTotal / pageSize));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [currentPage, serverTotal, pageSize]);

  // ── Actions ──
  const openFormPage = (record = null) => {
    if (record) {
      setEditingRecord(record);
      formik.setValues(
        {
          leadId: record.leadId || "",
          customerName: record.customerName || "",
          projectName: record.projectName || "",
          commissioningDate: record.commissioningDate || "",
          gridConnected: record.gridConnected || "Pending",
          netMeterInstalled: record.netMeterInstalled || "Pending",
          discomApproval: record.discomApproval || "Pending",
          handoverDate: record.handoverDate || "",
          customerSigned: record.customerSigned || "Pending",
          documentsDelivered: record.documentsDelivered || "Pending",
          trainingProvided: !!record.trainingProvided,
          warrantyRegistered: !!record.warrantyRegistered,
          remarks: record.remarks || "",
        },
        false
      );
    } else {
      setEditingRecord(null);
      formik.setValues({ ...initialFormData }, false);
    }
    setShowFormPage(true);
  };

  const openView = (record) => setViewRecord(record);

  const confirmDelete = (record) => {
    setDeleteTarget(record);
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
        await commissioningAPI.delete(deleteTarget._id);
        showToast(`Record ${deleteTarget.id} deleted successfully`, "success");
        await Promise.all([fetchRecords(), fetchStats()]);
      }
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to delete record.", "error");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  const downloadCommissioningLog = async (record) => {
    try {
      const doc = await createProfilePdf({
        bannerName: record.customerName || "Customer",
        bannerSubtitle: `Record ID: ${record.id}`,
        bannerRight: [`Lead ID: ${record.leadId || "—"}`],
        sections: [
          {
            title: "Project Information",
            fields: [
              ["Record ID", record.id],
              ["Lead ID", record.leadId || "—"],
              ["Customer Name", record.customerName || "—"],
              ["Project Name", record.projectName || "—"],
            ],
          },
          {
            title: "Commissioning Details",
            fields: [
              ["Commissioning Date", record.commissioningDate || "—"],
              ["Grid Connection", record.gridConnected || "—"],
              ["Net Meter Installed", record.netMeterInstalled || "—"],
              ["DISCOM Approval", record.discomApproval || "—"],
            ],
          },
          {
            title: "Handover Details",
            fields: [
              ["Handover Date", record.handoverDate || "—"],
              ["Customer Signed", record.customerSigned || "—"],
              ["Documents Delivered", record.documentsDelivered || "—"],
              ["Warranty Registered", record.warrantyRegistered ? "Yes" : "No"],
              ["Training Provided", record.trainingProvided ? "Yes" : "No"],
            ],
          },
          {
            title: "Remarks",
            fields: [
              ["Remarks / Notes", record.remarks || "—"],
            ],
          },
        ],
      });

      const safeCustomer = (record.customerName || "Customer")
        .replace(/\s+/g, "_")
        .replace(/[^\w-]/g, "");

      doc.save(`CommissioningLog_${safeCustomer}.pdf`);
      showToast("Commissioning log downloaded successfully", "success");
    } catch (err) {
      console.error("Failed to generate PDF log:", err);
      showToast("Failed to download commissioning log", "error");
    }
  };

  /* ──────────────── FORM PAGE ──────────────── */
  const renderFormPage = () => (
    <div className="ch-form-page">
      <div className="ch-form-page-header">
        <button className="ch-btn ch-back-btn" onClick={() => setShowFormPage(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Records
        </button>
        <h2>{editingRecord ? `Edit Record ${editingRecord.id}` : "New Commissioning & Handover"}</h2>
      </div>

      <form onSubmit={formik.handleSubmit} className="ch-form-page-body" noValidate>
        {/* Section 1: Project Details */}
        <div className="ch-form-section">
          <div className="ch-section-header">
            <span className="ch-section-number">1</span>
            <h4>Project Details</h4>
          </div>
          <div className="ch-form-grid">
            <div className="ch-form-field">
              <label>Select Project <span className="ch-required">*</span></label>
              <Dropdown
                value={formik.values.leadId}
                onChange={handleProjectSelect}
                options={projectOptions.length > 0 ? [{ value: "", label: "Select Project" }, ...projectOptions] : []}
                placeholder="Select Project"
                emptyMessage="No approved projects available"
                variant="form"
                disabled={!!editingRecord}
              />
              {formik.errors.leadId && formik.touched.leadId && <span className="ch-field-error">{formik.errors.leadId}</span>}
            </div>
            <div className="ch-form-field">
              <label>Customer Name</label>
              <input
                type="text"
                name="customerName"
                value={formik.values.customerName}
                readOnly
                title="Auto-filled from the selected project"
                placeholder="Auto-filled from selected project"
                className="ch-input-readonly"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Commissioning */}
        <div className="ch-form-section">
          <div className="ch-section-header">
            <span className="ch-section-number">2</span>
            <h4>Commissioning</h4>
          </div>
          <div className="ch-form-grid">
            <div className="ch-form-field">
              <label>Commissioning Date</label>
              <input type="date" name="commissioningDate" value={formik.values.commissioningDate} onChange={formik.handleChange} />
            </div>
            <div className="ch-form-field">
              <label>Grid Connection</label>
              <Dropdown value={formik.values.gridConnected} onChange={(val) => formik.setFieldValue("gridConnected", val)} options={toStatusOptions(GRID_STATUSES)} variant="form" />
            </div>
            <div className="ch-form-field">
              <label>Net Meter Installed</label>
              <Dropdown value={formik.values.netMeterInstalled} onChange={(val) => formik.setFieldValue("netMeterInstalled", val)} options={toStatusOptions(NET_METER_STATUSES)} variant="form" />
            </div>
            <div className="ch-form-field">
              <label>DISCOM Approval</label>
              <Dropdown value={formik.values.discomApproval} onChange={(val) => formik.setFieldValue("discomApproval", val)} options={toStatusOptions(DISCOM_STATUSES)} variant="form" />
            </div>
          </div>
        </div>

        {/* Section 3: Handover */}
        <div className="ch-form-section">
          <div className="ch-section-header">
            <span className="ch-section-number">3</span>
            <h4>Handover</h4>
          </div>
          <div className="ch-form-grid">
            <div className="ch-form-field">
              <label>Handover Date</label>
              <input type="date" name="handoverDate" value={formik.values.handoverDate} onChange={formik.handleChange} />
            </div>
            <div className="ch-form-field">
              <label>Customer Signed</label>
              <Dropdown value={formik.values.customerSigned} onChange={(val) => formik.setFieldValue("customerSigned", val)} options={toStatusOptions(SIGNED_STATUSES)} variant="form" />
            </div>
            <div className="ch-form-field">
              <label>Documents Delivered</label>
              <Dropdown value={formik.values.documentsDelivered} onChange={(val) => formik.setFieldValue("documentsDelivered", val)} options={toStatusOptions(DELIVERED_STATUSES)} variant="form" />
            </div>
            <div className="ch-form-field">
              <label className="ch-check-label">
                <input type="checkbox" name="trainingProvided" checked={formik.values.trainingProvided} onChange={formik.handleChange} />
                Training Provided
              </label>
            </div>
            <div className="ch-form-field">
              <label className="ch-check-label">
                <input type="checkbox" name="warrantyRegistered" checked={formik.values.warrantyRegistered} onChange={formik.handleChange} />
                Warranty Registered
              </label>
            </div>
          </div>
        </div>

        {/* Section 4: Remarks */}
        <div className="ch-form-section">
          <div className="ch-section-header">
            <span className="ch-section-number">4</span>
            <h4>Remarks</h4>
          </div>
          <div className="ch-form-grid">
            <div className="ch-form-field ch-full-width">
              <textarea name="remarks" value={formik.values.remarks} onChange={formik.handleChange} placeholder="Enter any additional remarks" rows={3} maxLength={500} />
            </div>
          </div>
        </div>

        <div className="ch-form-page-footer">
          <button type="button" className="ch-btn ch-btn-cancel" onClick={() => setShowFormPage(false)} disabled={formik.isSubmitting}>Cancel</button>
          <button type="submit" className="ch-btn ch-btn-primary" disabled={formik.isSubmitting || !formik.isValid}>
            {formik.isSubmitting ? "Saving…" : editingRecord ? "Update Record" : "Create Record"}
          </button>
        </div>
      </form>
    </div>
  );

  /* ──────────────── VIEW MODAL ──────────────── */
  const renderViewModal = () => {
    if (!viewRecord) return null;
    const r = viewRecord;
    const status = getStatusInfo(r);
    return (
      <div className="vm-overlay">
        <div className="vm-view-modal">
          <div className="vm-modal-header">
            <div className="vm-modal-title"><h3>Commissioning Details - {r.id}</h3></div>
            <button className="vm-modal-close" onClick={() => setViewRecord(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="vm-view-body">
            <div className="ch-view-section">
              <h4>Project Information</h4>
              <div className="ch-view-grid">
                <div className="ch-view-item"><span className="ch-view-label">Record ID</span><span className="ch-view-value">{r.id}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Lead ID</span><span className="ch-view-value">{r.leadId}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Customer Name</span><span className="ch-view-value">{r.customerName || "—"}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Project Name</span><span className="ch-view-value">{r.projectName || "—"}</span></div>
              </div>
            </div>

            <div className="ch-view-section">
              <h4>Commissioning</h4>
              <div className="ch-view-grid">
                <div className="ch-view-item"><span className="ch-view-label">Commissioning Date</span><span className="ch-view-value">{r.commissioningDate || "—"}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Grid Connection</span><span className="ch-view-value">{r.gridConnected}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Net Meter Installed</span><span className="ch-view-value">{r.netMeterInstalled}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">DISCOM Approval</span><span className="ch-view-value">{r.discomApproval}</span></div>
              </div>
            </div>

            <div className="ch-view-section">
              <h4>Handover</h4>
              <div className="ch-view-grid">
                <div className="ch-view-item"><span className="ch-view-label">Handover Date</span><span className="ch-view-value">{r.handoverDate || "—"}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Customer Signed</span><span className="ch-view-value">{r.customerSigned}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Documents Delivered</span><span className="ch-view-value">{r.documentsDelivered}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Warranty Registered</span><span className="ch-view-value">{r.warrantyRegistered ? "Yes" : "No"}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Training Provided</span><span className="ch-view-value">{r.trainingProvided ? "Yes" : "No"}</span></div>
                <div className="ch-view-item"><span className="ch-view-label">Status</span><span className={`ch-badge ${status.className}`}>{status.label}</span></div>
              </div>
            </div>

            {r.remarks && (
              <div className="ch-view-section">
                <h4>Remarks</h4>
                <p className="ch-view-notes">{r.remarks}</p>
              </div>
            )}
          </div>
          <div className="vm-modal-footer">
            <button className="vm-btn-close-primary" onClick={() => setViewRecord(null)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  /* ──────────────── MAIN LIST ──────────────── */
  return (
    <div className="ch-page">
      {showFormPage ? renderFormPage() : (
        <>
          {/* Page Header */}
          <div className="ch-header">
            <div>
              <h1 className="ch-title">Commissioning &amp; Handover</h1>
              <p className="ch-subtitle">Track grid connection, net metering, DISCOM approval, customer handover and warranty registration.</p>
            </div>
            <div className="ch-header-actions">
              {canDo("commissioning", "create") && (
              <button className="ch-btn ch-btn-primary" onClick={() => openFormPage(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New Record
              </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="ch-stats-grid">
            <StatCard
              title="Total Records"
              value={stats.total.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
              color="blue"
            />
            <StatCard
              title="Commissioned"
              value={stats.commissioned.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
              color="green"
            />
            <StatCard
              title="Handed Over"
              value={stats.handedOver.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              color="teal"
            />
            <StatCard
              title="Pending"
              value={stats.pending.toLocaleString()}
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
              color="orange"
            />
          </div>

          {/* Toolbar */}
          <div className="ch-toolbar">
            <div className="ch-toolbar-row">
              <div className="ch-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" placeholder="Search by Record ID, Lead, Customer, or Project" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
                {search && (
                  <button className="ch-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              <Dropdown value={gridFilter} onChange={(val) => { setGridFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "Grid Status" }, ...GRID_STATUSES.map((s) => ({ value: s, label: s }))]} />
              <Dropdown value={discomFilter} onChange={(val) => { setDiscomFilter(val); setCurrentPage(1); }} options={[{ value: "All", label: "DISCOM Status" }, ...DISCOM_STATUSES.map((s) => ({ value: s, label: s }))]} />
            </div>
          </div>

          {/* Table */}
          <div className="ch-table-card">
            <div className="ch-table-wrapper">
              <table className="ch-table">
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Lead</th>
                    <th>Customer / Project</th>
                    <th>Grid</th>
                    <th>Net Meter</th>
                    <th>DISCOM</th>
                    <th>Handover</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableLoader colSpan={9} />
                  ) : records.length === 0 ? (
                    <TableEmptyState colSpan={9} title="No records found" subtitle="Try adjusting your search or filters." />
                  ) : (
                    records.map((r) => {
                      const status = getStatusInfo(r);
                      return (
                        <tr key={r._id || r.id}>
                          <td className="ch-td-id">{r.id}</td>
                          <td className="ch-td-nowrap">{r.leadId}</td>
                          <td className="ch-td-name">
                            <span className="ch-td-name-text">{r.customerName || "—"}</span>
                            {r.projectName && <div className="ch-td-sub">{r.projectName}</div>}
                          </td>
                          <td className="ch-td-nowrap">{r.gridConnected}</td>
                          <td className="ch-td-nowrap">{r.netMeterInstalled}</td>
                          <td className="ch-td-nowrap">{r.discomApproval}</td>
                          <td className="ch-td-nowrap">{r.customerSigned === "Signed" ? "✓ Signed" : "Pending"}</td>
                          <td><span className={`ch-badge ${status.className}`}>{status.label}</span></td>
                          <td>
                            <div className="act-actions">
                              <button className="act-btn act-view" title="View Details" onClick={() => openView(r)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <ActivityLogButton
                                module="commissioning"
                                onClick={() => {
                                  const recordId = r.serverId || r._id || r.id;
                                  navigate(`/admin/commissioning-activity/${recordId}`, {
                                    state: { target: { recordId: recordId, recordLabel: r.id || r.customerName || r.leadId, module: "commissioning" } },
                                  });
                                }}
                                title="View Commissioning Activity Log"
                              />
                              {canDo("commissioning", "edit") && (
                              <button className="act-btn act-edit" title="Edit Record" onClick={() => openFormPage(r)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              )}
                              {canDo("commissioning", "delete") && (
                              <button className="act-btn act-delete" title="Delete Record" onClick={() => confirmDelete(r)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

            {/* Pagination */}
            {serverTotal > 0 && (
              <div className="ch-pagination-row">
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

          {renderViewModal()}
        </>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Record"
        message={`Are you sure you want to delete record ${deleteTarget?.id}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
        loading={deleteLoading}
      />

      <ToastRenderer toast={toast} />
    </div>
  );
};

export default CommissioningAndHandover;
