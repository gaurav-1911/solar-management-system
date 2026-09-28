import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Pagination from "../../../components/common/Pagination";
import Dropdown from "../../../components/common/Dropdown";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import StatCard from "../StatCard/StatCard";
import TableLoader from "../../../components/common/TableLoader";
import { useLocalToast, ToastRenderer } from "../../../components/common/Toast";
import { useAuth } from "../../../context/AuthContext";
import { ActivityLogButton } from "../../../components/common/RecordActivityModal";
import GenericDetailActivityLog from "../../common/GenericDetailActivityLog";
import "./payments.css";

/**
 * PaymentModule
 * Static (mock-data) payment processing module for a solar management system.
 * Covers gateway methods, EMI/installment plans, milestone-based payments,
 * due reminders, and transaction history / reconciliation.
 *
 * Self-contained: swap the *_DATA constants and the handler stubs marked
 * "// TODO: connect to API" to wire this up to a real payment gateway.
 */

/* ---------------------------------- data ---------------------------------- */

const PAYMENT_METHODS = [
  {
    id: "cards",
    name: "Cards",
    description: "Visa, Mastercard, RuPay — credit & debit",
    enabled: true,
    provider: "Razorpay",
  },
  {
    id: "netbanking",
    name: "Net Banking",
    description: "60+ Indian banks supported at checkout",
    enabled: true,
    provider: "Razorpay",
  },
  {
    id: "upi",
    name: "UPI",
    description: "GPay, PhonePe, Paytm, BHIM — intent & QR",
    enabled: true,
    provider: "Razorpay",
  },
  {
    id: "emi",
    name: "EMI / Installments",
    description: "Bank EMI or in-house installment plans",
    enabled: true,
    provider: "In-house + Bajaj Finserv",
  },
];

const PAGE_SIZE = 4;

const EMI_DATA = [
  {
    id: "EMI-2201",
    customer: "R. Patel Residence",
    principal: 248500,
    tenureMonths: 12,
    monthlyAmount: 21500,
    installmentsPaid: 5,
    nextDueDate: "2026-07-28",
    status: "on-track",
  },
  {
    id: "EMI-2198",
    customer: "Desai Farms",
    principal: 96000,
    tenureMonths: 6,
    monthlyAmount: 16800,
    installmentsPaid: 6,
    nextDueDate: null,
    status: "completed",
  },
  {
    id: "EMI-2205",
    customer: "Vora Ceramics",
    principal: 412160,
    tenureMonths: 24,
    monthlyAmount: 18900,
    installmentsPaid: 2,
    nextDueDate: "2026-07-15",
    status: "overdue",
  },
  {
    id: "EMI-2210",
    customer: "Shah Poultry Farms",
    principal: 175000,
    tenureMonths: 18,
    monthlyAmount: 10800,
    installmentsPaid: 1,
    nextDueDate: "2026-08-01",
    status: "on-track",
  },
];

const MILESTONE_PROJECTS = [
  {
    id: "PRJ-0512",
    customer: "Patel Sons Warehouse",
    totalValue: 1240000,
    milestones: [
      { label: "Advance (25%)", pct: 25, status: "paid", date: "2026-05-10" },
      { label: "Material Delivery (35%)", pct: 35, status: "paid", date: "2026-06-08" },
      { label: "Installation Complete (30%)", pct: 30, status: "due", date: "2026-07-20" },
      { label: "Commissioning (10%)", pct: 10, status: "upcoming", date: null },
    ],
  },
  {
    id: "PRJ-0518",
    customer: "Shree Ganesh Textile Mills",
    totalValue: 3680000,
    milestones: [
      { label: "Advance (25%)", pct: 25, status: "paid", date: "2026-06-01" },
      { label: "Material Delivery (35%)", pct: 35, status: "due", date: "2026-07-18" },
      { label: "Installation Complete (30%)", pct: 30, status: "upcoming", date: null },
      { label: "Commissioning (10%)", pct: 10, status: "upcoming", date: null },
    ],
  },
  {
    id: "PRJ-0525",
    customer: "Bhatt Textiles Pvt Ltd",
    totalValue: 860000,
    milestones: [
      { label: "Advance (25%)", pct: 25, status: "paid", date: "2026-04-22" },
      { label: "Material Delivery (35%)", pct: 35, status: "paid", date: "2026-05-15" },
      { label: "Installation Complete (30%)", pct: 30, status: "paid", date: "2026-06-02" },
      { label: "Commissioning (10%)", pct: 10, status: "paid", date: "2026-06-10" },
    ],
  },
];

