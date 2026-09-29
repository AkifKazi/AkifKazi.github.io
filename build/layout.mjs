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

const MARK = `<svg class="logo" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true"><path d="M8 12h16M16 6.5v19M16 14 8.5 24M16 14l7.5 10"/></svg>`;

export function analyticsSnippet({ clarity, ga }) {
  if (!clarity && !ga) return '';
  const parts = [];
  if (clarity) parts.push(`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",${JSON.stringify(clarity)});`);
  if (ga) parts.push(`var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id='+${JSON.stringify(ga)};document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga)});`);
  // Loaded after the page is done: on first interaction, or 6s after load.
  return `<script>(function(){var d=0;function go(){if(d)return;d=1;${parts.join('')}}['pointerdown','keydown','scroll','touchstart'].forEach(function(e){addEventListener(e,go,{once:true,passive:true})});addEventListener('load',function(){setTimeout(go,6000)})})();</script>`;
}

export function header({ site, home, resume, current }) {
  const nav = [
    [`${home}#projects`, 'Projects'],
    [`${home}#notes`, 'Notes'],
    resume && [resume, 'Resume'],
  ].filter(Boolean);
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="top-in">
<a class="mark" href="${home}" aria-label="${esc(site.name)}, home">${MARK}<span class="mark-t"><b>${esc(site.name.split(' ')[0])}</b> ${esc(site.name.split(' ').slice(1).join(' '))}</span></a>
<span class="top-line" aria-hidden="true"></span>
<nav class="nav" aria-label="Main">${nav.map(([h, l]) => `<a href="${h}"${current === l ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
<button class="theme" id="theme" type="button" aria-label="Switch to dark theme" title="Switch theme">${icon('dark_mode', 'to-dark')}${icon('light_mode', 'to-light')}</button>
</div></header>`;
}

export function footer(site, year, copyright) {
  const links = [
    `<a href="mailto:${esc(site.email)}">${icon('mail')}Email</a>`,
    ...site.links.map((l) => `<a href="${esc(l.href)}"${l.rel ? ` rel="${l.rel}"` : ''}>${esc(l.label)}${icon('arrow_outward', 'out')}</a>`),
  ];
  const note = copyright ? esc(copyright.replace(/\s*All rights reserved\.?$/, '')).trim() : `© ${year} ${esc(site.name)}.`;
  return `<footer class="foot"><div class="foot-in">
<p class="foot-k" aria-hidden="true"><span>End of file</span><span class="foot-line"></span></p>
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
<style>@font-face{font-family:Montserrat;src:url(${base}/fonts/montserrat-latin.woff2) format("woff2");font-weight:300 700;font-style:normal;font-display:swap}${css}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
<script>var THEME_COLORS={light:${JSON.stringify(LIGHT)},dark:${JSON.stringify(DARK)}};
${client}</script>
${analyticsSnippet(site.analytics)}
</body>
</html>
`;
}
