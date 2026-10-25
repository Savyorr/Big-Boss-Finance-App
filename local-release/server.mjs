// Static production host only. Financial records remain in the browser's IndexedDB.
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), 'app'));
const port = 47831, origin = `http://127.0.0.1:${port}`;
const identity = 'big-boss-finance-local-v1';
const open = () => {
  if (!process.argv.includes('--open')) return;
  const command = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', origin]] : process.platform === 'darwin' ? ['open', [origin]] : ['xdg-open', [origin]];
  execFile(command[0], command[1], (error) => { if (error) console.error(`Open your browser at ${origin}`); });
};
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2', '.png':'image/png' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-cache');
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end('Use the saved launcher address.'); return; }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  if (req.url === '/__health') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ application:identity })); return; }
  try {
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) { res.writeHead(400).end(); return; }
    const file = await realpath(resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    const body = await readFile(file);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('File not found.'); }
});
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(origin + '/__health', { signal: AbortSignal.timeout(2000) });
      if ((await response.json()).application === identity) { open(); return; }
    } catch {}
    console.error(`Port ${port} is used by another program. Close it and try again. The finance application has not changed its storage address.`);
  } else console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => { console.log(`Big Boss Finance: ${origin}\nKeep this helper running while using the app. Closing it does not delete financial records.`); open(); });
