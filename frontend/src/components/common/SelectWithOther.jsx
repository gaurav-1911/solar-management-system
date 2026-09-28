import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "./SelectWithOther.css";
 
// A single typeable input (combobox): click the field and a dropdown of preset
// options appears; you can also just start typing — the text you type IS the
// value, so custom entries need no second input. The dropdown ends with a
// manual-entry hint (labeled via `manualLabel`, "Other" by default) that simply
// focuses the input for typing. No extra fields, no API changes.
// - value: current field value (string)
// - options: allowed preset values (strings)
// - manualLabel: label of the final "type it yourself" hint item
// - size: "md" for form fields, "sm" for compact table cells
// - numeric: if true, the input only accepts digits and one dot
// - maxLength: optional character cap on typed values (undefined = unlimited)
const SelectWithOther = ({ value = "", options = [], onChange, placeholder = "Select", size = "md", numeric = false, manualLabel = "Other", maxLength }) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
 
  const close = useCallback(() => {
    setOpen(false);
    setMenuPos(null);
  }, []);
 
  // Close when clicking outside the input or the (portal) menu
  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!open) return;
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inWrap && !inMenu) close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, close]);
 
  // Close on outer scroll/resize (menu is fixed-position) and on Escape
  useEffect(() => {
    if (!open) return;
    const onScroll = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
 
  const openMenu = () => {
    if (!inputRef.current) return;
    setFilter("");
    const rect = inputRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
 
    // Menu width: exactly the input width so the menu stays inside its own
    // column/cell and never spills over the neighbouring dropdown fields —
    // and never wider than the viewport.
    const menuWidth = Math.min(rect.width, vw - 16);
 
    // Keep the menu fully on-screen horizontally — no right/left overflow.
    const left = Math.max(8, Math.min(rect.left, vw - menuWidth - 8));
 
    const space = openUpward ? spaceAbove : spaceBelow;
    setMenuPos({
      left,
      width: menuWidth,
      top: openUpward ? "auto" : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : "auto",
      maxHeight: Math.min(280, Math.max(60, space - 16)),
    });
    setOpen(true);
  };
 
  const shownOptions = filter
    ? options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))
    : options;
 
  const handleInputChange = (e) => {
    let v = e.target.value;
    if (numeric && v !== "" && !/^\d*\.?\d*$/.test(v)) return;
    setFilter(v);
    onChange(v);
  };
 
  const handlePick = (opt) => {
    setFilter("");
    close();
    onChange(opt);
  };
 
  const handleManualClick = () => {
    close();
    setFilter("");
    inputRef.current?.focus();
  };
 
  return (
    <div className="swo-select-other" ref={wrapRef} onMouseDown={() => { if (!open) openMenu(); }}>
      <div className={`swo-combo ${size === "sm" ? "swo-combo-sm" : ""} ${open ? "swo-combo-open" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          className="swo-combo-input"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={maxLength}
        />
        <span
          className="swo-combo-chevron"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (open) close();
            else openMenu();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {open && menuPos && createPortal(
        <div
          className="swo-combo-menu"
          ref={menuRef}
          style={{
            position: "fixed",
            left: menuPos.left,
            width: menuPos.width,
            top: menuPos.top,
            bottom: menuPos.bottom,
            maxHeight: menuPos.maxHeight,
          }}
        >
          {shownOptions.length === 0 && <div className="swo-combo-empty">No matching options</div>}
          {shownOptions.map((opt) => (
            <button
              type="button"
              key={opt}
              className={`swo-combo-item ${value === opt ? "swo-combo-item-active" : ""}`}
              onClick={() => handlePick(opt)}
            >
              {opt}
            </button>
          ))}
          <button type="button" className="swo-combo-item swo-combo-manual" onClick={handleManualClick}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {manualLabel}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};
 
export default React.memo(SelectWithOther);
 
 