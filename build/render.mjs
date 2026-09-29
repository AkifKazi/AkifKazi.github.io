import MarkdownIt from 'markdown-it';
import { icon } from './icons.mjs';

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

const isFigma = (href) => /^https:\/\/(www\.)?figma\.com\/(proto|file|design)\//.test(href || '');

/* ---------- source preprocessing ---------- */

// Obsidian embeds: ![[file.png|alt]] and ![[file.png|300]] -> standard Markdown
const embeds = (src) => src.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, f, alt = '') =>
  `![${/^\s*\d{2,4}\s*$/.test(alt) ? '|' + alt.trim() : alt}](<${f.trim()}>)`);

// Block containers (lines on their own):
//   ::: columns 1 3      side-by-side columns (optional width ratios), split with +++
//   ::: toggle ## Title  collapsible section; `toggle+` starts open; the title may be a heading or plain text
//   :::                  closes the innermost container
function containers(src) {
  const out = [];
  const stack = [];
  let fence = null;
  const close = () => {
    const c = stack.pop();
    if (c.type === 'toggle') {
      // A toggle holding only a code block is supplementary: mark it so reader views
      // (Safari Reader, Firefox Reader View) keep the article instead of the code.
      const body = out.slice(c.body).filter((l) => l.trim());
      if (/^\s{0,3}(`{3,}|~{3,})/.test(body[0] || '') && body.filter((l) => /^\s{0,3}(`{3,}|~{3,})/.test(l)).length === 2 && /^\s{0,3}(`{3,}|~{3,})\s*$/.test(body.at(-1))) {
        out[c.at] = out[c.at].replace('<details class="toggle"', `<details class="toggle code-toggle" role="complementary" aria-label="${c.label.replace(/"/g, '&quot;')}"`);
        // collapsed content is out of the accessibility tree anyway; client.js clears this on open
        if (!/ open>$/.test(out[c.at])) out[c.body - 2] = '<div class="flow" aria-hidden="true">';
      }
    }
    out.push('', c.type === 'columns' ? '</div>\n</div>' : '</div>\n</details>', '');
  };
  for (const line of src.split('\n')) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
      continue;
    }
    if (f) { fence = f[1]; out.push(line); continue; }
    let m;
    if ((m = line.match(/^:::\s*columns\b(.*)$/))) {
      const ratios = m[1].trim().split(/[\s:/]+/).map(Number).filter((n) => n > 0);
      stack.push({ type: 'columns' });
      out.push('', `<div class="cols"${ratios.length > 1 ? ` style="--cols:${ratios.map((r) => `minmax(0,${r}fr)`).join(' ')}"` : ''}>`, '<div class="col">', '');
    } else if ((m = line.match(/^:::\s*toggle(\+?)\s+(.+)$/))) {
      const head = m[2].trim();
      out.push('', `<details class="toggle"${m[1] ? ' open' : ''}>`);
      const toggle = { type: 'toggle', at: out.length - 1, label: head.replace(/^#+\s*/, '').replace(/<[^>]*>/g, '') };
      stack.push(toggle);
      if (head.startsWith('#')) out.push('<summary>', '', head, '', '</summary>');
      else out.push(`<summary><span class="toggle-t">${head}</span></summary>`);
      out.push('<div class="flow">', '');
      toggle.body = out.length;
    } else if (/^\+\+\+\s*$/.test(line) && stack.at(-1)?.type === 'columns') {
      out.push('', '</div>', '<div class="col">', '');
    } else if (/^:::\s*$/.test(line) && stack.length) {
      close();
    } else out.push(line);
  }
  while (stack.length) close();
  return out.join('\n');
}

export const preprocess = (src) => containers(embeds(src));

/* ---------- markdown ---------- */

