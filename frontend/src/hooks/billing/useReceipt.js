import { useState, useCallback, useMemo, useEffect } from "react";
import { receiptAPI } from "../../services/api";

const useReceipt = ({ initialPageSize = 10 } = {}) => {
  const [receipts, setReceipts] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("All");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(serverTotal / pageSize)), [serverTotal, pageSize]);

  const fetchReceipts = useCallback(async () => {
    setFetchLoading(true);
    setError(null);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (search) params.search = search;
      if (methodFilter !== "All") params.paymentMethod = methodFilter;
      const response = await receiptAPI.getAll(params);
      if (response.data.success) {
        setReceipts(response.data.data);
        setServerTotal(response.data.pagination?.total || response.data.data.length);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch receipts");
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, search, methodFilter]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const createReceipt = useCallback(async (data) => {
    setLoading(true);
    try {
      const response = await receiptAPI.create(data);
      if (response.data.success) { await fetchReceipts(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to create receipt" };
    } finally { setLoading(false); }
  }, [fetchReceipts]);

  const updateReceipt = useCallback(async (id, data) => {
    setLoading(true);
    try {
      const response = await receiptAPI.update(id, data);
      if (response.data.success) { await fetchReceipts(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to update receipt" };
    } finally { setLoading(false); }
  }, [fetchReceipts]);

  const deleteReceipt = useCallback(async (id) => {
    setLoading(true);
    try {
      const response = await receiptAPI.delete(id);
      if (response.data.success) { await fetchReceipts(); return { success: true }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to delete receipt" };
    } finally { setLoading(false); }
  }, [fetchReceipts]);

  const clearFilters = useCallback(() => { setSearch(""); setMethodFilter("All"); setCurrentPage(1); }, []);

  return {
    receipts, serverTotal, loading, fetchLoading, error,
    currentPage, setCurrentPage, pageSize, setPageSize, totalPages,
    search, setSearch, methodFilter, setMethodFilter,
    fetchReceipts, createReceipt, updateReceipt, deleteReceipt, clearFilters,
  };
};

export default useReceipt;
