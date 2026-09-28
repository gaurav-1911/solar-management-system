import React, { useState, useEffect } from "react";
import { activityLogAPI } from "../../services/api";

const ACTION_ICONS = {
  created: "➕",
  updated: "✏️",
  deleted: "🗑️",
  status_change: "🔄",
  login: "🔑",
  logout: "🚪",
};

const timeAgo = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const widgetStyles = {
  container: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px",
    padding: "20px",
  },
  title: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#f1f5f9",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  item: {
    display: "flex",
    gap: "10px",
    padding: "10px 0",
    borderBottom: "1px solid rgba(148, 163, 184, 0.06)",
    alignItems: "flex-start",
  },
  icon: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    flexShrink: 0,
  },
  summary: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  meta: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "2px",
  },
  empty: {
    textAlign: "center",
    padding: "20px",
    color: "#64748b",
    fontSize: "13px",
  },
};

const iconBg = {
  created: "rgba(16, 185, 129, 0.15)",
  updated: "rgba(59, 130, 246, 0.15)",
  deleted: "rgba(239, 68, 68, 0.15)",
  status_change: "rgba(245, 158, 11, 0.15)",
};

/**
 * Reusable widget showing recent activity for a specific module or record.
 *
 * Props:
 *   - module: (string) RBAC module key (e.g. "customers", "leads")
 *   - recordId: (string) specific record ID to filter by
 *   - limit: (number) max entries to show (default 5)
 *   - title: (string) widget title
 */
const RecentActivityWidget = ({ module, recordId, limit = 5, title = "Recent Activity" }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        let res;
        if (recordId) {
          res = await activityLogAPI.getByRecord(recordId, { limit });
        } else {
          res = await activityLogAPI.getAll({ module, limit });
        }
        if (res.data?.success) {
          setActivities(res.data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch recent activities:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, [module, recordId, limit]);

  if (loading) {
    return (
      <div style={widgetStyles.container}>
        <div style={widgetStyles.title}>📋 {title}</div>
        <div style={widgetStyles.empty}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={widgetStyles.container}>
      <div style={widgetStyles.title}>📋 {title}</div>
      {activities.length === 0 ? (
        <div style={widgetStyles.empty}>No recent activity</div>
      ) : (
        activities.map((log) => (
          <div key={log._id} style={widgetStyles.item}>
            <div
              style={{
                ...widgetStyles.icon,
                background: iconBg[log.action] || "rgba(99,102,241,0.15)",
              }}
            >
              {ACTION_ICONS[log.action] || "📝"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={widgetStyles.summary}>{log.summary}</div>
              <div style={widgetStyles.meta}>
                {log.userName} • {timeAgo(log.createdAt)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default RecentActivityWidget;
