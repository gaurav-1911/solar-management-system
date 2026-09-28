const welcomeUserTemplate = (options = {}) => {
    const {
        userName = "there",
        email = "",
        password = "",
        loginUrl = "http://localhost:3000/admin/login",
        supportEmail = "mahinprajapati.vhits@gmail.com",
        year = new Date().getFullYear(),
    } = options;

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>Welcome – Your Customer Account is Ready – Solar Management System</title>

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

  /* ===== Responsive adjustments ===== */
  @media screen and (max-width: 620px) {
    .email-card { width: 100% !important; border-radius: 0 !important; }
    .header-cell { padding: 32px 20px 24px !important; border-radius: 0 !important; }
    .body-cell { padding: 28px 20px !important; }
    .help-cell { padding: 16px 20px 24px !important; }
    .footer-cell { padding: 24px 20px !important; border-radius: 0 !important; }
    .hero-title { font-size: 20px !important; }
    .btn-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%!important;background-color:#f1f5f9;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<!-- Hidden Preview Text -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f1f5f9;">Your Solar Management System account has been created. Use the credentials below to sign in.&#8203;&#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;</div>

<!-- Canvas Table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f1f5f9;margin:0;padding:0;table-layout:fixed;">
  <tr>
    <td align="center" valign="top" style="padding:40px 16px 60px;background-color:#f1f5f9;">

      <!-- ══════════════════════ MAIN EMAIL CARD ══════════════════════ -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-card"
        style="width:100%;max-width:540px;margin:0 auto;background-color:#ffffff;border-radius:16px;border:1px solid #cbd5e1;box-shadow:0 10px 25px -5px rgba(15,23,42,0.08), 0 8px 10px -6px rgba(15,23,42,0.04);border-collapse:separate;overflow:hidden;">

        <!-- ── BRAND HEADER BANNER (Frontend Teal Gradient) ── -->
        <tr>
          <td class="header-cell" align="center"
            style="background:#0f4c3a;background:linear-gradient(135deg, #0a3a2d 0%, #0f4c3a 50%, #1a6b52 100%);padding:32px 40px;text-align:center;border-top-left-radius:15px;border-top-right-radius:15px;">

            <!-- Brand Name -->
            <h1 style="margin:0 0 4px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;line-height:1.3;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              Solar Management System
            </h1>

            <!-- Tagline -->
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);font-weight:400;letter-spacing:0.2px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              Smart Solar Energy Platform
            </p>
          </td>
        </tr>

        <!-- ── MAIN BODY CONTENT ── -->
        <tr>
          <td class="body-cell" style="background-color:#ffffff;padding:36px 40px 20px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

            <!-- Greeting / Title -->
            <h2 class="hero-title" style="margin:0 0 12px;color:#0f172a;font-size:22px;font-weight:700;line-height:1.35;text-align:center;letter-spacing:-0.3px;white-space:nowrap;">
              Welcome, ${userName}!
            </h2>

            <p style="margin:0 0 24px;color:#334155;font-size:14.5px;line-height:1.65;text-align:center;">
              Your <strong style="color:#0f172a;font-weight:600;">account</strong> has been created on the Solar Management System. You can now sign in using the credentials below.
            </p>

            <!-- ── CREDENTIALS BOX ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin:0 0 24px;">
              <tr>
                <td style="padding:18px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="top" style="width:28px;padding-right:10px;">
                        <span style="font-size:18px;line-height:1;">🔑</span>
                      </td>
                      <td valign="top">
                        <p style="margin:0 0 10px;color:#14532d;font-size:13px;line-height:1.5;font-weight:600;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          Your Login Credentials
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                          <tr>
                            <td style="padding:4px 0;color:#475569;font-size:13px;line-height:1.5;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              <strong style="color:#052e16;">Email:</strong>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0 12px;word-break:break-all;">
                              <p style="margin:0;background-color:#ffffff;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;color:#0f4c3a;font-size:13.5px;font-weight:600;word-break:break-all;font-family:'SFMono-Regular',Consolas,Menlo,monospace;">${email}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0;color:#475569;font-size:13px;line-height:1.5;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                              <strong style="color:#052e16;">Temporary Password:</strong>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:4px 0 0;">
                              <p style="margin:0;background-color:#ffffff;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;color:#0f4c3a;font-size:13.5px;font-weight:600;word-break:break-all;font-family:'SFMono-Regular',Consolas,Menlo,monospace;">${password}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- ── CTA BUTTON ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
              <tr>
                <td align="center" style="border-radius:10px;background:#0f4c3a;background:linear-gradient(135deg, #0f4c3a 0%, #1a6b52 100%);text-align:center;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${loginUrl}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="20%" fillcolor="#0f4c3a" strokecolor="#0f4c3a">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;">Sign In To Your Account</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${loginUrl}" target="_blank" class="btn-cta"
                    style="display:inline-block;padding:14px 36px;background:#0f4c3a;background:linear-gradient(135deg, #0f4c3a 0%, #1a6b52 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.2px;box-shadow:0 4px 14px rgba(15,76,58,0.35);">
                    Sign In To Your Account &rarr;
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

            <!-- ── SECURITY NOTICE BOX ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
              style="background-color:#fffbe6;border-radius:10px;border:1px solid #fef08a;margin:0 0 24px;">
              <tr>
                <td style="padding:14px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="top" style="width:24px;padding-right:10px;">
                        <span style="font-size:16px;line-height:1;">🔒</span>
                      </td>
                      <td valign="top">
                        <p style="margin:0;color:#78350f;font-size:13px;line-height:1.5;font-weight:500;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                          <strong style="color:#451a03;">Please change your password after your first login.</strong> For security, use a unique password that you don't use anywhere else.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── NEED HELP SECTION ── -->
        <tr>
          <td class="help-cell" style="background-color:#ffffff;padding:12px 40px 28px;text-align:center;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:1px solid #f1f5f9;padding-top:20px;" align="center">
                  <p style="margin:0 0 4px;color:#0f172a;font-size:13.5px;font-weight:600;">
                    Need Help or Have Questions?
                  </p>
                  <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">
                    Reach out to our support team anytime at
                    <a href="mailto:${supportEmail}" style="color:#0f4c3a;font-weight:600;text-decoration:none;">${supportEmail}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── FOOTER SECTION (Clean Slate Styling matching Frontend) ── -->
        <tr>
          <td class="footer-cell" align="center"
            style="background-color:#f8fafc;padding:26px 40px;text-align:center;border-top:1px solid #e2e8f0;border-bottom-left-radius:15px;border-bottom-right-radius:15px;font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

            <!-- Footer Logo / Brand -->
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

export default welcomeUserTemplate;
