import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { customerAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { PageLoader } from "../../components/common";
import "./CustomerProgress.css";

/* ─────────── Helpers ─────────── */

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
};

const fmtINR = (v) => {
  const num = Number(String(v ?? 0).replace(/[₹,]/g, ""));
  return Number.isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN")}`;
};

const chipClass = (v) => {
  const s = String(v || "").toLowerCase();
  if (
    ["completed", "approved", "connected", "signed", "delivered", "pass",
      "paid", "active", "verified", "released", "converted", "installed",
      "resolved", "closed"].some((x) => s.includes(x))
  ) return "cp-chip-green";
  if (
    ["rejected", "fail", "failed", "expired", "lost", "cancelled", "blocked",
      "on hold", "inactive"].some((x) => s.includes(x))
  ) return "cp-chip-red";
  if (
    ["in progress", "pending", "negotiating", "sent", "processing",
      "under review", "under verification", "submitted", "draft",
      "partially paid", "expiring", "not started", "scheduled"].some((x) => s.includes(x))
  ) return "cp-chip-amber";
  return "cp-chip-gray";
};

const StatusChip = ({ value }) => {
  const v = String(value ?? "");
  if (!v || v === "—" || v === "N/A") return <span className="cp-na">—</span>;
  return <span className={`cp-chip ${chipClass(v)}`}>{v}</span>;
};

const milestoneClass = (v) =>
  v === "Completed"
    ? "cp-milestone-done"
    : v === "In Progress"
      ? "cp-milestone-progress"
      : "cp-milestone-todo";

const MILESTONES = [
  { key: "leadCreated", label: "Lead Created" },
  { key: "surveyCompleted", label: "Survey Completed" },
  { key: "quotationApproved", label: "Quotation Approved" },
  { key: "paymentReceived", label: "Payment Received" },
  { key: "materialProcured", label: "Material Procured" },
  { key: "installationStarted", label: "Installation Started" },
  { key: "testingCompleted", label: "Testing Completed" },
  { key: "commissioningCompleted", label: "Commissioning Completed" },
  { key: "handoverCompleted", label: "Handover Completed" },
];

/* ─────────── Record Section (generic table) ─────────── */

