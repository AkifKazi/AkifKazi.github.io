// Generates the soft "bright room" backdrop (after the Detroit menu scenes) into public/bg/.
// Run once: node design/make-background.mjs   (outputs are committed; the site loads them after the page)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.join(import.meta.dirname, '..', 'public', 'bg');
fs.mkdirSync(OUT, { recursive: true });
const W = 1600, H = 1000;

// deterministic pseudo-random so reruns give the same picture
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function scene({ base0, base1, pane, paneHi, band, cool, shade }) {
  // soft pools of light and shade (no hard streaks: they pulled the eye away from the content)
  const panes = [];
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * W, cy = rnd() * H, rx = 160 + rnd() * 320, ry = 200 + rnd() * 360;
    panes.push(`<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="${rnd() > 0.45 ? paneHi : pane}" opacity="${(0.25 + rnd() * 0.35).toFixed(2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base0}"/><stop offset="1" stop-color="${base1}"/></linearGradient>
<radialGradient id="glow" cx=".18" cy=".22" r=".55"><stop offset="0" stop-color="${paneHi}" stop-opacity=".95"/><stop offset="1" stop-color="${paneHi}" stop-opacity="0"/></radialGradient>
<radialGradient id="cool" cx=".62" cy=".62" r=".5"><stop offset="0" stop-color="${cool}" stop-opacity=".55"/><stop offset="1" stop-color="${cool}" stop-opacity="0"/></radialGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${shade}" stop-opacity="0"/><stop offset="1" stop-color="${shade}" stop-opacity=".35"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
${panes.join('')}
<rect width="${W}" height="${H}" fill="url(#cool)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect width="${W}" height="${H}" fill="url(#floor)"/>
</svg>`;
}

const variants = {
  light: { base0: '#EEF3F7', base1: '#A9C1D4', pane: '#DDE8F1', paneHi: '#FFFFFF', band: '#FFFFFF', cool: '#8FB0CA', shade: '#8FA8BD' },
  dark: { base0: '#0E1620', base1: '#070B10', pane: '#1B2A38', paneHi: '#3A5875', band: '#4A6C8C', cool: '#1D4F80', shade: '#000000' },
};

for (const [name, v] of Object.entries(variants)) {
  seed = 7;
  const img = await sharp(Buffer.from(scene(v))).resize(640, 400).blur(28).toBuffer();
  // a little grain stops the blur from banding on 8-bit screens
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + (rnd() - 0.5) * 2.5));
  await sharp(data, { raw: info }).webp({ quality: 70, effort: 6, smartSubsample: true }).toFile(path.join(OUT, `room-${name}.webp`));
  console.log(name, fs.statSync(path.join(OUT, `room-${name}.webp`)).size, 'bytes');
}
