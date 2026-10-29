import type { CSSProperties } from 'react';
import type { Block, Database, Page } from '../types';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export function relativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const textParser = () => document.createElement('div');

export function stripHtml(html: string) {
  const el = textParser();
  el.innerHTML = html || '';
  return (el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

export function stripHtmlPreserveLineBreaks(html: string) {
  const el = textParser();
  el.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n');
  return (el.textContent || '').replace(/\u00a0/g, ' ');
}

export function blockPlainText(block: Block) {
  if (block.type === 'divider') return '';
  if (block.type === 'image') return block.props.caption || block.props.src || '';
  return stripHtml(block.html);
}

export function blocksToPlainText(blocks: Block[]) {
  return blocks
    .map((block) => {
      const text = blockPlainText(block);
      if (!text) return '';
      const indent = '  '.repeat(block.indent);
      switch (block.type) {
        case 'h1':
          return `# ${text}`;
        case 'h2':
          return `## ${text}`;
        case 'h3':
          return `### ${text}`;
        case 'bulleted':
          return `${indent}- ${text}`;
        case 'numbered':
          return `${indent}1. ${text}`;
        case 'todo':
          return `${indent}- [${block.props.checked ? 'x' : ' '}] ${text}`;
        case 'quote':
          return `> ${text}`;
        case 'callout':
          return `${block.props.emoji || '💡'} ${text}`;
        case 'code':
          return `\`\`\`${block.props.language || ''}\n${text}\n\`\`\``;
        case 'toggle':
          return `▸ ${text}`;
        default:
          return `${indent}${text}`;
      }
    })
    .filter(Boolean)
    .join('\n');
}

export function pageAncestors(pages: Page[], id: string | null): Page[] {  if (!id) return [];
  const map = new Map(pages.map((page) => [page.id, page]));
  const chain: Page[] = [];
  let current = map.get(id);
  let guard = 0;
  while (current && guard < 50) {
    chain.unshift(current);
    current = current.parentId ? map.get(current.parentId) : undefined;
    guard += 1;
  }
  return chain;
}

export function childrenOf(pages: Page[], parentId: string | null) {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export function descendantPageIds(pages: Page[], id: string) {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const page of pages.filter((item) => item.parentId === parentId)) {
      out.push(page.id);
      walk(page.id);
    }
  };
  walk(id);
  return out;
}

export const COVER_GRADIENTS: Record<string, string> = {
  peach: 'linear-gradient(120deg, #ffcf9f 0%, #ff9a8b 45%, #ff7eb3 100%)',
  mint: 'linear-gradient(120deg, #d9f99d 0%, #a7f3d0 50%, #99f6e4 100%)',
  lavender: 'linear-gradient(120deg, #e0d7ff 0%, #c7b9ff 45%, #a5b4fc 100%)',
  sky: 'linear-gradient(120deg, #bae6fd 0%, #a5c8ff 50%, #c4b5fd 100%)',
  sunset: 'linear-gradient(120deg, #fde68a 0%, #fca5a5 45%, #c084fc 100%)',
  forest: 'linear-gradient(120deg, #bbf7d0 0%, #86efac 40%, #22c55e 100%)',
  sand: 'linear-gradient(120deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
  rose: 'linear-gradient(120deg, #ffe4e6 0%, #fecdd3 45%, #fda4af 100%)',
  ocean: 'linear-gradient(120deg, #cffafe 0%, #7dd3fc 45%, #2563eb 100%)',
  graphite: 'linear-gradient(120deg, #e5e5e5 0%, #a3a3a3 50%, #525252 100%)',
};

export function coverStyle(cover: string): CSSProperties {
  if (cover.startsWith('gradient:')) {
    return { backgroundImage: COVER_GRADIENTS[cover.slice(9)] || COVER_GRADIENTS.sand };
  }
  return {
    backgroundImage: `url(${cover})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center 45%',
  };
}

export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😴', '🤤', '😪', '😵', '🤯', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '💩', '🤡', '👻', '👽', '🤖'],
  },
  {
    label: 'Objects',
    emojis: ['💡', '🔥', '✨', '⭐', '🌟', '💫', '⚡', '☀️', '🌈', '☁️', '🌙', '🌱', '🌿', '🍀', '🌸', '🌻', '🌹', '🍁', '🍂', '🌲', '🌵', '🌴', '🌊', '💧', '❄️', '🎉', '🎊', '🎁', '🎈', '🏆', '🥇', '🎯', '🚀', '✈️', '🗺️', '🧭', '⛰️', '🏔️', '🏕️', '🏠', '🏡', '🏢', '🏫', '📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📝', '✏️', '🖊️', '🖋️', '🖍️', '📏', '📐', '✂️', '📌', '📍', '📎', '🔖', '🔗', '📁', '📂', '🗂️', '📅', '📆', '🗓️', '📊', '📈', '📉', '📋', '📌', '🧠', '💭', '💬', '🗨️', '🗯️', '💼', '🗃️', '🗄️', '🔑', '🔒', '🔓', '🛠️', '🔧', '🔨', '⚙️', '🧰', '💻', '🖥️', '⌨️', '🖱️', '🖨️', '📱', '☎️', '📞', '📟', '📠', '📺', '📷', '📸', '🎥', '🎬', '🎵', '🎧', '🎼', '🎹', '🎸', '🥁', '🎺', '🎻', '🎨', '🖼️', '🧩', '🎮', '🕹️', '🎲', '♟️', '🏀', '⚽', '🎾', '🏓', '🏸', '🥊', '⛳', '🎿', '🛹', '🚲', '🏃', '🧘', '🏋️', '⏰', '⌛', '⏳', '🕰️', '💎', '🪙', '💰', '🧸', '🪴', '🍵', '☕', '🍰', '🍕', '🍎', '🥑', '🍋', '🍉', '🥕', '🌮', '🍜', '🍣', '🍩', '🍪', '🍫', '🍿', '🥂', '🍷', '🥤'],
  },
  {
    label: 'Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✅', '☑️', '✔️', '❌', '❎', '⭕', '❗', '❓', '⚠️', '🚫', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '➕', '➖', '➗', '✖️', '♾️', '💲', '™️', '©️', '®️', '🔔', '🔕', '🎵', '💤', '🔄', '🔁', '▶️', '⏸️', '⏹️', '⏭️', '⏮️', '🔀', '🔃', '🔼', '🔽', '◀️', '▶️', '🆗', '🆕', '🆒', '🆓', '🔝', '🔙', '🔜', '🔚'],
  },
];

export const EMOJI_SUGGESTIONS = ['📄', '📝', '📚', '💡', '✨', '🚀', '🎯', '🌱', '🧠', '🗺️', '📊', '🏠', '💼', '🎨', '🔧', '☕', '🌿', '🔥', '⭐', '🧭'];

export const SELECT_COLORS = ['blue', 'green', 'orange', 'yellow', 'pink', 'purple', 'red', 'gray', 'brown'];

export const CALLOUT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

export const TEXT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

export const AI_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '' },
] as const;

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function shortcutLabel(keys: string) {
  return isMac() ? keys.replaceAll('⌘', '⌘') : keys.replaceAll('⌘', 'Ctrl+');
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function downloadFile(filename: string, content: string, type = 'text/markdown') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export const PAGE_FONTS = [
  { id: 'default', label: 'Default', className: '' },
  { id: 'serif', label: 'Serif', className: 'font-serif' },
  { id: 'mono', label: 'Mono', className: 'font-mono' },
] as const;

export function databaseToPlainText(page: Page, database: Database) {
  const lines = [`Database: ${page.title || 'Untitled'}`];
  lines.push(`Properties: ${database.props.map((prop) => `${prop.name} (${prop.type})`).join(', ') || 'none'}`);
  for (const row of database.rows) {
    const values = database.props
      .map((prop) => {
        const value = row.props?.[prop.id];
        if (value == null || value === '') return null;
        if (prop.type === 'checkbox') return `${prop.name}: ${value ? 'Yes' : 'No'}`;
        if (prop.type === 'multi_select' && Array.isArray(value)) {
          return `${prop.name}: ${value.join(', ')}`;
        }
        return `${prop.name}: ${String(value)}`;
      })
      .filter(Boolean);
    lines.push(`- ${row.title || 'Untitled'}${values.length ? ` — ${values.join('; ')}` : ''}`);
  }
  return lines.join('\n');
}
