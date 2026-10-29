# Noting website

Static marketing site for Noting. No build step, no dependencies.

```bash
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000.

`index.html` is the landing page, `privacy.html` is the privacy note and
`404.html` is the custom not found page. Styles live in `styles.css`, behaviour in
`main.js`, and images and fonts in `assets/`.

The site deploys to GitHub Pages through `.github/workflows/pages.yml` on every
push to `main` that touches this folder. Use **Actions → Deploy site → Run workflow**
to publish manually.

Download buttons point at the GitHub Releases page. When a release exists,
`main.js` asks the GitHub API for the latest one and rewrites the buttons to the
matching installer for the visitor's platform, falling back to the releases page
if anything fails.
