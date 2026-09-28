import React, { useState } from "react";
import "./InputField.css";

const InputField = ({
  label,
  type = "text",
  name,
  id,
  placeholder,
  value,
  onChange,
  onBlur,
  icon,
  required = false,
  className = "",
  error,
  touched,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  const showError = touched === true && !!error;

  return (
    <div className={`common-form-group ${className} ${showError ? "has-error" : ""}`}>
      {label && (
        <label htmlFor={id || name}>
          {label}
          {required && <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>}
        </label>
      )}
      <div className="common-input-wrapper">
        {icon && <span className="common-input-icon">{icon}</span>}
        <input
          id={id || name}
          name={name}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          className={showError ? "input-error" : ""}
        />
        {isPassword && (
          <button
            type="button"
            className="common-toggle-password"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" title="Hide password">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" title="Show password">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        )}
      </div>
      {showError && (
        <span className="field-error-message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </span>
      )}
    </div>
  );
};

export default React.memo(InputField);
