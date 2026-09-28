import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const fmt = (n) =>
  "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── Signature Canvas Component ──
const SignatureCanvas = ({ onSave }) => {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const lastPos = useRef(null);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e);
  }, []);

  const draw = useCallback((e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }, [drawing]);

  const stopDraw = useCallback(() => {
    setDrawing(false);
  }, []);

  const clear = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onSave(null);
  };

  const save = () => {
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const ctx = canvasRef.current.getContext("2d");
    const pixels = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height).data;
    const hasContent = pixels.some((p) => p !== 0);
    if (!hasContent) {
      onSave(null);
      return;
    }
    onSave(dataUrl);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
        Draw your signature below *
      </label>
      <div style={{ border: "2px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          style={{ width: "100%", height: 150, cursor: "crosshair", display: "block", touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={clear} style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#6b7280" }}>
          Clear
        </button>
        <button type="button" onClick={save} style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff" }}>
          Confirm Signature
        </button>
      </div>
    </div>
  );
};

// ── Global Styles (injected once) ──
const GlobalStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; overflow-x: hidden; height: 100%; }
    body { overflow-y: auto; -webkit-overflow-scrolling: touch; }
    #root { min-height: 100vh; height: 100%; overflow-y: auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `}</style>
);

// ── Main Component ──
const QuotationResponse = () => {
  const { quotationId } = useParams();
  const [searchParams] = useSearchParams();
  const initialAction = searchParams.get("action");

  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAction, setSubmittedAction] = useState("");

  const [action, setAction] = useState(
    initialAction === "approve" ? "Approved" :
    initialAction === "reject" ? "Rejected" :
    initialAction === "negotiate" ? "Negotiating" : ""
  );
  const [signature, setSignature] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        const res = await axios.get(`${API_BASE}/public/quotations/${quotationId}`);
        if (res.data?.success) {
          setQuotation(res.data.data);
          if (res.data.data.customerResponse?.action) {
            setSubmitted(true);
            setSubmittedAction(res.data.data.customerResponse.action);
          }
        } else {
          setError(res.data?.message || "Quotation not found.");
        }
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load quotation.");
      } finally {
        setLoading(false);
      }
    };
    fetchQuotation();
  }, [quotationId]);

  const handleSubmit = async () => {
    if (!action) return;
    setSubmitting(true);
    setError("");
    try {
      const body = { action };
      if (action === "Approved") body.signature = signature;
      if (action === "Rejected" || action === "Negotiating") body.reason = reason;

      const res = await axios.post(`${API_BASE}/public/quotations/${quotationId}/respond`, body);
      if (res.data?.success) {
        setSubmitted(true);
        setSubmittedAction(action);
      } else {
        setError(res.data?.message || "Failed to submit response.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPendingRequested = (quotation?.requestedItems || []).some(r => r.status === "Pending");
  const isRemainingProducts = quotation?.type === "Remaining Products";

  const canSubmit =
    action &&
    !submitting &&
    !(action === "Approved" && !signature) &&
    !(action === "Rejected" && !reason.trim()) &&
    !(action === "Negotiating" && !reason.trim());

  // ── Loading State ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "'Segoe UI', Roboto, sans-serif" }}>
        <GlobalStyles />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#2c5364", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading quotation...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error && !quotation) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "'Segoe UI', Roboto, sans-serif" }}>
        <GlobalStyles />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 40, maxWidth: 440, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#9888;&#65039;</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#1a2332" }}>Error</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Already Responded ──
  if (submitted) {
    const colors = { Approved: "#16a34a", Rejected: "#dc2626", Negotiating: "#ca8a04" };
    const icons = { Approved: "\u2705", Rejected: "\u274C", Negotiating: "\uD83D\uDCAC" };
    const msgs = {
      Approved: "You have approved this quotation. The team has been notified.",
      Rejected: "You have rejected this quotation. The team has been notified.",
      Negotiating: "Your negotiation feedback has been submitted. The team will review and respond."
    };
    return (
      <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "'Segoe UI', Roboto, sans-serif" }}>
        <GlobalStyles />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 40, maxWidth: 440, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{icons[submittedAction] || "\u2705"}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: colors[submittedAction] || "#1a2332" }}>
              {submittedAction}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{msgs[submittedAction]}</p>
          </div>
        </div>
      </div>
    );
  }

  // Build items array
  const items = quotation?.items
    ? (quotation.items instanceof Map
        ? Array.from(quotation.items.entries())
        : Object.entries(quotation.items))
    : [];

  return (
    <div style={{ minHeight: "100vh", height: "100%", background: "#f3f4f6", fontFamily: "'Segoe UI', Roboto, sans-serif", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <GlobalStyles />
      <div style={{ padding: "24px 16px 40px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #2c5364, #2563eb)", borderRadius: "12px 12px 0 0", padding: "28px 32px", textAlign: "center" }}>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>Quotation {quotation?.quotationId}</h1>
            {quotation?.projectName && <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.85)", fontSize: 14 }}>{quotation.projectName}</p>}
          </div>

          {/* Card Body */}
          <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "28px 32px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
              Dear <strong>{quotation?.client}</strong>, please review the quotation below and take action.
            </p>

            {/* Items Table */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "left" }}>#</th>
                    <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "left" }}>Item</th>
                    <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(([key, item], idx) => {
                    const label = item.label || key;
                    const qty = item.qty || 0;
                    const price = Number(item.price || 0);
                    return (
                      <tr key={key}>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151" }}>{idx + 1}</td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#1a2332", fontWeight: 600 }}>{label}</td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151", textAlign: "center" }}>{qty}</td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151", textAlign: "right" }}>{fmt(price)}</td>
                        <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#1a2332", fontWeight: 600, textAlign: "right" }}>{fmt(qty * price)}</td>
                      </tr>
                    );
                  })}
                  {(quotation?.requestedItems || []).map((reqItem, idx) => (
                    <tr key={`req-${idx}`} style={{ background: reqItem.status === "Pending" ? "#fffbeb" : reqItem.status === "Approved" ? "#f0fdf4" : "#fef2f2" }}>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151" }}>{items.length + idx + 1}</td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#1a2332", fontWeight: 600 }}>
                        {reqItem.label || reqItem.productName}
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: reqItem.status === "Pending" ? "#fef3c7" : reqItem.status === "Approved" ? "#d1fae5" : "#fee2e2", color: reqItem.status === "Pending" ? "#92400e" : reqItem.status === "Approved" ? "#065f46" : "#991b1b" }}>{reqItem.status || "Requested"}</span>
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151", textAlign: "center" }}>{reqItem.qty}</td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#374151", textAlign: "right" }}>{fmt(reqItem.price)}</td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", fontSize: 13, color: "#1a2332", fontWeight: 600, textAlign: "right" }}>{fmt(reqItem.qty * reqItem.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ textAlign: "right", marginBottom: 24 }}>
              <p style={{ margin: "2px 0", fontSize: 13, color: "#6b7280" }}>Subtotal: {fmt(quotation?.total)}</p>
              <p style={{ margin: "2px 0", fontSize: 13, color: "#6b7280" }}>GST: {fmt(quotation?.gst)}</p>
              <p style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 700, color: "#1a2332" }}>Grand Total: {fmt(quotation?.grandTotal)}</p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "0 0 24px" }} />

            {isRemainingProducts && (
              <div style={{ display: "inline-block", padding: "6px 14px", background: "#dbeafe", color: "#1e40af", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16, letterSpacing: 0.3 }}>
                Remaining Products for Billing
              </div>
            )}
            {hasPendingRequested && (
              <div style={{ display: "inline-block", marginLeft: 8, padding: "6px 14px", background: "#fef3c7", color: "#92400e", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16, letterSpacing: 0.3 }}>
                Includes {quotation.requestedItems.filter(r => r.status === "Pending").length} Additional Material Request(s)
              </div>
            )}

            {/* Action Selection */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                    { val: "Approved", label: "\u2705 Approve", bg: "#16a34a" },
                    { val: "Negotiating", label: "\uD83D\uDCAC Negotiate", bg: "#ca8a04" },
                    { val: "Rejected", label: "\u274C Reject", bg: "#dc2626" }
              ].map((btn) => (
                <button
                  key={btn.val}
                  type="button"
                  onClick={() => { setAction(btn.val); setSignature(null); setReason(""); }}
                  style={{
                    flex: 1, minWidth: 120, padding: "12px 16px", border: action === btn.val ? `2px solid ${btn.bg}` : "2px solid #e5e7eb",
                    borderRadius: 8, background: action === btn.val ? `${btn.bg}10` : "#fff",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", color: btn.bg, transition: "all 0.15s"
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Inline error */}
            {error && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626", marginBottom: 16 }}>
                {error}
              </div>
            )}

            {action === "Approved" && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <SignatureCanvas onSave={setSignature} />
                {signature && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>\u2713 Signature captured</p>}
                {!signature && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>Please draw your signature above to proceed</p>}
              </div>
            )}

            {/* Reject → Reason */}
            {action === "Rejected" && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Reason for rejection *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please provide a reason for rejecting this quotation..."
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#1a2332", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            )}

            {/* Negotiate → Reason */}
            {action === "Negotiating" && (
              <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Your feedback / counter-offer *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please share what you'd like to negotiate (pricing, items, timeline, etc.)..."
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#1a2332", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            )}

            {/* Submit Button */}
            {action && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  width: "100%", padding: "14px 20px", border: "none", borderRadius: 8,
                  background: action === "Approved" ? "#16a34a" : action === "Rejected" ? "#dc2626" : "#ca8a04",
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed",
                  opacity: canSubmit ? 1 : 0.5, transition: "opacity 0.15s"
                }}
              >
                {submitting ? "Submitting..." : `Submit ${action}`}
              </button>
            )}
          </div>

          {/* Footer */}
          <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 16 }}>
            Powered by Solar Management System
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuotationResponse;
