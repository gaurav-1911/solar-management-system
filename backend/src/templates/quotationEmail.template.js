/**
 * Generates the HTML email body for sending a quotation to a customer.
 * Includes Approve / Reject / Negotiate action buttons.
 * Theme matches the Welcome Email (green gradient, Poppins font).
 */
export const quotationEmailTemplate = (quotation, baseUrl) => {
    const qId = quotation.quotationId || "N/A";
    const client = quotation.client || "Valued Customer";
    const project = quotation.projectName || "";
    const total = Number(quotation.grandTotal || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });
    const validUntil = quotation.validUntil
        ? new Date(quotation.validUntil).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric"
          })
        : "N/A";
    const year = new Date().getFullYear();
    const version = quotation.version || 1;
    const requestedItems = quotation.requestedItems || [];
    const hasNewItems = requestedItems.some(r => r.status === "Pending");

    let itemRows = "";
    let itemIdx = 0;
    if (quotation.items && typeof quotation.items === "object") {
        const entries = quotation.items instanceof Map
            ? Array.from(quotation.items.entries())
            : Object.entries(quotation.items);
        entries.forEach(([key, item]) => {
            itemIdx++;
            const label = item.label || key;
            const qty = item.qty || 0;
            const price = Number(item.price || 0);
            const lineTotal = qty * price;
            itemRows += `
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${itemIdx}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${label}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:center;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${qty}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${price.toLocaleString("en-IN")}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${lineTotal.toLocaleString("en-IN")}</td>
              </tr>`;
        });
    }

    // Add requested (new) items with a highlighted NEW badge
    if (requestedItems.length > 0) {
        requestedItems.forEach((reqItem) => {
            itemIdx++;
            const label = reqItem.label || reqItem.productName || "New Item";
            const qty = reqItem.qty || 0;
            const price = Number(reqItem.price || 0);
            const lineTotal = qty * price;
            const statusBadge = reqItem.status === "Pending"
                ? "<span style=\"display:inline-block;margin-left:8px;padding:2px 8px;background:#fef3c7;color:#92400e;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;\">\ud83c\udd95 NEW</span>"
                : reqItem.status === "Approved"
                    ? "<span style=\"display:inline-block;margin-left:8px;padding:2px 8px;background:#dcfce7;color:#166534;border-radius:10px;font-size:10px;font-weight:700;\">\u2705 APPROVED</span>"
                    : "<span style=\"display:inline-block;margin-left:8px;padding:2px 8px;background:#fee2e2;color:#991b1b;border-radius:10px;font-size:10px;font-weight:700;\">\u274c REJECTED</span>";
            const rowBg = reqItem.status === "Pending" ? "background-color:#fffbeb;" : "";
            const labelColor = reqItem.status === "Pending" ? "color:#92400e;" : "color:#0f172a;";
            itemRows += `
              <tr style="${rowBg}">
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${itemIdx}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;${labelColor}font-weight:600;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${label}${statusBadge}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:center;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${qty}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${price.toLocaleString("en-IN")}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;${labelColor}font-weight:600;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${lineTotal.toLocaleString("en-IN")}</td>
              </tr>`;
        });
    }

    const approveUrl = `${baseUrl}/quotation/respond/${qId}?action=approve`;
    const rejectUrl = `${baseUrl}/quotation/respond/${qId}?action=reject`;
    const negotiateUrl = `${baseUrl}/quotation/respond/${qId}?action=negotiate`;

    return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Quotation – Solar Management System</title>

<!-- Google Fonts: Poppins -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">

