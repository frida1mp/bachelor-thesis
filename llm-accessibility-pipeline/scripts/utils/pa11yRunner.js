import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import pa11y from 'pa11y';

export function startServer(directory) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const filePath = path.join(directory, decodeURIComponent(req.url));
        const content = await readFile(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });

    server.on('error', reject);
  });
}

export function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

export async function runPa11y(url, options = {}) {
  const defaults = {
    standard: 'WCAG2AA',
    runners: ['htmlcs'],
    chromeLaunchConfig: {
      args: ['--no-sandbox'],
    },
  };

  try {
    return await pa11y(url, { ...defaults, ...options });
  } catch (err) {
    return {
      pageUrl: url,
      documentTitle: '',
      issues: [],
      error: err.message,
    };
  }
}

export async function runPa11yOnDirectory(directory) {
  const files = await readdir(directory);
  const htmlFiles = files.filter(f => f.endsWith('.html')).sort();

  if (htmlFiles.length === 0) {
    console.log(`  No HTML files found in ${directory}`);
    return {};
  }

  const { server, port } = await startServer(directory);
  const results = {};

  for (const file of htmlFiles) {
    const siteId = file.replace('.html', '');
    const url = `http://127.0.0.1:${port}/${file}`;
    console.log(`  Scanning ${siteId}...`);

    const result = await runPa11y(url);
    results[siteId] = result;

    if (result.error) {
      console.log(`    Error: ${result.error}`);
    } else {
      const errors = result.issues.filter(i => i.type === 'error').length;
      const warnings = result.issues.filter(i => i.type === 'warning').length;
      console.log(`    Found ${result.issues.length} issues (${errors} errors, ${warnings} warnings)`);
    }
  }

  await stopServer(server);
  return results;
}
