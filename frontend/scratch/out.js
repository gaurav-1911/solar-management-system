import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Sector,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";
import { useAuth } from "../../../context/AuthContext";
import { ROLES, MODULES, hasAnyAccess } from "../../../config/roles";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
import StatCard from "../StatCard/StatCard";
import TableLoader from "../../../components/common/TableLoader";
import PageLoader from "../../../components/common/PageLoader";
import {
  quotationAPI,
  leadAPI,
  ticketAPI,
  invoiceAPI,
  vendorPaymentAPI,
  customerAPI,
  installationAPI,
  inventoryAPI,
  productAPI,
  vendorAPI,
  subsidyAPI,
  taskAssignmentAPI,
  maintenanceTicketAPI,
  warrantyAPI
} from "../../../services";
import "./Dashboard.css";
const RolePermissions = lazy(() => import("../RolePermissions/RolePermissions"));
const LeadManagement = lazy(() => import("../../leadManagement/leadManagement"));
const GenericDetailActivityLog = lazy(() => import("../../common/GenericDetailActivityLog"));
const CustomerManagement = lazy(() => import("../../customerManagement/customerManagement"));
const CustomerProgress = lazy(() => import("../../customerProgress/CustomerProgress"));
const TechnicianDetails = lazy(() => import("../../technicianDetails/TechnicianDetails"));
const Quotations = lazy(() => import("../../quotation/quotation"));
const SolarMonitoring = lazy(() => import("../../SolarMonitoring/SolarMonitoring"));
const AlertNotifications = lazy(() => import("../../alerts/AlertNotifications"));
const MaintenanceManagement = lazy(() => import("../../maintenance/MaintenanceManagement"));
const TicketSupport = lazy(() => import("../../tickets/TicketSupport"));
const AMCManagement = lazy(() => import("../../amc/AMCManagement"));
const ProductCatalog = lazy(() => import("../../products/ProductCatalog"));
const InventoryManagement = lazy(() => import("../../inventory/InventoryManagement"));
const VendorManagement = lazy(() => import("../../vendors/VendorManagement"));
const WarehouseManagement = lazy(() => import("../../warehouses/WarehouseManagement"));
const SiteSurvey = lazy(() => import("../../SiteSurvey/SiteSurvey"));
const SolarDesign = lazy(() => import("../../SolarDesign/SolarDesign"));
const ProjectApproval = lazy(() => import("../../ProjectApproval/ProjectApproval"));
const InstallationManagement = lazy(() => import("../../installations/InstallationManagement"));
const TechnicianManagement = lazy(() => import("../../technicians/TechnicianManagement"));
const TechnicianAttendance = lazy(() => import("../../technicians/Attendance"));
const TaskAssignment = lazy(() => import("../../technicians/TaskAssignment"));
const TeamSchedule = lazy(() => import("../../technicians/TeamSchedule"));
const TestingModule = lazy(() => import("../../testing/TestingModule"));
const DailyProgressLog = lazy(() => import("../../DailyProgress/DailyProgressLog"));
const SubsidyManagement = lazy(() => import("../../subsidy/SubsidyManagement"));
const ProjectProgress = lazy(() => import("../../ProjectProgress/ProjectProgress"));
const CommissioningAndHandover = lazy(() => import("../../CommissioningAndHandover/CommissioningAndHandover"));
const Warranty = lazy(() => import("../Warranty/Warranty"));
const Billing = lazy(() => import("../Billing/Billing"));
const Payments = lazy(() => import("../Payments/Payments"));
const UserManagement = lazy(() => import("../UserManagement/User.Management"));
const DocumentManagement = lazy(() => import("../Documents/Documents"));
const SalesReports = lazy(() => import("../Reports/SalesReports"));
const ProjectReports = lazy(() => import("../Reports/ProjectReports"));
const InventoryReports = lazy(() => import("../Reports/InventoryReports"));
const TechnicianReports = lazy(() => import("../Reports/TechnicianReports"));
const Settings = lazy(() => import("../Settings/Settings"));
const Profile = lazy(() => import("../Profile/Profile"));
const ActivityLogs = lazy(() => import("../ActivityLogs/ActivityLogs"));
const GATED_MODULES = new Set(Object.values(MODULES));
const iconLeads = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M22 12h-4l-3 9L9 3l-3 9H2" })
);
const iconClients = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" }),
  /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "7", r: "4" }),
  /* @__PURE__ */ React.createElement("path", { d: "M23 21v-2a4 4 0 00-3-3.87" }),
  /* @__PURE__ */ React.createElement("path", { d: "M16 3.13a4 4 0 010 7.75" })
);
const iconInstall = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("rect", { x: "1", y: "6", width: "22", height: "12", rx: "2" }),
  /* @__PURE__ */ React.createElement("line", { x1: "1", y1: "12", x2: "23", y2: "12" }),
  /* @__PURE__ */ React.createElement("line", { x1: "8", y1: "6", x2: "8", y2: "18" }),
  /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "6", x2: "16", y2: "18" })
);
const iconRevenue = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M6 3h12" }),
  /* @__PURE__ */ React.createElement("path", { d: "M6 8h12" }),
  /* @__PURE__ */ React.createElement("path", { d: "M6 13l8.5 8" }),
  /* @__PURE__ */ React.createElement("path", { d: "M6 13h3a4 4 0 0 0 0-8" })
);
const iconTickets = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" })
);
const iconQuotes = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }),
  /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }),
  /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
  /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "17", x2: "8", y2: "17" })
);
const iconInventory = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("path", { d: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" }),
  /* @__PURE__ */ React.createElement("polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }),
  /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "22.08", x2: "12", y2: "12" })
);
const iconMaintenance = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }),
  /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" })
);
const iconPayments = /* @__PURE__ */ React.createElement(
  "svg",
  {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  },
  /* @__PURE__ */ React.createElement("rect", { x: "1", y: "4", width: "22", height: "16", rx: "2" }),
  /* @__PURE__ */ React.createElement("line", { x1: "1", y1: "10", x2: "23", y2: "10" })
);
const roleStats = {
  [ROLES.SUPER_ADMIN]: [
    { key: "totalLeads", title: "Total Leads", change: null, color: "blue", icon: iconLeads },
    { key: "activeCustomers", title: "Active Customers", change: null, color: "green", icon: iconClients },
    { key: "pendingQuotes", title: "Pending Quotes", change: null, color: "orange", icon: iconQuotes },
    { key: "pipelineValue", title: "Pipeline Value", change: null, color: "purple", icon: iconRevenue },
    { key: "totalInstallations", title: "Total Installations", change: null, color: "teal", icon: iconInstall },
    { key: "revenue", title: "Total Revenue", change: null, color: "yellow", icon: iconRevenue },
    { key: "outstanding", title: "Outstanding Payments", change: null, color: "red", icon: iconPayments },
    { key: "invoices", title: "Settled Invoices", change: null, color: "pink", icon: iconPayments }
  ],
  [ROLES.COMPANY_ADMIN]: [
    { key: "totalLeads", title: "Total Leads", change: null, color: "blue", icon: iconLeads },
    { key: "activeCustomers", title: "Active Customers", change: null, color: "green", icon: iconClients },
    { key: "pendingQuotes", title: "Pending Quotes", change: null, color: "orange", icon: iconQuotes },
    { key: "pipelineValue", title: "Pipeline Value", change: null, color: "purple", icon: iconRevenue },
    { key: "totalInstallations", title: "Total Installations", change: null, color: "teal", icon: iconInstall },
    { key: "revenue", title: "Total Revenue", change: null, color: "yellow", icon: iconRevenue },
    { key: "outstanding", title: "Outstanding Payments", change: null, color: "red", icon: iconPayments },
    { key: "invoices", title: "Settled Invoices", change: null, color: "pink", icon: iconPayments }
  ],
  [ROLES.SALES_MANAGER]: [
    { key: "totalLeads", title: "Total Leads", change: null, color: "blue", icon: iconLeads },
    { key: "activeCustomers", title: "Active Customers", change: null, color: "green", icon: iconClients },
    { key: "pendingQuotes", title: "Pending Quotes", change: null, color: "orange", icon: iconQuotes },
    { key: "pipelineValue", title: "Pipeline Value", change: null, color: "purple", icon: iconRevenue }
  ],
  [ROLES.TECHNICIAN]: [
    { key: "assignedJobs", title: "Assigned Jobs", change: null, color: "blue", icon: iconInstall },
    { key: "openTickets", title: "Open Tickets", change: null, color: "yellow", icon: iconTickets },
    { key: "maintenanceDue", title: "Maintenance Due", change: null, color: "red", icon: iconMaintenance },
    { key: "totalInstallations", title: "My Installations", change: null, color: "green", icon: iconInstall }
  ],
  [ROLES.CUSTOMER]: [
    { key: "openTickets", title: "Open Tickets", change: null, color: "blue", icon: iconTickets },
    { key: "invoices", title: "My Invoices", change: null, color: "green", icon: iconPayments },
    { key: "outstanding", title: "Outstanding Payments", change: null, color: "yellow", icon: iconPayments },
    { key: "warrantyActive", title: "Warranty Active", change: null, color: "purple", icon: iconMaintenance }
  ],
  [ROLES.ACCOUNTANT]: [
    { key: "revenue", title: "Total Revenue", change: null, color: "blue", icon: iconRevenue },
    { key: "outstanding", title: "Pending Payments", change: null, color: "yellow", icon: iconPayments },
    { key: "invoices", title: "Invoices", change: null, color: "green", icon: iconQuotes },
    { key: "overdue", title: "Overdue", change: null, color: "red", icon: iconPayments }
  ],
  [ROLES.SUPPORT_TEAM]: [
    { key: "openTickets", title: "Open Tickets", change: null, color: "blue", icon: iconTickets },
    { key: "inProgress", title: "In Progress", change: null, color: "yellow", icon: iconTickets },
    { key: "resolvedToday", title: "Resolved Today", change: null, color: "green", icon: iconTickets },
    { key: "totalTickets", title: "Total Tickets", change: null, color: "purple", icon: iconTickets }
  ]
};
function lastMonthsBuckets(count = 7) {
  const buckets = [];
  const now = /* @__PURE__ */ new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en", { month: "short" });
    buckets.push({ key, label });
  }
  return buckets;
}
const toMonthKey = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const revenueData = lastMonthsBuckets().map((b) => ({ month: b.label, revenue: 0, expenses: 0 }));
const billingChartFallback = lastMonthsBuckets().map((b) => ({
  month: b.label,
  paid: 0,
  pending: 0,
  overdue: 0
}));
const LegendIcon = ({ name, color, size = 14 }) => {
  const s = size;
  const c = color;
  switch (name) {
    case "Production":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement("polygon", { points: "8,1 3,9 7,9 6,13 11,5 7,5", fill: c }));
    case "Consumption":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement("rect", { x: "4.5", y: "7", width: "5", height: "5", rx: "1", fill: c }), /* @__PURE__ */ React.createElement("rect", { x: "5.5", y: "3", width: "3", height: "4", fill: c }), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "7",
          y1: "3",
          x2: "7",
          y2: "1.5",
          stroke: c,
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      ));
    case "Completed":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "7",
          cy: "7",
          r: "6",
          fill: "none",
          stroke: c,
          strokeWidth: "1.5"
        }
      ), /* @__PURE__ */ React.createElement(
        "polyline",
        {
          points: "4,7 6,9.5 10,4.5",
          fill: "none",
          stroke: c,
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    case "Pending":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "7",
          cy: "7",
          r: "6",
          fill: "none",
          stroke: c,
          strokeWidth: "1.5",
          strokeDasharray: "2 2"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "7",
          y1: "3.5",
          x2: "7",
          y2: "7.5",
          stroke: c,
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "7",
          y1: "7.5",
          x2: "9.5",
          y2: "9.5",
          stroke: c,
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      ));
    case "Revenue":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "7",
          y1: "12",
          x2: "7",
          y2: "3",
          stroke: c,
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "polyline",
        {
          points: "3,7 7,3 11,7",
          fill: "none",
          stroke: c,
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    case "Expenses":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "7",
          y1: "2",
          x2: "7",
          y2: "11",
          stroke: c,
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "polyline",
        {
          points: "3,7 7,11 11,7",
          fill: "none",
          stroke: c,
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    /* ── Lead Source icons ── */
    case "Website":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "7",
          cy: "7",
          r: "5.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.4"
        }
      ), /* @__PURE__ */ React.createElement(
        "ellipse",
        {
          cx: "7",
          cy: "7",
          rx: "2.8",
          ry: "5.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.1"
        }
      ), /* @__PURE__ */ React.createElement("line", { x1: "1.5", y1: "7", x2: "12.5", y2: "7", stroke: c, strokeWidth: "1.1" }));
    case "Referral":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "4.5",
          cy: "4",
          r: "2.3",
          fill: "none",
          stroke: c,
          strokeWidth: "1.4"
        }
      ), /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M2 10.5C2 9 3.1 8 4.5 8S7 9 7 10.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.4",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "10",
          cy: "4.5",
          r: "2",
          fill: "none",
          stroke: c,
          strokeWidth: "1.2"
        }
      ), /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M8 10.5C8 9.3 8.9 8.5 10 8.5S12 9.3 12 10.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.2",
          strokeLinecap: "round"
        }
      ));
    case "Social Media":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "4",
          cy: "7",
          r: "2",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3"
        }
      ), /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "10",
          cy: "3.5",
          r: "2",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3"
        }
      ), /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "10",
          cy: "10.5",
          r: "2",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "5.5",
          y1: "6",
          x2: "8.5",
          y2: "4.5",
          stroke: c,
          strokeWidth: "1.3",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "5.5",
          y1: "8",
          x2: "8.5",
          y2: "9.5",
          stroke: c,
          strokeWidth: "1.3",
          strokeLinecap: "round"
        }
      ));
    case "Cold Call":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "rect",
        {
          x: "3",
          y: "1",
          width: "8",
          height: "12",
          rx: "1.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "5.5",
          y1: "10",
          x2: "8.5",
          y2: "10",
          stroke: c,
          strokeWidth: "1.3",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "5.5",
          y1: "11.5",
          x2: "8.5",
          y2: "11.5",
          stroke: c,
          strokeWidth: "0.8",
          strokeLinecap: "round"
        }
      ));
    case "Walk-in":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "rect",
        {
          x: "1.5",
          y: "1.5",
          width: "4",
          height: "11",
          rx: "0.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3"
        }
      ), /* @__PURE__ */ React.createElement(
        "polyline",
        {
          points: "10,7 7,4.5 7,9.5",
          fill: "none",
          stroke: c,
          strokeWidth: "1.3",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: "12",
          y1: "7",
          x2: "7",
          y2: "7",
          stroke: c,
          strokeWidth: "1.3",
          strokeLinecap: "round"
        }
      ));
    case "In Progress":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "5.2", fill: "none", stroke: c, strokeWidth: "1.6", opacity: "0.35" }), /* @__PURE__ */ React.createElement("path", { d: "M7 1.8A5.2 5.2 0 0 1 12.2 7", fill: "none", stroke: c, strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "1.6", fill: c }));
    case "Paid":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "6", fill: c }), /* @__PURE__ */ React.createElement(
        "polyline",
        {
          points: "4.3,7.1 6.2,9 9.8,5.1",
          fill: "none",
          stroke: "#ffffff",
          strokeWidth: "1.7",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    case "Overdue":
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14", fill: "none" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M7 1.6 12.9 12H1.1L7 1.6Z",
          fill: "none",
          stroke: c,
          strokeWidth: "1.5",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ React.createElement("line", { x1: "7", y1: "5.4", x2: "7", y2: "8.6", stroke: c, strokeWidth: "1.5", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "10.4", r: "0.9", fill: c }));
    default:
      return /* @__PURE__ */ React.createElement("svg", { width: s, height: s, viewBox: "0 0 14 14" }, /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "7", r: "5", fill: c }));
  }
};
const ChartLegend = ({ payload }) => /* @__PURE__ */ React.createElement("ul", { className: "chart-legend" }, payload?.map((entry, index) => /* @__PURE__ */ React.createElement("li", { key: `legend-${index}`, className: "chart-legend-item" }, /* @__PURE__ */ React.createElement(LegendIcon, { name: entry.value, color: entry.color, size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "chart-legend-text" }, entry.value))));
const LEAD_SOURCE_COLORS = [
  "#0b3d3a",
  "#059669",
  "#3b82f6",
  "#d97706",
  "#7c3aed"
];
const INSTALLATION_STATUS_COLORS = {
  Total: "#0b3d3a",
  Completed: "#059669",
  "In Progress": "#e8a33d",
  Pending: "#94a3b8"
};
const QUOTATION_STATUS_CLASS = {
  Approved: "status-completed",
  Rejected: "status-rejected",
  Sent: "status-progress",
  Negotiating: "status-progress",
  "Pending Approval": "status-pending",
  Draft: "status-pending"
};
const formatINR = (n) => {
  const num = Number(String(n ?? 0).replace(/[₹,]/g, ""));
  return Number.isNaN(num) ? "\u20B90" : `\u20B9${num.toLocaleString("en-IN")}`;
};
const formatShortDate = (iso) => {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
};
const isSameDay = (iso, ref = /* @__PURE__ */ new Date()) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
};
const Dashboard = () => {
  const { section, id } = useParams();
  const navigate = useNavigate();
  const activeItem = section || "dashboard";
  const sidebarActiveItem = activeItem && activeItem.endsWith("-activity") ? activeItem.replace("-activity", "") : activeItem;
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [installationStats, setInstallationStats] = useState(null);
  const [leadSources, setLeadSources] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const installationRadar = [
    { axis: "Total", name: "Total", value: Number(installationStats?.total) || 0 },
    { axis: "Completed", name: "Completed", value: Number(installationStats?.completed) || 0 },
    { axis: "In Progress", name: "In Progress", value: Number(installationStats?.inProgress) || 0 },
    { axis: "Pending", name: "Pending", value: Number(installationStats?.pending) || 0 }
  ];
  const hasInstallationData = (installationStats?.total || 0) > 0;
  const [recentQuotations, setRecentQuotations] = useState([]);
  const [quotationsLoading, setQuotationsLoading] = useState(true);
  const [quotationsError, setQuotationsError] = useState(false);
  const [billingStats, setBillingStats] = useState(null);
  const [revenueChartData, setRevenueChartData] = useState(revenueData);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [rawVendorPayments, setRawVendorPayments] = useState([]);
  const [rawSubsidies, setRawSubsidies] = useState([]);
  const [rawInstallationsList, setRawInstallationsList] = useState([]);
  const [chartRange, setChartRange] = useState(6);
  const [billingChartData, setBillingChartData] = useState(billingChartFallback);
  const [counts, setCounts] = useState({});
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" && e.target.type === "number" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
      }
    };
    const handleWheel = (e) => {
      if (e.target.tagName === "INPUT" && e.target.type === "number") {
        e.target.blur();
      }
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
    document.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    const contentEl = document.querySelector(".dashboard-content");
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
  }, [activeItem]);
  const handleNavigate = (item) => {
    window.scrollTo(0, 0);
    const contentEl = document.querySelector(".dashboard-content");
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
    if (item === "dashboard") {
      navigate("/admin/dashboard");
    } else {
      navigate(`/admin/${item}`);
    }
  };
  const roleBaseStats = roleStats[user?.role] || roleStats[ROLES.COMPANY_ADMIN];
  const leadSourcesTotal = leadSources.reduce((sum, ls) => sum + (ls.value || 0), 0);
  const billingTotals = useMemo(() => {
    let totalPaid = 0;
    let totalPending = 0;
    let totalOverdue = 0;
    (billingChartData || []).forEach((b) => {
      totalPaid += Number(b.paid) || 0;
      totalPending += Number(b.pending) || 0;
      totalOverdue += Number(b.overdue) || 0;
    });
    const grandTotal = totalPaid + totalPending + totalOverdue;
    const rate = grandTotal > 0 ? Math.round(totalPaid / grandTotal * 100) : 0;
    return {
      paid: totalPaid,
      pending: totalPending,
      overdue: totalOverdue,
      rate: rate > 0 ? rate : 75
    };
  }, [billingChartData]);
  const revenueTotals = useMemo(() => {
    let totalRev = 0;
    let totalExp = 0;
    (revenueChartData || []).forEach((r) => {
      totalRev += Number(r.revenue) || 0;
      totalExp += Number(r.expenses) || 0;
    });
    const netProfit = Math.max(0, totalRev - totalExp);
    const margin = totalRev > 0 ? Math.round(netProfit / totalRev * 100) : 0;
    return {
      revenue: totalRev,
      expenses: totalExp,
      profit: netProfit,
      margin: margin > 0 ? margin : 52
    };
  }, [revenueChartData]);
  const solarAssetValuationData = useMemo(() => {
    return (revenueChartData || []).map((r, i) => {
      const baseRev = Number(r.revenue) || 0;
      const baseExp = Number(r.expenses) || 0;
      const assetVal = baseRev > 0 ? Math.round(baseRev * 4.2) : (i + 1) * 75e4;
      const omCost = baseExp > 0 ? Math.round(baseExp * 0.4) : (i + 1) * 85e3;
      const roiRate = assetVal > 0 ? Number(((assetVal - omCost) / assetVal * 22).toFixed(1)) : 14.5;
      return {
        month: r.month,
        assetValue: assetVal,
        omCost,
        roiRate: roiRate > 0 ? roiRate : 16.8
      };
    });
  }, [revenueChartData]);
  const assetTotals = useMemo(() => {
    let totalVal = 0;
    let totalOm = 0;
    solarAssetValuationData.forEach((d) => {
      totalVal += d.assetValue;
      totalOm += d.omCost;
    });
    const avgRoi = solarAssetValuationData.length > 0 ? (solarAssetValuationData.reduce((acc, curr) => acc + curr.roiRate, 0) / solarAssetValuationData.length).toFixed(1) : 18.6;
    return {
      assetValue: totalVal > 0 ? totalVal : 482e5,
      omCost: totalOm > 0 ? totalOm : 245e4,
      avgRoi: avgRoi > 0 ? avgRoi : 18.6
    };
  }, [solarAssetValuationData]);
  const monitoringChartData = useMemo(() => {
    const buckets = lastMonthsBuckets(chartRange);
    const genMap = {};
    const consMap = {};
    (rawInstallationsList || []).forEach((inst) => {
      const key = toMonthKey(inst.installationDate || inst.createdAt);
      if (!key) return;
      const kw = Number(inst.systemSize || inst.capacity || inst.kwp) || 5;
      const kwhGen = Math.round(kw * 120);
      const kwhCons = Math.round(kwhGen * 0.45);
      genMap[key] = (genMap[key] || 0) + kwhGen;
      consMap[key] = (consMap[key] || 0) + kwhCons;
    });
    return buckets.map((b) => {
      return {
        month: b.label,
        generation: genMap[b.key] || 0,
        consumption: consMap[b.key] || 0
      };
    });
  }, [rawInstallationsList, chartRange]);
  const monitoringTotals = useMemo(() => {
    let totalGen = 0;
    let totalCons = 0;
    monitoringChartData.forEach((s) => {
      totalGen += s.generation;
      totalCons += s.consumption;
    });
    const selfSufficiency = totalGen > 0 ? Math.round(totalCons / totalGen * 100) : 0;
    return {
      generation: (totalGen / 1e3).toFixed(1),
      consumption: (totalCons / 1e3).toFixed(1),
      efficiency: selfSufficiency
    };
  }, [monitoringChartData]);
  const openTickets = tickets.filter(
    (t) => !["Resolved", "Closed"].includes(t.status)
  ).length;
  const inProgressTickets = tickets.filter(
    (t) => t.status === "In Progress"
  ).length;
  const resolvedToday = tickets.filter(
    (t) => ["Resolved", "Closed"].includes(t.status) && isSameDay(t.updatedAt || t.createdAt)
  ).length;
  const stats = roleBaseStats.map((stat) => {
    let rawVal = void 0;
    switch (stat.key) {
      case "totalLeads":
        rawVal = counts.totalLeads;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "activeCustomers":
        rawVal = counts.activeCustomers;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "totalInstallations":
        rawVal = counts.totalInstallations;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "pipelineValue":
        rawVal = counts.pipelineValue;
        return { ...stat, value: rawVal !== void 0 ? formatINR(rawVal) : void 0 };
      case "pendingQuotes":
        rawVal = counts.pendingQuotes;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "inventoryItems":
        rawVal = counts.inventoryItems;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "assignedJobs":
        rawVal = counts.assignedJobs;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "maintenanceDue":
        rawVal = counts.maintenanceDue;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "warrantyActive":
        rawVal = counts.warrantyActive;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "revenue":
        rawVal = billingStats?.totalInvoiced;
        return { ...stat, value: rawVal !== void 0 ? formatINR(rawVal) : void 0 };
      case "outstanding":
        rawVal = billingStats?.outstanding;
        return { ...stat, value: rawVal !== void 0 ? formatINR(rawVal) : void 0 };
      case "invoices":
        rawVal = billingStats?.invoiceCount;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "overdue":
        rawVal = billingStats?.overdueAmount;
        return { ...stat, value: rawVal !== void 0 ? formatINR(rawVal) : void 0 };
      case "openTickets":
        rawVal = ticketsLoading ? void 0 : openTickets;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "inProgress":
        rawVal = ticketsLoading ? void 0 : inProgressTickets;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "resolvedToday":
        rawVal = ticketsLoading ? void 0 : resolvedToday;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      case "totalTickets":
        rawVal = ticketsLoading ? void 0 : tickets.length;
        return { ...stat, value: rawVal !== void 0 ? Number(rawVal).toLocaleString() : void 0 };
      default:
        return stat;
    }
  });
  const getStatusClass = (status) => {
    switch (status) {
      case "Completed":
      case "Converted":
      case "Resolved":
      case "Closed":
        return "status-completed";
      case "In Progress":
      case "Waiting on Customer":
      case "Follow-up":
      case "Proposal Sent":
      case "Contacted":
      case "Interested":
        return "status-progress";
      case "Pending":
      case "New":
      case "Open":
        return "status-pending";
      case "Qualified":
        return "status-qualified";
      case "Lost":
        return "status-rejected";
      default:
        return "";
    }
  };
  const getPriorityClass = (priority) => {
    switch (priority) {
      case "Critical":
      case "High":
        return "priority-high";
      case "Medium":
        return "priority-medium";
      case "Low":
        return "priority-low";
      default:
        return "";
    }
  };
  const getHeaderTitle = () => {
    if (activeItem === "dashboard") return "Dashboard";
    if (activeItem === "role-permissions") return "Role Permissions Matrix";
    return activeItem.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };
  const showCharts = [
    ROLES.SUPER_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.SALES_MANAGER,
    ROLES.ACCOUNTANT
  ].includes(user?.role);
  const showLeadsTable = [
    ROLES.SUPER_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.SALES_MANAGER
  ].includes(user?.role);
  const showTicketsTable = [
    ROLES.SUPER_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.TECHNICIAN,
    ROLES.SUPPORT_TEAM,
    ROLES.CUSTOMER
  ].includes(user?.role);
  const showPerformers = [
    ROLES.SUPER_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.SALES_MANAGER
  ].includes(user?.role);
  const { data: dashboardQuotations } = useQuery({
    queryKey: ["recentQuotations"],
    queryFn: async () => {
      const res = await quotationAPI.getAll({ page: 1, limit: 10 });
      return (res.data?.data || []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    },
    enabled: activeItem === "dashboard" && showPerformers
  });
  const { data: dashboardLeads } = useQuery({
    queryKey: ["recentLeads"],
    queryFn: async () => {
      const res = await leadAPI.getAll({ page: 1, limit: 10 });
      return (res.data?.data || []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    },
    enabled: activeItem === "dashboard" && showLeadsTable
  });
  const { data: dashboardTickets } = useQuery({
    queryKey: ["recentTickets"],
    queryFn: async () => {
      const res = await ticketAPI.getAll({ page: 1, limit: 100 });
      return res.data?.data || [];
    },
    enabled: activeItem === "dashboard" && showTicketsTable
  });
  useEffect(() => {
    if (dashboardQuotations) {
      setRecentQuotations(dashboardQuotations);
      setQuotationsLoading(false);
      setQuotationsError(false);
    }
  }, [dashboardQuotations]);
  useEffect(() => {
    if (dashboardLeads) {
      setLeads(dashboardLeads);
      setLeadsLoading(false);
    }
  }, [dashboardLeads]);
  useEffect(() => {
    if (dashboardTickets) {
      setTickets(dashboardTickets);
      setTicketsLoading(false);
      setTicketsError(false);
    }
  }, [dashboardTickets]);
  useEffect(() => {
    if (activeItem !== "dashboard") return;
    let cancelled = false;
    (async () => {
      try {
        const [invRes, vpRes] = await Promise.all([
          invoiceAPI.getAll({ page: 1, limit: 200 }),
          vendorPaymentAPI.getAll({ page: 1, limit: 200 })
        ]);
        if (cancelled) return;
        const invoices = invRes.data?.data || [];
        const vendorPayments = vpRes.data?.data || [];
        setRawInvoices(invoices);
        setRawVendorPayments(vendorPayments);
        const totalInvoiced = invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
        const outstanding = invoices.filter((inv) => inv.paymentStatus !== "Paid").reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
        const overdueAmount = invoices.filter((inv) => {
          if (!inv.dueDate) return false;
          return new Date(inv.dueDate) < /* @__PURE__ */ new Date() && inv.paymentStatus !== "Paid";
        }).reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
        const invoiceCount = invoices.length;
        if (!cancelled) {
          setBillingStats({ totalInvoiced, outstanding, overdueAmount, invoiceCount });
        }
      } catch (err) {
        if (err.response?.status !== 403 && err.response?.status !== 401 && err?.code !== "ERR_NETWORK") {
          console.warn("Failed to load dashboard billing data:", err.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeItem]);
  useEffect(() => {
    const toMonthKey2 = (dateVal) => {
      if (!dateVal) return null;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const buckets = lastMonthsBuckets(chartRange);
    const revMap = {};
    const expMap = {};
    rawInvoices.forEach((inv) => {
      const key = toMonthKey2(inv.invoiceDate || inv.createdAt);
      if (!key) return;
      revMap[key] = (revMap[key] || 0) + (Number(inv.totalAmount) || 0);
    });
    rawVendorPayments.forEach((vp) => {
      if (vp.status !== "Paid" || !vp.paidDate) return;
      const key = toMonthKey2(vp.paidDate);
      if (!key) return;
      expMap[key] = (expMap[key] || 0) + (Number(vp.amount) || 0);
    });
    setRevenueChartData(
      buckets.map((b) => {
        const rev = revMap[b.key] || 0;
        const exp = expMap[b.key] || 0;
        return {
          month: b.label,
          monthKey: b.key,
          revenue: rev,
          expenses: exp,
          inflow: rev,
          outflow: -exp,
          netCash: rev - exp
        };
      })
    );
    const paidMap = {};
    const pendingMap = {};
    const overdueMap = {};
    const now = /* @__PURE__ */ new Date();
    rawInvoices.forEach((inv) => {
      const key = toMonthKey2(inv.invoiceDate || inv.createdAt);
      if (!key) return;
      const amt = Number(inv.totalAmount) || 0;
      const status = String(inv.paymentStatus || "Pending");
      if (status === "Paid") {
        paidMap[key] = (paidMap[key] || 0) + amt;
      } else if (inv.dueDate && new Date(inv.dueDate) < now) {
        overdueMap[key] = (overdueMap[key] || 0) + amt;
      } else {
        pendingMap[key] = (pendingMap[key] || 0) + amt;
      }
    });
    setBillingChartData(
      buckets.map((b) => ({
        month: b.label,
        monthKey: b.key,
        paid: paidMap[b.key] || 0,
        pending: pendingMap[b.key] || 0,
        overdue: overdueMap[b.key] || 0
      }))
    );
  }, [rawInvoices, rawVendorPayments, chartRange]);
  useEffect(() => {
    if (activeItem !== "dashboard") return;
    let cancelled = false;
    const isAdminRole = user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.COMPANY_ADMIN;
    const can = (mod) => isAdminRole || Array.isArray(user?.permissions) && user.permissions.includes(mod);
    const updateCounts = (newPartial) => {
      if (cancelled) return;
      setCounts((prev) => ({ ...prev, ...newPartial }));
    };
    if (can("leads")) {
      leadAPI.getAnalytics().then((res) => {
        const d = res?.data?.data;
        if (!d || cancelled) return;
        updateCounts({
          totalLeads: d.totalLeads ?? 0,
          newLeads: d.newLeads ?? 0,
          converted: d.converted ?? 0,
          pipelineValue: d.totalPipelineValue ?? 0
        });
        if (d.sourceCounts) {
          const sc = d.sourceCounts;
          const sourceList = Object.keys(sc).filter((k) => sc[k] > 0).map((k) => ({ name: k, value: sc[k] || 0 }));
          setLeadSources(sourceList);
        }
      }).catch(() => {
      });
    }
    if (can("customers")) {
      customerAPI.getAnalytics().then((res) => {
        const d = res?.data?.data;
        if (!d || cancelled) return;
        updateCounts({
          totalCustomers: d.totalCustomers ?? 0,
          activeCustomers: d.activeCustomers ?? 0
        });
      }).catch(() => {
      });
    }
    if (can("quotations")) {
      quotationAPI.getAnalytics().then((res) => {
        const d = res?.data?.data;
        if (!d || cancelled) return;
        updateCounts({
          totalQuotes: d.totalQuotes ?? 0,
          pendingQuotes: d.pendingCount ?? 0,
          approvedQuotes: d.approvedCount ?? 0
        });
      }).catch(() => {
      });
    }
    if (can("installations")) {
      installationAPI.getAll({ page: 1, limit: 100 }).then((res) => {
        if (cancelled) return;
        const rawInstallations = res?.data?.data || [];
        setRawInstallationsList(rawInstallations);
        const installationCount = res?.data?.pagination?.total ?? rawInstallations.length ?? 0;
        updateCounts({ totalInstallations: installationCount });
      }).catch(() => {
      });
      installationAPI.getStats().then((res) => {
        if (cancelled) return;
        const d = res?.data?.data;
        if (!d) return;
        setInstallationStats({
          total: Number(d.total) || 0,
          pending: Number(d.pending) || 0,
          inProgress: Number(d.inProgress) || 0,
          completed: Number(d.completed) || 0
        });
      }).catch(() => {
      });
    }
    if (can("subsidy")) {
      subsidyAPI.getAll({ page: 1, limit: 100 }).then((res) => {
        if (cancelled) return;
        const list = res?.data?.data || [];
        setRawSubsidies(list);
      }).catch(() => {
      });
    }
    const singleCountConfigs = [
      { key: "inventoryItems", mod: "inventory", fn: () => inventoryAPI.getAll({ page: 1, limit: 1 }) },
      { key: "products", mod: "products", fn: () => productAPI.getAll({ page: 1, limit: 1 }) },
      { key: "vendors", mod: "vendors", fn: () => vendorAPI.getAll({ page: 1, limit: 1 }) },
      { key: "subsidies", mod: "subsidy", fn: () => subsidyAPI.getAll({ page: 1, limit: 1 }) },
      { key: "assignedJobs", mod: "task-assignment", fn: () => taskAssignmentAPI.getAll({ page: 1, limit: 1 }) },
      { key: "maintenanceDue", mod: "maintenance", fn: () => maintenanceTicketAPI.getAll({ page: 1, limit: 1 }) },
      { key: "warrantyActive", mod: "warranty", fn: () => warrantyAPI.getAll({ page: 1, limit: 1 }) }
    ];
    singleCountConfigs.forEach(({ key, mod, fn }) => {
      if (can(mod)) {
        fn().then((res) => {
          const total = res?.data?.pagination?.total ?? res?.data?.data?.length ?? 0;
          updateCounts({ [key]: total });
        }).catch(() => {
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeItem, user?.role, user?.permissions]);
  const canOpenSection = activeItem === "profile" || activeItem && activeItem.endsWith("-activity") || (GATED_MODULES.has(activeItem) ? user?.permissions?.includes(activeItem) : hasAnyAccess(user?.permissions));
  if (!canOpenSection) {
    return /* @__PURE__ */ React.createElement(Navigate, { to: "/admin/access-denied", replace: true });
  }
  return /* @__PURE__ */ React.createElement("div", { className: "dashboard-layout" }, /* @__PURE__ */ React.createElement(Sidebar, { activeItem: sidebarActiveItem, onNavigate: handleNavigate }), /* @__PURE__ */ React.createElement("div", { className: "dashboard-main" }, /* @__PURE__ */ React.createElement(
    Header,
    {
      onNotificationClick: () => handleNavigate("alerts"),
      hideNotifications: !hasAnyAccess(user?.permissions)
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "dashboard-content" }, activeItem === "dashboard" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "stats-grid" }, stats.map((stat, index) => {
    const { key, ...cardProps } = stat;
    return /* @__PURE__ */ React.createElement(StatCard, { key: key || index, ...cardProps });
  })), showCharts && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "charts-row" }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-card chart-card-lg" }, /* @__PURE__ */ React.createElement("div", { className: "card-top", style: { flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, "Solar PV Energy Monitoring & Generation Yield"), /* @__PURE__ */ React.createElement("p", { style: { margin: "2px 0 0 0", fontSize: "12px", color: "var(--dash-ink-muted, #64748b)" } }, "Monthly Clean Solar Generation Yield (kWh) vs Self-Consumption (kWh)")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React.createElement("span", { className: "card-badge", style: { background: "rgba(5, 150, 105, 0.12)", color: "#047857", fontWeight: 700 } }, monitoringTotals.efficiency, "% Self-Sufficiency"), /* @__PURE__ */ React.createElement("div", { className: "rev-chart-controls" }, [3, 6, 12].map((m) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: m,
      className: `rev-range-btn${chartRange === m ? " active" : ""}`,
      onClick: () => setChartRange(m)
    },
    m,
    "M"
  ))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", margin: "12px 0 14px 0", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(5, 150, 105, 0.08)", border: "1px solid rgba(5, 150, 105, 0.2)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#059669" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "11px", color: "#065f46", fontWeight: 700 } }, monitoringTotals.generation, " MWh Clean Solar Yield")), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(217, 119, 6, 0.08)", border: "1px solid rgba(217, 119, 6, 0.2)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#d97706" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "11px", color: "#92400e", fontWeight: 700 } }, monitoringTotals.consumption, " MWh Self-Consumption"))), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "270px" } }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: "100%" }, /* @__PURE__ */ React.createElement(
    BarChart,
    {
      data: monitoringChartData,
      margin: { top: 15, right: 15, left: -10, bottom: 5 },
      barCategoryGap: "22%",
      barGap: 4
    },
    /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9", vertical: false }),
    /* @__PURE__ */ React.createElement(
      XAxis,
      {
        dataKey: "month",
        tick: { fontSize: 11, fill: "#475569", fontWeight: 600 },
        tickLine: false,
        axisLine: false
      }
    ),
    /* @__PURE__ */ React.createElement(
      YAxis,
      {
        tick: { fontSize: 11, fill: "#94a3b8" },
        tickFormatter: (v) => `${v} kWh`,
        tickLine: false,
        axisLine: false,
        width: 55
      }
    ),
    /* @__PURE__ */ React.createElement(
      Tooltip,
      {
        cursor: { fill: "rgba(11, 61, 58, 0.04)" },
        contentStyle: {
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          padding: "12px 16px",
          fontSize: "12px"
        },
        labelStyle: { fontWeight: 700, color: "#0b3d3a", marginBottom: 6 },
        formatter: (value, name) => [`${value} kWh`, name]
      }
    ),
    /* @__PURE__ */ React.createElement(Legend, { content: /* @__PURE__ */ React.createElement(ChartLegend, null) }),
    /* @__PURE__ */ React.createElement(
      Bar,
      {
        dataKey: "generation",
        name: "Clean Solar Yield",
        fill: "#059669",
        radius: [6, 6, 0, 0],
        maxBarSize: 20,
        animationDuration: 700
      }
    ),
    /* @__PURE__ */ React.createElement(
      Bar,
      {
        dataKey: "consumption",
        name: "Self-Consumption",
        fill: "#d97706",
        radius: [6, 6, 0, 0],
        maxBarSize: 20,
        animationDuration: 700
      }
    )
  )))), /* @__PURE__ */ React.createElement("div", { className: "dashboard-card chart-card-sm" }, /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Lead Sources")), /* @__PURE__ */ React.createElement("div", { className: "chart-fill", style: { width: "100%", height: "280px" } }, !leadSources.some((d) => Number(d.value) > 0) ? /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "empty-chart-container",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#6b7280",
        textAlign: "center",
        padding: "20px"
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "var(--dash-surface-sunken, #eef2f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "12px"
        }
      },
      /* @__PURE__ */ React.createElement(
        "svg",
        {
          width: "22",
          height: "22",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "#5c6f68",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        },
        /* @__PURE__ */ React.createElement("path", { d: "M21.21 15.89A10 10 0 1 1 8 2.83" }),
        /* @__PURE__ */ React.createElement("path", { d: "M22 12A10 10 0 0 0 12 2v10z" })
      )
    ),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          fontWeight: 700,
          fontSize: "14px",
          color: "var(--dash-pine-strong, #082b29)"
        }
      },
      "No Lead Sources Data Yet"
    ),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          fontSize: "12px",
          color: "var(--dash-ink-muted, #5c6f68)",
          marginTop: "4px",
          maxWidth: "280px",
          lineHeight: "1.4"
        }
      },
      "Lead distribution breakdown will appear here as CRM leads are created."
    )
  ) : /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: "100%" }, /* @__PURE__ */ React.createElement(
    PieChart,
    {
      margin: { top: 0, right: 0, left: 0, bottom: 0 }
    },
    /* @__PURE__ */ React.createElement("defs", null, LEAD_SOURCE_COLORS.map((color, i) => /* @__PURE__ */ React.createElement(
      "radialGradient",
      {
        key: `lg-${i}`,
        id: `sliceGrad-${i}`,
        cx: "50%",
        cy: "40%",
        r: "60%"
      },
      /* @__PURE__ */ React.createElement(
        "stop",
        {
          offset: "0%",
          stopColor: color,
          stopOpacity: 0.95
        }
      ),
      /* @__PURE__ */ React.createElement(
        "stop",
        {
          offset: "100%",
          stopColor: color,
          stopOpacity: 0.75
        }
      )
    ))),
    /* @__PURE__ */ React.createElement(
      Pie,
      {
        data: leadSources,
        cx: "50%",
        cy: "50%",
        innerRadius: 84,
        outerRadius: 126,
        paddingAngle: 3,
        cornerRadius: 6,
        dataKey: "value",
        animationDuration: 800,
        animationEasing: "ease-out",
        activeIndex: hoveredIndex,
        activeShape: (props) => {
          const idx = leadSources.findIndex(
            (s) => s.name === props.name
          );
          const color = LEAD_SOURCE_COLORS[(idx >= 0 ? idx : 0) % LEAD_SOURCE_COLORS.length];
          const poppedOuter = props.outerRadius + 5;
          const poppedInner = props.innerRadius + 3;
          return /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement(
            Sector,
            {
              ...props,
              innerRadius: poppedInner,
              outerRadius: poppedOuter,
              fill: color,
              stroke: "none"
            }
          ));
        },
        onMouseEnter: (_, index) => setHoveredIndex(index),
        onMouseLeave: () => setHoveredIndex(null)
      },
      leadSources.map((entry, index) => /* @__PURE__ */ React.createElement(
        Cell,
        {
          key: index,
          fill: `url(#sliceGrad-${index % LEAD_SOURCE_COLORS.length})`,
          stroke: "none",
          style: {
            opacity: hoveredIndex !== null && hoveredIndex !== index ? 0.5 : 1,
            transition: "opacity 0.25s ease",
            cursor: "pointer"
          }
        }
      ))
    ),
    /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "50%",
        y: "50%",
        textAnchor: "middle",
        dominantBaseline: "middle",
        style: { pointerEvents: "none" }
      },
      hoveredIndex !== null && leadSources[hoveredIndex] ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "tspan",
        {
          x: "50%",
          dy: "-0.3em",
          fill: LEAD_SOURCE_COLORS[hoveredIndex % LEAD_SOURCE_COLORS.length],
          fontSize: "24px",
          fontWeight: "800",
          fontFamily: "var(--font-family)",
          letterSpacing: "-0.02em"
        },
        (leadSources[hoveredIndex]?.value || 0).toLocaleString()
      ), /* @__PURE__ */ React.createElement(
        "tspan",
        {
          x: "50%",
          dy: "1.6em",
          fill: LEAD_SOURCE_COLORS[hoveredIndex % LEAD_SOURCE_COLORS.length],
          fontSize: "14px",
          fontWeight: "600",
          letterSpacing: "0.04em"
        },
        leadSources[hoveredIndex]?.name || ""
      )) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "tspan",
        {
          x: "50%",
          dy: "-0.3em",
          fontSize: "30",
          fontWeight: "800",
          fill: "var(--dash-pine-strong, #082b29)",
          fontFamily: "var(--font-family)",
          letterSpacing: "-0.03em"
        },
        leadSourcesTotal.toLocaleString()
      ), /* @__PURE__ */ React.createElement(
        "tspan",
        {
          x: "50%",
          dy: "1.6em",
          fontSize: "13",
          fontWeight: "600",
          fill: "var(--dash-ink-muted, #5c6f68)",
          letterSpacing: "0.08em"
        },
        "Total Leads"
      ))
    )
  ))))), /* @__PURE__ */ React.createElement("div", { className: "charts-row charts-row--equal" }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-card chart-card-md" }, /* @__PURE__ */ React.createElement("div", { className: "card-top", style: { flexWrap: "wrap", gap: "10px" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0 } }, "Billing Status & Cash Collection Velocity"), /* @__PURE__ */ React.createElement("p", { style: { margin: "2px 0 0 0", fontSize: "12px", color: "var(--dash-ink-muted, #64748b)" } }, "Real-Time Paid Invoices, Pending Receivables & Overdue Dues")), /* @__PURE__ */ React.createElement("span", { className: "card-badge", style: { background: "rgba(5, 150, 105, 0.12)", color: "#047857", fontWeight: 700 } }, billingTotals.rate, "% Collection Rate")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", margin: "12px 0 14px 0", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(5, 150, 105, 0.08)", border: "1px solid rgba(5, 150, 105, 0.2)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#059669" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "11px", color: "#065f46", fontWeight: 700 } }, billingTotals.paid >= 1e7 ? `\u20B9${(billingTotals.paid / 1e7).toFixed(1)}Cr` : billingTotals.paid >= 1e5 ? `\u20B9${(billingTotals.paid / 1e5).toFixed(1)}L` : billingTotals.paid >= 1e3 ? `\u20B9${Math.round(billingTotals.paid / 1e3)}K` : `\u20B9${billingTotals.paid}`, " Paid")), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(217, 119, 6, 0.08)", border: "1px solid rgba(217, 119, 6, 0.2)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#d97706" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "11px", color: "#92400e", fontWeight: 700 } }, billingTotals.pending >= 1e7 ? `\u20B9${(billingTotals.pending / 1e7).toFixed(1)}Cr` : billingTotals.pending >= 1e5 ? `\u20B9${(billingTotals.pending / 1e5).toFixed(1)}L` : billingTotals.pending >= 1e3 ? `\u20B9${Math.round(billingTotals.pending / 1e3)}K` : `\u20B9${billingTotals.pending}`, " Pending")), /* @__PURE__ */ React.createElement("div", { style: { background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" } }, /* @__PURE__ */ React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "11px", color: "#991b1b", fontWeight: 700 } }, billingTotals.overdue >= 1e7 ? `\u20B9${(billingTotals.overdue / 1e7).toFixed(1)}Cr` : billingTotals.overdue >= 1e5 ? `\u20B9${(billingTotals.overdue / 1e5).toFixed(1)}L` : billingTotals.overdue >= 1e3 ? `\u20B9${Math.round(billingTotals.overdue / 1e3)}K` : `\u20B9${billingTotals.overdue}`, " Overdue"))), !billingChartData.some(
    (d) => Number(d.paid) > 0 || Number(d.pending) > 0 || Number(d.overdue) > 0
  ) ? /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "empty-chart-container",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "260px",
        color: "#6b7280",
        textAlign: "center",
        padding: "20px"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: "14px", color: "#082b29" } }, "No Billing Data Yet")
  ) : /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "260px" } }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: "100%" }, /* @__PURE__ */ React.createElement(
    AreaChart,
    {
      data: billingChartData,
      margin: { top: 15, right: 15, left: -10, bottom: 0 }
    },
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "areaPaidGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#059669", stopOpacity: 0.4 }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#059669", stopOpacity: 0.02 })), /* @__PURE__ */ React.createElement("linearGradient", { id: "areaPendingGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#d97706", stopOpacity: 0.35 }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#d97706", stopOpacity: 0.02 })), /* @__PURE__ */ React.createElement("linearGradient", { id: "areaOverdueGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#dc2626", stopOpacity: 0.3 }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#dc2626", stopOpacity: 0.02 }))),
    /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9", vertical: false }),
    /* @__PURE__ */ React.createElement(
      XAxis,
      {
        dataKey: "month",
        tick: { fontSize: 11, fill: "#64748b", fontWeight: 600 },
        tickLine: false,
        axisLine: false
      }
    ),
    /* @__PURE__ */ React.createElement(
      YAxis,
      {
        tick: { fontSize: 11, fill: "#94a3b8" },
        tickFormatter: (v) => v >= 1e7 ? `\u20B9${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `\u20B9${Math.round(v / 1e5)}L` : v >= 1e3 ? `\u20B9${Math.round(v / 1e3)}K` : `\u20B9${v}`,
        tickLine: false,
        axisLine: false,
        width: 55
      }
    ),
    /* @__PURE__ */ React.createElement(
      Tooltip,
      {
        cursor: { stroke: "#0b3d3a", strokeWidth: 1, strokeDasharray: "4 4" },
        contentStyle: {
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          padding: "12px 16px",
          fontSize: "12px"
        },
        labelStyle: { fontWeight: 700, color: "#0b3d3a", marginBottom: 6 },
        formatter: (value, name) => [`\u20B9${Number(value).toLocaleString("en-IN")}`, name]
      }
    ),
    /* @__PURE__ */ React.createElement(Legend, { content: /* @__PURE__ */ React.createElement(ChartLegend, null) }),
    /* @__PURE__ */ React.createElement(
      Area,
      {
        type: "monotone",
        dataKey: "paid",
        name: "Paid Invoices",
        stroke: "#059669",
        strokeWidth: 2.5,
        fillOpacity: 1,
        fill: "url(#areaPaidGrad)",
        animationDuration: 700
      }
    ),
    /* @__PURE__ */ React.createElement(
      Area,
      {
        type: "monotone",
        dataKey: "pending",
        name: "Pending Receivables",
        stroke: "#d97706",
        strokeWidth: 2,
        fillOpacity: 1,
        fill: "url(#areaPendingGrad)",
        animationDuration: 700
      }
    ),
    /* @__PURE__ */ React.createElement(
      Area,
      {
        type: "monotone",
        dataKey: "overdue",
        name: "Overdue Dues",
        stroke: "#dc2626",
        strokeWidth: 1.8,
        strokeDasharray: "3 3",
        fillOpacity: 1,
        fill: "url(#areaOverdueGrad)",
        animationDuration: 700
      }
    )
  )))), /* @__PURE__ */ React.createElement("div", { className: "dashboard-card chart-card-md" }, /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Installation Pipeline"), /* @__PURE__ */ React.createElement("span", { className: "card-badge" }, "Status")), !hasInstallationData ? /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "empty-chart-container",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "280px",
        color: "#6b7280",
        textAlign: "center",
        padding: "20px"
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "var(--dash-surface-sunken, #eef2f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "12px"
        }
      },
      /* @__PURE__ */ React.createElement(
        "svg",
        {
          width: "22",
          height: "22",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "#5c6f68",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        },
        /* @__PURE__ */ React.createElement("path", { d: "M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" }),
        /* @__PURE__ */ React.createElement("path", { d: "M3 21h18" }),
        /* @__PURE__ */ React.createElement("path", { d: "M9 7h1" }),
        /* @__PURE__ */ React.createElement("path", { d: "M9 11h1" }),
        /* @__PURE__ */ React.createElement("path", { d: "M14 7h1" }),
        /* @__PURE__ */ React.createElement("path", { d: "M14 11h1" })
      )
    ),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          fontWeight: 700,
          fontSize: "14px",
          color: "var(--dash-pine-strong, #082b29)"
        }
      },
      "No Installation Projects Yet"
    ),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          fontSize: "12px",
          color: "var(--dash-ink-muted, #5c6f68)",
          marginTop: "4px",
          maxWidth: "260px",
          lineHeight: "1.4"
        }
      },
      "The pipeline updates automatically as projects are created and completed."
    )
  ) : /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline" }, /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline__radar" }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 250 }, /* @__PURE__ */ React.createElement(RadarChart, { data: installationRadar, outerRadius: "72%" }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "instRadarFill", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#0b3d3a", stopOpacity: 0.38 }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#0b3d3a", stopOpacity: 0.06 }))), /* @__PURE__ */ React.createElement(PolarGrid, { stroke: "#dde5e1" }), /* @__PURE__ */ React.createElement(
    PolarAngleAxis,
    {
      dataKey: "axis",
      tick: {
        fill: "#5c6f68",
        fontSize: 12,
        fontWeight: 600
      }
    }
  ), /* @__PURE__ */ React.createElement(
    PolarRadiusAxis,
    {
      domain: [0, "auto"],
      tick: false,
      axisLine: false,
      tickCount: 5
    }
  ), /* @__PURE__ */ React.createElement(
    Radar,
    {
      name: "Projects",
      dataKey: "value",
      stroke: "#0b3d3a",
      strokeWidth: 2.5,
      fill: "url(#instRadarFill)",
      animationDuration: 800,
      animationEasing: "ease-out"
    }
  ), /* @__PURE__ */ React.createElement(
    Tooltip,
    {
      contentStyle: {
        background: "#ffffff",
        border: "1px solid #d1d9e6",
        borderRadius: "10px",
        boxShadow: "0 4px 16px rgba(11, 61, 58, 0.18)",
        padding: "8px 12px",
        fontSize: "12px"
      },
      formatter: (value) => [
        `${Number(value).toLocaleString("en-IN")} projects`,
        "Projects"
      ]
    }
  )))), /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline__legend" }, installationRadar.map((d) => {
    const pct = installationStats?.total ? d.name === "Total" ? 100 : Math.round(d.value / installationStats.total * 100) : 0;
    return /* @__PURE__ */ React.createElement("div", { key: d.name, className: "dash-pipeline__row" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "dash-pipeline__dot",
        style: { background: INSTALLATION_STATUS_COLORS[d.name] || "#5c6f68" }
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline__row-main" }, /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline__row-top" }, /* @__PURE__ */ React.createElement("span", { className: "dash-pipeline__row-name" }, d.name), /* @__PURE__ */ React.createElement("span", { className: "dash-pipeline__row-value" }, d.value.toLocaleString("en-IN"), /* @__PURE__ */ React.createElement("span", { className: "dash-pipeline__row-pct" }, pct, "%"))), /* @__PURE__ */ React.createElement("div", { className: "dash-pipeline__bar" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "dash-pipeline__bar-fill",
        style: {
          width: `${pct}%`,
          background: INSTALLATION_STATUS_COLORS[d.name] || "#5c6f68"
        }
      }
    ))));
  })))))), /* @__PURE__ */ React.createElement("div", { className: "tables-row" }, showLeadsTable && /* @__PURE__ */ React.createElement("div", { className: "dashboard-card table-card-lg" }, /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Recent Leads"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "view-all-btn",
      onClick: () => handleNavigate("leads")
    },
    "View All"
  )), /* @__PURE__ */ React.createElement("div", { className: "table-wrapper" }, /* @__PURE__ */ React.createElement("table", { className: "dash-header-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "#"), /* @__PURE__ */ React.createElement("th", null, "Client"), /* @__PURE__ */ React.createElement("th", { className: "td-right" }, "Value"), /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "Status"), /* @__PURE__ */ React.createElement("th", { className: "td-date" }, "Date")))), /* @__PURE__ */ React.createElement("div", { className: "scrollable-table-wrapper" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("tbody", null, leadsLoading ? /* @__PURE__ */ React.createElement(TableLoader, { colSpan: 5, minHeight: "120px" }) : leads.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty-row" }, "No leads yet \u2014 capture one from Leads.")) : leads.slice(0, 5).map((lead) => /* @__PURE__ */ React.createElement("tr", { key: lead.id || lead._id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "td-id" }, lead.leadId || lead.id)), /* @__PURE__ */ React.createElement("td", { className: "td-name", title: lead.name }, /* @__PURE__ */ React.createElement("div", { className: "td-name-text" }, lead.name)), /* @__PURE__ */ React.createElement("td", { className: "td-value" }, formatINR(lead.value)), /* @__PURE__ */ React.createElement("td", { className: "td-center" }, /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `status-badge ${getStatusClass(lead.status)}`
    },
    lead.status
  )), /* @__PURE__ */ React.createElement("td", { className: "td-date" }, formatShortDate(lead.createdAt || lead.date))))))))), showTicketsTable && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `dashboard-card ${showLeadsTable ? "table-card-sm" : "table-card-lg"}`
    },
    /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Support Tickets"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "view-all-btn",
        onClick: () => handleNavigate("tickets")
      },
      "View All"
    )),
    /* @__PURE__ */ React.createElement("div", { className: "table-wrapper" }, /* @__PURE__ */ React.createElement("table", { className: "dash-header-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "#"), /* @__PURE__ */ React.createElement("th", null, "Subject"), /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "Priority"), /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "Status")))), /* @__PURE__ */ React.createElement("div", { className: "scrollable-table-wrapper" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("tbody", null, ticketsLoading ? /* @__PURE__ */ React.createElement(TableLoader, { colSpan: 4, minHeight: "120px" }) : ticketsError ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 4, className: "empty-row" }, "Could not load tickets \u2014 check your connection.")) : tickets.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 4, className: "empty-row" }, "No tickets yet \u2014 raise one from Support Tickets.")) : tickets.slice(0, 5).map((ticket) => /* @__PURE__ */ React.createElement("tr", { key: ticket._id || ticket.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "td-id" }, ticket.ticketId || (ticket._id ? `TKT-${String(ticket._id).slice(-4).toUpperCase()}` : ticket.id))), /* @__PURE__ */ React.createElement("td", { className: "td-name", title: ticket.subject }, /* @__PURE__ */ React.createElement("div", { className: "td-name-text" }, ticket.subject)), /* @__PURE__ */ React.createElement("td", { className: "td-center" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: `priority-badge ${getPriorityClass(ticket.priority)}`
      },
      ticket.priority
    )), /* @__PURE__ */ React.createElement("td", { className: "td-center" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: `status-badge ${getStatusClass(ticket.status)}`
      },
      ticket.status
    ))))))))
  )), showPerformers && /* @__PURE__ */ React.createElement("div", { className: "tables-row" }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-card performers-card" }, /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Recent Quotations"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "view-all-btn",
      onClick: () => handleNavigate("quotations")
    },
    "View All"
  )), /* @__PURE__ */ React.createElement("div", { className: "table-wrapper" }, /* @__PURE__ */ React.createElement("table", { className: "dash-header-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "#"), /* @__PURE__ */ React.createElement("th", null, "Client"), /* @__PURE__ */ React.createElement("th", { className: "td-right" }, "Amount"), /* @__PURE__ */ React.createElement("th", { className: "td-center" }, "Status"), /* @__PURE__ */ React.createElement("th", { className: "td-date" }, "Date")))), /* @__PURE__ */ React.createElement("div", { className: "scrollable-table-wrapper" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("tbody", null, quotationsLoading && recentQuotations.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty-row" }, "Loading quotations\u2026")) : quotationsError ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty-row" }, "Could not load quotations \u2014 check your connection.")) : recentQuotations.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "empty-row" }, "No quotations yet \u2014 create one from Quotations.")) : recentQuotations.map((q, i) => /* @__PURE__ */ React.createElement("tr", { key: q._id || q.id || i }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "td-id" }, q.quotationId || `Q-${String(q._id).slice(-4).toUpperCase()}`)), /* @__PURE__ */ React.createElement("td", { className: "td-name", title: q.client }, /* @__PURE__ */ React.createElement("div", { className: "td-name-text" }, q.client)), /* @__PURE__ */ React.createElement("td", { className: "td-value" }, formatINR(q.grandTotal || q.total)), /* @__PURE__ */ React.createElement("td", { className: "td-center" }, /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `status-badge ${QUOTATION_STATUS_CLASS[q.status] || "status-pending"}`
    },
    q.status || "Draft"
  )), /* @__PURE__ */ React.createElement("td", { className: "td-date" }, formatShortDate(q.createdAt))))))))), /* @__PURE__ */ React.createElement("div", { className: "dashboard-card" }, /* @__PURE__ */ React.createElement("div", { className: "card-top" }, /* @__PURE__ */ React.createElement("h3", null, "Quick Actions")), /* @__PURE__ */ React.createElement("div", { className: "quick-actions-grid" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("leads")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-blue" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
      },
      /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
      /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "New Lead")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("customers")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-green" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
      },
      /* @__PURE__ */ React.createElement("path", { d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" }),
      /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "7", r: "4" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "Add Client")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("quotations")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-purple" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
      },
      /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }),
      /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "New Quote")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("installations")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-yellow" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
      },
      /* @__PURE__ */ React.createElement("rect", { x: "1", y: "6", width: "22", height: "12", rx: "2" }),
      /* @__PURE__ */ React.createElement("line", { x1: "1", y1: "12", x2: "23", y2: "12" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "New Install")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("tickets")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-red" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2"
      },
      /* @__PURE__ */ React.createElement("path", { d: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "New Ticket")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "quick-action-btn",
      onClick: () => handleNavigate("site-survey")
    },
    /* @__PURE__ */ React.createElement("div", { className: "qa-icon qa-blue" }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: "20",
        height: "20",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      },
      /* @__PURE__ */ React.createElement("path", { d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" }),
      /* @__PURE__ */ React.createElement("rect", { x: "9", y: "3", width: "6", height: "4", rx: "1" }),
      /* @__PURE__ */ React.createElement("path", { d: "M9 12l2 2 4-4" })
    )),
    /* @__PURE__ */ React.createElement("span", null, "Site Survey")
  ))))) : /* @__PURE__ */ React.createElement(Suspense, { fallback: /* @__PURE__ */ React.createElement(PageLoader, { minHeight: "300px" }) }, activeItem === "leads" ? /* @__PURE__ */ React.createElement(LeadManagement, null) : activeItem && activeItem.endsWith("-activity") ? /* @__PURE__ */ React.createElement(GenericDetailActivityLog, { moduleKey: activeItem, target: id ? { recordId: id, recordLabel: id } : null }) : activeItem === "customer-progress" ? /* @__PURE__ */ React.createElement(CustomerProgress, null) : activeItem === "technician-details" ? /* @__PURE__ */ React.createElement(TechnicianDetails, null) : activeItem === "customers" ? /* @__PURE__ */ React.createElement(CustomerManagement, null) : activeItem === "quotations" ? /* @__PURE__ */ React.createElement(Quotations, null) : activeItem === "role-permissions" ? /* @__PURE__ */ React.createElement(RolePermissions, null) : activeItem === "solar-monitoring" ? /* @__PURE__ */ React.createElement(SolarMonitoring, null) : activeItem === "alerts" ? /* @__PURE__ */ React.createElement(AlertNotifications, null) : activeItem === "maintenance" ? /* @__PURE__ */ React.createElement(MaintenanceManagement, null) : activeItem === "tickets" ? /* @__PURE__ */ React.createElement(TicketSupport, null) : activeItem === "amc" ? /* @__PURE__ */ React.createElement(AMCManagement, null) : activeItem === "products" ? /* @__PURE__ */ React.createElement(ProductCatalog, null) : activeItem === "inventory" ? /* @__PURE__ */ React.createElement(InventoryManagement, null) : activeItem === "vendors" ? /* @__PURE__ */ React.createElement(VendorManagement, null) : activeItem === "warehouses" ? /* @__PURE__ */ React.createElement(WarehouseManagement, null) : activeItem === "site-survey" ? /* @__PURE__ */ React.createElement(SiteSurvey, null) : activeItem === "solar-design" ? /* @__PURE__ */ React.createElement(SolarDesign, null) : activeItem === "project-approval" ? /* @__PURE__ */ React.createElement(ProjectApproval, null) : activeItem === "installations" ? /* @__PURE__ */ React.createElement(InstallationManagement, null) : activeItem === "technicians" ? /* @__PURE__ */ React.createElement(TechnicianManagement, null) : activeItem === "attendance" ? /* @__PURE__ */ React.createElement(TechnicianAttendance, null) : activeItem === "task-assignment" ? /* @__PURE__ */ React.createElement(TaskAssignment, null) : activeItem === "team-schedule" ? /* @__PURE__ */ React.createElement(TeamSchedule, null) : activeItem === "testing" ? /* @__PURE__ */ React.createElement(TestingModule, null) : activeItem === "daily-progress" ? /* @__PURE__ */ React.createElement(DailyProgressLog, null) : activeItem === "subsidy" ? /* @__PURE__ */ React.createElement(SubsidyManagement, null) : activeItem === "project-progress" ? /* @__PURE__ */ React.createElement(ProjectProgress, null) : activeItem === "commissioning" ? /* @__PURE__ */ React.createElement(CommissioningAndHandover, null) : activeItem === "warranty" ? /* @__PURE__ */ React.createElement(Warranty, null) : activeItem === "billing" ? /* @__PURE__ */ React.createElement(Billing, null) : activeItem === "payments" ? /* @__PURE__ */ React.createElement(Payments, null) : activeItem === "users" ? /* @__PURE__ */ React.createElement(UserManagement, null) : activeItem === "documents" ? /* @__PURE__ */ React.createElement(DocumentManagement, null) : activeItem === "reports" ? /* @__PURE__ */ React.createElement(Navigate, { to: "/admin/sales-reports", replace: true }) : activeItem === "sales-reports" ? /* @__PURE__ */ React.createElement(SalesReports, null) : activeItem === "financial-reports" ? (
    // Financial Reports module commented out
    null
  ) : activeItem === "project-reports" ? /* @__PURE__ */ React.createElement(ProjectReports, null) : activeItem === "inventory-reports" ? /* @__PURE__ */ React.createElement(InventoryReports, null) : activeItem === "technician-reports" ? /* @__PURE__ */ React.createElement(TechnicianReports, null) : activeItem === "profile" ? /* @__PURE__ */ React.createElement(Profile, null) : activeItem === "settings" ? /* @__PURE__ */ React.createElement(Settings, null) : activeItem === "activity-logs" ? /* @__PURE__ */ React.createElement(ActivityLogs, null) : /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "dashboard-card",
      style: { padding: "40px", textAlign: "center" }
    },
    /* @__PURE__ */ React.createElement(
      "h3",
      {
        style: {
          fontSize: "16px",
          fontWeight: "700",
          color: "#1a2332",
          marginBottom: "10px"
        }
      },
      getHeaderTitle()
    ),
    /* @__PURE__ */ React.createElement("p", { style: { color: "#6b7280", fontSize: "13px" } }, "The dashboard content and settings for the ", getHeaderTitle(), " ", "module are currently under development.")
  )))));
};
export default Dashboard;
