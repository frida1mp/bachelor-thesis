import 'dotenv/config';
import { readJSON, writeJSON, getProjectRoot, listSiteIds, readHTML } from './utils/fileHandler.js';
import fs from 'fs-extra';
import path from 'node:path';

function pct(reduced, total) {
  if (total === 0) return 'N/A';
  return ((reduced / total) * 100).toFixed(1) + '%';
}

const CRITERION_NAMES = {
  '1.1.1': 'Non-text Content',
  '1.2.1': 'Audio-only and Video-only',
  '1.2.2': 'Captions (Prerecorded)',
  '1.2.3': 'Audio Description or Media Alternative',
  '1.2.5': 'Audio Description (Prerecorded)',
  '1.3.1': 'Info and Relationships',
  '1.3.2': 'Meaningful Sequence',
  '1.3.3': 'Sensory Characteristics',
  '1.3.4': 'Orientation',
  '1.3.5': 'Identify Input Purpose',
  '1.4.1': 'Use of Color',
  '1.4.2': 'Audio Control',
  '1.4.3': 'Contrast (Minimum)',
  '1.4.4': 'Resize Text',
  '1.4.5': 'Images of Text',
  '1.4.10': 'Reflow',
  '1.4.11': 'Non-text Contrast',
  '1.4.12': 'Text Spacing',
  '1.4.13': 'Content on Hover or Focus',
  '2.1.1': 'Keyboard',
  '2.1.2': 'No Keyboard Trap',
  '2.2.1': 'Timing Adjustable',
  '2.2.2': 'Pause, Stop, Hide',
  '2.3.1': 'Three Flashes or Below Threshold',
  '2.4.1': 'Bypass Blocks',
  '2.4.2': 'Page Titled',
  '2.4.3': 'Focus Order',
  '2.4.4': 'Link Purpose (In Context)',
  '2.4.5': 'Multiple Ways',
  '2.4.6': 'Headings and Labels',
  '2.4.7': 'Focus Visible',
  '2.5.1': 'Pointer Gestures',
  '2.5.2': 'Pointer Cancellation',
  '2.5.3': 'Label in Name',
  '2.5.4': 'Motion Actuation',
  '3.1.1': 'Language of Page',
  '3.1.2': 'Language of Parts',
  '3.2.1': 'On Focus',
  '3.2.2': 'On Input',
  '3.2.3': 'Consistent Navigation',
  '3.2.4': 'Consistent Identification',
  '3.3.1': 'Error Identification',
  '3.3.2': 'Labels or Instructions',
  '3.3.3': 'Error Suggestion',
  '3.3.4': 'Error Prevention (Legal, Financial, Data)',
  '4.1.1': 'Parsing',
  '4.1.2': 'Name, Role, Value',
  '4.1.3': 'Status Messages',
};

function parseWcagCode(code) {
  const parts = code.split('.');
  const principle = parts[1] || '';
  const criterion = (parts[3] || '').replace(/_/g, '.');
  return { principle, criterion };
}

function computeComplexity(html) {
  const countMatches = (pattern) => (html.match(pattern) || []).length;

  const totalElements = countMatches(/<[a-z][a-z0-9]*[\s>]/gi);
  const buttons = countMatches(/<button[\s>]/gi);
  const inputs = countMatches(/<input[\s>]/gi);
  const selects = countMatches(/<select[\s>]/gi);
  const textareas = countMatches(/<textarea[\s>]/gi);
  const links = countMatches(/<a[\s][^>]*href/gi);
  const images = countMatches(/<img[\s>]/gi);
  const headings = countMatches(/<h[1-6][\s>]/gi);
  const forms = countMatches(/<form[\s>]/gi);
  const labels = countMatches(/<label[\s>]/gi);
  const ariaAttributes = countMatches(/aria-[a-z]+=/gi);
  const roleAttributes = countMatches(/role="/gi);

  const interactiveElements = buttons + inputs + selects + textareas + links;
  const formElements = inputs + selects + textareas + labels;

  return {
    fileSize: html.length,
    totalElements,
    interactiveElements,
    formElements,
    buttons,
    inputs,
    links,
    images,
    headings,
    forms,
    ariaAttributes,
    roleAttributes,
  };
}

function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return Number((num / den).toFixed(3));
}

