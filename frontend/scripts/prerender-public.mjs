import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SITE_CONFIG, PAGES_SEO, getStructuredData, FAQ_DATA } from '../src/config/seo.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '../build');

if (!fs.existsSync(buildDir)) {
  console.error('❌ Error: build/ directory does not exist. Run "vite build" first.');
  process.exit(1);
}

const templatePath = path.join(buildDir, 'index.html');
const templateHtml = fs.readFileSync(templatePath, 'utf8');

function getNoscriptContent(pageKey) {
  if (pageKey === 'about') {
    return `
      <div style="max-width: 900px; margin: 0 auto; padding: 2rem; font-family: sans-serif; background: #0b1120; color: #f8fafc; line-height: 1.6;">
        <h1>About Gaurav Chavda - Creator of Solar Management System</h1>
        <p><strong>Gaurav Chavda</strong> (also known as <em>Chavda Gaurav</em>) is a Senior Full-Stack Engineer and Solar Software Architect based in <strong>Rajkot, Gujarat, India</strong>.</p>
        <h2>Solar Management System (Solar PMS)</h2>
        <p>An enterprise renewable energy CRM and plant monitoring suite designed to streamline solar lead management, automated 3D rooftop site surveys, DISCOM net-metering, PM Surya Ghar Muft Bijli Yojana subsidy workflows, and preventive AMC maintenance.</p>
        <h2>Contact &amp; Location</h2>
        <p>Location: Rajkot, Gujarat, India (PIN: 360001)</p>
        <p>Email: <a href="mailto:${SITE_CONFIG.contactEmail}" style="color: #f59e0b;">${SITE_CONFIG.contactEmail}</a></p>
        <p>GitHub: <a href="${SITE_CONFIG.socialLinks.github}" style="color: #f59e0b;">${SITE_CONFIG.socialLinks.github}</a></p>
      </div>
    `;
  }
  
  if (pageKey === 'notFound') {
    return `
      <div style="max-width: 700px; margin: 2rem auto; padding: 2rem; text-align: center; font-family: sans-serif; background: #0b1120; color: #f8fafc;">
        <h1>404 - Page Not Found</h1>
        <p>The page you are looking for does not exist on Solar Management System by Gaurav Chavda.</p>
        <p><a href="/" style="color: #f59e0b; text-decoration: underline;">Return to Homepage</a></p>
      </div>
    `;
  }

  // Default Home Noscript
  return `
    <div style="max-width: 1000px; margin: 0 auto; padding: 2rem; font-family: sans-serif; background: #0b1120; color: #f8fafc; line-height: 1.6;">
      <h1>Solar Management System - Engineered by Gaurav Chavda</h1>
      <p>The all-in-one Solar Plant Monitoring, Solar CRM, and Installation Management Software built by <strong>Gaurav Chavda</strong> (Chavda Gaurav) in <strong>Rajkot, Gujarat, India</strong>.</p>
      <h2>Enterprise Solar Capabilities</h2>
      <ul>
        <li>Real-Time Solar IoT Telemetry &amp; Inverter Fault Detection</li>
        <li>Automated Solar Proposal &amp; Quotation Engine</li>
        <li>Rooftop 3D Site Survey &amp; Azimuth Analysis</li>
        <li>Technician GPS Dispatch &amp; Installation Milestones</li>
        <li>PM Surya Ghar Muft Bijli Yojana Subsidy Tracker</li>
        <li>Multi-Warehouse Solar Stock &amp; Inventory Management</li>
        <li>Preventive AMC Maintenance &amp; Warranty Ticketing</li>
        <li>GST Invoicing, Payment Milestones &amp; Billing</li>
      </ul>
      <h2>Frequently Asked Questions</h2>
      ${FAQ_DATA.map(f => `<h3>${f.question}</h3><p>${f.answer}</p>`).join('\n')}
      <h2>Contact Architect</h2>
      <p>Gaurav Chavda | Rajkot, Gujarat, India | Email: <a href="mailto:${SITE_CONFIG.contactEmail}" style="color: #f59e0b;">${SITE_CONFIG.contactEmail}</a></p>
    </div>
  `;
}

