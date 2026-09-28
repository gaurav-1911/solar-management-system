import React, { useState, useMemo, useEffect } from "react";
import { Pagination, Dropdown, TableLoader, PageLoader } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import "./AlertNotifications.css";
import StatCard from "../dashboard/StatCard/StatCard";

/* ── Icons ── */
const iconBell = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const iconCheck = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const iconAlertTriangle = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const iconCheckCircle = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const iconList = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const iconSettings = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const iconClose = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const iconMaintenance = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.77z" />
  </svg>
);
const iconPayment = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="1" y="4" width="22" height="16" rx="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);
const iconWarranty = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const iconEmail = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const iconSms = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);
const iconPush = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const iconWhatsapp = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.13.11-1.82-.12-.42-.14-.96-.32-1.65-.63-2.9-1.25-4.8-4.16-4.94-4.35-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.18 1.53 1.91 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
  </svg>
);

const CHANNEL_ICONS = { email: iconEmail, sms: iconSms, push: iconPush, whatsapp: iconWhatsapp };
const CHANNEL_LABELS = { email: "Email", sms: "SMS", push: "Push", whatsapp: "WhatsApp" };

/* ── Notification type metadata ── */
const TYPES = {
  maintenance: { label: "Maintenance Due", icon: iconMaintenance, className: "type-maintenance" },
  payment: { label: "Payment Due Reminder", icon: iconPayment, className: "type-payment" },
  warranty: { label: "Warranty Expiry Alert", icon: iconWarranty, className: "type-warranty" },
};

/* ── Sample alert data ── */

const FILTERS = [
  { key: "all", label: "All" },
  { key: "maintenance", label: "Maintenance Due" },
  { key: "payment", label: "Payment Due" },
  { key: "warranty", label: "Warranty Expiry" },
];

const CHANNEL_KEYS = ["email", "sms", "push", "whatsapp"];

const defaultChannelPrefs = () =>
  Object.keys(TYPES).reduce((acc, type) => {
    acc[type] = { email: true, sms: type === "maintenance", push: true, whatsapp: type === "payment" };
    return acc;
  }, {});

const getSeverityKey = (severity) => {
  switch (severity) {
    case "Critical": return "critical";
    case "High": return "high";
    case "Medium": return "medium";
    case "Low": return "low";
    default: return "";
  }
};

