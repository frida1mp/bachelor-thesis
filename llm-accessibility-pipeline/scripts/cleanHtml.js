import 'dotenv/config';
import { listSiteIds, readHTML, writeHTML } from './utils/fileHandler.js';

function cleanHtml(html) {
  let cleaned = html;
  let originalLength = html.length;

  // Remove <script>...</script> blocks (don't affect accessibility, often large)
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove <style>...</style> blocks (cookie consent CSS etc. is enormous)
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Replace base64 image data with a placeholder (saves huge token counts)
  cleaned = cleaned.replace(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
    'data:image/png;base64,PLACEHOLDER'
  );

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Collapse runs of whitespace within text content (preserve newlines for readability)
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n+/g, '\n');

  return {
    html: cleaned,
    originalSize: originalLength,
    cleanedSize: cleaned.length,
    reduction: ((1 - cleaned.length / originalLength) * 100).toFixed(1),
  };
}

async function main() {
  const siteIds = await listSiteIds();

  if (siteIds.length === 0) {
    console.log('No HTML files found in data/raw_sites/. Run "npm run fetch-sites" first.');
    process.exit(1);
  }

  console.log(`Cleaning ${siteIds.length} site(s)...\n`);

  for (const siteId of siteIds) {
    const html = await readHTML(siteId);
    const result = cleanHtml(html);
    await writeHTML(siteId, result.html);

    console.log(
      `  ${siteId}: ${result.originalSize} -> ${result.cleanedSize} chars (${result.reduction}% reduction)`
    );
  }

  console.log('\nDone. Cleaned HTML saved to data/raw_sites/');
  console.log('Note: To restore originals, re-run "npm run fetch-sites".');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
