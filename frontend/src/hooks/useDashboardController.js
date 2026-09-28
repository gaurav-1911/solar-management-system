import { useState, useCallback, useMemo } from "react";
import { ROLES, MODULES } from "../config/roles";

const useDashboardController = (user) => {
  const [activeItem, setActiveItem] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    typeof window !== "undefined" && window.innerWidth <= 768
  );
  const [quickActionType, setQuickActionType] = useState(null);
  const [toasts, setToasts] = useState([]);

  const userRole = user?.role || "customer";
  const allowedModules = useMemo(
    () => ROLES[userRole]?.modules || [],
    [userRole]
  );

  const canAccess = useCallback(
    (moduleId) => {
      if (userRole === "super_admin") return true;
      return allowedModules.includes(moduleId);
    },
    [userRole, allowedModules]
  );

  const accessibleModules = useMemo(() => {
    return MODULES.filter((m) => canAccess(m.id));
  }, [canAccess]);

  const addToast = useCallback((toast) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const handleNavigate = useCallback((item) => {
    setActiveItem(item);
    if (window.innerWidth <= 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  const getHeaderTitle = useCallback(() => {
    const module = MODULES.find((m) => m.id === activeItem);
    return module?.label || "Dashboard";
  }, [activeItem]);

  return {
    activeItem,
    setActiveItem,
    sidebarCollapsed,
    toggleSidebar,
    quickActionType,
    setQuickActionType,
    toasts,
    addToast,
    removeToast,
    handleNavigate,
    getHeaderTitle,
    canAccess,
    accessibleModules,
    userRole,
  };
};

export default useDashboardController;
