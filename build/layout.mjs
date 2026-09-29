import fs from 'node:fs';
import path from 'node:path';
import { esc } from './render.mjs';
import { icon } from './icons.mjs';

const HERE = import.meta.dirname;
const LIGHT = '#EEF2F5', DARK = '#0B1016';
const dark = fs.readFileSync(path.join(HERE, 'dark.css'), 'utf8').trim();
const css = fs.readFileSync(path.join(HERE, 'style.css'), 'utf8')
  .replaceAll('@@DARK@@', dark)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s*([{};,>~])\s*/g, '$1')
  .replace(/\s*:\s*(?=[^{}]*;)/g, ':')
  .replace(/\n+/g, '')
  .replace(/;}/g, '}');
const client = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

// Light unless the visitor picked dark with the toggle.
const THEME_INIT = `document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

// Lettermark: full name where there's room, initials on narrow screens.
export const markLink = (site, home) => {
  const [first, ...rest] = site.name.split(' ');
  const initials = site.name.split(' ').map((w) => w[0]).join('');
  return `<a class="mark" href="${home}" aria-label="${esc(site.name)}, home"><span class="mark-t" aria-hidden="true"><b>${esc(first)}</b> ${esc(rest.join(' '))}</span><span class="mark-s" aria-hidden="true">${esc(initials)}</span></a>`;
};
export const themeButton = `<button class="theme" type="button" aria-label="Switch to dark theme" title="Switch theme">${icon('dark_mode', 'to-dark')}${icon('light_mode', 'to-light')}</button>`;
// Primary buttons carry a straight-down shadow like the game's selected bar.
export const drop = '<span class="drop" aria-hidden="true"></span>';

// Microsoft Clarity (scroll depth, time on page, click maps), loaded only after the visitor accepts.
// The choice is remembered in localStorage; with no Clarity ID configured nothing is added at all.
export function analyticsSnippet({ clarity }) {
  if (!clarity) return '';
  const load = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",${JSON.stringify(clarity)});`;
  return `<script>(function(){var K='analytics-consent',v;try{v=localStorage.getItem(K)}catch(e){}
function go(){${load}}
if(v==='yes')return go();if(v==='no')return;
var b=document.createElement('div');b.className='consent';b.setAttribute('role','region');b.setAttribute('aria-label','Analytics');
b.innerHTML='<p>This site uses Microsoft Clarity to see how far people scroll and where they click. It sets cookies. Fine with that?</p><div class="consent-b"><button type="button" data-v="yes">Accept</button><button type="button" data-v="no">Decline</button></div>';
b.addEventListener('click',function(e){var t=e.target.closest('button');if(!t)return;var a=t.dataset.v;try{localStorage.setItem(K,a)}catch(e){}b.remove();if(a==='yes')go()});
document.body.appendChild(b)})();</script>`;
}

export function header({ site, home, resume, current, minimal = false }) {
  const skip = `<a class="skip" href="#main">Skip to content</a>`;
  // Home: the page itself is the name and the navigation, so only the theme switch stays up top.
  if (minimal) return `${skip}\n<header class="top"><div class="top-in top-min">${themeButton}</div></header>`;
  const nav = [
    [`${home}#projects`, 'Projects'],
    [`${home}#notes`, 'Notes'],
    resume && [resume, 'Resume'],
  ].filter(Boolean);
  return `${skip}
<header class="top"><div class="top-in">
${markLink(site, home)}
<span class="top-line" aria-hidden="true"></span>
<nav class="nav" aria-label="Main">${nav.map(([h, l]) => `<a href="${h}"${current === l ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
${themeButton}
</div></header>`;
}

export function footer(site, year, copyright) {
  const links = [
    `<a href="mailto:${esc(site.email)}">${icon('mail')}Email</a>`,
    ...site.links.map((l) => `<a href="${esc(l.href)}"${l.rel ? ` rel="${l.rel}"` : ''}>${esc(l.label)}${icon('arrow_outward', 'out')}</a>`),
  ];
  const note = copyright ? esc(copyright.replace(/\s*All rights reserved\.?$/, '')).trim() : `© ${year} ${esc(site.name)}.`;
  return `<footer class="foot"><div class="foot-in">
<ul class="links">${links.map((l) => `<li>${l}</li>`).join('')}</ul>
<p class="legal">${note} Licensed <a href="${esc(site.license.href)}" rel="license">${esc(site.license.label)}</a></p>
</div></footer>`;
}

export function layout({ site, title, description, canonical, ogImage, ogType = 'website', jsonld, body, base, bodyClass = '', extraHead = '' }) {
  const meta = (k, v, attr = 'property') => `<meta ${attr}="${k}" content="${esc(v)}">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(site.name)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${LIGHT}">
<link rel="preload" href="${base}/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="${base}/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">
${meta('og:type', ogType)}${meta('og:site_name', site.name)}${meta('og:title', title)}${meta('og:description', description)}${meta('og:url', canonical)}${ogImage ? meta('og:image', ogImage) + meta('og:image:width', '1200') + meta('og:image:height', '630') : ''}
${meta('twitter:card', 'summary_large_image', 'name')}${meta('twitter:title', title, 'name')}${meta('twitter:description', description, 'name')}${ogImage ? meta('twitter:image', ogImage, 'name') : ''}${extraHead}
<script>${THEME_INIT}</script>
<style>@font-face{font-family:Montserrat;src:url(${base}/fonts/montserrat-latin.woff2) format("woff2");font-weight:300 700;font-style:normal;font-display:swap}:root{--room:url(${base}/bg/room-light.webp)}:root[data-theme="dark"]{--room:url(${base}/bg/room-dark.webp)}${css}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<div class="bg" aria-hidden="true"><div class="bg-l bg-l1"><div class="bg-room"></div></div><div class="bg-l bg-l2"><div class="bg-tri"></div></div></div>
${body}
<script>var THEME_COLORS={light:${JSON.stringify(LIGHT)},dark:${JSON.stringify(DARK)}};
${client}</script>
${analyticsSnippet(site.analytics)}
</body>
</html>
`;
}
