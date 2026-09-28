export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Format a YYYY-MM-DD date string to DD-MM-YYYY for display.
 * Handles both "YYYY-MM-DD" strings and ISO date strings.
 * Returns "—" for empty/null values.
 */
export const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return "—";
  // If already in DD-MM-YYYY or similar non-ISO format, return as-is
  const parts = String(dateStr).split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    // YYYY-MM-DD → DD-MM-YYYY
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  // Fallback: parse and format
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${m}-${y}`;
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Return the YYYY-MM-DD portion of a date string, or "" if the value is
// missing/invalid. Unlike `.toISOString()`, this never throws on a malformed
// date (e.g. old DB records with a bad value).
export const toISODate = (dateStr) => {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

// Capitalize the first letter of each word in a category label so display
// values are consistent ("solar panels" -> "Solar Panels", "PM Surya Ghar" stays).
export const titleCaseCategory = (value) => {
  const str = String(value ?? "").trim();
  if (!str) return str;
  return str
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Case-insensitive alphabetical sort for category names. Pass a `key` to
// sort an array of objects by that field (e.g. `sortCategories(list, "label")`).
export const sortCategories = (list, key) =>
  [...list].sort((a, b) => {
    const av = key ? a?.[key] : a;
    const bv = key ? b?.[key] : b;
    return String(av).localeCompare(String(bv), undefined, {
      sensitivity: "base",
    });
  });

// Extract the trailing numeric suffix of an ID ("LD-1001" -> 1001) so
// dropdown options can be sorted in true incrementing order (LD-2 before LD-10).
const idNumber = (value) => {
  const m = String(value ?? "").match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

// Sort an array of IDs (or objects by `key`) in incrementing ID order:
// numerically by the trailing digits first, then alphabetically as a tiebreak.
export const sortById = (list, key) =>
  [...list].sort((a, b) => {
    const av = key ? a?.[key] : a;
    const bv = key ? b?.[key] : b;
    const an = idNumber(av);
    const bn = idNumber(bv);
    if (an !== bn) return an - bn;
    return String(av).localeCompare(String(bv), undefined, {
      sensitivity: "base",
    });
  });

export const getStatusColor = (status) => {
  const colors = {
    active: "#16a34a",
    completed: "#16a34a",
    approved: "#16a34a",
    "in-progress": "#d97706",
    pending: "#d97706",
    scheduled: "#2563eb",
    inactive: "#6b7280",
    expired: "#6b7280",
    rejected: "#dc2626",
    critical: "#dc2626",
    "low-stock": "#d97706",
  };
  return colors[status?.toLowerCase()] || "#6b7280";
};

export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

export const deriveTechnicianId = (name) =>
  `TECH-${String(name || "TECHNICIAN").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "TECH"}`;

export const generateId = (prefix = "ID") => {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const paginate = (array, page = 1, pageSize = 10) => {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  return {
    data: array.slice(startIndex, endIndex),
    totalPages: Math.ceil(array.length / pageSize),
    currentPage: page,
    totalItems: array.length,
  };
};

export const filterBySearch = (array, searchTerm, fields = []) => {
  if (!searchTerm) return array;
  const term = searchTerm.toLowerCase();
  return array.filter((item) =>
    fields.some((field) => item[field]?.toLowerCase().includes(term))
  );
};

// Maximum number of page requests kept in flight while paging through a
// collection — bounds server load while still parallelizing the bulk of the
// round-trips.
const FETCH_ALL_PAGES_CONCURRENCY = 6;

// Run `fn` over `items` with at most `limit` promises in flight at once.
// Results are returned in input order so callers never need to re-sort.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex;
      nextIndex += 1;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchAllPages(apiGet, params = {}) {
  const pageSize = params.limit || 500;

  // First request: reveals the total and the page size actually honored.
  const firstRes = await apiGet({ ...params, page: 1, limit: pageSize });
  const firstDocs = firstRes.data?.data || [];
  const pagination = firstRes.data?.pagination;
  const total = pagination?.total ?? firstDocs.length;

  // Nothing left to fetch (empty collection or a single page covers it all).
  if (firstDocs.length === 0 || total <= firstDocs.length) return firstDocs;

  const limitUsed = pagination?.limit && pagination.limit > 0 ? pagination.limit : pageSize;
  const pageCount = Math.max(1, Math.ceil(total / limitUsed));

  const pages = [];
  for (let page = 2; page <= pageCount; page += 1) pages.push(page);

  const pageResults = await mapWithConcurrency(pages, FETCH_ALL_PAGES_CONCURRENCY, async (page) => {
    const res = await apiGet({ ...params, page, limit: pageSize });
    return res.data?.data || [];
  });

  return [firstDocs, ...pageResults].flat();
}

/**
 * Safely log background API errors without spamming DevTools when offline / server unreachable.
 */
export function logError(label, err) {
  if (!err) return;
  if (err.code === "ERR_NETWORK" || err.message === "Network Error" || !err.response) {
    return;
  }
  console.warn(`${label}:`, err.response?.data?.message || err.message || err);
}
