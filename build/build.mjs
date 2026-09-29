import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import sharp from 'sharp';
import { createMarkdown, esc, preprocess, slugify, youtubeId } from './render.mjs';
import { footer, header, layout, MARK_SVG } from './layout.mjs';
import { icon } from './icons.mjs';

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
const WIDTHS = [360, 720, 1080, 1440, 2048];
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

// Images with see-through areas were drawn for a dark page (Notion's dark theme);
// they get a dark backdrop on the site in both themes.
async function hasTransparency(file) {
  const meta = await sharp(file).metadata();
  if (!meta.hasAlpha) return false;
  const { data } = await sharp(file).resize(256, 256, { fit: 'inside' }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let see = 0;
  for (const v of data) if (v < 250) see++;
  return see / data.length > 0.01;
}

async function imageAsset(file, route) {
  const name = slugify(path.basename(file, path.extname(file)));
  const cdir = path.join(CACHE, 'media', route);
  await mkdir(cdir);
  const infoFile = path.join(cdir, `${name}.json`);
  let meta;
  if (fresh(infoFile, file)) meta = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  else {
    const m = await sharp(file).rotate().metadata();
    const [w, h] = m.orientation >= 5 ? [m.height, m.width] : [m.width, m.height];
    meta = { w, h, alpha: await hasTransparency(file) };
  }
  const { w, h, alpha } = meta;
  const widths = [...new Set([...WIDTHS.filter((x) => x < w), Math.min(w, WIDTHS.at(-1))])].sort((a, b) => a - b);
  for (const width of widths) {
    const out = path.join(cdir, `${name}-${width}.avif`);
    if (!fresh(out, file)) await sharp(file).rotate().resize({ width, withoutEnlargement: true }).avif({ quality: 58, effort: 4 }).toFile(out);
  }
  // for browsers without AVIF
  const fallback = `${name}-fb.webp`;
  if (!fresh(path.join(cdir, fallback), file)) await sharp(file).rotate().resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toFile(path.join(cdir, fallback));
  fs.writeFileSync(infoFile, JSON.stringify(meta));
  return { kind: 'img', name, w, h, alpha, widths, fallback, cache: [...widths.map((x) => `${name}-${x}.avif`), fallback], source: file };
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
  const poster = path.join(cdir, `${name}-poster.jpg`);
  if (!fresh(png, file)) await ffmpeg(['-i', mp4, '-frames:v', '1', png]);
  const { width: w, height: h } = await sharp(png).metadata();
  // JPEG, not AVIF: posters must show in every browser, including ones without AVIF
  if (!fresh(poster, file)) await sharp(png).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(poster);
  return { kind: 'video', name, w, h, file: `${name}${path.extname(mp4)}`, poster: `${name}-poster.jpg`, cacheDir: cdir, mp4Path: mp4, source: png };
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
  const out = path.join(cdir, `yt-${id}.jpg`);
  if (!fresh(out, jpg)) await sharp(jpg).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 72, mozjpeg: true }).toFile(out);
  return { file: `yt-${id}.jpg`, w: 1280, h: 720, cache: [`yt-${id}.jpg`], source: jpg };
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
    route, title, tags, cover, html, env, toc: env.toc || [],
    hasDesc: Boolean(data.description), year: data.year, role: data.role, prototype: data.prototype, order: data.order, copyright: data.copyright,
    videos: (data.videos || []).map(youtubeId).filter(Boolean),
    description: data.description || plainText(tokens) || `${title}${tags.length ? ' — ' + tags.join(', ') : ''} by ${site.name}.`,
    section: route.split('/')[0],
    parent: route.includes('/') && route.split('/').length > 2 ? route.split('/').slice(0, -1).join('/') : null,
  };
}

