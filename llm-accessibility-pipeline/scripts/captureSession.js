import 'dotenv/config';
import puppeteer from 'puppeteer';
import readline from 'node:readline';
import { loadUrls, writeJSON } from './utils/fileHandler.js';

async function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\nLog in manually in the browser, then press Enter here to capture cookies...', () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const urls = await loadUrls();

  // Find the first URL that requires auth
  const authEntry = Object.entries(urls).find(([, config]) => config.auth);
  if (!authEntry) {
    console.log('No URLs with auth: true found in data/urls.json. Nothing to do.');
    process.exit(0);
  }

  const [siteId, config] = authEntry;
  console.log(`Opening ${config.url} (${siteId}) in browser...`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(config.url, { waitUntil: 'networkidle2' });

  await waitForEnter();

  const cookies = await page.cookies();
  await writeJSON('data/cookies.json', cookies);

  const cookieNames = cookies.map(c => c.name);
  console.log(`\nCaptured ${cookies.length} cookies: ${cookieNames.join(', ')}`);

  const hasSession = cookieNames.some(n => n.includes('session'));
  const hasXsrf = cookieNames.includes('XSRF-TOKEN');
  if (hasSession) console.log('  Session cookie found.');
  if (hasXsrf) console.log('  XSRF-TOKEN cookie found.');
  if (!hasSession && !hasXsrf) {
    console.log('  Warning: No session or XSRF-TOKEN cookie found. Login may not have worked.');
  }

  console.log('Cookies saved to data/cookies.json');

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
