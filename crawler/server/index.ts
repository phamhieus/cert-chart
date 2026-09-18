/**
 * Standalone server for a built app: serves `dist/` plus the crawl API, so a
 * deployed instance can still refresh its own data. `npm run serve`
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './crawlApi';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '../../dist');
const PORT = Number(process.env.PORT ?? 4173);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function resolveStaticPath(pathname: string): string | null {
  // normalize + prefix check keeps `..` segments from escaping dist/
  const candidate = normalize(join(DIST, decodeURIComponent(pathname)));
  if (!candidate.startsWith(DIST)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const indexFile = join(DIST, 'index.html');
  return existsSync(indexFile) ? indexFile : null;
}

const server = createServer((req, res) => {
  void handleApiRequest(req, res).then((handled) => {
    if (handled) return;

    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = resolveStaticPath(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. Run `npm run build` first.');
      return;
    }

    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.endsWith('.html') ? 'no-store' : 'public, max-age=3600',
    });
    createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${DIST} on http://localhost:${PORT}`);
});
