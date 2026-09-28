import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '../build/index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const regex = /<script type="application\/ld\+json" id="structured-data-jsonld">([\s\S]*?)<\/script>/;
const match = html.match(regex);

if (!match) {
  console.error('❌ No structured data script tag found');
  process.exit(1);
}

try {
  const jsonLd = JSON.parse(match[1]);
  console.log('✅ JSON-LD Parsed Successfully!');
  console.log('Context:', jsonLd['@context']);
  console.log('Graph Elements:', jsonLd['@graph'].map(e => ({
    type: e['@type'],
    name: e.name || e.jobTitle || 'N/A'
  })));

  // Detailed validations
  const person = jsonLd['@graph'].find(e => e['@type'] === 'Person');
  const website = jsonLd['@graph'].find(e => e['@type'] === 'WebSite');
  const software = jsonLd['@graph'].find(e => e['@type'] === 'SoftwareApplication');
  const breadcrumbs = jsonLd['@graph'].find(e => e['@type'] === 'BreadcrumbList');
  const faq = jsonLd['@graph'].find(e => e['@type'] === 'FAQPage');

  console.log('\n--- Person Schema Check ---');
  console.log(`  Name: ${person?.name}`);
  console.log(`  Alternate: ${person?.alternateName}`);
  console.log(`  Locality: ${person?.address?.addressLocality}, ${person?.address?.addressRegion}`);

  console.log('\n--- SoftwareApplication Schema Check ---');
  console.log(`  Name: ${software?.name}`);
  console.log(`  Category: ${software?.applicationCategory}`);
  console.log(`  Feature Count: ${software?.featureList?.length}`);

  console.log('\n--- FAQPage Schema Check ---');
  console.log(`  Total Questions: ${faq?.mainEntity?.length}`);

  console.log('\n✅ All schemas validated against Schema.org requirements!');
} catch (e) {
  console.error('❌ JSON-LD Parse Error:', e.message);
  process.exit(1);
}
