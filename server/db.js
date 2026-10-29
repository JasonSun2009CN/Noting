import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.NOTING_DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'noting.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    icon TEXT,
    cover TEXT,
    type TEXT NOT NULL DEFAULT 'page',
    favorite INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order REAL NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pages_parent ON pages(parent_id, sort_order);

  CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    html TEXT NOT NULL DEFAULT '',
    props TEXT NOT NULL DEFAULT '{}',
    indent INTEGER NOT NULL DEFAULT 0,
    sort_order REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS blocks_page ON blocks(page_id, sort_order);

  CREATE TABLE IF NOT EXISTS db_props (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    options TEXT NOT NULL DEFAULT '[]',
    sort_order REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS db_props_page ON db_props(page_id, sort_order);

  CREATE TABLE IF NOT EXISTS db_rows (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    props TEXT NOT NULL DEFAULT '{}',
    sort_order REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS db_rows_page ON db_rows(page_id, sort_order);
`);

export const now = () => Date.now();

export function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function parsePage(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    type: row.type,
    favorite: !!row.favorite,
    archived: !!row.archived,
    sortOrder: row.sort_order,
    settings: safeParse(row.settings, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseBlock(row) {
  return {
    id: row.id,
    type: row.type,
    html: row.html,
    props: safeParse(row.props, {}),
    indent: row.indent,
  };
}

export function parseProp(row) {
  return {
    id: row.id,
    pageId: row.page_id,
    name: row.name,
    type: row.type,
    options: safeParse(row.options, []),
    sortOrder: row.sort_order,
  };
}

export function parseRow(row) {
  return {
    id: row.id,
    pageId: row.page_id,
    title: row.title,
    props: safeParse(row.props, {}),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function getPage(id) {
  return parsePage(db.prepare('SELECT * FROM pages WHERE id = ?').get(id));
}

export function getPageRow(id) {
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
}

export function getBlocks(pageId) {
  return db
    .prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(pageId)
    .map(parseBlock);
}

export function getDatabase(pageId) {
  const props = db
    .prepare('SELECT * FROM db_props WHERE page_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(pageId)
    .map(parseProp);
  const rows = db
    .prepare('SELECT * FROM db_rows WHERE page_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(pageId)
    .map(parseRow);
  return { props, rows };
}

export function pageSettings(pageId) {
  const page = getPage(pageId);
  return page ? page.settings : {};
}

export function nextSortOrder(table, pageId) {
  const row = db
    .prepare(`SELECT MAX(sort_order) AS max FROM ${table} WHERE page_id = ?`)
    .get(pageId);
  return (row?.max ?? 0) + 1;
}

export function descendantIds(id) {
  const rows = db.prepare('SELECT id, parent_id FROM pages').all();
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.parent_id)) children.set(row.parent_id, []);
    children.get(row.parent_id).push(row.id);
  }
  const out = [];
  const walk = (pageId) => {
    for (const child of children.get(pageId) || []) {
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}
