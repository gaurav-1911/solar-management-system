import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ToastProvider } from "./components/common/Toast";
import PageLoader from "./components/common/PageLoader";
import { hasAnyAccess } from "./config/roles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/common/ErrorBoundary";

// Public & Auth Pages
const AboutPage = lazy(() => import("./pages/public/AboutPage"));
const NotFoundPage = lazy(() => import("./pages/public/NotFoundPage"));

// Auth & Admin components
const Login = lazy(() => import("./admin/login/login"));
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
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // The Profile page is self-service and stays available to signed-in users
  // even when their role has zero module permissions (e.g. from the
  // Access Denied header).
  const isProfile = location.pathname.startsWith("/admin/profile");
  if (!hasAnyAccess(permissions) && !isProfile) {
    return <Navigate to="/admin/access-denied" replace />;
  }
  return children;
};

const PublicAuthRoute = ({ children }) => {
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

const AccessDeniedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const getBasename = () => {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/solar-management-system")) {
    return "/solar-management-system";
  }
  return "";
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <Router basename={getBasename()}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader fullScreen />}>
                  <Routes>
                    {/* Primary Application & Authentication Routes */}
                    <Route path="/" element={<PublicAuthRoute><Login /></PublicAuthRoute>} />
                    <Route path="/login" element={<PublicAuthRoute><Login /></PublicAuthRoute>} />
                    <Route path="/admin/login" element={<PublicAuthRoute><Login /></PublicAuthRoute>} />
                    <Route path="/forgot-password" element={<PublicAuthRoute><ForgotPassword /></PublicAuthRoute>} />
                    <Route path="/admin/forgot-password" element={<PublicAuthRoute><ForgotPassword /></PublicAuthRoute>} />
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/admin/reset-password/:token" element={<ResetPassword />} />
                    <Route path="/admin/reset-password" element={<ResetPassword />} />

                    {/* Content & Profile Pages */}
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/about-gaurav-chavda" element={<AboutPage />} />

                    {/* Customer Quotation Public Response */}
                    <Route path="/quotation/respond/:quotationId" element={<QuotationResponse />} />

                    {/* Protected Admin & Dashboard Routes */}
                    <Route path="/admin/access-denied" element={<AccessDeniedRoute><AccessDenied /></AccessDeniedRoute>} />
                    <Route path="/admin/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/admin/:section" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/admin/:section/:id" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

                    {/* 404 Dedicated Not Found Page */}
                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<NotFoundPage />} />
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
