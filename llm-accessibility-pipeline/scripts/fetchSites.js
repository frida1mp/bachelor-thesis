import 'dotenv/config';
import puppeteer from 'puppeteer';
import { loadUrls, loadCookies, writeHTML } from './utils/fileHandler.js';

async function main() {
  const urls = await loadUrls();
  const entries = Object.entries(urls);

  if (entries.length === 0) {
    console.log('No URLs found in data/urls.json.');
    process.exit(0);
  }

  // Collect all unique roles and load their cookies
  const roles = [...new Set(entries.map(([, c]) => c.auth).filter(a => a && a !== false))];
  const cookiesByRole = {};
  for (const role of roles) {
    cookiesByRole[role] = await loadCookies(role);
    if (cookiesByRole[role].length === 0) {
      console.log(`Warning: No cookies found for role "${role}". Run "npm run capture-session -- ${role}" first.`);
    }
  }

  console.log(`Fetching ${entries.length} site(s)...\n`);

  const browser = await puppeteer.launch({ headless: true });

  for (const [siteId, config] of entries) {
    try {
      const page = await browser.newPage();

      if (config.auth && cookiesByRole[config.auth]?.length > 0) {
        await page.setCookie(...cookiesByRole[config.auth]);
      }

      console.log(`  ${siteId}: ${config.url}${config.auth ? ` (${config.auth})` : ''}`);
      await page.goto(config.url, { waitUntil: 'networkidle0', timeout: 30000 });

      const html = await page.content();
      await writeHTML(siteId, html);
      console.log(`    Saved (${html.length} chars)`);

      await page.close();
    } catch (err) {
      console.error(`    Error fetching ${siteId}: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\nDone. HTML files saved to data/raw_sites/');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
