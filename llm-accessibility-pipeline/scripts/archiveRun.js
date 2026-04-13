import 'dotenv/config';
import path from 'node:path';
import fs from 'fs-extra';
import { getProjectRoot, readJSON } from './utils/fileHandler.js';

async function main() {
  const root = getProjectRoot();

  // Use the comparison timestamp as the run ID so it matches the analyze output
  let runId;
  try {
    const comparison = await readJSON('results/comparison.json');
    runId = comparison.metadata.timestamp.replace(/[:.]/g, '-');
  } catch {
    runId = new Date().toISOString().replace(/[:.]/g, '-');
  }

  const runDir = path.join(root, 'runs', runId);
  await fs.ensureDir(runDir);

  console.log(`Archiving run to runs/${runId}/`);

  // Copy all result data + the inputs (prompts, urls) for full reproducibility
  const itemsToCopy = [
    { src: 'data/baseline', dest: 'baseline' },
    { src: 'data/prompt1', dest: 'prompt1' },
    { src: 'data/prompt2', dest: 'prompt2' },
    { src: 'data/urls.json', dest: 'urls.json' },
    { src: 'results/comparison.json', dest: 'comparison.json' },
    { src: 'results/summary.txt', dest: 'summary.txt' },
    { src: 'prompts', dest: 'prompts' },
  ];

  for (const { src, dest } of itemsToCopy) {
    const srcPath = path.join(root, src);
    const destPath = path.join(runDir, dest);
    if (await fs.pathExists(srcPath)) {
      await fs.copy(srcPath, destPath);
      console.log(`  ${src} -> runs/${runId}/${dest}`);
    }
  }

  console.log(`\nArchive complete: runs/${runId}/`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
