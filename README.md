# Portfolio

Static site built from Markdown in `content/`. No framework in the browser; pages are plain HTML.

## Edit
- **Home intro:** `content/home.md`. Links, email, analytics IDs, site URL: `site.config.json`.
- **Project / note:** a folder with an `index.md` and its images, e.g. `content/notes/my-note/index.md`.
  Projects go in `content/projects/`, smaller pieces in `content/notes/`. Open `content/` as an Obsidian vault if you like.
- **Front matter** (top of `index.md`): `title`, `description`, `year`, `tags`, `role`, `order` (lower = earlier), `prototype` (Figma link), `videos` (YouTube links), `cover` (image for the card).
- **Images / GIFs:** drop the files in the folder and reference them normally. `npm run media` (also run by `dev` and `build`) converts PNG/JPG to WebP and GIF to MP4, and moves your originals to `originals/`. Long videos: paste a YouTube link on its own line.
- **Callouts:** `> [!tip]`, `> [!note]`, `> [!important]`. **Captions:** the image's alt text is shown as its caption; leave it empty for none.
- A subfolder with its own `index.md` becomes a sub-page (see `projects/the-lantern-makers/guidelines`).

## Run
```
npm install     # once
npm run dev     # preview at http://localhost:4321, rebuilds on save
npm run build   # writes dist/
```

## Publish (GitHub Pages)
Push to `main`. In the repo: Settings → Pages → Source: GitHub Actions. Set `url` in `site.config.json` to the final address (for a project repo: `https://<user>.github.io/<repo>`), or your domain later.
