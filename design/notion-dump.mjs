// Dumps the published Notion pages (https://akifkazi.notion.site/portfolio) as outlines that keep
// what the Markdown export loses: text colours, image display widths, columns, toggles, callout icons.
// Usage: node design/notion-dump.mjs ids.txt   (one 32-char page id per line, from the export's file names)
// Writes dump/<Page_Title>.txt in the current folder. Uses Notion's unofficial public-site API.
import fs from 'node:fs';
const API = 'https://akifkazi.notion.site/api/v3/';
const uuid = (h) => h.replace(/-/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const post = async (ep, body) => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  throw new Error(ep + ' failed');
};
const blocks = {};
const val = (b) => b?.value?.value || b?.value;
async function loadPage(id) {
  let cursor = { stack: [] }, n = 0;
  do {
    const r = await post('loadPageChunk', { pageId: id, limit: 100, cursor, chunkNumber: n++, verticalColumns: false });
    Object.assign(blocks, r.recordMap.block || {});
    cursor = r.cursor;
  } while (cursor?.stack?.length);
}
async function fillMissing() {
  for (;;) {
    const missing = new Set();
    for (const b of Object.values(blocks)) for (const c of val(b)?.content || []) if (!blocks[c]) missing.add(c);
    if (!missing.size) return;
    const ids = [...missing];
    for (let i = 0; i < ids.length; i += 50) {
      const r = await post('syncRecordValuesMain', { requests: ids.slice(i, i + 50).map((id) => ({ pointer: { table: 'block', id, spaceId: 'ea542321-4f55-8188-a257-000355cf4b33' }, version: -1 })) });
      Object.assign(blocks, r.recordMap.block || {});
      for (const id of ids.slice(i, i + 50)) if (!blocks[id]) blocks[id] = { value: { type: 'missing', id } };
    }
  }
}
const rich = (t) => (t || []).map(([s, ann]) => {
  if (!ann) return s;
  const tags = ann.map((a) => a[0] === 'h' ? `color:${a[1]}` : a[0] === 'a' ? `link:${a[1]}` : a.join(':')).join(',');
  return `⟦${s}|${tags}⟧`;
}).join('');
function dump(id, depth, out, root) {
  const b = val(blocks[id]);
  if (!b) { out.push(`${'  '.repeat(depth)}?? ${id}`); return; }
  const f = b.format || {};
  const fmt = Object.entries(f).filter(([k]) => /width|height|color|icon|full|aspect|toggleable|column_ratio|list_format|page_cover|block_alignment|caption|code_wrap|table_block_column_header|preserve_scale/.test(k)).map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 70 ? v.slice(0, 70) + '…' : JSON.stringify(v)}`).join(' ');
  const p = b.properties || {};
  let text = rich(p.title);
  if (b.type === 'image' || b.type === 'video' || b.type === 'file' || b.type === 'embed') text = `src=${(p.source?.[0]?.[0] || f.display_source || '').split('?')[0].split('/').pop()} caption=${rich(p.caption)}`;
  if (b.type === 'code') text = `lang=${p.language?.[0]?.[0]} ${JSON.stringify(rich(p.title).slice(0, 80))}`;
  if (b.type === 'table_row') text = Object.values(p).map(rich).join(' | ');
  out.push(`${'  '.repeat(depth)}[${b.type}]${fmt ? ' {' + fmt + '}' : ''} ${text}`.trimEnd());
  if (b.type === 'page' && id !== root) return;
  for (const c of b.content || []) dump(c, depth + 1, out, root);
}
const ids = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
fs.mkdirSync('dump', { recursive: true });
for (const h of ids) {
  const id = uuid(h);
  await loadPage(id);
  await fillMissing();
  const out = [];
  dump(id, 0, out, id);
  const title = (val(blocks[id])?.properties?.title?.[0]?.[0] || h).replace(/[^\w]+/g, '_');
  fs.writeFileSync(`dump/${title}.txt`, out.join('\n'));
  console.log(title, out.length);
}
fs.writeFileSync('dump/blocks.json', JSON.stringify(blocks));
