import { useState, useEffect, useCallback } from "react";
import useDebounce from "./useDebounce";

/**
 * Universal Reusable useCrudManager Hook
 * Handles paginated fetching, debounced search, loading states, and delete operations.
 *
 * @param {Object} options
 * @param {Object} options.api Object with getAll and optional delete API functions
 * @param {number} options.limit Number of items per page (default: 10)
 * @param {Object} options.initialFilters Initial filter params
 * @param {Function} options.onSuccess Optional callback on successful fetch
 */
export const useCrudManager = ({
  api,
  limit = 10,
  initialFilters = {},
  onSuccess,
}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [filters, setFilters] = useState(initialFilters);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!api || typeof api.getAll !== "function") return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit,
        search: debouncedSearch,
        ...filters,
      };

      const response = await api.getAll(params);
      const resData = response.data;

      if (resData?.success) {
        const items = resData.data || [];
        setData(items);
        setTotalPages(resData.totalPages || Math.ceil((resData.total || items.length) / limit) || 1);
        setTotalRecords(resData.total || items.length);
        if (onSuccess) onSuccess(resData);
      } else {
        setError(resData?.message || "Failed to fetch data.");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Error connecting to server.");
    } finally {
      setLoading(false);
    }
  }, [api, page, limit, debouncedSearch, filters, onSuccess]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = useCallback(
    async (id, callback) => {
      if (!api || typeof api.delete !== "function") return;
      setDeleteLoading(true);
      try {
        const response = await api.delete(id);
        if (response.data?.success) {
          if (callback) callback(null, response.data);
          fetchData();
        } else {
          if (callback) callback(response.data?.message || "Delete failed");
        }
      } catch (err) {
        if (callback) callback(err.response?.data?.message || err.message);
      } finally {
        setDeleteLoading(false);
        setDeleteTarget(null);
      }
    },
    [api, fetchData]
  );

  return {
    data,
    loading,
    error,
    page,
    totalPages,
    totalRecords,
    searchQuery,
    debouncedSearch,
    filters,
    deleteTarget,
    deleteLoading,
    setPage,
    setSearchQuery,
    setFilters,
    setDeleteTarget,
    fetchData,
    handleDelete,
    setData,
  };
};

export default useCrudManager;
