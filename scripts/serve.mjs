/** Minimal static server for previewing dist/ at http://localhost:4173 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(await readFile(join(DIST, '404.html')).catch(() => 'Not found'));
  }
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
