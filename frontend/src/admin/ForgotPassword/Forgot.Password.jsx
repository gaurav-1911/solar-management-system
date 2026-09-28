import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useFormik } from "formik";
import { AuthLayout, FormField, Button, ErrorMessage } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { forgotPasswordSchema } from "../../utils/AdminValidation";
import { authAPI } from "../../services/api";
import "./Forgot.Password.css";

const emailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 4L12 13L2 4" />
  </svg>
);

const features = [
  "Receive a password reset link via email",
  "Link expires in 5 minutes",
  "Check your spam folder if not found",
  "Contact support if issues persist",
];

const ForgotPassword = () => {
  const [submitted, setSubmitted] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const { success: toastSuccess, error: toastError } = useToast();

  const formik = useFormik({
    initialValues: {
      email: "",
    },
    validationSchema: forgotPasswordSchema,
    onSubmit: async (values, { setSubmitting, setFieldError, resetForm }) => {
      setSubmitting(true);
      try {
        const response = await authAPI.forgotPassword(values.email);
        const data = response.data;
        if (data.success) {
          setSentEmail(values.email);
          setSubmitted(true);
          toastSuccess("Password reset link sent to your email.");
          resetForm();
        } else {
          setFieldError("email", data.message || "Failed to send reset link.");
          toastError(data.message || "Failed to send reset link.");
        }
      } catch (error) {
        const msg =
          error.response?.data?.message ||
          "Failed to send reset email. Please try again.";
        setFieldError("email", msg);
        toastError(msg);
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <AuthLayout
      brandTitle="Solar Admin Panel"
      brandSubtitle="Reset your password to regain access to your account"
      features={features}
    >
      <div className="forgot-card">
        {submitted ? (
          <div className="forgot-success-state">
            <div className="forgot-success-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Check your inbox!</h3>
            <p>
              We sent a password reset link to{" "}
              <strong>{sentEmail}</strong>. The link will expire in{" "}
              <strong>5 minutes</strong>.
            </p>
            <p className="forgot-spam-note">
              Can't find it? Check your spam or junk folder.
            </p>
            <button
              className="forgot-resend-btn"
              onClick={() => setSubmitted(false)}
            >
              Resend reset link
            </button>
          </div>
        ) : (
          <>
            <div className="forgot-icon-wrapper">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2c5364" strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
                <circle cx="12" cy="16" r="1" fill="#2c5364" />
              </svg>
            </div>

            <div className="card-header">
              <h2>Forgot Password?</h2>
              <p>Enter your email and we&#39;ll send you a reset link</p>
            </div>

            <ErrorMessage message={formik.errors.submit} />

            <form className="forgot-form" onSubmit={formik.handleSubmit}>
              <FormField
                formik={formik}
                name="email"
                label="Email Address"
                required
                placeholder="admin@solar.com"
                icon={emailIcon}
              />

              <Button type="submit" fullWidth loading={formik.isSubmitting}>
                Send Reset Link
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

export default ForgotPassword;
