import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useNotifications } from "../../../context/NotificationContext";
import "./Header.css";

const getSeverityColor = (severity) => {
  if (severity === "Critical") return "#ef4444";
  if (severity === "High") return "#2563eb";
  return "#10b981";
};

const Header = ({ title, onNotificationClick, hideNotifications = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { alerts, persistentNotifications, unreadCount, markAsRead, loadAlerts, fetchPersistentNotifications, loading } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggle = (e) => {
    e.stopPropagation();
    // Fetch notifications on demand — only when the bell is opened
    if (!isOpen) {
      loadAlerts();
      fetchPersistentNotifications();
    }
    setIsOpen((prev) => !prev);
  };

  const handleItemClick = (e, notification) => {
    e.stopPropagation();
    markAsRead(notification.id);
    // [FLOW-04] Navigate to the linked page for persistent notifications
    if (notification._persistent && notification.link) {
      setIsOpen(false);
      navigate(notification.link);
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    window.scrollTo(0, 0);
    const contentEl = document.querySelector(".dashboard-content");
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
    if (onNotificationClick) {
      onNotificationClick();
    } else {
      navigate("/admin/alerts");
    }
  };

  // [FLOW-04] Combine persistent notifications (shown first) with derived alerts
  const allNotifications = [
    ...persistentNotifications,
    ...alerts.filter((a) => !persistentNotifications.some((p) => p.sourceId === a.sourceId)),
  ];
  const unreadAll = allNotifications.filter((a) => a.unread);
  const displayedNotifications = unreadAll.length > 0 ? unreadAll.slice(0, 5) : allNotifications.slice(0, 5);

  return (
    <header className="header">
      <div className="header-right">
        {!hideNotifications && (
        <div className="header-notif-container" ref={dropdownRef}>
          <button
            className={`header-btn ${isOpen ? "active" : ""}`}
            title="Notifications & Alerts"
            onClick={handleToggle}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="header-badge">{unreadCount}</span>
            )}
          </button>

          {isOpen && (
            <div className="notif-popup">
              <div className="notif-popup-caret" />
              <div className="notif-popup-header">
                <h3>Notifications</h3>
                {unreadCount > 0 ? (
                  <span className="notif-popup-badge-count">{unreadCount} unread</span>
                ) : (
                  <span className="notif-popup-badge-count" style={{ background: "#e2e8f0", color: "#64748b" }}>0 unread</span>
                )}
              </div>
              <div className="notif-popup-list">
                {loading && alerts.length === 0 ? (
                  <div className="notif-popup-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    <span>Loading data, please wait...</span>
                  </div>
                ) : displayedNotifications.length === 0 ? (
                  <div className="notif-popup-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>All caught up! No unread notifications.</span>
                  </div>
                ) : (
                  displayedNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`notif-popup-item ${n.unread ? "unread" : ""}`}
                      onClick={(e) => handleItemClick(e, n)}
                      title={n.unread ? "Click to mark as read" : ""}
                      style={n._persistent && n.link ? { cursor: "pointer" } : {}}
                    >
                      <span className="notif-popup-dot" style={{ backgroundColor: n._persistent ? "#8b5cf6" : getSeverityColor(n.severity) }} />
                      <div className="notif-popup-body">
                        <div className="notif-popup-title">
                          {n.title}
                          {n.unread && <span className="notif-popup-unread-tag">New</span>}
                          {n._persistent && <span className="notif-popup-unread-tag" style={{ background: "#ede9fe", color: "#7c3aed", marginLeft: 4 }}>In-App</span>}
                        </div>
                        <div className="notif-popup-msg">{n.message}</div>
                        <div className="notif-popup-time">{n.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="notif-popup-footer">
                <button className="notif-popup-viewall" onClick={handleViewAll}>
                  View All
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        <div className="header-divider"></div>
        <div
          className="header-profile"
          onClick={() => {
            // When the profile is opened from the Access Denied screen, tell the
            // Profile page so it can hide the Notification Preferences panel
            // (those users may have no access to the alerts module). The
            // sessionStorage flag survives a page refresh; it is cleared when
            // the profile is opened from any normal page.
            if (location.pathname === "/admin/access-denied") {
              sessionStorage.setItem("fromAccessDenied", "1");
              navigate("/admin/profile", { state: { fromAccessDenied: true } });
            } else {
              sessionStorage.removeItem("fromAccessDenied");
              navigate("/admin/profile");
            }
          }}
        >
          <div className="profile-avatar">
            {user?.photo ? (
              <img
                src={user.photo}
                alt="Profile"
                style={{ width: "100%", height: "100%", borderRadius: "9px", objectFit: "cover" }}
              />
            ) : (
              user?.name
                ? user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "AD"
            )}
          </div>
          <div className="profile-info">
            <span className="profile-name">{user?.name || "Admin User"}</span>
            <span className="profile-role">
              {user?.roleLabel || "Administrator"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
