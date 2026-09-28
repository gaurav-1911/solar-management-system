import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  activityLogAPI,
  leadAPI,
  customerAPI,
  quotationAPI,
  inventoryAPI,
  userAPI,
  subsidyAPI,
  technicianAPI,
  followUpAPI,
  warehouseAPI,
  vendorAPI,
  productAPI,
  siteSurveyAPI,
  solarDesignAPI,
  amcAPI,
  invoiceAPI,
  ticketAPI,
  installationAPI,
  testingAPI,
  maintenanceTicketAPI,
  attendanceAPI,
  taskAssignmentAPI,
  teamScheduleAPI,
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { Pagination } from "../../components/common";
import "../leadManagement/leadManagement.css";
import "../../components/common/RecordActivityModal.css";

const MODULE_CONFIG = {
  leads: {
    name: "Leads",
    route: "/admin/leads",
    typeBadge: "Lead",
    fetchItem: (id) => leadAPI.getById(id),
    getLabel: (item) => item?.leadId || item?.name,
  },
  "lead-activity": {
    name: "Leads",
    route: "/admin/leads",
    typeBadge: "Lead",
    fetchItem: (id) => leadAPI.getById(id),
    getLabel: (item) => item?.leadId || item?.name,
  },
  customers: {
    name: "Customers",
    route: "/admin/customers",
    typeBadge: "Customer",
    fetchItem: (id) => customerAPI.getById(id),
    getLabel: (item) => item?.customerId || item?.name,
  },
  "customer-activity": {
    name: "Customers",
    route: "/admin/customers",
    typeBadge: "Customer",
    fetchItem: (id) => customerAPI.getById(id),
    getLabel: (item) => item?.customerId || item?.name,
  },
  quotations: {
    name: "Quotations",
    route: "/admin/quotation",
    typeBadge: "Quotation",
    fetchItem: (id) => quotationAPI.getById(id),
    getLabel: (item) => item?.quotationNumber || item?.id || item?.client,
  },
  "quotation-activity": {
    name: "Quotations",
    route: "/admin/quotation",
    typeBadge: "Quotation",
    fetchItem: (id) => quotationAPI.getById(id),
    getLabel: (item) => item?.quotationNumber || item?.id || item?.client,
  },
  inventory: {
    name: "Inventory",
    route: "/admin/inventory",
    typeBadge: "Inventory",
    fetchItem: (id) => inventoryAPI.getById(id),
    getLabel: (item) => item?.sku || item?.name,
  },
  "inventory-activity": {
    name: "Inventory",
    route: "/admin/inventory",
    typeBadge: "Inventory",
    fetchItem: (id) => inventoryAPI.getById(id),
    getLabel: (item) => item?.sku || item?.name,
  },
  users: {
    name: "Users",
    route: "/admin/users",
    typeBadge: "User",
    fetchItem: (id) => userAPI.getById(id),
    getLabel: (item) => item?.name || item?.email,
  },
  "user-activity": {
    name: "Users",
    route: "/admin/users",
    typeBadge: "User",
    fetchItem: (id) => userAPI.getById(id),
    getLabel: (item) => item?.name || item?.email,
  },
  subsidy: {
    name: "Subsidies",
    route: "/admin/subsidy",
    typeBadge: "Subsidy",
    fetchItem: (id) => subsidyAPI.getById(id),
    getLabel: (item) => item?.applicationNumber || item?.customerName,
  },
  "subsidy-activity": {
    name: "Subsidies",
    route: "/admin/subsidy",
    typeBadge: "Subsidy",
    fetchItem: (id) => subsidyAPI.getById(id),
    getLabel: (item) => item?.applicationNumber || item?.customerName,
  },
  "role-permissions": {
    name: "Roles & Permissions",
    route: "/admin/role-permissions",
    typeBadge: "Role",
    fetchItem: null,
    getLabel: (item) => item?.name || item?.id,
  },
  "role-permissions-activity": {
    name: "Roles & Permissions",
    route: "/admin/role-permissions",
    typeBadge: "Role",
    fetchItem: null,
    getLabel: (item) => item?.name || item?.id,
  },
  warehouses: {
    name: "Warehouses",
    route: "/admin/warehouses",
    typeBadge: "Warehouse",
    fetchItem: (id) => warehouseAPI.getById(id),
    getLabel: (item) => item?.name || item?.code,
  },
  "warehouse-activity": {
    name: "Warehouses",
    route: "/admin/warehouses",
    typeBadge: "Warehouse",
    fetchItem: (id) => warehouseAPI.getById(id),
    getLabel: (item) => item?.name || item?.code,
  },
  amc: {
    name: "AMC",
    route: "/admin/amc",
    typeBadge: "AMC",
    fetchItem: (id) => amcAPI.getById(id),
    getLabel: (item) => item?.amcId || item?.customer,
  },
  "amc-activity": {
    name: "AMC",
    route: "/admin/amc",
    typeBadge: "AMC",
    fetchItem: (id) => amcAPI.getById(id),
    getLabel: (item) => item?.amcId || item?.customer,
  },
  billing: {
    name: "Billing",
    route: "/admin/billing",
    typeBadge: "Invoice",
    fetchItem: (id) => invoiceAPI.getById(id),
    getLabel: (item) => item?.invoiceId || item?.client,
  },
  "billing-activity": {
    name: "Billing",
    route: "/admin/billing",
    typeBadge: "Invoice",
    fetchItem: (id) => invoiceAPI.getById(id),
    getLabel: (item) => item?.invoiceId || item?.client,
  },
  "site-survey": {
    name: "Site Survey",
    route: "/admin/site-survey",
    typeBadge: "Survey",
    fetchItem: (id) => siteSurveyAPI.getById(id),
    getLabel: (item) => item?.surveyId || item?.projectName || item?.customerName,
  },
  "site-survey-activity": {
    name: "Site Survey",
    route: "/admin/site-survey",
    typeBadge: "Survey",
    fetchItem: (id) => siteSurveyAPI.getById(id),
    getLabel: (item) => item?.surveyId || item?.projectName || item?.customerName,
  },
  "solar-design": {
    name: "Solar System Design",
    route: "/admin/solar-design",
    typeBadge: "Design",
    fetchItem: (id) => solarDesignAPI.getById(id),
    getLabel: (item) => item?.designId || item?.projectName || item?.customerName,
  },
  "solar-design-activity": {
    name: "Solar System Design",
    route: "/admin/solar-design",
    typeBadge: "Design",
    fetchItem: (id) => solarDesignAPI.getById(id),
    getLabel: (item) => item?.designId || item?.projectName || item?.customerName,
  },
  products: {
    name: "Products",
    route: "/admin/products",
    typeBadge: "Product",
    fetchItem: (id) => productAPI.getById(id),
    getLabel: (item) => item?.sku || item?.name,
  },
  "product-activity": {
    name: "Products",
    route: "/admin/products",
    typeBadge: "Product",
    fetchItem: (id) => productAPI.getById(id),
    getLabel: (item) => item?.sku || item?.name,
  },
  "products-activity": {
    name: "Products",
    route: "/admin/products",
    typeBadge: "Product",
    fetchItem: (id) => productAPI.getById(id),
    getLabel: (item) => item?.sku || item?.name,
  },
  vendors: {
    name: "Vendors",
    route: "/admin/vendors",
    typeBadge: "Vendor",
    fetchItem: (id) => vendorAPI.getById(id),
    getLabel: (item) => item?.name || item?.id,
  },
  "vendor-activity": {
    name: "Vendors",
    route: "/admin/vendors",
    typeBadge: "Vendor",
    fetchItem: (id) => vendorAPI.getById(id),
    getLabel: (item) => item?.name || item?.id,
  },
  "project-progress": {
    name: "Project Progress",
    route: "/admin/project-progress",
    typeBadge: "Project",
    fetchItem: null,
    getLabel: (item) => item?.projectId || item?.name || item?.customerName,
  },
  "project-progress-activity": {
    name: "Project Progress",
    route: "/admin/project-progress",
    typeBadge: "Project",
    fetchItem: null,
    getLabel: (item) => item?.projectId || item?.name || item?.customerName,
  },
  installations: {
    name: "Installations",
    route: "/admin/installations",
    typeBadge: "Installation",
    fetchItem: (id) => installationAPI.getById(id),
    getLabel: (item) => item?.installationId || item?.customerName,
  },
  "installation-activity": {
    name: "Installations",
    route: "/admin/installations",
    typeBadge: "Installation",
    fetchItem: (id) => installationAPI.getById(id),
    getLabel: (item) => item?.installationId || item?.customerName,
  },
  maintenance: {
    name: "Maintenance",
    route: "/admin/maintenance",
    typeBadge: "Maintenance",
    fetchItem: (id) => maintenanceTicketAPI.getById(id),
    getLabel: (item) => item?.taskId || item?.customerName,
  },
  "maintenance-activity": {
    name: "Maintenance",
    route: "/admin/maintenance",
    typeBadge: "Maintenance",
    fetchItem: (id) => maintenanceTicketAPI.getById(id),
    getLabel: (item) => item?.taskId || item?.customerName,
  },
  commissioning: {
    name: "Commissioning & Handover",
    route: "/admin/commissioning",
    typeBadge: "Commissioning",
    fetchItem: null,
    getLabel: (item) => item?.recordId || item?.id || item?.customerName,
  },
  "commissioning-activity": {
    name: "Commissioning & Handover",
    route: "/admin/commissioning",
    typeBadge: "Commissioning",
    fetchItem: null,
    getLabel: (item) => item?.recordId || item?.id || item?.customerName,
  },
  technicians: {
    name: "Technicians",
    route: "/admin/technicians",
    typeBadge: "Technician",
    fetchItem: (id) => technicianAPI.getById(id),
    getLabel: (item) => item?.name || item?.techId || item?.id,
  },
  "technician-activity": {
    name: "Technicians",
    route: "/admin/technicians",
    typeBadge: "Technician",
    fetchItem: (id) => technicianAPI.getById(id),
    getLabel: (item) => item?.name || item?.techId || item?.id,
  },
  attendance: {
    name: "Attendance",
    route: "/admin/attendance",
    typeBadge: "Attendance",
    fetchItem: (id) => attendanceAPI.getById(id),
    getLabel: (item) => item?.technicianName || item?.date || item?.id,
  },
  "attendance-activity": {
    name: "Attendance",
    route: "/admin/attendance",
    typeBadge: "Attendance",
    fetchItem: (id) => attendanceAPI.getById(id),
    getLabel: (item) => item?.technicianName || item?.date || item?.id,
  },
  "task-assignment": {
    name: "Task Assignment",
    route: "/admin/task-assignment",
    typeBadge: "Task",
    fetchItem: (id) => taskAssignmentAPI.getById(id),
    getLabel: (item) => item?.title || item?.taskId || item?.technicianName,
  },
  "task-assignment-activity": {
    name: "Task Assignment",
    route: "/admin/task-assignment",
    typeBadge: "Task",
    fetchItem: (id) => taskAssignmentAPI.getById(id),
    getLabel: (item) => item?.title || item?.taskId || item?.technicianName,
  },
  "team-schedule": {
    name: "Team Schedule",
    route: "/admin/team-schedule",
    typeBadge: "Schedule",
    fetchItem: (id) => teamScheduleAPI.getById(id),
    getLabel: (item) => item?.title || item?.scheduleId || item?.technicianName,
  },
  "team-schedule-activity": {
    name: "Team Schedule",
    route: "/admin/team-schedule",
    typeBadge: "Schedule",
    fetchItem: (id) => teamScheduleAPI.getById(id),
    getLabel: (item) => item?.title || item?.scheduleId || item?.technicianName,
  },
  testing: {
    name: "Testing Module",
    route: "/admin/testing",
    typeBadge: "Testing",
    fetchItem: (id) => testingAPI.getById(id),
    getLabel: (item) => item?.testId || item?.customerName,
  },
  "testing-activity": {
    name: "Testing Module",
    route: "/admin/testing",
    typeBadge: "Testing",
    fetchItem: (id) => testingAPI.getById(id),
    getLabel: (item) => item?.testId || item?.customerName,
  },
  tickets: {
    name: "Ticket Support",
    route: "/admin/tickets",
    typeBadge: "Ticket",
    fetchItem: (id) => ticketAPI.getById(id),
    getLabel: (item) => item?.ticketId || item?.subject,
  },
  "ticket-activity": {
    name: "Ticket Support",
    route: "/admin/tickets",
    typeBadge: "Ticket",
    fetchItem: (id) => ticketAPI.getById(id),
    getLabel: (item) => item?.ticketId || item?.subject,
  },
  "tickets-activity": {
    name: "Ticket Support",
    route: "/admin/tickets",
    typeBadge: "Ticket",
    fetchItem: (id) => ticketAPI.getById(id),
    getLabel: (item) => item?.ticketId || item?.subject,
  },
  payments: {
    name: "Payments",
    route: "/admin/payments",
    typeBadge: "Payment",
    fetchItem: null,
    getLabel: (item) => item?.transactionId || item?.customerName,
  },
  "payment-activity": {
    name: "Payments",
    route: "/admin/payments",
    typeBadge: "Payment",
    fetchItem: null,
    getLabel: (item) => item?.transactionId || item?.customerName,
  },
  "payments-activity": {
    name: "Payments",
    route: "/admin/payments",
    typeBadge: "Payment",
    fetchItem: null,
    getLabel: (item) => item?.transactionId || item?.customerName,
  },
  warranty: {
    name: "Warranty Management",
    route: "/admin/warranty",
    typeBadge: "Warranty",
    fetchItem: null,
    getLabel: (item) => item?.warrantyId || item?.customerName,
  },
  "warranty-activity": {
    name: "Warranty Management",
    route: "/admin/warranty",
    typeBadge: "Warranty",
    fetchItem: null,
    getLabel: (item) => item?.warrantyId || item?.customerName,
  },
  "daily-progress": {
    name: "Daily Progress Log",
    route: "/admin/daily-progress",
    typeBadge: "Daily Log",
    fetchItem: null,
    getLabel: (item) => item?.logId || item?.projectName,
  },
  "daily-progress-activity": {
    name: "Daily Progress Log",
    route: "/admin/daily-progress",
    typeBadge: "Daily Log",
    fetchItem: null,
    getLabel: (item) => item?.logId || item?.projectName,
  },
  documents: {
    name: "Documents",
    route: "/admin/documents",
    typeBadge: "Document",
    fetchItem: null,
    getLabel: (item) => item?.name || item?.id,
  },
  "document-activity": {
    name: "Documents",
    route: "/admin/documents",
    typeBadge: "Document",
    fetchItem: null,
    getLabel: (item) => item?.name || item?.id,
  },
  "follow-ups": {
    name: "Follow-Ups",
    route: "/admin/follow-ups",
    typeBadge: "Follow-Up",
    fetchItem: (id) => followUpAPI.getById(id),
    getLabel: (item) => item?.followUpId || item?.contactName,
  },
  "follow-up-activity": {
    name: "Follow-Ups",
    route: "/admin/follow-ups",
    typeBadge: "Follow-Up",
    fetchItem: (id) => followUpAPI.getById(id),
    getLabel: (item) => item?.followUpId || item?.contactName,
  },
};

