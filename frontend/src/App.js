import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ToastProvider } from "./components/common/Toast";
import PageLoader from "./components/common/PageLoader";
import { hasAnyAccess } from "./config/roles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/common/ErrorBoundary";

import Login from "./admin/login/login";

// Lazy load route-level page components for performance and code-splitting
const ForgotPassword = lazy(() => import("./admin/ForgotPassword/Forgot.Password"));
const ResetPassword = lazy(() => import("./admin/ResetPassword/ResetPassword"));
const Dashboard = lazy(() => import("./admin/dashboard/Dashboard/Dashboard"));
const AccessDenied = lazy(() => import("./admin/accessDenied/AccessDenied"));
const QuotationResponse = lazy(() => import("./public/QuotationResponse"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes default cache time
    },
  },
});

/**
 * Users whose role has zero permissions (nothing granted in
 * Role & Permissions / User Management) are locked out of the
 * entire admin UI and see the Access Denied screen instead.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, permissions, permissionsReady } = useAuth();
  const location = useLocation();
  // While session is being restored/verified from the database on page refresh,
  // hold rendering so the user is not prematurely redirected to /admin/login.
  if (!permissionsReady) {
    return <PageLoader fullScreen />;
  }
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  // The Profile page is self-service and stays available to signed-in users
  // even when their role has zero module permissions (e.g. from the
  // Access Denied header).
  const isProfile = location.pathname.startsWith("/admin/profile");
  if (!hasAnyAccess(permissions) && !isProfile) {
    return <Navigate to="/admin/access-denied" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, permissions, permissionsReady } = useAuth();
  if (!permissionsReady) {
    return <PageLoader fullScreen />;
  }
  if (isAuthenticated) {
    return !hasAnyAccess(permissions) ? (
      <Navigate to="/admin/access-denied" replace />
    ) : (
      <Navigate to="/admin/dashboard" replace />
    );
  }
  return children;
};

/**
 * Access Denied — shown to any signed-in user who lands on a section they
 * don't have permission for (zero-permission users, or users who open a module
 * such as User Management / Roles & Permissions without that module granted).
 * It must NOT bounce users with partial access back to the dashboard, or a
 * user lacking e.g. the "users" module would loop forever between the two
 * routes. The Dashboard-level guard redirects here instead.
 */
const AccessDeniedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <Router>
              <ErrorBoundary>
              <Suspense fallback={<PageLoader fullScreen />}>
                <Routes>
                  <Route path="/admin/login" element={<PublicRoute><Login /></PublicRoute>} />
                  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                  <Route path="/admin/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                  <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                  <Route path="/admin/reset-password/:token" element={<ResetPassword />} />
                  <Route path="/admin/reset-password" element={<ResetPassword />} />
                  <Route path="/reset-password/:token" element={<ResetPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/quotation/respond/:quotationId" element={<QuotationResponse />} />
                  <Route path="/admin/access-denied" element={<AccessDeniedRoute><AccessDenied /></AccessDeniedRoute>} />
                  <Route path="/admin/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/admin/:section" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/admin/:section/:id" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/admin/login" replace />} />
                </Routes>
              </Suspense>
              </ErrorBoundary>
            </Router>
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
