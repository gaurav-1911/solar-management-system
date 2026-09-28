import React from "react";
import "./SkeletonLoader.css";

/**
 * 1. CardSkeleton: KPI / Stat cards placeholder loader
 */
export const CardSkeleton = ({ count = 4 }) => {
  return (
    <div className="card-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-skeleton-item">
          <div className="skeleton-box card-skeleton-icon" />
          <div className="card-skeleton-content">
            <div className="skeleton-box card-skeleton-label" />
            <div className="skeleton-box card-skeleton-val" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 2. TableSkeleton: Table data shimmering rows loader (used inside <tbody>)
 */
export const TableSkeleton = ({ colSpan = 8, rows = 5 }) => {
  const widths = ["15%", "25%", "20%", "15%", "10%", "15%"];
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="table-loader-row">
          <td colSpan={colSpan} style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
              <div className="skeleton-box table-skeleton-cell-circle" />
              {Array.from({ length: Math.min(colSpan - 1, 6) }).map((_, cIdx) => (
                <div
                  key={cIdx}
                  className="skeleton-box table-skeleton-cell"
                  style={{ width: widths[cIdx % widths.length], flex: 1 }}
                />
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
};

/**
 * 3. PageSkeleton: Full page initial loader layout
 */
export const PageSkeleton = () => {
  return (
    <div className="page-skeleton-container">
      <div className="page-skeleton-header">
        <div className="skeleton-box page-skeleton-title" />
        <div className="skeleton-box page-skeleton-btn" />
      </div>
      <CardSkeleton count={4} />
      <div className="table-skeleton-wrap" style={{ marginTop: "16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <TableSkeleton colSpan={8} rows={6} />
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 4. InlineSpinner: Small inline spinner for Search / Filter inputs
 */
export const InlineSpinner = ({ size = 16, style = {} }) => {
  return (
    <span
      className="inline-search-spinner"
      style={{ width: size, height: size, ...style }}
      aria-label="Loading search results"
    />
  );
};

/**
 * 5. PaginationLoader: Subtle indicator for page transitions
 */
export const PaginationLoader = ({ message = "Loading page..." }) => {
  return (
    <div className="pagination-loader-indicator">
      <span className="pagination-loader-dot" />
      <span>{message}</span>
    </div>
  );
};

export default PageSkeleton;
