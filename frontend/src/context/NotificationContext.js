import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { maintenanceTicketAPI, warrantyAPI, amcAPI, ticketAPI, quotationAPI, notificationAPI } from "../services";
import { fetchAllPages } from "../utils";
import { useAuth } from "./AuthContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - new Date(todayISO()).getTime()) / 86400000);
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

let alertSeq = 1000;
function makeId() { return `AL-${++alertSeq}`; }

function deriveAlerts(maintenanceTickets, warranties, amcs, supportTickets, quotations = []) {
  const alerts = [];

  // Maintenance tickets — open/in-progress = maintenance due alert
  maintenanceTickets.forEach((t) => {
    if (["Open", "In Progress", "Pending"].includes(t.status)) {
      alerts.push({
        id: makeId(),
        sourceId: t._id,
        type: "maintenance",
        severity: t.priority === "High" || t.priority === "Critical" ? "High" : "Medium",
        title: `Maintenance ticket open — ${t.ticketId || t._id}`,
        message: `${t.customer}: ${t.description || t.issue || "Service required"}`,
        time: timeAgo(t.createdAt),
        unread: t.status === "Open",
        channels: ["email"],
      });
    }
  });

  // Warranties — expiring within 60 days or already expired (derive from `expires` date)
  warranties.forEach((w) => {
    if (!w.expires) return;
    const days = daysUntil(w.expires);
    if (days === null) return;
    const expired = days < 0;
    const expiring = days >= 0 && days <= 60;
    if (!expired && !expiring) return;
    alerts.push({
      id: makeId(),
      sourceId: w._id,
      type: "warranty",
      severity: expired || days <= 14 ? "High" : "Low",
      title: expired
        ? `Warranty expired — ${w.warrantyId || w._id}`
        : `Warranty expiring in ${days} day${days !== 1 ? "s" : ""}`,
      message: `${w.customer} — ${w.component} ${w.model} (${w.manufacturer})`,
      time: timeAgo(w.updatedAt || w.createdAt),
      unread: expired || days <= 14,
      channels: ["email", "sms"],
    });
  });

  // AMC contracts — expiring within 30 days or already expired
  amcs.forEach((a) => {
    const days = daysUntil(a.endDate);
    if (days !== null && days <= 30) {
      const expired = days < 0;
      alerts.push({
        id: makeId(),
        sourceId: a._id,
        type: "maintenance",
        severity: expired ? "Critical" : days <= 7 ? "High" : "Medium",
        title: expired ? `AMC expired — ${a.amcId || a._id}` : `AMC expiring in ${days} day${days !== 1 ? "s" : ""}`,
        message: `${a.customer} — ${a.system || ""} (${a.plan || ""})`,
        time: timeAgo(a.updatedAt || a.createdAt),
        unread: expired || days <= 7,
        channels: ["email"],
      });
    }
  });

  // Quotations — Sent/Negotiating/Pending Approval = payment due alert
  quotations.forEach((q) => {
    if (!["Sent", "Negotiating", "Pending Approval"].includes(q.status)) return;
    const days = q.validUntil ? daysUntil(q.validUntil) : null;
    const overdue = days !== null && days < 0;
    const urgentSoon = days !== null && days <= 7;
    alerts.push({
      id: makeId(),
      sourceId: q._id,
      type: "payment",
      severity: overdue ? "High" : urgentSoon ? "Medium" : "Low",
      title: overdue
        ? `Quotation expired — ${q.quotationId || q._id}`
        : `Quotation ${q.status.toLowerCase()} — ${q.quotationId || q._id}`,
      message: `${q.client}${q.projectName ? ` — ${q.projectName}` : ""}: ₹${(q.grandTotal || q.total || 0).toLocaleString("en-IN")} (${q.status})`,
      time: timeAgo(q.updatedAt || q.createdAt),
      unread: overdue || urgentSoon,
      channels: ["email", "whatsapp"],
    });
  });

  // Support tickets — open critical/high = payment-type alert
  supportTickets.forEach((t) => {
    if (["Open", "In Progress"].includes(t.status) && ["Critical", "High"].includes(t.priority)) {
      alerts.push({
        id: makeId(),
        sourceId: t._id,
        type: "payment",
        severity: t.priority,
        title: `${t.priority} support ticket — ${t.ticketId || t._id}`,
        message: `${t.customer}: ${t.subject}`,
        time: timeAgo(t.createdAt),
        unread: t.status === "Open",
        channels: ["push", "email"],
      });
    }
  });

  // Sort: unread first, then by severity
  const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  alerts.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
  });

  return alerts;
}

/* ── Persisted read/dismissed state (survives page refresh) ── */
// Alerts are re-derived from live API data on every mount, so the user's
// "read" / "dismissed" decisions are persisted in localStorage keyed by the
// stable source record id (sourceId) and re-applied whenever alerts rebuild.

function userScope(user) {
  return user?._id || user?.id || user?.userId || user?.email || "guest";
}

function loadIds() {
  return new Set();
}

function saveIds() {
  /* in-memory state */
}

