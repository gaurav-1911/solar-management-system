import { useState, useCallback, useMemo, useEffect } from "react";
import { creditNoteAPI } from "../../services/api";

const useCreditNote = ({ initialPageSize = 10 } = {}) => {
  const [creditNotes, setCreditNotes] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("All");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(serverTotal / pageSize)), [serverTotal, pageSize]);

  const fetchCreditNotes = useCallback(async () => {
    setFetchLoading(true);
    setError(null);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (search) params.search = search;
      if (invoiceFilter !== "All") params.invoiceNumber = invoiceFilter;
      const response = await creditNoteAPI.getAll(params);
      if (response.data.success) {
        setCreditNotes(response.data.data);
        setServerTotal(response.data.pagination?.total || response.data.data.length);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch credit notes");
    } finally {
      setFetchLoading(false);
    }
  }, [currentPage, pageSize, search, invoiceFilter]);

  useEffect(() => { fetchCreditNotes(); }, [fetchCreditNotes]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const createCreditNote = useCallback(async (data) => {
    setLoading(true);
    try {
      const response = await creditNoteAPI.create(data);
      if (response.data.success) { await fetchCreditNotes(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to create credit note" };
    } finally { setLoading(false); }
  }, [fetchCreditNotes]);

  const updateCreditNote = useCallback(async (id, data) => {
    setLoading(true);
    try {
      const response = await creditNoteAPI.update(id, data);
      if (response.data.success) { await fetchCreditNotes(); return { success: true, data: response.data.data }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to update credit note" };
    } finally { setLoading(false); }
  }, [fetchCreditNotes]);

  const deleteCreditNote = useCallback(async (id) => {
    setLoading(true);
    try {
      const response = await creditNoteAPI.delete(id);
      if (response.data.success) { await fetchCreditNotes(); return { success: true }; }
      return { success: false, message: response.data.message };
    } catch (err) { return { success: false, message: err.response?.data?.message || "Failed to delete credit note" };
    } finally { setLoading(false); }
  }, [fetchCreditNotes]);

  const clearFilters = useCallback(() => { setSearch(""); setInvoiceFilter("All"); setCurrentPage(1); }, []);

  return {
    creditNotes, serverTotal, loading, fetchLoading, error,
    currentPage, setCurrentPage, pageSize, setPageSize, totalPages,
    search, setSearch, invoiceFilter, setInvoiceFilter,
    fetchCreditNotes, createCreditNote, updateCreditNote, deleteCreditNote, clearFilters,
  };
};

export default useCreditNote;
