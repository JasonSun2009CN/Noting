# AGENTS.md

Noting: a self-hosted, Notion-like workspace (block editor, nested pages, databases, BYOK AI).
Node 22+, ESM, npm. Three targets share one codebase: web client + Express/SQLite server,
Electron desktop shell, and a standalone static marketing site.

## Layout and entrypoints

- `server/index.js` — Express app, all `/api` routes, uploads, AI proxy, and static `dist/`
  serving. Exports `startServer()` used by CLI, Docker, and Electron; keep it importable
  (direct-run guard at the bottom).
- `server/db.js` — better-sqlite3 connection, schema, and row <-> JSON mappers. Opening the
  module creates the DB and tables.
- `server/util.js` — HTML sanitization, block allowlist, Markdown export.
- `web/src` — React 19 + TypeScript client. `api.ts` is the only module that calls the server.
  `types.ts` mirrors the server's JSON shapes. Hash routing (`#/page/:id`, `#/trash`).
- `web/src/styles.css` is the only stylesheet entry; it imports `styles/*.css` in order.
- `desktop/main.js` — Electron shell; sets `NOTING_DATA_DIR`/`NOTING_DIST_DIR`, deletes
  `NOTING_PASSWORD`, then dynamically imports `../server/index.js` (env must be set first).
- `site/` — static landing site, no build step and no npm dependencies; separate from the app.

## Commands

```bash
npm install
npm run dev     # API with node --watch on :4000 + Vite on :5173 (proxies /api and /uploads)
npm run build   # typecheck, then vite build -> ./dist
npm start       # serve ./dist + API on :4000
npm test        # node --test server/*.test.js (pure unit tests, no DB/server needed)
npm run seed    # DESTRUCTIVE: wipes all tables, recreates the demo workspace
```

- Single test file: `node --test server/util.test.js`.
- Single test by name: `node --test --test-name-pattern="cleanHtml" server/util.test.js`.
- New tests must be named `server/*.test.js` to be picked up by `npm test`.
- Verification is `npm run typecheck && npm test`. There is no lint or formatter; TypeScript
  only covers `web/src`, so review server-side JS changes by hand.
- Build output is repo-root `dist/` (not `web/dist`), and it is gitignored.
- Desktop: `npm run desktop` (builds first, then launches); `npm run dist:mac|win|linux`
  writes installers to `release/`.

## Blocks and data model gotchas

- Schema is declared with `CREATE TABLE IF NOT EXISTS` in `server/db.js`; there is no migration
  system. New columns need a manual `ALTER TABLE` (or reseed) for existing `data/noting.db`.
- Blocks save as a full-page replace: `PUT /api/pages/:id/blocks` deletes and reinserts every
  block. The editor autosaves 550ms after edits with the complete list plus a `beforeunload`
  keepalive flush — never send partial block lists.
- Selection cannot natively cross blocks because each block is its own `contentEditable`
  editing host. Whole-page ⌘A and cross-block drag selection work by temporarily setting
  every `.block-editable` to `contentEditable="false"` (`setEditingLocked` in
  `web/src/components/Editor.tsx`) and restoring it on the next click/key. Keep that
  invariant when refactoring the editor.
- All saved content is sanitized server-side (`sanitizeBlocks` in `server/util.js`): unknown
  block types silently degrade to `paragraph`, unknown props are dropped, indent is clamped
  0–8, and HTML is limited to inline tags (`b/strong/i/em/u/s/code/a/br/mark`). Adding a block
  type or prop requires touching `web/src/types.ts`, `server/util.js`
  (`ALLOWED_BLOCK_TYPES` + `sanitizeProps`), the editor, and `blocksToMarkdown` for export.
- Database property types have a second allowlist: `allowedPropType()` in `server/index.js`.
- `sort_order` is REAL to allow fractional reordering; pages/props/rows are always read
  ordered by it.

## Constraints

- AI keys live only in browser `localStorage` (`noting.ai`) and are sent per request to
  `/api/ai/*`, which streams to the provider. Never persist or log keys server-side.
- Use relative URLs (`/api`, `/uploads`) in the client so the Vite proxy and Electron origin
  both work.
- `data/` holds the SQLite DB and uploads; it is gitignored and present locally — never commit
  it. Copying `noting.db` while running can miss WAL writes.
- Uploads accept images only, max 12 MB, stored in `data/uploads` and served at `/uploads`.
- CI: `.github/workflows/desktop.yml` runs tests, build, and electron-builder on `v*` tags or
  manual dispatch; `.github/workflows/pages.yml` deploys `site/` on pushes to `main` that touch
  it. Commit messages use conventional prefixes (`feat:`, `fix:`, `ci:`).
