import React from "react";
import "./SearchBar.css";

/**
 * Reusable SearchBar Component
 * 
 * Provides a controlled, accessible search input with an integrated search icon
 * and a one-click clear button.
 * 
 * @param {Object} props
 * @param {string} props.value Current search query
 * @param {Function} props.onChange Callback invoked with new string value
 * @param {string} [props.placeholder="Search..."] Input placeholder text
 * @param {Function} [props.onClear] Optional custom clear callback
 * @param {string} [props.className=""] Additional wrapper class names
 * @param {string} [props.inputClassName=""] Additional input class names
 * @param {boolean} [props.disabled=false] Disabled state
 * @param {boolean} [props.autoFocus=false] Auto focus state
 * @param {string} [props.id] HTML ID attribute
 */
const SearchBar = ({
  value = "",
  onChange,
  placeholder = "Search...",
  onClear,
  className = "",
  inputClassName = "",
  disabled = false,
  autoFocus = false,
  id,
}) => {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange("");
    }
  };

  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  return (
    <div className={`search-bar ${className}`.trim()}>
      <span className="search-bar-icon" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        id={id}
        type="text"
        className={`search-bar-input ${inputClassName}`.trim()}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={placeholder}
      />

      {value && !disabled && (
        <button
          type="button"
          className="search-bar-clear"
          onClick={handleClear}
          aria-label="Clear search query"
          title="Clear search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default SearchBar;
