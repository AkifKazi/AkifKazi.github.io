import fs from 'node:fs';
import path from 'node:path';
import { esc } from './render.mjs';

const HERE = import.meta.dirname;
const dark = fs.readFileSync(path.join(HERE, 'dark.css'), 'utf8').trim();
const css = fs.readFileSync(path.join(HERE, 'style.css'), 'utf8')
  .replaceAll('@@DARK@@', dark)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s*([{};,>])\s*/g, '$1')
  .replace(/\n+/g, '')
  .replace(/;}/g, '}');
const client = fs.readFileSync(path.join(HERE, 'client.js'), 'utf8').split('\n').map((l) => l.trim()).join('');

const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

const MARK = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M8 12h16M16 6.5v19M16 14 8.5 24M16 14l7.5 10"/></svg>`;
const HALF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>`;

export function analyticsSnippet({ clarity, ga }) {
  if (!clarity && !ga) return '';
  const parts = [];
  if (clarity) parts.push(`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",${JSON.stringify(clarity)});`);
  if (ga) parts.push(`var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id='+${JSON.stringify(ga)};document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga)});`);
  // Loaded after the page is done: on first interaction, or 6s after load.
  return `<script>(function(){var d=0;function go(){if(d)return;d=1;${parts.join('')}}['pointerdown','keydown','scroll','touchstart'].forEach(function(e){addEventListener(e,go,{once:true,passive:true})});addEventListener('load',function(){setTimeout(go,6000)})})();</script>`;
}

export function footer(site, year, copyright) {
  const links = [
    `<a href="mailto:${esc(site.email)}">Email</a>`,
    ...site.links.map((l) => `<a href="${esc(l.href)}"${l.rel ? ` rel="${l.rel}"` : ''}>${esc(l.label)}</a>`),
  ];
  return `<footer><ul class="links">${links.map((l) => `<li>${l}</li>`).join('')}</ul><p>${copyright ? esc(copyright.replace(/\s*All rights reserved\.?$/, '')).trim() + ' ' : `© ${year} ${esc(site.name)}. `}Licensed <a href="${esc(site.license.href)}" rel="license">${esc(site.license.label)}</a></p></footer>`;
}

export function layout({ site, title, description, canonical, ogImage, ogType = 'website', jsonld, body, href, wide = false, base }) {
  const meta = (k, v, attr = 'property') => `<meta ${attr}="${k}" content="${esc(v)}">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#EDF2F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C141D" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${base}/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">
${meta('og:type', ogType)}${meta('og:site_name', site.name)}${meta('og:title', title)}${meta('og:description', description)}${meta('og:url', canonical)}${ogImage ? meta('og:image', ogImage) + meta('og:image:width', '1200') + meta('og:image:height', '630') : ''}
${meta('twitter:card', 'summary_large_image', 'name')}${meta('twitter:title', title, 'name')}${meta('twitter:description', description, 'name')}${ogImage ? meta('twitter:image', ogImage, 'name') : ''}
<script>${THEME_INIT}</script>
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
</head>
<body${wide ? ' class="wide"' : ''}>
${body}
<script>${client}</script>
${analyticsSnippet(site.analytics)}
</body>
</html>
`;
}

export const toggleButton = `<button class="toggle" id="theme" type="button" aria-label="Switch light or dark theme">${HALF}</button>`;
export const markLink = (href) => `<a class="mark" href="${href}" aria-label="Home">${MARK}</a>`;
export const markBig = `<span class="mark bracket" aria-hidden="true">${MARK}</span>`;