function applyAlertState(alerts, readIds, dismissedIds) {
  return alerts
    .filter((a) => !dismissedIds.has(a.sourceId))
    .map((a) => (readIds.has(a.sourceId) ? { ...a, unread: false } : a));
}

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const userKey = userScope(user);
  const [alerts, setAlerts] = useState([]);
  const [persistentNotifications, setPersistentNotifications] = useState([]);
  const [persistentUnreadCount, setPersistentUnreadCount] = useState(0);
  const [resolvedToday, setResolvedToday] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [readIds, setReadIds] = useState(() => loadIds());
  // eslint-disable-next-line no-unused-vars
  const [dismissedIds, setDismissedIds] = useState(() => loadIds());
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false); // true after a full loadAlerts completes
  const [summary, setSummary] = useState(null); // { total, unread, resolvedToday } from the lightweight endpoint
  const loadingRef = useRef(false);

  // Lightweight summary — ONE small request on app load so the bell badge and
  // the Resolved Today stat appear instantly on every page.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    notificationAPI
      .getSummary()
      .then((res) => {
        if (!cancelled) setSummary(res.data?.data || null);
      })
      .catch(() => {
        /* badge just stays hidden — non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  // Build alerts from live data. Called ON DEMAND — when the notification bell is
  // opened or the Alerts page is visited — instead of on mount, so opening any
  // page no longer fires all the unrelated module APIs at app load.
  const loadAlerts = useCallback(async () => {
    // Guard against duplicate in-flight fetches (rapid bell clicks, page + bell)
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const read = loadIds(userKey, "read");
    const dismissed = loadIds(userKey, "dismissed");
    setReadIds(read);
    setDismissedIds(dismissed);
    try {
      const [maintenance, warranties, amcs, support, quotations] = await Promise.all([
        fetchAllPages(maintenanceTicketAPI.getAll).catch(() => []),
        fetchAllPages(warrantyAPI.getAll).catch(() => []),
        fetchAllPages(amcAPI.getAll).catch(() => []),
        fetchAllPages(ticketAPI.getAll).catch(() => []),
        fetchAllPages(quotationAPI.getAll).catch(() => []),
      ]);
      const derived = deriveAlerts(maintenance, warranties, amcs, support, quotations);

      // Prune persisted ids that no longer correspond to a live alert
      const liveSourceIds = new Set(derived.map((a) => a.sourceId).filter(Boolean));
      const prunedRead = new Set([...read].filter((id) => liveSourceIds.has(id)));
      const prunedDismissed = new Set([...dismissed].filter((id) => liveSourceIds.has(id)));
      setReadIds(prunedRead);
      setDismissedIds(prunedDismissed);
      if (prunedRead.size !== read.size) saveIds(userKey, "read", prunedRead);
      if (prunedDismissed.size !== dismissed.size) saveIds(userKey, "dismissed", prunedDismissed);

      setAlerts(applyAlertState(derived, prunedRead, prunedDismissed));

      // Count tickets resolved/closed today
      const today = todayISO();
      const resolved = [
        ...maintenance.filter((t) => ["Resolved", "Closed", "Completed"].includes(t.status) && (t.updatedAt || "").slice(0, 10) === today),
        ...support.filter((t) => ["Resolved", "Closed"].includes(t.status) && (t.updatedAt || "").slice(0, 10) === today),
      ];
      setResolvedToday(resolved.length);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setHasLoaded(true);
    }
  }, [userKey]);

  // [FLOW-04] Fetch persistent (in-app) notifications
  const fetchPersistentNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await notificationAPI.getUserNotifications({ limit: 50, unreadOnly: false });
      if (res.data?.success) {
        const notifs = (res.data.data || []).map((n) => ({
          id: n._id,
          sourceId: n.sourceId,
          type: n.type,
          severity: "Medium",
          title: n.title,
          message: n.message,
          link: n.link || "",
          time: timeAgo(n.createdAt),
          unread: !n.read,
          channels: ["in-app"],
          _persistent: true,
        }));
        setPersistentNotifications(notifs);
        setPersistentUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      /* non-fatal */
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchPersistentNotifications();
  }, [user, fetchPersistentNotifications]);

  // Combined unread count: derived alerts + persistent notifications
  const unreadCount = useMemo(() => {
    if (hasLoaded) return alerts.filter((a) => a.unread).length + persistentUnreadCount;
    return (summary?.unread ?? 0) + persistentUnreadCount;
  }, [hasLoaded, alerts, summary, persistentUnreadCount]);

  // Same fallback for the Resolved Today stat on the Alerts page.
  const effectiveResolvedToday = hasLoaded ? resolvedToday : summary?.resolvedToday ?? 0;

  const markAsRead = (id) => {
    // Check if it's a persistent notification
    const persistNotif = persistentNotifications.find((n) => n.id === id);
    if (persistNotif) {
      setPersistentNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
      setPersistentUnreadCount((prev) => Math.max(0, prev - 1));
      notificationAPI.markRead(id).catch(() => {});
      return;
    }
    // Otherwise it's a derived alert
    const target = alerts.find((a) => a.id === id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, unread: false } : a)));
    if (target?.sourceId) {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(target.sourceId);
        saveIds(userKey, "read", next);
        return next;
      });
    }
  };

  const markAllAsRead = () => {
    // Mark all derived alerts as read
    setAlerts((prev) => prev.map((a) => ({ ...a, unread: false })));
    setReadIds((prev) => {
      const next = new Set(prev);
      alerts.forEach((a) => a.sourceId && next.add(a.sourceId));
      saveIds(userKey, "read", next);
      return next;
    });
    // [FLOW-04] Mark all persistent notifications as read via API
    setPersistentNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    setPersistentUnreadCount(0);
    notificationAPI.markAllRead().catch(() => {});
  };

  const deleteAlert = (id) => {
    const target = alerts.find((a) => a.id === id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (target?.sourceId) {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(target.sourceId);
        saveIds(userKey, "dismissed", next);
        return next;
      });
    }
  };

  return (
    <NotificationContext.Provider value={{ alerts, setAlerts, persistentNotifications, unreadCount, resolvedToday: effectiveResolvedToday, loading, loadAlerts, markAsRead, markAllAsRead, deleteAlert, fetchPersistentNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within a NotificationProvider");
  return context;
};
