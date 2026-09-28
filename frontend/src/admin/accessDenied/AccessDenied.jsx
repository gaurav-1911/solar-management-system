import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../dashboard/Sidebar/Sidebar";
import Header from "../dashboard/Header/Header";
import "../dashboard/Dashboard/Dashboard.css";
import "./AccessDenied.css";

const LockIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-3.6 8-10V5.5L12 2 4 5.5V12c0 6.4 8 10 8 10z" />
    <rect x="9" y="11" width="6" height="7" rx="1" />
    <path d="M9 11v-2a3 3 0 0 1 6 0v2" />
  </svg>
);

const AccessDenied = () => {
  const { user, permissions } = useAuth();
  const navigate = useNavigate();

  // A role with zero permissions is locked out of module features;
  // a role with SOME access was denied only the specific section.
  const hasSomeAccess = Array.isArray(permissions) && permissions.length > 0;

  const getInitials = (name) => {
    const cleaned = (name || "User").trim();
    const initials = cleaned
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return initials || "U";
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar added on the left */}
      <Sidebar activeItem="access-denied" onNavigate={(key) => navigate(`/admin/${key}`)} />
      
      <div className="dashboard-main">
        {/* Header */}
        <Header hideNotifications onNotificationClick={() => {}} />

        <div className="access-denied-content">
          <span className="ad-orb ad-orb--amber" aria-hidden="true" />
          <span className="ad-orb ad-orb--teal" aria-hidden="true" />
          <span className="ad-orb ad-orb--rose" aria-hidden="true" />

          <div className="ad-card">
            <div className="ad-icon-wrap">
              <div className="ad-icon-ring ad-icon-ring--outer" />
              <div className="ad-icon-ring ad-icon-ring--inner">
                <div className="ad-icon">
                  <LockIcon />
                </div>
              </div>
            </div>

            <span className="ad-eyebrow">403 · Access Restricted</span>
            <h1 className="ad-title">Access Denied</h1>

            <p className="ad-message">
              {hasSomeAccess
                ? "You don't have permission to access this section."
                : "You don't have permission to access this application."}
            </p>
            <p className="ad-submessage">
              {hasSomeAccess
                ? "Contact your administrator to get access to this module."
                : "Please contact your administrator."}
            </p>

            <div className="ad-divider" />

            <div className="ad-account">
              <div className="ad-avatar">{getInitials(user?.name)}</div>
              <div className="ad-account-meta">
                <span className="ad-account-name">{user?.name || "User"}</span>
                <span className="ad-account-email">{user?.email || ""}</span>
              </div>
              <span className="ad-account-role">
                {user?.roleLabel || "No Role Assigned"}
              </span>
            </div>

            {hasSomeAccess ? (
              <>
                <p className="ad-hint">
                  Access to this section has been restricted. You can go back to
                  a module your role can access.
                </p>
                <div className="ad-actions">
                  <button
                    type="button"
                    className="ad-btn ad-btn--primary"
                    onClick={() => navigate("/admin/dashboard")}
                  >
                    Go to Dashboard
                  </button>
                </div>
              </>
            ) : (
              <p className="ad-hint" style={{ marginBottom: "12px" }}>
                No permissions have been granted to your account. Your
                administrator can assign a role or permissions from{" "}
                <span>User Management</span>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