const REMINDER_DATA = [
  {
    id: "RMD-4410",
    customer: "Vora Ceramics",
    linkedTo: "EMI-2205",
    channel: "WhatsApp",
    amount: 18900,
    dueDate: "2026-07-15",
    status: "sent",
    sentDate: "2026-07-13",
  },
  {
    id: "RMD-4411",
    customer: "Shree Ganesh Textile Mills",
    linkedTo: "PRJ-0518 · Material Delivery",
    channel: "Email",
    amount: 1288000,
    dueDate: "2026-07-18",
    status: "scheduled",
    sentDate: null,
  },
  {
    id: "RMD-4406",
    customer: "Bhatt Textiles Pvt Ltd",
    linkedTo: "INV-2026-0144",
    channel: "SMS",
    amount: 42000,
    dueDate: "2026-07-04",
    status: "escalated",
    sentDate: "2026-07-05",
  },
  {
    id: "RMD-4402",
    customer: "R. Patel Residence",
    linkedTo: "EMI-2201",
    channel: "WhatsApp",
    amount: 21500,
    dueDate: "2026-07-28",
    status: "scheduled",
    sentDate: null,
  },
];

const TRANSACTION_DATA = [
  {
    id: "TXN-99213",
    customer: "Shree Ganesh Textile Mills",
    method: "UPI",
    amount: 412160,
    date: "2026-07-13",
    status: "success",
    reconciled: "matched",
  },
  {
    id: "TXN-99187",
    customer: "R. Patel Residence",
    method: "Net Banking",
    amount: 21500,
    date: "2026-07-05",
    status: "success",
    reconciled: "matched",
  },
  {
    id: "TXN-99164",
    customer: "Vora Ceramics",
    method: "Card",
    amount: 18900,
    date: "2026-06-14",
    status: "failed",
    reconciled: "unmatched",
  },
  {
    id: "TXN-99150",
    customer: "Desai Farms",
    method: "EMI Auto-Debit",
    amount: 16800,
    date: "2026-06-28",
    status: "success",
    reconciled: "matched",
  },
  {
    id: "TXN-99098",
    customer: "Adani Housing Society",
    method: "UPI",
    amount: 185000,
    date: "2026-06-30",
    status: "refunded",
    reconciled: "matched",
  },
  {
    id: "TXN-99071",
    customer: "Patel Sons Warehouse",
    method: "Net Banking",
    amount: 434000,
    date: "2026-06-08",
    status: "success",
    reconciled: "unmatched",
  },
];