const CALLOUT = /^\[!(\w+)\][+-]?\s*/;
const CALLOUTS = {
  tip: ['lightbulb', 'Insight'], idea: ['lightbulb', 'Insight'],
  important: ['release_alert', 'Update'], warning: ['release_alert', 'Warning'],
  note: ['info', 'Note'], info: ['info', 'Note'],
  key: ['key', 'Key takeaways'],
};
const FACT = /^(\S[^\n]{0,60}?)::[ \t]+(\S.*)$/;
const LANGS = { js: 'JavaScript', jsx: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', html: 'HTML', css: 'CSS', py: 'Python', python: 'Python', sh: 'Shell', bash: 'Shell', json: 'JSON' };

// "Caption|300" -> caption + display width in CSS px
function splitWidth(raw) {
  const m = raw.match(/^([\s\S]*?)\s*\|\s*(\d{2,4})\s*$/);
  return m ? { cap: m[1].trim(), w: Number(m[2]) } : { cap: raw.trim(), w: 0 };
}
const plain = (children) => children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');

export function createMarkdown() {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

  md.core.ruler.push('portfolio_blocks', (state) => {
    if (state.inlineMode) return; // renderInline() (captions, facts) must not reset the page's toc
    const t = state.tokens;
    const env = state.env;
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline') continue;
      const inl = t[i + 1];
      const kids = inl.children.filter((c) => !(c.type === 'softbreak' || (c.type === 'text' && !c.content.trim())));
      const hide = () => { t[i].hidden = t[i + 2].hidden = true; };

      if (kids.length && kids.every((k) => k.type === 'image')) {
        // one image -> figure, several -> gallery row
        hide();
        if (kids.length === 1) kids[0].meta = { block: true };
        else inl.children = [Object.assign(new state.Token('gallery', '', 0), { children: kids })];
      } else if (kids.length === 3 && kids[0].type === 'link_open' && kids[2].type === 'link_close' && kids[1].type === 'text') {
        const href = kids[0].attrGet('href') || '';
        const yt = youtubeId(href);
        if (yt) { hide(); inl.children = [Object.assign(new state.Token('yt_embed', '', 0), { meta: yt })]; }
        else if (isFigma(href)) { hide(); inl.children = [Object.assign(new state.Token('figma', '', 0), { meta: { href, text: kids[1].content } })]; }
        else if (!/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href) && !/\.[a-z0-9]{2,5}$/i.test(href.replace(/[?#].*$/, ''))) {
          hide(); inl.children = [Object.assign(new state.Token('pagelink', '', 0), { meta: { href, text: kids[1].content } })];
        }
      } else {
        // Key:: value lines -> definition list
        const lines = inl.content.split('\n');
        if (lines.every((l) => FACT.test(l.trim()))) {
          hide();
          const items = lines.map((l) => l.trim().match(FACT).slice(1, 3));
          inl.children = [Object.assign(new state.Token('facts', '', 0), { meta: { items, stacked: items.some(([k]) => k.length > 14) } })];
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
      const type = CALLOUTS[m[1].toLowerCase()] ? m[1].toLowerCase() : 'note';
      inl.content = inl.content.replace(CALLOUT, '');
      if (inl.children[0]?.type === 'text') inl.children[0].content = inl.children[0].content.replace(CALLOUT, '');
      const empty = !inl.content.trim();
      if (empty) t[i + 1].hidden = t[i + 3].hidden = true;
      // spoken / reader-mode label, inline with the first line of text
      if (!empty) inl.children.unshift(Object.assign(new state.Token('html_inline', '', 0), { content: `<b class="vh">${CALLOUTS[type][1]}: </b>` }));
      t[i].meta = { callout: type };
      t[close].meta = { callout: type };
    }

    // heading ids + table of contents (h2)
    const seen = new Set();
    env.toc = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'heading_open') continue;
      const text = plain(t[i + 1].children || []).replace(/\s+/g, ' ').trim();
      const base = slugify(text) || 'section';
      let id = base;
      for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
      seen.add(id);
      t[i].attrSet('id', id);
      if (t[i].tag === 'h2') env.toc.push({ id, text });
    }
  });

  const r = md.renderer.rules;

  r.blockquote_open = (tokens, idx, o, env, self) => {
    const c = tokens[idx].meta?.callout;
    if (!c) return self.renderToken(tokens, idx, o);
    const [ic] = CALLOUTS[c];
    return `<div class="callout ${c}" role="note">${icon(ic)}<div class="callout-body">\n`;
  };
  r.blockquote_close = (tokens, idx, o, env, self) => tokens[idx].meta?.callout ? '</div></div>\n' : self.renderToken(tokens, idx, o);

  r.table_open = (tokens, idx) => {
    let cols = 0;
    for (let i = idx; i < tokens.length && tokens[i].type !== 'tr_close'; i++) if (tokens[i].type === 'th_open') cols++;
    return `<div class="table-wrap${cols > 3 ? ' many' : ''}" tabindex="0"><table>\n`;
  };
  r.table_close = () => '</table></div>\n';

  r.fence = (tokens, idx) => {
    const tok = tokens[idx];
    const lang = (tok.info || '').trim().split(/\s+/)[0];
    const label = LANGS[lang.toLowerCase()] || lang || 'Code';
    return `<div class="code"><div class="code-bar"><span>${esc(label)}</span><button class="copy" type="button" aria-label="Copy code to clipboard">${icon('content_copy', 'i-copy')}${icon('check', 'i-done')}<span class="copy-t" aria-live="polite">Copy</span></button></div><pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(tok.content)}</code></pre></div>\n`;
  };

  r.yt_embed = (tokens, idx, o, env) => embed(tokens[idx].meta, env);
  r.gallery = (tokens, idx, o, env) => {
    const imgs = tokens[idx].children;
    env.gallery = imgs.length;
    const html = imgs.map((im) => r.image([im], 0, o, env)).join('');
    env.gallery = 0;
    return `<figure class="gallery">${html}</figure>\n`;
  };
  r.facts = (tokens, idx, o, env) => {
    const { items, stacked } = tokens[idx].meta;
    return `<dl class="facts${stacked ? ' stacked' : ''}">${items.map(([k, v]) => `<div><dt>${md.renderInline(k, env)}</dt><dd>${md.renderInline(v, env)}</dd></div>`).join('')}</dl>\n`;
  };
  r.pagelink = (tokens, idx, o, env) => {
    const { href, text } = tokens[idx].meta;
    return `<p class="pagelink-wrap"><a class="pagelink" href="${esc(href)}">${icon('menu_book')}<span class="pl-t">${md.renderInline(text, env)}</span>${icon('arrow_forward', 'pl-go')}</a></p>\n`;
  };
  r.figma = (tokens, idx, o, env) => {
    const { href, text } = tokens[idx].meta;
    return `<div class="proto"><p><a class="btn" href="${esc(href)}" data-figma>${icon('touch_app')}<span>${md.renderInline(text, env)}</span>${icon('arrow_outward')}</a></p></div>\n`;
  };

  r.image = (tokens, idx, o, env) => {
    const tok = tokens[idx];
    const src = tok.attrGet('src') || '';
    const yt = youtubeId(src);
    if (yt) return `<figure>${embed(yt, env)}</figure>\n`;

    const { cap, w: width } = splitWidth(tok.content);
    const caption = cap ? md.renderInline(cap, env) : '';
    const alt = splitWidth(plain(tok.children)).cap;
    const info = env.assets.get(decodeURI(src));
    const first = !env.gallery && env.figureCount++ === 0 && !env.hasVideos;
    // the inner <p> lets reader views (which only score paragraphs) find image-led pages
    const figcap = caption ? `<figcaption><p>${caption}</p></figcaption>` : '';

    if (!info) return `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${figcap}</figure>\n`;

    const ar = info.w / info.h;
    const cls = [];
    const style = [];
    let sizes;
    if (env.gallery) {
      style.push(`--ar:${ar.toFixed(4)}`);
      sizes = width ? `${width}px` : `(min-width: 1180px) ${Math.round(1080 / env.gallery)}px, ${Math.round(100 / env.gallery)}vw`;
    } else if (width) {
      sizes = `(min-width: ${width + 32}px) ${width}px, calc(100vw - 32px)`;
    } else if (ar >= 1.25) {
      cls.push('wide');
      sizes = '(min-width: 1180px) 1080px, calc(100vw - 32px)';
    } else sizes = '(min-width: 840px) 792px, calc(100vw - 32px)';
    if (width) { cls.push('sized'); style.push(`--w:${width}px`); }
    if (info.alpha) cls.push('alpha');
    if (info.kind === 'video') cls.push('vid');

    let media;
    if (info.kind === 'video') {
      media = `<video src="${esc(info.file)}" poster="${esc(info.poster)}" width="${info.w}" height="${info.h}" muted loop playsinline controls preload="none" disablepictureinpicture aria-label="${esc(alt || 'Animation')}"></video>`;
    } else {
      const srcset = info.widths.map((w) => `${esc(info.name)}-${w}.avif ${w}w`).join(', ');
      media = `<picture><source type="image/avif" srcset="${srcset}" sizes="${sizes}"><img src="${esc(info.fallback)}" width="${info.w}" height="${info.h}" alt="${esc(alt)}" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
    }
    return `<figure${cls.length ? ` class="${cls.join(' ')}"` : ''}${style.length ? ` style="${style.join(';')}"` : ''}>${media}${figcap}</figure>${env.gallery ? '' : '\n'}`;
  };

  return md;
}

export function embed({ id, t }, env) {
  const th = env.yt.get(id);
  const img = th ? `<img src="${th.file}" width="${th.w}" height="${th.h}" alt="" loading="lazy" decoding="async">` : '';
  return `<div class="yt"><a href="https://youtu.be/${id}${t ? `?t=${t}` : ''}" data-yt="${id}"${t ? ` data-t="${t}"` : ''} aria-label="Play video on YouTube">${img}<span class="yt-play">${icon('play_arrow')}</span></a></div>`;
}