/**
 * GenericDetailActivityLog — Universal Activity Log Details Page Component.
 * Supports leads, customers, quotations, inventory, users, and subsidies.
 */
const formatValueCleanly = (val, fieldName = "") => {
  if (val === null || val === undefined || val === "" || val === "null") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";

  // Sanitize raw Mongoose subdocument internal strings ($__parent, _doc, $basePath)
  if (typeof val === "string" && (val.includes("$__parent") || val.includes("_doc") || val.includes("$basePath"))) {
    const validActions = ["View", "Create", "Edit", "Delete", "Export"];
    const foundActions = validActions.filter((a) => new RegExp(`\\b${a}\\b`, "i").test(val));
    return foundActions.length > 0 ? foundActions.join(", ") : "Updated";
  }

  // Clean date formatting for ISO timestamp strings (e.g. "2026-08-25T00:00:00.000Z")
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}(T|\b)/.test(val.trim())) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    }
  }

  let obj = val;
  if (typeof val === "string" && (val.trim().startsWith("{") || val.trim().startsWith("["))) {
    try {
      obj = JSON.parse(val);
    } catch {
      obj = val;
    }
  }

  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return `${obj.length} items`;
    }

    const fieldLower = String(fieldName).toLowerCase();

    // Account / Auth objects — hide passwords completely!
    if (fieldLower.includes("account") || obj.password) {
      return obj.email ? `User Account Created (${obj.email})` : "User Account Created";
    }

    // Lead objects
    if (fieldLower.includes("lead") || obj.leadId) {
      const parts = [obj.leadId, obj.name, obj.email].filter(Boolean);
      return parts.length > 0 ? `Lead ${parts.join(" — ")}` : "Lead Details";
    }

    // Customer objects
    if (fieldLower.includes("customer") || obj.customerId) {
      const parts = [obj.name || obj.customerName, obj.email || obj.phone].filter(Boolean);
      return parts.length > 0 ? `Customer ${parts.join(" — ")}` : "Customer Details";
    }

    // Generic JSON objects: clean key-value summary omitting internal DB metadata keys
    const entries = Object.entries(obj)
      .filter(([k, v]) => !["_id", "__v", "createdAt", "updatedAt", "password"].includes(k) && v !== null && v !== "");

    if (entries.length === 0) return "Record Details";

    return entries
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? "..." : String(v)}`)
      .join(", ") + (entries.length > 3 ? "..." : "");
  }

  const str = String(val);
  return str.length > 120 ? str.substring(0, 120) + "…" : str;
};

const extractLogChanges = (log, itemDetails = null) => {
  if (!log) return [];
  let changes = Array.isArray(log.changes) ? [...log.changes] : [];
  const action = log.action || "updated";

  if (changes.length === 0 && log.summary) {
    try {
      if (log.summary.includes("(") && log.summary.includes("->")) {
        const match = log.summary.match(/\((.*?)\)/);
        if (match && match[1]) {
          const parts = match[1].split(",");
          for (const part of parts) {
            if (part.includes("->")) {
              const [fieldAndOld, newVal] = part.split("->");
              if (fieldAndOld && newVal) {
                const subParts = fieldAndOld.split(":");
                const field = subParts[0]?.trim() || "Field";
                const oldVal = subParts.slice(1).join(":")?.trim() || "";
                changes.push({ field, oldValue: oldVal, newValue: newVal.trim() });
              }
            }
          }
        }
      } else if (log.summary.includes("(") && log.summary.includes(":")) {
        const match = log.summary.match(/\((.*?)\)/);
        if (match && match[1]) {
          const parts = match[1].split(",");
          for (const part of parts) {
            if (part.includes(":")) {
              const [field, newVal] = part.split(":");
              if (field && newVal) {
                changes.push({ field: field.trim(), oldValue: null, newValue: newVal.trim() });
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore parse error
    }
  }

  const isMongoIdOrInternalField = (field, val) => {
    if (!field) return true;
    const f = String(field).trim().toLowerCase();
    if (["_id", "id", "__v", "password", "createdat", "updatedat", "isedit", "linktotype", "tokenversion", "documents", "department", "refreshtoken", "resetpasswordtoken", "resetpasswordexpires"].includes(f)) return true;
    if (typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val.trim())) return true;
    if (val === "" || val === null || val === undefined || val === "null") return true;

    if ((f === "assignedto" || f === "assigned to") && (val === "Unassigned" || !val)) return true;
    if ((f === "scheduledtime" || f === "scheduled time") && (val === "10:00" || !val)) return true;
    if (f === "priority" && val === "Medium" && action === "created") return true;

    return false;
  };

  let validChanges = changes.filter(
    (c) => !isMongoIdOrInternalField(c.field, c.newValue) && !isMongoIdOrInternalField(c.field, c.oldValue)
  );

  const actionLower = String(action || "").toLowerCase();
  const isCreation = actionLower.includes("create") || actionLower.includes("add") || actionLower.includes("new");

  if (validChanges.length === 0 && isCreation) {
    if (itemDetails) {
      const skipKeys = new Set(["_id", "__v", "createdAt", "updatedAt", "password", "tokenVersion", "documents", "department", "refreshToken", "resetPasswordToken", "resetPasswordExpires", "sitePhotos", "electricityBill", "docs", "photos", "materials", "versions", "history", "comments", "attachments"]);
      Object.entries(itemDetails).forEach(([k, v]) => {
        if (!skipKeys.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object" && !isMongoIdOrInternalField(k, v)) {
          validChanges.push({ field: k, oldValue: null, newValue: v });
        }
      });
    }
    if (validChanges.length === 0) {
      if (log.recordLabel && !/^[0-9a-fA-F]{24}$/.test(String(log.recordLabel).trim())) {
        validChanges.push({ field: "Record", oldValue: null, newValue: log.recordLabel });
      }
      if (log.summary) {
        const cleanSummary = String(log.summary).replace(/^.*?(created|added|updated)[:\s]*/i, "").trim();
        if (cleanSummary && cleanSummary !== log.recordLabel) {
          validChanges.push({ field: "Details", oldValue: null, newValue: cleanSummary });
        }
      }
    }
  }

  return validChanges;
};

const GenericDetailActivityLog = ({
  moduleKey: propModuleKey,
  target: propTarget,
  onBack: propOnBack,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { section: paramSection, id: paramId } = useParams();

  const queryParams = new URLSearchParams(location.search);
  const queryRecordId = queryParams.get("recordId");
  const queryRecordLabel = queryParams.get("recordLabel");

  const moduleKey =
    propModuleKey ||
    paramSection ||
    location?.state?.moduleKey ||
    "leads";

  const { canDo, user } = useAuth();
  const baseKey = (moduleKey || "").replace("-activity", "");
  const moduleKeyMap = {
    customer: "customers",
    lead: "leads",
    quotation: "quotations",
    product: "products",
    user: "users",
    ticket: "tickets",
    warehouse: "warehouses",
    vendor: "vendors",
    technician: "technicians",
  };
  const rawModuleKey = moduleKeyMap[baseKey] || baseKey;
  const canExportLog =
    user?.role === "Super Admin" ||
    canDo(rawModuleKey, "export") ||
    canDo(baseKey, "export") ||
    canDo("customers", "export");

  const config = MODULE_CONFIG[moduleKey] || MODULE_CONFIG.leads;

  const target =
    propTarget ||
    location?.state?.target ||
    (paramId ? { recordId: paramId, recordLabel: queryRecordLabel || null } : null) ||
    (queryRecordId ? { recordId: queryRecordId, recordLabel: queryRecordLabel || null } : null);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resolvedLabel, setResolvedLabel] = useState(target?.recordLabel || "");
  const [itemDetails, setItemDetails] = useState(null);
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const toggleRow = (id) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return new Set(next);
    });
  };

  const getFieldIcon = (field) => {
    const f = String(field || "").toLowerCase();
    if (f.includes("name") || f.includes("user") || f.includes("contact")) return "👤";
    if (f.includes("phone") || f.includes("mobile") || f.includes("call")) return "📞";
    if (f.includes("email") || f.includes("mail")) return "✉️";
    if (f.includes("date") || f.includes("time") || f.includes("schedule")) return "📅";
    if (f.includes("status")) return "📌";
    if (f.includes("note") || f.includes("remark") || f.includes("comment") || f.includes("desc")) return "📝";
    if (f.includes("priority")) return "⚡";
    if (f.includes("type") || f.includes("category")) return "🏷️";
    return "🔹";
  };

  const stats = useMemo(() => {
    const total = logs.length;
    const created = logs.filter((l) => {
      const a = String(l.action || "").toLowerCase();
      return a.includes("create") || a.includes("add");
    }).length;
    const deleted = logs.filter((l) => {
      const a = String(l.action || "").toLowerCase();
      return a.includes("delete") || a.includes("remove");
    }).length;
    const updated = total - created - deleted;
    return { total, created, updated, deleted };
  }, [logs]);

  useEffect(() => {
    if (logs && logs.length > 0) {
      setExpandedRowIds((prev) => {
        if (prev.size === 0) {
          return new Set([logs[0]._id]);
        }
        return prev;
      });
    }
  }, [logs]);

  const recordId = target?.recordId || paramId;

  const handleBack = () => {
    if (propOnBack) {
      propOnBack();
    } else {
      navigate(config.route);
    }
  };

  // Dynamically fetch item details
  useEffect(() => {
    let isMounted = true;
    if (recordId && config.fetchItem) {
      config
        .fetchItem(recordId)
        .then((res) => {
          if (isMounted && res?.data?.success && res.data.data) {
            const item = res.data.data;
            setItemDetails(item);
            const label = config.getLabel(item);
            if (label) setResolvedLabel(label);
          }
        })
        .catch(() => {
          if (isMounted && !resolvedLabel) setResolvedLabel(recordId);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [recordId, config]);

  const isMongoId = (str) => typeof str === "string" && /^[0-9a-fA-F]{24}$/.test(str);

  const cleanLabel =
    resolvedLabel && !isMongoId(resolvedLabel)
      ? resolvedLabel
      : target?.recordLabel && !isMongoId(target.recordLabel)
      ? target.recordLabel
      : "";

  const headerTitle = cleanLabel ? `Activity Log - ${cleanLabel}` : `${config.name} Activity Log`;

  const fetchLogs = useCallback(async () => {
    if (!recordId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let logResults = [];

      // 1. Try getByRecord
      try {
        const res = await activityLogAPI.getByRecord(recordId, { limit: 100 });
        if (res?.data?.success && Array.isArray(res.data.data)) {
          logResults = res.data.data;
        }
      } catch (e) {
        console.warn("getByRecord direct fetch error:", e);
      }

      // 2. Fallback to module filtering
      if (logResults.length === 0) {
        const resAll = await activityLogAPI.getAll({ limit: 500 });
        if (resAll?.data?.success && Array.isArray(resAll.data.data)) {
          const allLogs = resAll.data.data;
          const targetId = recordId.toLowerCase();
          const targetLabel = (resolvedLabel || cleanLabel || "").toLowerCase();

          logResults = allLogs.filter((log) => {
            const rId = (log.recordId || "").toLowerCase();
            const rLabel = (log.recordLabel || "").toLowerCase();
            const logSummary = (log.summary || "").toLowerCase();
            const logModule = (log.module || "").toLowerCase();

            const isMatchingModule =
              !moduleKey ||
              logModule === moduleKey.toLowerCase() ||
              logModule === (config?.name || "").toLowerCase().replace(/\s+/g, "-") ||
              (moduleKey.includes("follow") && logModule.includes("follow"));

            return matchesId && matchesContact;
          });
        }
      }

      // Filter out old logs from previous deleted lifecycles ONLY if record/user was recreated after explicit deletion
      const filterActiveLifecycleLogs = (logList) => {
        if (!Array.isArray(logList) || logList.length <= 1) return logList;
        const sorted = [...logList].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const newestCreationIdx = sorted.findIndex((l) => {
          const act = String(l.action || "").toLowerCase();
          return act.includes("create") || act.includes("add") || act.includes("new");
        });
        const newestDeletionIdx = sorted.findIndex((l) => {
          const act = String(l.action || "").toLowerCase();
          return act.includes("delete") || act.includes("remove");
        });

        // Only trim prior logs if there is an explicit deletion event AND a newer creation event after it
        if (newestCreationIdx !== -1 && newestDeletionIdx !== -1 && newestCreationIdx < newestDeletionIdx) {
          return sorted.slice(0, newestDeletionIdx);
        }

        return sorted;
      };

      setLogs(filterActiveLifecycleLogs(logResults));
    } catch (err) {
      console.error(`Failed to fetch ${config.name} activity logs:`, err);
    } finally {
      setLoading(false);
    }
  }, [recordId, resolvedLabel, cleanLabel, config]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const getActionBadge = (action, log) => {
    const act = String(action || "").toLowerCase();
    const summaryLower = String(log?.summary || "").toLowerCase();

    const isConversion =
      act.includes("convert") ||
      summaryLower.includes("convert") ||
      (Array.isArray(log?.changes) &&
        log.changes.some((c) => {
          const f = String(c.field || "").toLowerCase();
          const v = String(c.newValue || "").toLowerCase();
          return f.includes("convert") || (f === "status" && v.includes("converted"));
        }));

    if (isConversion) {
      return (
        <span style={{ background: "#e0e7ff", color: "#4338ca", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
          Converted
        </span>
      );
    }

    if (act.includes("create") || act.includes("add")) {
      return (
        <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
          New Add
        </span>
      );
    }
    if (act.includes("delete") || act.includes("remove")) {
      return (
        <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
          Removed
        </span>
      );
    }
    const hasStatusChange =
      act.includes("status") ||
      summaryLower.includes("status") ||
      (Array.isArray(log?.changes) && log.changes.some((c) => String(c.field || "").toLowerCase() === "status"));

    if (hasStatusChange) {
      return (
        <span style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
          Status Change
        </span>
      );
    }
    return (
      <span style={{ background: "#f3e8ff", color: "#7e22ce", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
        Changed
      </span>
    );
  };

  const renderFieldChanges = (log) => {
    let changes = Array.isArray(log.changes) ? [...log.changes] : [];
    const action = log.action || "updated";

    // If changes array is empty, try parsing diffs or key-value pairs from summary
    if (changes.length === 0 && log.summary) {
      try {
        if (log.summary.includes("(") && log.summary.includes("->")) {
          const match = log.summary.match(/\((.*?)\)/);
          if (match && match[1]) {
            const parts = match[1].split(",");
            for (const part of parts) {
              if (part.includes("->")) {
                const [fieldAndOld, newVal] = part.split("->");
                if (fieldAndOld && newVal) {
                  const subParts = fieldAndOld.split(":");
                  const field = subParts[0]?.trim() || "Field";
                  const oldVal = subParts.slice(1).join(":")?.trim() || "";
                  changes.push({ field, oldValue: oldVal, newValue: newVal.trim() });
                }
              }
            }
          }
        } else if (log.summary.includes("(") && log.summary.includes(":")) {
          const match = log.summary.match(/\((.*?)\)/);
          if (match && match[1]) {
            const parts = match[1].split(",");
            for (const part of parts) {
              if (part.includes(":")) {
                const [field, newVal] = part.split(":");
                if (field && newVal) {
                  changes.push({ field: field.trim(), oldValue: null, newValue: newVal.trim() });
                }
              }
            }
          }
        }
      } catch (e) {
        // ignore parse error
      }
    }

    const isMongoIdOrInternalField = (field, val) => {
      if (!field) return true;
      const f = String(field).trim().toLowerCase();
      if (["_id", "id", "__v", "password", "createdat", "updatedat", "isedit", "linktotype", "tokenversion", "documents", "department", "refreshtoken", "resetpasswordtoken", "resetpasswordexpires"].includes(f)) return true;
      if (typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val.trim())) return true;
      if (val === "" || val === null || val === undefined || val === "null") return true;

      // Filter out redundant defaults / empty values that clutter creation logs
      if ((f === "assignedto" || f === "assigned to") && (val === "Unassigned" || !val)) return true;
      if ((f === "scheduledtime" || f === "scheduled time") && (val === "10:00" || !val)) return true;
      if ((f === "priority") && val === "Medium" && action === "created") return true;

      return false;
    };

    let validChanges = changes.filter(
      (c) => !isMongoIdOrInternalField(c.field, c.newValue) && !isMongoIdOrInternalField(c.field, c.oldValue)
    );

    const actionLower = String(action || "").toLowerCase();
    const isCreation = actionLower.includes("create") || actionLower.includes("add") || actionLower.includes("new");

    // Fallback for creation logs if validChanges is still empty
    if (validChanges.length === 0 && isCreation) {
      if (itemDetails) {
        const skipKeys = new Set(["_id", "__v", "createdAt", "updatedAt", "password", "tokenVersion", "documents", "department", "refreshToken", "resetPasswordToken", "resetPasswordExpires", "sitePhotos", "electricityBill", "docs", "photos", "materials", "versions", "history", "comments", "attachments"]);
        Object.entries(itemDetails).forEach(([k, v]) => {
          if (!skipKeys.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object" && !isMongoIdOrInternalField(k, v)) {
            validChanges.push({ field: k, oldValue: null, newValue: v });
          }
        });
      }
      if (validChanges.length === 0) {
        if (log.recordLabel && !/^[0-9a-fA-F]{24}$/.test(String(log.recordLabel).trim())) {
          validChanges.push({ field: "Record", oldValue: null, newValue: log.recordLabel });
        }
        if (log.summary) {
          const cleanSummary = String(log.summary).replace(/^.*?(created|added|updated)[:\s]*/i, "").trim();
          if (cleanSummary && cleanSummary !== log.recordLabel) {
            validChanges.push({ field: "Details", oldValue: null, newValue: cleanSummary });
          }
        }
      }
    }

    if (validChanges.length > 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {validChanges.map((c, idx) => {
            const rawField = (c.field || "").replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
            const fieldName = rawField ? rawField.charAt(0).toUpperCase() + rawField.slice(1) : "Field";
            const hasOld = c.oldValue !== undefined && c.oldValue !== null && c.oldValue !== "" && c.oldValue !== "null";

            return (
              <div key={idx} style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", lineHeight: "1.4" }}>
                <span style={{ fontWeight: "600", color: "#475569", minWidth: "65px" }}>{fieldName}:</span>
                {hasOld ? (
                  <>
                    <span style={{ textDecoration: "line-through", color: "#ef4444", background: "#fef2f2", padding: "1px 6px", borderRadius: "4px" }}>
                      {formatValueCleanly(c.oldValue, fieldName)}
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: "11px" }}>→</span>
                    <span style={{ color: "#16a34a", fontWeight: "600", background: "#f0fdf4", padding: "1px 6px", borderRadius: "4px" }}>
                      {formatValueCleanly(c.newValue, fieldName)}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#16a34a", fontWeight: "600", background: "#f0fdf4", padding: "1px 6px", borderRadius: "4px" }}>
                    + {formatValueCleanly(c.newValue, fieldName)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (action === "created") {
      return (
        <span style={{ color: "#16a34a", fontWeight: "600", background: "#f0fdf4", padding: "2px 8px", borderRadius: "6px", fontSize: "12px" }}>
          + New {config.typeBadge} Record Created
        </span>
      );
    }

    if (action === "deleted") {
      return (
        <span style={{ color: "#ef4444", fontWeight: "600", background: "#fef2f2", padding: "2px 8px", borderRadius: "6px", fontSize: "12px" }}>
          - {config.typeBadge} Record Removed
        </span>
      );
    }

    return (
      <span style={{ color: "#8b5cf6", fontWeight: "600", background: "#f3e8ff", padding: "2px 8px", borderRadius: "6px", fontSize: "12px" }}>
        Record Updated
      </span>
    );
  };

  const toggleAllRows = () => {
    if (expandedRowIds.size === paginatedLogs.length) {
      setExpandedRowIds(new Set());
    } else {
      setExpandedRowIds(new Set(paginatedLogs.map((l) => l._id)));
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== "all") {
        const act = String(log.action || "").toLowerCase();
        if (actionFilter === "created" && !act.includes("create") && !act.includes("add")) return false;
        if (actionFilter === "deleted" && !act.includes("delete") && !act.includes("remove")) return false;
        if (actionFilter === "updated" && (act.includes("create") || act.includes("add") || act.includes("delete") || act.includes("remove"))) return false;
      }

      if (search) {
        const term = search.toLowerCase();
        const summaryText = (log.summary || "").toLowerCase();
        const userText = (log.userName || "").toLowerCase();
        const changesText = (log.changes || [])
          .map((c) => `${c.field} ${c.oldValue} ${c.newValue}`)
          .join(" ")
          .toLowerCase();
        const matchesSearch =
          summaryText.includes(term) || userText.includes(term) || changesText.includes(term);
        if (!matchesSearch) return false;
      }

      if (dateFrom || dateTo) {
        const logDateStr = log.createdAt ? new Date(log.createdAt).toISOString().split("T")[0] : "";
        if (dateFrom && logDateStr < dateFrom) return false;
        if (dateTo && logDateStr > dateTo) return false;
      }

      return true;
    });
  }, [logs, search, dateFrom, dateTo, actionFilter]);

  const totalItems = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handleDownloadCSV = () => {
    const dataToExport = filteredLogs.length > 0 ? filteredLogs : logs;
    if (!dataToExport || dataToExport.length === 0) return;

    const headers = ["Date & Time", "Type", "User", "Action", "Summary / Description", "Field Changes (Old -> New)"];

    const csvRows = dataToExport.map((log) => {
      const dateTime = `${new Date(log.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })} ${new Date(log.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;

      const type = config.typeBadge;
      const user = log.userName || "System";
      const action = log.action || "updated";
      const summary = log.summary || `${config.typeBadge} activity logged`;

      const changesText = (log.changes || [])
        .map((c) => {
          const rawField = (c.field || "").replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
          const fieldName = rawField.charAt(0).toUpperCase() + rawField.slice(1);
          if (c.oldValue !== undefined && c.oldValue !== null && c.oldValue !== "") {
            return `${fieldName}: ${c.oldValue} -> ${c.newValue}`;
          }
          return `${fieldName}: +${c.newValue}`;
        })
        .join(" | ");

      return [
        `"${dateTime.replace(/"/g, '""')}"`,
        `"${type.replace(/"/g, '""')}"`,
        `"${user.replace(/"/g, '""')}"`,
        `"${action.replace(/"/g, '""')}"`,
        `"${summary.replace(/"/g, '""')}"`,
        `"${(changesText || "-").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileName = `activity_log_${cleanLabel || recordId || config.typeBadge.toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatSummaryText = (summary) => {
    if (!summary) return `${config.typeBadge} updated successfully.`;
    const cleaned = summary.replace(/\s*\([^)]*->[^)]*\)/g, "").trim();
    if (!cleaned) return `${config.typeBadge} updated successfully.`;
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  };

  const renderExpandedContent = (log) => {
    const changes = extractLogChanges(log, itemDetails);
    const actionLower = String(log.action || "").toLowerCase();
    const isDeleted = actionLower.includes("delete") || actionLower.includes("remove");

    if (isDeleted || !changes || changes.length === 0) {
      return null;
    }

    const mid = Math.ceil(changes.length / 2);
    const leftChanges = changes.slice(0, mid);
    const rightChanges = changes.slice(mid);

    const renderChangeItem = (c, idx) => {
      const rawField = (c.field || "").replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
      const fieldName = rawField ? rawField.charAt(0).toUpperCase() + rawField.slice(1) : "Field";
      const hasOld = c.oldValue !== undefined && c.oldValue !== null && c.oldValue !== "" && c.oldValue !== "null";

      return (
        <div key={idx} style={{ fontSize: "13px", display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap", lineHeight: "1.5" }}>
          <span style={{ fontWeight: "600", color: "#475569" }}>
            {fieldName}:
          </span>
          {hasOld ? (
            <span style={{ color: "#334155" }}>
              <span style={{ color: "#64748b" }}>{formatValueCleanly(c.oldValue, fieldName)}</span>
              <span style={{ color: "#94a3b8", margin: "0 6px" }}>→</span>
              <span style={{ color: "#16a34a", fontWeight: "700" }}>{formatValueCleanly(c.newValue, fieldName)}</span>
            </span>
          ) : (
            <span style={{ color: "#16a34a", fontWeight: "700" }}>
              + {formatValueCleanly(c.newValue, fieldName)}
            </span>
          )}
        </div>
      );
    };

    return (
      <div
        style={{
          background: "#fafbfc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px 20px",
          marginTop: "6px",
          marginBottom: "6px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: changes.length > 1 ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr",
            gap: "10px 32px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {leftChanges.map((c, i) => renderChangeItem(c, i))}
          </div>
          {rightChanges.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {rightChanges.map((c, i) => renderChangeItem(c, i + mid))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="lm-container" style={{ padding: "16px 24px", width: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div className="lm-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div className="lm-header-left">
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>
            {headerTitle}
          </h2>
        </div>
        <div className="lm-header-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {canExportLog && (
          <button
            type="button"
            onClick={handleDownloadCSV}
            disabled={logs.length === 0}
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              border: "none",
              padding: "8px 14px",
              borderRadius: "8px",
              cursor: logs.length === 0 ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
              opacity: logs.length === 0 ? 0.6 : 1,
              transition: "all 0.2s ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Log CSV
          </button>
          )}
          <button
            type="button"
            className="lm-add-btn"
            onClick={handleBack}
            style={{
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              padding: "8px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            ← Back to {config.name}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className="lm-filters"
        style={{
          marginTop: "6px",
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div
          className="lm-search"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "8px 14px",
            flex: "1 1 220px",
            boxSizing: "border-box",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search activity history"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: "13px",
              color: "#1e293b",
              background: "transparent",
            }}
          />
          {search && (
            <button
              className="lm-search-clear"
              onClick={() => setSearch("")}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8" }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
                color: "#1e293b",
                outline: "none",
                cursor: "pointer",
              }}
              title="From Date"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
                color: "#1e293b",
                outline: "none",
                cursor: "pointer",
              }}
              title="To Date"
            />
          </div>

          {(search || dateFrom || dateTo || actionFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setActionFilter("all");
                setCurrentPage(1);
              }}
              style={{
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "#475569",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table Card */}
      <div
        className="lm-card"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflow: "hidden",
          marginTop: "10px",
          width: "100%",
        }}
      >
        {loading ? (
          <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
            Loading activity history...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: "36px", marginBottom: "8px" }}>📜</div>
            <h3 style={{ fontSize: "15px", fontWeight: "600", margin: "0 0 4px 0", color: "#334155" }}>
              No activity history found for this selection.
            </h3>
          </div>
        ) : (
          <>
            <div className="lm-table-wrapper" style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#fafbfc" }}>
                    <th style={{ width: "160px", padding: "12px 16px", color: "#64748b", fontWeight: "600", fontSize: "12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      Date and time
                    </th>
                    <th style={{ width: "110px", padding: "12px 16px", color: "#64748b", fontWeight: "600", fontSize: "12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      Type
                    </th>
                    <th style={{ padding: "12px 16px", color: "#64748b", fontWeight: "600", fontSize: "12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      Summary
                    </th>
                    <th style={{ width: "45px", padding: "12px 16px", color: "#64748b", borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => {
                    const changes = extractLogChanges(log, itemDetails);
                    const actionLower = String(log.action || "").toLowerCase();
                    const isDeleted = actionLower.includes("delete") || actionLower.includes("remove");
                    const hasExpandableChanges = !isDeleted && changes && changes.length > 0;
                    const isExpanded = hasExpandableChanges && expandedRowIds.has(log._id);

                    return (
                      <React.Fragment key={log._id}>
                        <tr
                          onClick={() => hasExpandableChanges && toggleRow(log._id)}
                          style={{
                            cursor: hasExpandableChanges ? "pointer" : "default",
                            borderBottom: isExpanded ? "none" : "1px solid #f1f5f9",
                            background: isExpanded ? "#ffffff" : "transparent",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <td style={{ whiteSpace: "nowrap", padding: "14px 16px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "13px" }}>
                              {new Date(log.createdAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              {new Date(log.createdAt).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }).toLowerCase()}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "4px 12px",
                                borderRadius: "16px",
                                fontSize: "11.5px",
                                fontWeight: "600",
                                background: "#eff6ff",
                                color: "#2563eb",
                                border: "1px solid rgba(37, 99, 235, 0.2)",
                              }}
                            >
                              {config.typeBadge}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: "700", color: "#0f172a", fontSize: "13.5px" }}>{log.userName || "System"}</span>
                              {getActionBadge(log.action, log)}
                            </div>
                            <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "3px" }}>
                              {formatSummaryText(log.summary)}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", verticalAlign: "top", textAlign: "center" }}>
                            {hasExpandableChanges && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRow(log._id);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#64748b",
                                  padding: "4px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "transform 0.2s ease",
                                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td colSpan={4} style={{ padding: "0 16px 14px 16px" }}>
                              {renderExpandedContent(log)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div style={{ borderTop: "1px solid #e2e8f0" }}>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[5, 10, 20, 50]}
                variant="table"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GenericDetailActivityLog;
