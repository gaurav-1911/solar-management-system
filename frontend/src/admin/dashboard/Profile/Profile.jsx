import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { getRoleLabel, hasAnyAccess } from "../../../config/roles";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useToast, PageLoader, Dropdown } from "../../../components/common";
import { authAPI } from "../../../services/api";
import {
  NAME_MIN_MSG,
  EMAIL_REQUIRED_MSG,
  EMAIL_PATTERN_MSG,
  PHONE_PATTERN_MSG,
  PASSWORD_MISMATCH_MSG,
} from "../../../utils/validationMessages";
import "./Profile.css";

const profileSchema = Yup.object({
  name: Yup.string()
    .required("Full name is required")
    .min(2, NAME_MIN_MSG),
  email: Yup.string()
    .required(EMAIL_REQUIRED_MSG)
    .email(EMAIL_PATTERN_MSG),
  phone: Yup.string()
    .required("Phone number is required")
    .matches(/^\+?[1-9]\d{9,14}$/, PHONE_PATTERN_MSG),
  department: Yup.string()
    .required("Department is required"),
  location: Yup.string(),
  bio: Yup.string(),
});

// Department options match the User model enum, with friendly display labels.
const DEPARTMENTS = [
  { value: "admin", label: "Administration" },
  { value: "sales", label: "Sales" },
  { value: "technical", label: "Technical" },
  { value: "finance", label: "Finance" },
  { value: "support", label: "Support" },
  { value: "hr", label: "HR" },
  { value: "inventory", label: "Inventory" },
  { value: "projects", label: "Projects" },
];
const DEPARTMENT_LABELS = Object.fromEntries(
  DEPARTMENTS.map((dept) => [dept.value, dept.label])
);

