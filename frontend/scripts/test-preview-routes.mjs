import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '../build');

const server = http.createServer((req, res) => {
  let cleanUrl = req.url.split('?')[0].split('#')[0];
  let filePath = path.join(buildDir, cleanUrl);

  // If path is a directory or points to root, look for index.html inside
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const dirIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(dirIndex)) {
      filePath = dirIndex;
    }
  } else if (!fs.existsSync(filePath)) {
    // If exact file not found, try appending .html or /index.html
    const tryHtml = `${filePath}.html`;
    const tryDirIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(tryDirIndex)) {
      filePath = tryDirIndex;
    } else if (fs.existsSync(tryHtml)) {
      filePath = tryHtml;
    } else {
      // Fallback to 404.html
      filePath = path.join(buildDir, '404.html');
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json'
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4173, async () => {
  console.log('Testing static preview routes on http://localhost:4173...\n');
  
  const routes = [
    { path: '/', expectedStatus: 200 },
    { path: '/about', expectedStatus: 200 },
    { path: '/about-gaurav-chavda', expectedStatus: 200 },
    { path: '/features', expectedStatus: 200 },
    { path: '/benefits', expectedStatus: 200 },
    { path: '/faq', expectedStatus: 200 },
    { path: '/contact', expectedStatus: 200 },
    { path: '/sitemap.xml', expectedStatus: 200 },
    { path: '/robots.txt', expectedStatus: 200 },
    { path: '/site.webmanifest', expectedStatus: 200 },
    { path: '/e4d7b2a9f1c84365908271e54a3b6c8d.txt', expectedStatus: 200 },
    { path: '/og-image-1200x630.png', expectedStatus: 200 },
    { path: '/whatsapp-share-1200x1200.png', expectedStatus: 200 },
    { path: '/non-existent-page-xyz', expectedStatus: 404 }
  ];

  let allPassed = true;

  for (const r of routes) {
    try {
      const res = await fetch('http://localhost:4173' + r.path);
      const isExpected = res.status === r.expectedStatus;
      if (isExpected) {
        console.log(`  ✅ Route ${r.path.padEnd(35)} -> Status: ${res.status} (Expected ${r.expectedStatus}) [${res.headers.get('content-type')}]`);
      } else {
        console.error(`  ❌ Route ${r.path.padEnd(35)} -> Status: ${res.status} (FAILED: Expected ${r.expectedStatus})`);
        allPassed = false;
      }
    } catch (e) {
      console.error(`  ❌ Route ${r.path.padEnd(35)} -> Request error: ${e.message}`);
      allPassed = false;
    }
  }
  
  console.log('\nPreview route test suite completed.');
  server.close(() => {
    process.exit(allPassed ? 0 : 1);
  });
});
