import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blocksToMarkdown,
  cleanHtml,
  escapeHtml,
  htmlToMarkdown,
  htmlToText,
  sanitizeBlocks,
  uid,
} from './util.js';

test('uid returns 20 url-safe characters', () => {
  const id = uid();
  assert.match(id, /^[a-z0-9]{20}$/);
  assert.notEqual(id, uid());
});

test('cleanHtml strips scripts, event handlers, and unsafe urls', () => {
  const dirty = `
    <p onclick="alert(1)">Hello <strong>world</strong></p>
    <script>alert(1)</script>
    <img src=x onerror="alert(1)">
    <a href="javascript:alert(1)">bad</a>
    <a href="https://example.com">good</a>
  `;
  const clean = cleanHtml(dirty);
  assert.ok(!clean.includes('script'));
  assert.ok(!clean.includes('onerror'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(clean.includes('<strong>world</strong>'));
  assert.ok(clean.includes('https://example.com'));
  assert.ok(clean.includes('rel="noopener noreferrer"'));
});

test('cleanHtml tolerates non-strings and caps length', () => {
  assert.equal(cleanHtml(null), '');
  assert.equal(cleanHtml(42), '');
  assert.ok(cleanHtml('a'.repeat(300_000)).length <= 200_000);
});

test('sanitizeBlocks normalizes types, indentation, and props', () => {
  const blocks = sanitizeBlocks([
    { id: 'a', type: 'h2', html: '<b>Title</b>', indent: 99 },
    { id: 'b', type: 'evil', html: 'text', indent: -4 },
    { id: 'c', type: 'todo', html: '', props: { checked: 1, extra: 'nope' } },
    { id: 'd', type: 'image', html: '<b>x</b>', props: { src: 'https://x.test/a.png', caption: 'Hi' } },
    { id: 'e', type: 'divider', html: '<b>x</b>' },
    { id: 'f', type: 'callout', html: 'note', props: { emoji: '💡', color: 'blue' } },
    { type: 'paragraph', html: 'no id' },
    null,
    'nope',
  ]);

  assert.equal(blocks.length, 6);
  const [heading, fallback, todo, image, divider, callout] = blocks;
  assert.equal(heading.type, 'h2');
  assert.equal(heading.indent, 8);
  assert.equal(fallback.type, 'paragraph');
  assert.equal(fallback.indent, 0);
  assert.equal(todo.props.checked, true);
  assert.equal(todo.props.extra, undefined);
  assert.equal(image.html, '');
  assert.equal(image.props.caption, 'Hi');
  assert.equal(divider.html, '');
  assert.deepEqual(divider.props, {});
  assert.equal(callout.props.color, 'blue');
});

test('escapeHtml and htmlToText round-trip common entities', () => {
  assert.equal(escapeHtml('a < b & "c"'), 'a &lt; b &amp; &quot;c&quot;');
  assert.equal(htmlToText('<b>Hello</b> &amp; <i>bye</i>'), 'Hello & bye');
  assert.equal(htmlToText('<script>alert(1)</script>safe'), 'safe');
});

test('htmlToMarkdown converts inline formatting', () => {
  assert.equal(htmlToMarkdown('<b>bold</b> and <i>it</i>'), '**bold** and *it*');
  assert.equal(htmlToMarkdown('<s>gone</s>'), '~~gone~~');
  assert.equal(htmlToMarkdown('<code>x</code>'), '`x`');
  assert.equal(htmlToMarkdown('<a href="https://a.test">link</a>'), '[link](https://a.test)');
});

test('blocksToMarkdown renders pages, lists, code, and databases', () => {
  const markdown = blocksToMarkdown(
    { title: 'Doc', icon: '📄', type: 'page' },
    [
      { type: 'h1', html: 'Heading', indent: 0 },
      { type: 'bulleted', html: 'one', indent: 1 },
      { type: 'todo', html: 'task', indent: 0, props: { checked: true } },
      { type: 'code', html: 'const x = 1;<br>const y = 2;', indent: 0, props: { language: 'js' } },
      { type: 'image', html: '', indent: 0, props: { src: '/uploads/a.png', caption: 'Shot' } },
    ]
  );
  assert.match(markdown, /^# 📄 Doc/);
  assert.match(markdown, /# Heading/);
  assert.match(markdown, /^ {2}- one$/m);
  assert.match(markdown, /- \[x\] task/);
  assert.match(markdown, /```js\nconst x = 1;\nconst y = 2;\n```/);
  assert.match(markdown, /!\[Shot\]\(\/uploads\/a.png\)/);

  const dbMarkdown = blocksToMarkdown(
    { title: 'Books', type: 'database' },
    [],
    {
      props: [{ id: 's', name: 'Status', type: 'select' }],
      rows: [{ title: 'Dune', props: { s: 'Reading' } }],
    }
  );
  assert.match(dbMarkdown, /\| Title \| Status \|/);
  assert.match(dbMarkdown, /\| Dune \| Reading \|/);
});
