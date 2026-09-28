import React, { useEffect } from "react";
import "./ImageLightbox.css";
 
/**
 * ImageLightbox
 * Fullscreen image viewer shown when a photo thumbnail is clicked.
 * Closes on backdrop click, the close button, or the Escape key.
 */
export default function ImageLightbox({ src, alt = "", onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [src, onClose]);
 
  if (!src) return null;
 
  return (
    <div className="ilb-overlay" role="dialog" aria-modal="true">
      <button type="button" className="ilb-close" onClick={onClose} aria-label="Close preview" title="Close (Esc)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="ilb-content" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || "preview"} className="ilb-img" />
        {alt && <span className="ilb-caption">{alt}</span>}
      </div>
    </div>
  );
}