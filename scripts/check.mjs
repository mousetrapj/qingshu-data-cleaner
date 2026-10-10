import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : entry.isFile() ? [filename] : [];
  }).sort();
}

function localReferences(filename, text) {
  const refs = [];
  const add = (expression, source = text) => {
    for (const match of source.matchAll(expression)) refs.push(match[1]);
  };
  const extension = path.extname(filename);
  if (extension === '.html') {
    const html = text.replace(/<!--[\s\S]*?-->/g, '');
    for (const match of html.matchAll(/<(?:script|link|img|source|video|audio|iframe|use)\b[^>]*>/gi)) {
      add(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi, match[0]);
    }
  } else if (['.js', '.mjs'].includes(extension)) {
    add(/\b(?:import|export)\s+[^;]*?\s+from\s*["']([^"']+)["']/g);
    add(/\bimport\s*["']([^"']+)["']/g);
    add(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
    add(/\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g);
  } else if (extension === '.css') {
    add(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi);
    add(/@import\s*["']([^"']+)["']/gi);
  }
  return [...new Set(refs)];
}

function isInside(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const errors = [];
const sourceFiles = ['dist', 'scripts', 'tests'].flatMap(directory => filesIn(path.join(root, directory)));
const javascript = sourceFiles.filter(filename => /\.(?:js|mjs|cjs)$/.test(filename));
for (const filename of javascript) {
  const result = spawnSync(process.execPath, ['--check', filename], { cwd: root, encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) {
    errors.push(`${path.relative(root, filename)}: ${result.error?.message || result.stderr.trim() || 'JavaScript syntax check failed.'}`);
  }
}

let referenceCount = 0;
const realDist = realpathSync(dist);
for (const filename of filesIn(dist).filter(file => /\.(?:html|css|js|mjs)$/.test(file) && !file.startsWith(path.join(dist, 'vendor') + path.sep))) {
  for (const reference of localReferences(filename, readFileSync(filename, 'utf8'))) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) continue;
    referenceCount++;
    try {
      const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      if (!clean) continue;
      const target = clean.startsWith('/') ? path.resolve(dist, `.${clean}`) : path.resolve(path.dirname(filename), clean);
      const realTarget = realpathSync(target);
      if (!isInside(realDist, realTarget) || !statSync(realTarget).isFile()) {
        throw new Error('Reference is not a file within dist/.');
      }
    } catch (error) {
      errors.push(`${path.relative(root, filename)} → ${reference}: ${error.code === 'ENOENT' ? 'Missing local asset.' : error.message}`);
    }
  }
}

if (errors.length) {
  console.error(`Static checks failed (${errors.length}):\n${errors.map(error => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Static checks passed: ${javascript.length} JavaScript files and ${referenceCount} local asset references.`);
}
