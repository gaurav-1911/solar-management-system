import React from "react";
import "./Button.css";

const Button = ({
  children,
  type = "button",
  onClick,
  disabled = false,
  loading = false,
  fullWidth = false,
  variant = "primary",
  className = "",
}) => {
  const classes = [
    "common-btn",
    `common-btn-${variant}`,
    fullWidth ? "common-btn-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className="common-spinner"></span> : children}
    </button>
  );
};

export default React.memo(Button);
