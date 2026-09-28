import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  ROLES,
  getRoleLabel,
  hasPermission,
  canDo,
  getActions,
  getAccessibleModules,
  getStoredRolePermissions,
  setStoredRolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
  STORAGE_PERMISSIONS_KEY,
  STORAGE_ROLES_KEY,
} from "../config/roles";

import { authAPI } from "../services/api";

// How often the session re-checks its permissions against the DATABASE. The
// browser `storage` event only fires across tabs of the SAME profile — a user
// logged in inside an incognito window (or another browser) never receives it.
// The backend is the only shared source of truth there, so this poll bridges
// that gap and redirects to Access Denied as soon as access is revoked.
const PERMISSIONS_POLL_INTERVAL_MS = 10000;

const buildUser = (data = {}) => {
  const userRole = data.role || ROLES.SUPER_ADMIN;

  // The backend returns the authoritative DB permission matrix (from the Role
  // collection). Persist it REPLACING any stale local entry — merging would let
  // leftover default modules bleed into a role that was granted zero or fewer
  // permissions, making the dashboard widgets visible to permission-less users.
  // NOTE: only treat a plain object as a matrix — buildUser is also called with
  // previously-built user objects whose `permissions` is a module-key ARRAY
  // (switchRole / roles-updated / updateUser), which must never overwrite the
  // stored matrix.
  if (data.permissions && typeof data.permissions === "object" && !Array.isArray(data.permissions)) {
    try {
      const stored = getStoredRolePermissions();
      stored[userRole] = data.permissions;
      // Super Admin core access can never be lost
      if (!stored[ROLES.SUPER_ADMIN]) {
        stored[ROLES.SUPER_ADMIN] = DEFAULT_ROLE_PERMISSIONS[ROLES.SUPER_ADMIN];
      }
      setStoredRolePermissions(stored);
    } catch (e) {
      console.warn("Failed to persist server permission matrix", e);
    }
  }

  return {
    ...data,
    role: userRole,
    roleLabel: getRoleLabel(userRole),
    permissions: getAccessibleModules(userRole),
    name: data.name || data.email?.split("@")[0] || "Admin",
  };
};

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissionsReady, setPermissionsReady] = useState(false);

  // Rebuild the current user from the STORED roles list + permission matrix.
  const refreshUserFromStoredPermissions = useCallback(() => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      const updated = buildUser(prevUser);
      const sameRole = updated.role === prevUser.role;
      const sameModules =
        JSON.stringify(updated.permissions || []) ===
        JSON.stringify(prevUser.permissions || []);
      if (sameRole && sameModules) return prevUser;
      return updated;
    });
  }, []);

  // Same-tab dynamic roles/permissions updates (dispatched by the Roles &
  // Permissions module after every save).
  useEffect(() => {
    window.addEventListener("roles-updated", refreshUserFromStoredPermissions);
    return () => window.removeEventListener("roles-updated", refreshUserFromStoredPermissions);
  }, [refreshUserFromStoredPermissions]);

  // Cross-tab (SAME browser profile) updates: the browser fires a `storage`
  // event in every other tab when the permission matrix or roles list changes
  // in localStorage — instant lockout, no reload. The focus listener is a
  // safety net for background tabs whose storage events were throttled.
  // NOTE: incognito/other-browser windows have isolated localStorage, so the
  // database poll below covers those cases.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === STORAGE_PERMISSIONS_KEY || e.key === STORAGE_ROLES_KEY) {
        refreshUserFromStoredPermissions();
      }
    };
    const handleFocus = () => refreshUserFromStoredPermissions();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshUserFromStoredPermissions]);

  // Fetch the user's CURRENT permissions from the database (the source of
  // truth shared across every browser context) and rebuild the session when
  // they changed. The equality guard skips redundant updates.
  const syncPermissionsFromServer = useCallback(async () => {
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await authAPI.getProfile();
      if (res.data?.success && res.data?.user) {
        const refreshed = buildUser(res.data.user);
        setUser((prevUser) => {
          if (!prevUser) return refreshed;
          const sameRole = refreshed.role === prevUser.role;
          const sameModules =
            JSON.stringify(refreshed.permissions || []) ===
            JSON.stringify(prevUser.permissions || []);
          if (sameRole && sameModules) return prevUser;
          return refreshed;
        });
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("refreshToken");
        setUser(null);
      } else {
        // Server unreachable or temporarily unavailable — keep the cached
        // session; the route guards still apply and the next tick will retry.
        // Suppress noisy console warnings for transient failures (503 during
        // DB reconnect, network hiccups, CORS preflight errors) so the
        // console stays clean for genuine issues.
        const status = err?.response?.status;
        const isTransient = status === 503 || status === 504 || status === 0;
        if (
          !isTransient &&
          err?.message !== "Network Error" &&
          err?.code !== "ERR_NETWORK"
        ) {
          console.warn("Failed to re-sync user permissions:", err.message);
        }
      }
    }
  }, []);

  // ── Live permission re-sync from the DATABASE ──
  // The localStorage storage-event sync above only reaches tabs of the SAME
  // browser profile. A Super Admin editing permissions in a normal tab while
  // the user is logged in inside an incognito window (or another browser)
  // never fires a storage event here. So also poll the profile endpoint on an
  // interval and whenever the window regains focus — when the role's
  // permissions are removed (or the role deactivated), the route guards
  // redirect to /admin/access-denied on the next tick, without a reload.
  // Polling is skipped while the tab is hidden (no wasted background
  // requests); it resumes immediately when the tab becomes visible again.
  const hasToken = typeof window !== "undefined" && !!(localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken"));
  const isLoggedIn = !!user && hasToken;
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    // Dedupe: on tab return both `visibilitychange` and window `focus` fire,
    // which would otherwise trigger two identical profile requests back-to-back.
    let lastSyncAt = 0;

    const sync = () => {
      if (cancelled) return;
      // Skip background polling for hidden tabs — the sync fires on
      // visibilitychange/focus when the user comes back.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSyncAt < 1000) return;
      lastSyncAt = now;
      syncPermissionsFromServer();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    // Check immediately when the user returns to this tab.
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = setInterval(sync, PERMISSIONS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(intervalId);
    };
  }, [isLoggedIn, syncPermissionsFromServer]);

  // Re-sync permissions from the database on mount so a persisted session
  // always reflects the role's CURRENT permissions.
  useEffect(() => {
    let cancelled = false;
    let fallbackTimer = null;

    const pathname = typeof window !== "undefined" ? (window.location.pathname || "").toLowerCase() : "";
    const isPublicPage =
      pathname.includes("login") ||
      pathname.includes("forgot-password") ||
      pathname.includes("reset-password");

    if (isPublicPage) {
      setPermissionsReady(true);
      return;
    }

    (async () => {
      setPermissionsReady(false);
      fallbackTimer = setTimeout(() => setPermissionsReady(true), 2500);
      await syncPermissionsFromServer();
      if (!cancelled) setPermissionsReady(true);
    })();
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [syncPermissionsFromServer]);

  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });
      const data = response.data;
      if (!data.success) {
        return { success: false, message: data.message };
      } else {
        if (data.token) {
          localStorage.setItem("accessToken", data.token);
        }
        if (data.refreshToken) {
          localStorage.setItem("refreshToken", data.refreshToken);
        }
        const userData = buildUser(data.user);
        setUser(userData);
        setPermissionsReady(true);
        return { success: true, message: data.message, user: userData };
      }
    } catch (error) {
      const message = error.response?.data?.message || (error.message === "Network Error" ? "Unable to connect to backend server. Please verify the backend is running on port 5000." : error.message);
      return { success: false, message };
    }
  };

  // Purge legacy localStorage tokens on startup — session is managed via cookies and Bearer tokens
  useEffect(() => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("adminToken");
      localStorage.removeItem("userToken");
    } catch {}
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setPermissionsReady(true);
    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      sessionStorage.clear();
    } catch {}

    authAPI.logout().catch((err) => {
      logger.warn("Server-side logout failed:", err?.message);
    });
  }, []);

  /** Merge profile updates into the current user (context state) */
  const updateUser = (updates = {}) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      return buildUser({ ...prevUser, ...updates });
    });
  };

  const switchRole = (newRoleKey) => {
    if (!user) return;
    const updatedUser = buildUser({ ...user, role: newRoleKey });
    setUser(updatedUser);
  };

  const canAccess = (moduleKey) => {
    if (!user) return false;
    return hasPermission(user.role, moduleKey);
  };

  /** Check if the current user can perform `action` on `module` */
  const checkAction = (moduleKey, actionKey) => {
    if (!user) return false;
    return canDo(user.role, moduleKey, actionKey);
  };

  /** Get allowed actions for a module for the current user */
  const getUserActions = (moduleKey) => {
    if (!user) return [];
    return getActions(user.role, moduleKey);
  };

  const value = {
    user,
    login,
    logout,
    switchRole,
    updateUser,
    canAccess,
    canDo: checkAction,
    getUserActions,
    isAuthenticated: !!user,
    permissionsReady,
    role: user?.role || null,
    roleLabel: user?.roleLabel || null,
    permissions: user?.permissions || [],
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
