import React, { useState, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { ROLES } from "../../../config/roles";
import { useToast } from "../../../components/common/Toast";
import solarLogo from "../../../assets/images/solar-logo-transparent.png";
import "./Sidebar.css";

/* Individual unique SVG icons for every single sub-module link */
const SubIcon = ({ id }) => {
  switch (id) {
    /* CRM */
    case "leads":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      );
    case "customers":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case "follow-ups":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
      );

    /* PROJECTS */
    case "site-survey":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <circle cx="11" cy="14" r="3" />
          <line x1="13.2" y1="16.2" x2="16" y2="19" />
        </svg>
      );
    case "solar-design":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
          <path d="M5.6 5.6l12.8 12.8M5.6 18.4l12.8-12.8" />
        </svg>
      );
    case "quotations":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <path d="M9 13.5h4.5a1.5 1.5 0 010 3H9.5a1.5 1.5 0 000 3H14" />
        </svg>
      );
    case "project-approval":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "installations":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="12" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="3" x2="9" y2="15" />
          <line x1="15" y1="3" x2="15" y2="15" />
          <path d="M12 15v6M8 21h8" />
        </svg>
      );
    case "testing":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2v7.31L4.75 18.17A2 2 0 006.45 21h11.1a2 2 0 001.7-2.83L14 9.31V2z" />
          <line x1="8.5" y1="2" x2="15.5" y2="2" />
        </svg>
      );
    case "commissioning":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
    case "project-progress":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case "daily-progress":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );

    /* TEAM MANAGEMENT */
    case "technicians":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "attendance":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <polyline points="9 14 11 16 15 12" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
        </svg>
      );
    case "task-assignment":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      );
    case "team-schedule":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );

    /* INVENTORY */
    case "products":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case "inventory":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="5" rx="1" />
          <path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "vendors":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "warehouses":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "purchase-orders":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
        </svg>
      );
    case "stock-in":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M8 11l4 4 4-4" />
          <path d="M3 21h18" />
        </svg>
      );
    case "stock-out":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V3M8 7l4-4 4 4" />
          <path d="M3 21h18" />
        </svg>
      );

    /* FINANCE */
    case "billing":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="10" x2="16" y2="10" />
          <line x1="8" y1="14" x2="12" y2="14" />
        </svg>
      );
    case "expenses":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12" />
          <path d="M6 8h12" />
          <path d="M6 13l8.5 8" />
          <path d="M6 13h3a4 4 0 0 0 0-8" />
        </svg>
      );
    case "subsidy":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="21" x2="21" y2="21" />
          <line x1="6" y1="18" x2="6" y2="11" />
          <line x1="10" y1="18" x2="10" y2="11" />
          <line x1="14" y1="18" x2="14" y2="11" />
          <line x1="18" y1="18" x2="18" y2="11" />
          <polygon points="12 2 20 7 4 7 12 2" />
        </svg>
      );

    /* SERVICE */
    case "maintenance":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "tickets":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      );
    case "amc":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "warranty":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      );

    /* MONITORING */
    case "alerts":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      );
    case "performance":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "device-status":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );

    /* REPORTS */
    case "sales-reports":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 118 2.83" />
          <path d="M22 12A10 10 0 0012 2v10z" />
        </svg>
      );
    case "project-reports":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      );
    case "inventory-reports":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "technician-reports":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
        </svg>
      );

    /* ADMIN */
    case "users":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      );
    case "role-permissions":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      );
    case "documents":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "settings":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    case "activity-logs":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return (
        <svg width="6" height="6" viewBox="0 0 6 6" className="sidebar-subdot">
          <circle cx="3" cy="3" r="3" fill="currentColor" />
        </svg>
      );
  }
};

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sidebar-chevron">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Sidebar = ({ activeItem, onNavigate }) => {
  const { user, logout } = useAuth();
  const { success } = useToast();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [flyoutGroupId, setFlyoutGroupId] = useState(null);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  React.useEffect(() => {
    const updateLayoutClass = () => {
      const layout = document.querySelector(".dashboard-layout");
      if (layout) {
        if (isCollapsed) {
          layout.classList.add("sidebar-collapsed");
        } else {
          layout.classList.remove("sidebar-collapsed");
        }
      }
    };
    updateLayoutClass();
    const timer1 = setTimeout(updateLayoutClass, 10);
    const timer2 = setTimeout(updateLayoutClass, 100);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isCollapsed]);

  const dashboardItem = useMemo(
    () => ({
      id: "dashboard",
      label: "Dashboard",
      module: "dashboard",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    }),
    []
  );

  const allMenuGroups = useMemo(
    () => [
      {
        id: "crm",
        label: "CRM (Sales)",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        ),
        children: [
          { id: "leads", label: "Leads", module: "leads" },
          { id: "follow-ups", label: "Follow-Ups", module: "follow-ups" },
          { id: "customers", label: "Customers", module: "customers" },
          
        ],
      },
      {
        id: "projects",
        label: "Projects",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
          </svg>
        ),
        children: [
          { id: "site-survey", label: "Site Survey", module: "site-survey" },
          { id: "solar-design", label: "Solar Design", module: "solar-design" },
          { id: "quotations", label: "Quotations", module: "quotations" },
          { id: "project-approval", label: "Project Approval", module: "project-approval" },
          { id: "installations", label: "Installation", module: "installations" },
          { id: "testing", label: "Testing", module: "testing" },
          { id: "commissioning", label: "Commissioning & Handover", module: "commissioning" },
          { id: "project-progress", label: "Project Progress", module: "project-progress" },
          { id: "daily-progress", label: "Daily Progress Log", module: "daily-progress" },
        ],
      },
      {
        id: "team",
        label: "Team Management",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        ),
        children: [
          { id: "technicians", label: "Technicians", module: "technicians" },
          { id: "attendance", label: "Attendance", module: "attendance" },
          { id: "task-assignment", label: "Task Assignment", module: "task-assignment" },
          { id: "team-schedule", label: "Team Schedule", module: "team-schedule" },
        ],
      },
      {
        id: "inventory-group",
        label: "Inventory",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        ),
        children: [
          { id: "products", label: "Products", module: "products" },
          { id: "inventory", label: "Inventory", module: "inventory" },
          { id: "vendors", label: "Vendors", module: "vendors" },
          { id: "warehouses", label: "Warehouses", module: "warehouses" },
          { id: "purchase-orders", label: "Purchase Orders", module: "purchase-orders" },
          { id: "stock-in", label: "Stock In", module: "stock-in" },
          { id: "stock-out", label: "Stock Out", module: "stock-out" },
        ],
      },
      {
        id: "finance",
        label: "Finance",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        ),
        children: [
          { id: "billing", label: "Billing", module: "billing" },
          { id: "expenses", label: "Expenses", module: "expenses" },
          { id: "subsidy", label: "Govt Subsidy", module: "subsidy" },
        ],
      },
      {
        id: "service",
        label: "Service",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        ),
        children: [
          { id: "maintenance", label: "Maintenance", module: "maintenance" },
          { id: "tickets", label: "Tickets", module: "tickets" },
          { id: "amc", label: "AMC", module: "amc" },
          { id: "warranty", label: "Warranty", module: "warranty" },
        ],
      },
      {
        id: "monitoring-group",
        label: "Monitoring",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        ),
        children: [
          { id: "alerts", label: "Alerts", module: "alerts" },
          { id: "performance", label: "Performance", module: "performance" },
          { id: "device-status", label: "Device Status", module: "device-status" },
        ],
      },
      {
        id: "reports-group",
        label: "Reports",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
        children: [
          { id: "sales-reports", label: "Sales Reports", module: "sales-reports" },
          { id: "project-reports", label: "Project Reports", module: "project-reports" },
          { id: "inventory-reports", label: "Inventory Reports", module: "inventory-reports" },
          { id: "technician-reports", label: "Technician Reports", module: "technician-reports" },
        ],
      },
      {
        id: "administration",
        label: "Administration",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        ),
        children: [
          { id: "users", label: "Users", module: "users" },
          { id: "role-permissions", label: "Roles & Permissions", module: "role-permissions", adminOnly: true },
          { id: "documents", label: "Documents", module: "documents" },
          { id: "activity-logs", label: "Activity Logs", module: "activity-logs" },
          // { id: "settings", label: "Settings", module: "settings" },
        ],
      },
    ],
    []
  );

  const isAdmin = user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.COMPANY_ADMIN;
  const showDashboard = user?.permissions?.includes(dashboardItem.module);

  const menuGroups = useMemo(
    () =>
      allMenuGroups
        .map((group) => ({
          ...group,
          children: group.children.filter((item) => {
            if (item.adminOnly) return isAdmin || user?.permissions?.includes(item.module);
            return user?.permissions?.includes(item.module);
          }),
        }))
        .filter((group) => group.children.length > 0),
    [allMenuGroups, isAdmin, user]
  );

  const activeGroupId = useMemo(() => {
    const match = menuGroups.find((group) => group.children.some((child) => child.id === activeItem));
    return match?.id ?? null;
  }, [menuGroups, activeItem]);

  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroupId ? [activeGroupId] : []));

  React.useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)));
    }
  }, [activeGroupId]);

  const toggleGroup = (groupId) => {
    if (isCollapsed) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`} style={{ fontFamily: 'var(--app-font-family)' }}>
      {/* BRAND HEADER */}
      <div className="sidebar-brand">
        {isCollapsed ? (
          <div className="sidebar-compact-logo" title="Solar Management System">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb81c" strokeWidth="2.2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </div>
        ) : (
          <img src={solarLogo} alt="Solar Management System" className="sidebar-brand-logo" />
        )}
      </div>

      {/* NAV LINKS (SCROLLABLE MIDDLE CONTAINER) */}
      <nav className="sidebar-nav">
        {isCollapsed ? (
          /* COLLAPSED MODE: STANDALONE FLAT STREAM OF ALL SUB-MODULE ICONS */
          <div className="sidebar-collapsed-stream">
            {showDashboard && (
              <button
                type="button"
                className={`sidebar-link ${activeItem === "dashboard" ? "active" : ""}`}
                onClick={() => onNavigate("dashboard")}
                title={dashboardItem.label}
              >
                {dashboardItem.icon}
              </button>
            )}
            {menuGroups.flatMap((group) =>
              group.children.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-link ${activeItem === item.id ? "active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                  title={item.label}
                >
                  <SubIcon id={item.id} />
                </button>
              ))
            )}
          </div>
        ) : (
          /* EXPANDED MODE: ACCORDION GROUPS WITH DROPDOWN SUB-MENUS */
            <>
            {showDashboard && (
              <div className="sidebar-group open">
                <button
                  type="button"
                  className={`sidebar-top-link ${activeItem === "dashboard" ? "active" : ""}`}
                  onClick={() => onNavigate("dashboard")}
                >
                  <span className="sidebar-group-header-left">
                    {dashboardItem.icon}
                    <span>{dashboardItem.label}</span>
                  </span>
                </button>
              </div>
            )}

            {menuGroups.map((group) => {
              const isOpen = openGroups.has(group.id);
              const isGroupActive = group.children.some((child) => child.id === activeItem);

              return (
                <div key={group.id} className={`sidebar-group ${isOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className={`sidebar-group-header ${isGroupActive ? "active" : ""}`}
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="sidebar-group-header-left">
                      {group.icon}
                      <span>{group.label}</span>
                    </span>
                    <ChevronIcon />
                  </button>

                  <div
                    className="sidebar-submenu"
                    style={{
                      maxHeight: isOpen ? `${group.children.length * 48 + 20}px` : "0px",
                      opacity: isOpen ? 1 : 0,
                      transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease",
                    }}
                  >
                    <ul>
                      {group.children.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`sidebar-link ${activeItem === item.id ? "active" : ""}`}
                            onClick={() => onNavigate(item.id)}
                          >
                            <SubIcon id={item.id} />
                            <span>{item.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* BOTTOM CONTROLS (LOGOUT + COLLAPSE TOGGLE) */}
      <div className="sidebar-bottom">
        <button
          className="sidebar-bottom-btn sidebar-logout"
          onClick={() => { logout(); success("Logged out successfully."); }}
          title={isCollapsed ? "Logout" : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!isCollapsed && <span>Logout</span>}
        </button>

        <button
          type="button"
          className="sidebar-bottom-toggle-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;