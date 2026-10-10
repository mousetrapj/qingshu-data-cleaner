import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(filename);
    return entry.isFile() && /\.test\.(?:mjs|cjs|js)$/.test(entry.name) ? [filename] : [];
  }).sort();
}

const files = findTests(path.join(root, 'tests'));
if (!files.length) {
  console.error('No test files were found in tests/.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
