import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '../build');
const publicDir = path.resolve(__dirname, '../public');

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n=============================================');
console.log('🔍 RUNNING PRODUCTION SEO & ASSET VALIDATION');
console.log('=============================================\n');

// 1. Validate Robots.txt
console.log('[1/6] Validating robots.txt...');
const robotsPath = path.join(buildDir, 'robots.txt');
assert(fs.existsSync(robotsPath), 'robots.txt exists in build output');
const robotsContent = fs.readFileSync(robotsPath, 'utf8');
assert(robotsContent.includes('User-agent: *'), 'robots.txt specifies User-agent: *');
assert(robotsContent.includes('Allow: /'), 'robots.txt allows root public routes');
assert(robotsContent.includes('Disallow: /admin/'), 'robots.txt blocks private admin routes');
assert(robotsContent.includes('Sitemap: https://'), 'robots.txt includes absolute Sitemap URL');

// 2. Validate Sitemap.xml
console.log('\n[2/6] Validating sitemap.xml...');
const sitemapPath = path.join(buildDir, 'sitemap.xml');
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists in build output');
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
assert(sitemapContent.includes('<urlset'), 'sitemap.xml has valid <urlset> root element');
assert(sitemapContent.includes('<loc>https://gaurav-1911.github.io/solar-management-system/</loc>'), 'sitemap.xml has homepage loc');
assert(sitemapContent.includes('<loc>https://gaurav-1911.github.io/solar-management-system/about</loc>'), 'sitemap.xml has about page loc');
assert(sitemapContent.includes('<priority>1.0</priority>'), 'sitemap.xml defines page priority');

// 3. Validate IndexNow Key File
console.log('\n[3/6] Validating IndexNow Key File...');
const indexNowPath = path.join(buildDir, 'e4d7b2a9f1c84365908271e54a3b6c8d.txt');
assert(fs.existsSync(indexNowPath), 'IndexNow key file exists');
const indexNowContent = fs.readFileSync(indexNowPath, 'utf8').trim();
assert(indexNowContent === 'e4d7b2a9f1c84365908271e54a3b6c8d', 'IndexNow key file content matches filename key');

// 4. Validate Icons & Favicons
console.log('\n[4/6] Validating Favicons & Open Graph Assets...');
const requiredFiles = [
  { file: 'favicon.ico', minSize: 1000, maxSize: 50000 },
  { file: 'favicon-16x16.png', minSize: 100, maxSize: 5000 },
  { file: 'favicon-32x32.png', minSize: 200, maxSize: 10000 },
  { file: 'apple-touch-icon.png', minSize: 1000, maxSize: 100000 },
  { file: 'android-chrome-192x192.png', minSize: 2000, maxSize: 100000 },
  { file: 'android-chrome-512x512.png', minSize: 5000, maxSize: 300000 },
  { file: 'maskable-icon-512x512.png', minSize: 5000, maxSize: 300000 },
  { file: 'og-image-1200x630.png', minSize: 10000, maxSize: 204800 }, // Under 200 KB
  { file: 'og-image-1200x630.webp', minSize: 10000, maxSize: 204800 }, // Under 200 KB
  { file: 'whatsapp-share-1200x1200.png', minSize: 10000, maxSize: 204800 }, // Under 200 KB
  { file: 'site.webmanifest', minSize: 100, maxSize: 5000 }
];

for (const req of requiredFiles) {
  const filePath = path.join(buildDir, req.file);
  const exists = fs.existsSync(filePath);
  assert(exists, `${req.file} exists`);
  if (exists) {
    const size = fs.statSync(filePath).size;
    assert(size >= req.minSize && size <= req.maxSize, `${req.file} size is within optimal range (${(size / 1024).toFixed(1)} KB)`);
  }
}

// 5. Validate HTML & Metadata in index.html
console.log('\n[5/6] Validating HTML Head & Metadata...');
const indexPath = path.join(buildDir, 'index.html');
assert(fs.existsSync(indexPath), 'index.html exists in build');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Title length check (50-60 chars target)
const titleMatch = indexHtml.match(/<title>(.*?)<\/title>/);
assert(titleMatch !== null, 'HTML contains <title>');
if (titleMatch) {
  const title = titleMatch[1];
  console.log(`    Title content: "${title}" (${title.length} characters)`);
  assert(title.length >= 40 && title.length <= 60, `Title length (${title.length} chars) is in optimal 40-60 character range`);
}

// Meta description check (140-160 chars target)
const descMatch = indexHtml.match(/<meta name="description" content="(.*?)"/);
assert(descMatch !== null, 'HTML contains <meta name="description">');
if (descMatch) {
  const desc = descMatch[1];
  console.log(`    Description content: "${desc}" (${desc.length} characters)`);
  assert(desc.length >= 120 && desc.length <= 165, `Description length (${desc.length} chars) is in optimal 120-165 range`);
}

assert(indexHtml.includes('<html lang="en-IN"'), 'HTML has <html lang="en-IN">');
assert(indexHtml.includes('<link rel="canonical"'), 'HTML has <link rel="canonical">');
assert(indexHtml.includes('property="og:image"'), 'HTML has Open Graph og:image');
assert(indexHtml.includes('name="twitter:card" content="summary_large_image"'), 'HTML has Twitter summary_large_image card');

// 6. Validate Structured Data (JSON-LD)
console.log('\n[6/6] Validating JSON-LD Structured Data Schema...');
const jsonLdMatch = indexHtml.match(/<script type="application\/ld\+json" id="structured-data-jsonld">([\s\S]*?)<\/script>/);
assert(jsonLdMatch !== null, 'JSON-LD script tag exists in HTML');
if (jsonLdMatch) {
  try {
    const parsed = JSON.parse(jsonLdMatch[1]);
    assert(parsed['@context'] === 'https://schema.org', 'JSON-LD has schema.org context');
    assert(Array.isArray(parsed['@graph']), 'JSON-LD contains @graph array');
    
    const types = parsed['@graph'].map(g => g['@type']);
    assert(types.includes('Person'), 'JSON-LD includes Person schema (Gaurav Chavda)');
    assert(types.includes('WebSite'), 'JSON-LD includes WebSite schema');
    assert(types.includes('SoftwareApplication'), 'JSON-LD includes SoftwareApplication schema');
    
    const person = parsed['@graph'].find(g => g['@type'] === 'Person');
    assert(person.name === 'Gaurav Chavda', 'Person schema name is Gaurav Chavda');
    assert(person.alternateName === 'Chavda Gaurav', 'Person schema alternateName is Chavda Gaurav');
    assert(person.address.addressLocality === 'Rajkot', 'Person schema locality is Rajkot');
    assert(person.address.addressRegion === 'Gujarat', 'Person schema region is Gujarat');
    
    console.log('    JSON-LD parsed and verified 100% syntactically valid!');
  } catch (err) {
    assert(false, `JSON-LD failed JSON parsing: ${err.message}`);
  }
}

// 7. Validate 404 Fallback
console.log('\n[7/6] Validating 404.html fallback for GitHub Pages...');
const fourOhFourPath = path.join(buildDir, '404.html');
assert(fs.existsSync(fourOhFourPath), '404.html exists in build output');

console.log('\n=============================================');
console.log(`📊 VALIDATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
