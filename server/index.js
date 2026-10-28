import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import {
  DATA_DIR,
  ROOT,
  UPLOAD_DIR,
  db,
  descendantIds,
  getBlocks,
  getDatabase,
  getMeta,
  getPage,
  getPageRow,
  nextSortOrder,
  now,
  parseBlock,
  parsePage,
  parseProp,
  parseRow,
  setMeta,
} from './db.js';
import { blocksToMarkdown, cleanHtml, htmlToText, sanitizeBlocks, uid } from './util.js';
import { seedDatabase } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4000;

seedDatabase();

if (process.env.NOTING_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === process.env.NOTING_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Noting"');
    return res.status(401).send('Authentication required');
  });
}

app.use(compression());
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

const api = express.Router();

api.get('/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

api.get('/bootstrap', (req, res) => {
  const pages = db
    .prepare('SELECT * FROM pages WHERE archived = 0 ORDER BY sort_order ASC, created_at ASC')
    .all()
    .map(parsePage);
  const trashCount = db
    .prepare('SELECT COUNT(*) AS n FROM pages WHERE archived = 1')
    .get().n;
  res.json({
    pages,
    favorites: pages.filter((page) => page.favorite).map((page) => page.id),
    workspace: { name: getMeta('workspace_name', 'My Workspace') },
    trashCount,
  });
});

api.patch('/workspace', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Workspace name is required.' });
  setMeta('workspace_name', name);
  res.json({ name });
});

api.get('/pages/:id', (req, res) => {
  const page = getPage(req.params.id);
  if (!page) return res.status(404).json({ error: 'Page not found.' });
  const payload = { page, blocks: getBlocks(page.id) };
  if (page.type === 'database') payload.database = getDatabase(page.id);
  res.json(payload);
});

api.post('/pages', (req, res) => {
  const parentId = req.body?.parentId || null;
  if (parentId && !getPageRow(parentId)) {
    return res.status(400).json({ error: 'Parent page not found.' });
  }
  const type = req.body?.type === 'database' ? 'database' : 'page';
  const id = uid();
  const timestamp = now();
  const title = String(req.body?.title ?? '').slice(0, 500);
  const sortOrder = nextPageSortOrder(parentId);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO pages (id, parent_id, title, icon, cover, type, favorite, archived, sort_order, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, '{}', ?, ?)`
    ).run(
      id,
      parentId,
      title,
      req.body?.icon ? String(req.body.icon).slice(0, 32) : null,
      req.body?.cover ? String(req.body.cover).slice(0, 4000) : null,
      type,
      sortOrder,
      timestamp,
      timestamp
    );

    if (type === 'database') {
      const propStmt = db.prepare(
        `INSERT INTO db_props (id, page_id, name, type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
      );
      propStmt.run(uid(), id, 'Status', 'select', JSON.stringify([
        { id: uid(), name: 'Not started', color: 'gray' },
        { id: uid(), name: 'In progress', color: 'blue' },
        { id: uid(), name: 'Done', color: 'green' },
      ]), 0);
      propStmt.run(uid(), id, 'Owner', 'text', '[]', 1);
    } else {
      db.prepare(
        `INSERT INTO blocks (id, page_id, type, html, props, indent, sort_order)
         VALUES (?, ?, 'paragraph', '', '{}', 0, 0)`
      ).run(uid(), id);
    }
  })();

  const page = getPage(id);
  const payload = { page, blocks: getBlocks(id) };
  if (type === 'database') payload.database = getDatabase(id);
  res.status(201).json(payload);
});

