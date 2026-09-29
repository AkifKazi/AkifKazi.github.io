import MarkdownIt from 'markdown-it';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function youtubeId(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (/(^|\.)youtube\.com$/.test(u.hostname)) id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const t = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '', 10);
    return { id, t: Number.isFinite(t) ? t : 0 };
  } catch {
    return null;
  }
}

// Obsidian embeds ![[file.png|alt]] -> standard Markdown
export const preprocess = (src) => src.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, f, alt) => `![${alt || ''}](<${f.trim()}>)`);

const CALLOUT = /^\[!(\w+)\][+-]?\s*/;

export function createMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  // images alone in a paragraph become figures; a lone YouTube link becomes an embed
  md.core.ruler.push('portfolio_blocks', (state) => {
    const t = state.tokens;
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline') continue;
      const kids = t[i + 1].children.filter((c) => !(c.type === 'softbreak' || (c.type === 'text' && !c.content.trim())));
      if (kids.length === 1 && kids[0].type === 'image') {
        t[i].hidden = t[i + 2].hidden = true;
        kids[0].meta = { block: true };
      } else if (kids.length === 3 && kids[0].type === 'link_open' && kids[2].type === 'link_close') {
        const yt = youtubeId(kids[0].attrGet('href'));
        if (yt) {
          t[i].hidden = t[i + 2].hidden = true;
          t[i + 1].children = [Object.assign(new state.Token('yt_embed', '', 0), { meta: yt })];
        }
      }
    }

    // Obsidian/GitHub-style callouts: > [!tip]
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'blockquote_open') continue;
      const inl = t[i + 2];
      const m = inl && inl.type === 'inline' && t[i + 1].type === 'paragraph_open' && inl.content.match(CALLOUT);
      if (!m) continue;
      let depth = 0, close = -1;
      for (let j = i; j < t.length; j++) {
        depth += t[j].nesting;
        if (depth === 0) { close = j; break; }
      }
      if (close < 0) continue;
      t[i].tag = t[close].tag = 'aside';
      t[i].attrJoin('class', `callout ${m[1].toLowerCase()}`);
      inl.content = inl.content.replace(CALLOUT, '');
      if (inl.children[0]?.type === 'text') inl.children[0].content = inl.children[0].content.replace(CALLOUT, '');
      if (!inl.content.trim()) { t[i + 1].hidden = t[i + 3].hidden = true; }
    }

    // heading ids
    const seen = new Set();
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'heading_open') continue;
      let id = slugify(t[i + 1].content) || 'section';
      for (let n = 2; seen.has(id); n++) id = `${slugify(t[i + 1].content)}-${n}`;
      seen.add(id);
      t[i].attrSet('id', id);
    }
  });

  md.renderer.rules.table_open = (tokens, idx) => {
    let cols = 0;
    for (let i = idx; i < tokens.length && tokens[i].type !== 'tr_close'; i++) if (tokens[i].type === 'th_open') cols++;
    return `<div class="table-wrap${cols > 3 ? ' many' : ''}"><table>\n`;
  };
  md.renderer.rules.table_close = () => '</table></div>\n';

  md.renderer.rules.yt_embed = (tokens, idx, o, env) => embed(tokens[idx].meta, env);

  md.renderer.rules.image = (tokens, idx, o, env) => {
    const tok = tokens[idx];
    const src = tok.attrGet('src') || '';
    const yt = youtubeId(src);
    if (yt) return `<figure>${embed(yt, env)}</figure>\n`;

    const raw = tok.content.trim();
    const caption = raw ? md.renderInline(raw) : '';
    const alt = tok.children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('').trim();
    const info = env.assets.get(decodeURI(src));
    const first = env.figureCount++ === 0 && !env.hasVideos;
    let media;

    if (!info) {
      media = `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
    } else if (info.kind === 'video') {
      media = `<video data-src="${esc(info.file)}" poster="${esc(info.poster)}" width="${info.w}" height="${info.h}" muted loop playsinline preload="none" disablepictureinpicture aria-label="${esc(alt || 'Animation')}"></video>`;
    } else {
      const tall = info.h / info.w > 1.3;
      const sizes = tall ? '(min-width: 24rem) 384px, calc(100vw - 40px)' : '(min-width: 46rem) 696px, calc(100vw - 40px)';
      const srcset = info.widths.map((w) => `${esc(info.name)}-${w}.avif ${w}w`).join(', ');
      const big = info.widths[info.widths.length - 1];
      media = `<img src="${esc(info.name)}-${big}.avif" srcset="${srcset}" sizes="${sizes}" width="${info.w}" height="${info.h}" alt="${esc(alt)}" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
      if (tall) return `<figure class="tall">${media}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
    }
    return `<figure>${media}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
  };

  return md;
}

export function embed({ id, t }, env) {
  const th = env.yt.get(id);
  const img = th ? `<img src="${th.file}" width="${th.w}" height="${th.h}" alt="" loading="lazy" decoding="async">` : '';
  return `<div class="yt"><a href="https://youtu.be/${id}${t ? `?t=${t}` : ''}" data-yt="${id}"${t ? ` data-t="${t}"` : ''} aria-label="Play video on YouTube">${img}</a></div>`;
}
