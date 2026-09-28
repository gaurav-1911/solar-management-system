import { useState, useCallback, useMemo, useEffect } from "react";
import { invoiceAPI } from "../../services/api";

const useInvoice = ({ initialPageSize = 10 } = {}) => {
  const [invoices, setInvoices] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(serverTotal / pageSize)), [serverTotal, pageSize]);

  const fetchInvoices = useCallback(async () => {
    setFetchLoading(true);
    setError(null);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter !== "All") params.status = statusFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const response = await invoiceAPI.getAll(params);
      if (response.data.success) {
        setInvoices(response.data.data);
        setServerTotal(response.data.pagination?.total || response.data.data.length);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch invoices");
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const createInvoice = useCallback(async (data) => {
    setLoading(true);
    try {
      const response = await invoiceAPI.create(data);
      if (response.data.success) { await fetchInvoices(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to create invoice" };
    } finally { setLoading(false); }
  }, [fetchInvoices]);

  const updateInvoice = useCallback(async (id, data) => {
    setLoading(true);
    try {
      const response = await invoiceAPI.update(id, data);
      if (response.data.success) { await fetchInvoices(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to update invoice" };
    } finally { setLoading(false); }
  }, [fetchInvoices]);

  const deleteInvoice = useCallback(async (id) => {
    setLoading(true);
    try {
      const response = await invoiceAPI.delete(id);
      if (response.data.success) { await fetchInvoices(); return { success: true }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to delete invoice" };
    } finally { setLoading(false); }
  }, [fetchInvoices]);

  const clearFilters = useCallback(() => { setSearch(""); setStatusFilter("All"); setDateFrom(""); setDateTo(""); setCurrentPage(1); }, []);
  const resetPagination = useCallback(() => { setCurrentPage(1); }, []);

  return {
    invoices, serverTotal, loading, fetchLoading, error,
    currentPage, setCurrentPage, pageSize, setPageSize, totalPages,
    search, setSearch, statusFilter, setStatusFilter, dateFrom, setDateFrom, dateTo, setDateTo,
    fetchInvoices, createInvoice, updateInvoice, deleteInvoice, clearFilters, resetPagination,
  };
};

export default useInvoice;
