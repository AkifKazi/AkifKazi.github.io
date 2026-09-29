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
  const panes = [];
  // tall window panes, denser and brighter towards the right like a lit wall of glass
  for (let x = 80; x < W; x += 70 + rnd() * 110) {
    const w = 18 + rnd() * 70;
    const bright = x / W;
    panes.push(`<rect x="${x.toFixed(0)}" y="${(-40 + rnd() * 120).toFixed(0)}" width="${w.toFixed(0)}" height="${(H * (0.7 + rnd() * 0.5)).toFixed(0)}" fill="${bright > 0.55 && rnd() > 0.35 ? paneHi : pane}" opacity="${(0.45 + bright * 0.55 * rnd()).toFixed(2)}"/>`);
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
<rect x="0" y="${H * 0.44}" width="${W}" height="26" fill="${band}" opacity=".75"/>
<rect x="${W * 0.1}" y="${H * 0.47}" width="${W * 0.8}" height="10" fill="${band}" opacity=".4"/>
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
  const img = await sharp(Buffer.from(scene(v))).resize(960, 600).blur(9).toBuffer();
  // a little grain stops the blur from banding on 8-bit screens
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + (rnd() - 0.5) * 2.5));
  await sharp(data, { raw: info }).webp({ quality: 70, effort: 6, smartSubsample: true }).toFile(path.join(OUT, `room-${name}.webp`));
  console.log(name, fs.statSync(path.join(OUT, `room-${name}.webp`)).size, 'bytes');
}
