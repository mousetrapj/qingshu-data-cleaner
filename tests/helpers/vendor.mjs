import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';

const requireBuiltin = createRequire(import.meta.url);
let cached;

/**
 * Load a trusted, checked-in browser bundle as CommonJS.
 * This is a module wrapper, not a sandbox for untrusted code. Only the two
 * fixed repository assets below are loaded; no package installation or
 * environment-specific module path is consulted.
 */
function loadVendor(filename) {
  const location = fileURLToPath(new URL(`../../dist/vendor/${filename}`, import.meta.url));
  const module = { exports: {} };
  const localRequire = specifier => {
    if (specifier !== 'stream' && specifier !== 'node:stream') {
      throw new Error(`Unexpected external dependency in ${filename}: ${specifier}`);
    }
    return requireBuiltin('node:stream');
  };
  const wrapper = compileFunction(
    readFileSync(location, 'utf8'),
    ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename: location },
  );
  wrapper(module.exports, localRequire, module, location, path.dirname(location));
  return module.exports;
}

/** Install the same JSZip and SAX assets used by the browser app. */
export function setupVendor() {
  if (!cached) {
    const JSZip = loadVendor('jszip.min.js');
    const sax = loadVendor('sax.js');
    if (typeof JSZip !== 'function' || typeof sax.parser !== 'function') {
      throw new Error('The checked-in spreadsheet vendor assets could not be loaded.');
    }
    cached = { JSZip, sax };
  }
  globalThis.JSZip = cached.JSZip;
  globalThis.sax = cached.sax;
  return cached;
}