function countByCriterion(sites) {
  const counts = {};
  for (const site of Object.values(sites)) {
    for (const issue of (site.issues || [])) {
      const { criterion } = parseWcagCode(issue.code);
      counts[criterion] = (counts[criterion] || 0) + 1;
    }
  }
  return counts;
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

  // Compute complexity for each site
  const complexityMap = {};
  for (const siteId of siteIds) {
    try {
      const html = await readHTML(siteId);
      complexityMap[siteId] = computeComplexity(html);
    } catch {
      complexityMap[siteId] = null;
    }
  }

  for (const siteId of siteIds) {
    const b = baseline.sites[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };
    const p1 = prompt1Results.sites?.[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };
    const p2 = prompt2Results.sites?.[siteId] || { issueCount: 0, errorCount: 0, warningCount: 0 };

    perSite.push({
      siteId,
      complexity: complexityMap[siteId],
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

  // Per-criterion breakdown
  const baselineByCrit = countByCriterion(baseline.sites);
  const prompt1ByCrit = countByCriterion(prompt1Results.sites || {});
  const prompt2ByCrit = countByCriterion(prompt2Results.sites || {});

  const allCriteria = new Set([
    ...Object.keys(baselineByCrit),
    ...Object.keys(prompt1ByCrit),
    ...Object.keys(prompt2ByCrit),
  ]);

  comparison.byCriterion = [...allCriteria]
    .sort((a, b) => (baselineByCrit[b] || 0) - (baselineByCrit[a] || 0))
    .map(criterion => {
      const bCount = baselineByCrit[criterion] || 0;
      const p1Count = prompt1ByCrit[criterion] || 0;
      const p2Count = prompt2ByCrit[criterion] || 0;
      return {
        criterion,
        name: CRITERION_NAMES[criterion] || criterion,
        baseline: bCount,
        prompt1: p1Count,
        prompt2: p2Count,
        prompt1ReductionPct: pct(bCount - p1Count, bCount),
        prompt2ReductionPct: pct(bCount - p2Count, bCount),
      };
    });

  // Correlation: complexity vs reduction percentages
  const sitesWithComplexity = perSite.filter(s => s.complexity && s.baseline.total > 0);
  const complexityMetrics = ['totalElements', 'interactiveElements', 'formElements', 'fileSize'];
  const correlations = {};

  for (const metric of complexityMetrics) {
    const xs = sitesWithComplexity.map(s => s.complexity[metric]);
    const p1Ys = sitesWithComplexity.map(s => {
      const red = (s.baseline.total - s.prompt1.total) / s.baseline.total * 100;
      return red;
    });
    const p2Ys = sitesWithComplexity.map(s => {
      const red = (s.baseline.total - s.prompt2.total) / s.baseline.total * 100;
      return red;
    });

    correlations[metric] = {
      vsPrompt1Reduction: pearsonCorrelation(xs, p1Ys),
      vsPrompt2Reduction: pearsonCorrelation(xs, p2Ys),
    };
  }

  comparison.complexity = { correlations };

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

  // Per-criterion breakdown
  lines.push('PER-CRITERION BREAKDOWN');
  lines.push('-'.repeat(80));
  lines.push(
    'Criterion'.padEnd(10) +
      '| Name'.padEnd(32) +
      '| Base'.padEnd(8) +
      '| P1'.padEnd(8) +
      '| P2'.padEnd(8) +
      '| P1 Red.'.padEnd(10) +
      '| P2 Red.'
  );
  lines.push('-'.repeat(80));

  for (const c of comparison.byCriterion) {
    lines.push(
      c.criterion.padEnd(10) +
        `| ${c.name.slice(0, 28).padEnd(30)}` +
        `| ${String(c.baseline).padEnd(6)}` +
        `| ${String(c.prompt1).padEnd(6)}` +
        `| ${String(c.prompt2).padEnd(6)}` +
        `| ${c.prompt1ReductionPct.padEnd(8)}` +
        `| ${c.prompt2ReductionPct}`
    );
  }

  lines.push('-'.repeat(80));
  lines.push('');

  // Page complexity breakdown
  lines.push('PAGE COMPLEXITY');
  lines.push('-'.repeat(95));
  lines.push(
    'Site'.padEnd(10) +
      '| Elements'.padEnd(11) +
      '| Interactive'.padEnd(14) +
      '| Forms'.padEnd(9) +
      '| Headings'.padEnd(11) +
      '| ARIA'.padEnd(8) +
      '| Size'.padEnd(10) +
      '| Base'.padEnd(7) +
      '| P1 Red%'.padEnd(10) +
      '| P2 Red%'
  );
  lines.push('-'.repeat(95));

  for (const site of perSite) {
    const c = site.complexity;
    if (!c) continue;
    const p1Red = site.baseline.total > 0
      ? ((site.baseline.total - site.prompt1.total) / site.baseline.total * 100).toFixed(0) + '%'
      : 'N/A';
    const p2Red = site.baseline.total > 0
      ? ((site.baseline.total - site.prompt2.total) / site.baseline.total * 100).toFixed(0) + '%'
      : 'N/A';
    lines.push(
      site.siteId.padEnd(10) +
        `| ${String(c.totalElements).padEnd(9)}` +
        `| ${String(c.interactiveElements).padEnd(12)}` +
        `| ${String(c.formElements).padEnd(7)}` +
        `| ${String(c.headings).padEnd(9)}` +
        `| ${String(c.ariaAttributes).padEnd(6)}` +
        `| ${String(c.fileSize).padEnd(8)}` +
        `| ${String(site.baseline.total).padEnd(5)}` +
        `| ${p1Red.padEnd(8)}` +
        `| ${p2Red}`
    );
  }

  lines.push('-'.repeat(95));
  lines.push('');

  // Correlation summary
  lines.push('COMPLEXITY vs REDUCTION CORRELATION (Pearson r)');
  lines.push('-'.repeat(60));
  lines.push(
    'Metric'.padEnd(25) +
      '| vs P1 Red.'.padEnd(18) +
      '| vs P2 Red.'
  );
  lines.push('-'.repeat(60));

  const metricLabels = {
    totalElements: 'Total Elements',
    interactiveElements: 'Interactive Elements',
    formElements: 'Form Elements',
    fileSize: 'File Size',
  };

  for (const [metric, label] of Object.entries(metricLabels)) {
    const corr = comparison.complexity.correlations[metric];
    const p1 = corr.vsPrompt1Reduction !== null ? String(corr.vsPrompt1Reduction) : 'N/A';
    const p2 = corr.vsPrompt2Reduction !== null ? String(corr.vsPrompt2Reduction) : 'N/A';
    lines.push(
      label.padEnd(25) +
        `| ${p1.padEnd(16)}` +
        `| ${p2}`
    );
  }

  lines.push('-'.repeat(60));
  lines.push('Note: r close to -1 = more complex pages see less reduction');
  lines.push('      r close to 0 = no correlation');
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
