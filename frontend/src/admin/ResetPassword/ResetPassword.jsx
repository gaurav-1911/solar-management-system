import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { AuthLayout, FormField, Button, ErrorMessage } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { resetPasswordSchema } from "../../utils/AdminValidation";
import { authAPI } from "../../services/api";
import "./ResetPassword.css";

const lockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const features = [
  "Choose a strong, unique password",
  "At least 8 characters with mixed case",
  "Include a number and special character",
  "Do not reuse old passwords",
];

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [tokenValid, setTokenValid] = useState(true); // optimistic — show form immediately
  const [resetDone, setResetDone] = useState(false);

  // If there's no token in the URL, mark as invalid immediately
  useEffect(() => {
    if (!token) {
      setTokenValid(false);
    }
  }, [token]);

  const formik = useFormik({
    initialValues: {
      password: "",
      confirmPassword: "",
    },
    validationSchema: resetPasswordSchema,
    onSubmit: async (values, { setSubmitting, setFieldError }) => {
      setSubmitting(true);
      try {
        const response = await authAPI.resetPassword(token, values.password, values.confirmPassword);
        const data = response.data;
        if (data.success) {
          setResetDone(true);
          toastSuccess("Password reset successfully! You can now log in.");
          setTimeout(() => navigate("/admin/login"), 3000);
        } else {
          toastError(data.message || "Password reset failed.");
          setFieldError("password", data.message || "Password reset failed.");
        }
      } catch (error) {
        const msg =
          error.response?.data?.message ||
          "This reset link is invalid or has expired. Please request a new one.";
        toastError(msg);
        setFieldError("password", msg);
        if (
          error.response?.status === 400 &&
          msg.toLowerCase().includes("invalid")
        ) {
          setTokenValid(false);
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <AuthLayout
      brandTitle="Solar Admin Panel"
      brandSubtitle="Set a new secure password for your account"
      features={features}
    >
      <div className="reset-card">
        {/* Token Invalid */}
        {!tokenValid ? (
          <div className="reset-error-state">
            <div className="reset-error-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3>Link Invalid or Expired</h3>
            <p>
              This password reset link is no longer valid. Links expire after{" "}
              <strong>5 minutes</strong> and can only be used once.
            </p>
            <Link to="/admin/forgot-password" className="common-btn common-btn-primary">
              Request a new link
            </Link>
          </div>
        ) : resetDone ? (
          /* Success State */
          <div className="reset-success-state">
            <div className="reset-success-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Password Reset!</h3>
            <p>
              Your password has been successfully updated. You'll be redirected
              to the login page in a few seconds.
            </p>
            <Link to="/admin/login" className="common-btn common-btn-primary">
              Go to Login
            </Link>
          </div>
        ) : (
          /* Reset Form */
          <>
            <div className="reset-icon-wrapper">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
                <circle cx="12" cy="16" r="1" fill="#2c5364" />
              </svg>
            </div>

            <div className="card-header">
              <h2>Reset Password</h2>
              <p>Enter and confirm your new secure password below</p>
            </div>

            <ErrorMessage message={formik.errors.submit} />

            <form className="reset-form" onSubmit={formik.handleSubmit} noValidate>
              <FormField
                formik={formik}
                type="password"
                name="password"
                label="New Password"
                required
                placeholder="Enter new password"
                icon={lockIcon}
              />

              <FormField
                formik={formik}
                type="password"
                name="confirmPassword"
                label="Confirm Password"
                required
                placeholder="Re-enter new password"
                icon={lockIcon}
              />

              {/* Password strength hints */}
              <ul className="reset-password-hints">
                <li className={formik.values.password.length >= 8 ? "hint-pass" : ""}>
                  At least 8 characters
                </li>
                <li className={/[A-Z]/.test(formik.values.password) ? "hint-pass" : ""}>
                  One uppercase letter
                </li>
                <li className={/[a-z]/.test(formik.values.password) ? "hint-pass" : ""}>
                  One lowercase letter
                </li>
                <li className={/\d/.test(formik.values.password) ? "hint-pass" : ""}>
                  One number
                </li>
                <li className={/[@$!%*?&^#()_\-+=]/.test(formik.values.password) ? "hint-pass" : ""}>
                  One special character
                </li>
              </ul>

              <Button type="submit" fullWidth loading={formik.isSubmitting}>
                Reset Password
              </Button>
            </form>
          </>
        )}

        <div className="card-footer">
          <p>
            Remember your password?{" "}
            <Link to="/admin/login" className="back-link">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
