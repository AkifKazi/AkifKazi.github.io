import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import sharp from 'sharp';
import { createMarkdown, esc, preprocess, slugify, youtubeId } from './render.mjs';
import { footer, layout, markBig, markLink, toggleButton } from './layout.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const siteUrl = (process.env.SITE_URL || site.url).replace(/\/$/, '');
const base = new URL(siteUrl).pathname.replace(/\/$/, '');
const year = new Date().getFullYear();
const WIDTHS = [360, 720, 1080, 1440];
const IMG = /\.(webp|png|jpe?g|avif)$/i;
const VID = /\.(mp4|webm|gif)$/i;
const t0 = Date.now();

const href = (route = '') => `${base}/${route ? route + '/' : ''}`;
const abs = (route = '') => `${siteUrl}/${route ? route + '/' : ''}`;
const exists = (p) => fs.existsSync(p);
const mtime = (p) => fs.statSync(p).mtimeMs;
const fresh = (out, src) => exists(out) && mtime(out) >= mtime(src);
const mkdir = (p) => fsp.mkdir(p, { recursive: true });

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}

let ffmpegOk;
async function ffmpeg(args) {
  if (ffmpegOk === undefined) {
    try { await run('ffmpeg', ['-version']); ffmpegOk = true; } catch { ffmpegOk = false; }
  }
  if (!ffmpegOk) throw new Error('ffmpeg is required for video posters (brew install ffmpeg)');
  return run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

/* ---------- media ---------- */
async function imageAsset(file, route) {
  const name = slugify(path.basename(file, path.extname(file)));
  const cdir = path.join(CACHE, 'media', route);
  await mkdir(cdir);
  const meta = await sharp(file).rotate().metadata();
  const [w, h] = meta.orientation >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const widths = [...new Set([...WIDTHS.filter((x) => x < w), Math.min(w, WIDTHS.at(-1))])].sort((a, b) => a - b);
  for (const width of widths) {
    const out = path.join(cdir, `${name}-${width}.avif`);
    if (!fresh(out, file)) await sharp(file).rotate().resize({ width, withoutEnlargement: true }).avif({ quality: 58, effort: 4 }).toFile(out);
  }
  return { kind: 'img', name, w, h, widths, cache: widths.map((x) => `${name}-${x}.avif`), source: file };
}

async function videoAsset(file, route) {
  const name = slugify(path.basename(file, path.extname(file)));
  const cdir = path.join(CACHE, 'media', route);
  await mkdir(cdir);
  let mp4 = file;
  if (/\.gif$/i.test(file)) {
    mp4 = path.join(cdir, `${name}.mp4`);
    if (!fresh(mp4, file)) await ffmpeg(['-i', file, '-vf', "scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', mp4]);
  }
  const png = path.join(cdir, `${name}-poster.png`);
  const poster = path.join(cdir, `${name}-poster.avif`);
  if (!fresh(png, file)) await ffmpeg(['-i', mp4, '-frames:v', '1', png]);
  const { width: w, height: h } = await sharp(png).metadata();
  if (!fresh(poster, file)) await sharp(png).resize({ width: 1080, withoutEnlargement: true }).avif({ quality: 55, effort: 4 }).toFile(poster);
  return { kind: 'video', name, w, h, file: `${name}${path.extname(mp4)}`, poster: `${name}-poster.avif`, cacheDir: cdir, mp4Path: mp4, source: png };
}

async function ytThumb(id, route) {
  await mkdir(path.join(CACHE, 'yt'));
  const jpg = path.join(CACHE, 'yt', `${id}.jpg`);
  if (!exists(jpg)) {
    for (const q of ['maxresdefault', 'hqdefault']) {
      try {
        const res = await fetch(`https://i.ytimg.com/vi/${id}/${q}.jpg`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { await fsp.writeFile(jpg, Buffer.from(await res.arrayBuffer())); break; }
      } catch { /* offline: fall back to a plain play box */ }
    }
  }
  if (!exists(jpg)) return null;
  const cdir = path.join(CACHE, 'media', route);
  await mkdir(cdir);
  const out = path.join(cdir, `yt-${id}.avif`);
  if (!fresh(out, jpg)) await sharp(jpg).resize(960, 540, { fit: 'cover' }).avif({ quality: 50, effort: 4 }).toFile(out);
  return { file: `yt-${id}.avif`, w: 960, h: 540, cache: [`yt-${id}.avif`], source: jpg };
}

/* ---------- pages ---------- */
function* findPages(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (exists(path.join(dir, e.name, 'index.md'))) yield r;
    yield* findPages(path.join(dir, e.name), r);
  }
}

const plainText = (tokens) => {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'paragraph_open' && !tokens[i].hidden && tokens[i + 1]?.type === 'inline') {
      const t = tokens[i + 1].children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('').trim();
      if (t.length > 40) return t.length > 158 ? t.slice(0, 155).replace(/\s+\S*$/, '') + '…' : t;
    }
  }
  return '';
};

const outputs = []; // { from, to } media files to copy into dist

async function loadPage(route) {
  const dir = path.join(CONTENT, route);
  const file = path.join(dir, 'index.md');
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  if (data.draft) return null;
  const md = createMarkdown();
  const env = { assets: new Map(), yt: new Map(), figureCount: 0, hasVideos: Boolean(data.videos?.length) };
  const tokens = md.parse(preprocess(content), env);

  // collect everything the page references
  const imgs = new Set(), ids = new Map(), files = new Set();
  const visit = (list) => {
    for (const t of list) {
      if (t.type === 'image') {
        const src = decodeURI(t.attrGet('src') || '');
        const yt = youtubeId(src);
        if (yt) ids.set(yt.id, yt);
        else if (!/^(https?:)?\/\//.test(src)) imgs.add(src);
      } else if (t.type === 'yt_embed') ids.set(t.meta.id, t.meta);
      else if (t.type === 'link_open') {
        const h = decodeURI(t.attrGet('href') || '');
        if (!/^([a-z]+:|#|\/\/)/i.test(h) && /\.[a-z0-9]{2,5}$/i.test(h) && !/\.md$/i.test(h)) files.add(h);
      }
      if (t.children) visit(t.children);
    }
  };
  visit(tokens);
  for (const v of data.videos || []) { const y = youtubeId(v); if (y) ids.set(y.id, y); }

  const order = [];
  await pool([...imgs], 3, async (src) => {
    const f = path.join(dir, src);
    if (!exists(f)) { console.warn(`  ! ${route}: missing ${src}`); return; }
    const info = VID.test(f) ? await videoAsset(f, route) : IMG.test(f) ? await imageAsset(f, route) : null;
    if (info) env.assets.set(src, info);
  });
  for (const src of imgs) if (env.assets.has(src)) order.push(src);
  await pool([...ids.values()], 4, async ({ id }) => { const th = await ytThumb(id, route); if (th) env.yt.set(id, th); });
  for (const f of files) if (exists(path.join(dir, f))) outputs.push({ from: path.join(dir, f), to: path.join(route, path.basename(f)) });

  // register outputs
  for (const info of env.assets.values()) {
    if (info.kind === 'img') for (const c of info.cache) outputs.push({ from: path.join(CACHE, 'media', route, c), to: path.join(route, c) });
    else {
      outputs.push({ from: info.mp4Path, to: path.join(route, info.file) });
      outputs.push({ from: path.join(info.cacheDir, info.poster), to: path.join(route, info.poster) });
    }
  }
  for (const th of env.yt.values()) outputs.push({ from: path.join(CACHE, 'media', route, th.file), to: path.join(route, th.file) });

  const html = md.renderer.render(tokens, md.options, env);

  // cover: explicit > (projects: demo-video thumbnail) > first media in the body > any video thumbnail
  let cover = null;
  const ytCover = () => {
    const y = (data.videos || []).map(youtubeId).find((v) => v && env.yt.has(v.id));
    if (!y) return null;
    const th = env.yt.get(y.id);
    return { kind: 'poster', file: th.file, w: th.w, h: th.h, route, source: th.source };
  };
  const mediaCover = (src) => {
    const ci = env.assets.get(src);
    if (!ci) return null;
    return ci.kind === 'img' ? { kind: 'img', ...ci, route } : { kind: 'poster', file: ci.poster, w: ci.w, h: ci.h, route, source: ci.source };
  };
  if (data.cover) {
    const src = decodeURI(data.cover);
    if (!env.assets.has(src) && exists(path.join(dir, src)) && IMG.test(src)) {
      const info = await imageAsset(path.join(dir, src), route);
      env.assets.set(src, info);
      for (const c of info.cache) outputs.push({ from: path.join(CACHE, 'media', route, c), to: path.join(route, c) });
    }
    cover = mediaCover(src);
  }
  cover ||= (route.startsWith('projects/') && ytCover()) || mediaCover(order[0]) || ytCover();

  const title = data.title || route.split('/').pop();
  const tags = (data.tags || []).filter((t) => t.toLowerCase() !== 'project');
  return {
    route, title, tags, cover, html, env,
    hasDesc: Boolean(data.description), year: data.year, role: data.role, prototype: data.prototype, order: data.order, copyright: data.copyright,
    videos: (data.videos || []).map(youtubeId).filter(Boolean),
    description: data.description || plainText(tokens) || `${title}${tags.length ? ' — ' + tags.join(', ') : ''} by ${site.name}.`,
    section: route.split('/')[0],
    parent: route.includes('/') ? route.split('/').slice(0, -1).join('/') : null,
  };
}

async function ogFor(page) {
  const out = path.join(CACHE, 'og', `${page.route.replace(/\//g, '__')}.jpg`);
  if (!page.cover) return null;
  await mkdir(path.dirname(out));
  const src = page.cover.source;
  if (!fresh(out, src)) await sharp(src).rotate().resize(1200, 630, { fit: 'cover', position: 'top' }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
  outputs.push({ from: out, to: path.join(page.route, 'og.jpg') });
  return `${abs(page.route)}og.jpg`;
}

const yearOf = (p) => p.year || 0;
const sorter = (a, b) => (a.order ?? 99) - (b.order ?? 99) || yearOf(b) - yearOf(a) || a.title.localeCompare(b.title);

function coverTag(c, sizes) {
  if (!c) return `<span class="thumb" aria-hidden="true"></span>`;
  if (c.kind === 'img') {
    const dir = href(c.route);
    const srcset = c.widths.map((w) => `${dir}${c.name}-${w}.avif ${w}w`).join(', ');
    return `<img class="thumb" src="${dir}${c.name}-${c.widths.at(-1)}.avif" srcset="${srcset}" sizes="${sizes}" width="${c.w}" height="${c.h}" alt="" loading="lazy" decoding="async">`;
  }
  return `<img class="thumb" src="${href(c.route)}${c.file}" width="${c.w}" height="${c.h}" alt="" loading="lazy" decoding="async">`;
}

const card = (p, kind) => `<li><a class="card" href="${href(p.route)}">${coverTag(p.cover, kind === 'project' ? '(min-width: 64rem) 330px, (min-width: 46rem) 45vw, 100vw' : '(min-width: 64rem) 200px, (min-width: 720px) 30vw, 46vw')}<span class="body"><h3>${esc(p.title)}</h3>${kind === 'project' ? `<p>${esc(p.description)}</p>` : ''}${p.year ? `<span class="yr">${p.year}</span>` : ''}</span></a></li>`;

/* ---------- build ---------- */
await fsp.rm(DIST, { recursive: true, force: true });
await mkdir(DIST);

const routes = [...findPages(CONTENT)];
const pages = [];
for (const r of routes) {
  const p = await loadPage(r);
  if (p) pages.push(p);
  console.log(`  ${r}`);
}
const byRoute = new Map(pages.map((p) => [p.route, p]));
const write = async (rel, body) => { const f = path.join(DIST, rel); await mkdir(path.dirname(f)); await fsp.writeFile(f, body); };

// home
const home = matter(fs.readFileSync(path.join(CONTENT, 'home.md'), 'utf8'));
const homeHtml = createMarkdown().render(preprocess(home.content), { assets: new Map(), yt: new Map(), figureCount: 0 });
const projects = pages.filter((p) => p.section === 'projects' && p.route.split('/').length === 2).sort(sorter);
const notes = pages.filter((p) => p.section === 'notes' && p.route.split('/').length === 2).sort(sorter);
const resume = site.resume ? href(site.resume.replace(/\/$/, '')).replace(/\/$/, '') : null;
const homeOg = path.join(CACHE, 'og', 'home.jpg');
await mkdir(path.dirname(homeOg));
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#E3EBF2"/><stop offset="1" stop-color="#D3DEE8"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/><g fill="none" stroke="#1B4B7A" stroke-width="2" opacity=".7"><path d="M90 150v-40h40M1110 480v40h-40"/></g><text x="100" y="330" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="300" font-size="112" letter-spacing="-3" fill="#08182A">${esc(site.name)}</text><text x="104" y="406" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="38" letter-spacing="8" fill="#4A6077">${esc(site.tagline.toUpperCase())}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(homeOg);
  outputs.push({ from: homeOg, to: 'og.jpg' });
}

const homeBody = `<header class="top wide"><span></span>${toggleButton}</header>
<main class="wrap wide">
<section class="hero">${markBig}<h1>${esc(site.name)}</h1><div class="lead">${homeHtml}</div>
<ul class="pills">${resume ? `<li><a class="pill primary" href="${resume}">Resume</a></li>` : ''}<li><a class="pill" href="mailto:${esc(site.email)}">Email</a></li><li><a class="pill" href="${esc(site.links[0].href)}">${esc(site.links[0].label)}</a></li></ul></section>
<section><h2 class="label">Projects</h2><ul class="grid projects">${projects.map((p) => card(p, 'project')).join('')}</ul></section>
<section><h2 class="label">Notes</h2><ul class="grid notes">${notes.map((p) => card(p, 'note')).join('')}</ul></section>
</main>
${footer(site, year)}`;
await write('index.html', layout({
  site, base, wide: true, body: homeBody,
  title: home.data.title || `${site.name} — ${site.tagline}`,
  description: home.data.description || site.description,
  canonical: abs(), ogImage: `${abs()}og.jpg`,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Person', name: site.name, jobTitle: site.tagline, url: abs(), email: site.email, sameAs: site.links.map((l) => l.href) }, { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs() }],
}));

// content pages
for (const p of pages) {
  const parent = p.parent && byRoute.get(p.parent);
  const og = await ogFor(p);
  const meta = [
    p.role && `<div class="wide"><dt>Role</dt><dd>${esc(p.role)}</dd></div>`,
    p.year && `<div><dt>Year</dt><dd>${p.year}</dd></div>`,
    p.tags.length && `<div><dt>Tags</dt><dd>${p.tags.map(esc).join(' · ')}</dd></div>`,
  ].filter(Boolean).join('');
  const vids = p.videos.map((v) => {
    const th = p.env.yt.get(v.id);
    return `<div class="yt hero-video"><a href="https://youtu.be/${v.id}${v.t ? `?t=${v.t}` : ''}" data-yt="${v.id}"${v.t ? ` data-t="${v.t}"` : ''} aria-label="Play video on YouTube">${th ? `<img src="${th.file}" width="${th.w}" height="${th.h}" alt="" decoding="async" ${p.videos[0] === v ? 'fetchpriority="high"' : 'loading="lazy"'}>` : ''}</a></div>`;
  }).join('');
  const body = `<header class="top">${markLink(href())}${toggleButton}</header>
<main class="wrap"><article>
${parent ? `<p class="crumb"><a href="${href(parent.route)}">← ${esc(parent.title)}</a></p>` : ''}
<header class="ahead"><h1>${esc(p.title)}</h1>${p.hasDesc ? `<p class="lead">${esc(p.description)}</p>` : ''}${meta ? `<dl class="meta">${meta}</dl>` : ''}${p.prototype ? `<ul class="pills"><li><a class="pill primary" href="${esc(p.prototype)}">Open Figma prototype</a></li></ul>` : ''}</header>
${vids}
${p.html}
</article></main>
${footer(site, year, p.copyright)}`;
  await write(`${p.route}/index.html`, layout({
    site, base, body,
    title: `${p.title} — ${site.name}`,
    description: p.description,
    canonical: abs(p.route), ogImage: og, ogType: 'article',
    jsonld: { '@context': 'https://schema.org', '@type': 'CreativeWork', headline: p.title, description: p.description, url: abs(p.route), author: { '@type': 'Person', name: site.name, url: abs() }, ...(p.year ? { datePublished: String(p.year) } : {}), ...(og ? { image: og } : {}), ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}), inLanguage: 'en' },
  }));
}

// static + generated files
await write('404.html', layout({ site, base, title: `Not found — ${site.name}`, description: 'Page not found.', canonical: abs(), jsonld: {}, body: `<header class="top">${markLink(href())}${toggleButton}</header><main class="wrap"><article><header class="ahead"><h1>Page not found</h1><ul class="pills"><li><a class="pill primary" href="${href()}">Home</a></li></ul></header></article></main>` }));
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...pages.map((p) => p.route)].map((r) => `<url><loc>${abs(r)}</loc></url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
await fsp.cp(PUBLIC, DIST, { recursive: true });
await sharp(path.join(PUBLIC, 'favicon.svg'), { density: 480 }).resize(180, 180).png().toFile(path.join(DIST, 'apple-touch-icon.png'));

const seen = new Set();
for (const o of outputs) {
  if (seen.has(o.to) || !exists(o.from)) continue;
  seen.add(o.to);
  await mkdir(path.dirname(path.join(DIST, o.to)));
  await fsp.copyFile(o.from, path.join(DIST, o.to));
}

const size = (dir) => { let n = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size; return n; };
console.log(`\nBuilt ${pages.length} pages + home in ${((Date.now() - t0) / 1000).toFixed(1)}s → dist/ (${(size(DIST) / 1e6).toFixed(1)} MB)`);
