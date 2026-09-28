import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useFormik } from "formik";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout, FormField, Button } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { adminLoginSchema } from "../../utils/AdminValidation";
import { hasAnyAccess } from "../../config/roles";
import "./login.css";

const emailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 4L12 13L2 4" />
  </svg>
);

const passwordIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const features = [
  "Monitor energy output in real-time",
  "Manage installations and clients",
  "Track maintenance schedules",
  "Generate detailed reports",
];

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const { success, error: showError } = useToast();

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: adminLoginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      setLoading(true);
      const result = await login(values.email, values.password);
      setLoading(false);
      setSubmitting(false);
      if (result?.success) {
        // Roles with zero permissions land on the Access Denied screen.
        const hasAccess = hasAnyAccess(result.user?.permissions);
        success(
          hasAccess
            ? "Logged in successfully. Welcome back!"
            : "Signed in. Your account has no assigned permissions yet."
        );
        navigate(hasAccess ? "/admin/dashboard" : "/admin/access-denied");
      } else {
        showError(result?.message || "Invalid credentials.");
      }
    },
  });

  return (
    <AuthLayout
      brandTitle="Solar Admin Panel"
      brandSubtitle="Manage your solar solutions from one powerful dashboard"
      features={features}
    >
      <div className="login-card">
        <div className="card-header">
          <h2>Welcome Back</h2>
        </div>

        <form noValidate className="login-form" onSubmit={formik.handleSubmit}>
          <FormField
            formik={formik}
            name="email"
            label="Email or Username"
            required
            placeholder="Enter your email or username"
            icon={emailIcon}
          />

          <FormField
            formik={formik}
            type="password"
            name="password"
            label="Password"
            required
            placeholder="Enter your password"
            icon={passwordIcon}
          />

          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/admin/forgot-password" className="forgot-link">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Sign In
          </Button>
        </form>

      </div>
    </AuthLayout>
  );
};

export default Login;
