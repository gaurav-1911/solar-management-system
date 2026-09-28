import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { Pagination, Dropdown, useToast } from "../../../components/common";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import StatCard from "../StatCard/StatCard";
import {
  billingInvoiceSchema,
  gstInvoiceSchema,
  creditNoteSchema,
  receiptSchema,
  clampNumberInput,
} from "../../../utils/AdminValidation";
import { invoiceAPI, receiptAPI, creditNoteAPI, gstInvoiceAPI, projectApprovalAPI, quotationAPI, projectProgressAPI, installationAPI } from "../../../services/api";
import { createProfilePdf, formatCurrencyPdf } from "../../../utils/pdfLayout";
import { fetchAllPages } from "../../../utils";
import { formatDate as formatDateHelper, formatCurrency as formatCurrencyHelper, sortById } from "../../../utils/helpers";
import { useAuth } from "../../../context/AuthContext";
import RecordActivityModal, { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../../common/GenericDetailActivityLog";
import "./Billing.css";

/* ──────────────────────────────────────────────
   Data Constants
   ────────────────────────────────────────────── */

const PAYMENT_STATUSES = ["Pending", "Partially Paid", "Paid"];

// eslint-disable-next-line no-unused-vars
const SORT_FIELDS = [
  { id: "invoiceNumber", label: "Invoice Number" },
  { id: "customerName", label: "Customer Name" },
  { id: "invoiceDate", label: "Invoice Date" },
  { id: "totalAmount", label: "Total Amount" },
  { id: "paymentStatus", label: "Payment Status" },
];

const GST_RATES = [5, 12, 18, 28];

const PAYMENT_METHODS = ["Bank Transfer", "UPI", "Cheque", "Cash", "Card", "NEFT", "RTGS"];

// eslint-disable-next-line no-unused-vars
const initialInvoiceForm = {
  invoiceNumber: "",
  invoiceDate: "",
  customerName: "",
  customerId: "",
  projectName: "",
  invoiceAmount: "",
  taxAmount: "",
  totalAmount: "",
  paymentStatus: "Pending",
  notes: "",
};


// eslint-disable-next-line no-unused-vars
const initialCreditNoteForm = {
  creditNoteNumber: "",
  invoiceNumber: "",
  creditAmount: "",
  reason: "",
};

// eslint-disable-next-line no-unused-vars
const initialReceiptForm = {
  receiptNumber: "",
  invoiceNumber: "",
  paymentDate: "",
  paymentAmount: "",
  paymentMethod: "Bank Transfer",
};


/* ──────────────────────────────────────────────
   API Integration Helpers
   ────────────────────────────────────────────── */

// Use imported helpers directly: formatDateHelper, formatCurrencyHelper
// Re-alias for backwards compatibility within the component
const formatDate = (iso) => {
  if (!iso) return "\u2014";
  return formatDateHelper(iso);
};
const formatCurrency = formatCurrencyHelper;

const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "gst-invoice", label: "GST Invoice" },
  { key: "credit-notes", label: "Credit Notes" },
  { key: "receipts", label: "Receipts" },
  { key: "due-payments", label: "Due Payments" },
];

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getStatusClass(status) {
  switch (status) {
    case "Paid": return "bm-badge-success";
    case "Partially Paid": return "bm-badge-warning";
    case "Pending": return "bm-badge-pending";
    default: return "";
  }
}

function getStatusIcon(status) {
  switch (status) {
    case "Paid": return "✓";
    case "Partially Paid": return "◐";
    case "Pending": return "○";
    default: return "";
  }
}

