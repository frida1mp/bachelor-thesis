import 'dotenv/config';
import { readJSON, writeJSON, getProjectRoot } from './utils/fileHandler.js';
import fs from 'fs-extra';
import path from 'node:path';

function pct(reduced, total) {
  if (total === 0) return 'N/A';
  return ((reduced / total) * 100).toFixed(1) + '%';
}

async function main() {
  let baseline, prompt1Results, prompt2Results;

  try {
    baseline = await readJSON('data/baseline/results.json');
  } catch {
    console.log('Baseline results not found. Run "npm run baseline" first.');
    process.exit(1);
  }

  try {
    prompt1Results = await readJSON('data/prompt1/results.json');
  } catch {
    console.log('Prompt1 results not found. Run "npm run prompt1" first.');
    process.exit(1);
  }

  try {
    prompt2Results = await readJSON('data/prompt2/results.json');
  } catch {
    console.log('Prompt2 results not found. Run "npm run prompt2" first.');
    process.exit(1);
  }

  const siteIds = Object.keys(baseline.sites).sort();
  const perSite = [];

  for (const siteId of siteIds) {
    const b = baseline.sites[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };
    const p1 = prompt1Results.sites?.[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };
    const p2 = prompt2Results.sites?.[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };

    perSite.push({
      siteId,
      baseline: { errors: b.errorCount, warnings: b.warningCount, total: b.issueCount },
      prompt1: { errors: p1.errorCount, warnings: p1.warningCount, total: p1.issueCount },
      prompt2: { errors: p2.errorCount, warnings: p2.warningCount, total: p2.issueCount },
      prompt1Improvement: {
        errorsReduced: b.errorCount - p1.errorCount,
        warningsReduced: b.warningCount - p1.warningCount,
        totalReduced: b.issueCount - p1.issueCount,
        errorReductionPct: pct(b.errorCount - p1.errorCount, b.errorCount),
        warningReductionPct: pct(b.warningCount - p1.warningCount, b.warningCount),
        totalReductionPct: pct(b.issueCount - p1.issueCount, b.issueCount),
      },
      prompt2Improvement: {
        errorsReduced: b.errorCount - p2.errorCount,
        warningsReduced: b.warningCount - p2.warningCount,
        totalReduced: b.issueCount - p2.issueCount,
        errorReductionPct: pct(b.errorCount - p2.errorCount, b.errorCount),
        warningReductionPct: pct(b.warningCount - p2.warningCount, b.warningCount),
        totalReductionPct: pct(b.issueCount - p2.issueCount, b.issueCount),
      },
    });
  }

  // Aggregate
  const sum = (arr, key) => arr.reduce((s, item) => s + item[key], 0);

  const aggBaseline = { totalErrors: sum(perSite.map(s => s.baseline), 'errors'), totalWarnings: sum(perSite.map(s => s.baseline), 'warnings'), totalIssues: sum(perSite.map(s => s.baseline), 'total') };
  const aggPrompt1 = { totalErrors: sum(perSite.map(s => s.prompt1), 'errors'), totalWarnings: sum(perSite.map(s => s.prompt1), 'warnings'), totalIssues: sum(perSite.map(s => s.prompt1), 'total') };
  const aggPrompt2 = { totalErrors: sum(perSite.map(s => s.prompt2), 'errors'), totalWarnings: sum(perSite.map(s => s.prompt2), 'warnings'), totalIssues: sum(perSite.map(s => s.prompt2), 'total') };

  const comparison = {
    metadata: {
      timestamp: new Date().toISOString(),
      totalSites: siteIds.length,
      baselineTimestamp: baseline.metadata.timestamp,
      prompt1Timestamp: prompt1Results.metadata.timestamp,
      prompt2Timestamp: prompt2Results.metadata.timestamp,
      model: prompt1Results.metadata.model,
    },
    aggregate: {
      baseline: aggBaseline,
      prompt1: aggPrompt1,
      prompt2: aggPrompt2,
    },
    prompt1VsBaseline: {
      totalReduction: aggBaseline.totalIssues - aggPrompt1.totalIssues,
      totalReductionPct: pct(aggBaseline.totalIssues - aggPrompt1.totalIssues, aggBaseline.totalIssues),
      avgReductionPerSite: siteIds.length > 0 ? ((aggBaseline.totalIssues - aggPrompt1.totalIssues) / siteIds.length).toFixed(1) : 0,
    },
    prompt2VsBaseline: {
      totalReduction: aggBaseline.totalIssues - aggPrompt2.totalIssues,
      totalReductionPct: pct(aggBaseline.totalIssues - aggPrompt2.totalIssues, aggBaseline.totalIssues),
      avgReductionPerSite: siteIds.length > 0 ? ((aggBaseline.totalIssues - aggPrompt2.totalIssues) / siteIds.length).toFixed(1) : 0,
    },
    prompt2VsPrompt1: {
      additionalReduction: aggPrompt1.totalIssues - aggPrompt2.totalIssues,
      additionalReductionPct: pct(aggPrompt1.totalIssues - aggPrompt2.totalIssues, aggPrompt1.totalIssues),
    },
    perSite,
  };

  await writeJSON('results/comparison.json', comparison);

  // Build summary text
  const lines = [
    'LLM Accessibility Improvement - Results Summary',
    '================================================',
    `Date: ${comparison.metadata.timestamp}`,
    `Model: ${comparison.metadata.model}`,
    `Sites tested: ${siteIds.length}`,
    `Standard: WCAG2AA`,
    '',
    'BASELINE',
    `  Total issues: ${aggBaseline.totalIssues} (${aggBaseline.totalErrors} errors, ${aggBaseline.totalWarnings} warnings)`,
    '',
    'PROMPT 1 (General instruction)',
    `  Total issues: ${aggPrompt1.totalIssues} (${aggPrompt1.totalErrors} errors, ${aggPrompt1.totalWarnings} warnings)`,
    `  Reduction: ${comparison.prompt1VsBaseline.totalReduction} issues (${comparison.prompt1VsBaseline.totalReductionPct})`,
    '',
    'PROMPT 2 (Targeted with Pa11y issues)',
    `  Total issues: ${aggPrompt2.totalIssues} (${aggPrompt2.totalErrors} errors, ${aggPrompt2.totalWarnings} warnings)`,
    `  Reduction: ${comparison.prompt2VsBaseline.totalReduction} issues (${comparison.prompt2VsBaseline.totalReductionPct})`,
    '',
    'PROMPT 2 vs PROMPT 1',
    `  Additional reduction: ${comparison.prompt2VsPrompt1.additionalReduction} issues (${comparison.prompt2VsPrompt1.additionalReductionPct})`,
    '',
    'PER-SITE BREAKDOWN',
    '-'.repeat(60),
    'Site'.padEnd(15) + '| Baseline'.padEnd(12) + '| Prompt1'.padEnd(12) + '| Prompt2'.padEnd(12),
    '-'.repeat(60),
  ];

  for (const site of perSite) {
    lines.push(
      site.siteId.padEnd(15) +
        `| ${String(site.baseline.total).padEnd(10)}` +
        `| ${String(site.prompt1.total).padEnd(10)}` +
        `| ${String(site.prompt2.total).padEnd(10)}`
    );
  }

  lines.push('-'.repeat(60));
  lines.push('');

  const summaryPath = path.join(getProjectRoot(), 'results', 'summary.txt');
  await fs.ensureDir(path.dirname(summaryPath));
  await fs.writeFile(summaryPath, lines.join('\n'), 'utf-8');

  console.log(lines.join('\n'));
  console.log('\nResults saved to:');
  console.log('  results/comparison.json');
  console.log('  results/summary.txt');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