const RecordSection = ({ title, records, columns }) => {
  if (!records || records.length === 0) return null;
  return (
    <div className="cp-section">
      <div className="cp-section-header">
        <h3>{title}</h3>
        <span className="cp-section-count">{records.length}</span>
      </div>
      <div className="cp-table-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((rec, i) => (
              <tr key={rec._id || rec.id || i}>
                {columns.map((c) => (
                  <td key={c.label}>{c.render(rec)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─────────── Component ─────────── */

const CustomerProgress = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canDo } = useAuth();
  const customerId = (searchParams.get("customerId") || "").trim();

  /* ── Create a site survey for this customer ──
   *  Site surveys are tied to the customer's lead, so jump to the Site Survey
   *  module with the new-survey form pre-filled for this customer. */
  const handleCreateSurvey = () => {
    const leadId = data?.lead?.leadId || data?.customer?.leadId;
    if (!leadId) return;
    const params = new URLSearchParams({
      createForLead: leadId,
      customerId: data.customer.customerId || "",
      customerName: data.customer.name || "",
      projectType: data.customer.type || "",
    });
    navigate(`/admin/site-survey?${params.toString()}`);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customerProfile", customerId],
    queryFn: async () => {
      const response = await customerAPI.getProfile(customerId);
      return response.data.data;
    },
    enabled: !!customerId,
    retry: 1,
  });

  /* ── Project journey stepper state ── */
  const steps = useMemo(() => {
    if (!data) return [];
    const pp = data.projectProgress || [];
    const milestones = (k) =>
      pp.map((p) => (p.milestones || {})[k]).filter(Boolean);
    const hasAny = (arr) => (arr || []).length > 0;

    const stepState = (key) => {
      switch (key) {
        case "lead":
          return "done";
        case "survey":
          if (milestones("surveyCompleted").includes("Completed")) return "done";
          if (milestones("surveyCompleted").includes("In Progress")) return "progress";
          return hasAny(data.siteSurveys) ? "done" : "todo";
        case "design":
          return hasAny(data.solarDesigns) ? "done" : "todo";
        case "quotation":
          if (milestones("quotationApproved").includes("Completed")) return "done";
          if (milestones("quotationApproved").includes("In Progress")) return "progress";
          if (hasAny(data.quotations)) {
            return data.quotations.some((q) => q.status === "Approved") ? "done" : "progress";
          }
          return "todo";
        case "approval":
          if (hasAny(data.projectApprovals)) {
            return data.projectApprovals.some((a) => a.status === "Approved") ? "done" : "progress";
          }
          return "todo";
        case "installation":
          if (milestones("installationStarted").includes("Completed")) return "done";
          if (milestones("installationStarted").includes("In Progress")) return "progress";
          if (hasAny(data.installations)) {
            return data.installations.some((i) => i.installationStatus === "Completed") ? "done" : "progress";
          }
          return "todo";
        case "testing":
          if (milestones("testingCompleted").includes("Completed")) return "done";
          if (milestones("testingCompleted").includes("In Progress")) return "progress";
          if (hasAny(data.testingRecords)) {
            return data.testingRecords.some((t) => t.testResult === "Pass") ? "done" : "progress";
          }
          return "todo";
        case "commissioning":
          if (milestones("commissioningCompleted").includes("Completed")) return "done";
          if (hasAny(data.commissioningRecords)) {
            return data.commissioningRecords.some((c) => c.commissioningDate) ? "done" : "progress";
          }
          return "todo";
        case "handover":
          if (milestones("handoverCompleted").includes("Completed")) return "done";
          if (hasAny(data.commissioningRecords)) {
            return data.commissioningRecords.some(
              (c) => c.customerSigned === "Signed" && c.documentsDelivered === "Delivered"
            )
              ? "done"
              : "progress";
          }
          return "todo";
        default:
          return "todo";
      }
    };

    return [
      { key: "lead", label: "Lead" },
      { key: "survey", label: "Site Survey" },
      { key: "design", label: "Solar Design" },
      { key: "quotation", label: "Quotation" },
      { key: "approval", label: "Approval" },
      { key: "installation", label: "Installation" },
      { key: "testing", label: "Testing" },
      { key: "commissioning", label: "Commissioning" },
      { key: "handover", label: "Handover" },
    ].map((s) => ({ ...s, state: stepState(s.key) }));
  }, [data]);

  const projectProgressCount = data?.projectProgress?.length || 0;
  const completedCount = useMemo(() => steps.filter((s) => s.state === "done").length, [steps]);

  /* ── Render states ── */
  if (!customerId) {
    return (
      <div className="cp-container">
        <div className="cp-empty-card">
          <h3>No customer selected</h3>
          <p>Open this page by clicking a converted client's name in the Lead Management table.</p>
          <button className="cp-back-btn" onClick={() => navigate("/admin/customers")}>
            ← Back to Leads
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="cp-container">
        <PageLoader minHeight="300px" />
      </div>
    );
  }

  if (isError || !data?.customer) {
    return (
      <div className="cp-container">
        <div className="cp-empty-card">
          <h3>Customer not found</h3>
          <p>We couldn't load this customer's profile. It may have been deleted or you may not have access.</p>
          <button className="cp-back-btn" onClick={() => navigate("/admin/customers")}>
            ← Back to Leads
          </button>
        </div>
      </div>
    );
  }

  const c = data.customer;
  const canCreateSurvey = canDo("site-survey", "create");
  const customerLeadId = data.lead?.leadId || c.leadId;
  const hasAnyProjectData =
    projectProgressCount > 0 ||
    (data.quotations || []).length > 0 ||
    (data.siteSurveys || []).length > 0 ||
    (data.solarDesigns || []).length > 0 ||
    (data.projectApprovals || []).length > 0 ||
    (data.installations || []).length > 0 ||
    (data.testingRecords || []).length > 0 ||
    (data.commissioningRecords || []).length > 0 ||
    (data.taskAssignments || []).length > 0 ||
    (data.serviceVisits || []).length > 0 ||
    (data.maintenanceTickets || []).length > 0 ||
    (data.tickets || []).length > 0 ||
    (data.warranties || []).length > 0 ||
    (data.warrantyClaims || []).length > 0;

  return (
    <div className="cp-container">
      {/* ── Header ── */}
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/admin/customers")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Leads
        </button>
        <div className="cp-header-title">
          <h2>Customer Progress</h2>
          <p>Complete profile and project journey for {c.name}</p>
        </div>
      </div>

      {/* ── Customer Profile Card ── */}
      <div className="cp-profile-card">
        <div className="cp-profile-top">
          <div className="cp-avatar">{String(c.name || "?").charAt(0).toUpperCase()}</div>
          <div className="cp-profile-name">
            <h3>{c.name}</h3>
            <div className="cp-profile-badges">
              <span className="cp-badge cp-badge-id">{c.customerId}</span>
              <span className={`cp-badge cp-badge-status cp-badge-${String(c.status || "").toLowerCase()}`}>
                {c.status}
              </span>
              <span className={`cp-badge cp-badge-type cp-badge-${String(c.type || "").toLowerCase()}`}>
                {c.type}
              </span>
              {data.lead?.leadId && <span className="cp-badge cp-badge-lead">From Lead {data.lead.leadId}</span>}
            </div>
          </div>
          {canCreateSurvey && customerLeadId && (() => {
            const alreadyDone = (data.siteSurveys || []).length > 0;
            return (
              <button
                type="button"
                className={`cp-survey-btn${alreadyDone ? " cp-survey-btn-disabled" : ""}`}
                onClick={!alreadyDone ? handleCreateSurvey : undefined}
                disabled={alreadyDone}
                title={alreadyDone ? "Site survey already completed for this customer" : "Schedule a site visit for this customer"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Create Site Survey
              </button>
            );
          })()}
        </div>
        <div className="cp-profile-grid">
          <div className="cp-profile-item">
            <span className="cp-profile-label">Email</span>
            <span className="cp-profile-value">{c.email}</span>
          </div>
          <div className="cp-profile-item">
            <span className="cp-profile-label">Phone</span>
            <span className="cp-profile-value">{c.phone}</span>
          </div>
          <div className="cp-profile-item">
            <span className="cp-profile-label">Address</span>
            <span className="cp-profile-value">{c.address}</span>
          </div>
          <div className="cp-profile-item">
            <span className="cp-profile-label">Capacity</span>
            <span className="cp-profile-value">{c.capacity || "—"}</span>
          </div>
          <div className="cp-profile-item">
            <span className="cp-profile-label">Join Date</span>
            <span className="cp-profile-value">{fmtDate(c.joinDate)}</span>
          </div>
          <div className="cp-profile-item">
            <span className="cp-profile-label">Total Projects</span>
            <span className="cp-profile-value">{c.totalProjects ?? 0}</span>
          </div>
        </div>
        {c.notes && (
          <div className="cp-profile-notes">
            <span className="cp-profile-label">Notes</span>
            <p>{c.notes}</p>
          </div>
        )}
      </div>

      {/* ── Project Journey Stepper ── */}
      {steps.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-header">
            <h3>Project Journey</h3>
            <span className="cp-section-sub">
              {completedCount}/{steps.length} stages completed
            </span>
          </div>
          <div className="cp-stepper">
            {steps.map((s, i) => (
              <div key={s.key} className="cp-step">
                <div className={`cp-step-dot cp-step-${s.state}`}>
                  {s.state === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="cp-step-label">{s.label}</span>
                {i < steps.length - 1 && (
                  <div className={`cp-step-line cp-step-line-${s.state === "done" ? "done" : "todo"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Project Progress (milestones) ── */}
      {projectProgressCount > 0 && (
        <div className="cp-section">
          <div className="cp-section-header">
            <h3>Project Progress</h3>
            <span className="cp-section-count">{projectProgressCount}</span>
          </div>
          <div className="cp-progress-list">
            {data.projectProgress.map((p) => {
              const pct = Number(p.completionPercentage) || 0;
              return (
                <div key={p._id || p.projectId} className="cp-progress-card">
                  <div className="cp-progress-top">
                    <div>
                      <h4>{p.projectName}</h4>
                      <span className="cp-progress-id">{p.projectId || p._id}</span>
                    </div>
                    <div className="cp-progress-meta">
                      <StatusChip value={p.projectStatus} />
                      <span className={`cp-health cp-health-${String(p.healthScore || "").toLowerCase()}`}>
                        {p.healthScore}
                      </span>
                    </div>
                  </div>
                  <div className="cp-progress-bar-row">
                    <div className="cp-progress-bar">
                      <div className="cp-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="cp-progress-pct">{pct}%</span>
                  </div>
                  <div className="cp-progress-dates">
                    <span>Start: {fmtDate(p.startDate)}</span>
                    <span>Expected End: {fmtDate(p.expectedEndDate)}</span>
                    {p.delayStatus === "Yes" && <span className="cp-delay">Delayed: {p.delayReason || "Yes"}</span>}
                  </div>
                  <div className="cp-milestones">
                    {MILESTONES.map((m) => (
                      <div key={m.key} className={`cp-milestone ${milestoneClass((p.milestones || {})[m.key])}`}>
                        <span className="cp-milestone-dot" />
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Record Sections ── */}
      <RecordSection
        title="Quotations"
        records={data.quotations}
        columns={[
          { label: "Quotation ID", render: (q) => q.quotationId || q._id },
          { label: "Project", render: (q) => q.projectName || q.client || "—" },
          { label: "Status", render: (q) => <StatusChip value={q.status} /> },
          { label: "Grand Total", render: (q) => fmtINR(q.grandTotal ?? q.total) },
          { label: "Valid Until", render: (q) => fmtDate(q.validUntil) },
          { label: "Created", render: (q) => fmtDate(q.createdAt) },
        ]}
      />

      <RecordSection
        title="Site Surveys"
        records={data.siteSurveys}
        columns={[
          { label: "Survey ID", render: (s) => s.surveyId || s._id },
          { label: "Project", render: (s) => s.projectName || "—" },
          { label: "Visit Date", render: (s) => fmtDate(s.visitDate) },
          { label: "Visit Status", render: (s) => <StatusChip value={s.visitStatus} /> },
          { label: "Roof", render: (s) => `${s.roofType || "—"} (${s.roofLength || "?"}×${s.roofWidth || "?"}m)` },
          { label: "Technician", render: (s) => s.technicianName || "—" },
        ]}
      />

      <RecordSection
        title="Solar Designs"
        records={data.solarDesigns}
        columns={[
          { label: "Design ID", render: (d) => d.designId || d._id },
          { label: "Project", render: (d) => d.projectName || "—" },
          { label: "Recommended", render: (d) => `${d.recommendedCapacity || 0} kW` },
          { label: "Panels", render: (d) => d.panelCount || 0 },
          { label: "Est. Cost", render: (d) => fmtINR(d.estimatedSystemCost) },
          { label: "Payback", render: (d) => `${d.paybackPeriod || 0} yrs` },
        ]}
      />

      <RecordSection
        title="Project Approvals"
        records={data.projectApprovals}
        columns={[
          { label: "Approval ID", render: (a) => a.approvalId || a._id },
          { label: "Project", render: (a) => a.projectName || "—" },
          { label: "Capacity", render: (a) => `${a.capacity || 0} kW` },
          { label: "Est. Cost", render: (a) => fmtINR(a.estimatedCost) },
          { label: "Submitted", render: (a) => fmtDate(a.submittedDate) },
          { label: "Status", render: (a) => <StatusChip value={a.status} /> },
        ]}
      />

      <RecordSection
        title="Installations"
        records={data.installations}
        columns={[
          { label: "Installation ID", render: (i) => i.installationId || i._id },
          { label: "Date", render: (i) => fmtDate(i.installationDate) },
          { label: "Status", render: (i) => <StatusChip value={i.installationStatus} /> },
          { label: "Technician", render: (i) => i.technicianName || "—" },
          { label: "Verification", render: (i) => <StatusChip value={i.verificationStatus} /> },
          { label: "Address", render: (i) => i.installationAddress || "—" },
        ]}
      />

      <RecordSection
        title="Testing"
        records={data.testingRecords}
        columns={[
          { label: "Test ID", render: (t) => t.testId || t._id },
          { label: "Test Date", render: (t) => fmtDate(t.testDate) },
          { label: "Engineer", render: (t) => t.engineerName || "—" },
          { label: "Electrical", render: (t) => <StatusChip value={t.electricalTest} /> },
          { label: "Result", render: (t) => <StatusChip value={t.testResult} /> },
        ]}
      />

      <RecordSection
        title="Commissioning & Handover"
        records={data.commissioningRecords}
        columns={[
          { label: "Record ID", render: (c) => c.recordId || c._id },
          { label: "Project", render: (c) => c.projectName || "—" },
          { label: "Commissioning", render: (c) => fmtDate(c.commissioningDate) },
          { label: "Grid", render: (c) => <StatusChip value={c.gridConnected} /> },
          { label: "Net Meter", render: (c) => <StatusChip value={c.netMeterInstalled} /> },
          { label: "Handover", render: (c) => fmtDate(c.handoverDate) },
          { label: "Signed", render: (c) => <StatusChip value={c.customerSigned} /> },
        ]}
      />

      <RecordSection
        title="AMC Contracts"
        records={data.amcs}
        columns={[
          { label: "AMC ID", render: (a) => a.amcId || a._id },
          { label: "System", render: (a) => a.system || "—" },
          { label: "Plan", render: (a) => a.plan || "—" },
          { label: "Period", render: (a) => `${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}` },
          { label: "Amount", render: (a) => fmtINR(a.amount) },
          { label: "Status", render: (a) => <StatusChip value={a.status} /> },
        ]}
      />

      <RecordSection
        title="Invoices"
        records={data.invoices}
        columns={[
          { label: "Invoice No.", render: (i) => i.invoiceNumber || "—" },
          { label: "Project", render: (i) => i.projectName || "—" },
          { label: "Date", render: (i) => fmtDate(i.invoiceDate) },
          { label: "Total", render: (i) => fmtINR(i.totalAmount) },
          { label: "Payment", render: (i) => <StatusChip value={i.paymentStatus} /> },
        ]}
      />

      <RecordSection
        title="Subsidies"
        records={data.subsidies}
        columns={[
          { label: "Application No.", render: (s) => s.applicationNumber || "—" },
          { label: "Project", render: (s) => s.projectName || "—" },
          { label: "Scheme", render: (s) => s.schemeName || "—" },
          { label: "Status", render: (s) => <StatusChip value={s.status} /> },
          { label: "Subsidy Amount", render: (s) => fmtINR(s.subsidyAmount) },
          { label: "Payment", render: (s) => <StatusChip value={s.paymentStatus} /> },
        ]}
      />

      <RecordSection
        title="Assigned Technicians"
        records={data.taskAssignments}
        columns={[
          { label: "Technician", render: (t) => t.technicianName || "—" },
          { label: "Job", render: (t) => t.jobTitle || "—" },
          { label: "Installation", render: (t) => t.installationId || "—" },
          { label: "Assigned", render: (t) => fmtDate(t.assignedDate) },
          { label: "Due", render: (t) => fmtDate(t.dueDate) },
          { label: "Status", render: (t) => <StatusChip value={t.status} /> },
        ]}
      />

      <RecordSection
        title="Service Visits"
        records={data.serviceVisits}
        columns={[
          { label: "Visit ID", render: (v) => v.visitId || v._id },
          { label: "Date", render: (v) => fmtDate(v.date) },
          { label: "Technician", render: (v) => v.technician || "—" },
          { label: "Linked To", render: (v) => v.linkType || "—" },
          { label: "Status", render: (v) => <StatusChip value={v.status} /> },
          { label: "Notes", render: (v) => v.notes || "—" },
        ]}
      />

      <RecordSection
        title="Maintenance Tickets"
        records={data.maintenanceTickets}
        columns={[
          { label: "Ticket ID", render: (t) => t.ticketId || t._id },
          { label: "Type", render: (t) => t.type || "—" },
          { label: "System", render: (t) => t.system || "—" },
          { label: "Priority", render: (t) => <StatusChip value={t.priority} /> },
          { label: "Technician", render: (t) => t.assignedTech || "Unassigned" },
          { label: "Status", render: (t) => <StatusChip value={t.status} /> },
          { label: "Created", render: (t) => fmtDate(t.createdDate) },
        ]}
      />

      <RecordSection
        title="Support Tickets"
        records={data.tickets}
        columns={[
          { label: "Subject", render: (t) => t.subject || "—" },
          { label: "Category", render: (t) => t.category || "—" },
          { label: "Priority", render: (t) => <StatusChip value={t.priority} /> },
          { label: "Agent", render: (t) => t.assignedAgent || "Unassigned" },
          { label: "Status", render: (t) => <StatusChip value={t.status} /> },
          { label: "Created", render: (t) => fmtDate(t.createdAt) },
        ]}
      />

      <RecordSection
        title="Warranties"
        records={data.warranties}
        columns={[
          { label: "Warranty ID", render: (w) => w.warrantyId || w._id },
          { label: "Component", render: (w) => w.component || "—" },
          { label: "Model", render: (w) => w.model || "—" },
          { label: "Serial", render: (w) => w.serial || "—" },
          { label: "Installed", render: (w) => fmtDate(w.installed) },
          { label: "Expires", render: (w) => fmtDate(w.expires) },
          { label: "Coverage", render: (w) => w.coverage || "—" },
          { label: "Status", render: (w) => <StatusChip value={w.status} /> },
        ]}
      />

      <RecordSection
        title="Warranty Claims"
        records={data.warrantyClaims}
        columns={[
          { label: "Claim ID", render: (c) => c.claimId || c._id },
          { label: "Warranty", render: (c) => c.warrantyId || "—" },
          { label: "Component", render: (c) => c.component || "—" },
          { label: "Issue", render: (c) => c.issue || "—" },
          { label: "Priority", render: (c) => <StatusChip value={c.priority} /> },
          { label: "Submitted", render: (c) => fmtDate(c.submitted) },
        ]}
      />

      {/* ── Empty state when no project records exist yet ── */}
      {!hasAnyProjectData && (
        <div className="cp-section">
          <div className="cp-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
            <p>No project activity yet for this customer</p>
            <span>Project records (surveys, quotations, installations, etc.) will appear here as the customer moves through the pipeline.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerProgress;