api.patch('/pages/:id', (req, res) => {
  const row = getPageRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Page not found.' });
  const updates = {};
  const body = req.body || {};

  if (typeof body.title === 'string') updates.title = body.title.slice(0, 500);
  if (body.icon !== undefined) updates.icon = body.icon ? String(body.icon).slice(0, 4000) : null;
  if (body.cover !== undefined) updates.cover = body.cover ? String(body.cover).slice(0, 4000) : null;
  if (body.favorite !== undefined) updates.favorite = body.favorite ? 1 : 0;
  if (body.archived !== undefined) updates.archived = body.archived ? 1 : 0;
  if (body.parentId !== undefined) {
    const parentId = body.parentId || null;
    if (parentId) {
      if (!getPageRow(parentId)) return res.status(400).json({ error: 'Parent page not found.' });
      if (parentId === row.id || descendantIds(row.id).includes(parentId)) {
        return res.status(400).json({ error: 'A page cannot be moved inside itself.' });
      }
    }
    updates.parent_id = parentId;
    updates.sort_order = nextPageSortOrder(parentId);
  }
  if (body.settings && typeof body.settings === 'object') {
    updates.settings = JSON.stringify({
      ...JSON.parse(row.settings || '{}'),
      ...body.settings,
    });
  }
  if (body.sortOrder !== undefined) updates.sort_order = Number(body.sortOrder) || 0;

  if (Object.keys(updates).length === 0) {
    return res.json({ page: parsePage(row) });
  }
  updates.updated_at = now();

  const keys = Object.keys(updates);
  db.prepare(`UPDATE pages SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run({
    ...updates,
    id: row.id,
  });

  res.json({ page: getPage(row.id) });
});

api.post('/pages/:id/duplicate', (req, res) => {
  const row = getPageRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Page not found.' });
  const copyRootId = duplicatePage(row.id, row.parent_id, row.title ? `${row.title} (copy)` : 'Untitled');
  res.status(201).json({ page: getPage(copyRootId) });
});

function duplicatePage(pageId, parentId, title) {
  const source = getPageRow(pageId);
  if (!source) return null;
  const id = uid();
  const timestamp = now();
  const sortOrder = nextPageSortOrder(parentId);
  db.prepare(
    `INSERT INTO pages (id, parent_id, title, icon, cover, type, favorite, archived, sort_order, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
  ).run(
    id,
    parentId,
    title ?? source.title,
    source.icon,
    source.cover,
    source.type,
    sortOrder,
    parentId === source.parent_id ? source.sort_order + 0.5 : sortOrder,
    timestamp,
    timestamp
  );

  // Copy the whole subtree first, keeping a map so page-link blocks point at copies.
  const childMap = new Map();
  const children = db
    .prepare('SELECT id, title FROM pages WHERE parent_id = ? AND archived = 0 ORDER BY sort_order')
    .all(pageId);
  for (const child of children) {
    const childCopyId = duplicatePage(child.id, id, child.title);
    if (childCopyId) childMap.set(child.id, childCopyId);
  }

  const blocks = db.prepare('SELECT * FROM blocks WHERE page_id = ? ORDER BY sort_order').all(pageId);
  const blockStmt = db.prepare(
    `INSERT INTO blocks (id, page_id, type, html, props, indent, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const block of blocks) {
    let props = block.props;
    if (block.type === 'page') {
      try {
        const parsed = JSON.parse(props);
        if (childMap.has(parsed.pageId)) {
          parsed.pageId = childMap.get(parsed.pageId);
          props = JSON.stringify(parsed);
        }
      } catch {
        // keep original props
      }
    }
    blockStmt.run(uid(), id, block.type, block.html, props, block.indent, block.sort_order);
  }

  if (source.type === 'database') {
    const props = db.prepare('SELECT * FROM db_props WHERE page_id = ? ORDER BY sort_order').all(pageId);
    const rows = db.prepare('SELECT * FROM db_rows WHERE page_id = ? ORDER BY sort_order').all(pageId);
    const propStmt = db.prepare(
      `INSERT INTO db_props (id, page_id, name, type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const propMap = new Map();
    for (const prop of props) {
      const newPropId = uid();
      propMap.set(prop.id, newPropId);
      propStmt.run(newPropId, id, prop.name, prop.type, prop.options, prop.sort_order);
    }
    const rowStmt = db.prepare(
      `INSERT INTO db_rows (id, page_id, title, props, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const dbRow of rows) {
      let rowProps = {};
      try {
        const parsed = JSON.parse(dbRow.props || '{}');
        for (const [oldKey, value] of Object.entries(parsed)) {
          rowProps[propMap.get(oldKey) || oldKey] = value;
        }
      } catch {
        rowProps = {};
      }
      rowStmt.run(uid(), id, dbRow.title, JSON.stringify(rowProps), dbRow.sort_order, timestamp, timestamp);
    }
  }

  return id;
}

api.delete('/pages/:id', (req, res) => {
  const row = getPageRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Page not found.' });
  const permanent = req.query.permanent === '1' || req.query.permanent === 'true';

  if (permanent) {
    db.prepare('DELETE FROM pages WHERE id = ?').run(row.id);
    return res.json({ ok: true, permanent: true });
  }

  const ids = [row.id, ...descendantIds(row.id)];
  const stmt = db.prepare('UPDATE pages SET archived = 1, favorite = 0, updated_at = ? WHERE id = ?');
  const timestamp = now();
  db.transaction(() => ids.forEach((id) => stmt.run(timestamp, id)))();
  res.json({ ok: true, ids });
});

api.get('/trash', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.* FROM pages p
       LEFT JOIN pages parent ON parent.id = p.parent_id
       WHERE p.archived = 1 AND (p.parent_id IS NULL OR parent.archived = 0)
       ORDER BY p.updated_at DESC`
    )
    .all();
  res.json({ pages: rows.map(parsePage) });
});

api.post('/trash/empty', (req, res) => {
  db.prepare('DELETE FROM pages WHERE archived = 1').run();
  res.json({ ok: true });
});

api.post('/pages/:id/restore', (req, res) => {
  const row = getPageRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Page not found.' });
  let parentId = row.parent_id;
  if (parentId && !getPageRow(parentId)) parentId = null;
  const ids = [row.id, ...descendantIds(row.id)];
  const stmt = db.prepare('UPDATE pages SET archived = 0, updated_at = ? WHERE id = ?');
  const timestamp = now();
  db.transaction(() => {
    if (parentId !== row.parent_id) {
      db.prepare('UPDATE pages SET parent_id = ? WHERE id = ?').run(parentId, row.id);
    }
    ids.forEach((id) => stmt.run(timestamp, id));
  })();
  res.json({ page: getPage(row.id) });
});

api.put('/pages/:id/blocks', (req, res) => {
  const page = getPageRow(req.params.id);
  if (!page) return res.status(404).json({ error: 'Page not found.' });
  const blocks = sanitizeBlocks(req.body?.blocks);
  if (!blocks.length) {
    blocks.push({ id: uid(), type: 'paragraph', html: '', props: {}, indent: 0 });
  }

  const insert = db.prepare(
    `INSERT INTO blocks (id, page_id, type, html, props, indent, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    db.prepare('DELETE FROM blocks WHERE page_id = ?').run(page.id);
    blocks.forEach((block, index) => {
      insert.run(block.id, page.id, block.type, block.html, JSON.stringify(block.props), block.indent, index);
    });
    db.prepare('UPDATE pages SET updated_at = ? WHERE id = ?').run(now(), page.id);
  })();

  res.json({ ok: true, savedAt: now() });
});

api.patch('/pages/:id/archive', (req, res) => {
  const row = getPageRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Page not found.' });
  const archived = req.body?.archived !== false;
  const ids = [row.id, ...descendantIds(row.id)];
  const timestamp = now();
  const stmt = db.prepare('UPDATE pages SET archived = ?, updated_at = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id) => stmt.run(archived ? 1 : 0, timestamp, id)))();
  res.json({ ok: true });
});

api.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.json({ results: [] });
  const like = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const pages = db
    .prepare(
      `SELECT DISTINCT p.* FROM pages p
       LEFT JOIN blocks b ON b.page_id = p.id
       WHERE p.archived = 0 AND (p.title LIKE ? ESCAPE '\\' OR b.html LIKE ? ESCAPE '\\')
       ORDER BY p.updated_at DESC
       LIMIT 30`
    )
    .all(like, like);
  const results = pages.map((row) => {
    const page = parsePage(row);
    let snippet = '';
    if (!page.title.toLowerCase().includes(q.toLowerCase())) {
      const match = db
        .prepare('SELECT html FROM blocks WHERE page_id = ? ORDER BY sort_order')
        .all(page.id)
        .map((block) => htmlToText(block.html))
        .find((text) => text.toLowerCase().includes(q.toLowerCase()));
      if (match) {
        const index = match.toLowerCase().indexOf(q.toLowerCase());
        snippet = match.slice(Math.max(0, index - 40), index + q.length + 60).trim();
      }
    } else {
      const first = db
        .prepare("SELECT html FROM blocks WHERE page_id = ? ORDER BY sort_order LIMIT 1")
        .get(page.id);
      snippet = first ? htmlToText(first.html).slice(0, 100) : '';
    }
    const parent = page.parentId ? getPage(page.parentId) : null;
    return {
      ...page,
      snippet,
      parentTitle: parent?.title || '',
    };
  });
  res.json({ results });
});

api.get('/pages/:id/export', (req, res) => {
  const page = getPage(req.params.id);
  if (!page) return res.status(404).json({ error: 'Page not found.' });
  const database = page.type === 'database' ? getDatabase(page.id) : null;
  const markdown = blocksToMarkdown(page, getBlocks(page.id), database);
  const filename = `${(page.title || 'Untitled').replace(/[^\w\u4e00-\u9fa5-]+/g, '-')}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(markdown);
});

// ---------------------------------------------------------------------------
// Database endpoints
// ---------------------------------------------------------------------------

api.post('/pages/:id/props', (req, res) => {
  const page = getPage(req.params.id);
  if (!page || page.type !== 'database') return res.status(404).json({ error: 'Database not found.' });
  const name = String(req.body?.name || 'Property').slice(0, 80);
  const type = allowedPropType(req.body?.type);
  const options = type === 'select' || type === 'multi_select'
    ? (Array.isArray(req.body?.options) ? req.body.options : []).map((opt) => ({
        id: uid(),
        name: String(opt.name || 'Option').slice(0, 80),
        color: String(opt.color || 'gray').slice(0, 20),
      }))
    : [];
  const id = uid();
  db.prepare(
    `INSERT INTO db_props (id, page_id, name, type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, page.id, name, type, JSON.stringify(options), nextSortOrder('db_props', page.id));
  res.status(201).json({ prop: parseProp(db.prepare('SELECT * FROM db_props WHERE id = ?').get(id)) });
});

api.patch('/props/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM db_props WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  const updates = {};
  if (typeof req.body?.name === 'string') updates.name = req.body.name.slice(0, 80);
  if (req.body?.options && Array.isArray(req.body.options)) {
    const existing = JSON.parse(row.options || '[]');
    updates.options = JSON.stringify(req.body.options.map((opt) => ({
      id: opt.id || existing.find((item) => item.name === opt.name)?.id || uid(),
      name: String(opt.name || '').slice(0, 80),
      color: String(opt.color || 'gray').slice(0, 20),
    })));
  }
  if (Object.keys(updates).length === 0) {
    return res.json({ prop: parseProp(row) });
  }
  db.prepare(`UPDATE db_props SET ${Object.keys(updates).map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run({
    ...updates,
    id: row.id,
  });
  res.json({ prop: parseProp(db.prepare('SELECT * FROM db_props WHERE id = ?').get(row.id)) });
});

api.delete('/props/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM db_props WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  db.transaction(() => {
    db.prepare('DELETE FROM db_props WHERE id = ?').run(row.id);
    const rows = db.prepare('SELECT id, props FROM db_rows WHERE page_id = ?').all(row.page_id);
    const update = db.prepare('UPDATE db_rows SET props = ? WHERE id = ?');
    for (const dbRow of rows) {
      const props = JSON.parse(dbRow.props || '{}');
      delete props[row.id];
      update.run(JSON.stringify(props), dbRow.id);
    }
  })();
  res.json({ ok: true });
});

api.post('/pages/:id/rows', (req, res) => {
  const page = getPage(req.params.id);
  if (!page || page.type !== 'database') return res.status(404).json({ error: 'Database not found.' });
  const id = uid();
  const timestamp = now();
  const sortOrder = nextSortOrder('db_rows', page.id);
  db.prepare(
    `INSERT INTO db_rows (id, page_id, title, props, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, page.id, String(req.body?.title || '').slice(0, 500), JSON.stringify({}), sortOrder, timestamp, timestamp);
  res.status(201).json({ row: parseRow(db.prepare('SELECT * FROM db_rows WHERE id = ?').get(id)) });
});

api.patch('/rows/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM db_rows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Row not found.' });
  const updates = { updated_at: now() };
  if (typeof req.body?.title === 'string') updates.title = req.body.title.slice(0, 500);
  if (req.body?.props && typeof req.body.props === 'object') {
    const current = JSON.parse(row.props || '{}');
    updates.props = JSON.stringify({ ...current, ...req.body.props });
  }
  db.prepare(`UPDATE db_rows SET ${Object.keys(updates).map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run({
    ...updates,
    id: row.id,
  });
  res.json({ row: parseRow(db.prepare('SELECT * FROM db_rows WHERE id = ?').get(row.id)) });
});

api.delete('/rows/:id', (req, res) => {
  db.prepare('DELETE FROM db_rows WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function allowedPropType(type) {
  return ['text', 'number', 'select', 'multi_select', 'checkbox', 'date', 'url'].includes(type)
    ? type
    : 'text';
}

function nextTopLevelSortOrder() {
  const row = db.prepare('SELECT MAX(sort_order) AS max FROM pages WHERE parent_id IS NULL').get();
  return (row?.max ?? 0) + 1;
}

function nextPageSortOrder(parentId) {
  const row = parentId
    ? db.prepare('SELECT MAX(sort_order) AS max FROM pages WHERE parent_id = ?').get(parentId)
    : db.prepare('SELECT MAX(sort_order) AS max FROM pages WHERE parent_id IS NULL').get();
  return (row?.max ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png';
    cb(null, `${uid()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/.test(file.mimetype)) {
      return cb(new Error('Only image uploads are supported.'));
    }
    cb(null, true);
  },
});

api.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
  });
});

// ---------------------------------------------------------------------------
// AI proxy — keys are provided per request and never stored server-side.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
};

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-40).map((message) => ({
    role: ['system', 'assistant', 'user'].includes(message?.role) ? message.role : 'user',
    content: String(message?.content || '').slice(0, 60_000),
  }));
}

api.post('/ai/chat', async (req, res) => {
  const provider = String(req.body?.provider || 'openai');
  const apiKey = String(req.body?.apiKey || '');
  const model = String(req.body?.model || '').slice(0, 120);
  const baseUrl = String(req.body?.baseUrl || DEFAULT_BASE_URLS[provider] || '').replace(/\/+$/, '');
  const messages = normalizeMessages(req.body?.messages);
  const temperature = Math.max(0, Math.min(2, Number(req.body?.temperature ?? 0.7)));
  const system = String(req.body?.system || '').slice(0, 20_000);
  const maxTokens = Math.max(64, Math.min(16_000, Number(req.body?.maxTokens) || 4096));

  if (!model) return res.status(400).json({ error: 'Choose a model first.' });
  if (!baseUrl) return res.status(400).json({ error: 'An API base URL is required.' });
  if (provider !== 'ollama' && !apiKey) {
    return res.status(400).json({ error: 'Add your API key in Settings first.' });
  }
  if (!messages.length) return res.status(400).json({ error: 'No messages provided.' });

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    let response;
    if (provider === 'anthropic') {
      const url = baseUrl.endsWith('/v1/messages') ? baseUrl : `${baseUrl}/v1/messages`;
      const anthropicMessages = messages.filter((message) => message.role !== 'system');
      const systemPrompt = [system, ...messages.filter((m) => m.role === 'system').map((m) => m.content)]
        .filter(Boolean)
        .join('\n\n');
      response = await fetch(url, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          stream: true,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: anthropicMessages.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
          })),
        }),
      });
    } else {
      const url = /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
      response = await fetch(url, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature,
          stream: true,
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
        }),
      });
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      let message = detail.slice(0, 800);
      try {
        const parsed = JSON.parse(detail);
        message = parsed?.error?.message || parsed?.message || message;
      } catch {
        // keep raw detail
      }
      return res.status(response.status || 502).json({
        error: message || `The AI provider returned ${response.status}.`,
      });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (provider === 'anthropic') {
            if (event.type === 'content_block_delta' && event.delta?.text) {
              res.write(event.delta.text);
            }
            if (event.type === 'error') {
              res.write(`\n\n[Error: ${event.error?.message || 'provider error'}]`);
            }
          } else {
            const text = event.choices?.[0]?.delta?.content;
            if (text) res.write(text);
            if (event.error) res.write(`\n\n[Error: ${event.error?.message || 'provider error'}]`);
          }
        } catch {
          // Ignore malformed SSE frames from providers.
        }
      }
    }
    res.end();
  } catch (error) {
    if (abort.signal.aborted) return;
    if (res.headersSent) {
      res.write(`\n\n[Error: ${error?.message || 'Connection interrupted'}]`);
      res.end();
    } else {
      res.status(502).json({ error: error?.message || 'Could not reach the AI provider.' });
    }
  }
});

api.post('/ai/models', async (req, res) => {
  const provider = String(req.body?.provider || 'openai');
  const apiKey = String(req.body?.apiKey || '');
  const baseUrl = String(req.body?.baseUrl || DEFAULT_BASE_URLS[provider] || '').replace(/\/+$/, '');
  if (!baseUrl) return res.status(400).json({ error: 'An API base URL is required.' });

  try {
    if (provider === 'anthropic') {
      return res.json({
        models: [
          'claude-sonnet-4-5',
          'claude-opus-4-1',
          'claude-haiku-4-5',
          'claude-3-7-sonnet-latest',
        ],
      });
    }
    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Could not load models (${response.status}).` });
    }
    const data = await response.json();
    const models = (data?.data || data?.models || [])
      .map((model) => model.id || model.name)
      .filter(Boolean)
      .slice(0, 200);
    res.json({ models });
  } catch (error) {
    res.status(502).json({ error: error?.message || 'Could not reach the AI provider.' });
  }
});

app.use('/api', api);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  res.status(status).json({ error: error?.message || 'Something went wrong.' });
});

// ---------------------------------------------------------------------------
// Static frontend (production build)
// ---------------------------------------------------------------------------

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Noting API listening on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
