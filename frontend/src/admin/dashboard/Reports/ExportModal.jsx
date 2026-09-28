import React, { useState, useEffect, useMemo } from "react";

/* ──────────────────────────────────────────────────────────────
   ExportModal – Reusable export modal matching the website theme.
   
   Props:
     open        – boolean, whether the modal is visible
     onClose     – function to close the modal
     onConfirm   – function(limit, format) called on confirm
     totalCount  – number of total available records
     format      – "pdf" | "excel" (pre-selected)
     title       – string, report title shown in modal
     loading     – boolean, export in progress
   ────────────────────────────────────────────────────────────── */

const PRESETS = [
  { label: "10", value: 10 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "500", value: 500 },
  { label: "1K", value: 1000 },
  { label: "All", value: Infinity },
];

export default function ExportModal({
  open,
  onClose,
  onConfirm,
  totalCount = 0,
  format: initialFormat = "pdf",
  title = "Report",
  loading = false,
}) {
  const [selectedFormat, setSelectedFormat] = useState(initialFormat);
  const [limit, setLimit] = useState(10);
  const [activePreset, setActivePreset] = useState(null);
  const [inputValue, setInputValue] = useState("10");

  useEffect(() => {
    if (open) {
      setSelectedFormat(initialFormat);
      const defaultLimit = Math.min(10, totalCount);
      setLimit(defaultLimit);
      setInputValue(String(defaultLimit));
      setActivePreset(null);
    }
  }, [open, initialFormat, totalCount]);

  const effectiveLimit = useMemo(() => {
    return limit === Infinity ? totalCount : Math.min(limit, totalCount);
  }, [limit, totalCount]);

  const percentage = useMemo(() => {
    if (totalCount === 0) return 0;
    return Math.round((effectiveLimit / totalCount) * 100);
  }, [effectiveLimit, totalCount]);

  const handlePresetClick = (value) => {
    const actual = value === Infinity ? totalCount : value;
    if (actual > totalCount) return;
    setLimit(value);
    setActivePreset(value);
    setInputValue(value === Infinity ? String(totalCount) : String(value));
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputValue(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1) {
      const clamped = Math.min(num, totalCount);
      setLimit(clamped);
      const matchingPreset = PRESETS.find((p) => p.value === clamped);
      setActivePreset(matchingPreset ? matchingPreset.value : null);
    }
  };

  const handleInputBlur = () => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < 1) {
      const reset = Math.min(10, totalCount);
      setLimit(reset);
      setInputValue(String(reset));
    }
  };

  if (!open) return null;

  return (
    <div className="ss-overlay" style={{ zIndex: 1100 }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 25px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
          animation: "em-slideUp 0.35s cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f2027 0%, #2c5364 100%)",
            padding: "24px 24px 20px",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* Decorative circle */}
          <div style={{ position: "absolute", top: -40, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,184,28,0.08)" }} />
          <div style={{ position: "absolute", bottom: -25, right: 50, width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12,
                background: "rgba(255,184,28,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb81c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: -0.3, whiteSpace: "nowrap" }}>Export {title}</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                  {totalCount.toLocaleString("en-IN")} records available
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none", borderRadius: 8, width: 32, height: 32,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "background 0.2s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

          {/* Format Selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 10 }}>
              File Format
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <FormatCard
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selectedFormat === "pdf" ? "#ef4444" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                }
                label="PDF"
                subtitle="Printable"
                active={selectedFormat === "pdf"}
                accentColor="#ef4444"
                onClick={() => setSelectedFormat("pdf")}
              />
              <FormatCard
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selectedFormat === "excel" ? "#10b981" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                }
                label="Excel"
                subtitle="Spreadsheet"
                active={selectedFormat === "excel"}
                accentColor="#10b981"
                onClick={() => setSelectedFormat("excel")}
              />
            </div>
          </div>

          {/* Records Selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 10 }}>
              Records to Download
            </label>
            
            {/* Preset Buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {PRESETS.map((p) => {
                const actualValue = p.value === Infinity ? totalCount : p.value;
                const disabled = actualValue > totalCount;
                const isActive = activePreset === p.value;
                return (
                  <button
                    key={p.label}
                    disabled={disabled}
                    onClick={() => handlePresetClick(p.value)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1.5px solid ${isActive ? "#2c5364" : "#e2e8f0"}`,
                      background: isActive ? "rgba(44,83,100,0.08)" : "#fff",
                      color: disabled ? "#cbd5e1" : isActive ? "#2c5364" : "#475569",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: disabled ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      fontFamily: "inherit",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Input */}
            <div style={{ position: "relative" }}>
              <input
                type="number"
                min={1}
                max={totalCount}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                style={{
                  width: "100%",
                  padding: "10px 14px 10px 40px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1e293b",
                  outline: "none",
                  transition: "border-color 0.2s",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  MozAppearance: "textfield",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#2c5364")}
                onBlurCapture={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>

            {/* Progress Bar */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {effectiveLimit.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} records
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2c5364" }}>
                  {percentage}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${percentage}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #2c5364, #ffb81c)",
                    transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div style={{
            background: "#f8fafc",
            borderRadius: 10,
            padding: "12px 14px",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: selectedFormat === "pdf" ? "#fef2f2" : "#ecfdf5",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {selectedFormat === "pdf" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
                )}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#334155" }}>
                  {title} — {selectedFormat.toUpperCase()}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
                  {effectiveLimit.toLocaleString("en-IN")} {effectiveLimit === 1 ? "record" : "records"} will be exported
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "14px 24px 20px",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#334155"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(effectiveLimit, selectedFormat)}
            disabled={loading || effectiveLimit === 0}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: loading
                ? "#94a3b8"
                : "linear-gradient(135deg, #0f2027 0%, #2c5364 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.15s",
              boxShadow: loading ? "none" : "0 2px 8px rgba(44,83,100,0.3)",
              fontFamily: "inherit",
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "em-spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download {effectiveLimit.toLocaleString("en-IN")} Record{effectiveLimit === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes em-slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes em-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ── Format Card Sub-Component ── */
function FormatCard({ icon, label, subtitle, active, accentColor, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "14px 12px",
        borderRadius: 12,
        border: `1.5px solid ${active ? accentColor : "#e2e8f0"}`,
        background: active ? `${accentColor}08` : "#fff",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: active ? `${accentColor}15` : "#f8fafc",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
      }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: active ? accentColor : "#475569" }}>{label}</p>
        <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>{subtitle}</p>
      </div>
      {active && (
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: accentColor,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
      )}
    </button>
  );
}
