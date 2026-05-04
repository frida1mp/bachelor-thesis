import 'dotenv/config';
import {
  listSiteIds,
  readHTML,
  readPromptTemplate,
  writeJSON,
} from './utils/fileHandler.js';
import { sendToLLM } from './utils/llmClient.js';

function extractJSON(responseText) {
  // Try JSON code fence
  const fenceMatch = responseText.match(/```json\s*\n([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());

  // Try any code fence
  const anyFence = responseText.match(/```\s*\n([\s\S]*?)```/);
  if (anyFence) return JSON.parse(anyFence[1].trim());

  // Try raw JSON object
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0].trim());

  throw new Error('Could not extract JSON from LLM response');
}

async function main() {
  const siteIds = await listSiteIds();
  if (siteIds.length === 0) {
    console.log('No HTML files found in data/raw_sites/. Run "npm run fetch-sites" first.');
    process.exit(1);
  }

  const systemPrompt = await readPromptTemplate('classifyTheme');

  console.log(`Classifying themes for ${siteIds.length} site(s)...\n`);

  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      siteCount: siteIds.length,
    },
    sites: {},
  };

  for (const siteId of siteIds) {
    console.log(`  ${siteId}: Classifying...`);

    try {
      const html = await readHTML(siteId);
      const result = await sendToLLM(systemPrompt, html);
      const classification = extractJSON(result.rawResponse);

      output.sites[siteId] = {
        ...classification,
        llmMetadata: {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          model: result.model,
          stopReason: result.stopReason,
        },
      };

      console.log(`    ${classification.primaryTheme} (${classification.confidence})`);
    } catch (err) {
      console.error(`    Error: ${err.message}`);
      output.sites[siteId] = { error: err.message };
    }
  }

  await writeJSON('data/themes/results.json', output);

  console.log(`\nClassification complete. Results saved to data/themes/results.json`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