const AlertNotifications = () => {
  const { canDo } = useAuth();
  const { alerts, resolvedToday, markAsRead: ctxMarkAsRead, markAllAsRead: ctxMarkAllAsRead, deleteAlert: ctxDeleteAlert, loadAlerts, loading } = useNotifications();
  const [activeFilter, setActiveFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [channelPrefs, setChannelPrefs] = useState(defaultChannelPrefs);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { success, info } = useToast();

  const unreadCount = alerts.filter((a) => a.unread).length;
  const criticalCount = alerts.filter((a) => a.severity === "Critical").length;


  // Scroll view to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
    const contentEl = document.querySelector(".dashboard-content");
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
  }, []);

  // Fetch notifications on demand when this page is opened
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && showSettings) {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettings]);

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (activeFilter !== "all") {
      result = result.filter((a) => a.type === activeFilter);
    }
    if (severityFilter !== "all") {
      result = result.filter((a) => a.severity === severityFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.severity.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [alerts, activeFilter, severityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));

  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, currentPage, pageSize]);

  // Adjust page if current page becomes out of bounds
  useEffect(() => {
    if (currentPage > 1 && paginatedAlerts.length === 0 && filteredAlerts.length > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, paginatedAlerts.length, filteredAlerts.length]);

  const markAsRead = (id) => {
    const target = alerts.find((a) => a.id === id);
    ctxMarkAsRead(id);
    if (success && target) success(`Alert marked as read`);
  };

  const markAllRead = () => {
    if (unreadCount === 0) {
      if (info) info("All alerts are already marked as read");
      return;
    }
    ctxMarkAllAsRead();
    if (success) success("All alerts marked as read");
  };

  const dismissAlert = (id) => {
    const target = alerts.find((a) => a.id === id);
    ctxDeleteAlert(id);
    if (info && target) info(`Alert "${target.title}" dismissed`);
  };

  const toggleChannel = (type, channel) => {
    setChannelPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  };

  const savePreferences = () => {
    setShowSettings(false);
    if (success) success("Notification preferences saved successfully");
  };

  return (
    <div className="alert-module">
      {/* ── Header ── */}
      <div className="usr-header">
        <div className="usr-header-left">
          <h2>Alerts &amp; Notifications</h2>
          <p>
            Real-time alerts for maintenance, production, connectivity, billing, and warranty events across your fleet.
          </p>
        </div>
        <div className="usr-header-actions">
          {canDo("alerts", "edit") && (
            <button className="btn-ghost-custom" onClick={() => setShowSettings(true)}>
              {iconSettings} Settings
            </button>
          )}
          {canDo("alerts", "edit") && (
            <button className="usr-add-btn" onClick={markAllRead}>
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* ── Stats Grid (Real-time KPI summary) ── */}
      <div className="an-stats-grid">
        <StatCard
          title="Total Alerts"
          value={alerts.length.toLocaleString()}
          icon={iconList}
          color="blue"
        />
        <StatCard
          title="Unread"
          value={unreadCount.toLocaleString()}
          icon={iconBell}
          color="yellow"
        />
        <StatCard
          title="Critical"
          value={criticalCount.toLocaleString()}
          icon={iconAlertTriangle}
          color="red"
        />
        <StatCard
          title="Resolved Today"
          value={resolvedToday.toLocaleString()}
          icon={iconCheckCircle}
          color="green"
        />
      </div>

      {/* ── Search & Filters ── */}
      <div className="usr-filters">
        <div className="usr-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by title, alert ID, message, or severity"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          {search && (
            <button className="usr-search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="usr-filter-selects">
          <Dropdown
            value={severityFilter}
            onChange={(val) => {
              setSeverityFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: "all", label: "All Severities" },
              { value: "Critical", label: "Critical" },
              { value: "High", label: "High" },
              { value: "Medium", label: "Medium" },
              { value: "Low", label: "Low" },
            ]}
            placeholder="Severity"
            size="sm"
          />
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="usr-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`usr-tab ${activeFilter === f.key ? "active" : ""}`}
            onClick={() => {
              setActiveFilter(f.key);
              setCurrentPage(1);
            }}
          >
            {f.label}
            {f.key !== "all" && (
              <span className={`am-tab-count am-tab-count--${f.key}`}>
                {alerts.filter((a) => a.type === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Alert list ── */}
      <div className="usr-card">
        <div className="usr-table-wrapper">
          {loading && filteredAlerts.length === 0 ? (
            <PageLoader minHeight="250px" />
          ) : paginatedAlerts.length === 0 ? (
            <div className="am-empty">
              {iconBell}
              <p>No alerts match your search or category filter. You're all caught up.</p>
              {(search || activeFilter !== "all" || severityFilter !== "all") && (
                <button
                  className="btn-ghost-custom"
                  style={{ marginTop: "8px" }}
                  onClick={() => {
                    setSearch("");
                    setActiveFilter("all");
                    setSeverityFilter("all");
                    setCurrentPage(1);
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            paginatedAlerts.map((alert) => {
              const meta = TYPES[alert.type];
              return (
                <div key={alert.id} className={`am-card ${alert.unread ? "am-card--unread" : ""}`}>
                  <div className={`am-card-icon ${meta.className}`}>{meta.icon}</div>

                  <div className="am-card-body">
                    <div className="am-card-header">
                      <div className="am-card-header-left">
                        <span className="am-card-type">{meta.label}</span>
                        <span className={`pill pill--${getSeverityKey(alert.severity)}`}>{alert.severity}</span>
                        {alert.unread && (
                          <span className="am-unread-badge">
                            <span className="am-unread-dot" />
                            Unread
                          </span>
                        )}
                      </div>

                      <div className="alert-card-actions">
                        {alert.unread && canDo("alerts", "edit") && (
                          <button type="button" className="alert-mark-read-btn" onClick={() => markAsRead(alert.id)} title="Mark as read">
                            {iconCheck}
                            <span>Mark Read</span>
                          </button>
                        )}
                        {canDo("alerts", "delete") && (
                          <button type="button" className="alert-dismiss-btn" onClick={() => dismissAlert(alert.id)} title="Dismiss alert">
                            {iconClose}
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="am-card-title">{alert.title}</h4>
                    <p className="am-card-message">{alert.message}</p>

                    <div className="am-card-footer">
                      <span className="am-card-time">{alert.time}</span>
                      <div className="am-channel-row" title="Delivered via">
                        <span className="am-channel-label">Delivered via:</span>
                        {alert.channels.map((ch) => (
                          <span key={ch} className="am-channel-chip" title={CHANNEL_LABELS[ch]}>
                            {CHANNEL_ICONS[ch]}
                            <span className="am-channel-name">{CHANNEL_LABELS[ch]}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredAlerts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(val) => {
            setPageSize(Number(val));
            setCurrentPage(1);
          }}
          variant="table"
        />
      </div>

      {/* ── Notification settings modal ── */}
      {showSettings && (
        <div className="am-modal-backdrop">
          <div className="am-modal">
            <div className="am-modal-header">
              <div className="am-modal-header-title">
                <div className="am-modal-header-icon">{iconSettings}</div>
                <h2>Notification Settings</h2>
              </div>
              <button className="am-modal-close" onClick={() => setShowSettings(false)} title="Close (Esc)">
                {iconClose}
              </button>
            </div>

            <div className="am-modal-body">
              <p className="am-modal-desc">
                Choose which channels should be used for each type of alert. Push notifications are recommended for
                time-sensitive events like device offline alerts.
              </p>

              <div className="am-pref-table">
                <div className="am-pref-row am-pref-row--head">
                  <span className="am-pref-type-col">Alert Type</span>
                  {CHANNEL_KEYS.map((ch) => (
                    <span key={ch} className="am-pref-channel-col">
                      {CHANNEL_ICONS[ch]}
                      {CHANNEL_LABELS[ch]}
                    </span>
                  ))}
                </div>

                {Object.entries(TYPES).map(([key, meta]) => (
                  <div className="am-pref-row" key={key}>
                    <span className="am-pref-type-col">
                      <span className={`am-pref-type-icon ${meta.className}`}>{meta.icon}</span>
                      {meta.label}
                    </span>
                    {CHANNEL_KEYS.map((ch) => (
                      <span className="am-pref-channel-col" key={ch}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={channelPrefs[key][ch]}
                          className={`am-toggle ${channelPrefs[key][ch] ? "is-on" : ""}`}
                          onClick={() => toggleChannel(key, ch)}
                          title={`Toggle ${CHANNEL_LABELS[ch]} for ${meta.label}`}
                        >
                          <span className="am-toggle-knob" />
                        </button>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="am-modal-footer">
              <button className="btn-ghost-custom" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              {canDo("alerts", "edit") && (
                <button className="usr-add-btn" onClick={savePreferences}>
                  Save Preferences
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertNotifications;