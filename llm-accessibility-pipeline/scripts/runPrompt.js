import 'dotenv/config';
import path from 'node:path';
import {
  getProjectRoot,
  listSiteIds,
  readHTML,
  readPromptTemplate,
  readJSON,
  writeModifiedHTML,
  writeJSON,
} from './utils/fileHandler.js';
import { runPa11yOnDirectory } from './utils/pa11yRunner.js';
import { sendToLLM } from './utils/llmClient.js';

function formatIssues(issues) {
  return issues
    .map((issue, i) => {
      const lines = [
        `Issue ${i + 1}: [${issue.type}] ${issue.code}`,
        `  Message: ${issue.message}`,
        `  Selector: ${issue.selector}`,
      ];
      if (issue.context) {
        lines.push(`  Context: ${issue.context}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

async function main() {
  const promptName = process.argv[2];
  if (!promptName || !['prompt1', 'prompt2'].includes(promptName)) {
    console.log('Usage: node scripts/runPrompt.js <prompt1|prompt2>');
    process.exit(1);
  }

  const siteIds = await listSiteIds();
  if (siteIds.length === 0) {
    console.log('No HTML files found in data/raw_sites/. Run "npm run fetch-sites" first.');
    process.exit(1);
  }

  const template = await readPromptTemplate(promptName);

  let baseline = null;
  if (promptName === 'prompt2') {
    try {
      baseline = await readJSON('data/baseline/results.json');
    } catch {
      console.log('Baseline results not found. Run "npm run baseline" first.');
      process.exit(1);
    }
  }

  console.log(`Running ${promptName} on ${siteIds.length} site(s)...\n`);

  const llmResults = {};

  for (const siteId of siteIds) {
    console.log(`  ${siteId}: Sending to Claude...`);

    try {
      const html = await readHTML(siteId);

      let systemPrompt = template;
      if (promptName === 'prompt2' && baseline?.sites?.[siteId]) {
        const issues = baseline.sites[siteId].issues || [];
        systemPrompt = template.replace('{{ISSUES}}', formatIssues(issues));
      }

      const result = await sendToLLM(systemPrompt, html);
      await writeModifiedHTML(promptName, siteId, result.html);

      llmResults[siteId] = {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        model: result.model,
        stopReason: result.stopReason,
      };

      if (result.stopReason === 'max_tokens') {
        console.log(`    Warning: Response truncated (hit max_tokens)`);
      } else {
        console.log(`    Done (${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens)`);
      }
    } catch (err) {
      console.error(`    Error: ${err.message}`);
      llmResults[siteId] = { error: err.message };
    }
  }

  // Run Pa11y on modified sites
  const modifiedDir = path.join(getProjectRoot(), 'data', promptName, 'modified_sites');
  console.log(`\nRunning Pa11y on modified sites...\n`);
  const pa11yResults = await runPa11yOnDirectory(modifiedDir);

  // Build output
  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      promptName,
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      standard: 'WCAG2AA',
      runner: 'htmlcs',
      siteCount: siteIds.length,
    },
    sites: {},
  };

  let totalIssues = 0;

  for (const [siteId, result] of Object.entries(pa11yResults)) {
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
      llmMetadata: llmResults[siteId] || {},
      ...(result.error && { error: result.error }),
    };

    totalIssues += issues.length;
  }

  await writeJSON(`data/${promptName}/results.json`, output);

  console.log(`\n${promptName} complete. ${siteIds.length} sites processed. Total issues: ${totalIssues}`);
  console.log(`Results saved to data/${promptName}/results.json`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
