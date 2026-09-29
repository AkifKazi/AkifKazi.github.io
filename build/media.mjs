// Turns raw images/GIFs dropped into content/ into lean masters:
//   png/jpg/jpeg -> .webp (max 2000px wide)     gif -> .mp4 (silent, looping via <video>)
// The original is moved to originals/ (git-ignored) and Markdown references are updated.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const ORIGINALS = path.join(ROOT, 'originals');
const RAW = /\.(png|jpe?g|gif)$/i;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const raw = [...walk(CONTENT)].filter((f) => RAW.test(f));
if (!raw.length) process.exit(0);

if (process.env.CI) {
  console.error('Raw images/GIFs found in content/ (run `npm run media` locally first):\n' + raw.map((r) => '  ' + path.relative(ROOT, r)).join('\n'));
  process.exit(1);
}

const toMp4 = (src, dest) =>
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', "scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', dest]);

for (const file of raw) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const isGif = /\.gif$/i.test(ext);
  const newName = base + (isGif ? '.mp4' : '.webp');
  const dest = path.join(dir, newName);

  if (fs.statSync(file).size > 100 * 1024 * 1024) {
    console.warn(`skipped (over 100 MB): ${path.relative(ROOT, file)}`);
    continue;
  }
  try {
    if (!fs.existsSync(dest)) {
      if (isGif) await toMp4(file, dest);
      else await sharp(file).rotate().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toFile(dest);
    }
  } catch (err) {
    console.error(`failed: ${path.relative(ROOT, file)} — ${err.shortMessage || err.message}${isGif ? ' (is ffmpeg installed? brew install ffmpeg)' : ''}`);
    process.exitCode = 1;
    continue;
  }

  // point Markdown at the new file
  const md = path.join(dir, 'index.md');
  if (fs.existsSync(md)) {
    let text = fs.readFileSync(md, 'utf8');
    const old = path.basename(file);
    const forms = [old, encodeURIComponent(old), encodeURI(old)];
    for (const f of new Set(forms)) text = text.split(f).join(f === old ? newName : encodeURI(newName));
    fs.writeFileSync(md, text);
  }

  const keep = path.join(ORIGINALS, path.relative(CONTENT, file));
  fs.mkdirSync(path.dirname(keep), { recursive: true });
  fs.renameSync(file, keep);
  const a = fs.statSync(keep).size, b = fs.statSync(dest).size;
  console.log(`${path.relative(CONTENT, file)} -> ${newName}  (${(a / 1e6).toFixed(1)} MB -> ${(b / 1e6).toFixed(2)} MB)`);
}
