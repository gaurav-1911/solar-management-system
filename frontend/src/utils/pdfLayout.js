// Shared jsPDF layout — the "profile card with sections" format used across
// every admin page (same as the Lead page).

// jsPDF's built-in fonts are WinAnsi-encoded and cannot render the ₹ glyph
// (U+20B9), so PDFs always format money with an ASCII-safe "Rs." prefix.
export const formatCurrencyPdf = (val) => {
  const num = Number(String(val ?? 0).replace(/[₹,]/g, ""));
  return isNaN(num) ? String(val ?? "") : `Rs. ${num.toLocaleString("en-IN")}`;
};

/**
 * Build a profile-card style PDF document (A4 portrait).
 *
 * options:
 *   bannerName     — large white text in the teal banner
 *   bannerSubtitle — smaller line under the name (e.g. "ID: ABC-001")
 *   bannerRight    — strings right-aligned in the banner (first is bold)
 *   sections       — [{ title, fields: [[label, value], ...] }]
 *   notes          — optional free-text block
 *
 * Returns the finished jsPDF document; the caller saves it.
 */
export const createProfilePdf = async (options = {}) => {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  const C = {
    banner: "#0f766e",
    accent: "#0f766e",
    label: "#6b7280",
    value: "#111827",
    divider: "#e5e7eb",
    muted: "#9ca3af",
    white: "#ffffff",
  };

  // A4 portrait (jsPDF default) — 210 x 297 mm
  const MARGIN = 20;
  const PAGE_W = 210;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const COL_W = (CONTENT_W - 18) / 2;
  const COL_X = [MARGIN, MARGIN + COL_W + 18];
  const BOTTOM_LIMIT = 258; // keep content above the pinned footer

  let y = 20;

  const ensureSpace = (needed = 14) => {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = 30;
    }
  };

  // ── Summary banner ──
  doc.setFillColor(C.banner);
  doc.roundedRect(MARGIN, y, CONTENT_W, 30, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(C.white);
  doc.text(options.bannerName || "—", MARGIN + 10, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (options.bannerSubtitle) {
    doc.text(options.bannerSubtitle, MARGIN + 10, y + 22);
  }
  (options.bannerRight || []).forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 10 : 9);
    doc.text(String(line), PAGE_W - MARGIN - 10, y + 14 + i * 8, {
      align: "right",
    });
  });
  y += 42;

  // ── Sections ──
  const renderSection = (title, fields) => {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C.accent);
    doc.text(String(title).toUpperCase(), MARGIN, y);
    doc.setDrawColor(C.divider);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 8;

    for (let i = 0; i < fields.length; i += 2) {
      const pair = [fields[i], fields[i + 1] || null];
      const wrapped = pair.map((f) =>
        f ? doc.splitTextToSize(String(f[1] ?? "").trim() || "—", COL_W) : []
      );
      const maxLines = Math.max(
        wrapped[0].length,
        wrapped[1] ? wrapped[1].length : 0
      );
      const rowH = Math.max(12.5, 6 + maxLines * 4.5);

      ensureSpace(rowH);

      pair.forEach((f, ci) => {
        if (!f) return;
        const x = COL_X[ci];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(C.label);
        doc.text(String(f[0]).toUpperCase(), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(C.value);
        doc.text(wrapped[ci], x, y + 4.8);
      });

      y += rowH;
    }
    y += 6;
  };

  (options.sections || []).forEach((s) => renderSection(s.title, s.fields));

  // ── Notes ──
  if (options.notes) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C.accent);
    doc.text("NOTES", MARGIN, y);
    doc.setDrawColor(C.divider);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 8;
    const notes = doc.splitTextToSize(
      String(options.notes).trim() || "—",
      CONTENT_W
    );
    if (y + notes.length * 5.2 > BOTTOM_LIMIT) {
      doc.addPage();
      y = 30;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(C.value);
    doc.text(notes, MARGIN, y);
  }

  // ── Footer (pinned to bottom) ──
  doc.setDrawColor(C.divider);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 272, PAGE_W - MARGIN, 272);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(C.muted);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, MARGIN, 280);

  return doc;
};