async function ogFor(page) {
  const out = path.join(CACHE, 'og', `${page.route.replace(/\//g, '__')}.jpg`);
  if (!page.cover) return null;
  await mkdir(path.dirname(out));
  const src = page.cover.source;
  if (!fresh(out, src)) {
    const img = sharp(src).rotate();
    if (page.cover.alpha) img.flatten({ background: '#141B23' });
    await img.resize(1200, 630, { fit: 'cover', position: 'top' }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
  }
  outputs.push({ from: out, to: path.join(page.route, 'og.jpg') });
  return `${abs(page.route)}og.jpg`;
}

const yearOf = (p) => p.year || 0;
const sorter = (a, b) => (a.order ?? 99) - (b.order ?? 99) || yearOf(b) - yearOf(a) || a.title.localeCompare(b.title);

function coverTag(c, sizes) {
  if (!c) return `<span class="thumb empty" aria-hidden="true">${icon('description')}</span>`;
  const dir = href(c.route);
  if (c.kind === 'img') {
    const srcset = c.widths.map((w) => `${dir}${c.name}-${w}.avif ${w}w`).join(', ');
    return `<picture class="thumb${c.alpha ? ' alpha' : ''}"><source type="image/avif" srcset="${srcset}" sizes="${sizes}"><img src="${dir}${c.fallback}" width="${c.w}" height="${c.h}" alt="" loading="lazy" decoding="async"></picture>`;
  }
  return `<picture class="thumb"><img src="${dir}${c.file}" width="${c.w}" height="${c.h}" alt="" loading="lazy" decoding="async"></picture>`;
}

const card = (p, kind) => {
  const sizes = kind === 'project' ? '(min-width: 1280px) 400px, (min-width: 720px) 48vw, calc(100vw - 32px)' : '(min-width: 1280px) 290px, (min-width: 720px) 31vw, 46vw';
  return `<li><a class="card" href="${href(p.route)}"><span class="frame" aria-hidden="true"></span>${coverTag(p.cover, sizes)}<div class="body"><h3>${esc(p.title)}</h3>${p.year ? `<p class="card-k">${p.year}</p>` : ''}${kind === 'project' ? `<p class="desc">${esc(p.description)}</p>` : ''}${kind === 'project' && p.tags.length ? `<p class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}</div></a></li>`;
};

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
const resumePage = site.resume && byRoute.get(site.resume.split('/').slice(0, -1).join('/'));
const homeOg = path.join(CACHE, 'og', 'home.jpg');
await mkdir(path.dirname(homeOg));
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#EEF2F5"/><g fill="#fff"><path d="M-80 630 380 -40 700 630z" opacity=".75"/><path d="M620 0h700L980 520z" opacity=".6"/></g><path d="M760 630 1080 150 1300 630z" fill="#1E5A8E" opacity=".06"/><g fill="none" stroke="#1E5A8E" stroke-width="2"><path d="M90 150v-40h40M1110 480v40h-40"/></g><text x="100" y="330" font-family="Montserrat, Helvetica Neue, Arial, sans-serif" font-weight="300" font-size="112" letter-spacing="2" fill="#0B1520">${esc(site.name.split(' ')[0].toUpperCase())} <tspan font-weight="600">${esc(site.name.split(' ').slice(1).join(' ').toUpperCase())}</tspan></text><text x="104" y="406" font-family="Montserrat, Helvetica Neue, Arial, sans-serif" font-size="34" letter-spacing="9" fill="#5B6B7B">${esc(site.tagline.toUpperCase())}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(homeOg);
  outputs.push({ from: homeOg, to: 'og.jpg' });
}

const top = (current) => header({ site, home: href(), resume, current });
const facts = (home.data.facts || []).map((f) => (Array.isArray(f) ? f : [f.label, f.value]));
const [first, ...rest] = site.name.split(' ');
const actions = `<ul class="actions">${resume ? `<li><a class="btn primary" href="${resume}">${icon('description')}<span>Resume</span></a></li>` : ''}<li><a class="btn" href="mailto:${esc(site.email)}">${icon('mail')}<span>Email</span></a></li><li><a class="btn" href="${esc(site.links[0].href)}"><span>${esc(site.links[0].label)}</span>${icon('arrow_outward')}</a></li></ul>`;
const sectionHead = (label, id) => `<h2 class="label" id="${id}"><span class="label-t">${label}</span><span class="label-line" aria-hidden="true"></span></h2>`;

const homeBody = `${top('')}
<main id="main" class="home">
<section class="hero">
<h1 class="name"><span class="n1">${esc(first)}</span> <span class="n2">${esc(rest.join(' '))}</span></h1>
<p class="role">${esc(site.tagline)}</p>
${homeHtml.trim() ? `<div class="lead">${homeHtml}</div>` : ''}
${facts.length ? `<dl class="status">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
${actions}
</section>
<section class="shelf">${sectionHead('Projects', 'projects')}<ul class="grid projects">${projects.map((p) => card(p, 'project')).join('')}</ul></section>
<section class="shelf">${sectionHead('Notes', 'notes')}<ul class="grid notes">${notes.map((p) => card(p, 'note')).join('')}</ul></section>
</main>
${footer(site, year)}`;
await write('index.html', layout({
  site, base, body: homeBody, bodyClass: 'is-home',
  title: home.data.title || `${site.name} — ${site.tagline}`,
  description: home.data.description || site.description,
  canonical: abs(), ogImage: `${abs()}og.jpg`,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'Person', name: site.name, jobTitle: site.tagline, url: abs(), email: site.email, sameAs: site.links.map((l) => l.href) }, { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs() }],
}));

// content pages
const navItems = (current) => [
  [`${href()}#projects`, 'Projects'],
  [`${href()}#notes`, 'Notes'],
  resume && [resume, 'Resume'],
].filter(Boolean).map(([h, l]) => `<a href="${h}"${current === l ? ' aria-current="page"' : ''}>${l}</a>`).join('');
const themeBtn = `<button class="theme" type="button" aria-label="Switch to dark theme" title="Switch theme">${icon('dark_mode', 'to-dark')}${icon('light_mode', 'to-light')}</button>`;
const pagerLink = (x, dir) => x ? `<a class="pg-${dir}" href="${x.href}" rel="${dir}">${icon(dir === 'prev' ? 'arrow_back' : 'arrow_forward')}<span><span class="pg-k">${x.k}</span><b>${esc(x.t)}</b></span></a>` : '';