function generateId(arr, prefix) {
  // Backend records carry `_id`; the human-readable number lives in the
  // module-specific field (invoiceNumber / creditNoteNumber / receiptNumber).
  // Extract the trailing numeric suffix (e.g. "INV-2026-004" → 4) and
  // increment the largest one so new records never collide with already-saved
  // numbers (duplicate-key 500s). The suffix is matched with a regex so the
  // leading dash is never parsed as a negative sign.
  const maxNum = arr.reduce((max, item) => {
    const candidate =
      item.invoiceNumber || item.creditNoteNumber || item.receiptNumber || "";
    const match =
      typeof candidate === "string" ? candidate.match(/-(\d+)\s*$/) : null;
    const num = match ? parseInt(match[1], 10) || 0 : 0;
    return Math.max(max, num);
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

// A payment/credit applies to an invoice only when BOTH the invoice number
// AND the customer name match — matching by number alone would let a receipt
// raised for one customer reduce another customer's outstanding balance.
function matchesInvoice(record, inv) {
  if (!record || !inv) return false;
  if (record.invoiceNumber !== inv.invoiceNumber) return false;
  const a = String(record.customerName || '').trim().toLowerCase();
  const b = String(inv.customerName || '').trim().toLowerCase();
  return a === b || (!a && !b);
}

// Money received (receipts) and adjusted (credit notes) against an invoice
// reduce what the customer still owes:
//   outstanding = totalAmount − receipts − credit notes
// An optional exclude id keeps the cap accurate while editing the record
// itself (the record's own amount is still applied to the invoice).
function getInvoiceOutstanding(inv, { receipts = [], creditNotes = [], excludeReceiptId, excludeCreditNoteId } = {}) {
  if (!inv) return 0;
  const paid = receipts
    .filter((r) => matchesInvoice(r, inv) && r._id !== excludeReceiptId)
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
  const credited = creditNotes
    .filter((c) => matchesInvoice(c, inv) && c._id !== excludeCreditNoteId)
    .reduce((sum, c) => sum + (Number(c.creditAmount) || 0), 0);
  return Math.max(0, (Number(inv.totalAmount) || 0) - paid - credited);
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */

export default function BillingInvoicing() {
  const { success: showToast } = useToast();
  const { canDo } = useAuth();
  const [activeTab, setActiveTab] = useState("invoices");

  // Data states
  const [invoices, setInvoices] = useState([]);
  const [gstInvoices, setGstInvoices] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [receipts, setReceipts] = useState([]);
  // Due Payments are derived from the invoices that still have money owed —
  // outstanding = total − receipts − credit notes — so the list always stays
  // in sync with receipts and credit notes (no manual entries).
  const duePayments = useMemo(() => invoices
    .map((inv) => {
      const paid = receipts
        .filter((r) => matchesInvoice(r, inv))
        .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
      const credited = creditNotes
        .filter((c) => matchesInvoice(c, inv))
        .reduce((sum, c) => sum + (Number(c.creditAmount) || 0), 0);
      const outstanding = Math.max(0, (Number(inv.totalAmount) || 0) - paid - credited);
      // Derive the status honestly from real money, not the invoice's possibly
      // stale manual status (e.g. an invoice marked Paid with no receipt).
      const paymentStatus = outstanding <= 0
        ? "Paid"
        : (paid > 0 || credited > 0 ? "Partially Paid" : "Pending");
      // Use the invoice's own due date when set, otherwise fall back to
      // Net-30 terms from the invoice date.
      const due = inv.dueDate
        ? String(inv.dueDate).slice(0, 10)
        : inv.invoiceDate
          ? new Date(new Date(inv.invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : "";
      return {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        invoiceDate: inv.invoiceDate,
        dueDate: due,
        outstandingAmount: outstanding,
        paymentStatus,
        totalAmount: inv.totalAmount,
        _id: inv._id,
      };
    })
    .filter((d) => d.outstandingAmount > 0),
  [invoices, receipts, creditNotes]);
  const [serverTotals, setServerTotals] = useState({ invoices: 0, creditNotes: 0, receipts: 0, gstInvoices: 0 });
  // eslint-disable-next-line no-unused-vars
  const [fetchLoading, setFetchLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // Projects (and their customer details) come from the Project Approval module
  // so the invoice form can pull customerName / customerId / invoice amount.
  const [approvalProjects, setApprovalProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Final price comes from the project's Approved Quotation grandTotal — the
  // Project Approval estimatedCost is only a design-stage estimate.
  const [approvedQuotations, setApprovedQuotations] = useState([]);
  // Actual spend + GST come from the Project Progress module: the invoice
  // amount is the project's Actual Project Cost and the tax amount is the GST
  // applied on that cost there (gstAmount).
  const [progressProjects, setProgressProjects] = useState([]);
  // Installations — used to calculate remaining products cost for the bill.
  const [installations, setInstallations] = useState([]);

  // ── Fetch functions ──
  const fetchApprovalProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await projectApprovalAPI.getAll({ page: 1, limit: 500 });
      const list = res.data?.data || [];
      // Only Approved projects are billable; keep the last record per project
      // name — one project can have multiple approval rows (status changes).
      setApprovalProjects([...new Map(list
        .filter((p) => p.status === "Approved" && p.projectName)
        .map((p) => [p.projectName, p])
      ).values()]);
    } catch (err) {
      console.error("Fetch project approvals error:", err);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const fetchApprovedQuotations = useCallback(async () => {
    try {
      const res = await quotationAPI.getAll({ page: 1, limit: 500 });
      const list = res.data?.data || [];
      // Only Approved quotations carry the final price the customer agreed to.
      setApprovedQuotations(list.filter((q) => q.status === "Approved" && q.grandTotal != null));
    } catch (err) {
      console.error("Fetch approved quotations error:", err);
    }
  }, []);

  // Project Progress records carry the actual project cost and the GST applied
  // on it — the source for the invoice's taxable amount and tax amount.
  const fetchProgressProjects = useCallback(async () => {
    try {
      const res = await projectProgressAPI.getAll({ page: 1, limit: 500 });
      const list = res.data?.data || [];
      setProgressProjects(list);
    } catch (err) {
      console.error("Fetch project progress error:", err);
    }
  }, []);

  // Installations carry material data — used to calculate remaining products
  // cost that should be included in the bill.
  const fetchInstallations = useCallback(async () => {
    try {
      const res = await installationAPI.getAll({ page: 1, limit: 500 });
      setInstallations(res.data?.data || []);
    } catch (err) {
      console.error("Fetch installations error:", err);
    }
  }, []);
  // Fetch EVERY invoice (page-loop, no 500-record ceiling) — the credit-note /
  // receipt / GST dropdowns and the tabs paginate client-side over the list.
  const fetchInvoices = useCallback(async () => {
    setFetchLoading(true);
    try {
      const docs = await fetchAllPages(invoiceAPI.getAll);
      setInvoices(docs);
      setServerTotals(prev => ({ ...prev, invoices: docs.length }));
    } catch (err) {
      console.error("Fetch invoices error:", err);
      showToast(err.response?.data?.message || "Failed to fetch invoices");
    } finally {
      setFetchLoading(false);
    }
  }, [showToast]);

  const fetchCreditNotes = useCallback(async () => {
    try {
      const docs = await fetchAllPages(creditNoteAPI.getAll);
      setCreditNotes(docs);
      setServerTotals(prev => ({ ...prev, creditNotes: docs.length }));
    } catch (err) {
      console.error("Fetch credit notes error:", err);
    }
  }, []);

  const fetchReceipts = useCallback(async () => {
    try {
      const docs = await fetchAllPages(receiptAPI.getAll);
      setReceipts(docs);
      setServerTotals(prev => ({ ...prev, receipts: docs.length }));
    } catch (err) {
      console.error("Fetch receipts error:", err);
    }
  }, []);

  const fetchGstInvoices = useCallback(async () => {
    try {
      const docs = await fetchAllPages(gstInvoiceAPI.getAll);
      setGstInvoices(docs);
      setServerTotals(prev => ({ ...prev, gstInvoices: docs.length }));
    } catch (err) {
      console.error("Fetch GST invoices error:", err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchInvoices();
    fetchGstInvoices();
    fetchCreditNotes();
    fetchReceipts();
    fetchApprovalProjects();
    fetchApprovedQuotations();
    fetchProgressProjects();
    fetchInstallations();
  }, [fetchInvoices, fetchGstInvoices, fetchCreditNotes, fetchReceipts, fetchApprovalProjects, fetchApprovedQuotations, fetchProgressProjects, fetchInstallations]);

  // Pagination states
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(10);
  const [gstPage, setGstPage] = useState(1);
  const [gstPageSize, setGstPageSize] = useState(10);
  const [cnPage, setCnPage] = useState(1);
  const [cnPageSize, setCnPageSize] = useState(10);
  const [rcpPage, setRcpPage] = useState(1);
  const [rcpPageSize, setRcpPageSize] = useState(10);
  const [dpPage, setDpPage] = useState(1);
  const [dpPageSize, setDpPageSize] = useState(10);

  // Search states
  const [invSearch, setInvSearch] = useState("");
  const [gstSearch, setGstSearch] = useState("");
  const [cnSearch, setCnSearch] = useState("");
  const [rcpSearch, setRcpSearch] = useState("");
  const [dpSearch, setDpSearch] = useState("");

  // Filter states
  const [invStatusFilter, setInvStatusFilter] = useState("All");
  const [invDateFrom, setInvDateFrom] = useState("");
  const [invDateTo, setInvDateTo] = useState("");
  const [gstRateFilter, setGstRateFilter] = useState("All");
  const [cnInvoiceFilter, setCnInvoiceFilter] = useState("All");
  const [rcpMethodFilter, setRcpMethodFilter] = useState("All");
  const [dpStatusFilter, setDpStatusFilter] = useState("All");
  const [dpDueDateFrom, setDpDueDateFrom] = useState("");
  const [dpDueDateTo, setDpDueDateTo] = useState("");

  // Modal states
  const [showInvFormPage, setShowInvFormPage] = useState(false);
  const [editingInv, setEditingInv] = useState(null);
  const invFormik = useFormik({
    initialValues: {
      invoiceDate: editingInv?.invoiceDate || new Date().toISOString().split("T")[0],
      customerName: editingInv?.customerName || "",
      customerId: editingInv?.customerId || "",
      projectName: editingInv?.projectName || "",
      invoiceAmount: editingInv?.invoiceAmount?.toString() || "",
      taxAmount: editingInv?.taxAmount?.toString() || "",
      paymentStatus: editingInv?.paymentStatus || "Pending",
      notes: editingInv?.notes || "",
    },
    validationSchema: billingInvoiceSchema,
    enableReinitialize: true,
    onSubmit: async (values, { resetForm }) => {
      setLoading(true);
      try {
        const payload = {
          invoiceNumber: editingInv?.invoiceNumber || generateId(invoices, "INV-2026"),
          invoiceDate: values.invoiceDate,
          customerName: values.customerName.trim(),
          customerId: values.customerId.trim() || `C-${String(invoices.length + 1).padStart(3, "0")}`,
          projectName: values.projectName.trim(),
          invoiceAmount: parseFloat(values.invoiceAmount),
          taxAmount: parseFloat(values.taxAmount),
          totalAmount: parseFloat(values.invoiceAmount) + parseFloat(values.taxAmount),
          paymentStatus: values.paymentStatus,
          notes: values.notes.trim(),
        };
        if (editingInv) {
          const response = await invoiceAPI.update(editingInv._id, payload);
          if (response.data.success) {
            showToast(`Invoice ${response.data.data?.invoiceNumber || payload.invoiceNumber} updated successfully`);
            fetchInvoices();
          }
        } else {
          const response = await invoiceAPI.create(payload);
          if (response.data.success) {
            // Use the server-assigned number — it may have been auto-generated
            // if the submitted one was already taken.
            showToast(`Invoice ${response.data.data?.invoiceNumber || payload.invoiceNumber} created successfully`);
            fetchInvoices();
          }
        }
        setShowInvFormPage(false);
        setEditingInv(null);
        resetForm();
      } catch (err) {
        console.error("Save invoice error:", err);
        showToast(err.response?.data?.message || "Failed to save invoice");
      } finally {
        setLoading(false);
      }
    },
  });

  const [showGstForm, setShowGstForm] = useState(false);
  const [editingGst, setEditingGst] = useState(null);

  const [showCnForm, setShowCnForm] = useState(false);
  const [editingCn, setEditingCn] = useState(null);

  const [showRcpForm, setShowRcpForm] = useState(false);
  const [editingRcp, setEditingRcp] = useState(null);

  const [viewInvoice, setViewInvoice] = useState(null);
  const [viewGst, setViewGst] = useState(null);
  const [viewCn, setViewCn] = useState(null);
  const [viewRcp, setViewRcp] = useState(null);
  const [viewDp, setViewDp] = useState(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [showLogModal, setShowLogModal] = useState(null);


  // Toast

  // Lock scroll when overlay is open
  const anyModalOpen = showGstForm || showCnForm || showRcpForm || viewInvoice || viewGst || viewCn || viewRcp || viewDp || !!deleteTarget;
  useEffect(() => {
    const content = document.querySelector('.dashboard-content');
    if (!content) return;
    content.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { content.style.overflow = ''; };
  }, [anyModalOpen]);

  /* ────────── Stats ────────── */
  const stats = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    // Outstanding = total − receipts − credit notes (real money still owed).
    const outstanding = invoices.reduce((sum, inv) => sum + getInvoiceOutstanding(inv, { receipts, creditNotes }), 0);
    const paidCount = invoices.filter((i) => i.paymentStatus === "Paid").length;
    const overdueCount = duePayments.length;
    const creditNoteCount = creditNotes.length;
    return { totalInvoiced, outstanding, paidCount, overdueCount, creditNoteCount };
  }, [invoices, duePayments, creditNotes, receipts]);

  /* ────────── Invoice Handlers ────────── */
  const openInvForm = (invoice = null) => {
    setEditingInv(invoice ? { ...invoice } : null);
    setShowInvFormPage(true);
  };

  // Completed project names — used to filter which projects appear in the invoice dropdown.
  const completedProjects = useMemo(() => {
    return new Set(
      installations
        .filter((inst) => inst.installationStatus === "Completed")
        .map((inst) => inst.projectName)
        .filter(Boolean)
    );
  }, [installations]);

  // Project dropdown options — only completed projects that don't already have an invoice.
  const projectSelectOptions = useMemo(() => {
    const invoicedProjects = new Set(invoices.map((inv) => inv.projectName).filter(Boolean));
    return [
      { value: "", label: "Select Project" },
      ...approvalProjects
        .filter((p) => completedProjects.has(p.projectName) && !invoicedProjects.has(p.projectName))
        .map((p) => ({ value: p.projectName, label: p.projectName })),
    ];
  }, [approvalProjects, completedProjects, invoices]);

  // When a project is chosen, auto-fill its customer name, customer ID,
  // invoice amount and tax amount. The invoice amount is the project's Actual
  // Project Cost and the tax amount the GST applied on it, both from the
  // Project Progress module. Falls back to the Approved Quotation (total +
  // GST) and finally to the approval's estimatedCost (no GST) when no Project
  // Progress record exists yet.
  // Calculate remaining (unused) products cost from an installation's materials.
  // Remaining = quotedQty − quantity used; only materials with a positive
  // remainder count toward the cost.
  const calcRemainingProductsCost = useCallback((install) => {
    if (!install || !Array.isArray(install.materials)) return 0;
    return install.materials.reduce((sum, m) => {
      const quoted = Number(m.quotedQty || 0);
      const used = Number(m.quantity || 0);
      const price = Number(m.price || 0);
      const remaining = quoted - used;
      if (remaining > 0 && price > 0) return sum + remaining * price;
      return sum;
    }, 0);
  }, []);

  const handleProjectSelect = (projectName) => {
    invFormik.setFieldValue("projectName", projectName);
    const proj = approvalProjects.find((p) => p.projectName === projectName);
    if (proj) {
      invFormik.setFieldValue("customerName", proj.customerName || "");
      invFormik.setFieldValue("customerId", proj.customerId || "");

      // Find the installation for this project (by projectName or leadId match)
      const install = installations.find(
        (i) => i.projectName === projectName || i.leadId === proj.leadId
      );
      const remainingCost = calcRemainingProductsCost(install);

      const progress = progressProjects
        .filter((p) => p.projectName === projectName)
        .sort((a, b) =>
          Number(b.customerName === proj.customerName) -
          Number(a.customerName === proj.customerName)
        )[0];

      // Invoice Amount = Approved Quotation Total − Remaining Products Cost.
      // Remaining products are items quoted but not used during installation;
      // the customer should only pay for what was actually used.
      // Falls back to the Project Progress actual cost and finally to the
      // approval's estimatedCost when no record exists.
      const GST_RATE = 0.18;
      if (progress) {
        const base = Number(progress.actualProjectCost) || 0;
        const final = Math.max(0, base - remainingCost);
        const gst = Math.round(final * GST_RATE);
        invFormik.setFieldValue("invoiceAmount", String(final));
        invFormik.setFieldValue("taxAmount", String(gst));
      } else {
        const quote = approvedQuotations.find((q) => q.projectName === projectName);
        if (quote) {
          const base = Number(quote.total) || 0;
          const final = Math.max(0, base - remainingCost);
          const gst = Math.round(final * GST_RATE);
          invFormik.setFieldValue("invoiceAmount", String(final));
          invFormik.setFieldValue("taxAmount", String(gst));
        } else {
          const base = Number(proj.estimatedCost) || 0;
          const final = Math.max(0, base - remainingCost);
          invFormik.setFieldValue("invoiceAmount", String(final));
          invFormik.setFieldValue("taxAmount", "");
        }
      }
    }
  };

  /* ────────── GST Invoice Handlers ────────── */
  const openGstForm = (gst = null) => {
    setEditingGst(gst ? { ...gst } : null);
    setShowGstForm(true);
  };

  const handleGstSubmit = async (values) => {
    setLoading(true);
    try {
      const invoice = invoices.find((inv) => inv.invoiceNumber === values.invoiceNumber);
      const payload = {
        invoiceNumber: values.invoiceNumber,
        gstNumber: values.gstNumber.trim(),
        gstPercentage: 18, // Fixed at 18% — editable field commented out
        taxableAmount: parseFloat(values.taxableAmount),
        gstAmount: Math.round(parseFloat(values.taxableAmount) * 18 / 100),
        customerName: invoice ? invoice.customerName : "—",
      };
      if (editingGst) {
        const response = await gstInvoiceAPI.update(editingGst._id, payload);
        if (response.data.success) {
          showToast(`GST Invoice ${payload.invoiceNumber} updated successfully`);
          fetchGstInvoices();
        }
      } else {
        const response = await gstInvoiceAPI.create(payload);
        if (response.data.success) {
          // Jump back to page 1 so the newly generated invoice is visible.
          setGstPage(1);
          showToast(`GST Invoice for ${payload.invoiceNumber} generated successfully`);
          fetchGstInvoices();
        }
      }
      setShowGstForm(false);
      setEditingGst(null);
    } catch (err) {
      console.error("Save GST invoice error:", err);
      showToast(err.response?.data?.message || "Failed to save GST invoice");
    } finally {
      setLoading(false);
    }
  };

  /* ────────── Credit Note Handlers ────────── */
  const openCnForm = (cn = null) => {
    setEditingCn(cn ? { ...cn } : null);
    setShowCnForm(true);
  };

  const handleCnSubmit = async (values) => {
    setLoading(true);
    try {
      const invoice = invoices.find((inv) => inv.invoiceNumber === values.invoiceNumber);
      const payload = {
        creditNoteNumber: values.creditNoteNumber,
        invoiceNumber: values.invoiceNumber,
        creditAmount: parseFloat(values.creditAmount),
        reason: values.reason.trim(),
        date: new Date().toISOString().split("T")[0],
        customerName: invoice ? invoice.customerName : "—",
      };
      if (editingCn) {
        const response = await creditNoteAPI.update(editingCn._id, payload);
        if (response.data.success) {
          showToast(`Credit Note ${payload.creditNoteNumber} updated successfully`);
          fetchCreditNotes();
          fetchInvoices();
        }
      } else {
        const response = await creditNoteAPI.create(payload);
        if (response.data.success) {
          showToast(`Credit Note ${payload.creditNoteNumber} created successfully`);
          fetchCreditNotes();
          fetchInvoices();
        }
      }
      setShowCnForm(false);
      setEditingCn(null);
    } catch (err) {
      console.error("Save credit note error:", err);
      showToast(err.response?.data?.message || "Failed to save credit note");
    } finally {
      setLoading(false);
    }
  };

  /* ────────── Receipt Handlers ────────── */
  const openRcpForm = (rcp = null) => {
    setEditingRcp(rcp ? { ...rcp } : null);
    setShowRcpForm(true);
  };

  const handleRcpSubmit = async (values) => {
    setLoading(true);
    try {
      const invoice = invoices.find((inv) => inv.invoiceNumber === values.invoiceNumber);
      const payload = {
        receiptNumber: values.receiptNumber,
        invoiceNumber: values.invoiceNumber,
        paymentDate: values.paymentDate,
        paymentAmount: parseFloat(values.paymentAmount),
        paymentMethod: values.paymentMethod,
        customerName: invoice ? invoice.customerName : "—",
      };
      if (editingRcp) {
        const response = await receiptAPI.update(editingRcp._id, payload);
        if (response.data.success) {
          showToast(`Receipt ${payload.receiptNumber} updated successfully`);
          fetchReceipts();
          fetchInvoices();
        }
      } else {
        const response = await receiptAPI.create(payload);
        if (response.data.success) {
          showToast(`Receipt ${payload.receiptNumber} generated successfully`);
          fetchReceipts();
          fetchInvoices();
        }
      }
      setShowRcpForm(false);
      setEditingRcp(null);
    } catch (err) {
      console.error("Save receipt error:", err);
      showToast(err.response?.data?.message || "Failed to save receipt");
    } finally {
      setLoading(false);
    }
  };

  /* ────────── Due Payment Handlers ────────── */
  // Due payments are derived from the invoices that still have an
  // outstanding balance, so there is nothing to add/edit/delete manually.
  // "Mark as Paid" creates a receipt for the full outstanding amount — the
  // receipt (and the invoice status) then update automatically everywhere.
  const handleMarkAsPaid = async (dp) => {
    setLoading(true);
    try {
      const invoice = invoices.find((i) => i.invoiceNumber === dp.invoiceNumber);
      const payload = {
        receiptNumber: generateId(receipts, "RCP-2026"),
        invoiceNumber: dp.invoiceNumber,
        paymentDate: new Date().toISOString().split("T")[0],
        paymentAmount: dp.outstandingAmount,
        paymentMethod: "Bank Transfer",
        customerName: invoice ? invoice.customerName : dp.customerName,
      };
      const response = await receiptAPI.create(payload);
      if (response.data.success) {
        showToast(`Receipt ${response.data.data?.receiptNumber || payload.receiptNumber} created — ${dp.invoiceNumber} marked as paid`);
        fetchReceipts();
        fetchInvoices();
      }
    } catch (err) {
      console.error("Mark as paid error:", err);
      showToast(err.response?.data?.message || "Failed to mark as paid");
    } finally {
      setLoading(false);
    }
  };

  // Change the due date straight from the Due Payments list — the date is
  // stored on the invoice and the derived list recalculates right away.
  const handleDueDateChange = async (dp, date) => {
    if (!dp?._id) return;
    setLoading(true);
    try {
      // Empty date clears the override — the list falls back to the default
      // (invoice date + 30 days).
      const response = await invoiceAPI.update(dp._id, { dueDate: date || null });
      if (response.data.success) {
        showToast(date ? `Due date for ${dp.invoiceNumber} updated` : `Due date for ${dp.invoiceNumber} cleared`);
        fetchInvoices();
      }
    } catch (err) {
      console.error("Update due date error:", err);
      showToast(err.response?.data?.message || "Failed to update due date");
    } finally {
      setLoading(false);
    }
  };

  /* ────────── Delete Handler ────────── */
  const confirmDelete = (item, type) => {
    setDeleteTarget(item);
    setDeleteType(type);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      let response;
      switch (deleteType) {
        case "invoice":
          response = await invoiceAPI.delete(deleteTarget._id);
          if (response.data.success) {
            showToast(`Invoice ${deleteTarget.invoiceNumber} deleted`);
            fetchInvoices();
          }
          break;
        case "gst":
          response = await gstInvoiceAPI.delete(deleteTarget._id);
          if (response.data.success) {
            showToast(`GST Invoice for ${deleteTarget.invoiceNumber} deleted`);
            fetchGstInvoices();
          }
          break;
        case "credit-note":
          response = await creditNoteAPI.delete(deleteTarget._id);
          if (response.data.success) {
            showToast(`Credit Note ${deleteTarget.creditNoteNumber} deleted`);
            fetchCreditNotes();
            fetchInvoices();
          }
          break;
        case "receipt":
          response = await receiptAPI.delete(deleteTarget._id);
          if (response.data.success) {
            showToast(`Receipt ${deleteTarget.receiptNumber} deleted`);
            fetchReceipts();
            fetchInvoices();
          }
          break;
        default: break;
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.response?.data?.message || "Failed to delete record");
    } finally {
      setLoading(false);
      setDeleteTarget(null);
      setDeleteType(null);
    }
  };

  /* ────────── Invoice Form Page ────────── */
  const renderInvFormPage = () => (
    <div className="bm-form-page">
      <div className="bm-form-page-header">
        <button className="bm-btn bm-back-btn" onClick={() => { setShowInvFormPage(false); setEditingInv(null); invFormik.resetForm(); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Invoices
        </button>
        <h2>{editingInv ? `Edit Invoice ${editingInv.invoiceNumber}` : "Create Invoice"}</h2>
      </div>

      <form onSubmit={invFormik.handleSubmit} className="bm-form-page-body" noValidate>
        {/* Section 1: Invoice Information */}
        <div className="bm-form-section">
          <div className="bm-section-header">
            <span className="bm-section-number">1</span>
            <h4>Invoice Information</h4>
          </div>
          <div className="bm-form-grid">
            <div className="bm-form-field bm-full-width">
              <label>Project Name</label>
              <Dropdown
                value={invFormik.values.projectName}
                onChange={handleProjectSelect}
                options={projectSelectOptions}
                variant="form"
                placeholder={projectsLoading ? "Loading projects..." : "Select Project"}
                emptyMessage="No projects found in Project Approval"
              />
              <span className="bm-field-hint">Customer, taxable amount and GST auto-fill from the project's Actual Budget (Project Progress).</span>
            </div>
            <div className="bm-form-field">
              <label>Invoice Number</label>
              <input type="text" value={editingInv?.invoiceNumber || generateId(invoices, "INV-2026")} readOnly className="bm-field-readonly" />
            </div>
            <div className="bm-form-field">
              <label>Invoice Date <span className="bm-required">*</span></label>
              <input type="date" name="invoiceDate" value={invFormik.values.invoiceDate} onChange={invFormik.handleChange} onBlur={invFormik.handleBlur} min={todayISO()} />
              {invFormik.touched.invoiceDate && invFormik.errors.invoiceDate && <span className="bm-field-error">{invFormik.errors.invoiceDate}</span>}
            </div>
            <div className="bm-form-field">
              <label>Customer Name <span className="bm-required">*</span></label>
              <input type="text" name="customerName" value={invFormik.values.customerName} readOnly className="bm-field-readonly" placeholder="Auto-filled from selected project" />
              {invFormik.touched.customerName && invFormik.errors.customerName && <span className="bm-field-error">{invFormik.errors.customerName}</span>}
            </div>
            <div className="bm-form-field">
              <label>Customer ID</label>
              <input type="text" name="customerId" value={invFormik.values.customerId} readOnly className="bm-field-readonly" placeholder="Auto-filled from selected project" />
            </div>
          </div>
        </div>

        {/* Section 2: Amount Details */}
        <div className="bm-form-section">
          <div className="bm-section-header">
            <span className="bm-section-number">2</span>
            <h4>Amount Details</h4>
          </div>
          <div className="bm-form-grid">
            <div className="bm-form-field">
              <label>Invoice Amount (₹) <span className="bm-required">*</span></label>
              <input type="number" name="invoiceAmount" value={invFormik.values.invoiceAmount} onChange={clampNumberInput(invFormik, 10000000000)} onBlur={invFormik.handleBlur} placeholder="e.g. 245000" min="0" />
              {invFormik.touched.invoiceAmount && invFormik.errors.invoiceAmount && <span className="bm-field-error">{invFormik.errors.invoiceAmount}</span>}
            </div>
            <div className="bm-form-field">
              <label>Tax Amount₹ (GST) <span className="bm-required">*</span></label>
              <input type="number" name="taxAmount" value={invFormik.values.taxAmount} onChange={clampNumberInput(invFormik, 10000000000)} onBlur={invFormik.handleBlur} placeholder="e.g. 44100" min="0" />
              {invFormik.touched.taxAmount && invFormik.errors.taxAmount && <span className="bm-field-error">{invFormik.errors.taxAmount}</span>}
            </div>
            <div className="bm-form-field">
              <label>Total Amount (₹)</label>
              <div className="bm-calculated-field">
                <span className="bm-calculated-value">
                  {formatCurrency((parseFloat(invFormik.values.invoiceAmount) || 0) + (parseFloat(invFormik.values.taxAmount) || 0))}
                </span>
              </div>
            </div>
            <div className="bm-form-field">
              <label>Payment Status</label>
              <Dropdown
                value={invFormik.values.paymentStatus}
                onChange={(val) => invFormik.setFieldValue("paymentStatus", val)}
                options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
                variant="form"
                placeholder="Select status"
              />
            </div>
            <div className="bm-form-field bm-full-width">
              <label>Notes</label>
              <textarea name="notes" value={invFormik.values.notes} onChange={invFormik.handleChange} placeholder="Enter any notes..." rows={2} />
            </div>
          </div>
        </div>

        <div className="bm-form-page-footer">
          <button type="button" className="bm-btn bm-btn-cancel" onClick={() => { setShowInvFormPage(false); setEditingInv(null); invFormik.resetForm(); }}>Cancel</button>
          <button type="submit" className="bm-btn bm-btn-primary">{editingInv ? "Update Invoice" : "Create Invoice"}</button>
        </div>
      </form>
    </div>
  );

  /* ────────── Receipt Download ────────── */
  const downloadReceipt = async (rcp) => {
    const doc = await createProfilePdf({
      bannerName: rcp.customerName,
      bannerSubtitle: `Receipt: ${rcp.receiptNumber}`,
      bannerRight: [`Invoice: ${rcp.invoiceNumber}`],
      sections: [
        {
          title: "Payment Details",
          fields: [
            ["Receipt Number", rcp.receiptNumber],
            ["Invoice Number", rcp.invoiceNumber],
            ["Customer", rcp.customerName],
            ["Payment Date", formatDate(rcp.paymentDate)],
            ["Payment Amount", formatCurrencyPdf(rcp.paymentAmount)],
            ["Payment Method", rcp.paymentMethod],
          ],
        },
      ],
    });

    doc.save(`Receipt_${rcp.receiptNumber}.pdf`);
    showToast(`Receipt ${rcp.receiptNumber} downloaded`);
  };

  /* ────────── Filter Count ────────── */
  /* ────────── Filter Counts per Tab ────────── */
  // eslint-disable-next-line no-unused-vars
  const getInvFilterCount = useCallback(() => {
    let count = 0;
    if (invStatusFilter !== "All") count++;
    if (invDateFrom) count++;
    if (invDateTo) count++;
    return count;
  }, [invStatusFilter, invDateFrom, invDateTo]);

  // eslint-disable-next-line no-unused-vars
  const getGstFilterCount = useCallback(() => {
    let count = 0;
    if (gstRateFilter !== "All") count++;
    return count;
  }, [gstRateFilter]);

  // eslint-disable-next-line no-unused-vars
  const getCnFilterCount = useCallback(() => {
    let count = 0;
    if (cnInvoiceFilter !== "All") count++;
    return count;
  }, [cnInvoiceFilter]);

  // eslint-disable-next-line no-unused-vars
  const getRcpFilterCount = useCallback(() => {
    let count = 0;
    if (rcpMethodFilter !== "All") count++;
    return count;
  }, [rcpMethodFilter]);

  // eslint-disable-next-line no-unused-vars
  const getDpFilterCount = useCallback(() => {
    let count = 0;
    if (dpStatusFilter !== "All") count++;
    if (dpDueDateFrom) count++;
    if (dpDueDateTo) count++;
    return count;
  }, [dpStatusFilter, dpDueDateFrom, dpDueDateTo]);

  // eslint-disable-next-line no-unused-vars
  const clearInvoiceFilters = () => {
    setInvStatusFilter("All");
    setInvDateFrom("");
    setInvDateTo("");
  };

  // eslint-disable-next-line no-unused-vars
  const clearGstFilters = () => {
    setGstRateFilter("All");
  };

  // eslint-disable-next-line no-unused-vars
  const clearCnFilters = () => {
    setCnInvoiceFilter("All");
  };

  // eslint-disable-next-line no-unused-vars
  const clearRcpFilters = () => {
    setRcpMethodFilter("All");
  };

  // eslint-disable-next-line no-unused-vars
  const clearDpFilters = () => {
    setDpStatusFilter("All");
    setDpDueDateFrom("");
    setDpDueDateTo("");
  };

  /* ──────────────────────────────────────────────
     Render
     ────────────────────────────────────────────── */
  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="billing-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="bm-page">


      {showInvFormPage ? renderInvFormPage() : (
        <>
      {/* Header */}
      <div className="bm-header">
        <div>
          <h1 className="bm-title">Billing &amp; Invoicing</h1>
          <p className="bm-subtitle">Manage invoices, GST billing, credit notes, receipts, and track due payments.</p>
        </div>
        <div className="bm-header-actions">
          {activeTab === "invoices" && canDo("billing", "create") && (
            <button className="bm-btn bm-btn-primary" onClick={() => openInvForm(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Create Invoice
            </button>
          )}
          {activeTab === "gst-invoice" && canDo("billing", "create") && (
            <button className="bm-btn bm-btn-primary" onClick={() => openGstForm(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Generate GST Invoice
            </button>
          )}
          {activeTab === "credit-notes" && canDo("billing", "create") && (
            <button className="bm-btn bm-btn-primary" onClick={() => openCnForm(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Create Credit Note
            </button>
          )}
          {activeTab === "receipts" && canDo("billing", "create") && (
            <button className="bm-btn bm-btn-primary" onClick={() => openRcpForm(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Generate Receipt
            </button>
          )}

        </div>
      </div>

      {/* Stats (4 Cards in 1 Row) */}
      <section className="billing-stats-grid" aria-label="Billing overview">
        <StatCard
          title="Total Invoiced"
          value={formatCurrency(stats.totalInvoiced)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="blue"
        />
        <StatCard
          title="Outstanding"
          value={formatCurrency(stats.outstanding)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4.5 4.5 0 0 0 0-9" /></svg>}
          color="orange"
        />
        <StatCard
          title="Paid Invoices"
          value={stats.paidCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          color="green"
        />
        <StatCard
          title="Overdue Invoices"
          value={stats.overdueCount.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="red"
        />
      </section>

      {/* Tabs */}
      <nav className="bm-tabs" role="tablist" aria-label="Billing sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`bm-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ──── Tab Content ──── */}
      <main className="bm-content">
        {activeTab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            receipts={receipts}
            creditNotes={creditNotes}
            serverTotal={serverTotals.invoices}
            search={invSearch} setSearch={setInvSearch}
            statusFilter={invStatusFilter} setStatusFilter={setInvStatusFilter}
            dateFrom={invDateFrom} setDateFrom={setInvDateFrom}
            dateTo={invDateTo} setDateTo={setInvDateTo}
            currentPage={invPage} pageSize={invPageSize}
            onPageChange={setInvPage}
            onPageSizeChange={(val) => { setInvPageSize(Number(val)); setInvPage(1); }}
            onView={setViewInvoice}
            onShowActivityLog={(inv) => setRecordActivityTarget({ recordId: inv._id || inv.id, recordLabel: inv.invoiceNumber, module: "billing" })}
            onEdit={canDo("billing", "edit") ? openInvForm : undefined}
            onDelete={canDo("billing", "delete") ? (inv) => confirmDelete(inv, "invoice") : undefined}
          />
        )}
        {activeTab === "gst-invoice" && (
          <GstInvoiceTab
            gstInvoices={gstInvoices}
            invoices={invoices}
            serverTotal={serverTotals.gstInvoices}
            search={gstSearch} setSearch={setGstSearch}
            gstRateFilter={gstRateFilter} setGstRateFilter={setGstRateFilter}
            currentPage={gstPage} pageSize={gstPageSize}
            onPageChange={setGstPage}
            onPageSizeChange={(val) => { setGstPageSize(Number(val)); setGstPage(1); }}
            onView={setViewGst}
            onShowActivityLog={(gst) => setShowLogModal({ recordId: gst._id || gst.id, recordLabel: gst.invoiceNumber || gst.customerName, module: "billing" })}
            onEdit={canDo("billing", "edit") ? openGstForm : undefined}
            onDelete={canDo("billing", "delete") ? (gst) => confirmDelete(gst, "gst") : undefined}
          />
        )}
        {activeTab === "credit-notes" && (
          <CreditNotesTab
            creditNotes={creditNotes}
            invoices={invoices}
            serverTotal={serverTotals.creditNotes}
            search={cnSearch} setSearch={setCnSearch}
            invoiceFilter={cnInvoiceFilter} setInvoiceFilter={setCnInvoiceFilter}
            currentPage={cnPage} pageSize={cnPageSize}
            onPageChange={setCnPage}
            onPageSizeChange={(val) => { setCnPageSize(Number(val)); setCnPage(1); }}
            onView={setViewCn}
            onShowActivityLog={(cn) => setShowLogModal({ recordId: cn._id || cn.id, recordLabel: cn.creditNoteNumber || cn.invoiceNumber, module: "billing" })}
            onEdit={canDo("billing", "edit") ? openCnForm : undefined}
            onDelete={canDo("billing", "delete") ? (cn) => confirmDelete(cn, "credit-note") : undefined}
          />
        )}
        {activeTab === "receipts" && (
          <ReceiptsTab
            receipts={receipts}
            serverTotal={serverTotals.receipts}
            search={rcpSearch} setSearch={setRcpSearch}
            methodFilter={rcpMethodFilter} setMethodFilter={setRcpMethodFilter}
            currentPage={rcpPage} pageSize={rcpPageSize}
            onPageChange={setRcpPage}
            onPageSizeChange={(val) => { setRcpPageSize(Number(val)); setRcpPage(1); }}
            onView={setViewRcp}
            onEdit={canDo("billing", "edit") ? openRcpForm : undefined}
            onDelete={canDo("billing", "delete") ? (rcp) => confirmDelete(rcp, "receipt") : undefined}
            onDownload={downloadReceipt}
            canExport={canDo("billing", "export")}
          />
        )}
        {activeTab === "due-payments" && (
          <DuePaymentsTab
            duePayments={duePayments}
            search={dpSearch} setSearch={setDpSearch}
            statusFilter={dpStatusFilter} setStatusFilter={setDpStatusFilter}
            dueDateFrom={dpDueDateFrom} setDueDateFrom={setDpDueDateFrom}
            dueDateTo={dpDueDateTo} setDueDateTo={setDpDueDateTo}
            currentPage={dpPage} pageSize={dpPageSize}
            onPageChange={setDpPage}
            onPageSizeChange={(val) => { setDpPageSize(Number(val)); setDpPage(1); }}
            onView={setViewDp}
            markAsPaid={handleMarkAsPaid}
            onDueDateChange={handleDueDateChange}
            loading={loading}
          />
        )}
      </main>

      {/* ──── View Modals ──── */}
      {viewInvoice && (
        <ViewInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} formatDate={formatDate} formatCurrency={formatCurrency} getStatusClass={getStatusClass} getStatusIcon={getStatusIcon} />
      )}
      {viewGst && (
        <ViewGstModal gst={viewGst} onClose={() => setViewGst(null)} formatDate={formatDate} formatCurrency={formatCurrency} />
      )}
      {viewCn && (
        <ViewCreditNoteModal creditNote={viewCn} onClose={() => setViewCn(null)} formatDate={formatDate} formatCurrency={formatCurrency} />
      )}
      {viewRcp && (
        <ViewReceiptModal receipt={viewRcp} onClose={() => setViewRcp(null)} formatDate={formatDate} formatCurrency={formatCurrency} />
      )}
      {viewDp && (
        <ViewDuePaymentModal duePayment={viewDp} onClose={() => setViewDp(null)} formatDate={formatDate} formatCurrency={formatCurrency} getStatusClass={getStatusClass} getStatusIcon={getStatusIcon} />
      )}

      {/* ──── Form Modals ──── */}
      {showGstForm && (
        <GstFormModal
          editing={editingGst}
          invoices={invoices}
          gstInvoices={gstInvoices}
          onSubmit={handleGstSubmit}
          onClose={() => { setShowGstForm(false); setEditingGst(null); }}
        />
      )}
      {showCnForm && (
        <CreditNoteFormModal
          editing={editingCn}
          invoices={invoices}
          creditNotes={creditNotes}
          receipts={receipts}
          onSubmit={handleCnSubmit}
          onClose={() => { setShowCnForm(false); setEditingCn(null); }}
        />
      )}
      {showRcpForm && (
        <ReceiptFormModal
          editing={editingRcp}
          invoices={invoices}
          receipts={receipts}
          creditNotes={creditNotes}
          onSubmit={handleRcpSubmit}
          onClose={() => { setShowRcpForm(false); setEditingRcp(null); }}
         />
      )}

        </>
      )}



      {/* ──── Confirm Dialog ──── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`Delete ${deleteType === "invoice" ? "Invoice" : deleteType === "gst" ? "GST Invoice" : deleteType === "credit-note" ? "Credit Note" : deleteType === "receipt" ? "Receipt" : "Due Payment"}`}
        message={`Are you sure you want to delete this ${deleteType === "invoice" ? "invoice" : deleteType === "gst" ? "GST invoice" : deleteType === "credit-note" ? "credit note" : deleteType === "receipt" ? "receipt" : "due payment entry"}?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteType(null); }}
        loading={loading}
      />

    </div>
  );
}

/* ══════════════════════════════════════════════
   INVOICES TAB
   ══════════════════════════════════════════════ */

function InvoicesTab({
  invoices, receipts = [], creditNotes = [], serverTotal = 0, search, setSearch, statusFilter, setStatusFilter,
  dateFrom, setDateFrom, dateTo, setDateTo,
  currentPage, pageSize,
  onPageChange, onPageSizeChange, onView, onEdit, onDelete
}) {
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    let result = [...invoices];
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerId.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "All") result = result.filter((inv) => inv.paymentStatus === statusFilter);
    if (dateFrom) result = result.filter((inv) => inv.invoiceDate >= dateFrom);
    if (dateTo) result = result.filter((inv) => inv.invoiceDate <= dateTo);
    return result;
  }, [invoices, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) onPageChange(totalPages);
  }, [currentPage, totalPages, onPageChange]);

  return (
    <section aria-label="Invoice list">
      {/* Toolbar */}
      <div className="bm-toolbar">          <div className="bm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); onPageChange(1); }} placeholder="Search by invoice, customer, or ID" />
          {search && (
            <button className="bm-search-clear" onClick={() => { setSearch(""); onPageChange(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); onPageChange(1); }} options={[{ value: "All", label: "All Statuses" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
        <input type="date" className="bm-filter-date-inline" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); onPageChange(1); }} title="From date" />
        <input type="date" className="bm-filter-date-inline" value={dateTo} onChange={(e) => { setDateTo(e.target.value); onPageChange(1); }} title="To date" />
      </div>

      {/* Table */}
      <div className="bm-table-card">
        <div className="bm-table-wrapper">
          <table className="bm-table">
            <thead>
              <tr>
                <th>
                  Invoice No.
                </th>
                <th>
                  Customer
                </th>
                <th>
                  Invoice Date
                </th>
                <th>Project</th>
                <th>
                  Total Amount
                </th>
                <th>Outstanding</th>
                <th>
                  Status
                </th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((inv) => (
                <tr key={inv._id || inv.id}>
                  <td className="bm-td-id">{inv.invoiceNumber}</td>
                  <td>
                    <div className="bm-td-name-wrap">
                      <span className="bm-td-name-text">{inv.customerName}</span>
                      <span className="bm-td-sub">{inv.customerId}</span>
                    </div>
                  </td>
                  <td>{formatDate(inv.invoiceDate)}</td>
                  <td><span className="bm-project-tag">{inv.projectName}</span></td>
                  <td className="bm-td-amount">{formatCurrency(inv.totalAmount)}</td>
                  <td className="bm-td-amount">
                    {(() => {
                      const out = getInvoiceOutstanding(inv, { receipts, creditNotes });
                      return out <= 0 ? "—" : formatCurrency(out);
                    })()}
                  </td>
                  <td>
                    <span className={`bm-badge ${getStatusClass(inv.paymentStatus)}`}>
                      <span className="bm-badge-icon">{getStatusIcon(inv.paymentStatus)}</span>
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <div className="act-actions">
                      <button type="button" className="act-btn act-view" onClick={() => onView(inv)} title="View">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                      <ActivityLogButton
                        module="billing"
                        onClick={() => {
                          const invId = inv._id || inv.id;
                          navigate(`/admin/billing-activity/${invId}`, {
                            state: { target: { recordId: invId, recordLabel: inv.invoiceNumber || inv.customerName, module: "billing" } },
                          });
                        }}
                        title="View Invoice Activity Log"
                      />
                      {onEdit && (
                      <button type="button" className="act-btn act-edit" onClick={() => onEdit(inv)} title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      )}
                      {onDelete && (
                      <button type="button" className="act-btn act-delete" onClick={() => onDelete(inv)} title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="bm-empty">
                    <div className="bm-empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <p>No invoices found</p>
                      <span>{search || statusFilter !== "All" || dateFrom || dateTo ? "Try adjusting your search or filters" : "Create your first invoice to get started"}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="bm-pagination-row">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={serverTotal || filtered.length} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   GST INVOICE TAB
   ══════════════════════════════════════════════ */

function GstInvoiceTab({
  gstInvoices, invoices, serverTotal = 0, search, setSearch, gstRateFilter, setGstRateFilter,
  currentPage, pageSize,
  onPageChange, onPageSizeChange, onView, onShowActivityLog, onEdit, onDelete, onFilterClick = () => {}, filterCount = 0
}) {
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    let result = [...gstInvoices];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((g) => (g.invoiceNumber || '').toLowerCase().includes(q) || (g.gstNumber || '').toLowerCase().includes(q) || (g.customerName || '').toLowerCase().includes(q));
    if (gstRateFilter !== "All") result = result.filter((g) => String(g.gstPercentage) === gstRateFilter);
    return result;
  }, [gstInvoices, search, gstRateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { if (currentPage > totalPages) onPageChange(totalPages); }, [currentPage, totalPages, onPageChange]);

  return (
    <section aria-label="GST Invoice list">
      <div className="bm-toolbar">
        <div className="bm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); onPageChange(1); }} placeholder="Search by invoice or GST number" />
          {search && (
            <button className="bm-search-clear" onClick={() => { setSearch(""); onPageChange(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown value={gstRateFilter} onChange={(val) => { setGstRateFilter(val); onPageChange(1); }} options={[{ value: "All", label: "All GST Rates" }, ...GST_RATES.map((r) => ({ value: r, label: `${r}%` }))]} />
      </div>

      <div className="bm-table-card">
        <div className="bm-table-wrapper">
          <table className="bm-table">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>GST Number</th>
                <th>GST %</th>
                <th>Taxable Amount</th>
                <th>GST Amount</th>
                <th>Total</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((g) => {
                const total = (g.taxableAmount || 0) + (g.gstAmount || 0);
                return (
                  <tr key={g._id || g.id}>
                    <td className="bm-td-id">{g.invoiceNumber}</td>
                    <td><span className="bm-td-name-text">{g.customerName}</span></td>
                    <td><code className="bm-gst-code">{g.gstNumber}</code></td>
                    <td><span className="bm-gst-rate-badge">{g.gstPercentage}%</span></td>
                    <td className="bm-td-amount">{formatCurrency(g.taxableAmount)}</td>
                    <td className="bm-td-amount">{formatCurrency(g.gstAmount)}</td>
                    <td className="bm-td-amount bm-td-total">{formatCurrency(total)}</td>
                    <td>
                      <div className="act-actions">
                        <button type="button" className="act-btn act-view" onClick={() => onView(g)} title="View">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        {onShowActivityLog && (
                          <ActivityLogButton
                            module="billing"
                            onClick={() => {
                              const gId = g._id || g.id;
                              navigate(`/admin/billing-activity/${gId}`, {
                                state: { target: { recordId: gId, recordLabel: g.invoiceNumber || g.customerName, module: "billing" } },
                              });
                            }}
                            title="View GST Invoice Activity Log"
                          />
                        )}
                        {onEdit && (
                        <button type="button" className="act-btn act-edit" onClick={() => onEdit(g)} title="Edit">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        )}
                        {onDelete && (
                        <button type="button" className="act-btn act-delete" onClick={() => onDelete(g)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="bm-empty">
                    <div className="bm-empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <p>No GST invoices found</p>
                      <span>Generate GST-compliant invoices for your customers</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="bm-pagination-row">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={serverTotal || filtered.length} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   CREDIT NOTES TAB
   ══════════════════════════════════════════════ */

function CreditNotesTab({
  creditNotes, invoices, serverTotal = 0, search, setSearch, invoiceFilter, setInvoiceFilter,
  currentPage, pageSize,
  onPageChange, onPageSizeChange, onView, onEdit, onDelete
}) {
  const filtered = useMemo(() => {
    let result = [...creditNotes];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((c) => c.creditNoteNumber.toLowerCase().includes(q) || c.invoiceNumber.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q));
    if (invoiceFilter !== "All") result = result.filter((c) => c.invoiceNumber === invoiceFilter);
    return result;
  }, [creditNotes, search, invoiceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { if (currentPage > totalPages) onPageChange(totalPages); }, [currentPage, totalPages, onPageChange]);

  return (
    <section aria-label="Credit notes list">
      <div className="bm-toolbar">
        <div className="bm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); onPageChange(1); }} placeholder="Search credit notes" />
          {search && (
            <button className="bm-search-clear" onClick={() => { setSearch(""); onPageChange(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown value={invoiceFilter} onChange={(val) => { setInvoiceFilter(val); onPageChange(1); }} options={[{ value: "All", label: "All Invoices" }, ...invoices.map((inv) => ({ value: inv.invoiceNumber, label: inv.invoiceNumber }))]} />
      </div>

      <div className="bm-table-card">
        <div className="bm-table-wrapper">
          <table className="bm-table">
            <thead>
              <tr>
                <th>Credit Note</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Reason</th>
                <th>Amount</th>
                <th>Date</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((cn) => (
                <tr key={cn._id || cn.id}>
                  <td className="bm-td-id">{cn.creditNoteNumber}</td>
                  <td><code className="bm-invoice-ref">{cn.invoiceNumber}</code></td>
                  <td><span className="bm-td-name-text">{cn.customerName}</span></td>
                  <td><span className="bm-cell-reason">{cn.reason}</span></td>
                  <td className="bm-td-amount">{formatCurrency(cn.creditAmount)}</td>
                  <td>{formatDate(cn.date)}</td>
                  <td>
                    <div className="act-actions">
                      <button type="button" className="act-btn act-view" onClick={() => onView(cn)} title="View">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                      {onEdit && (
                      <button type="button" className="act-btn act-edit" onClick={() => onEdit(cn)} title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      )}
                      {onDelete && (
                      <button type="button" className="act-btn act-delete" onClick={() => onDelete(cn)} title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="bm-empty">
                    <div className="bm-empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <p>No credit notes found</p>
                      <span>{search || invoiceFilter !== "All" ? "Try adjusting your search" : "Create your first credit note"}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="bm-pagination-row">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={serverTotal || filtered.length} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   RECEIPTS TAB
   ══════════════════════════════════════════════ */

function ReceiptsTab({
  receipts, serverTotal = 0, search, setSearch, methodFilter, setMethodFilter,
  currentPage, pageSize,
  onPageChange, onPageSizeChange, onView, onEdit, onDelete, onDownload,
  canExport = true,
}) {
  const filtered = useMemo(() => {
    let result = [...receipts];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) => r.receiptNumber.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q));
    if (methodFilter !== "All") result = result.filter((r) => r.paymentMethod === methodFilter);
    return result;
  }, [receipts, search, methodFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { if (currentPage > totalPages) onPageChange(totalPages); }, [currentPage, totalPages, onPageChange]);

  return (
    <section aria-label="Receipts list">
      <div className="bm-toolbar">
        <div className="bm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); onPageChange(1); }} placeholder="Search receipts" />
          {search && (
            <button className="bm-search-clear" onClick={() => { setSearch(""); onPageChange(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown value={methodFilter} onChange={(val) => { setMethodFilter(val); onPageChange(1); }} options={[{ value: "All", label: "All Methods" }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))]} />
      </div>

      <div className="bm-table-card">
        <div className="bm-table-wrapper">
          <table className="bm-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Date</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r._id || r.id}>
                  <td className="bm-td-id">{r.receiptNumber}</td>
                  <td><code className="bm-invoice-ref">{r.invoiceNumber}</code></td>
                  <td><span className="bm-td-name-text">{r.customerName}</span></td>
                  <td className="bm-td-amount">{formatCurrency(r.paymentAmount)}</td>
                  <td><span className="bm-method-tag">{r.paymentMethod}</span></td>
                  <td>{formatDate(r.paymentDate)}</td>
                  <td>
                    <div className="act-actions">
                      <button type="button" className="act-btn act-view" onClick={() => onView(r)} title="View">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                      {onEdit && (
                      <button type="button" className="act-btn act-edit" onClick={() => onEdit(r)} title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      )}
                      {canExport && (
                      <button type="button" className="act-btn act-log" onClick={() => onDownload(r)} title="Download Receipt">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </button>
                      )}
                      {onDelete && (
                      <button type="button" className="act-btn act-delete" onClick={() => onDelete(r)} title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="bm-empty">
                    <div className="bm-empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <p>No receipts found</p>
                      <span>{search || methodFilter !== "All" ? "Try adjusting your search or filters" : "Generate your first receipt"}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="bm-pagination-row">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={serverTotal || filtered.length} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   DUE PAYMENTS TAB
   ══════════════════════════════════════════════ */

function DuePaymentsTab({
  duePayments, search, setSearch, statusFilter, setStatusFilter, dueDateFrom, setDueDateFrom, dueDateTo, setDueDateTo,
  currentPage, pageSize,
  onPageChange, onPageSizeChange, onView, markAsPaid, onDueDateChange, loading
}) {
  const filtered = useMemo(() => {
    let result = [...duePayments];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((d) => d.invoiceNumber.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q));
    if (statusFilter !== "All") result = result.filter((d) => d.paymentStatus === statusFilter);
    if (dueDateFrom) result = result.filter((d) => d.dueDate >= dueDateFrom);
    if (dueDateTo) result = result.filter((d) => d.dueDate <= dueDateTo);
    return result;
  }, [duePayments, search, statusFilter, dueDateFrom, dueDateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { if (currentPage > totalPages) onPageChange(totalPages); }, [currentPage, totalPages, onPageChange]);

  const getDueStatus = (dueDate) => {
    if (!dueDate) return "upcoming";
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "overdue";
    if (diffDays <= 7) return "due-soon";
    return "upcoming";
  };

  return (
    <section aria-label="Due payments list">
      <div className="bm-toolbar">
        <div className="bm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); onPageChange(1); }} placeholder="Search by invoice or customer" />
          {search && (
            <button className="bm-search-clear" onClick={() => { setSearch(""); onPageChange(1); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <Dropdown value={statusFilter} onChange={(val) => { setStatusFilter(val); onPageChange(1); }} options={[{ value: "All", label: "All Statuses" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
        <input type="date" className="bm-filter-date-inline" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); onPageChange(1); }} title="Due from date" />
        <input type="date" className="bm-filter-date-inline" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); onPageChange(1); }} title="Due to date" />
      </div>

      <div className="bm-table-card">
        <div className="bm-table-wrapper">
          <table className="bm-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Due Date</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Due In</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((d) => {
                const dueDays = d.dueDate ? Math.ceil((new Date(d.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                const dueStatus = getDueStatus(d.dueDate);
                const dueLabel = dueStatus === "overdue"
                  ? "Overdue"
                  : dueDays == null ? "—" : `${dueDays} days`;
                return (
                  <tr key={d._id || d.id} className={dueStatus === "overdue" ? "bm-row-overdue" : ""}>
                    <td><code className="bm-invoice-ref">{d.invoiceNumber}</code></td>
                    <td><span className="bm-td-name-text">{d.customerName}</span></td>
                    <td>
                      <div className="bm-due-date-edit" title="Change due date">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <input
                          type="date"
                          value={d.dueDate ? String(d.dueDate).slice(0, 10) : ""}
                          onChange={(e) => onDueDateChange(d, e.target.value)}
                          disabled={loading}
                        />
                      </div>
                    </td>
                    <td className="bm-td-amount">{formatCurrency(d.outstandingAmount)}</td>
                    <td>
                      <span className={`bm-badge ${getStatusClass(d.paymentStatus)}`}>
                        <span className="bm-badge-icon">{getStatusIcon(d.paymentStatus)}</span>
                        {d.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`bm-due-badge bm-due-${dueStatus}`}>{dueLabel}</span>
                    </td>
                    <td>
                      <div className="act-actions">
                        <button type="button" className="act-btn act-view" onClick={() => onView(d)} title="View">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button type="button" className="act-btn act-log" onClick={() => markAsPaid(d)} title={loading ? "Marking as paid..." : "Mark as Paid"} disabled={loading} style={{ background: "#f0fdf4", color: "#16a34a" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="bm-empty">
                    <div className="bm-empty-state">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <p>No due payments found</p>
                      <span>{search || statusFilter !== "All" || dueDateFrom || dueDateTo ? "Try adjusting your search or filters" : "All payments are up to date!"}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="bm-pagination-row">
            <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={serverTotal || filtered.length} pageSize={pageSize} onPageChange={onPageChange} variant="table" onPageSizeChange={onPageSizeChange} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════
   VIEW MODALS
   ══════════════════════════════════════════════ */

function ViewInvoiceModal({ invoice, onClose, formatDate, formatCurrency, getStatusClass, getStatusIcon }) {
  return (
    <div className="bm-overlay">
      <div className="bm-modal bm-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="bm-modal-header">
          <h3>Invoice Details - {invoice.invoiceNumber}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bm-modal-body">
          <div className="bm-view-section">
            <h4>Invoice Information</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Invoice Number</span><span className="bm-view-value bm-td-id">{invoice.invoiceNumber}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Invoice Date</span><span className="bm-view-value">{formatDate(invoice.invoiceDate)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer Name</span><span className="bm-view-value">{invoice.customerName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer ID</span><span className="bm-view-value">{invoice.customerId}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Project Name</span><span className="bm-view-value">{invoice.projectName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Payment Status</span><span className={`bm-badge ${getStatusClass(invoice.paymentStatus)}`}><span className="bm-badge-icon">{getStatusIcon(invoice.paymentStatus)}</span>{invoice.paymentStatus}</span></div>
            </div>
          </div>
          <div className="bm-view-section">
            <h4>Amount Details</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Invoice Amount</span><span className="bm-view-value">{formatCurrency(invoice.invoiceAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Tax Amount</span><span className="bm-view-value">{formatCurrency(invoice.taxAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Total Amount</span><span className="bm-view-value bm-td-total">{formatCurrency(invoice.totalAmount)}</span></div>
            </div>
          </div>
          {invoice.notes && (
            <div className="bm-view-section">
              <h4>Notes</h4>
              <p className="bm-view-notes">{invoice.notes}</p>
            </div>
          )}
        </div>
        <div className="bm-modal-footer">
          <button className="modal-footer-close-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ViewGstModal({ gst, onClose, formatDate, formatCurrency }) {
  const total = gst.taxableAmount + gst.gstAmount;
  return (
    <div className="bm-overlay">
      <div className="bm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bm-modal-header">
          <h3>GST Invoice - {gst.invoiceNumber}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bm-modal-body">
          <div className="bm-view-section">
            <h4>GST Invoice Details</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Invoice Number</span><span className="bm-view-value bm-td-id">{gst.invoiceNumber}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer</span><span className="bm-view-value">{gst.customerName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">GST Number</span><span className="bm-view-value"><code className="bm-gst-code">{gst.gstNumber}</code></span></div>
              <div className="bm-view-item"><span className="bm-view-label">GST Percentage</span><span className="bm-view-value"><span className="bm-gst-rate-badge">{gst.gstPercentage}%</span></span></div>
              <div className="bm-view-item"><span className="bm-view-label">Taxable Amount</span><span className="bm-view-value">{formatCurrency(gst.taxableAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">GST Amount</span><span className="bm-view-value">{formatCurrency(gst.gstAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Total Amount</span><span className="bm-view-value bm-td-total">{formatCurrency(total)}</span></div>
            </div>
          </div>
        </div>
        <div className="bm-modal-footer">
          <button className="modal-footer-close-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ViewCreditNoteModal({ creditNote, onClose, formatDate, formatCurrency }) {
  return (
    <div className="bm-overlay">
      <div className="bm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bm-modal-header">
          <h3>Credit Note - {creditNote.creditNoteNumber}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bm-modal-body">
          <div className="bm-view-section">
            <h4>Credit Note Details</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Credit Note Number</span><span className="bm-view-value bm-td-id">{creditNote.creditNoteNumber}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Invoice Number</span><span className="bm-view-value"><code className="bm-invoice-ref">{creditNote.invoiceNumber}</code></span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer</span><span className="bm-view-value">{creditNote.customerName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Credit Amount</span><span className="bm-view-value">{formatCurrency(creditNote.creditAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Date</span><span className="bm-view-value">{formatDate(creditNote.date)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Reason</span><span className="bm-view-value">{creditNote.reason}</span></div>
            </div>
          </div>
        </div>
        <div className="bm-modal-footer">
          <button className="modal-footer-close-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ViewReceiptModal({ receipt, onClose, formatDate, formatCurrency }) {
  return (
    <div className="bm-overlay">
      <div className="bm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bm-modal-header">
          <h3>Receipt - {receipt.receiptNumber}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bm-modal-body">
          <div className="bm-view-section">
            <h4>Receipt Details</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Receipt Number</span><span className="bm-view-value bm-td-id">{receipt.receiptNumber}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Invoice Number</span><span className="bm-view-value"><code className="bm-invoice-ref">{receipt.invoiceNumber}</code></span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer</span><span className="bm-view-value">{receipt.customerName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Payment Amount</span><span className="bm-view-value">{formatCurrency(receipt.paymentAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Payment Method</span><span className="bm-view-value"><span className="bm-method-tag">{receipt.paymentMethod}</span></span></div>
              <div className="bm-view-item"><span className="bm-view-label">Payment Date</span><span className="bm-view-value">{formatDate(receipt.paymentDate)}</span></div>
            </div>
          </div>
        </div>
        <div className="bm-modal-footer">
          <button className="modal-footer-close-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ViewDuePaymentModal({ duePayment, onClose, formatDate, formatCurrency, getStatusClass, getStatusIcon }) {
  return (
    <div className="bm-overlay">
      <div className="bm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bm-modal-header">
          <h3>Due Payment - {duePayment.invoiceNumber}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="bm-modal-body">
          <div className="bm-view-section">
            <h4>Due Payment Details</h4>
            <div className="bm-view-grid">
              <div className="bm-view-item"><span className="bm-view-label">Invoice Number</span><span className="bm-view-value bm-td-id">{duePayment.invoiceNumber}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Customer</span><span className="bm-view-value">{duePayment.customerName}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Due Date</span><span className="bm-view-value">{formatDate(duePayment.dueDate)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Outstanding Amount</span><span className="bm-view-value">{formatCurrency(duePayment.outstandingAmount)}</span></div>
              <div className="bm-view-item"><span className="bm-view-label">Payment Status</span><span className={`bm-badge ${getStatusClass(duePayment.paymentStatus)}`}><span className="bm-badge-icon">{getStatusIcon(duePayment.paymentStatus)}</span>{duePayment.paymentStatus}</span></div>
            </div>
          </div>
        </div>
        <div className="bm-modal-footer">
          <button className="modal-footer-close-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   FORM MODALS
   ══════════════════════════════════════════════ */

function GstFormModal({ editing, invoices, gstInvoices = [], onSubmit, onClose }) {
  const gstFormik = useFormik({
    initialValues: {
      invoiceNumber: editing?.invoiceNumber || "",
      gstNumber: editing?.gstNumber || "",
      gstPercentage: "18", // GST percentage fixed at 18% — editable field commented out
      taxableAmount: editing?.taxableAmount?.toString() || "",
    },
    validationSchema: gstInvoiceSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onSubmit(values);
    },
  });

  // Show ALL invoices in the dropdown; ones that already have a GST invoice
  // are tagged "(GST Done)" instead of being hidden.
  const invoiceOptions = useMemo(() => {
    const gstInvoiceNums = new Set(gstInvoices.map((g) => g.invoiceNumber));
    return [
      { value: "", label: "Select Invoice" },
      ...sortById(invoices, "invoiceNumber")
        .map((i) => ({
          value: i.invoiceNumber,
          label: `${i.invoiceNumber} — ${i.customerName}${gstInvoiceNums.has(i.invoiceNumber) ? "   (GST Done)" : ""}`,
        })),
    ];
  }, [invoices, gstInvoices]);

  const handleInvoiceSelect = (invoiceNumber) => {
    gstFormik.setFieldValue("invoiceNumber", invoiceNumber);
    if (!invoiceNumber) {
      // Dropped back to "Select Invoice" — clear the stale auto-filled amount.
      gstFormik.setFieldValue("taxableAmount", "");
      return;
    }
    const inv = invoices.find((i) => i.invoiceNumber === invoiceNumber);
    if (inv) {
      gstFormik.setFieldValue("taxableAmount", inv.invoiceAmount != null ? String(inv.invoiceAmount) : "");
    }
  };
  return (
    <div className="bm-overlay">
      <div className="bm-modal bm-modal-form">
        <div className="bm-modal-header">
          <h3>{editing ? "Edit GST Invoice" : "Generate GST Invoice"}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <form onSubmit={gstFormik.handleSubmit} noValidate>
          <div className="bm-modal-body">
            <div className="bm-form-section">
              <div className="bm-section-header">
                <span className="bm-section-number">1</span>
                <h4>GST Details</h4>
              </div>
              <div className="bm-form-grid">
                <div className="bm-form-field">
                  <label>Invoice Number <span className="bm-required">*</span></label>
                  <Dropdown
                    value={gstFormik.values.invoiceNumber}
                    onChange={handleInvoiceSelect}
                    options={invoiceOptions}
                    variant="form"
                    placeholder="Select Invoice"
                    emptyMessage="No invoices created yet"
                  />
                  {gstFormik.touched.invoiceNumber && gstFormik.errors.invoiceNumber && <span className="bm-field-error">{gstFormik.errors.invoiceNumber}</span>}
                </div>
                <div className="bm-form-field">
                  <label>GST Number <span className="bm-required">*</span></label>
                  <input type="text" name="gstNumber" value={gstFormik.values.gstNumber} onChange={gstFormik.handleChange} onBlur={gstFormik.handleBlur} placeholder="e.g. 24AABCS1234C1Z5" maxLength={15} />
                  {gstFormik.touched.gstNumber && gstFormik.errors.gstNumber && <span className="bm-field-error">{gstFormik.errors.gstNumber}</span>}
                </div>
                {/* GST Percentage field — commented out, fixed at 18%
                <div className="bm-form-field">
                  <label>GST Percentage (%) <span className="bm-required">*</span></label>
                  <Dropdown
                    value={gstFormik.values.gstPercentage}
                    onChange={(val) => gstFormik.setFieldValue("gstPercentage", val)}
                    options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
                    variant="form"
                    placeholder="Select GST rate"
                  />
                  {gstFormik.touched.gstPercentage && gstFormik.errors.gstPercentage && <span className="bm-field-error">{gstFormik.errors.gstPercentage}</span>}
                </div>
                */}
                <div className="bm-form-field">
                  <label>Taxable Amount (₹) <span className="bm-required">*</span></label>
                  <input type="number" name="taxableAmount" value={gstFormik.values.taxableAmount} onChange={clampNumberInput(gstFormik, 10000000000)} onBlur={gstFormik.handleBlur} placeholder="e.g. 245000" min="0" />
                  {gstFormik.touched.taxableAmount && gstFormik.errors.taxableAmount && <span className="bm-field-error">{gstFormik.errors.taxableAmount}</span>}
                </div>
                <div className="bm-form-field">
                  <label>GST Amount (₹)</label>
                  <div className="bm-calculated-field">
                    <span className="bm-calculated-value">
                      {formatCurrency(Math.round((parseFloat(gstFormik.values.taxableAmount) || 0) * (parseFloat(gstFormik.values.gstPercentage) || 0) / 100))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bm-modal-footer">
            <button type="button" className="bm-btn bm-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="bm-btn bm-btn-primary">{editing ? "Update GST Invoice" : "Generate GST Invoice"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreditNoteFormModal({ editing, invoices, creditNotes, receipts = [], onSubmit, onClose }) {
  // Track the selected invoice outside Formik so the outstanding balance can
  // be computed before the form initializes (stable hooks order).
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(editing?.invoiceNumber || "");

  const selectedInvoice = invoices.find((i) => i.invoiceNumber === selectedInvoiceNumber) || null;

  // What the customer still owes on this invoice (receipts + other credit
  // notes already applied). When editing, this credit note's own amount is
  // excluded so the cap reflects the balance the note can still cover.
  const availableOutstanding = useMemo(() => {
    if (!selectedInvoice) return null;
    return getInvoiceOutstanding(selectedInvoice, {
      receipts,
      creditNotes,
      excludeCreditNoteId: editing?._id,
    });
  }, [selectedInvoice, receipts, creditNotes, editing]);

  const invoiceOptions = useMemo(() => {
    return [
      { value: "", label: "Select Invoice" },
      ...sortById(invoices, "invoiceNumber")
        .filter((i) => {
          if (editing && i.invoiceNumber === editing.invoiceNumber) return true;
          const outstanding = getInvoiceOutstanding(i, { receipts, creditNotes, excludeCreditNoteId: editing?._id });
          return outstanding > 0;
        })
        .map((i) => ({ value: i.invoiceNumber, label: `${i.invoiceNumber} — ${i.customerName}` })),
    ];
  }, [invoices, receipts, creditNotes, editing]);

  const cnFormik = useFormik({
    initialValues: {
      creditNoteNumber: editing?.creditNoteNumber || generateId(creditNotes, "CN-2026"),
      invoiceNumber: editing?.invoiceNumber || "",
      creditAmount: editing?.creditAmount?.toString() || "",
      reason: editing?.reason || "",
    },
    validationSchema: creditNoteSchema,
    enableReinitialize: true,
    validate: (values) => {
      const errors = {};
      const amt = parseFloat(values.creditAmount);
      if (availableOutstanding != null && !Number.isNaN(amt) && amt > availableOutstanding) {
        errors.creditAmount = `Credit amount cannot exceed the outstanding balance (${formatCurrency(availableOutstanding)})`;
      }
      return errors;
    },
    onSubmit: (values) => {
      onSubmit(values);
    },
  });

  const handleInvoiceSelect = (invoiceNumber) => {
    setSelectedInvoiceNumber(invoiceNumber);
    cnFormik.setFieldValue("invoiceNumber", invoiceNumber);
  };

  return (
    <div className="bm-overlay">
      <div className="bm-modal bm-modal-form">
        <div className="bm-modal-header">
          <h3>{editing ? "Edit Credit Note" : "Create Credit Note"}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <form onSubmit={cnFormik.handleSubmit} noValidate>
          <div className="bm-modal-body">
            <div className="bm-form-section">
              <div className="bm-section-header">
                <span className="bm-section-number">1</span>
                <h4>Credit Note Information</h4>
              </div>
              <div className="bm-form-grid">
                <div className="bm-form-field">
                  <label>Credit Note Number</label>
                  <input type="text" value={cnFormik.values.creditNoteNumber} readOnly className="bm-field-readonly" />
                </div>
                <div className="bm-form-field">
                  <label>Invoice Number <span className="bm-required">*</span></label>
                  <Dropdown
                    value={cnFormik.values.invoiceNumber}
                    onChange={handleInvoiceSelect}
                    options={invoiceOptions}
                    variant="form"
                    placeholder="Select Invoice"
                    emptyMessage="No invoices created yet"
                  />
                  {cnFormik.touched.invoiceNumber && cnFormik.errors.invoiceNumber && <span className="bm-field-error">{cnFormik.errors.invoiceNumber}</span>}
                </div>
                <div className="bm-form-field">
                  <label>Credit Amount (₹) <span className="bm-required">*</span></label>
                  <input type="number" name="creditAmount" value={cnFormik.values.creditAmount} onChange={clampNumberInput(cnFormik, 10000000000)} onBlur={cnFormik.handleBlur} placeholder="e.g. 15000" min="0" />
                  {cnFormik.touched.creditAmount && cnFormik.errors.creditAmount && <span className="bm-field-error">{cnFormik.errors.creditAmount}</span>}
                  {availableOutstanding != null && !(cnFormik.touched.creditAmount && cnFormik.errors.creditAmount) && (
                    <span className="bm-field-hint">Maximum credit: {formatCurrency(availableOutstanding)}</span>
                  )}
                </div>
                <div className="bm-form-field">
                  <label>Outstanding Balance (₹)</label>
                  <div className="bm-calculated-field">
                    <span className="bm-calculated-value">
                      {availableOutstanding != null ? formatCurrency(availableOutstanding) : "—"}
                    </span>
                  </div>
                </div>
                <div className="bm-form-field bm-full-width">
                  <label>Reason <span className="bm-required">*</span></label>
                  <textarea name="reason" value={cnFormik.values.reason} onChange={cnFormik.handleChange} onBlur={cnFormik.handleBlur} placeholder="Describe the reason for this credit note..." rows={3} maxLength={500} />
                  {cnFormik.touched.reason && cnFormik.errors.reason && <span className="bm-field-error">{cnFormik.errors.reason}</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="bm-modal-footer">
            <button type="button" className="bm-btn bm-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="bm-btn bm-btn-primary">{editing ? "Update Credit Note" : "Create Credit Note"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiptFormModal({ editing, invoices, receipts, creditNotes = [], onSubmit, onClose }) {
  // Track the selected invoice outside Formik so the outstanding balance can
  // be computed before the form initializes (stable hooks order).
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(editing?.invoiceNumber || "");

  const selectedInvoice = invoices.find((i) => i.invoiceNumber === selectedInvoiceNumber) || null;

  // What the customer still owes on the selected invoice (receipts + credit
  // notes already applied). Excludes this receipt when editing.
  const availableOutstanding = useMemo(() => {
    if (!selectedInvoice) return null;
    return getInvoiceOutstanding(selectedInvoice, {
      receipts,
      creditNotes,
      excludeReceiptId: editing?._id,
    });
  }, [selectedInvoice, receipts, creditNotes, editing]);

  const invoiceOptions = useMemo(() => {
    return [
      { value: "", label: "Select Invoice" },
      ...sortById(invoices, "invoiceNumber")
        .filter((i) => {
          if (editing && i.invoiceNumber === editing.invoiceNumber) return true;
          const outstanding = getInvoiceOutstanding(i, { receipts, creditNotes, excludeReceiptId: editing?._id });
          return outstanding > 0;
        })
        .map((i) => ({ value: i.invoiceNumber, label: `${i.invoiceNumber} — ${i.customerName}` })),
    ];
  }, [invoices, receipts, creditNotes, editing]);

  const rcpFormik = useFormik({
    initialValues: {
      receiptNumber: editing?.receiptNumber || generateId(receipts, "RCP-2026"),
      invoiceNumber: editing?.invoiceNumber || "",
      paymentDate: editing?.paymentDate || new Date().toISOString().split("T")[0],
      paymentAmount: editing?.paymentAmount?.toString() || "",
      paymentMethod: editing?.paymentMethod || "Bank Transfer",
    },
    validationSchema: receiptSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      onSubmit(values);
    },
  });

  const handleInvoiceSelect = (invoiceNumber) => {
    setSelectedInvoiceNumber(invoiceNumber);
    rcpFormik.setFieldValue("invoiceNumber", invoiceNumber);
  };

  return (
    <div className="bm-overlay">
      <div className="bm-modal bm-modal-form">
        <div className="bm-modal-header">
          <h3>{editing ? "Edit Receipt" : "Generate Receipt"}</h3>
          <button className="bm-modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <form onSubmit={rcpFormik.handleSubmit} noValidate>
          <div className="bm-modal-body">
            <div className="bm-form-section">
              <div className="bm-section-header">
                <span className="bm-section-number">1</span>
                <h4>Receipt Information</h4>
              </div>
              <div className="bm-form-grid">
                <div className="bm-form-field">
                  <label>Receipt Number</label>
                  <input type="text" value={rcpFormik.values.receiptNumber} readOnly className="bm-field-readonly" />
                </div>
                <div className="bm-form-field">
                  <label>Invoice Number <span className="bm-required">*</span></label>
                  <Dropdown
                    value={rcpFormik.values.invoiceNumber}
                    onChange={handleInvoiceSelect}
                    options={invoiceOptions}
                    variant="form"
                    placeholder="Select Invoice"
                    emptyMessage="No invoices created yet"
                  />
                  {rcpFormik.touched.invoiceNumber && rcpFormik.errors.invoiceNumber && <span className="bm-field-error">{rcpFormik.errors.invoiceNumber}</span>}
                </div>
                <div className="bm-form-field">
                  <label>Payment Amount (₹) <span className="bm-required">*</span></label>
                  <input type="number" name="paymentAmount" value={rcpFormik.values.paymentAmount} onChange={clampNumberInput(rcpFormik, 10000000000)} onBlur={rcpFormik.handleBlur} placeholder="e.g. 289100" min="0" />
                  {rcpFormik.touched.paymentAmount && rcpFormik.errors.paymentAmount && <span className="bm-field-error">{rcpFormik.errors.paymentAmount}</span>}
                  {availableOutstanding != null && !(rcpFormik.touched.paymentAmount && rcpFormik.errors.paymentAmount) && (
                    <span className="bm-field-hint">Maximum payment: {formatCurrency(availableOutstanding)}</span>
                  )}
                </div>
                <div className="bm-form-field">
                  <label>Outstanding Balance (₹)</label>
                  <div className="bm-calculated-field">
                    <span className="bm-calculated-value">
                      {availableOutstanding != null ? formatCurrency(availableOutstanding) : "—"}
                    </span>
                  </div>
                </div>
                <div className="bm-form-field">
                  <label>Payment Method</label>
                  <Dropdown
                    value={rcpFormik.values.paymentMethod}
                    onChange={(val) => rcpFormik.setFieldValue("paymentMethod", val)}
                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                    variant="form"
                    placeholder="Select method"
                  />
                </div>
                <div className="bm-form-field">
                  <label>Payment Date <span className="bm-required">*</span></label>
                  <input type="date" name="paymentDate" value={rcpFormik.values.paymentDate} onChange={rcpFormik.handleChange} onBlur={rcpFormik.handleBlur} min={todayISO()} />
                  {rcpFormik.touched.paymentDate && rcpFormik.errors.paymentDate && <span className="bm-field-error">{rcpFormik.errors.paymentDate}</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="bm-modal-footer">
            <button type="button" className="bm-btn bm-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="bm-btn bm-btn-primary">{editing ? "Update Receipt" : "Generate Receipt"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
