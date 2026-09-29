// Material Symbols Sharp, weight 200 (Apache 2.0) — https://fonts.google.com/icons
// To add one: download https://unpkg.com/@material-symbols/svg-200/sharp/<name>.svg into build/icons/
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, 'icons');
const cache = new Map();

export function icon(name, cls = '') {
  if (!cache.has(name)) {
    const svg = fs.readFileSync(path.join(DIR, `${name}.svg`), 'utf8');
    const d = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).join('');
    cache.set(name, d);
  }
  return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 -960 960 960" width="24" height="24" aria-hidden="true" focusable="false"><path d="${cache.get(name)}"/></svg>`;
}
