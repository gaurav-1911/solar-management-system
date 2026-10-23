import React from "react";
import "./StatusBadge.css";

/**
 * Maps known status strings across all modules to semantic color tones.
 */
const TONE_MAP = {
  // Success / Green
  active: "success",
  completed: "success",
  approved: "success",
  converted: "success",
  paid: "success",
  resolved: "success",
  present: "success",
  operational: "success",
  healthy: "success",
  passed: "success",
  verified: "success",

  // Warning / Amber / Orange
  pending: "warning",
  "in-progress": "warning",
  "in progress": "warning",
  inprogress: "warning",
  interested: "warning",
  contacted: "warning",
  "under review": "warning",
  "in review": "warning",
  "low stock": "warning",
  "low-stock": "warning",
  "half day": "warning",
  halfday: "warning",
  medium: "warning",
  degraded: "warning",

  // Danger / Red
  inactive: "danger",
  rejected: "danger",
  lost: "danger",
  failed: "danger",
  cancelled: "danger",
  canceled: "danger",
  unpaid: "danger",
  overdue: "danger",
  critical: "danger",
  high: "danger",
  absent: "danger",
  offline: "danger",
  expired: "danger",

  // Info / Blue / Cyan
  new: "info",
  scheduled: "info",
  assigned: "info",
  draft: "info",
  open: "info",
  residential: "info",
  commercial: "info",
  "on leave": "info",
  onleave: "info",
  low: "info",
};

/**
 * Reusable StatusBadge Component
 * 
 * Renders status pills consistently across CRM, Projects, Finance, Inventory,
 * Technicians, Monitoring, and Reports.
 * 
 * @param {Object} props
 * @param {string} [props.status=""] Status identifier or display text
 * @param {string} [props.variant] Optional explicit tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
 * @param {string} [props.size="md"] Badge size: 'sm' | 'md' | 'lg'
 * @param {boolean} [props.dot=true] Render a status dot indicator
 * @param {string} [props.label] Optional custom label override
 * @param {string} [props.className=""] Additional CSS classes
 */
const StatusBadge = ({
  status = "",
  variant,
  size = "md",
  dot = true,
  label,
  className = "",
}) => {
  const normalizedKey = String(status || "").trim().toLowerCase();
  const tone = variant || TONE_MAP[normalizedKey] || "neutral";
  const displayLabel = label || status || "—";

  return (
    <span
      className={`status-pill status-pill--${tone} status-pill--${size} ${className}`.trim()}
      role="status"
    >
      {dot && <span className="status-pill-dot" aria-hidden="true" />}
      <span className="status-pill-text">{displayLabel}</span>
    </span>
  );
};

export default StatusBadge;
