import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const DIST_DIRECTORY = fileURLToPath(new URL('../dist/', import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Resolve one request without allowing access outside the static directory. */
export function resolveAssetPath(requestTarget, root = DIST_DIRECTORY) {
  const rawPath = String(requestTarget || '/').split(/[?#]/, 1)[0];
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    throw new RequestError(400, 'Invalid URL encoding.');
  }
  if (!pathname.startsWith('/') || /[\\:\u0000-\u001F\u007F]/.test(pathname)) {
    throw new RequestError(400, 'Invalid asset path.');
  }
  if (pathname.split('/').includes('..')) {
    throw new RequestError(403, 'Access outside the static directory is not allowed.');
  }
  const candidate = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!isInside(root, candidate)) throw new RequestError(403, 'Asset path is outside the static directory.');
  return candidate;
}

function sendError(response, method, status, message) {
  if (response.destroyed || response.headersSent) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(method === 'HEAD' ? undefined : `${message}\n`);
}

/** Create the handler separately so it can be checked without opening a port. */
export async function createStaticHandler(root = DIST_DIRECTORY) {
  const actualRoot = await realpath(root);
  return async (request, response) => {
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendError(response, method, 405, 'Only GET and HEAD are supported.');
      return;
    }
    try {
      const requestedPath = resolveAssetPath(request.url, actualRoot);
      const asset = await realpath(requestedPath);
      if (!isInside(actualRoot, asset)) throw new RequestError(403, 'Symbolic link points outside the static directory.');
      const info = await stat(asset);
      if (!info.isFile()) throw new RequestError(404, 'Asset not found.');
      response.statusCode = 200;
      response.setHeader('Content-Type', MIME_TYPES[path.extname(asset).toLowerCase()] || 'application/octet-stream');
      response.setHeader('Content-Length', String(info.size));
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (method === 'HEAD') response.end();
      else await pipeline(createReadStream(asset), response);
    } catch (error) {
      const status = error.status || (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : error.code === 'EACCES' ? 403 : 500);
      sendError(response, method, status, status === 500 ? 'Unable to read the requested asset.' : error.status ? error.message : 'Asset not found.');
    }
  };
}

export function parsePort(value = '4173') {
  const port = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

async function main() {
  const port = parsePort(process.env.PORT ?? '4173');
  const host = process.env.HOST || '127.0.0.1';
  const handler = await createStaticHandler();
  const server = createServer(handler);
  server.on('error', error => {
    console.error(`Development server failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const address = host.includes(':') ? `[${host}]` : host;
    console.log(`Qingshu: http://${address}:${port}`);
    console.log('Serving dist/ only. Press Ctrl+C to stop.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => { process.exitCode = 0; }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
