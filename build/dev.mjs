// Local preview: rebuilds when content/ or build/ change and serves dist/ at http://localhost:4321
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const base = new URL(process.env.SITE_URL || site.url).pathname.replace(/\/$/, '');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2' };

let building = false, again = false;
function build() {
  if (building) { again = true; return; }
  building = true;
  const p = spawn('node', ['build/media.mjs'], { cwd: ROOT, stdio: 'inherit' });
  p.on('exit', () => {
    const b = spawn('node', ['build/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
    b.on('exit', () => { building = false; if (again) { again = false; build(); } });
  });
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (base && p.startsWith(base)) p = p.slice(base.length) || '/';
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }).end(fs.existsSync(path.join(DIST, '404.html')) ? fs.readFileSync(path.join(DIST, '404.html')) : 'Not found'); return; }
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = Number(range[1] || 0), end = Number(range[2] || stat.size - 1);
    res.writeHead(206, { 'cache-control': 'no-store', 'content-type': type, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}${base}/`));

let timer;
for (const dir of ['content', 'build', 'public']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, (_, name) => {
    if (name && /\.(DS_Store)$/.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(build, 400);
  });
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) build();
