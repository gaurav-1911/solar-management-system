import { useState, useMemo, useCallback } from "react";

/**
 * Reusable usePagination Hook
 * 
 * Manages pagination state, page navigation, page size, and total page calculations.
 * 
 * @param {number} [initialPage=1] Starting page number
 * @param {number} [initialPageSize=10] Items per page
 * @param {number} [total=0] Total number of items
 */
export const usePagination = (initialPage = 1, initialPageSize = 10, total = 0) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || 0) / (pageSize || 10))),
    [total, pageSize]
  );

  const goToPage = useCallback(
    (page) => {
      setCurrentPage(Math.max(1, Math.min(Number(page) || 1, totalPages)));
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    resetPage,
  };
};

export default usePagination;
