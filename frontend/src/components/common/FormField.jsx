import React, { useState } from "react";
import Dropdown from "./Dropdown";
import "./InputField.css";

/**
 * Helper to get nested value/error/touched from an object using dot notation
 * e.g., getIn(errors, "contact.phone") -> errors.contact.phone
 */
const getIn = (obj, path) => {
  if (!obj || !path) return undefined;
  const keys = Array.isArray(path) ? path : path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length; i++) {
    if (current === null || current === undefined) return undefined;
    current = current[keys[i]];
  }
  return current;
};

/**
 * Universal Reusable FormField Component for Formik & Standard React Forms.
 * Eliminates repetitive label, error message, touched checks, and input binding.
 */
const FormField = ({
  formik,
  name,
  label,
  type = "text",
  placeholder,
  required = false,
  disabled = false,
  options = [],
  rows = 3,
  className = "",
  wrapperClassName = "",
  icon,
  // Manual overrides (used if formik prop is not supplied)
  value: manualValue,
  onChange: manualOnChange,
  onBlur: manualOnBlur,
  error: manualError,
  touched: manualTouched,
  children,
  ...restProps
}) => {
  const [showPassword, setShowPassword] = useState(false);

  // Extract Formik state if formik prop is passed
  const isFormik = !!(formik && formik.values);
  const fieldValue = isFormik ? (getIn(formik.values, name) ?? "") : (manualValue ?? "");
  const fieldError = isFormik ? getIn(formik.errors, name) : manualError;
  const fieldTouched = isFormik ? getIn(formik.touched, name) : manualTouched;

  const showError = Boolean(fieldTouched && fieldError);

  const handleChange = (e) => {
    if (isFormik && formik.handleChange) {
      formik.handleChange(e);
    }
    if (manualOnChange) {
      manualOnChange(e);
    }
  };

  const handleBlur = (e) => {
    if (isFormik && formik.handleBlur) {
      formik.handleBlur(e);
    }
    if (manualOnBlur) {
      manualOnBlur(e);
    }
  };

  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  const renderInput = () => {
    if (type === "select") {
      const formattedOptions = options.map((opt) =>
        typeof opt === "object"
          ? { value: opt.value, label: opt.label }
          : { value: opt, label: opt }
      );
      return (
        <Dropdown
          value={fieldValue}
          onChange={(val) => {
            if (isFormik && formik.setFieldValue) {
              formik.setFieldValue(name, val);
            }
            if (manualOnChange) {
              manualOnChange({ target: { name, value: val } });
            }
          }}
          options={formattedOptions}
          placeholder={placeholder || "Select"}
          disabled={disabled}
          variant="form"
          className={className}
        />
      );
    }

    if (type === "textarea") {
      return (
        <textarea
          id={name}
          name={name}
          rows={rows}
          value={fieldValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={`common-textarea ${showError ? "input-error" : ""} ${className}`}
          {...restProps}
        />
      );
    }

    return (
      <div className="common-input-wrapper">
        {icon && <span className="common-input-icon">{icon}</span>}
        <input
          id={name}
          name={name}
          type={inputType}
          value={fieldValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={`${showError ? "input-error" : ""} ${className}`}
          {...restProps}
        />
        {isPassword && (
          <button
            type="button"
            className="common-toggle-password"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`common-form-group ${wrapperClassName} ${showError ? "has-error" : ""}`}>
      {label && (
        <label htmlFor={name}>
          {label}
          {required && <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>}
        </label>
      )}
      {renderInput()}
      {showError && (
        <span className="field-error-message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginRight: "4px" }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {fieldError}
        </span>
      )}
    </div>
  );
};

export default React.memo(FormField);
