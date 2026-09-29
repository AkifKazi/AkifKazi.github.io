# Portfolio

Static site built from Markdown in `content/`. No framework in the browser; pages are plain HTML.

## Edit
- **Home intro:** `content/home.md` (its `facts` list fills the Profile panel). Links, email, analytics IDs, site URL: `site.config.json`.
- **Project / note:** a folder with an `index.md` and its images, e.g. `content/notes/my-note/index.md`.
  Projects go in `content/projects/`, smaller pieces in `content/notes/`. Open `content/` as an Obsidian vault if you like.
- **Front matter** (top of `index.md`): `title`, `description`, `year`, `tags`, `role`, `order` (lower = earlier), `prototype` (Figma link), `videos` (YouTube links), `cover` (image for the card).
- **Images / GIFs:** drop the files in the folder and reference them normally. `npm run media` (also run by `dev` and `build`) converts PNG/JPG to WebP and GIF to MP4, and moves your originals to `originals/`. Long videos: paste a YouTube link on its own line.
- **Captions:** the image's alt text is shown as its caption; leave it empty for none.
- **Image size:** add `|width` to the alt text, e.g. `![Asmi|144](image-1.webp)` or `![|336](demo.mp4)` (Obsidian's syntax, so it previews there too). Without it, an image fills the text column; wide landscape images break out wider on desktop. Images on consecutive lines of one paragraph sit side by side in a row.
- **Callouts:** `> [!tip]` (lightbulb), `> [!important]` (alert), `> [!note]` (info), `> [!key]` (key).
- **Grey label + text:** lines of `Label:: text` become a label/value list, e.g. `Goal:: Get the item fast`. For grey text inline, wrap it in `<small>`: `### <small>Primary Persona</small> First Time Home Buyer`. `##### Heading` is a small grey label.
- **Columns:** `::: columns 1 3` … `+++` … `:::` (ratios optional).
- **Toggles:** `::: toggle ## Heading` … `:::` collapses a section like a Notion toggle (`toggle+` starts it open). `::: toggle Show code` works for plain-text titles; a toggle that only holds a code block is left out of reader view.
- **Code:** fenced code blocks get a Copy button.
- A subfolder with its own `index.md` becomes a sub-page (see `projects/the-lantern-makers/guidelines`); a paragraph that is only a link to it (`[Guidelines](guidelines/)`) becomes a sub-page card. A paragraph that is only a Figma prototype link becomes a button that opens the prototype inline on desktop.
- Design notes and reference shots: `design/`.

## Run
```
npm install     # once
npm run dev     # preview at http://localhost:4321, rebuilds on save
npm run build   # writes dist/
```

## Publish (GitHub Pages)
Push to `main`. In the repo: Settings → Pages → Source: GitHub Actions. Set `url` in `site.config.json` to the final address (for a project repo: `https://<user>.github.io/<repo>`), or your domain later.
