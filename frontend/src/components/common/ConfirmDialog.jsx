import React from "react";
import "./ConfirmDialog.css";

/**
 * ConfirmDialog
 * Reusable confirmation modal for delete, deactivate, and other destructive actions.
 *
 * Props:
 *   isOpen    : boolean
 *   title     : string        (e.g. "Delete Invoice")
 *   message   : string        (e.g. "Are you sure you want to delete INV-2026-0142?")
 *   confirmLabel : string     (default "Confirm")
 *   cancelLabel  : string     (default "Cancel")
 *   variant      : "danger" | "warning" | "neutral"  (default "danger")
 *   onConfirm : () => void
 *   onCancel  : () => void
 *   loading   : boolean       (show loading state on confirm button)
 */

function ConfirmDialog({
  isOpen,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  onClose,
  loading = false,
}) {
  if (!isOpen) return null;

  const handleClose = onCancel || onClose;

  const variantStyles = {
    danger: { icon: "⚠", iconBg: "#f8e3e1", iconColor: "#c1443c", btnClass: "shared-confirm__btn--danger" },
    warning: { icon: "⚡", iconBg: "#fbecd7", iconColor: "#c8862a", btnClass: "shared-confirm__btn--warning" },
    neutral: { icon: "ℹ", iconBg: "#e9edea", iconColor: "#5c6f68", btnClass: "shared-confirm__btn--neutral" },
  };

  const style = variantStyles[variant] || variantStyles.danger;

  return (
    <div className="shared-confirm-backdrop">
      <div
        className="shared-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <button
          type="button"
          className="shared-confirm__close-btn"
          onClick={handleClose}
          disabled={loading}
          aria-label="Close dialog"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="shared-confirm__icon-wrap" style={{ background: style.iconBg, color: style.iconColor }}>
          <span className="shared-confirm__icon">{style.icon}</span>
        </div>

        <h2 id="confirm-dialog-title" className="shared-confirm__title">{title}</h2>
        <p className="shared-confirm__message">{message}</p>

        <div className="shared-confirm__actions">
          <button
            type="button"
            className="shared-confirm__btn shared-confirm__btn--cancel"
            onClick={handleClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`shared-confirm__btn ${style.btnClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ConfirmDialog);
