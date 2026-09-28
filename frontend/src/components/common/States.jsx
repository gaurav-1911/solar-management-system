import React from "react";
import "./States.css";

/** Full-block error state with a retry action. */
export function ErrorState({ message, onRetry, title = "Something went wrong" }) {
  return (
    <div className="state-error" role="alert">
      <div className="state-error__icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h4>{title}</h4>
      <p>{message || "We couldn't load this data. Check your connection and try again."}</p>
      {onRetry && (
        <button type="button" className="state-error__btn" onClick={onRetry}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Retry
        </button>
      )}
    </div>
  );
}

/** Slim inline notice shown when the API failed and cached data is displayed. */
export function OfflineBanner({ message, onRetry }) {
  return (
    <div className="state-offline" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <span>{message || "Couldn't reach the server — showing cached data."}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
