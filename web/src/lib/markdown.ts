import type { Block, BlockType } from '../types';
import { escapeHtml, uid } from './utils';

/** Converts a subset of inline markdown to the HTML subset Noting stores. */
export function inlineMarkdownToHtml(input: string) {
  const codes: string[] = [];
  let text = escapeHtml(input || '');
  text = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => codes[Number(index)] || '');
  return text;
}

function makeBlock(type: BlockType, html: string, indent: number, props: Block['props'] = {}): Block {
  return { id: uid(), type, html, props, indent: Math.max(0, Math.min(8, indent)) };
}

/** Turns AI/Markdown output into Notion-style blocks. */
export function markdownToBlocks(markdown: string): Block[] {
  const lines = String(markdown || '').replaceAll('\r\n', '\n').split('\n');
  const blocks: Block[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeLanguage = 'plain text';

  for (const rawLine of lines) {
    const fence = rawLine.match(/^\s*```(.*)$/);
    if (fence) {
      if (inCode) {
        blocks.push(
          makeBlock('code', escapeHtml(codeLines.join('\n')), 0, {
            language: codeLanguage || 'plain text',
          })
        );
        inCode = false;
        codeLines = [];
        codeLanguage = 'plain text';
      } else {
        inCode = true;
        codeLanguage = (fence[1] || '').trim() || 'plain text';
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const indentSpaces = line.match(/^[\t ]*/)?.[0].replaceAll('\t', '  ').length || 0;
    const indent = Math.min(8, Math.floor(indentSpaces / 2));
    const text = line.trim();

    if (/^(---|\*\*\*|___)$/.test(text)) {
      blocks.push(makeBlock('divider', '', indent));
      continue;
    }

    const heading = text.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const type = (heading[1].length === 1 ? 'h1' : heading[1].length === 2 ? 'h2' : 'h3') as BlockType;
      blocks.push(makeBlock(type, inlineMarkdownToHtml(heading[2]), indent));
      continue;
    }

    const todo = text.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      blocks.push(
        makeBlock('todo', inlineMarkdownToHtml(todo[2]), indent, {
          checked: todo[1].toLowerCase() === 'x',
        })
      );
      continue;
    }

    const bullet = text.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push(makeBlock('bulleted', inlineMarkdownToHtml(bullet[1]), indent));
      continue;
    }

    const numbered = text.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      blocks.push(makeBlock('numbered', inlineMarkdownToHtml(numbered[1]), indent));
      continue;
    }

    const quote = text.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(makeBlock('quote', inlineMarkdownToHtml(quote[1]), indent));
      continue;
    }

    const image = text.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
    if (image) {
      blocks.push(makeBlock('image', '', indent, { src: image[2], caption: image[1] }));
      continue;
    }

    blocks.push(makeBlock('paragraph', inlineMarkdownToHtml(text), indent));
  }

  if (inCode && codeLines.length) {
    blocks.push(
      makeBlock('code', escapeHtml(codeLines.join('\n')), 0, {
        language: codeLanguage || 'plain text',
      })
    );
  }

  return blocks.length ? blocks : [makeBlock('paragraph', '', 0)];
}

/** Plain text → blocks, preserving blank lines as empty paragraphs. */
export function textToBlocks(text: string): Block[] {
  const lines = String(text || '').replaceAll('\r\n', '\n').split('\n');
  return lines.map((line) => makeBlock('paragraph', line ? escapeHtml(line) : '', 0));
}

export function newBlock(type: BlockType = 'paragraph', html = '', indent = 0, props: Block['props'] = {}): Block {
  return makeBlock(type, html, indent, props);
}
