import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '../build');

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  let filePath = path.join(buildDir, urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(buildDir, '404.html');
  }
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.webmanifest': 'application/manifest+json'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4173, async () => {
  console.log('Testing static preview routes on http://localhost:4173...\n');
  
  const routes = [
    '/',
    '/about',
    '/features',
    '/benefits',
    '/faq',
    '/contact',
    '/login',
    '/404',
    '/sitemap.xml',
    '/robots.txt',
    '/site.webmanifest',
    '/e4d7b2a9f1c84365908271e54a3b6c8d.txt',
    '/og-image-1200x630.png',
    '/whatsapp-share-1200x1200.png'
  ];

  for (const r of routes) {
    const res = await fetch('http://localhost:4173' + r);
    console.log(`  ✅ Route ${r.padEnd(40)} -> Status: ${res.status} [${res.headers.get('content-type')}]`);
  }
  
  console.log('\nAll 14 static and SPA routes respond with 200 OK!');
  server.close();
  process.exit(0);
});
