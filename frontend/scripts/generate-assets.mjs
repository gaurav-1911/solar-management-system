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

async function generateAssets() {
  console.log('Generating favicon and SEO assets from source logo...');
  
  // Copy source logo to public
  fs.copyFileSync(sourceLogoPath, path.join(publicDir, 'logo.png'));
  fs.copyFileSync(sourceLogoPath, path.join(publicDir, 'logo-source.png'));

  // 1. Favicon sizes
  await sharp(sourceLogoPath)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  await sharp(sourceLogoPath)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  await sharp(sourceLogoPath)
    .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'favicon-48x48.png'));

  // Multi-size ICO header wrapper (combining 16x16, 32x32, 48x48 PNGs into standard .ico format)
  const png16 = await sharp(sourceLogoPath).resize(16, 16).png().toBuffer();
  const png32 = await sharp(sourceLogoPath).resize(32, 32).png().toBuffer();
  const png48 = await sharp(sourceLogoPath).resize(48, 48).png().toBuffer();
  
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

  // 2. Touch icons & Chrome app icons
  await sharp(sourceLogoPath)
    .resize(180, 180, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  await sharp(sourceLogoPath)
    .resize(192, 192, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, 'android-chrome-192x192.png'));

  await sharp(sourceLogoPath)
    .resize(512, 512, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, 'android-chrome-512x512.png'));

  // Maskable icon (with safe 15% inner padding)
  await sharp(sourceLogoPath)
    .resize(380, 380, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 0 } })
    .extend({
      top: 66,
      bottom: 66,
      left: 66,
      right: 66,
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  // Safari pinned tab SVG
  const safariSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="#f59e0b">
  <circle cx="30" cy="30" r="14" />
  <path d="M 20 42 L 80 42 L 90 86 L 10 86 Z" fill="#f59e0b" />
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'safari-pinned-tab.svg'), safariSvg);

  // 3. Generate High-Impact 1200x630 Open Graph Thumbnail
  // We composite the sharp logo onto a rich, branded dark gradient canvas
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

  // Also create default og-image.png and og-image.webp
  fs.copyFileSync(path.join(publicDir, 'og-image-1200x630.png'), path.join(publicDir, 'og-image.png'));
  fs.copyFileSync(path.join(publicDir, 'og-image-1200x630.webp'), path.join(publicDir, 'og-image.webp'));

  // 4. Generate Square 1200x1200 Thumbnail for WhatsApp & Social Share
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
