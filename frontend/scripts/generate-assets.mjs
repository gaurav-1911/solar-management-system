import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const sourceLogoPath = path.resolve(__dirname, '../src/assets/images/solar-logo-transparent.png');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

/**
 * Premium Solar Management System Favicon & Brand Mark
 * 
 * Concept:
 * - Geometric, high-contrast capital 'S' integrated with a photovoltaic solar panel array
 *   and radiant golden sun rays.
 * - Deep navy/slate container (#070d19 -> #0f172a) with subtle amber rim for 100% contrast
 *   on both light and dark browser tabs.
 * - Optimized for razor-sharp legibility at 16x16 and 32x32 pixels.
 */
const solarSymbolSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080e1a" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>

    <!-- Solar Amber / Gold Gradient -->
    <linearGradient id="solarAmber" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="35%" stop-color="#fbbf24" />
      <stop offset="85%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>

    <!-- Solar Photovoltaic Blue / Cyan Gradient -->
    <linearGradient id="solarCell" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>

    <!-- Radiant Sun Core Gradient -->
    <linearGradient id="sunCore" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="45%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>

    <!-- Outer Rim Subtle Stroke -->
    <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.2" />
    </linearGradient>
  </defs>

  <!-- Container Squircle with Rounded Corners -->
  <rect x="20" y="20" width="472" height="472" rx="108" fill="url(#bgGrad)" stroke="url(#rimGrad)" stroke-width="8" />

  <!-- Ambient Golden Glow -->
  <circle cx="360" cy="144" r="110" fill="#f59e0b" fill-opacity="0.16" />
  <circle cx="170" cy="350" r="100" fill="#38bdf8" fill-opacity="0.12" />

  <!-- Radiant Sun (Apex Right) -->
  <g id="sunElement">
    <circle cx="368" cy="144" r="44" fill="url(#sunCore)" />
    <!-- Sun Rays with Rounded Caps -->
    <g stroke="url(#solarAmber)" stroke-width="10" stroke-linecap="round">
      <line x1="368" y1="68" x2="368" y2="84" />
      <line x1="444" y1="144" x2="428" y2="144" />
      <line x1="422" y1="90" x2="410" y2="102" />
      <line x1="422" y1="198" x2="410" y2="186" />
      <line x1="314" y1="90" x2="326" y2="102" />
    </g>
  </g>

  <!-- The Geometric Solar 'S' -->
  <g id="solarS">
    <!-- Main Outer S Ribbon Geometry -->
    <path d="M 284 96 L 200 96 C 146 96 104 130 104 182 C 104 236 142 260 200 272 L 256 284 C 290 291 308 306 308 328 C 308 352 286 368 250 368 L 152 368 C 140 368 132 358 136 346 L 142 330 C 144 324 140 318 134 318 L 98 318 C 92 318 86 324 88 330 L 80 356 C 74 384 92 418 144 418 L 258 418 C 334 418 388 380 388 320 C 388 262 346 238 290 226 L 234 214 C 198 206 180 194 180 174 C 180 152 202 142 234 142 L 302 142 C 314 142 322 152 318 164 L 312 178 C 310 184 314 190 320 190 L 356 190 C 362 190 368 184 366 178 L 374 150 C 380 124 360 96 314 96 Z"
          fill="url(#solarAmber)" />

    <!-- Upper Photovoltaic Panel Inset (Cyan/Blue Solar Cells) -->
    <path d="M 200 108 L 288 108 C 298 108 304 116 302 126 L 298 132 L 190 132 C 184 132 180 128 182 122 C 184 114 190 108 200 108 Z"
          fill="url(#solarCell)" />
    <!-- Upper Cell Dividers (White Grid Lines) -->
    <line x1="226" y1="108" x2="224" y2="132" stroke="#ffffff" stroke-width="3" stroke-opacity="0.85" />
    <line x1="262" y1="108" x2="260" y2="132" stroke="#ffffff" stroke-width="3" stroke-opacity="0.85" />

    <!-- Lower Photovoltaic Panel Inset -->
    <path d="M 164 376 L 254 376 C 272 376 284 384 282 396 L 280 404 L 146 404 C 140 404 136 398 138 392 L 142 384 C 146 378 154 376 164 376 Z"
          fill="url(#solarCell)" />
    <!-- Lower Cell Dividers (White Grid Lines) -->
    <line x1="188" y1="376" x2="186" y2="404" stroke="#ffffff" stroke-width="3" stroke-opacity="0.85" />
    <line x1="228" y1="376" x2="226" y2="404" stroke="#ffffff" stroke-width="3" stroke-opacity="0.85" />
  </g>

  <!-- Energetic Central Diagonal Accent -->
  <line x1="218" y1="246" x2="274" y2="258" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-opacity="0.9" />