for (const p of pages) {
  const parent = p.parent && byRoute.get(p.parent);
  const og = await ogFor(p);
  const list = p.section === 'projects' ? projects : notes;
  const idx = list.indexOf(p);
  const noun = p.section === 'projects' ? 'project' : 'note';
  const current = p.section === 'projects' ? 'Projects' : p.route === resumePage?.route ? 'Resume' : 'Notes';
  const meta = [
    p.role && ['Role', esc(p.role)],
    p.year && ['Year', p.year],
    p.tags.length && ['Tags', p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')],
  ].filter(Boolean);
  const metaDl = meta.length ? `<dl class="meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';
  const vids = p.videos.map((v, i) => {
    const th = p.env.yt.get(v.id);
    return `<div class="yt"><a href="https://youtu.be/${v.id}${v.t ? `?t=${v.t}` : ''}" data-yt="${v.id}"${v.t ? ` data-t="${v.t}"` : ''} aria-label="Play video on YouTube">${th ? `<img src="${th.file}" width="${th.w}" height="${th.h}" alt="" decoding="async" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>` : ''}<span class="yt-play">${icon('play_arrow')}</span></a></div>`;
  }).join('');
  const toc = p.toc.length >= 3 ? `<nav class="toc" role="navigation" aria-label="On this page"><ol>${p.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : '';
  // previous / next within the section (no wrap-around); sub-pages lead back to their parent
  const prev = parent ? { href: href(parent.route), k: 'Back to', t: parent.title } : idx > 0 ? { href: href(list[idx - 1].route), k: `Previous ${noun}`, t: list[idx - 1].title } : null;
  const next = !parent && idx >= 0 && idx < list.length - 1 ? { href: href(list[idx + 1].route), k: `Next ${noun}`, t: list[idx + 1].title } : null;
  const pager = prev || next ? `<nav class="pager" role="navigation" aria-label="More ${noun}s">${pagerLink(prev, 'prev')}${pagerLink(next, 'next')}</nav>` : '';
  const body = `${top(current)}
<div class="progress" data-progress aria-hidden="true"></div>
<div class="shell">
<aside class="rail rail-l" role="complementary" aria-label="Page">
<a class="mark" href="${href()}" aria-label="${esc(site.name)}, home">${MARK_SVG}<span class="mark-t"><b>${esc(first)}</b> ${esc(rest.join(' '))}</span></a>
${toc}
<div class="rail-progress" aria-hidden="true"><span class="pct">0%</span><span class="rail-bar" data-progress></span></div>
</aside>
<main id="main" class="page">
<article class="article">
<header class="ahead">
${parent ? `<p class="crumb"><a href="${href(parent.route)}">${icon('arrow_back')}${esc(parent.title)}</a></p>` : ''}
<h1>${esc(p.title)}</h1>
<div class="ahead-grid"><div class="ahead-main">${p.hasDesc ? `<p class="lead">${esc(p.description)}</p>` : ''}${p.prototype ? `<p class="actions"><a class="btn primary" href="${esc(p.prototype)}">${icon('touch_app')}<span>Open Figma prototype</span>${icon('arrow_outward')}</a></p>` : ''}</div>${metaDl}</div>
</header>
${vids ? `<div class="hero-media">${vids}</div>` : ''}
<div class="prose">
${p.html}
</div>
</article>
</main>
<aside class="rail rail-r" role="complementary" aria-label="Site">
<div class="rail-top"><nav class="rail-nav" aria-label="Main">${navItems(current)}</nav>${themeBtn}</div>
<div class="rail-info"><p class="rail-k">${esc(parent ? parent.title : p.section === 'projects' ? 'Project' : 'Note')}</p><p class="rail-t">${esc(p.title)}</p>${metaDl}</div>
${prev || next ? `<nav class="rail-pager" aria-label="More ${noun}s">${pagerLink(prev, 'prev')}${pagerLink(next, 'next')}</nav>` : ''}
</aside>
</div>
${pager}
${footer(site, year, p.copyright)}`;
  await write(`${p.route}/index.html`, layout({
    site, base, body, bodyClass: 'is-article',
    title: `${p.title} — ${site.name}`,
    description: p.description,
    canonical: abs(p.route), ogImage: og, ogType: 'article',
    extraHead: `\n<meta property="article:author" content="${esc(site.name)}">`,
    jsonld: { '@context': 'https://schema.org', '@type': 'CreativeWork', headline: p.title, description: p.description, url: abs(p.route), author: { '@type': 'Person', name: site.name, url: abs() }, ...(p.year ? { datePublished: String(p.year) } : {}), ...(og ? { image: og } : {}), ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}), inLanguage: 'en' },
  }));
}

// static + generated files
await write('404.html', layout({
  site, base, title: `Not found — ${site.name}`, description: 'Page not found.', canonical: abs(), bodyClass: 'is-article',
  body: `${top('')}<main id="main" class="page"><article class="article"><header class="ahead"><h1>Page not found</h1><div class="ahead-grid"><div class="ahead-main"><p class="lead">This page doesn’t exist, or it moved.</p><p class="actions"><a class="btn primary" href="${href()}">${icon('arrow_back')}<span>Home</span></a></p></div></div></header></article></main>${footer(site, year)}`,
}));
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