const passwordSchema = Yup.object({
  currentPassword: Yup.string()
    .required("Current password is required"),
  newPassword: Yup.string()
    .required("New password is required")
    .min(8, "Must be at least 8 characters")
    .max(32, "Must not exceed 32 characters")
    .matches(/[A-Z]/, "Must include an uppercase letter")
    .matches(/[a-z]/, "Must include a lowercase letter")
    .matches(/[0-9]/, "Must include a number")
    .matches(/[@$!%*?&^#()_\-+=]/, "Must include a special character")
    .notOneOf([Yup.ref("currentPassword")], "New password must be different from current password"),
  confirmPassword: Yup.string()
    .required("Please confirm your new password")
    .oneOf([Yup.ref("newPassword")], PASSWORD_MISMATCH_MSG),
});

const Profile = () => {
  const { user, permissions, updateUser } = useAuth();
  const location = useLocation();
  // The profile can be opened from the Access Denied screen. In that context
  // the Notification Preferences panel is hidden: permission-less users have
  // no module access so those preferences don't apply, and users who were
  // denied a module (e.g. Alerts) shouldn't see notification toggles they
  // can't use. Users opening their profile normally still see the panel.
  // The sessionStorage flag (set by the header when navigating away from the
  // Access Denied screen) survives a page refresh.
  const fromAccessDenied =
    location.state?.fromAccessDenied === true ||
    sessionStorage.getItem("fromAccessDenied") === "1";
  const showNotificationPrefs = hasAnyAccess(permissions) && !fromAccessDenied;
  const navigate = useNavigate();
  const { success: showToast, error: toastError } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [profileData, setProfileData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [showPasswords, setShowPasswords] = React.useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoPreview, setPhotoPreview] = React.useState(null);
  const photoInputRef = React.useRef(null);

  function togglePasswordVisibility(field) {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toastError("Image must be under 5MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toastError("Please select an image file.");
      return;
    }
    setPhotoUploading(true);
    try {
      const response = await authAPI.uploadProfilePhoto(file);
      if (response.data?.success) {
        setProfileData(response.data.user);
        setPhotoPreview(null);
        updateUser({ photo: response.data.user.photo });
        showToast("Profile photo updated.");
      } else {
        toastError(response.data?.message || "Failed to upload photo.");
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to upload photo.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function handlePhotoRemove() {
    setPhotoUploading(true);
    try {
      const response = await authAPI.removeProfilePhoto();
      if (response.data?.success) {
        setProfileData(response.data.user);
        setPhotoPreview(null);
        updateUser({ photo: null });
        showToast("Profile photo removed.");
      } else {
        toastError(response.data?.message || "Failed to remove photo.");
      }
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to remove photo.");
    } finally {
      setPhotoUploading(false);
    }
  }

  // Fetch the latest profile from the backend so every field is dynamic.
  React.useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      try {
        const response = await authAPI.getProfile();
        if (isMounted) {
          if (response.data?.success) {
            setProfileData(response.data.user);
          } else {
            toastError(
              response.data?.message ||
                "Failed to load profile. Showing saved details."
            );
          }
        }
      } catch (error) {
        if (isMounted) {
          toastError(
            error.response?.data?.message ||
              "Failed to load profile. Showing saved details."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert a stored phone (e.g. "+91 98765 43210") into the 10-digit value
  // shown next to the fixed +91 prefix in the form. A leading "91" country
  // code is only stripped when it was stored with one (91 + 10-digit number);
  // a bare 10-digit number that happens to start with "91" is kept as-is.
  function toDisplayPhone(phone) {
    if (!phone) return "";
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
      return digits.slice(2);
    }
    return digits.slice(0, 10);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const profileFormik = useFormik({
    initialValues: {
      name: profileData?.name || user?.name || "",
      email: profileData?.email || user?.email || "",
      phone: toDisplayPhone(profileData?.phone ?? user?.phone),
      department: profileData?.department || user?.department || "",
      location: profileData?.location || user?.location || "",
      bio: profileData?.bio || user?.bio || "",
    },
    validationSchema: profileSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      setSubmitting(true);
      try {
        const fullPhone = "+91" + values.phone.replace(/\D/g, "");
        const response = await authAPI.updateProfile({
          name: values.name,
          phone: fullPhone,
          department: values.department,
          location: values.location,
          bio: values.bio,
        });

        if (response.data?.success) {
          setIsEditing(false);
          setProfileData(response.data.user);
          updateUser({
            name: response.data.user.name,
            phone: response.data.user.phone,
            department: response.data.user.department,
            location: response.data.user.location,
            bio: response.data.user.bio,
          });
          showToast(response.data?.message || "Profile updated successfully.");
        } else {
          toastError(response.data?.message || "Failed to update profile.");
        }
      } catch (error) {
        toastError(
          error.response?.data?.message ||
            "Failed to update profile. Please try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
  });

  const passwordFormik = useFormik({
    initialValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validationSchema: passwordSchema,
    onSubmit: async (values, { setSubmitting, setFieldError, resetForm }) => {
      setSubmitting(true);
      try {
        const response = await authAPI.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        });

        if (response.data?.success) {
          showToast(response.data?.message || "Password changed successfully.");
          resetForm();
          setShowPasswords({
            currentPassword: false,
            newPassword: false,
            confirmPassword: false,
          });
        } else {
          toastError(response.data?.message || "Failed to change password.");
        }
      } catch (error) {
        const msg =
          error.response?.data?.message ||
          "Failed to change password. Please verify your current password.";
        if (msg.toLowerCase().includes("current password")) {
          setFieldError("currentPassword", msg);
        } else {
          setFieldError("newPassword", msg);
        }
        toastError(msg);
      } finally {
        setSubmitting(false);
      }
    },
  });

  function cancelPasswordChange() {
    passwordFormik.resetForm();
    setShowPasswords({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
  }

  const initials =
    profileFormik.values.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "US";

  const status = (profileData?.status || user?.status || "active").toLowerCase();
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  if (loading) {
    return (
      <div className="pf-container">
        <PageLoader minHeight="350px" />
      </div>
    );
  }

  return (
    <>
    <div className="pf-container">
      <div className="pf-header">
        <button
          className="pf-back-btn"
          onClick={() => navigate("/admin/dashboard")}
          title="Back to Dashboard"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2>My Profile</h2>
      </div>

      <div className="pf-top-card">
        <div className="pf-profile-row">
          <div className="pf-avatar-wrapper" style={{ position: "relative" }}>
            {(profileData?.photo || photoPreview) ? (
              <img
                src={photoPreview || profileData?.photo}
                alt="Profile"
                className="pf-avatar-lg"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div className="pf-avatar-lg">{initials}</div>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoUpload}
            />
            <button
              type="button"
              className="pf-photo-upload-btn"
              disabled={photoUploading}
              onClick={() => photoInputRef.current?.click()}
              title="Change profile photo"
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "2px solid #fff",
                background: "#2c5364",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {photoUploading ? (
                <span style={{ fontSize: 10 }}>&#8987;</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
            {profileData?.photo && (
              <button
                type="button"
                onClick={handlePhotoRemove}
                disabled={photoUploading}
                title="Remove photo"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid #fff",
                  background: "#ef4444",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  lineHeight: 1,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                }}
              >
                ×
              </button>
            )}
          </div>
          <div className="pf-profile-meta">
            <h3>{profileFormik.values.name}</h3>
            <span className="pf-role-badge">
              {getRoleLabel(profileData?.role || user?.role)}
            </span>
            <p className="pf-email">{profileFormik.values.email}</p>
          </div>
          <div className="pf-profile-actions">
            {!isEditing ? (
              <button
                className="pf-btn pf-btn--primary"
                onClick={() => setIsEditing(true)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  className="pf-btn pf-btn--ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="pf-btn pf-btn--primary"
                  onClick={profileFormik.handleSubmit}
                  disabled={profileFormik.isSubmitting}
                >
                  {profileFormik.isSubmitting ? "Saving…" : "Save Changes"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pf-grid">
        <div className="pf-card">
          <h4 className="pf-card-title">Personal Information</h4>
          {isEditing ? (
            <form className="pf-form" onSubmit={profileFormik.handleSubmit}>
              <div className="pf-field">
                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={profileFormik.values.name}
                  onChange={profileFormik.handleChange}
                  onBlur={profileFormik.handleBlur}
                  className={profileFormik.touched.name && profileFormik.errors.name ? "pf-input--error" : ""}
                />
                {profileFormik.touched.name && profileFormik.errors.name && (
                  <span className="pf-field-error">{profileFormik.errors.name}</span>
                )}
              </div>
              <div className="pf-field">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={profileFormik.values.email}
                  onChange={profileFormik.handleChange}
                  onBlur={profileFormik.handleBlur}
                  disabled
                  title="Email cannot be changed"
                />
                <span className="pf-field-hint">Email cannot be changed</span>
              </div>
              <div className="pf-field">
                <label>Phone Number</label>
                <div className="pf-phone-group">
                  <span className="pf-phone-prefix">+91</span>
                  <input
                    type="text"
                    name="phone"
                    value={profileFormik.values.phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      profileFormik.setFieldValue("phone", val);
                    }}
                    onBlur={profileFormik.handleBlur}
                    placeholder="98765 43210"
                    className={profileFormik.touched.phone && profileFormik.errors.phone ? "pf-input--error" : ""}
                  />
                </div>
                {profileFormik.touched.phone && profileFormik.errors.phone && (
                  <span className="pf-field-error">{profileFormik.errors.phone}</span>
                )}
              </div>
              <div className="pf-field">
                <label>Department</label>
                <Dropdown
                  value={profileFormik.values.department}
                  onChange={(val) => profileFormik.setFieldValue("department", val)}
                  options={[
                    ...(!DEPARTMENTS.some((dept) => dept.value === profileFormik.values.department) && profileFormik.values.department
                      ? [{ value: profileFormik.values.department, label: profileFormik.values.department }]
                      : []),
                    ...DEPARTMENTS,
                  ]}
                  placeholder="Select department"
                  variant="form"
                />
                {profileFormik.touched.department && profileFormik.errors.department && (
                  <span className="pf-field-error">{profileFormik.errors.department}</span>
                )}
              </div>
              <div className="pf-field pf-field--full">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={profileFormik.values.location}
                  onChange={profileFormik.handleChange}
                  onBlur={profileFormik.handleBlur}
                />
              </div>
              <div className="pf-field pf-field--full">
                <label>Bio</label>
                <textarea
                  name="bio"
                  rows="3"
                  value={profileFormik.values.bio}
                  onChange={profileFormik.handleChange}
                  onBlur={profileFormik.handleBlur}
                ></textarea>
              </div>
            </form>
          ) : (
            <div className="pf-info-grid">
              <div className="pf-info-item">
                <span className="pf-info-label">Full Name</span>
                <span className="pf-info-value">{profileFormik.values.name}</span>
              </div>
              <div className="pf-info-item">
                <span className="pf-info-label">Email Address</span>
                <span className="pf-info-value">{profileFormik.values.email}</span>
              </div>
              <div className="pf-info-item">
                <span className="pf-info-label">Phone Number</span>
                <span className="pf-info-value">
                  {profileFormik.values.phone
                    ? `+91 ${profileFormik.values.phone}`
                    : "—"}
                </span>
              </div>
              <div className="pf-info-item">
                <span className="pf-info-label">Department</span>
                <span className="pf-info-value">
                  {DEPARTMENT_LABELS[profileFormik.values.department] ||
                    profileFormik.values.department ||
                    "—"}
                </span>
              </div>
              <div className="pf-info-item">
                <span className="pf-info-label">Location</span>
                <span className="pf-info-value">{profileFormik.values.location}</span>
              </div>
              <div className="pf-info-item pf-info-item--full">
                <span className="pf-info-label">Bio</span>
                <span className="pf-info-value">{profileFormik.values.bio}</span>
              </div>
            </div>
          )}
        </div>

        <div className="pf-card">
          <h4 className="pf-card-title">Account Details</h4>
          <div className="pf-info-grid">
            <div className="pf-info-item">
              <span className="pf-info-label">User ID</span>
              <span className="pf-info-value pf-info-value--mono">
                USR-{String(profileData?._id || user?._id || user?.id || "").slice(-6) || "000000"}
              </span>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-label">Role</span>
              <span className="pf-info-value">
                {getRoleLabel(profileData?.role || user?.role)}
              </span>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-label">Status</span>
              <span className={`pf-info-value pf-status pf-status--${status}`}>
                {statusLabel}
              </span>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-label">Last Login</span>
              <span className="pf-info-value">
                {formatDateTime(profileData?.lastLogin || user?.lastLogin)}
              </span>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-label">Member Since</span>
              <span className="pf-info-value">
                {formatDate(profileData?.createdAt || user?.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {showNotificationPrefs && (
          <div className="pf-card">
            <h4 className="pf-card-title">Notification Preferences</h4>
            <div className="pf-prefs">
              <div className="pf-pref-row">
                <div className="pf-pref-info">
                  <span className="pf-pref-title">Email Notifications</span>
                  <span className="pf-pref-desc">
                    Receive alerts and updates via email
                  </span>
                </div>
                <label className="pf-toggle">
                  <input type="checkbox" defaultChecked />
                  <span className="pf-toggle-slider"></span>
                </label>
              </div>
              <div className="pf-pref-row">
                <div className="pf-pref-info">
                  <span className="pf-pref-title">SMS Alerts</span>
                  <span className="pf-pref-desc">Critical alerts via SMS</span>
                </div>
                <label className="pf-toggle">
                  <input type="checkbox" defaultChecked />
                  <span className="pf-toggle-slider"></span>
                </label>
              </div>
              <div className="pf-pref-row">
                <div className="pf-pref-info">
                  <span className="pf-pref-title">Maintenance Reminders</span>
                  <span className="pf-pref-desc">
                    Upcoming maintenance schedule notifications
                  </span>
                </div>
                <label className="pf-toggle">
                  <input type="checkbox" defaultChecked />
                  <span className="pf-toggle-slider"></span>
                </label>
              </div>
              <div className="pf-pref-row">
                <div className="pf-pref-info">
                  <span className="pf-pref-title">Weekly Reports</span>
                  <span className="pf-pref-desc">
                    Weekly system performance summary
                  </span>
                </div>
                <label className="pf-toggle">
                  <input type="checkbox" />
                  <span className="pf-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="pf-card">
          <h4 className="pf-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Change Password
          </h4>
          <form className="pf-password-form" onSubmit={passwordFormik.handleSubmit}>
            <div className="pf-pw-field">
              <label>Current Password</label>
              <div className="pf-input-wrap">
                <svg className="pf-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={showPasswords.currentPassword ? "text" : "password"}
                  name="currentPassword"
                  placeholder="Enter current password"
                  value={passwordFormik.values.currentPassword}
                  onChange={passwordFormik.handleChange}
                  onBlur={passwordFormik.handleBlur}
                  className={passwordFormik.touched.currentPassword && passwordFormik.errors.currentPassword ? "pf-input--error" : ""}
                />
                <button
                  type="button"
                  className="pf-eye-btn"
                  onClick={() => togglePasswordVisibility("currentPassword")}
                  tabIndex={-1}
                  title={showPasswords.currentPassword ? "Hide password" : "Show password"}
                >
                  {showPasswords.currentPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordFormik.touched.currentPassword && passwordFormik.errors.currentPassword && (
                <span className="pf-field-error">{passwordFormik.errors.currentPassword}</span>
              )}
            </div>
            <div className="pf-pw-field">
              <label>New Password</label>
              <div className="pf-input-wrap">
                <svg className="pf-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={showPasswords.newPassword ? "text" : "password"}
                  name="newPassword"
                  placeholder="Enter new password"
                  value={passwordFormik.values.newPassword}
                  onChange={passwordFormik.handleChange}
                  onBlur={passwordFormik.handleBlur}
                  className={passwordFormik.touched.newPassword && passwordFormik.errors.newPassword ? "pf-input--error" : ""}
                />
                <button
                  type="button"
                  className="pf-eye-btn"
                  onClick={() => togglePasswordVisibility("newPassword")}
                  tabIndex={-1}
                  title={showPasswords.newPassword ? "Hide password" : "Show password"}
                >
                  {showPasswords.newPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordFormik.touched.newPassword && passwordFormik.errors.newPassword && (
                <span className="pf-field-error">{passwordFormik.errors.newPassword}</span>
              )}
            </div>
            <div className="pf-pw-field">
              <label>Confirm New Password</label>
              <div className="pf-input-wrap">
                <svg className="pf-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  type={showPasswords.confirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Re-enter new password"
                  value={passwordFormik.values.confirmPassword}
                  onChange={passwordFormik.handleChange}
                  onBlur={passwordFormik.handleBlur}
                  className={passwordFormik.touched.confirmPassword && passwordFormik.errors.confirmPassword ? "pf-input--error" : ""}
                />
                <button
                  type="button"
                  className="pf-eye-btn"
                  onClick={() => togglePasswordVisibility("confirmPassword")}
                  tabIndex={-1}
                  title={showPasswords.confirmPassword ? "Hide password" : "Show password"}
                >
                  {showPasswords.confirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordFormik.touched.confirmPassword && passwordFormik.errors.confirmPassword && (
                <span className="pf-field-error">{passwordFormik.errors.confirmPassword}</span>
              )}
            </div>

            <div className="pf-password-requirements">
              <span className="pf-req-title">Password must include:</span>
              <div className="pf-req-list">
                <span className="pf-req-item">8-32 characters</span>
                <span className="pf-req-item">One uppercase letter</span>
                <span className="pf-req-item">One lowercase letter</span>
                <span className="pf-req-item">One number</span>
                <span className="pf-req-item">One special character</span>
              </div>
            </div>

            <div className="pf-security-actions">
              <button
                type="button"
                className="pf-btn pf-btn--ghost"
                onClick={cancelPasswordChange}
              >
                Clear
              </button>
              <button
                type="submit"
                className="pf-btn pf-btn--primary"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </>
  );
};

export default Profile;