function renderMeta(pageKey, depth = 0) {
  const page = PAGES_SEO[pageKey] || PAGES_SEO.home;
  const canonicalUrl = `${SITE_CONFIG.baseUrl}${page.canonical === '/' ? '' : page.canonical}`;
  const ogImageUrl = `${SITE_CONFIG.baseUrl}${SITE_CONFIG.defaultOgImage}`;
  const jsonLd = getStructuredData(pageKey);

  let html = templateHtml;

  // Fix relative paths for nested directories
  if (depth > 0) {
    const prefix = '../'.repeat(depth);
    html = html.replace(/(href|src)="\.\/assets\//g, `$1="${prefix}assets/`);
    html = html.replace(/(href|src)="\.\/favicon/g, `$1="${prefix}favicon`);
    html = html.replace(/(href)="\.\/site\.webmanifest"/g, `$1="${prefix}site.webmanifest"`);
    html = html.replace(/(href)="\.\/safari-pinned-tab\.svg"/g, `$1="${prefix}safari-pinned-tab.svg"`);
    html = html.replace(/(href|src)="\.\/logo\.png"/g, `$1="${prefix}logo.png"`);
    html = html.replace(/(href|src)="\.\/apple-touch-icon\.png"/g, `$1="${prefix}apple-touch-icon.png"`);
  }

  // Replace Title
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`);
  html = html.replace(/<meta name="title" content="[\s\S]*?" \/>/, `<meta name="title" content="${page.title}" />`);

  // Replace Description
  html = html.replace(/<meta name="description" content="[\s\S]*?" \/>/, `<meta name="description" content="${page.description}" />`);

  // Replace Robots for notFound
  if (pageKey === 'notFound') {
    html = html.replace(
      /<meta name="robots" content="[\s\S]*?" \/>/,
      '<meta name="robots" content="noindex, follow" />'
    );
  } else {
    html = html.replace(
      /<meta name="robots" content="[\s\S]*?" \/>/,
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />'
    );
  }

  // Replace Canonical & Hreflang
  html = html.replace(/<link rel="canonical" href="[\s\S]*?" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`);
  html = html.replace(/<link rel="alternate" hreflang="en-IN" href="[\s\S]*?" \/>/, `<link rel="alternate" hreflang="en-IN" href="${canonicalUrl}" />`);
  html = html.replace(/<link rel="alternate" hreflang="x-default" href="[\s\S]*?" \/>/, `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`);

  // Replace Open Graph
  html = html.replace(/<meta property="og:title" content="[\s\S]*?" \/>/, `<meta property="og:title" content="${page.title}" />`);
  html = html.replace(/<meta property="og:description" content="[\s\S]*?" \/>/, `<meta property="og:description" content="${page.description}" />`);
  html = html.replace(/<meta property="og:url" content="[\s\S]*?" \/>/, `<meta property="og:url" content="${canonicalUrl}" />`);

  // Replace Twitter Cards
  html = html.replace(/<meta name="twitter:title" content="[\s\S]*?" \/>/, `<meta name="twitter:title" content="${page.title}" />`);
  html = html.replace(/<meta name="twitter:description" content="[\s\S]*?" \/>/, `<meta name="twitter:description" content="${page.description}" />`);
  html = html.replace(/<meta name="twitter:url" content="[\s\S]*?" \/>/, `<meta name="twitter:url" content="${canonicalUrl}" />`);

  // Replace JSON-LD
  const jsonLdScript = `<script type="application/ld+json" id="structured-data-jsonld">\n${JSON.stringify({ "@context": "https://schema.org", "@graph": jsonLd }, null, 2)}\n    </script>`;
  html = html.replace(/<script type="application\/ld\+json" id="structured-data-jsonld">[\s\S]*?<\/script>/, jsonLdScript);

  // Replace Noscript fallback
  const noscriptHtml = `<noscript>${getNoscriptContent(pageKey)}</noscript>`;
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, noscriptHtml);

  return html;
}

function writePage(subDir, pageKey, depth = 0) {
  const targetDir = subDir ? path.join(buildDir, subDir) : buildDir;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const rendered = renderMeta(pageKey, depth);
  fs.writeFileSync(path.join(targetDir, 'index.html'), rendered);
  console.log(`  ✓ Generated ${subDir ? `/${subDir}/index.html` : '/index.html'} [${pageKey}]`);
}

console.log('\n=============================================');
console.log('🚀 GENERATING PRERENDERED PUBLIC HTML PAGES');
console.log('=============================================');

// 1. Root / Home
writePage('', 'home', 0);

// 2. /about and /about-gaurav-chavda
writePage('about', 'about', 1);
writePage('about-gaurav-chavda', 'about', 1);

// 3. Section direct routes
writePage('features', 'features', 1);
writePage('benefits', 'benefits', 1);
writePage('faq', 'faq', 1);
writePage('contact', 'contact', 1);

// 4. Fallback 404
const notFoundHtml = renderMeta('notFound', 0);
fs.writeFileSync(path.join(buildDir, '404.html'), notFoundHtml);
console.log('  ✓ Generated /404.html [notFound]');

console.log('=============================================');
console.log('✅ Static Prerendering Completed Successfully!\n');
