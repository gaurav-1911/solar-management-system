import axios from "axios";
import logger from "../utils/logger";

// Resolve the backend base URL from any env source and ALWAYS normalize it to
// end with "/api". A bare host (e.g. VITE_API_URL=http://localhost:5000) would
// otherwise send requests to /auth/login instead of /api/auth/login and hit
// the backend's "Route not found" 404.
const resolveApiBase = () => {
  const raw =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    process.env.REACT_APP_API_URL ||
    "http://localhost:5000/api";
  const trimmed = String(raw || "").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const API_BASE_URL = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

api.interceptors.request.use(
  (config) => {
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/refresh-token");

    const pathname = typeof window !== "undefined" ? (window.location.pathname || "").toLowerCase() : "";
    const isPublicPage =
      pathname.includes("login") ||
      pathname.includes("forgot-password") ||
      pathname.includes("reset-password");

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      !isPublicPage
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            if (originalRequest.headers && newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise((resolve, reject) => {
        const storedRefreshToken = localStorage.getItem("refreshToken") || sessionStorage.getItem("refreshToken");
        if (!storedRefreshToken) {
          isRefreshing = false;
          processQueue(error);
          return reject(error);
        }
        authAPI
          .refreshToken({ refreshToken: storedRefreshToken })
          .then((res) => {
            if (res.data?.success && res.data?.token) {
              const newToken = res.data.token;
              localStorage.setItem("accessToken", newToken);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              processQueue(null, newToken);
              resolve(api(originalRequest));
            } else {
              localStorage.removeItem("accessToken");
              localStorage.removeItem("refreshToken");
              sessionStorage.removeItem("accessToken");
              sessionStorage.removeItem("refreshToken");
              processQueue(new Error("Refresh failed"));
              reject(error);
            }
          })
          .catch((err) => {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            sessionStorage.removeItem("accessToken");
            sessionStorage.removeItem("refreshToken");
            processQueue(err);
            reject(error);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  logout: () => api.post("/auth/logout"),
  refreshToken: (data) => api.post("/auth/refresh-token", data),
  getMe: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token, password, confirmPassword) =>
    api.post(`/auth/reset-password/${token}`, { password, confirmPassword }),
  changePassword: (data) => api.post("/auth/change-password", data),
  getProfile: () => api.get("/auth/profile"),
  updateProfile: (data) => api.put("/auth/profile", data),
  uploadProfilePhoto: (file) => {
    const formData = new FormData();
    formData.append("photo", file);
    return api.put("/auth/profile/photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  removeProfilePhoto: () => api.delete("/auth/profile/photo"),
};

export const dashboardAPI = {
  getStats: () => api.get("/dashboard/stats"),
  getRecentActivity: () => api.get("/dashboard/activity"),
};

export const customerAPI = {
  getAll: (params) => api.get("/customers", { params }),
  getById: (id) => api.get(`/customers/${id}`),
  getProfile: (id) => api.get(`/customers/${id}/profile`),
  create: (data) => api.post("/customers", data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  updateStatus: (id, status) => api.patch(`/customers/${id}/status`, { status }),
  getAnalytics: () => api.get("/customers/analytics"),
};

export const userAPI = {
  getAll: (params) => api.get("/users", { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  getActivities: (params) => api.get("/users/activities", { params }),
};

export const productAPI = {
  getAll: (params) => api.get("/products", { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post("/products", data),
  update: (id, data) => api.put(`/products/${id}`, data),
  adjustStock: (id, quantity) => api.put(`/products/${id}/stock`, { quantity }),
  delete: (id) => api.delete(`/products/${id}`),
};

export const roleAPI = {
  getAll: (params) => api.get("/roles", { params }),
  getById: (id) => api.get(`/roles/${id}`),
  create: (data) => api.post("/roles", data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  delete: (id) => api.delete(`/roles/${id}`),
};

export const departmentAPI = {
  getAll: (params) => api.get("/departments", { params }),
  getById: (id) => api.get(`/departments/${id}`),
  create: (data) => api.post("/departments", data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
};

export const leadAPI = {
  getAll: (params) => api.get("/leads", { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post("/leads", data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  updateStatus: (id, status, statusReason) => api.patch(`/leads/${id}/status`, { status, statusReason }),
  convert: (id, data = {}) => api.post(`/leads/${id}/convert`, data),
  getAnalytics: () => api.get("/leads/analytics"),
  getActivities: (id) => api.get(`/leads/${id}/activities`),
  getOverdue: () => api.get("/leads/overdue"),
};

export const followUpAPI = {
  getAll: (params) => api.get("/follow-ups", { params }),
  getById: (id) => api.get(`/follow-ups/${id}`),
  create: (data) => api.post("/follow-ups", data),
  update: (id, data) => api.put(`/follow-ups/${id}`, data),
  updateStatus: (id, status, outcome) => api.patch(`/follow-ups/${id}/status`, { status, outcome }),
  delete: (id) => api.delete(`/follow-ups/${id}`),
  getAnalytics: () => api.get("/follow-ups/analytics"),
  getOverdue: () => api.get("/follow-ups/overdue"),
};

export const ticketAPI = {
  getAll: (params) => api.get("/ticket-support", { params }),
  getById: (id) => api.get(`/ticket-support/${id}`),
  create: (data) => api.post("/ticket-support", data),
  update: (id, data) => api.put(`/ticket-support/${id}`, data),
  delete: (id) => api.delete(`/ticket-support/${id}`),
  uploadAttachment: (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/ticket-support/${id}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const technicianAPI = {
  getAll: (params) => api.get("/technicians", { params }),
  getById: (id) => api.get(`/technicians/${id}`),
  create: (data) => api.post("/technicians", data),
  update: (id, data) => api.put(`/technicians/${id}`, data),
  delete: (id) => api.delete(`/technicians/${id}`),
};

export const technicianLocationAPI = {
  getAll: (params) => api.get("/technician-locations", { params }),
  getById: (id) => api.get(`/technician-locations/${id}`),
  create: (data) => api.post("/technician-locations", data),
  update: (id, data) => api.put(`/technician-locations/${id}`, data),
  delete: (id) => api.delete(`/technician-locations/${id}`),
};

export const dailyReportAPI = {
  getAll: (params) => api.get("/daily-reports", { params }),
  getById: (id) => api.get(`/daily-reports/${id}`),
  create: (data) => api.post("/daily-reports", data),
  update: (id, data) => api.put(`/daily-reports/${id}`, data),
  delete: (id) => api.delete(`/daily-reports/${id}`),
};

export const technicianTaskAPI = {
  getAll: (params) => api.get("/technician-tasks", { params }),
  getById: (id) => api.get(`/technician-tasks/${id}`),
  create: (data) => api.post("/technician-tasks", data),
  update: (id, data) => api.put(`/technician-tasks/${id}`, data),
  delete: (id) => api.delete(`/technician-tasks/${id}`),
};

export const teamScheduleAPI = {
  getAll: (params) => api.get("/team-schedules", { params }),
  getById: (id) => api.get(`/team-schedules/${id}`),
  create: (data) => api.post("/team-schedules", data),
  update: (id, data) => api.put(`/team-schedules/${id}`, data),
  delete: (id) => api.delete(`/team-schedules/${id}`),
};

export const installationAPI = {
  getAll: (params) => api.get("/installations", { params }),
  getById: (id) => api.get(`/installations/${id}`),
  create: (data) => api.post("/installations", data),
  update: (id, data) => api.put(`/installations/${id}`, data),
  delete: (id) => api.delete(`/installations/${id}`),
  getStats: () => api.get("/installations/stats"),
  // Stored photo file bytes (stored in MongoDB like the Documents module)
  downloadPhoto: (id, index) => api.get(`/installations/${id}/site-photos/${index}`, { responseType: "blob" }),
  // Material request: submit as quotation for customer approval
  submitMaterialRequest: (installationId, data) =>
    api.post(`/installations/${installationId}/material-request`, data),
  // Send remaining (unused) products as quotation to customer
  sendRemainingProducts: (installationId) =>
    api.post(`/installations/${installationId}/send-remaining-products`),
  // Quick inline status update from the table dropdown
  updateStatus: (id, installationStatus) =>
    api.patch(`/installations/${id}/status`, { installationStatus }),
};

export const testingAPI = {
  getAll: (params) => api.get("/testing", { params }),
  getById: (id) => api.get(`/testing/${id}`),
  create: (data) => api.post("/testing", data),
  update: (id, data) => api.put(`/testing/${id}`, data),
  delete: (id) => api.delete(`/testing/${id}`),
  downloadDoc: (id, index) => api.get(`/testing/${id}/docs/${index}`, { responseType: "blob" }),
  downloadPhoto: (id, index) => api.get(`/testing/${id}/photos/${index}`, { responseType: "blob" }),
};

export const dailyProgressLogAPI = {
  getAll: (params) => api.get("/daily-progress", { params }),
  getById: (id) => api.get(`/daily-progress/${id}`),
  create: (data) => api.post("/daily-progress", data),
  update: (id, data) => api.put(`/daily-progress/${id}`, data),
  delete: (id) => api.delete(`/daily-progress/${id}`),
  upload: (formData) =>
    api.post("/daily-progress/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getTechnicianProjects: (technician) =>
    api.get("/daily-progress/technician-projects", { params: { technician } }),
  getProjectMaterials: (project, excludeLogId) =>
    api.get("/daily-progress/project-materials", {
      params: { project, ...(excludeLogId ? { excludeLogId } : {}) },
    }),
};

/**
 * Resolve a stored file reference (relative "/uploads/..." or full URL) to a
 * loadable URL. Used by the Daily Progress Log page for uploaded media.
 */
export const fileUrl = (ref) => {
  if (!ref) return "";
  if (typeof ref === "object" && ref.url) return fileUrl(ref.url);
  if (ref.startsWith("http")) return ref;
  const base = resolveApiBase().replace(/\/api$/, "");
  return `${base}${ref.startsWith("/") ? "" : "/"}${ref}`;
};export const inventoryAPI = {
  getAll: (params) => api.get("/inventory", { params }),
  getStats: () => api.get("/inventory/stats"),
  getById: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post("/inventory", data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
};
export const warehouseAPI = {
  getAll: (params) => api.get("/warehouses", { params }),
  getStats: () => api.get("/warehouses/stats"),
  getById: (id) => api.get(`/warehouses/${id}`),
  create: (data) => api.post("/warehouses", data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id) => api.delete(`/warehouses/${id}`),
};

export const amcAPI = {
  getAll: (params) => api.get("/amcs", { params }),
  getById: (id) => api.get(`/amcs/${id}`),
  create: (data) => api.post("/amcs", data),
  update: (id, data) => api.put(`/amcs/${id}`, data),
  delete: (id) => api.delete(`/amcs/${id}`),
  logVisit: (id, data) => api.post(`/amcs/${id}/visit`, data),
};

export const maintenanceTicketAPI = {
  getAll: (params) => api.get("/maintenance-tickets", { params }),
  getById: (id) => api.get(`/maintenance-tickets/${id}`),
  create: (data) => api.post("/maintenance-tickets", data),
  update: (id, data) => api.put(`/maintenance-tickets/${id}`, data),
  delete: (id) => api.delete(`/maintenance-tickets/${id}`),
};

export const serviceVisitAPI = {
  getAll: (params) => api.get("/service-visits", { params }),
  getById: (id) => api.get(`/service-visits/${id}`),
  create: (data) => api.post("/service-visits", data),
  update: (id, data) => api.put(`/service-visits/${id}`, data),
  delete: (id) => api.delete(`/service-visits/${id}`),
};

export const warrantyAPI = {
  getAll: (params) => api.get("/warranties", { params }),
  getById: (id) => api.get(`/warranties/${id}`),
  create: (data) => api.post("/warranties", data),
  update: (id, data) => api.put(`/warranties/${id}`, data),
  delete: (id) => api.delete(`/warranties/${id}`),
};

export const warrantyClaimAPI = {
  getAll: (params) => api.get("/warranty-claims", { params }),
  getById: (id) => api.get(`/warranty-claims/${id}`),
  create: (data) => api.post("/warranty-claims", data),
  update: (id, data) => api.put(`/warranty-claims/${id}`, data),
  delete: (id) => api.delete(`/warranty-claims/${id}`),
};

export const vendorEscalationAPI = {
  getAll: (params) => api.get("/vendor-escalations", { params }),
  getById: (id) => api.get(`/vendor-escalations/${id}`),
  create: (data) => api.post("/vendor-escalations", data),
  update: (id, data) => api.put(`/vendor-escalations/${id}`, data),
  delete: (id) => api.delete(`/vendor-escalations/${id}`),
};

export const siteSurveyAPI = {
  getAll: (params) => api.get("/site-surveys", { params }),
  getById: (id) => api.get(`/site-surveys/${id}`),
  create: (data) => api.post("/site-surveys", data),
  update: (id, data) => api.put(`/site-surveys/${id}`, data),
  delete: (id) => api.delete(`/site-surveys/${id}`),
  downloadBill: (id) => api.get(`/site-surveys/${id}/electricity-bill`, { responseType: "blob" }),
  downloadPhoto: (id, index) => api.get(`/site-surveys/${id}/site-photos/${index}`, { responseType: "blob" }),
};

export const solarDesignAPI = {
  getAll: (params) => api.get("/solar-designs", { params }),
  getStats: () => api.get("/solar-designs/stats"),
  getById: (id) => api.get(`/solar-designs/${id}`),
  create: (data) => api.post("/solar-designs", data),
  update: (id, data) => api.put(`/solar-designs/${id}`, data),
  delete: (id) => api.delete(`/solar-designs/${id}`),
};

export const quotationAPI = {
  getAll: (params) => api.get("/quotations", { params }),
  getById: (id) => api.get(`/quotations/${id}`),
  create: (data) => api.post("/quotations", data),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  delete: (id) => api.delete(`/quotations/${id}`),
  updateStatus: (id, status) => api.patch(`/quotations/${id}/status`, { status }),
  approve: (id) => api.patch(`/quotations/${id}/approve`),
  getAnalytics: () => api.get("/quotations/analytics"),
  getStockRequests: (params) => api.get("/quotations/stock-requests", { params }),
  createStockRequest: (data) => api.post("/quotations/stock-requests", data),
  approveStockRequest: (id) => api.patch(`/quotations/stock-requests/${id}/approve`),
  rejectStockRequest: (id) => api.patch(`/quotations/stock-requests/${id}/reject`),
  sendEmail: (id, data) => api.post(`/quotations/${id}/send-email`, data),
  resetResponse: (id) => api.patch(`/quotations/${id}/reset-response`),
};

export const projectApprovalAPI = {
  getAll: (params) => api.get("/project-approvals", { params }),
  getById: (id) => api.get(`/project-approvals/${id}`),
  create: (data) => api.post("/project-approvals", data),
  update: (id, data) => api.put(`/project-approvals/${id}`, data),
  delete: (id) => api.delete(`/project-approvals/${id}`),
  getStats: () => api.get("/project-approvals/stats"),
};

export const documentCategoryAPI = {
  getAll: (params) => api.get("/document-categories", { params }),
  getById: (id) => api.get(`/document-categories/${id}`),
  create: (data) => api.post("/document-categories", data),
  update: (id, data) => api.put(`/document-categories/${id}`, data),
  delete: (id) => api.delete(`/document-categories/${id}`),
};

export const productCategoryAPI = {
  getAll: (params) => api.get("/product-categories", { params }),
  getById: (id) => api.get(`/product-categories/${id}`),
  create: (data) => api.post("/product-categories", data),
  update: (id, data) => api.put(`/product-categories/${id}`, data),
  delete: (id) => api.delete(`/product-categories/${id}`),
};

export const vendorAPI = {
  getAll: (params) => api.get("/vendors", { params }),
  getById: (id) => api.get(`/vendors/${id}`),
  create: (data) => api.post("/vendors", data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
  delete: (id) => api.delete(`/vendors/${id}`),
};

export const purchaseOrderAPI = {
  getAll: (params) => api.get("/purchase-orders", { params }),
  getById: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post("/purchase-orders", data),
  update: (id, data) => api.put(`/purchase-orders/${id}`, data),
  delete: (id) => api.delete(`/purchase-orders/${id}`),
};

export const vendorPaymentAPI = {
  getAll: (params) => api.get("/vendor-payments", { params }),
  getById: (id) => api.get(`/vendor-payments/${id}`),
  create: (data) => api.post("/vendor-payments", data),
  update: (id, data) => api.put(`/vendor-payments/${id}`, data),
  delete: (id) => api.delete(`/vendor-payments/${id}`),
};

// Converts a plain object into FormData so the documents API can always send
// multipart/form-data (required for file uploads). Passing an existing
// FormData instance passes it through untouched.
function toFormData(data) {
  if (data instanceof FormData) return data;
  const fd = new FormData();
  Object.keys(data || {}).forEach((key) => {
    const value = data[key];
    if (Array.isArray(value)) {
      value.forEach((item) => fd.append(key, item));
    } else if (value !== undefined && value !== null) {
      fd.append(key, value);
    }
  });
  return fd;
}

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export const documentAPI = {
  getAll: (params) => api.get("/documents", { params }),
  getById: (id) => api.get(`/documents/${id}`),
  create: (data) => api.post("/documents", toFormData(data), MULTIPART),
  update: (id, data) => api.put(`/documents/${id}`, toFormData(data), MULTIPART),
  updateStatus: (id, status, reason, actorName) => api.patch(`/documents/${id}/status`, { status, reason, actorName }),
  delete: (id) => api.delete(`/documents/${id}`),
  download: (id) => api.get(`/documents/${id}/download`, { responseType: "blob" }),
};
export const settingsAPI = {
  getAll: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
};

export const projectProgressAPI = {
  getAll: (params) => api.get("/project-progress", { params }),
  getById: (id) => api.get(`/project-progress/${id}`),
  create: (data) => api.post("/project-progress", data),
  update: (id, data) => api.put(`/project-progress/${id}`, data),
  delete: (id) => api.delete(`/project-progress/${id}`),
};

export const commissioningAPI = {
  getAll: (params) => api.get("/commissioning", { params }),
  getById: (id) => api.get(`/commissioning/${id}`),
  create: (data) => api.post("/commissioning", data),
  update: (id, data) => api.put(`/commissioning/${id}`, data),
  delete: (id) => api.delete(`/commissioning/${id}`),
  getStats: () => api.get("/commissioning/stats"),
};

export const attendanceAPI = {
  getAll: (params) => api.get("/attendance", { params }),
  getById: (id) => api.get(`/attendance/${id}`),
  create: (data) => api.post("/attendance", data),
  update: (id, data) => api.put(`/attendance/${id}`, data),
  delete: (id) => api.delete(`/attendance/${id}`),
};

export const taskAssignmentAPI = {
  getAll: (params) => api.get("/task-assignments", { params }),
  getById: (id) => api.get(`/task-assignments/${id}`),
  create: (data) => api.post("/task-assignments", data),
  update: (id, data) => api.put(`/task-assignments/${id}`, data),
  delete: (id) => api.delete(`/task-assignments/${id}`),
};

export const invoiceAPI = {
  getAll: (params) => api.get("/invoices", { params }),
  getById: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post("/invoices", data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  delete: (id) => api.delete(`/invoices/${id}`),
  getStats: () => api.get("/invoices/stats"),
  getNextNumber: () => api.get("/invoices/next-number"),
};

export const receiptAPI = {
  getAll: (params) => api.get("/receipts", { params }),
  getById: (id) => api.get(`/receipts/${id}`),
  create: (data) => api.post("/receipts", data),
  update: (id, data) => api.put(`/receipts/${id}`, data),
  delete: (id) => api.delete(`/receipts/${id}`),
};

export const creditNoteAPI = {
  getAll: (params) => api.get("/credit-notes", { params }),
  getById: (id) => api.get(`/credit-notes/${id}`),
  create: (data) => api.post("/credit-notes", data),
  update: (id, data) => api.put(`/credit-notes/${id}`, data),
  delete: (id) => api.delete(`/credit-notes/${id}`),
};

export const gstInvoiceAPI = {
  getAll: (params) => api.get("/gst-invoices", { params }),
  getById: (id) => api.get(`/gst-invoices/${id}`),
  create: (data) => api.post("/gst-invoices", data),
  update: (id, data) => api.put(`/gst-invoices/${id}`, data),
  delete: (id) => api.delete(`/gst-invoices/${id}`),
};

export const subsidyAPI = {
  getAll: (params) => api.get("/subsidies", { params }),
  getById: (id) => api.get(`/subsidies/${id}`),
  create: (data) => api.post("/subsidies", data),
  update: (id, data) => api.put(`/subsidies/${id}`, data),
  delete: (id) => api.delete(`/subsidies/${id}`),
  // Single-file upload for the Document Management section (PDF/JPG/PNG).
  // The file is staged in MongoDB (returns a fileRef); bytes are resolved into
  // the subsidy document when the application is saved. onProgress receives 0-100.
  upload: (formData, onProgress) =>
    api.post("/subsidies/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    }),
  // Delete a staged (not-yet-saved) document file (prevents orphan records).
  deleteFile: (fileRef) => api.delete("/subsidies/file", { data: { fileRef } }),
  // Fetch a staged document's bytes for immediate preview (before the subsidy is saved).
  downloadPendingFile: (fileRef) => api.get(`/subsidies/file/${fileRef}`, { responseType: "blob" }),
  // Fetch a saved subsidy document's bytes (by index in the documents array).
  downloadDocument: (id, index) => api.get(`/subsidies/${id}/documents/${index}`, { responseType: "blob" }),
};

export const reportAPI = {
  // Sales Report
  getSalesReport: (params) => api.get("/reports/sales", { params }),
  getSalesReportCount: (params) => api.get("/reports/sales/count", { params }),
  // Project Report
  getProjectReport: (params) => api.get("/reports/projects", { params }),
  getProjectReportCount: (params) => api.get("/reports/projects/count", { params }),
  // Inventory Report
  getInventoryReport: (params) => api.get("/reports/inventory", { params }),
  getInventoryReportCount: (params) => api.get("/reports/inventory/count", { params }),
  exportInventoryPDF: (params) => api.get("/reports/inventory/export/pdf", { params, responseType: "blob" }),
  // Technician Report
  getTechnicianReport: (params) => api.get("/reports/technicians", { params }),
  getTechnicianReportCount: (params) => api.get("/reports/technicians/count", { params }),
};

// Lightweight alert counts for the header bell badge + stats cards (one small
// request instead of paging through all five alert-source collections).
export const notificationAPI = {
  getSummary: () => api.get("/notifications/summary"),
  // [FLOW-04] Persistent user-specific notifications
  getUserNotifications: (params) => api.get("/notifications", { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch("/notifications/read-all"),
};

export const activityLogAPI = {
  getAll: (params) => api.get("/activity-logs", { params }),
  getStats: () => api.get("/activity-logs/stats"),
  getByRecord: (id, params) => api.get(`/activity-logs/record/${id}`, { params }),
  create: (data) => api.post("/activity-logs", data),
};

export default api;
