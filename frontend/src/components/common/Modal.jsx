import React, { useEffect } from "react";
import "./Modal.css";

/**
 * Universal Reusable Modal Component
 *
 * @param {boolean} isOpen Visibility flag
 * @param {Function} onClose Close callback handler
 * @param {string|React.ReactNode} title Modal title
 * @param {string} size Modal size ('sm', 'md', 'lg', 'xl')
 * @param {React.ReactNode} footer Optional custom footer controls
 * @param {React.ReactNode} children Modal content body
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  size = "md",
  footer,
  children,
  className = "",
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="common-modal-overlay">
      <div className={`common-modal-container size-${size} ${className}`}>
        {title && (
          <div className="common-modal-header">
            <h3 className="common-modal-title">{title}</h3>
            {onClose && (
              <button
                type="button"
                className="common-modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="common-modal-body">{children}</div>
        {footer && <div className="common-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default React.memo(Modal);
