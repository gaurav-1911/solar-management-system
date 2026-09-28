import React, { useEffect, useRef } from "react";
import "./FilterDrawer.css";

const FilterDrawer = ({ open, onClose, title, children }) => {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  return (
    <>
      <div className={"fd-overlay " + (open ? "fd-overlay--open" : "")} />
      <div ref={panelRef} className={"fd-panel " + (open ? "fd-panel--open" : "")} role="dialog" aria-modal="true">
        <div className="fd-header">
          <h3 className="fd-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="20" y2="12" />
              <line x1="12" y1="18" x2="20" y2="18" />
            </svg>
            {title || "Filters"}
          </h3>
          <button className="fd-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="fd-body">
          {children}
        </div>
      </div>
    </>
  );
};

export default React.memo(FilterDrawer);
