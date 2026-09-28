import React, { useMemo } from "react";
import Dropdown from "./Dropdown";
import "./Pagination.css";

/**
 * Pagination
 * Reusable pagination control for data tables and card lists.
 *
 * Props:
 *   currentPage      : number   (1-indexed)
 *   totalPages       : number
 *   totalItems       : number
 *   pageSize         : number
 *   onPageChange     : (page: number) => void
 *   siblingCount     : number   (default 1)
 *   variant          : "table" | "card"  (default "table")
 *   onPageSizeChange : (size: number) => void  — shows page size dropdown when provided
 *   pageSizeOptions  : number[] (default [10, 20, 50, 100])
 */

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  siblingCount = 1,
  variant = "table",
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  disabled = false,
}) {
  const pageRange = useMemo(() => {
    const total = Math.max(1, totalPages);
    const current = Math.min(Math.max(1, currentPage), total);
    const sibling = Math.max(0, siblingCount);

    const totalPageNumbers = sibling * 2 + 5;

    if (total <= totalPageNumbers) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(current - sibling, 1);
    const rightSiblingIndex = Math.min(current + sibling, total);

    const showLeftDots = leftSiblingIndex > 2;
    const showRightDots = rightSiblingIndex < total - 1;

    if (!showLeftDots && showRightDots) {
      const leftItemCount = 3 + 2 * sibling;
      const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
      return [...leftRange, "...", total];
    }

    if (showLeftDots && !showRightDots) {
      const rightItemCount = 3 + 2 * sibling;
      const rightRange = Array.from(
        { length: rightItemCount },
        (_, i) => total - rightItemCount + i + 1,
      );
      return [1, "...", ...rightRange];
    }

    const middleRange = Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, i) => leftSiblingIndex + i,
    );
    return [1, "...", ...middleRange, "...", total];
  }, [currentPage, totalPages, siblingCount]);

  const dropdownOptions = useMemo(() => {
    return pageSizeOptions.map((s) => ({
      value: s,
      label: String(s),
    }));
  }, [pageSizeOptions]);

  if (totalItems === 0) return null;

  const hasMultiplePages = totalPages > 1;
  const hasDropdown = !!onPageSizeChange;
  const showFullControls = hasMultiplePages || hasDropdown;

  const handlePageSizeChange = (val) => {
    onPageSizeChange(Number(val));
  };

  const from = totalItems != null && pageSize != null && totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const to = totalItems != null && pageSize != null ? Math.min(currentPage * pageSize, totalItems) : 0;

  function goTo(page) {
    if (disabled || page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  }

  const pageSizeLabel = variant === "card" ? "Cards" : "Rows";

  return (
    <div
      className={`shared-pagination shared-pagination--${variant} ${!showFullControls ? "shared-pagination--compact" : ""} ${disabled ? "is-disabled" : ""}`}
    >
      <div className="shared-pagination__left">
        {onPageSizeChange && (
          <div className="shared-pagination__page-size">
            <span className="shared-pagination__size-label">
              {pageSizeLabel} per page:
            </span>
            <Dropdown
              value={pageSize}
              onChange={handlePageSizeChange}
              options={dropdownOptions}
              placeholder={String(pageSize)}
              variant="page"
              size="sm"
              searchable={false}
              disabled={disabled}
            />
          </div>
        )}
        <span className="shared-pagination__info">
          Showing{" "}
          <strong>
            {from}–{to}
          </strong>{" "}
          of <strong>{totalItems}</strong>
        </span>
      </div>

      <nav className="shared-pagination__controls" aria-label="Pagination">
        <button
          className="shared-pagination__btn"
          disabled={disabled || currentPage === 1}
          onClick={() => goTo(currentPage - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageRange.map((item, idx) => {
          if (item === "...") {
            return (
              <span key={`dots-${idx}`} className="shared-pagination__dots">
                …
              </span>
            );
          }
          return (
            <button
              key={item}
              disabled={disabled}
              className={`shared-pagination__page ${item === currentPage ? "is-active" : ""}`}
              onClick={() => goTo(item)}
              aria-current={item === currentPage ? "page" : undefined}
              aria-label={`Page ${item}`}
            >
              {item}
            </button>
          );
        })}

        <button
          className="shared-pagination__btn"
          disabled={disabled || currentPage === totalPages}
          onClick={() => goTo(currentPage + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </nav>
    </div>
  );
}

export default React.memo(Pagination);