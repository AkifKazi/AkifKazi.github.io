# Design notes

Reference shots live in `references/` (kept out of git: game screenshots are Quantic Dream's, and the Notion comparison is a one-off).

- `references/detroit-become-human/`: menus, choice prompts, flowchart dialog, reconstruction timeline, loading screen.
- `references/notion-vs-site/`: the Notion page vs the first version of this site (the formatting that got lost).

## What we took from Detroit: Become Human

Kept, but toned down so pages stay fast and readable:

| In the game | On the site |
| --- | --- |
| Bright, sterile white-blue world, one steel-blue accent | Light theme by default (`#EEF2F5` ground, `#1D5A91` accent). Dark theme via the toggle |
| Large translucent triangles over everything | One fixed SVG of 5 soft facets behind the page, low contrast, slow drift on desktop only |
| Corner-bracket selection frame (`⌜ ⌟`) | Hover/focus state of cards, buttons, sub-page links, Continue; always on callouts (one corner) |
| Blue highlight with a slanted edge | Primary buttons and the YouTube play button (gradient cut, no `clip-path`, so focus rings still show) |
| Uppercase tracked labels, mixed weights ("AKIF **KAZI**") | Montserrat (closest free match to the game's Gotham-like UI face) for display text only; body stays system UI |
| Small mono data readouts ("GM / 1.3", "34%") | Section numbers, `Fig.03`, entry counts, `Project 01 / 03`, reading progress % in the contents list |
| Settings list: label left, value right, hairlines | Profile panel on home, project meta, `Key:: value` fact lists |
| "↵ CONTINUE" key prompt | Next project / note at the end of each page |
| Reconstruct scan line | Hover scan across images (desktop), a blue wipe that reveals page titles |

Left out on purpose: cut/sliced imagery, heavy glitch effects, video backgrounds, anything that needs a JS framework.

## Rules

- Sharp corners everywhere. No `border-radius`.
- Icons: [Material Symbols Sharp](https://fonts.google.com/icons), weight 200, from `build/icons/` (see `build/icons.mjs` to add one). One set only.
- Hover effects only under `@media (hover:hover) and (pointer:fine)`; touch gets `:active` feedback instead.
- Motion only under `prefers-reduced-motion: no-preference`.
- Transparent images (drawn for Notion's dark theme) sit on a dark backdrop (`--media`) in both themes. Detected automatically at build time.
