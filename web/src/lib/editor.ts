import type { Block, BlockType } from '../types';
import { escapeHtml } from './utils';

export const EDITABLE_TYPES: BlockType[] = [
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
];

export const LIST_TYPES: BlockType[] = ['bulleted', 'numbered', 'todo'];

export const CODE_LANGUAGES = [
  'plain text',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'bash',
  'shell',
  'sql',
  'css',
  'html',
  'markdown',
  'yaml',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'php',
  'ruby',
  'swift',
  'kotlin',
];

export function isEditableBlock(block: Block) {
  return EDITABLE_TYPES.includes(block.type);
}

export function isEmptyHtml(html: string) {
  if (!html) return true;
  const cleaned = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return cleaned.length === 0;
}

export function setCaret(el: HTMLElement, position: 'start' | 'end' = 'end') {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(position === 'start');
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function isCaretAtStart(el: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return false;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length === 0;
}

export function isCaretAtEnd(el: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.endContainer)) return false;
  const post = range.cloneRange();
  post.selectNodeContents(el);
  post.setStart(range.endContainer, range.endOffset);
  return post.toString().length === 0;
}

export function normalizeFragmentHtml(html: string) {
  let out = html;
  if (!/<(img|br|a|b|strong|i|em|u|s|strike|del|code|mark)/i.test(out)) {
    out = out.replace(/<[^>]*>/g, '');
  }
  out = out.replace(/^(<br\s*\/?>)+/i, '');
  out = out.replace(/(<br\s*\/?>)+$/i, '');
  if (out === '<br>' || out === '<div><br></div>') return '';
  return out;
}

export function splitHtmlAtCaret(el: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return { before: el.innerHTML, after: '' };
  const range = selection.getRangeAt(0);
  if (!range.collapsed) range.deleteContents();

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(el);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = document.createRange();
  afterRange.selectNodeContents(el);
  afterRange.setStart(range.endContainer, range.endOffset);

  const beforeWrapper = document.createElement('div');
  beforeWrapper.appendChild(beforeRange.cloneContents());
  const afterWrapper = document.createElement('div');
  afterWrapper.appendChild(afterRange.cloneContents());

  return {
    before: normalizeFragmentHtml(beforeWrapper.innerHTML),
    after: normalizeFragmentHtml(afterWrapper.innerHTML),
  };
}

export function codeTextFromHtml(html: string) {
  const div = document.createElement('div');
  div.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n');
  return (div.textContent || '').replace(/\u00a0/g, ' ');
}

export function codeHtmlFromText(text: string) {
  return escapeHtml(text).replaceAll('\n', '<br>');
}

export function sanitizePastedHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, meta, link, iframe, object, embed, img').forEach((node) => node.remove());
  doc.querySelectorAll('p, div, section, article, header, footer, li').forEach((node) => {
    node.replaceWith(...Array.from(node.childNodes), document.createElement('br'));
  });
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'A', 'BR', 'MARK', 'SPAN']);
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!allowed.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (child.tagName === 'A' && attr.name === 'href') {
          if (!/^(https?:|mailto:)/i.test(attr.value)) child.removeAttribute(attr.name);
          else {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        } else {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML.replace(/(<br\s*\/?>){3,}/gi, '<br><br>');
}

export function wordCount(blocks: Block[]) {
  const text = blocks
    .map((block) => {
      const div = document.createElement('div');
      div.innerHTML = block.html || '';
      return div.textContent || '';
    })
    .join(' ')
    .trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = text.replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return cjk + latin;
}

export const TURN_TYPES: { type: BlockType; label: string; icon: string }[] = [
  { type: 'paragraph', label: 'Text', icon: 'T' },
  { type: 'h1', label: 'Heading 1', icon: 'H1' },
  { type: 'h2', label: 'Heading 2', icon: 'H2' },
  { type: 'h3', label: 'Heading 3', icon: 'H3' },
  { type: 'bulleted', label: 'Bulleted list', icon: '•' },
  { type: 'numbered', label: 'Numbered list', icon: '1.' },
  { type: 'todo', label: 'To-do list', icon: '☑' },
  { type: 'toggle', label: 'Toggle', icon: '▸' },
  { type: 'quote', label: 'Quote', icon: '❝' },
  { type: 'callout', label: 'Callout', icon: '💡' },
  { type: 'code', label: 'Code', icon: '</>' },
];