<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; display: block; outline: none; }
  body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

  @media screen and (max-width: 620px) {
    .email-card { width: 100% !important; border-radius: 0 !important; }
    .header-cell { padding: 28px 20px 22px !important; border-radius: 0 !important; }
    .body-cell { padding: 28px 20px !important; }
    .footer-cell { padding: 24px 20px !important; border-radius: 0 !important; }
    .hero-title { font-size: 18px !important; }
    .btn-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    .items-table th, .items-table td { padding: 8px 8px !important; font-size: 11px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%!important;background-color:#f1f5f9;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<!-- Hidden Preview Text -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f1f5f9;">Your quotation from Solar Management System is ready for review.&#8203;&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>

<!-- Canvas Table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f1f5f9;margin:0;padding:0;table-layout:fixed;">
  <tr>
    <td align="center" valign="top" style="padding:40px 16px 60px;background-color:#f1f5f9;">

      <!-- ══════════════════════ MAIN EMAIL CARD ══════════════════════ -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-card"
        style="width:100%;max-width:540px;margin:0 auto;background-color:#ffffff;border-radius:16px;border:1px solid #cbd5e1;box-shadow:0 10px 25px -5px rgba(15,23,42,0.08), 0 8px 10px -6px rgba(15,23,42,0.04);border-collapse:separate;overflow:hidden;">

        <!-- ── BRAND HEADER BANNER (Green Gradient) ── -->
        <tr>
          <td class="header-cell" align="center"
            style="background:#0f4c3a;background:linear-gradient(135deg, #0a3a2d 0%, #0f4c3a 50%, #1a6b52 100%);padding:32px 40px;text-align:center;border-top-left-radius:15px;border-top-right-radius:15px;">

            <h1 style="margin:0 0 4px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;line-height:1.3;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              Solar Management System
            </h1>
            <p style="margin:0 0 12px;font-size:13px;color:rgba(255,255,255,0.85);font-weight:400;letter-spacing:0.2px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              Smart Solar Energy Platform
            </p>

            <!-- Quotation Title -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 0;">
              <tr>
                <td style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 20px;text-align:center;">
                  <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    📄 Quotation
                  </p>
                  ${project ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${project}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── MAIN BODY CONTENT ── -->
        <tr>
          <td class="body-cell" style="background-color:#ffffff;padding:36px 40px 20px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

            <!-- Greeting -->
            <h2 class="hero-title" style="margin:0 0 6px;color:#0f172a;font-size:22px;font-weight:700;line-height:1.35;text-align:center;letter-spacing:-0.3px;">
              Quotation for ${client} 📋
            </h2>

            ${version > 1 ? `<div style="text-align:center;margin:0 0 12px;"><span style=\"display:inline-block;padding:6px 16px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;\">\ud83d\uddc3\ufe0f Version ${version}</span></div>` : ""}

            <p style="margin:0 0 24px;color:#334155;font-size:14.5px;line-height:1.65;text-align:center;">
              Dear <strong style="color:#0f172a;font-weight:600;">${client}</strong>,<br>
              ${hasNewItems
                  ? 'Thank you! This quotation has been <strong style="color:#b45309;">updated with new products</strong>. Please review the highlighted items below.'
                  : 'Thank you for your interest! Please find the quotation details below.'}
              You can review the items and take action using the buttons at the bottom.
            </p>

            <!-- ── QUOTATION INFO BOX ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin:0 0 24px;">
              <tr>
                <td style="padding:18px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="top" style="width:28px;padding-right:10px;">
                        <span style="font-size:18px;line-height:1;">📄</span>
                      </td>
                      <td valign="top">
                        <p style="margin:0 0 10px;color:#14532d;font-size:13px;line-height:1.5;font-weight:600;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          Quotation Details
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                          <tr>
                            <td style="padding:4px 0;color:#475569;font-size:13px;line-height:1.5;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              <strong style="color:#052e16;">Version:</strong>
                            </td>
                            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              v${version}${hasNewItems ? ' <span style=\"display:inline-block;padding:1px 6px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:10px;font-weight:700;margin-left:4px;\">UPDATED</span>' : ''}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0;color:#475569;font-size:13px;line-height:1.5;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              <strong style="color:#052e16;">Valid Until:</strong>
                            </td>
                            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              ${validUntil}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- ── NEW ITEMS NOTICE ── -->
            ${hasNewItems ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="background-color:#fffbeb;border-radius:10px;border:1px solid #fbbf24;margin:0 0 20px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="top" style="width:28px;padding-right:10px;">
                        <span style="font-size:20px;line-height:1;">🆕</span>
                      </td>
                      <td valign="top">
                        <p style="margin:0 0 4px;color:#92400e;font-size:14px;font-weight:700;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          New Products Added (v${version})
                        </p>
                        <p style="margin:0;color:#78350f;font-size:12.5px;line-height:1.5;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          This version includes ${requestedItems.filter(r => r.status === "Pending").length} new product(s) requested during installation. They are highlighted in yellow below.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            ` : ""}

            <!-- ── ITEMS TABLE ── -->
            <table role="presentation" class="items-table" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 20px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">#</th>
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Item</th>
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:center;border-bottom:1px solid #e2e8f0;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Qty</th>
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right;border-bottom:1px solid #e2e8f0;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Price</th>
                  <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right;border-bottom:1px solid #e2e8f0;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;font-family:\'Poppins\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">No items</td></tr>'}
              </tbody>
            </table>

            <!-- ── TOTALS BOX ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="margin:0 0 24px;">
              <tr>
                <td align="right">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:3px 16px 3px 0;color:#64748b;font-size:13px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Subtotal:</td>
                      <td style="padding:3px 0;color:#475569;font-size:13px;font-weight:500;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${Number(quotation.total || 0).toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                      <td style="padding:3px 16px 3px 0;color:#64748b;font-size:13px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">GST:</td>
                      <td style="padding:3px 0;color:#475569;font-size:13px;font-weight:500;text-align:right;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">₹${Number(quotation.gst || 0).toLocaleString("en-IN")}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Grand Total Banner -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin:0 0 28px;">
              <tr>
                <td style="padding:16px 20px;text-align:center;">
                  <p style="margin:0 0 4px;color:#14532d;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    Grand Total
                  </p>
                  <p style="margin:0;color:#052e16;font-size:24px;font-weight:700;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    ${total}
                  </p>
                </td>
              </tr>
            </table>

            <!-- ── ACTION PROMPT ── -->
            <p style="margin:0 0 16px;font-size:14px;color:#0f172a;text-align:center;font-weight:600;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              Please choose one of the following actions:
            </p>

            <!-- ── ACTION BUTTONS ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="33%" style="padding:0 4px;" align="center">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${approveUrl}" style="height:48px;v-text-anchor:middle;width:140px;" arcsize="20%" fillcolor="#0f4c3a" strokecolor="#0f4c3a">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:bold;">✅ Approve</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${approveUrl}" target="_blank" class="btn-cta"
                    style="display:block;text-align:center;padding:14px 8px;background:#0f4c3a;background:linear-gradient(135deg, #0f4c3a 0%, #1a6b52 100%);color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 14px rgba(15,76,58,0.35);">
                      ✅ Approve
                  </a>
                  <!--<![endif]-->
                </td>
                <td width="33%" style="padding:0 4px;" align="center">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${negotiateUrl}" style="height:48px;v-text-anchor:middle;width:140px;" arcsize="20%" fillcolor="#b45309" strokecolor="#b45309">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:bold;">💬 Negotiate</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${negotiateUrl}" target="_blank" class="btn-cta"
                    style="display:block;text-align:center;padding:14px 8px;background:#b45309;background:linear-gradient(135deg, #b45309 0%, #d97706 100%);color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 14px rgba(180,83,9,0.35);">
                      💬 Negotiate
                  </a>
                  <!--<![endif]-->
                </td>
                <td width="33%" style="padding:0 4px;" align="center">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${rejectUrl}" style="height:48px;v-text-anchor:middle;width:140px;" arcsize="20%" fillcolor="#991b1b" strokecolor="#991b1b">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:bold;">❌ Reject</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${rejectUrl}" target="_blank" class="btn-cta"
                    style="display:block;text-align:center;padding:14px 8px;background:#991b1b;background:linear-gradient(135deg, #991b1b 0%, #dc2626 100%);color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 14px rgba(153,27,27,0.35);">
                      ❌ Reject
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── NEED HELP SECTION ── -->
        <tr>
          <td style="background-color:#ffffff;padding:12px 40px 28px;text-align:center;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:1px solid #f1f5f9;padding-top:20px;" align="center">
                  <p style="margin:0 0 4px;color:#0f172a;font-size:13.5px;font-weight:600;">
                    Need Help or Have Questions?
                  </p>
                  <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">
                    Reach out to our support team anytime at
                    <a href="mailto:mahinprajapati.vhits@gmail.com" style="color:#0f4c3a;font-weight:600;text-decoration:none;">mahinprajapati.vhits@gmail.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td class="footer-cell" align="center"
            style="background-color:#f8fafc;padding:26px 40px;text-align:center;border-top:1px solid #e2e8f0;border-bottom-left-radius:15px;border-bottom-right-radius:15px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

            <p style="margin:0 0 4px;color:#0f172a;font-size:13.5px;font-weight:700;letter-spacing:0.2px;">
              Solar Management System
            </p>
            <p style="margin:0 0 8px;color:#64748b;font-size:11.5px;line-height:1.5;">
              &copy; ${year} Solar Management System &bull; All rights reserved
            </p>
            <p style="margin:0;color:#64748b;font-size:11px;line-height:1.5;">
              This is an automated system email — please do not reply directly to this message.
            </p>
          </td>
        </tr>

      </table>
      <!-- /MAIN EMAIL CARD -->

    </td>
  </tr>
</table>

</body>
</html>`;
};