const EMI_STATUS_META = {
  "on-track": { label: "On Track", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  completed: { label: "Completed", tone: "neutral" },
};

const MILESTONE_STATUS_META = {
  paid: { label: "Paid", tone: "success" },
  due: { label: "Due", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
};

const REMINDER_STATUS_META = {
  sent: { label: "Sent", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "warning" },
  escalated: { label: "Escalated", tone: "danger" },
};

const TXN_STATUS_META = {
  success: { label: "Success", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "neutral" },
};

const RECON_META = {
  matched: { label: "Matched", tone: "success" },
  unmatched: { label: "Unmatched", tone: "warning" },
};

const TABS = [
  { key: "methods", label: "Payment Methods" },
  { key: "emi", label: "EMI & Installments" },
  { key: "milestones", label: "Milestone Payments" },
  { key: "reminders", label: "Reminders" },
  { key: "transactions", label: "Transactions & Reconciliation" },
];

/* -------------------------------- helpers -------------------------------- */

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(n) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function exportToCSV(data, filename, headers) {
  const csv = [headers.join(",")];
  data.forEach((row) => {
    csv.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Pill({ status, meta }) {
  const m = meta[status] ?? { label: status, tone: "neutral" };
  return <span className={`pill pill--${m.tone}`}>{m.label}</span>;
}

/* --------------------------------- module --------------------------------- */

function downloadEMILog(emi) {
  const logContent = [
    "========================================",
    "           EMI PLAN LOG                 ",
    "========================================",
    "",
    `Plan ID           : ${emi.id}`,
    `Customer          : ${emi.customer}`,
    `Principal         : ${formatCurrency(emi.principal)}`,
    `Tenure            : ${emi.tenureMonths} months`,
    `Monthly Amount    : ${formatCurrency(emi.monthlyAmount)}`,
    `Installments Paid : ${emi.installmentsPaid} of ${emi.tenureMonths}`,
    `Next Due Date     : ${formatDate(emi.nextDueDate)}`,
    `Status            : ${emi.status}`,
    "",
    "========================================",
    `Generated on : ${new Date().toLocaleString()}`,
    "========================================",
  ].join("\n");
  const blob = new Blob([logContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `EMILog_${emi.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadMilestoneLog(project) {
  const paidPct = project.milestones.filter((m) => m.status === "paid").reduce((sum, m) => sum + m.pct, 0);
  const logContent = [
    "========================================",
    "        MILESTONE PAYMENT LOG           ",
    "========================================",
    "",
    `Project ID        : ${project.id}`,
    `Customer          : ${project.customer}`,
    `Total Value       : ${formatCurrency(project.totalValue)}`,
    `Collected         : ${paidPct}%`,
    "",
    "  Milestones:",
    ...project.milestones.map((m) => `    ${m.label} — ${m.status} (${m.date ? formatDate(m.date) : "N/A"})`),
    "",
    "========================================",
    `Generated on : ${new Date().toLocaleString()}`,
    "========================================",
  ].join("\n");
  const blob = new Blob([logContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MilestoneLog_${project.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadReminderLog(r) {
  const logContent = [
    "========================================",
    "         PAYMENT REMINDER LOG           ",
    "========================================",
    "",
    `Reminder ID       : ${r.id}`,
    `Customer          : ${r.customer}`,
    `Linked To         : ${r.linkedTo}`,
    `Channel           : ${r.channel}`,
    `Amount Due        : ${formatCurrency(r.amount)}`,
    `Due Date          : ${formatDate(r.dueDate)}`,
    `Status            : ${r.status}`,
    `Sent Date         : ${formatDate(r.sentDate)}`,
    "",
    "========================================",
    `Generated on : ${new Date().toLocaleString()}`,
    "========================================",
  ].join("\n");
  const blob = new Blob([logContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ReminderLog_${r.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadTransactionLog(t) {
  const logContent = [
    "========================================",
    "        TRANSACTION LOG                 ",
    "========================================",
    "",
    `Transaction ID    : ${t.id}`,
    `Customer          : ${t.customer}`,
    `Payment Method    : ${t.method}`,
    `Amount            : ${formatCurrency(t.amount)}`,
    `Date              : ${formatDate(t.date)}`,
    `Status            : ${t.status}`,
    `Reconciliation    : ${t.reconciled}`,
    "",
    "========================================",
    `Generated on : ${new Date().toLocaleString()}`,
    "========================================",
  ].join("\n");
  const blob = new Blob([logContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `TransactionLog_${t.id}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PaymentModule() {
  const [activeTab, setActiveTab] = useState("methods");
  const [showLogModal, setShowLogModal] = useState(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [emiPage, setEmiPage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);
  const { toast, success } = useLocalToast();
  const { canDo } = useAuth();

  const stats = useMemo(() => {
    const totalCollected = TRANSACTION_DATA.filter((t) => t.status === "success").reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const pendingDues = REMINDER_DATA.reduce((sum, r) => sum + r.amount, 0);
    const activeEmiPlans = EMI_DATA.filter((e) => e.status !== "completed").length;
    const overdueReminders = REMINDER_DATA.filter((r) => r.status === "escalated").length;
    const unmatched = TRANSACTION_DATA.filter((t) => t.reconciled === "unmatched").length;
    return { totalCollected, pendingDues, activeEmiPlans, overdueReminders, unmatched };
  }, []);

  const [recordActivityTarget, setRecordActivityTarget] = useState(null);

  if (recordActivityTarget) {
    return (
      <GenericDetailActivityLog
        moduleKey="payments-activity"
        target={recordActivityTarget}
        onBack={() => setRecordActivityTarget(null)}
      />
    );
  }

  return (
    <div className="payment-module">
      <header className="pm-header">
        <div>
          <h1 className="pm-title">Payment Module</h1>
          <p className="pm-subtitle">
            Accept cards, net banking and UPI, offer EMI or milestone-based
            plans, and keep every rupee reconciled against the bank.
          </p>
        </div>
        {canDo("payments", "create") && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setShowRecordPayment(true)}
          >
            + Record Payment
          </button>
        )}
      </header>

      <section className="pay-stats-grid" aria-label="Payments overview">
        <StatCard
          title="Total Collected"
          value={formatCurrency(stats.totalCollected)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          color="green"
        />
        <StatCard
          title="Pending Dues"
          value={formatCurrency(stats.pendingDues)}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /></svg>}
          color="orange"
        />
        <StatCard
          title="Active EMI Plans"
          value={stats.activeEmiPlans.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>}
          color="blue"
        />
        <StatCard
          title="Escalated Reminders"
          value={stats.overdueReminders.toLocaleString()}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          color="red"
        />
      </section>

      <nav className="pm-tabs" role="tablist" aria-label="Payment sections">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`pm-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="pm-content">
        {activeTab === "methods" && <MethodsPanel canToggle={canDo("payments", "edit")} />}
        {activeTab === "emi" && <EmiPanel currentPage={emiPage} onPageChange={setEmiPage} onView={setSelectedPayment} onDownloadLog={(emi) => setShowLogModal({ type: "emi", data: emi })} canExport={canDo("payments", "export")} />}
        {activeTab === "milestones" && <MilestonesPanel onView={setSelectedPayment} onDownloadLog={(project) => setShowLogModal({ type: "milestone", data: project })} canExport={canDo("payments", "export")} />}
        {activeTab === "reminders" && <RemindersPanel onView={setSelectedPayment} showToast={success} onDownloadLog={(r) => setShowLogModal({ type: "reminder", data: r })} canSend={canDo("payments", "edit")} canExport={canDo("payments", "export")} />}
        {activeTab === "transactions" && <TransactionsPanel currentPage={txnPage} onPageChange={setTxnPage} onView={setSelectedPayment} onDownloadLog={(t) => setShowLogModal({ type: "transaction", data: t })} canExport={canDo("payments", "export")} />}
      </main>

      {showRecordPayment && (
        <RecordPaymentModal onClose={() => setShowRecordPayment(false)} />
      )}

      {selectedPayment && (
        <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} canExport={canDo("payments", "export")} />
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
                  {showLogModal.data.id}
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
                    <span style={{ color: "#64748b" }}>Record Type</span>
                    <span className="cm-status-badge cm-status-active" style={{ fontSize: "11px", padding: "2px 8px" }}>
                      {showLogModal.type.toUpperCase()}
                    </span>
                  </div>
                  {showLogModal.data.status && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Status</span>
                      <span className={`cm-status-badge cm-status-${showLogModal.data.status}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                        {showLogModal.data.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Log Details Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Payment Reference Information
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Customer Name</div>
                    <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.customer}</div>
                  </div>

                  {showLogModal.type === "emi" && (
                    <>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Principal Amount</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatCurrency(showLogModal.data.principal)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Tenure (Months)</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.tenureMonths} months</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Monthly Installment</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatCurrency(showLogModal.data.monthlyAmount)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Installments Paid</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.installmentsPaid} of {showLogModal.data.tenureMonths}</div>
                      </div>
                    </>
                  )}

                  {showLogModal.type === "milestone" && (
                    <>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Total Value</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatCurrency(showLogModal.data.totalValue)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Milestones Count</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.milestones.length} milestones</div>
                      </div>
                    </>
                  )}

                  {showLogModal.type === "reminder" && (
                    <>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Linked Project / Order</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.linkedTo}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Amount Due</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatCurrency(showLogModal.data.amount)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Reminder Channel</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.channel}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Due Date</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatDate(showLogModal.data.dueDate)}</div>
                      </div>
                    </>
                  )}

                  {showLogModal.type === "transaction" && (
                    <>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Payment Method</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.method}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Amount</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatCurrency(showLogModal.data.amount)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Transaction Date</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{formatDate(showLogModal.data.date)}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Reconciliation Status</div>
                        <div style={{ fontWeight: "500", color: "#1e293b", marginTop: "2px" }}>{showLogModal.data.reconciled}</div>
                      </div>
                    </>
                  )}

                </div>
              </div>
            </div>

            <div className="cm-view-modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "14px", marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowLogModal(null)} style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                Close
              </button>
              <button className="cm-btn cm-btn-primary" onClick={() => { 
                if (showLogModal.type === "emi") downloadEMILog(showLogModal.data);
                else if (showLogModal.type === "milestone") downloadMilestoneLog(showLogModal.data);
                else if (showLogModal.type === "reminder") downloadReminderLog(showLogModal.data);
                else if (showLogModal.type === "transaction") downloadTransactionLog(showLogModal.data);
                setShowLogModal(null); 
              }} style={{ background: "#2c5364", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF Log
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastRenderer toast={toast} />
    </div>
  );
}

/* ------------------------------ Payment Methods ------------------------------ */

function MethodsPanel({ canToggle = true }) {
  const [methods, setMethods] = useState(PAYMENT_METHODS);

  function toggleMethod(id) {
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  }

  return (
    <section aria-label="Payment methods">
      <div className="panel-heading">
        <h2>Gateway &amp; Payment Methods</h2>
        <p>Toggle which methods customers see at checkout. Changes apply to new invoices immediately.</p>
      </div>

      <div className="method-grid">
        {methods.map((m) => (
          <article key={m.id} className="method-card">
            <div className="method-card__top">
              <h3>{m.name}</h3>
              <label className="switch" aria-label={`Toggle ${m.name}`}>
                <input
                  type="checkbox"
                  checked={m.enabled}
                  disabled={!canToggle}
                  onChange={() => toggleMethod(m.id)}
                />
                <span className="switch__track">
                  <span className="switch__thumb" />
                </span>
              </label>
            </div>
            <p className="cell-sub">{m.description}</p>
            <div className="method-card__footer">
              <span className="cell-sub">Provider: {m.provider}</span>
              <span className={`pill ${m.enabled ? "pill--success" : "pill--neutral"}`}>
                {m.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- EMI ---------------------------------- */

function EmiPanel({ currentPage, onPageChange, onView, onDownloadLog, canExport = true }) {
  const emiItems = EMI_DATA;
  const totalPages = Math.max(1, Math.ceil(emiItems.length / PAGE_SIZE));
  const paginated = emiItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <section aria-label="EMI and installment plans">
      <div className="panel-heading">
        <h2>EMI &amp; Installment Plans</h2>
        <p>Bank EMI or in-house installments, tracked against the original principal.</p>
      </div>

      <div className="table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Customer</th>
              <th>Principal</th>
              <th>Tenure</th>
              <th>Monthly Installment</th>
              <th>Progress</th>
              <th>Next Due</th>
              <th>Status</th>
              <th aria-label="Actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoader colSpan={8} />
            ) : paginated.map((emi) => {
              const pct = Math.round((emi.installmentsPaid / emi.tenureMonths) * 100);
              return (
                <tr key={emi.id}>
                  <td><code className="txn-id">{emi.id}</code></td>
                  <td className="cell-title">{emi.customer}</td>
                  <td>{formatCurrency(emi.principal)}</td>
                  <td>{emi.tenureMonths} months</td>
                  <td>{formatCurrency(emi.monthlyAmount)}</td>
                  <td>
                    <div className="progress-track" title={`${emi.installmentsPaid} of ${emi.tenureMonths} paid`}>
                      <div className={`progress-fill progress-fill--${emi.status === "overdue" ? "danger" : emi.status === "completed" ? "neutral" : "success"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="cell-sub">{emi.installmentsPaid}/{emi.tenureMonths} installments</div>
                  </td>
                  <td>{formatDate(emi.nextDueDate)}</td>
                  <td><Pill status={emi.status} meta={EMI_STATUS_META} /></td>
                  <td>
                    <div className="act-actions">
                      <button type="button" className="act-btn act-view" onClick={() => onView({ ...emi, _type: "emi" })} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                      {canExport && (
                      <button type="button" className="act-btn act-log" onClick={() => onDownloadLog(emi)} title="Download Log"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={emiItems.length} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      </div>
    </section>
  );
}

/* ------------------------------- Milestones ------------------------------- */

function MilestonesPanel({ onView, onDownloadLog, canExport = true }) {
  return (
    <section aria-label="Milestone-based payments">
      <div className="panel-heading">
        <h2>Milestone-Based Payments</h2>
        <p>Larger installations billed in stages — advance, delivery, install and commissioning.</p>
      </div>

      <div className="milestone-list">
        {MILESTONE_PROJECTS.map((project) => {
          const paidPct = project.milestones
            .filter((m) => m.status === "paid")
            .reduce((sum, m) => sum + m.pct, 0);
          return (
            <article key={project.id} className="milestone-card">
              <div className="milestone-card__header">
                <div>
                  <span className="txn-id">{project.id}</span>
                  <h3 className="milestone-card__title">{project.customer}</h3>
                </div>
                <div className="milestone-card__value">
                  <span className="cell-title">{formatCurrency(project.totalValue)}</span>
                  <span className="cell-sub">{paidPct}% collected</span>
                </div>
              </div>

              <div className="progress-track progress-track--lg">
                <div className="progress-fill progress-fill--success" style={{ width: `${paidPct}%` }} />
              </div>

              <ul className="milestone-steps">
                {project.milestones.map((m, idx) => (
                  <li key={idx} className={`milestone-step milestone-step--${m.status}`}>
                    <span className="milestone-step__label">{m.label}</span>
                    <span className="milestone-step__date cell-sub">
                      {m.status === "paid" ? `Paid ${formatDate(m.date)}` : m.status === "due" ? `Due ${formatDate(m.date)}` : "Not yet due"}
                    </span>
                    <Pill status={m.status} meta={MILESTONE_STATUS_META} />
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <div className="act-actions" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="act-btn act-view" onClick={() => onView({ ...project, _type: "milestone" })} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                  {canExport && (
                  <button type="button" className="act-btn act-log" onClick={() => onDownloadLog(project)} title="Download Log"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- Reminders -------------------------------- */

function RemindersPanel({ onView, showToast, onDownloadLog, canSend = true, canExport = true }) {
  return (
    <section aria-label="Payment reminders">
      <div className="panel-heading">
        <h2>Reminders for Pending Dues</h2>
        <p>Automated nudges across SMS, email and WhatsApp, escalated when a due date is missed.</p>
      </div>

      <div className="table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Reminder</th>
              <th>Customer</th>
              <th>Linked To</th>
              <th>Channel</th>
              <th>Amount Due</th>
              <th>Due Date</th>
              <th>Status</th>
              <th aria-label="Actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {REMINDER_DATA.map((r) => (
              <tr key={r.id}>
                <td>
                  <code className="txn-id">{r.id}</code>
                </td>
                <td className="cell-title">{r.customer}</td>
                <td className="cell-sub">{r.linkedTo}</td>
                <td>
                  <span className="type-tag">{r.channel}</span>
                </td>
                <td>{formatCurrency(r.amount)}</td>
                <td>{formatDate(r.dueDate)}</td>
                <td>
                  <Pill status={r.status} meta={REMINDER_STATUS_META} />
                </td>
                <td>
                  <div className="act-actions">
                    <button type="button" className="act-btn act-view" onClick={() => onView({ ...r, _type: "reminder" })} title="View"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                    {canExport && (
                    <button type="button" className="act-btn act-log" onClick={() => onDownloadLog(r)} title="Download Log"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></button>
                    )}
                  </div>
                  {canSend && (
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => showToast(r.status === "scheduled" ? "Reminder sent to " + r.customer : "Reminder resent to " + r.customer)}>
                      {r.status === "scheduled" ? "Send Now" : "Resend"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------- Transactions ------------------------------- */

function TransactionsPanel({ currentPage, onPageChange, onView, onDownloadLog, canExport = true }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return TRANSACTION_DATA;
    if (statusFilter === "unmatched") return TRANSACTION_DATA.filter((t) => t.reconciled === "unmatched");
    return TRANSACTION_DATA.filter((t) => t.status === statusFilter);
  }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section aria-label="Transaction history and reconciliation">
      <div className="panel-heading">
        <h2>Transaction History &amp; Reconciliation</h2>
        <p>Every gateway transaction, matched automatically against bank settlement reports.</p>
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter transactions">
          {["all", "success", "failed", "refunded", "unmatched"].map((s) => (
            <button
              key={s}
              type="button"
              className={`segmented__option ${statusFilter === s ? "is-active" : ""}`}
              onClick={() => { setStatusFilter(s); onPageChange(1); }}
            >
              {s === "all" ? "All" : s === "unmatched" ? "Unmatched Only" : TXN_STATUS_META[s]?.label ?? s}
            </button>
          ))}
        </div>
        <div className="row-actions">
          {canExport && (
          <button type="button" className="btn btn--ghost btn--small">Export PDF</button>
          )}
          {canExport && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => exportToCSV(TRANSACTION_DATA, "transactions.csv", ["id","customer","method","amount","date","status","reconciled"])}>Export Excel</button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Status</th>
              <th>Reconciliation</th>
              <th aria-label="Actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t) => (
              <tr key={t.id}>
                <td>
                  <code className="txn-id">{t.id}</code>
                </td>
                <td className="cell-title">{t.customer}</td>
                <td>
                  <span className="type-tag">{t.method}</span>
                </td>
                <td className="cell-title">{formatCurrency(t.amount)}</td>
                <td>{formatDate(t.date)}</td>
                <td>
                  <Pill status={t.status} meta={TXN_STATUS_META} />
                </td>
                <td>
                  <Pill status={t.reconciled} meta={RECON_META} />
                </td>
                <td>
                  <div className="act-actions">
                    <button type="button" className="act-btn act-view" onClick={() => onView({ ...t, _type: "transaction" })} title="View Details"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>
                    <ActivityLogButton
                      module="payments"
                      onClick={() => {
                        const payId = t.serverId || t._id || t.id;
                        navigate(`/admin/payment-activity/${payId}`, {
                          state: { target: { recordId: payId, recordLabel: t.id || t.customer, module: "payments" } },
                        });
                      }}
                      title="View Payment Activity Log"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  No transactions in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      </div>
    </section>
  );
}

/* ---------------------------- Record payment modal ---------------------------- */

function RecordPaymentModal({ onClose }) {
  // TODO: connect to API — currently just closes the local form
  function handleSubmit(e) {
    e.preventDefault();
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
      >
        <div className="modal__header">
          <h2 id="record-payment-title">Record Payment</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="modal__form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Customer</span>
              <input type="text" placeholder="Customer or site name" />
            </label>
            <label className="field">
              <span>Linked Invoice / Plan</span>
              <input type="text" placeholder="e.g. INV-2026-0142 or EMI-2201" />
            </label>
            <label className="field">
              <span>Payment Method</span>
              <Dropdown value="UPI" onChange={() => {}} options={[{ value: "UPI", label: "UPI" }, { value: "Card", label: "Card" }, { value: "Net Banking", label: "Net Banking" }, { value: "EMI Auto-Debit", label: "EMI Auto-Debit" }, { value: "Cheque", label: "Cheque" }, { value: "Cash", label: "Cash" }]} variant="form" />
            </label>
            <label className="field">
              <span>Amount (₹)</span>
              <input type="number" min="0" placeholder="e.g. 21500" />
            </label>
            <label className="field">
              <span>Payment Type</span>
              <Dropdown value="Full Payment" onChange={() => {}} options={[{ value: "Full Payment", label: "Full Payment" }, { value: "Partial / Milestone", label: "Partial / Milestone" }, { value: "EMI Installment", label: "EMI Installment" }]} variant="form" />
            </label>
            <label className="field">
              <span>Payment Date</span>
              <input type="date" />
            </label>
          </div>
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Save Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------- Payment detail modal ---------------------------- */

function PaymentDetailModal({ payment: p, onClose, canExport = true }) {
  if (p._type === "emi") {
    const pct = Math.round((p.installmentsPaid / p.tenureMonths) * 100);
    const remaining = p.tenureMonths - p.installmentsPaid;
    return (
      <div className="modal-backdrop">
        <div className="modal modal--wide" role="dialog" aria-modal="true">
          <div className="modal__header">
            <h2>{p.id} — EMI Plan</h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div style={{ padding: "22px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <div><div className="cell-sub">Customer</div><div className="cell-title" style={{ fontSize: 15 }}>{p.customer}</div></div>
              <div><div className="cell-sub">Plan ID</div><code className="invoice-id">{p.id}</code></div>
              <div><div className="cell-sub">Principal Amount</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.principal)}</div></div>
              <div><div className="cell-sub">Monthly Installment</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.monthlyAmount)}</div></div>
              <div><div className="cell-sub">Tenure</div><div className="cell-title" style={{ fontSize: 15 }}>{p.tenureMonths} months</div></div>
              <div><div className="cell-sub">Next Due Date</div><div className="cell-title" style={{ fontSize: 15 }}>{formatDate(p.nextDueDate)}</div></div>
              <div><div className="cell-sub">Status</div><Pill status={p.status} meta={EMI_STATUS_META} /></div>
              <div><div className="cell-sub">Completed</div><div className="cell-title" style={{ fontSize: 15 }}>{p.installmentsPaid} of {p.tenureMonths} installments</div></div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div className="cell-sub" style={{ marginBottom: 6 }}>Payment Progress</div>
              <div className="progress-track" style={{ height: 12, borderRadius: 6 }}>
                <div className={`progress-fill progress-fill--${p.status === "overdue" ? "danger" : "success"}`} style={{ width: `${pct}%`, borderRadius: 6 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span className="cell-sub">{pct}% paid</span>
                <span className="cell-sub">{remaining} installments remaining</span>
              </div>
            </div>
          </div>
          <div className="modal__footer">
            <button type="button" className="modal-footer-close" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (p._type === "milestone") {
    const paidPct = p.milestones.filter((m) => m.status === "paid").reduce((sum, m) => sum + m.pct, 0);
    return (
      <div className="modal-backdrop">
        <div className="modal modal--wide" role="dialog" aria-modal="true">
          <div className="modal__header">
            <h2>{p.id} — {p.customer}</h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div style={{ padding: "22px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: 20 }}>
              <div><div className="cell-sub">Project ID</div><code className="invoice-id">{p.id}</code></div>
              <div><div className="cell-sub">Total Value</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.totalValue)}</div></div>
              <div><div className="cell-sub">Collected</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.totalValue * paidPct / 100)} ({paidPct}%)</div></div>
              <div><div className="cell-sub">Remaining</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.totalValue * (100 - paidPct) / 100)} ({100 - paidPct}%)</div></div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="cell-sub" style={{ marginBottom: 6 }}>Overall Progress</div>
              <div className="progress-track" style={{ height: 12, borderRadius: 6 }}>
                <div className="progress-fill progress-fill--success" style={{ width: `${paidPct}%`, borderRadius: 6 }} />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div className="cell-sub" style={{ marginBottom: 8, fontWeight: 600 }}>Milestone Breakdown</div>
              {p.milestones.map((m, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: idx < p.milestones.length - 1 ? "1px solid var(--pm-border)" : "none" }}>
                  <div>
                    <div className="cell-title" style={{ fontSize: 14 }}>{m.label}</div>
                    <div className="cell-sub">{m.date ? formatDate(m.date) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="cell-title" style={{ fontSize: 14 }}>{m.pct}% — {formatCurrency(p.totalValue * m.pct / 100)}</div>
                    <Pill status={m.status} meta={MILESTONE_STATUS_META} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal__footer">
            <button type="button" className="modal-footer-close" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (p._type === "reminder") {
    return (
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__header">
            <h2>{p.id} — Payment Reminder</h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div style={{ padding: "22px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <div><div className="cell-sub">Reminder ID</div><code className="invoice-id">{p.id}</code></div>
              <div><div className="cell-sub">Customer</div><div className="cell-title" style={{ fontSize: 15 }}>{p.customer}</div></div>
              <div><div className="cell-sub">Linked To</div><div className="cell-title" style={{ fontSize: 15 }}>{p.linkedTo}</div></div>
              <div><div className="cell-sub">Channel</div><span className="type-tag">{p.channel}</span></div>
              <div><div className="cell-sub">Amount Due</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.amount)}</div></div>
              <div><div className="cell-sub">Due Date</div><div className="cell-title" style={{ fontSize: 15 }}>{formatDate(p.dueDate)}</div></div>
              <div><div className="cell-sub">Status</div><Pill status={p.status} meta={REMINDER_STATUS_META} /></div>
            </div>
          </div>
          <div className="modal__footer">
            <button type="button" className="modal-footer-close" onClick={onClose}>Close</button>
            <button type="button" className="btn btn--primary">{p.status === "scheduled" ? "Send Now" : "Resend"}</button>
          </div>
        </div>
      </div>
    );
  }

  // Transaction detail
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2>{p.id} — Transaction</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ padding: "22px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
            <div><div className="cell-sub">Transaction ID</div><code className="invoice-id">{p.id}</code></div>
            <div><div className="cell-sub">Customer</div><div className="cell-title" style={{ fontSize: 15 }}>{p.customer}</div></div>
            <div><div className="cell-sub">Payment Method</div><span className="type-tag">{p.method}</span></div>
            <div><div className="cell-sub">Amount</div><div className="cell-title" style={{ fontSize: 15 }}>{formatCurrency(p.amount)}</div></div>
            <div><div className="cell-sub">Date</div><div className="cell-title" style={{ fontSize: 15 }}>{formatDate(p.date)}</div></div>
            <div><div className="cell-sub">Status</div><Pill status={p.status} meta={TXN_STATUS_META} /></div>
            <div><div className="cell-sub">Reconciliation</div><Pill status={p.reconciled} meta={RECON_META} /></div>
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="modal-footer-close" onClick={onClose}>Close</button>
          {canExport && (
          <button type="button" className="btn btn--secondary">Export PDF</button>
          )}
        </div>
      </div>
    </div>
  );
}