</svg>
`;

// Monochrome vector path for Safari Pinned Tab (pure silhouette on 100x100 viewBox)
const safariPinnedTabSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 68 18 L 40 18 C 26 18 16 26 16 38 C 16 50 24 55 38 58 L 52 61 C 60 63 64 67 64 72 C 64 78 58 82 48 82 L 26 82 C 22 82 20 78 21 74 L 23 70 C 24 67 22 65 19 65 L 12 65 C 10 65 8 67 9 69 L 7 76 C 5 84 10 92 24 92 L 50 92 C 68 92 78 82 78 70 C 78 56 68 51 54 48 L 42 45 C 34 43 30 40 30 35 C 30 30 35 28 44 28 L 62 28 C 66 28 69 31 67 35 L 65 40 C 64 42 66 44 68 44 L 76 44 C 78 44 80 42 79 40 L 82 32 C 84 24 78 18 68 18 Z" fill="#000000" />
  <circle cx="80" cy="18" r="8" fill="#000000" />
</svg>
`;

async function generateAssets() {
  console.log('Generating iconic Solar S Favicon and SEO assets...');
  
  // 1. Write the new standalone favicon.svg
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), solarSymbolSvg.trim());

  // 2. Generate Favicon PNGs from the new vector Solar S symbol
  const svgBuffer = Buffer.from(solarSymbolSvg);

  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon-48x48.png'));

  // 3. Multi-size ICO header wrapper (combining 16x16, 32x32, 48x48 PNGs into standard .ico format)
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  
  function createIco(pngBuffers) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // ICO type
    header.writeUInt16LE(pngBuffers.length, 4); // count
    
    let offset = 6 + (16 * pngBuffers.length);
    const directoryEntries = [];
    
    const sizes = [16, 32, 48];
    for (let i = 0; i < pngBuffers.length; i++) {
      const buf = pngBuffers[i];
      const size = sizes[i];
      const entry = Buffer.alloc(16);
      entry.writeUInt8(size === 256 ? 0 : size, 0); // width
      entry.writeUInt8(size === 256 ? 0 : size, 1); // height
      entry.writeUInt8(0, 2); // color palette
      entry.writeUInt8(0, 3); // reserved
      entry.writeUInt16LE(1, 4); // color planes
      entry.writeUInt16LE(32, 6); // bpp
      entry.writeUInt32LE(buf.length, 8); // size
      entry.writeUInt32LE(offset, 12); // offset
      directoryEntries.push(entry);
      offset += buf.length;
    }
    
    return Buffer.concat([header, ...directoryEntries, ...pngBuffers]);
  }

  const icoBuffer = createIco([png16, png32, png48]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  // 4. Touch icons & Chrome app icons from the new iconic brand mark
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'android-chrome-192x192.png'));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'android-chrome-512x512.png'));

  // Maskable icon (with safe 15% inner padding for circular/squircle Android masks)
  await sharp(svgBuffer)
    .resize(380, 380)
    .extend({
      top: 66,
      bottom: 66,
      left: 66,
      right: 66,
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  // 5. Safari pinned tab SVG
  fs.writeFileSync(path.join(publicDir, 'safari-pinned-tab.svg'), safariPinnedTabSvg.trim());

  // 6. Preserve the full detailed logo in public/logo.png and public/logo-source.png for headers/previews
  fs.copyFileSync(sourceLogoPath, path.join(publicDir, 'logo.png'));
  fs.copyFileSync(sourceLogoPath, path.join(publicDir, 'logo-source.png'));

  // 7. Generate High-Impact 1200x630 Open Graph Thumbnail
  const logoForOg = await sharp(sourceLogoPath)
    .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const ogSvgOverlay = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#fbbf24" />
      </linearGradient>
      <linearGradient id="blueGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#0284c7" stop-opacity="0.0" />
      </linearGradient>
    </defs>
    
    <rect width="1200" height="630" fill="url(#bg)" />
    <circle cx="1100" cy="100" r="300" fill="url(#blueGlow)" />
    <circle cx="100" cy="500" r="250" fill="#f59e0b" fill-opacity="0.08" />

    <!-- Top Badge -->
    <rect x="520" y="100" width="380" height="42" rx="21" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5" />
    <text x="710" y="127" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#fbbf24" text-anchor="middle" letter-spacing="2">ENTERPRISE SOLAR CRM &amp; SUITE</text>

    <!-- Title -->
    <text x="520" y="210" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="54" font-weight="900" fill="#ffffff">Solar Management</text>
    <text x="520" y="275" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="54" font-weight="900" fill="url(#accent)">System</text>
    
    <!-- Tagline & Creator -->
    <text x="520" y="340" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#94a3b8">by <tspan fill="#38bdf8">Gaurav Chavda</tspan> (Chavda Gaurav)</text>

    <!-- Description / Key Highlights -->
    <text x="520" y="410" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" fill="#cbd5e1">✓ Real-time Solar Monitoring &amp; Plant Analytics</text>
    <text x="520" y="445" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" fill="#cbd5e1">✓ Rooftop Solar CRM, Quotations &amp; Billing</text>
    <text x="520" y="480" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" fill="#cbd5e1">✓ AMC, Technician Tracking &amp; Maintenance</text>

    <!-- Location & Tech Badge Footer -->
    <line x1="520" y1="525" x2="1120" y2="525" stroke="#334155" stroke-width="1.5" />
    <text x="520" y="565" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#64748b">📍 Rajkot, Gujarat, India</text>
    <text x="1120" y="565" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#f59e0b" text-anchor="end">Production Ready • v1.0</text>
  </svg>
  `;

  await sharp(Buffer.from(ogSvgOverlay))
    .composite([
      {
        input: logoForOg,
        top: 135,
        left: 90
      }
    ])
    .png({ quality: 90, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'og-image-1200x630.png'));

  await sharp(path.join(publicDir, 'og-image-1200x630.png'))
    .webp({ quality: 85 })
    .toFile(path.join(publicDir, 'og-image-1200x630.webp'));

  fs.copyFileSync(path.join(publicDir, 'og-image-1200x630.png'), path.join(publicDir, 'og-image.png'));
  fs.copyFileSync(path.join(publicDir, 'og-image-1200x630.webp'), path.join(publicDir, 'og-image.webp'));

  // 8. Generate Square 1200x1200 Thumbnail for WhatsApp & Social Share
  const logoForSquare = await sharp(sourceLogoPath)
    .resize(440, 440, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const squareSvgOverlay = `
  <svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sqBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="sqAccent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#fbbf24" />
      </linearGradient>
    </defs>
    
    <rect width="1200" height="1200" fill="url(#sqBg)" />
    <circle cx="600" cy="360" r="320" fill="#f59e0b" fill-opacity="0.08" />

    <!-- Top Badge -->
    <rect x="360" y="70" width="480" height="50" rx="25" fill="#f59e0b" fill-opacity="0.15" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="2" />
    <text x="600" y="103" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#fbbf24" text-anchor="middle" letter-spacing="2">ENTERPRISE SOLAR CRM</text>

    <!-- Center Titles below logo -->
    <text x="600" y="660" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#ffffff" text-anchor="middle">Solar Management</text>
    <text x="600" y="740" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="url(#sqAccent)" text-anchor="middle">System</text>
    
    <!-- Tagline & Creator -->
    <text x="600" y="820" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="700" fill="#94a3b8" text-anchor="middle">by <tspan fill="#38bdf8">Gaurav Chavda</tspan></text>
    <text x="600" y="865" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#64748b" text-anchor="middle">(Chavda Gaurav • Rajkot, Gujarat, India)</text>

    <!-- Key highlights -->
    <rect x="200" y="920" width="800" height="160" rx="20" fill="#1e293b" fill-opacity="0.7" stroke="#334155" stroke-width="1.5" />
    <text x="600" y="975" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="600" fill="#e2e8f0" text-anchor="middle">⚡ Solar Energy &amp; Plant Monitoring Suite</text>
    <text x="600" y="1025" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" fill="#94a3b8" text-anchor="middle">CRM • Quotations • AMC • Field Technicians • Billing</text>
  </svg>
  `;

  await sharp(Buffer.from(squareSvgOverlay))
    .composite([
      {
        input: logoForSquare,
        top: 150,
        left: 380
      }
    ])
    .png({ quality: 90, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'whatsapp-share-1200x1200.png'));

  await sharp(path.join(publicDir, 'whatsapp-share-1200x1200.png'))
    .webp({ quality: 85 })
    .toFile(path.join(publicDir, 'whatsapp-share-1200x1200.webp'));

  fs.copyFileSync(path.join(publicDir, 'whatsapp-share-1200x1200.png'), path.join(publicDir, 'whatsapp-share.png'));
  fs.copyFileSync(path.join(publicDir, 'whatsapp-share-1200x1200.webp'), path.join(publicDir, 'whatsapp-share.webp'));

  console.log('✅ All favicon and social image assets generated successfully!');
}

generateAssets().catch(err => {
  console.error('Asset generation error:', err);
  process.exit(1);
});
