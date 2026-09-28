// jsPDF, jspdf-autotable and xlsx are heavy (hundreds of KB each) and only
// needed when the user actually exports a report — load them on demand so the
// initial bundle and the Dashboard route chunk stay small. The module loader
// caches them after the first use, so repeated exports are instant.
export async function exportPDF({ title, stats, columns, rows, filename, toastCb }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const dateStr = `Generated on: ${new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  doc.text(dateStr, 14, 27);

  const cardStartY = 33;
  const cardH = 16;
  const cardGap = 6;
  let cardX = 14;
  stats.forEach((st) => {
    const valStr = String(st.value);
    const labelStr = st.label;
    const valW = doc.getTextWidth(valStr);
    const labelW = doc.getTextWidth(labelStr);
    const cardW = Math.max(valW, labelW) + 20;

    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(cardX, cardStartY, cardW, cardH, 2, 2, "FD");

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(valStr, cardX + cardW / 2, cardStartY + 8, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(labelStr, cardX + cardW / 2, cardStartY + 13, { align: "center" });

    cardX += cardW + cardGap;
  });

  const tableStartY = cardStartY + cardH + 8;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, tableStartY - 2, pageW - 14, tableStartY - 2);

  autoTable(doc, {
    startY: tableStartY,
    head: [columns],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [44, 83, 100],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [50, 50, 50],
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250],
    },
    styles: {
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`${title} - Page ${data.pageNumber}`, 14, doc.internal.pageSize.getHeight() - 8);
    },
  });

  doc.save(`${filename}.pdf`);
  if (toastCb) toastCb();
}

export async function exportExcel({ title, stats, columns, rows, filename, toastCb }) {
  const XLSX = await import("xlsx");
  const wsData = [];

  wsData.push([title]);
  wsData.push([`Generated on: ${new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`]);
  wsData.push([]);

  wsData.push(["Summary"]);
  wsData.push(stats.map((st) => st.label));
  wsData.push(stats.map((st) => st.value));
  wsData.push([]);

  wsData.push(columns);
  rows.forEach((row) => wsData.push(row));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = columns.map(() => ({ wch: 22 }));

  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);

  if (toastCb) toastCb();
}

export async function exportSingleRowPDF({ title, id, fields, filename, toastCb }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${title} - ${id}`, 14, 20);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`, 14, 28);

  doc.setDrawColor(200, 200, 200);
  doc.line(14, 32, pageW - 14, 32);

  let y = 40;
  doc.setFontSize(10);
  fields.forEach((f) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    const labelW = doc.getTextWidth(`${f.label}:  `);
    doc.text(`${f.label}:`, 14, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);
    doc.text(String(f.value), 14 + labelW, y);

    y += 8;
  });

  doc.save(`${filename}.pdf`);
  if (toastCb) toastCb();
}
