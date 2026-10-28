import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, getMeta, now, setMeta } from './db.js';
import { uid } from './util.js';

const t = now();

function insertPage(page) {
  db.prepare(
    `INSERT INTO pages (id, parent_id, title, icon, cover, type, favorite, archived, sort_order, settings, created_at, updated_at)
     VALUES (@id, @parentId, @title, @icon, @cover, @type, @favorite, 0, @sortOrder, @settings, @createdAt, @updatedAt)`
  ).run({
    id: page.id,
    parentId: page.parentId ?? null,
    title: page.title ?? '',
    icon: page.icon ?? null,
    cover: page.cover ?? null,
    type: page.type ?? 'page',
    favorite: page.favorite ? 1 : 0,
    sortOrder: page.sortOrder ?? 0,
    settings: JSON.stringify(page.settings ?? {}),
    createdAt: page.createdAt ?? t,
    updatedAt: page.updatedAt ?? t,
  });
}

function insertBlocks(pageId, blocks) {
  const stmt = db.prepare(
    `INSERT INTO blocks (id, page_id, type, html, props, indent, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  blocks.forEach((block, index) => {
    stmt.run(
      block.id || uid(),
      pageId,
      block.type || 'paragraph',
      block.html || '',
      JSON.stringify(block.props || {}),
      block.indent || 0,
      index
    );
  });
}

const p = (html, props = {}) => ({ type: 'paragraph', html, props });
const h1 = (html) => ({ type: 'h1', html });
const h2 = (html) => ({ type: 'h2', html });
const h3 = (html) => ({ type: 'h3', html });
const bullet = (html, indent = 0) => ({ type: 'bulleted', html, indent });
const todo = (html, checked = false, indent = 0) => ({
  type: 'todo',
  html,
  props: { checked },
  indent,
});
const callout = (html, emoji = '💡', color = 'gray') => ({
  type: 'callout',
  html,
  props: { emoji, color },
});
const code = (text, language = 'javascript') => ({
  type: 'code',
  html: text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  props: { language },
});
const divider = () => ({ type: 'divider' });

export function seedDatabase() {
  if (db.prepare('SELECT COUNT(*) AS n FROM pages').get().n > 0) return false;

  setMeta('workspace_name', 'My Workspace');
  setMeta('seeded_at', String(t));

  const welcomeId = uid();
  const guideId = uid();
  const shortcutsId = uid();
  const readingId = uid();
  const roadmapId = uid();
  const notesId = uid();

  db.transaction(() => {
    insertPage({
      id: welcomeId,
      title: 'Welcome to Noting',
      icon: '👋',
      cover: 'gradient:peach',
      favorite: true,
      sortOrder: 1,
    });
    insertPage({
      id: guideId,
      parentId: welcomeId,
      title: 'Feature guide',
      icon: '🧭',
      sortOrder: 1,
    });
    insertPage({
      id: shortcutsId,
      parentId: welcomeId,
      title: 'Keyboard shortcuts',
      icon: '⌨️',
      sortOrder: 2,
    });
    insertPage({
      id: readingId,
      title: 'Reading list',
      icon: '📚',
      type: 'database',
      cover: 'gradient:mint',
      favorite: true,
      sortOrder: 2,
    });
    insertPage({
      id: roadmapId,
      title: 'Product roadmap',
      icon: '🗺️',
      type: 'database',
      sortOrder: 3,
    });
    insertPage({
      id: notesId,
      title: 'Quick notes',
      icon: '📝',
      sortOrder: 4,
    });

    insertBlocks(welcomeId, [
      callout(
        '<strong>Welcome!</strong> This is a self-hosted workspace you actually own. Write, plan, and organize — then bring your own AI key to write with you.',
        '🌟',
        'yellow'
      ),
      p(''),
      h2('Everything you need to think'),
      p('Noting is a block-based workspace inspired by Notion. Every piece of content is a block, so you can rearrange ideas as easily as you rearrange thoughts.'),
      bullet('Type <code>/</code> on an empty line to insert anything — headings, lists, toggles, code, images or a new page.'),
      bullet('Press <code>Tab</code> to nest blocks, <code>Shift + Tab</code> to outdent.'),
      bullet('Hover a block and drag the <strong>⋮⋮</strong> handle to move it around.'),
      bullet('Select text to format it — bold, italic, underline, strikethrough, code, links.'),
      p(''),
      h2('Try it yourself'),
      todo('Write your first thought below', false),
      todo('Invite a friend to your workspace', false),
      todo('Connect your own AI key in Settings', false),
      p(''),
      {
        type: 'toggle',
        html: 'Click the arrow to reveal a hidden note',
        props: { collapsed: false },
      },
      p('Toggles can hide anything nested underneath them — great for meeting notes and long documents.', { color: 'gray' }),
      p(''),
      {
        type: 'quote',
        html: 'The best tools disappear. What remains is your thinking.',
      },
      p(''),
      h2('Pages inside pages'),
      p('Notion-style nesting keeps everything tidy. Open a page below to explore:'),
      { type: 'page', html: '', props: { pageId: guideId } },
      { type: 'page', html: '', props: { pageId: shortcutsId } },
      p(''),
      h2('Databases that adapt'),
      p('Reading list is a real database. Switch between a table and a board, add properties, and edit rows inline.'),
      { type: 'page', html: '', props: { pageId: readingId } },
      p(''),
      h2('Bring your own AI'),
      p('Open the AI panel with the ✨ button in the top right, or type <code>/ai</code>. Noting never proxies through our servers — requests go straight from your machine using the API key you provide.'),
      code(
        `// Configure any OpenAI-compatible endpoint
{
  "provider": "custom",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}`,
        'json'
      ),
      divider(),
      p('<em>Built with care. Your notes belong to you.</em>'),
    ]);

    insertBlocks(guideId, [
      h1('Feature guide'),
      p('A quick tour of what Noting can do.'),
      h2('Blocks'),
      p('Every line is a block. Click into any block and use the toolbar or slash menu.'),
      bullet('Headings, paragraphs and quotes', 0),
      bullet('Bulleted, numbered and to-do lists', 0),
      bullet('Code blocks with copy', 0),
      bullet('Images from a URL or an upload', 0),
      bullet('Toggles for collapsible sections', 0),
      bullet('Callouts for things worth noticing', 0),
      h2('Markdown shortcuts'),
      p('Start a line with these characters and keep typing:'),
      bullet('<code>#</code> Heading 1, <code>##</code> Heading 2, <code>###</code> Heading 3', 0),
      bullet('<code>-</code> or <code>*</code> Bulleted list', 0),
      bullet('<code>1.</code> Numbered list', 0),
      bullet('<code>[]</code> To-do', 0),
      bullet('<code>&gt;</code> Quote', 0),
      bullet('<code>```</code> Code block', 0),
      h2('Databases'),
      p('Create a database from the sidebar <strong>+</strong> menu. Add properties, switch views, and open rows to edit them in a side panel.'),
      h2('Your data'),
      p('Everything lives in a single SQLite file under <code>data/noting.db</code>. Back it up by copying that file.'),
    ]);

    insertBlocks(shortcutsId, [
      h1('Keyboard shortcuts'),
      p('Work at the speed of thought.'),
      h2('Navigation'),
      bullet('<code>⌘ K</code> — Search pages and commands', 0),
      bullet('<code>⌘ \\</code> — Toggle sidebar', 0),
      bullet('<code>⌘ ⇧ N</code> — New page', 0),
      bullet('<code>⌘ ⇧ L</code> — Toggle dark mode', 0),
      h2('Writing'),
      bullet('<code>/</code> — Open the slash menu', 0),
      bullet('<code>⌘ B</code> / <code>⌘ I</code> / <code>⌘ U</code> — Bold, italic, underline', 0),
      bullet('<code>Tab</code> / <code>⇧ Tab</code> — Indent / outdent', 0),
      bullet('<code>⌘ ⇧ M</code> — Turn block into something else', 0),
      bullet('<code>⌘ D</code> — Duplicate the current block', 0),
      bullet('<code>Enter</code> — New block; <code>Shift + Enter</code> — Line break', 0),
      h2('Pages'),
      bullet('<code>⌘ ⇧ P</code> — Favorite / unfavorite the page', 0),
      bullet('<code>⌘ ⇧ E</code> — Export as Markdown', 0),
      bullet('<code>⌘ ⇧ ⌫</code> — Move page to trash', 0),
    ]);

    insertBlocks(notesId, [
      callout('A blank page. Start typing, or press <code>/</code> to add a block.', '📝', 'gray'),
      p(''),
    ]);

    // --- Databases -------------------------------------------------------
    const dbProps = [
      ['Status', 'select', ['Not started', 'Reading', 'Finished']],
      ['Author', 'text', []],
      ['Genre', 'select', ['Non-fiction', 'Fiction', 'Design', 'Engineering']],
      ['Rating', 'number', []],
      ['Finished', 'checkbox', []],
    ];
    const propIds = {};
    const propStmt = db.prepare(
      `INSERT INTO db_props (id, page_id, name, type, options, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    );
    dbProps.forEach(([name, type, options], index) => {
      propIds[name] = uid();
      propStmt.run(
        propIds[name],
        readingId,
        name,
        type,
        JSON.stringify(options.map((value, i) => ({ id: uid(), name: value, color: ['blue', 'green', 'orange', 'pink', 'purple'][i % 5] }))),
        index
      );
    });

    const rowStmt = db.prepare(
      `INSERT INTO db_rows (id, page_id, title, props, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const rows = [
      ['The Design of Everyday Things', 'Finished', 'Don Norman', 'Design', 5, true],
      ['Thinking, Fast and Slow', 'Reading', 'Daniel Kahneman', 'Non-fiction', 4, false],
      ['The Pragmatic Programmer', 'Finished', 'Hunt & Thomas', 'Engineering', 5, true],
      ['Shape Up', 'Not started', 'Ryan Singer', 'Design', 4, false],
      ['Tomorrow, and Tomorrow, and Tomorrow', 'Reading', 'Gabrielle Zevin', 'Fiction', 4, false],
    ];
    rows.forEach(([title, status, author, genre, rating, finished], index) => {
      rowStmt.run(
        uid(),
        readingId,
        title,
        JSON.stringify({
          [propIds.Status]: status,
          [propIds.Author]: author,
          [propIds.Genre]: genre,
          [propIds.Rating]: rating,
          [propIds.Finished]: finished,
        }),
        index,
        t,
        t
      );
    });

    const roadmapProps = [
      ['Status', 'select', ['Backlog', 'In progress', 'Done']],
      ['Owner', 'text', []],
      ['Priority', 'select', ['Low', 'Medium', 'High']],
      ['Due', 'date', []],
    ];
    roadmapProps.forEach(([name, type, options], index) => {
      propIds[name] = uid();
      propStmt.run(
        propIds[name],
        roadmapId,
        name,
        type,
        JSON.stringify(options.map((value, i) => ({ id: uid(), name: value, color: ['gray', 'blue', 'green', 'orange'][i % 4] }))),
        index
      );
    });

    const roadmapRows = [
      ['Block editor', 'Done', 'You', 'High', '2026-10-01'],
      ['Database views', 'Done', 'You', 'High', '2026-10-12'],
      ['AI panel', 'In progress', 'You', 'High', '2026-11-01'],
      ['Offline mode', 'Backlog', 'You', 'Medium', ''],
      ['Mobile layout', 'Backlog', 'You', 'Low', ''],
    ];
    roadmapRows.forEach(([title, status, owner, priority, due], index) => {
      rowStmt.run(
        uid(),
        roadmapId,
        title,
        JSON.stringify({
          [propIds.Status]: status,
          [propIds.Owner]: owner,
          [propIds.Priority]: priority,
          [propIds.Due]: due,
        }),
        index,
        t,
        t
      );
    });
  })();

  return true;
}

export const isSeeded = () => db.prepare('SELECT COUNT(*) AS n FROM pages').get().n > 0;

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain && process.argv.includes('--force')) {
  db.transaction(() => {
    db.exec('DELETE FROM blocks; DELETE FROM db_rows; DELETE FROM db_props; DELETE FROM pages; DELETE FROM meta;');
    seedDatabase();
  })();
  console.log('Seed data recreated.');
} else if (isMain) {
  const created = seedDatabase();
  console.log(created ? 'Seed data created.' : 'Database already has pages; skipping seed.');
}

if (getMeta('workspace_name') == null) setMeta('workspace_name', 'My Workspace');
