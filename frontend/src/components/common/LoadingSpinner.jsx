import React from "react";
import "./LoadingSpinner.css";

/**
 * Reusable LoadingSpinner Component
 * 
 * Provides an accessible, lightweight SVG spinner with customizable size and color.
 * 
 * @param {Object} props
 * @param {string} [props.size="md"] Size preset: 'xs' | 'sm' | 'md' | 'lg'
 * @param {string} [props.variant="primary"] Color theme: 'primary' | 'blue' | 'white' | 'neutral'
 * @param {string} [props.text] Optional accompanying loading label
 * @param {boolean} [props.inline=false] Display as inline element instead of centered block
 * @param {string} [props.className=""] Additional CSS classes
 */
const LoadingSpinner = ({
  size = "md",
  variant = "primary",
  text,
  inline = false,
  className = "",
}) => {
  const content = (
    <div
      className={`spinner-wrapper spinner-wrapper--${size} spinner-wrapper--${variant} ${inline ? "spinner-wrapper--inline" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <svg
        className="spinner-svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          className="spinner-track"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="spinner-arc"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          fill="currentColor"
        />
      </svg>
      {text && <span className="spinner-text">{text}</span>}
      <span className="sr-only">Loading...</span>
    </div>
  );

  return inline ? content : <div className="spinner-container">{content}</div>;
};

export default LoadingSpinner;
