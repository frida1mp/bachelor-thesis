import 'dotenv/config';
import path from 'node:path';
import { getProjectRoot, listSiteIds, writeJSON } from './utils/fileHandler.js';
import { runPa11yOnDirectory } from './utils/pa11yRunner.js';

async function main() {
  const rawSitesDir = path.join(getProjectRoot(), 'data', 'raw_sites');
  const siteIds = await listSiteIds();

  if (siteIds.length === 0) {
    console.log('No HTML files found in data/raw_sites/. Run "npm run fetch-sites" first.');
    process.exit(1);
  }

  console.log(`Running baseline Pa11y scan on ${siteIds.length} site(s)...\n`);

  const results = await runPa11yOnDirectory(rawSitesDir);

  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      standard: 'WCAG2AA',
      runner: 'htmlcs',
      siteCount: Object.keys(results).length,
    },
    sites: {},
  };

  let totalIssues = 0;

  for (const [siteId, result] of Object.entries(results)) {
    const issues = result.issues || [];
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    output.sites[siteId] = {
      pageUrl: result.pageUrl,
      documentTitle: result.documentTitle || '',
      issueCount: issues.length,
      errorCount,
      warningCount,
      issues,
      ...(result.error && { error: result.error }),
    };

    totalIssues += issues.length;
  }

  await writeJSON('data/baseline/results.json', output);

  console.log(`\nBaseline complete. ${siteIds.length} sites tested. Total issues: ${totalIssues}`);
  console.log('Results saved to data/baseline/results.json');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
