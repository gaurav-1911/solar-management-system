import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import VirtualList from "./VirtualList";
import "./Dropdown.css";

const Dropdown = ({
  value = "all",
  options = [],
  onChange,
  placeholder = "Select",
  label,
  disabled = false,
  variant = "filter",
  size = "md",
  className = "",
  prefixIcon,
  emptyMessage,
  searchable,
  searchPlaceholder = "Search...",
  multiple = false,
  renderOption,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Automatically show search bar for all dropdowns with > 1 option unless searchable is explicitly set to false
  const isSearchable =
    searchable === false
      ? false
      : (options || []).length > 1;

  const isInline = variant === "inline";
  const isPage = variant === "page";
  const isForm = variant === "form";

  const selected = multiple
    ? options.filter((o) => (Array.isArray(value) ? value.includes(o.value) : false))
    : options.find((o) => o.value === value);
  const displayLabel = multiple
    ? selected.length
      ? selected.length === 1
        ? selected[0].label
        : `${selected.length} selected`
      : placeholder
    : selected
    ? selected.label
    : placeholder;

  // Default option body — name + optional leading icon. Modules can override
  // via renderOption to show extra info (price, stock, etc.).
  const renderDefaultOption = (opt) => (
    <>
      {opt.icon && <span className="cdropdown-item-icon">{opt.icon}</span>}
      <span>{opt.label}</span>
    </>
  );
  // const optionBody = renderOption || renderDefaultOption;

  const close = useCallback(() => {
    setIsOpen(false);
    setMenuPos(null);
    setSearchTerm("");
  }, []);

  const handleClickOutside = useCallback((e) => {
    if (!isOpen) return;
    const inWrapper = wrapperRef.current && wrapperRef.current.contains(e.target);
    const inMenu = menuRef.current && menuRef.current.contains(e.target);
    if (!inWrapper && !inMenu) {
      close();
    }
  }, [isOpen, close]);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // Close menu on outer scroll / resize to prevent stale positioning
  // Ignore scrolls that originate from inside the dropdown menu itself
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = (e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [isOpen, close]);

  // Auto-scroll active item into view when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const activeEl = menuRef.current.querySelector(".cdropdown-item-active");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    let opts = options || [];
    if (isSearchable && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      opts = opts.filter((opt) => String(opt.label || opt.value || "").toLowerCase().includes(term));
    }
    const unique = [];
    const seen = new Set();
    for (const opt of opts) {
      const key = `${opt.value}-${opt.label}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(opt);
      }
    }
    return unique;
  }, [options, isSearchable, searchTerm]);

  const handleToggle = () => {
    if (disabled) return;
    if (isOpen) {
      close();
    } else {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = isPage || (spaceBelow < 180 && spaceAbove > spaceBelow);

        const pos = {};

        if (isForm) {
          pos.left = rect.left;
          pos.width = rect.width;
          pos.transform = "none";
        } else if (isInline || isPage) {
          pos.left = rect.left + rect.width / 2;
          pos.transform = "translateX(-50%)";
          pos.minWidth = isPage ? 90 : 130;
        } else {
          // Filter / Standard / Default
          const minWidth = Math.max(rect.width, 220);
          let left = rect.left;
          if (left + minWidth > window.innerWidth - 16) {
            left = Math.max(16, window.innerWidth - minWidth - 16);
          }
          pos.left = left;
          pos.minWidth = minWidth;
          pos.maxWidth = Math.min(360, window.innerWidth - 32);
          pos.transform = "none";
        }

        if (openUpward) {
          pos.bottom = window.innerHeight - rect.top + 6;
          pos.maxHeight = Math.min(280, Math.max(120, spaceAbove - 16));
        } else {
          pos.top = rect.bottom + 6;
          pos.maxHeight = Math.min(280, Math.max(120, spaceBelow - 16));
        }

        setMenuPos(pos);
      }
      setIsOpen(true);
    }
  };

  const handleSelect = (val) => {
    if (multiple) {
      const cur = Array.isArray(value) ? value : [];
      const next = cur.includes(val)
        ? cur.filter((v) => v !== val)
        : [...cur, val];
      onChange(next);
    } else {
      onChange(val);
      close();
    }
  };

  const isSelected = (val) =>
    multiple ? (Array.isArray(value) && value.includes(val)) || false : value === val;

  const getStatusClass = (val) => {
    if (!val) return "";
    const lower = String(val).toLowerCase();
    if (["new", "pending"].includes(lower)) return "ls-pending";
    if (["contacted", "in progress", "in-progress"].includes(lower)) return "ls-contact";
    if (["interested"].includes(lower)) return "ls-interested";
    if (["completed", "converted", "active", "approved"].includes(lower)) return "ls-completed";
    if (["lost", "inactive", "rejected"].includes(lower)) return "ls-lost";
    return "";
  };

  const classes = [
    "cdropdown",
    `cdropdown-${variant}`,
    `cdropdown-${size}`,
    isOpen ? "cdropdown-open" : "",
    disabled ? "cdropdown-disabled" : "",
    isInline ? getStatusClass(value) : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const portalClass = isInline
    ? "cdropdown-menu-inline-portal"
    : isForm
    ? "cdropdown-menu-form-portal"
    : isPage
    ? "cdropdown-menu-page-portal"
    : "cdropdown-menu-filter-portal";

  return (
    <div className={classes} ref={wrapperRef}>
      {label && <label className="cdropdown-label">{label}</label>}
      <button
        ref={triggerRef}
        className="cdropdown-trigger"
        onClick={handleToggle}
        disabled={disabled}
        type="button"
      >
        {prefixIcon && <span className="cdropdown-icon">{prefixIcon}</span>}
        <span className="cdropdown-text">{displayLabel}</span>
        <svg
          className={`cdropdown-chevron ${isOpen ? "cdropdown-chevron-open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && menuPos && createPortal(
        <div
          className={`cdropdown-menu cdropdown-menu-portal ${portalClass}`}
          ref={menuRef}
          style={{
            position: "fixed",
            left: menuPos.left,
            transform: menuPos.transform,
            width: menuPos.width || "auto",
            minWidth: menuPos.minWidth,
            maxWidth: menuPos.maxWidth,
            maxHeight: menuPos.maxHeight,
            ...(menuPos.bottom !== undefined
              ? { bottom: menuPos.bottom, top: "auto" }
              : { top: menuPos.top, bottom: "auto" }),
          }}
        >
          {isSearchable && (
            <div className="cdropdown-search-wrap">
              <div className="cdropdown-search-box">
                <svg className="cdropdown-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="cdropdown-search-input"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="cdropdown-search-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchTerm("");
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={`cdropdown-list-container ${filteredOptions.length > 15 ? "has-virtual-list" : ""}`}>
            {filteredOptions.length === 0 ? (
              <div className="cdropdown-empty">{emptyMessage || "No matching options"}</div>
            ) : filteredOptions.length > 15 ? (
              <VirtualList
                items={filteredOptions}
                itemHeight={renderOption ? 54 : 38}
                height={Math.min(isSearchable ? 200 : 240, filteredOptions.length * (renderOption ? 54 : 38))}
                renderItem={(opt, idx) => (
                  <button
                    key={`${opt.value}-${idx}`}
                    className={`cdropdown-item ${isSelected(opt.value) ? "cdropdown-item-active" : ""}`}
                    onClick={() => handleSelect(opt.value)}
                    type="button"
                  >
                    {multiple && (
                      <span className={`cdropdown-check ${isSelected(opt.value) ? "checked" : ""}`}>
                        {isSelected(opt.value) && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    )}
                    {opt.icon && <span className="cdropdown-item-icon">{opt.icon}</span>}
                    <span>{opt.label}</span>
                  </button>
                )}
              />
            ) : (
              filteredOptions.map((opt, idx) => (
                <button
                  key={`${opt.value}-${idx}`}
                  className={`cdropdown-item ${isSelected(opt.value) ? "cdropdown-item-active" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                  type="button"
                >
                  {multiple && (
                    <span className={`cdropdown-check ${isSelected(opt.value) ? "checked" : ""}`}>
                      {isSelected(opt.value) && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  )}
                  {opt.icon && <span className="cdropdown-item-icon">{opt.icon}</span>}
                  <span>{opt.label}</span>
                </button>
              ))
            )}
          </div>
          {multiple && Array.isArray(value) && value.length > 0 && (
            <div className="cdropdown-menu-footer">
              <button
                type="button"
                className="cdropdown-clear-btn"
                onClick={() => onChange([])}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default React.memo(Dropdown);
