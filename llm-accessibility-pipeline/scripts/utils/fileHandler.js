import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

export function getProjectRoot() {
  return projectRoot;
}

function resolvePath(...segments) {
  return path.join(projectRoot, ...segments);
}

// --- HTML read/write ---

export async function readHTML(siteId) {
  const filePath = resolvePath('data', 'raw_sites', `${siteId}.html`);
  return fs.readFile(filePath, 'utf-8');
}

export async function writeHTML(siteId, html) {
  const filePath = resolvePath('data', 'raw_sites', `${siteId}.html`);
  await fs.ensureDir(path.dirname(filePath));
  return fs.writeFile(filePath, html, 'utf-8');
}

export async function readModifiedHTML(promptName, siteId) {
  const filePath = resolvePath('data', promptName, 'modified_sites', `${siteId}.html`);
  return fs.readFile(filePath, 'utf-8');
}

export async function writeModifiedHTML(promptName, siteId, html) {
  const filePath = resolvePath('data', promptName, 'modified_sites', `${siteId}.html`);
  await fs.ensureDir(path.dirname(filePath));
  return fs.writeFile(filePath, html, 'utf-8');
}

// --- JSON read/write ---

export async function readJSON(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : resolvePath(filePath);
  return fs.readJson(fullPath);
}

export async function writeJSON(filePath, data) {
  const fullPath = path.isAbsolute(filePath) ? filePath : resolvePath(filePath);
  await fs.ensureDir(path.dirname(fullPath));
  return fs.writeJson(fullPath, data, { spaces: 2 });
}

// --- Site listing ---

export async function listSiteIds() {
  const dir = resolvePath('data', 'raw_sites');
  const files = await fs.readdir(dir);
  return files
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''))
    .sort();
}

// --- Prompt templates ---

export async function readPromptTemplate(promptName) {
  const filePath = resolvePath('prompts', `${promptName}.txt`);
  return fs.readFile(filePath, 'utf-8');
}

// --- URL and cookie loading ---

export async function loadUrls() {
  return readJSON('data/urls.json');
}

export async function loadCookies() {
  const filePath = resolvePath('data', 'cookies.json');
  if (await fs.pathExists(filePath)) {
    return fs.readJson(filePath);
  }
  return [];
}
