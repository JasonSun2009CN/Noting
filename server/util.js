import sanitizeHtml from 'sanitize-html';

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

const ALLOWED_BLOCK_TYPES = new Set([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bulleted',
  'numbered',
  'todo',
  'toggle',
  'quote',
  'callout',
  'code',
  'divider',
  'image',
  'page',
  'database',
]);

const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'a', 'br', 'mark'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        href: attribs.href || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
  },
  disallowedTagsMode: 'discard',
};

export function cleanHtml(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html.slice(0, 200_000), SANITIZE_OPTIONS);
}

export function safeJson(value, fallback) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeBlocks(input) {
  if (!Array.isArray(input)) return [];
  const blocks = [];
  for (const raw of input.slice(0, 5000)) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') continue;
    const type = ALLOWED_BLOCK_TYPES.has(raw.type) ? raw.type : 'paragraph';
    const props = raw.props && typeof raw.props === 'object' ? raw.props : {};
    blocks.push({
      id: String(raw.id).slice(0, 64),
      type,
      html: type === 'divider' || type === 'image' || type === 'page' ? '' : cleanHtml(raw.html || ''),
      props: sanitizeProps(type, props),
      indent: Math.max(0, Math.min(8, Number(raw.indent) || 0)),
    });
  }
  return blocks;
}

function sanitizeProps(type, props) {
  const out = {};
  const str = (value, max = 2000) =>
    typeof value === 'string' ? value.slice(0, max) : undefined;

  if (type === 'todo') out.checked = !!props.checked;
  if (type === 'toggle') out.collapsed = !!props.collapsed;
  if (type === 'code') out.language = str(props.language, 40) || 'plain text';
  if (type === 'callout') {
    out.emoji = str(props.emoji, 16) || '💡';
    out.color = str(props.color, 24) || 'gray';
  }
  if (type === 'image') {
    out.src = str(props.src, 4000) || '';
    out.caption = str(props.caption, 500) || '';
  }
  if (type === 'page') out.pageId = str(props.pageId, 64) || '';
  if (type === 'paragraph' || type === 'quote' || type === 'callout') {
    const color = str(props.color, 24);
    if (color) out.color = color;
  }
  if (type === 'numbered' || type === 'bulleted') {
    const color = str(props.color, 24);
    if (color) out.color = color;
  }
  return out;
}

export function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function htmlToText(html = '') {
  return sanitizeHtml(String(html), { allowedTags: [], allowedAttributes: {} })
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

/** Minimal HTML → Markdown for inline content. */
export function htmlToMarkdown(html = '') {
  let out = String(html);
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<(strong|b)>(.*?)<\/\1>/gis, '**$2**');
  out = out.replace(/<(em|i)>(.*?)<\/\1>/gis, '*$2*');
  out = out.replace(/<(s|strike|del)>(.*?)<\/\1>/gis, '~~$2~~');
  out = out.replace(/<code>(.*?)<\/code>/gis, '`$1`');
  out = out.replace(/<mark>(.*?)<\/mark>/gis, '==$1==');
  out = out.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)');
  out = out.replace(/<[^>]+>/g, '');
  out = out
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
  return out;
}

export function blocksToMarkdown(page, blocks, database) {
  const lines = [];
  if (page.icon && !page.icon.startsWith('http')) lines.push(`# ${page.icon} ${page.title || 'Untitled'}`);
  else lines.push(`# ${page.title || 'Untitled'}`);
  lines.push('');

  if (page.type === 'database' && database) {
    if (database.props.length) {
      lines.push(`| Title | ${database.props.map((p) => p.name).join(' | ')} |`);
      lines.push(`| --- | ${database.props.map(() => '---').join(' | ')} |`);
      for (const row of database.rows) {
        const cells = database.props.map((prop) => formatDbValue(prop, row.props?.[prop.id]));
        lines.push(`| ${row.title || 'Untitled'} | ${cells.join(' | ')} |`);
      }
    } else {
      for (const row of database.rows) lines.push(`- ${row.title || 'Untitled'}`);
    }
    return lines.join('\n') + '\n';
  }

  for (const block of blocks) {
    const text = htmlToMarkdown(block.html);
    const indent = '  '.repeat(block.indent || 0);
    switch (block.type) {
      case 'h1':
        lines.push(`# ${text}`);
        break;
      case 'h2':
        lines.push(`## ${text}`);
        break;
      case 'h3':
        lines.push(`### ${text}`);
        break;
      case 'bulleted':
        lines.push(`${indent}- ${text}`);
        break;
      case 'numbered':
        lines.push(`${indent}1. ${text}`);
        break;
      case 'todo':
        lines.push(`${indent}- [${block.props?.checked ? 'x' : ' '}] ${text}`);
        break;
      case 'toggle':
        lines.push(`${indent}▸ ${text}`);
        break;
      case 'quote':
        lines.push(`> ${text}`);
        break;
      case 'callout':
        lines.push(`> ${block.props?.emoji || '💡'} ${text}`);
        break;
      case 'code':
        lines.push('```' + (block.props?.language && block.props.language !== 'plain text' ? block.props.language : ''));
        lines.push(htmlToText(block.html));
        lines.push('```');
        break;
      case 'divider':
        lines.push('---');
        break;
      case 'image':
        lines.push(`![${block.props?.caption || ''}](${block.props?.src || ''})`);
        break;
      case 'page':
        lines.push(`- 📄 ${text || 'Subpage'}`);
        break;
      default:
        lines.push(text);
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function formatDbValue(prop, value) {
  if (value == null || value === '') return '';
  if (prop.type === 'checkbox') return value ? 'Yes' : 'No';
  if (prop.type === 'multi_select') return Array.isArray(value) ? value.join(', ') : String(value);
  if (prop.type === 'date') return String(value).slice(0, 10);
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
