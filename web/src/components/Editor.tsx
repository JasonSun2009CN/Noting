import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  CheckSquare,
  ChevronRight,
  Code2,
  Copy,
  FilePlus2,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  Quote,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { Block, BlockProps, BlockType } from '../types';
import {
  CODE_LANGUAGES,
  EDITABLE_TYPES,
  LIST_TYPES,
  TURN_TYPES,
  codeHtmlFromText,
  codeTextFromHtml,
  isCaretAtEnd,
  isCaretAtStart,
  isEditableBlock,
  isEmptyHtml,
  sanitizePastedHtml,
  setCaret,
  splitHtmlAtCaret,
  wordCount,
} from '../lib/editor';
import { newBlock } from '../lib/markdown';
import {
  CALLOUT_COLORS,
  cn,
  escapeHtml,
  stripHtml,
  uid,
} from '../lib/utils';
import Popover from './Popover';
import SlashMenu, { type SlashItem } from './SlashMenu';
import EmojiPicker from './EmojiPicker';
import PageIcon from './PageIcon';
import Modal from './Modal';
import { MenuItem, MenuSeparator } from './MenuItems';

export interface EditorHandle {
  insertBlocks: (blocks: Block[]) => void;
  getBlocks: () => Block[];
  focusEnd: () => void;
  focusStart: () => void;
}

interface EditorProps {
  pageId: string;
  initialBlocks: Block[];
  onChange: (blocks: Block[]) => void;
}

interface EditableProps {
  block: Block;
  className?: string;
  placeholder: string;
  registerEditable: (id: string, el: HTMLDivElement | null) => void;
  onInput: (el: HTMLDivElement) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function EditableBlock({
  block,
  className,
  placeholder,
  registerEditable,
  onInput,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
}: EditableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== block.html) {
      el.innerHTML = block.html || '';
    }
  }, [block.html, block.id]);

  useEffect(() => {
    registerEditable(block.id, ref.current);
    return () => registerEditable(block.id, null);
  }, [block.id, registerEditable]);

  return (
    <div
      ref={ref}
      className={cn('block-editable', className)}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={(event) => onInput(event.currentTarget)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

type SaveState = 'saved' | 'saving' | 'dirty';

function defaultPropsFor(type: BlockType, previous: BlockProps): BlockProps {
  switch (type) {
    case 'todo':
      return { checked: previous.checked ?? false };
    case 'toggle':
      return { collapsed: previous.collapsed ?? false };
    case 'code':
      return { language: previous.language || 'plain text' };
    case 'callout':
      return { emoji: previous.emoji || '💡', color: previous.color || 'gray' };
    case 'image':
      return previous;
    case 'page':
      return previous;
    case 'divider':
      return {};
    default:
      return previous.color ? { color: previous.color } : {};
  }
}

function listNumber(blocks: Block[], index: number) {
  const indent = blocks[index].indent;
  let count = 1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.indent < indent) break;
    if (block.indent === indent) {
      if (block.type === 'numbered') count += 1;
      else break;
    }
  }
  return count;
}

function groupEnd(blocks: Block[], start: number) {
  const indent = blocks[start].indent;
  let end = start + 1;
  while (end < blocks.length && blocks[end].indent > indent) end += 1;
  return end;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { pageId, initialBlocks, onChange },
  ref
) {
  const {
    pages,
    refreshPages,
    navigatePage,
    openAI,
    toast,
  } = useApp();

  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialBlocks.length ? initialBlocks : [newBlock('paragraph', '', 0)]
  );
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [slash, setSlash] = useState<{
    blockId: string;
    query: string;
    index: number;
    anchor: HTMLElement;
  } | null>(null);
  const [blockMenu, setBlockMenu] = useState<{ blockId: string; anchor: HTMLElement } | null>(null);
  const [emojiMenu, setEmojiMenu] = useState<{ blockId: string; anchor: HTMLElement } | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null
  );
  const [imageDialog, setImageDialog] = useState<{ blockId?: string; afterId?: string } | null>(
    null
  );
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);

  const blocksRef = useRef(blocks);
  const containerRef = useRef<HTMLDivElement>(null);
  const editableRefs = useRef(new Map<string, HTMLDivElement>());
  const saveTimer = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const savedFlash = useRef<number | null>(null);
  const saveVersion = useRef(0);
  const onChangeRef = useRef(onChange);
  const lastSelectedRange = useRef<Range | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onChangeRef.current(blocks);
  }, [blocks]);

  const performSave = useCallback(
    async (snapshot: Block[]) => {
      const version = ++saveVersion.current;
      setSaveState('saving');
      try {
        await api.saveBlocks(pageId, snapshot);
        if (version === saveVersion.current) {
          if (dirtyRef.current) {
            setSaveState('dirty');
          } else {
            setSaveState('saved');
            if (savedFlash.current) window.clearTimeout(savedFlash.current);
            savedFlash.current = window.setTimeout(() => setSaveState('saved'), 1500);
          }
        }
      } catch (error) {
        if (version === saveVersion.current) setSaveState('dirty');
        toast(error instanceof Error ? error.message : 'Could not save your changes.', 'error');
      }
    },
    [pageId, toast]
  );

  const scheduleSave = useCallback(
    (snapshot: Block[]) => {
      dirtyRef.current = true;
      setSaveState('dirty');
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        dirtyRef.current = false;
        performSave(snapshot);
      }, 550);
    },
    [performSave]
  );

  const applyBlocks = useCallback(
    (next: Block[], save = true) => {
      blocksRef.current = next;
      flushSync(() => setBlocks(next));
      if (save) scheduleSave(next);
    },
    [scheduleSave]
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!dirtyRef.current) return;
      fetch(`/api/pages/${pageId}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: blocksRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        api.saveBlocks(pageId, blocksRef.current).catch(() => {});
      }
      if (savedFlash.current) window.clearTimeout(savedFlash.current);
    };
  }, [pageId]);

  const registerEditable = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) editableRefs.current.set(id, el);
    else editableRefs.current.delete(id);
  }, []);

  const focusBlock = useCallback((id: string, position: 'start' | 'end' = 'end') => {
    const attempt = () => {
      const el = editableRefs.current.get(id);
      if (!el) return false;
      setCaret(el, position);
      el.scrollIntoView({ block: 'nearest' });
      return true;
    };
    if (attempt()) return;
    let tries = 0;
    const retry = () => {
      if (attempt()) return;
      if (tries < 6) {
        tries += 1;
        requestAnimationFrame(retry);
      }
    };
    requestAnimationFrame(retry);
  }, []);

  const updateBlock = useCallback(
    (id: string, patch: Partial<Block>, save = true) => {
      const next = blocksRef.current.map((block) => {
        if (block.id !== id) return block;
        return {
          ...block,
          ...patch,
          props: patch.props ? { ...block.props, ...patch.props } : block.props,
        };
      });
      applyBlocks(next, save);
    },
    [applyBlocks]
  );

  const syncBlockFromDom = useCallback(
    (id: string, el: HTMLDivElement) => {
      updateBlock(id, { html: el.innerHTML });
    },
    [updateBlock]
  );

  const closeFloating = useCallback(() => {
    setSlash(null);
    setBlockMenu(null);
    setEmojiMenu(null);
    setToolbar(null);
  }, []);

  const defaultIndent = useCallback((id: string) => {
    return blocksRef.current.find((block) => block.id === id)?.indent || 0;
  }, []);

  const setHtmlDirect = useCallback((id: string, html: string) => {
    const el = editableRefs.current.get(id);
    if (el) el.innerHTML = html;
  }, []);

  const applyType = useCallback(
    (
      blockId: string,
      type: BlockType,
      options?: { clear?: boolean; props?: BlockProps; focus?: boolean }
    ) => {
      const current = blocksRef.current.find((block) => block.id === blockId);
      if (!current) return;
      const index = blocksRef.current.findIndex((block) => block.id === blockId);

      if (type === 'divider') {
        const divider: Block = {
          ...current,
          type: 'divider',
          html: '',
          props: {},
        };
        const paragraph = newBlock('paragraph', '', current.indent);
        const next = [...blocksRef.current];
        next.splice(index, 1, divider, paragraph);
        applyBlocks(next);
        setBlockMenu(null);
        setSlash(null);
        focusBlock(paragraph.id, 'start');
        return;
      }

      let html = options?.clear ? '' : current.html;
      if (type === 'code' && current.type !== 'code') {
        const el = editableRefs.current.get(blockId);
        const text = el ? el.textContent || '' : stripHtml(current.html);
        html = codeHtmlFromText(text);
      }
      if (type === 'paragraph' && current.type === 'code') {
        html = codeTextFromHtml(html).split('\n').map(escapeHtml).join('<br>');
      }

      const props = defaultPropsFor(type, { ...current.props, ...(options?.props || {}) });
      const next = blocksRef.current.map((block) =>
        block.id === blockId ? { ...block, type, html, props } : block
      );

      if (editableRefs.current.has(blockId)) setHtmlDirect(blockId, html);
      applyBlocks(next);
      setBlockMenu(null);
      setSlash(null);
      if (options?.focus !== false && EDITABLE_TYPES.includes(type)) {
        focusBlock(blockId, 'end');
      }
    },
    [applyBlocks, focusBlock, setHtmlDirect]
  );

  const insertBlockAfter = useCallback(
    (blockId: string, block: Block, focus = true) => {
      const index = blocksRef.current.findIndex((item) => item.id === blockId);
      if (index < 0) return;
      const next = [...blocksRef.current];
      next.splice(index + 1, 0, block);
      applyBlocks(next);
      if (focus) focusBlock(block.id, 'start');
    },
    [applyBlocks, focusBlock]
  );

  const addBlockBelow = useCallback(
    (blockId: string) => {
      const indent = defaultIndent(blockId);
      const block = newBlock('paragraph', '', indent);
      insertBlockAfter(blockId, block);
    },
    [defaultIndent, insertBlockAfter]
  );

  const duplicateBlock = useCallback(
    (blockId: string) => {
      const source = blocksRef.current.find((block) => block.id === blockId);
      if (!source) return;
      const copy: Block = {
        ...source,
        id: uid(),
        props: { ...source.props },
      };
      insertBlockAfter(blockId, copy, false);
      setBlockMenu(null);
    },
    [insertBlockAfter]
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      const index = blocksRef.current.findIndex((block) => block.id === blockId);
      if (index < 0) return;
      setBlockMenu(null);
      if (blocksRef.current.length === 1) {
        const fresh = newBlock('paragraph', '', 0);
        applyBlocks([fresh]);
        focusBlock(fresh.id);
        return;
      }
      const next = blocksRef.current.filter((block) => block.id !== blockId);
      applyBlocks(next);
      const previousEditable = [...next]
        .slice(0, index)
        .reverse()
        .find((block) => isEditableBlock(block));
      const nextEditable = next.slice(index).find((block) => isEditableBlock(block));
      const target = previousEditable || nextEditable;
      if (target) focusBlock(target.id, 'end');
    },
    [applyBlocks, focusBlock]
  );

  const moveBlockBy = useCallback(
    (blockId: string, direction: -1 | 1) => {
      const index = blocksRef.current.findIndex((block) => block.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= blocksRef.current.length) return;
      const next = [...blocksRef.current];
      [next[index], next[target]] = [next[target], next[index]];
      applyBlocks(next);
      setBlockMenu(null);
      focusBlock(blockId, 'end');
    },
    [applyBlocks, focusBlock]
  );

  const changeIndent = useCallback(
    (blockId: string, delta: number) => {
      const block = blocksRef.current.find((item) => item.id === blockId);
      if (!block) return;
      const indent = Math.max(0, Math.min(8, block.indent + delta));
      if (indent === block.indent) return;
      updateBlock(blockId, { indent });
      setBlockMenu(null);
      focusBlock(blockId, 'end');
    },
    [focusBlock, updateBlock]
  );

  const moveByDrag = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      const source = [...blocksRef.current];
      const fromIndex = source.findIndex((block) => block.id === draggedId);
      const targetIndex = source.findIndex((block) => block.id === targetId);
      if (fromIndex < 0 || targetIndex < 0) return;
      const fromEnd = groupEnd(source, fromIndex);
      if (targetIndex >= fromIndex && targetIndex < fromEnd) return;

      const group = source.slice(fromIndex, fromEnd);
      const rest = [...source.slice(0, fromIndex), ...source.slice(fromEnd)];
      const restTargetIndex = rest.findIndex((block) => block.id === targetId);
      if (restTargetIndex < 0) return;
      let insertAt = restTargetIndex;
      if (position === 'after') insertAt = groupEnd(rest, restTargetIndex);
      const next = [...rest.slice(0, insertAt), ...group, ...rest.slice(insertAt)];
      applyBlocks(next);
      setDropTarget(null);
      setDragId(null);
    },
    [applyBlocks]
  );

  const splitBlock = useCallback(
    (block: Block, index: number, before: string, after: string) => {
      let newType: BlockType = 'paragraph';
      let newIndent = block.indent;
      let newProps: BlockProps = {};

      if (LIST_TYPES.includes(block.type)) {
        newType = block.type;
        newProps = block.type === 'todo' ? { checked: false } : {};
      } else if (block.type === 'toggle') {
        newType = 'paragraph';
        newIndent = Math.min(8, block.indent + 1);
      }

      const nextBlock = newBlock(newType, after, newIndent, newProps);
      const current = { ...block, html: before, props: { ...block.props } };
      if (block.type === 'toggle' && block.props.collapsed) {
        current.props.collapsed = false;
      }

      const next = [...blocksRef.current];
      next.splice(index, 1, current, nextBlock);
      setHtmlDirect(block.id, before);
      applyBlocks(next);
      setSlash(null);
      focusBlock(nextBlock.id, 'start');
    },
    [applyBlocks, focusBlock, setHtmlDirect]
  );

  const mergeWithPrevious = useCallback(
    (block: Block, index: number) => {
      if (index <= 0) return;
      const previous = blocksRef.current[index - 1];
      if (!isEditableBlock(previous)) {
        deleteBlock(block.id);
        return;
      }
      if (previous.type === 'page' || previous.type === 'image' || previous.type === 'divider') {
        return;
      }
      const mergedHtml = `${previous.html}${block.html}`;
      const next = blocksRef.current
        .map((item) =>
          item.id === previous.id
            ? { ...item, html: mergedHtml, props: { ...item.props, collapsed: false } }
            : item
        )
        .filter((item) => item.id !== block.id);
      const previousEl = editableRefs.current.get(previous.id);
      if (previousEl) previousEl.innerHTML = mergedHtml;
      applyBlocks(next);
      focusBlock(previous.id, 'end');
    },
    [applyBlocks, deleteBlock, focusBlock]
  );

  const mergeWithNext = useCallback(
    (block: Block, index: number) => {
      const nextBlock = blocksRef.current[index + 1];
      if (!nextBlock || !isEditableBlock(nextBlock)) return;
      if (nextBlock.type === 'code' || block.type === 'code') return;
      const mergedHtml = `${block.html}${nextBlock.html}`;
      const next = blocksRef.current
        .map((item) => (item.id === block.id ? { ...item, html: mergedHtml } : item))
        .filter((item) => item.id !== nextBlock.id);
      setHtmlDirect(block.id, mergedHtml);
      applyBlocks(next);
      focusBlock(block.id, 'end');
    },
    [applyBlocks, focusBlock, setHtmlDirect]
  );

  const clearSlashText = useCallback(
    (blockId: string) => {
      setHtmlDirect(blockId, '');
      updateBlock(blockId, { html: '' });
    },
    [setHtmlDirect, updateBlock]
  );

  const createInlinePage = useCallback(
    async (block: Block, index: number) => {
      clearSlashText(block.id);
      setSlash(null);
      try {
        const payload = await api.createPage({ parentId: pageId });
        await refreshPages();
        const pageBlock: Block = {
          ...block,
          type: 'page',
          html: '',
          props: { pageId: payload.page.id },
        };
        const paragraph = newBlock('paragraph', '', block.indent);
        const next = [...blocksRef.current];
        next.splice(index, 1, pageBlock, paragraph);
        applyBlocks(next);
        focusBlock(paragraph.id, 'start');
        toast('Subpage created');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not create the subpage.', 'error');
      }
    },
    [applyBlocks, clearSlashText, focusBlock, pageId, refreshPages, toast]
  );

  const insertImage = useCallback(
    (afterId: string, src: string) => {
      const index = blocksRef.current.findIndex((block) => block.id === afterId);
      if (index < 0) return;
      const source = blocksRef.current[index];
      const image: Block = newBlock('image', '', source.indent, { src, caption: '' });
      const paragraph = newBlock('paragraph', '', source.indent);
      const next = [...blocksRef.current];
      if (isEmptyHtml(source.html) && source.type === 'paragraph') {
        next.splice(index, 1, image, paragraph);
      } else {
        next.splice(index + 1, 0, image, paragraph);
      }
      applyBlocks(next);
      focusBlock(paragraph.id, 'start');
    },
    [applyBlocks, focusBlock]
  );

  const uploadImage = useCallback(
    async (file: File, afterId?: string, blockId?: string) => {
      setImageBusy(true);
      setImageError('');
      try {
        const { url } = await api.upload(file);
        if (blockId) {
          updateBlock(blockId, {
            props: { ...blocksRef.current.find((b) => b.id === blockId)?.props, src: url },
          });
          setImageDialog(null);
          setImageUrl('');
        } else if (afterId) {
          insertImage(afterId, url);
          setImageDialog(null);
          setImageUrl('');
        }
      } catch (error) {
        setImageError(error instanceof Error ? error.message : 'Upload failed.');
      } finally {
        setImageBusy(false);
      }
    },
    [insertImage, updateBlock]
  );

  const submitImageUrl = useCallback(() => {
    const url = imageUrl.trim();
    if (!/^(https?:\/\/|\/uploads\/).+/i.test(url)) {
      setImageError('Enter a valid image URL or upload a file.');
      return;
    }
    if (!imageDialog) return;
    if (imageDialog.blockId) {
      updateBlock(imageDialog.blockId, {
        props: { ...blocksRef.current.find((b) => b.id === imageDialog.blockId)?.props, src: url },
      });
    } else if (imageDialog.afterId) {
      insertImage(imageDialog.afterId, url);
    }
    setImageDialog(null);
    setImageUrl('');
    setImageError('');
  }, [imageDialog, imageUrl, insertImage, updateBlock]);

  const openImageDialog = useCallback(
    (options: { blockId?: string; afterId?: string }) => {
      setImageUrl('');
      setImageError('');
      setImageDialog(options);
      setSlash(null);
    },
    []
  );

  const runAISlash = useCallback(
    (block: Block, prompt: string, autoSend: boolean) => {
      clearSlashText(block.id);
      setSlash(null);
      openAI({ prompt, autoSend });
    },
    [clearSlashText, openAI]
  );

  const copyCode = useCallback(
    async (html: string) => {
      try {
        await navigator.clipboard.writeText(codeTextFromHtml(html));
        toast('Copied to clipboard');
      } catch {
        toast('Could not copy code.', 'error');
      }
    },
    [toast]
  );

  const handlePaste = useCallback(
    (block: Block, event: ClipboardEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      const imageFiles = Array.from(event.clipboardData.files || []).filter((file) =>
        file.type.startsWith('image/')
      );
      if (imageFiles.length) {
        event.preventDefault();
        uploadImage(imageFiles[0], block.id);
        return;
      }
      const html = event.clipboardData.getData('text/html');
      const text = event.clipboardData.getData('text/plain');
      if (html) {
        event.preventDefault();
        const clean = sanitizePastedHtml(html);
        document.execCommand('insertHTML', false, clean);
        syncBlockFromDom(block.id, el);
        return;
      }
      if (text.includes('\n')) {
        event.preventDefault();
        const lines = text.split(/\r?\n/);
        const first = lines.shift() || '';
        if (first) document.execCommand('insertText', false, first);
        syncBlockFromDom(block.id, el);
        const index = blocksRef.current.findIndex((item) => item.id === block.id);
        if (index >= 0 && lines.length) {
          const inserted = lines.map((line) =>
            newBlock('paragraph', line ? escapeHtml(line) : '', block.indent)
          );
          const next = [...blocksRef.current];
          next.splice(index + 1, 0, ...inserted);
          applyBlocks(next);
        }
      }
    },
    [applyBlocks, syncBlockFromDom, uploadImage]
  );

  const handleMarkdownShortcut = useCallback(
    (block: Block, el: HTMLDivElement) => {
      if (block.type !== 'paragraph' || slash) return;
      const text = el.textContent || '';
      const shortcuts: Record<string, BlockType> = {
        '# ': 'h1',
        '## ': 'h2',
        '### ': 'h3',
        '- ': 'bulleted',
        '* ': 'bulleted',
        '+ ': 'bulleted',
        '1. ': 'numbered',
        '[] ': 'todo',
        '[ ] ': 'todo',
        '> ': 'quote',
      };
      if (text === '```') {
        el.innerHTML = '';
        applyType(block.id, 'code', { clear: true });
        return;
      }
      const type = shortcuts[text];
      if (!type) return;
      el.innerHTML = '';
      applyType(block.id, type, { clear: true });
    },
    [applyType, slash]
  );

  const handleInput = useCallback(
    (block: Block, el: HTMLDivElement) => {
      const html = el.innerHTML;
      updateBlock(block.id, { html });
      const text = el.textContent || '';

      if (text === '/' && !slash) {
        setSlash({ blockId: block.id, query: '', index: 0, anchor: el });
        return;
      }
      if (slash?.blockId === block.id) {
        if (text.startsWith('/')) {
          setSlash((current) =>
            current ? { ...current, query: text.slice(1), index: 0, anchor: el } : current
          );
        } else {
          setSlash(null);
        }
        return;
      }
      handleMarkdownShortcut(block, el);
    },
    [handleMarkdownShortcut, slash, updateBlock]
  );

  const slashItems: SlashItem[] = [
    {
      id: 'text',
      label: 'Text',
      description: 'Just start writing with plain text.',
      icon: <FileText size={18} />,
      group: 'Basic blocks',
      keywords: ['paragraph', 'plain'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'paragraph', { clear: true }); } },
    },
    {
      id: 'h1',
      label: 'Heading 1',
      description: 'Big section heading.',
      icon: <Heading1 size={18} />,
      group: 'Basic blocks',
      keywords: ['title', 'h1'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'h1', { clear: true }); } },
    },
    {
      id: 'h2',
      label: 'Heading 2',
      description: 'Medium section heading.',
      icon: <Heading2 size={18} />,
      group: 'Basic blocks',
      keywords: ['h2'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'h2', { clear: true }); } },
    },
    {
      id: 'h3',
      label: 'Heading 3',
      description: 'Small section heading.',
      icon: <Heading3 size={18} />,
      group: 'Basic blocks',
      keywords: ['h3'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'h3', { clear: true }); } },
    },
    {
      id: 'bulleted',
      label: 'Bulleted list',
      description: 'Create a simple bulleted list.',
      icon: <List size={18} />,
      group: 'Basic blocks',
      keywords: ['bullet', 'unordered', 'list'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'bulleted', { clear: true }); } },
    },
    {
      id: 'numbered',
      label: 'Numbered list',
      description: 'Create a list with numbering.',
      icon: <ListOrdered size={18} />,
      group: 'Basic blocks',
      keywords: ['ordered', 'list'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'numbered', { clear: true }); } },
    },
    {
      id: 'todo',
      label: 'To-do list',
      description: 'Track tasks with a checkbox.',
      icon: <CheckSquare size={18} />,
      group: 'Basic blocks',
      keywords: ['task', 'checkbox'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'todo', { clear: true }); } },
    },
    {
      id: 'toggle',
      label: 'Toggle list',
      description: 'Hide and show nested content.',
      icon: <ChevronRight size={18} />,
      group: 'Basic blocks',
      keywords: ['collapse', 'accordion'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'toggle', { clear: true }); } },
    },
    {
      id: 'quote',
      label: 'Quote',
      description: 'Capture a quote.',
      icon: <Quote size={18} />,
      group: 'Basic blocks',
      keywords: ['blockquote'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'quote', { clear: true }); } },
    },
    {
      id: 'callout',
      label: 'Callout',
      description: 'Make writing stand out.',
      icon: <span className="slash-emoji">💡</span>,
      group: 'Basic blocks',
      keywords: ['note', 'tip'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'callout', { clear: true }); } },
    },
    {
      id: 'divider',
      label: 'Divider',
      description: 'Visually divide blocks.',
      icon: <Minus size={18} />,
      group: 'Basic blocks',
      keywords: ['line', 'hr'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) applyType(b.id, 'divider', { clear: true }); },
    },
    {
      id: 'image',
      label: 'Image',
      description: 'Upload or embed an image.',
      icon: <ImageIcon size={18} />,
      group: 'Media',
      keywords: ['picture', 'photo', 'file'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) openImageDialog({ afterId: b.id }); },
    },
    {
      id: 'code',
      label: 'Code',
      description: 'Capture a snippet with syntax.',
      icon: <Code2 size={18} />,
      group: 'Media',
      keywords: ['snippet', 'pre'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) { clearSlashText(b.id); applyType(b.id, 'code', { clear: true }); } },
    },
    {
      id: 'page',
      label: 'Page',
      description: 'Create a subpage inside this page.',
      icon: <FilePlus2 size={18} />,
      group: 'Media',
      keywords: ['subpage', 'child'],
      action: () => {
        if (!slash) return;
        const index = blocksRef.current.findIndex((x) => x.id === slash.blockId);
        const b = blocksRef.current[index];
        if (b) createInlinePage(b, index);
      },
    },
    {
      id: 'ai-continue',
      label: 'Continue writing',
      description: 'Let AI pick up where you left off.',
      icon: <Wand2 size={18} />,
      group: 'AI',
      keywords: ['ai', 'write', 'generate'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) runAISlash(b, 'Continue writing this page in the same voice and structure. Return only the continuation.', true); },
    },
    {
      id: 'ai-summarize',
      label: 'Summarize page',
      description: 'Get the key points of this page.',
      icon: <Sparkles size={18} />,
      group: 'AI',
      keywords: ['ai', 'summary', 'tldr'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) runAISlash(b, 'Summarize this page in a short, skimmable list.', true); },
    },
    {
      id: 'ai-improve',
      label: 'Improve writing',
      description: 'Polish the language on this page.',
      icon: <Sparkles size={18} />,
      group: 'AI',
      keywords: ['ai', 'rewrite', 'grammar'],
      action: () => { const b = slash && blocksRef.current.find((x) => x.id === slash.blockId); if (b) runAISlash(b, 'Improve the writing on this page. Return the improved version only.', true); },
    },
  ];

  const filteredSlash = slash
    ? slashItems.filter((item) => {
        const haystack = `${item.label} ${item.keywords?.join(' ') || ''}`.toLowerCase();
        return haystack.includes(slash.query.trim().toLowerCase());
      })
    : [];

  const selectedSlashItem =
    slash && filteredSlash.length
      ? filteredSlash[Math.min(slash.index, filteredSlash.length - 1)]
      : undefined;

  const handleKeyDown = useCallback(
    (block: Block, index: number, event: ReactKeyboardEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      const mod = event.metaKey || event.ctrlKey;

      if (slash && slash.blockId === block.id) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSlash((current) =>
            current
              ? { ...current, index: filteredSlash.length ? (current.index + 1) % filteredSlash.length : 0 }
              : current
          );
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSlash((current) =>
            current
              ? {
                  ...current,
                  index: filteredSlash.length
                    ? (current.index - 1 + filteredSlash.length) % filteredSlash.length
                    : 0,
                }
              : current
          );
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (selectedSlashItem) selectedSlashItem.action();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setSlash(null);
          return;
        }
        if (event.key === 'Backspace' && el.textContent === '/') {
          setSlash(null);
        }
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setBlockMenu({ blockId: block.id, anchor: el });
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateBlock(block.id);
        return;
      }
      if (mod && event.key === 'Enter' && block.type === 'todo') {
        event.preventDefault();
        updateBlock(block.id, { props: { ...block.props, checked: !block.props.checked } });
        return;
      }
      if (mod && !event.shiftKey && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const command = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline';
        document.execCommand(command);
        syncBlockFromDom(block.id, el);
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        document.execCommand('strikeThrough');
        syncBlockFromDom(block.id, el);
        return;
      }

      if (event.key === 'Enter') {
        if (event.shiftKey) {
          event.preventDefault();
          document.execCommand('insertLineBreak');
          syncBlockFromDom(block.id, el);
          return;
        }
        if (block.type === 'code') {
          event.preventDefault();
          document.execCommand('insertLineBreak');
          syncBlockFromDom(block.id, el);
          return;
        }
        event.preventDefault();

        const empty = isEmptyHtml(el.innerHTML);
        if (empty && (LIST_TYPES.includes(block.type) || block.type === 'toggle' || block.type === 'quote' || block.type === 'callout')) {
          if (block.indent > 0 && LIST_TYPES.includes(block.type)) {
            updateBlock(block.id, { indent: block.indent - 1 });
            return;
          }
          setHtmlDirect(block.id, '');
          applyType(block.id, 'paragraph', { clear: true });
          return;
        }

        const { before, after } = splitHtmlAtCaret(el);
        splitBlock(block, index, before, after);
        return;
      }

      if (event.key === 'Backspace') {
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed) return;
        if (!isCaretAtStart(el)) return;
        if (block.indent > 0) {
          event.preventDefault();
          updateBlock(block.id, { indent: block.indent - 1 });
          return;
        }
        if (block.type !== 'paragraph') {
          event.preventDefault();
          setHtmlDirect(block.id, block.html);
          applyType(block.id, 'paragraph', { clear: false });
          return;
        }
        if (index > 0) {
          const previous = blocksRef.current[index - 1];
          if (isEditableBlock(previous) && previous.type !== 'code') {
            event.preventDefault();
            mergeWithPrevious(block, index);
          } else {
            event.preventDefault();
            deleteBlock(block.id);
          }
        }
        return;
      }

      if (event.key === 'Delete') {
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed) return;
        if (!isCaretAtEnd(el)) return;
        if (index < blocksRef.current.length - 1) {
          const nextBlock = blocksRef.current[index + 1];
          if (isEditableBlock(nextBlock) && nextBlock.type !== 'code' && block.type !== 'code') {
            event.preventDefault();
            mergeWithNext(block, index);
          }
        }
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (block.type === 'code') {
          document.execCommand('insertText', false, '  ');
          syncBlockFromDom(block.id, el);
          return;
        }
        updateBlock(block.id, {
          indent: event.shiftKey ? Math.max(0, block.indent - 1) : Math.min(8, block.indent + 1),
        });
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed) return;
        const atBoundary =
          event.key === 'ArrowUp' ? isCaretAtStart(el) : isCaretAtEnd(el);
        if (!atBoundary) return;
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        let targetIndex = index + direction;
        while (
          targetIndex >= 0 &&
          targetIndex < blocksRef.current.length &&
          !isEditableBlock(blocksRef.current[targetIndex])
        ) {
          targetIndex += direction;
        }
        if (targetIndex >= 0 && targetIndex < blocksRef.current.length) {
          event.preventDefault();
          focusBlock(blocksRef.current[targetIndex].id, direction === -1 ? 'end' : 'start');
        }
        return;
      }

      if (event.key === 'Escape' && block.type === 'code') {
        event.preventDefault();
        const paragraph = newBlock('paragraph', '', block.indent);
        insertBlockAfter(block.id, paragraph);
      }
    },
    [
      applyType,
      deleteBlock,
      duplicateBlock,
      filteredSlash.length,
      focusBlock,
      insertBlockAfter,
      mergeWithNext,
      mergeWithPrevious,
      selectedSlashItem,
      setHtmlDirect,
      slash,
      splitBlock,
      syncBlockFromDom,
      updateBlock,
    ]
  );

  const updateToolbar = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    lastSelectedRange.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setToolbar(null);
      return;
    }
    setToolbar({
      top: Math.max(58, rect.top - 46),
      left: Math.min(Math.max(80, rect.left + rect.width / 2), window.innerWidth - 80),
    });
  }, []);

  useEffect(() => {
    if (!toolbar) return;
    const hide = () => setToolbar(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [toolbar]);

  const syncSelectionBlock = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const row = element?.closest?.('.block-row') as HTMLElement | null;
    if (!row) return;
    const id = row.dataset.blockId;
    if (!id) return;
    const editable = editableRefs.current.get(id);
    if (editable) updateBlock(id, { html: editable.innerHTML });
  }, [updateBlock]);

  const format = useCallback(
    (command: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
      document.execCommand(command);
      syncSelectionBlock();
      updateToolbar();
    },
    [syncSelectionBlock, updateToolbar]
  );

  const wrapCode = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = range.toString();
    if (!text) return;
    const code = document.createElement('code');
    code.textContent = text;
    range.deleteContents();
    range.insertNode(code);
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    syncSelectionBlock();
    updateToolbar();
  }, [syncSelectionBlock, updateToolbar]);

  const addLink = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const saved = selection.getRangeAt(0).cloneRange();
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) {
      toast('Use a valid http(s) or mailto link.', 'error');
      return;
    }
    selection.removeAllRanges();
    selection.addRange(saved);
    document.execCommand('createLink', false, url);
    syncSelectionBlock();
    updateToolbar();
  }, [syncSelectionBlock, toast, updateToolbar]);

  const askAIAboutSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) return;
    setToolbar(null);
    openAI({ prompt: `Improve this passage:\n\n“${text}”\n\nReturn only the improved passage.`, autoSend: false });
  }, [openAI]);

  useImperativeHandle(
    ref,
    () => ({
      insertBlocks(incoming: Block[]) {
        let next = [...blocksRef.current];
        if (
          next.length &&
          next[next.length - 1].type === 'paragraph' &&
          isEmptyHtml(next[next.length - 1].html)
        ) {
          next.pop();
        }
        const prepared = incoming.map((block) => ({
          ...block,
          id: uid(),
          props: { ...block.props },
        }));
        next = [...next, ...prepared, newBlock('paragraph', '', 0)];
        applyBlocks(next);
        requestAnimationFrame(() => {
          containerRef.current?.querySelector('.editor-tail')?.scrollIntoView({ block: 'nearest' });
        });
      },
      getBlocks() {
        return blocksRef.current;
      },
      focusEnd() {
        const last = blocksRef.current[blocksRef.current.length - 1];
        if (last) focusBlock(last.id, 'end');
      },
      focusStart() {
        const first = blocksRef.current.find((block) => isEditableBlock(block));
        if (first) focusBlock(first.id, 'start');
      },
    }),
    [applyBlocks, focusBlock]
  );

  const visibleRows: React.ReactNode[] = [];
  const hiddenAtIndent: number[] = [];

  blocks.forEach((block, index) => {
    while (
      hiddenAtIndent.length &&
      block.indent <= hiddenAtIndent[hiddenAtIndent.length - 1]
    ) {
      hiddenAtIndent.pop();
    }
    if (hiddenAtIndent.length) return;

    if (block.type === 'toggle' && block.props.collapsed) {
      hiddenAtIndent.push(block.indent);
    }

    const editableProps = {
      block,
      registerEditable,
      onInput: (el: HTMLDivElement) => handleInput(block, el),
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => handleKeyDown(block, index, event),
      onPaste: (event: ClipboardEvent<HTMLDivElement>) => handlePaste(block, event),
      onFocus: () => setFocusedId(block.id),
      onBlur: () => setFocusedId(null),
    };

    const menuOpen = blockMenu?.blockId === block.id;
    const dropBefore = dropTarget?.id === block.id && dropTarget.position === 'before';
    const dropAfter = dropTarget?.id === block.id && dropTarget.position === 'after';

    const rowClass = cn(
      'block-row',
      `block-${block.type}`,
      dragId === block.id && 'dragging',
      dropBefore && 'drop-before',
      dropAfter && 'drop-after'
    );

    const controls = (
      <div className="block-controls">
        <button
          type="button"
          className="block-control-btn block-add-btn"
          title="Add block below"
          onClick={() => addBlockBelow(block.id)}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={cn('block-control-btn block-handle', menuOpen && 'active')}
          title="Drag to move · Click for options"
          draggable
          onClick={(event) => {
            if (dragId) return;
            setBlockMenu({ blockId: block.id, anchor: event.currentTarget });
          }}
          onDragStart={(event) => {
            setDragId(block.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', block.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
        >
          <GripVertical size={14} />
        </button>
      </div>
    );

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      if (!dragId) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      if (!dropTarget || dropTarget.id !== block.id || dropTarget.position !== position) {
        setDropTarget({ id: block.id, position });
      }
    };

    const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (!dragId) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      moveByDrag(dragId, block.id, position);
    };

    let content: React.ReactNode = null;

    switch (block.type) {
      case 'divider':
        content = (
          <div className="block-divider-wrap">
            <hr />
          </div>
        );
        break;

      case 'image':
        content = (
          <figure className="block-image">
            {block.props.src ? (
              <img src={block.props.src} alt={block.props.caption || ''} loading="lazy" />
            ) : (
              <button className="image-empty" onClick={() => openImageDialog({ blockId: block.id })}>
                <ImageIcon size={20} /> Add an image
              </button>
            )}
            <div className="image-actions">
              <button onClick={() => openImageDialog({ blockId: block.id })}>Replace</button>
              <button onClick={() => deleteBlock(block.id)}>Remove</button>
            </div>
            <input
              className="image-caption"
              value={block.props.caption || ''}
              placeholder="Add a caption"
              onChange={(event) =>
                updateBlock(block.id, { props: { ...block.props, caption: event.target.value } })
              }
            />
          </figure>
        );
        break;

      case 'page': {
        const linkedPage = pages.find((page) => page.id === block.props.pageId);
        content = linkedPage ? (
          <button
            className="block-page-link"
            onClick={() => navigatePage(linkedPage.id)}
          >
            <PageIcon page={linkedPage} size={20} />
            <span>{linkedPage.title?.trim() || 'Untitled'}</span>
            <ChevronRight size={15} className="page-link-arrow" />
          </button>
        ) : (
          <div className="block-page-missing">
            <FileText size={17} /> Page not found
          </div>
        );
        break;
      }

      case 'code':
        content = (
          <div className="block-code">
            <div className="code-toolbar">
              <select
                value={block.props.language || 'plain text'}
                onChange={(event) =>
                  updateBlock(block.id, {
                    props: { ...block.props, language: event.target.value },
                  })
                }
                aria-label="Code language"
              >
                {CODE_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
              <button className="icon-btn tiny" title="Copy code" onClick={() => copyCode(block.html)}>
                <Copy size={14} />
              </button>
            </div>
            <EditableBlock
              {...editableProps}
              className="code-editable"
              placeholder="Code"
            />
          </div>
        );
        break;

      case 'callout':
        content = (
          <div className={cn('block-callout', `callout-color-${block.props.color || 'gray'}`)}>
            <button
              className="callout-emoji"
              onClick={(event) =>
                setEmojiMenu({ blockId: block.id, anchor: event.currentTarget })
              }
              title="Change icon"
            >
              {block.props.emoji || '💡'}
            </button>
            <EditableBlock {...editableProps} className="callout-text" placeholder="Type something…" />
          </div>
        );
        break;

      case 'quote':
        content = (
          <div className={cn('block-quote', block.props.color && `text-color-${block.props.color}`)}>
            <EditableBlock {...editableProps} placeholder="Quote" />
          </div>
        );
        break;

      case 'todo':
        content = (
          <div className="block-list-row">
            <button
              className={cn('todo-checkbox', block.props.checked && 'checked')}
              aria-checked={!!block.props.checked}
              role="checkbox"
              onClick={() =>
                updateBlock(block.id, {
                  props: { ...block.props, checked: !block.props.checked },
                })
              }
            >
              {block.props.checked && <Check size={12} strokeWidth={3} />}
            </button>
            <EditableBlock
              {...editableProps}
              className={cn(block.props.checked && 'todo-done', block.props.color && `text-color-${block.props.color}`)}
              placeholder="To-do"
            />
          </div>
        );
        break;

      case 'bulleted':
        content = (
          <div className="block-list-row">
            <span className="block-bullet" aria-hidden>•</span>
            <EditableBlock
              {...editableProps}
              className={block.props.color ? `text-color-${block.props.color}` : undefined}
              placeholder="List"
            />
          </div>
        );
        break;

      case 'numbered':
        content = (
          <div className="block-list-row">
            <span className="block-number" aria-hidden>{listNumber(blocks, index)}.</span>
            <EditableBlock
              {...editableProps}
              className={block.props.color ? `text-color-${block.props.color}` : undefined}
              placeholder="List"
            />
          </div>
        );
        break;

      case 'toggle':
        content = (
          <div className="block-toggle">
            <button
              className={cn('toggle-arrow', !block.props.collapsed && 'expanded')}
              onClick={() =>
                updateBlock(block.id, {
                  props: { ...block.props, collapsed: !block.props.collapsed },
                })
              }
              aria-label={block.props.collapsed ? 'Expand' : 'Collapse'}
            >
              <ChevronRight size={15} />
            </button>
            <EditableBlock {...editableProps} placeholder="Toggle" />
          </div>
        );
        break;

      default:
        content = (
          <EditableBlock
            {...editableProps}
            className={cn(
              block.type !== 'paragraph' && `heading-text heading-${block.type}`,
              block.props.color && `text-color-${block.props.color}`
            )}
            placeholder={
              block.type === 'h1'
                ? 'Heading 1'
                : block.type === 'h2'
                  ? 'Heading 2'
                  : block.type === 'h3'
                    ? 'Heading 3'
                    : "Type '/' for commands"
            }
          />
        );
    }

    visibleRows.push(
      <div
        key={block.id}
        className={rowClass}
        data-block-id={block.id}
        style={{ paddingLeft: `${block.indent * 26}px` }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {controls}
        <div className="block-content">{content}</div>
      </div>
    );
  });

  const words = wordCount(blocks);

  return (
    <div className="editor" ref={containerRef} onMouseUp={updateToolbar} onKeyUp={updateToolbar}>
      <div className="editor-blocks">
        {visibleRows}
      </div>
      <button
        className="editor-tail"
        aria-label="Add a block"
        onClick={() => {
          const last = blocksRef.current[blocksRef.current.length - 1];
          if (last && isEditableBlock(last) && isEmptyHtml(last.html)) {
            focusBlock(last.id);
          } else {
            const block = newBlock('paragraph', '', last?.indent || 0);
            applyBlocks([...blocksRef.current, block]);
            focusBlock(block.id);
          }
        }}
      >
        <span />
      </button>

      <div className={cn('save-status', saveState)}>
        {saveState === 'saving' ? (
          <>
            <Loader2 size={12} className="spin" /> Saving…
          </>
        ) : saveState === 'dirty' ? (
          <>Unsaved changes</>
        ) : (
          <>{words} {words === 1 ? 'word' : 'words'} · Saved</>
        )}
      </div>

      <Popover
        open={!!slash}
        anchor={slash?.anchor || null}
        onClose={() => setSlash(null)}
        className="slash-popover"
        minWidth={300}
      >
        <SlashMenu
          items={filteredSlash}
          activeIndex={slash?.index || 0}
          onHover={(index) => setSlash((current) => (current ? { ...current, index } : current))}
          onSelect={(item) => item.action()}
          query={slash?.query || ''}
        />
      </Popover>

      <Popover
        open={!!emojiMenu}
        anchor={emojiMenu?.anchor || null}
        onClose={() => setEmojiMenu(null)}
        className="emoji-popover"
      >
        <EmojiPicker
          onSelect={(emoji) => {
            if (!emojiMenu) return;
            updateBlock(emojiMenu.blockId, {
              props: {
                ...blocksRef.current.find((block) => block.id === emojiMenu.blockId)?.props,
                emoji,
              },
            });
            setEmojiMenu(null);
          }}
        />
      </Popover>

      <Popover
        open={!!blockMenu}
        anchor={blockMenu?.anchor || null}
        onClose={() => setBlockMenu(null)}
        className="block-menu-popover"
        minWidth={280}
      >
        {blockMenu &&
          (() => {
            const block = blocksRef.current.find((item) => item.id === blockMenu.blockId);
            if (!block) return null;
            const index = blocksRef.current.findIndex((item) => item.id === block.id);
            const colorable = ['paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'quote', 'callout'].includes(block.type);
            return (
              <div className="block-menu">
                {block.type !== 'image' && block.type !== 'page' && (
                  <>
                    <div className="block-menu-label">Turn into</div>
                    <div className="turn-grid">
                      {TURN_TYPES.map((item) => (
                        <button
                          key={item.type}
                          className={cn('turn-button', block.type === item.type && 'active')}
                          onClick={() => {
                            applyType(block.id, item.type);
                            setBlockMenu(null);
                          }}
                        >
                          <span className={`turn-glyph turn-${item.type}`}>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                    <MenuSeparator />
                  </>
                )}
                {block.type === 'image' && (
                  <>
                    <MenuItem
                      icon={<ImageIcon size={16} />}
                      label="Replace image"
                      onClick={() => {
                        openImageDialog({ blockId: block.id });
                        setBlockMenu(null);
                      }}
                    />
                    <MenuSeparator />
                  </>
                )}
                {block.type === 'page' && (
                  <>
                    <MenuItem
                      icon={<FileText size={16} />}
                      label="Open page"
                      onClick={() => {
                        const page = pages.find((item) => item.id === block.props.pageId);
                        if (page) navigatePage(page.id);
                        setBlockMenu(null);
                      }}
                    />
                    <MenuSeparator />
                  </>
                )}
                <MenuItem
                  icon={<Copy size={16} />}
                  label="Duplicate"
                  shortcut="⌘D"
                  onClick={() => duplicateBlock(block.id)}
                />
                <MenuItem
                  icon={<Code2 size={16} />}
                  label="Copy text"
                  onClick={() => {
                    navigator.clipboard.writeText(stripHtml(block.html)).catch(() => {});
                    setBlockMenu(null);
                    toast('Copied to clipboard');
                  }}
                />
                <MenuItem
                  icon={<ArrowUp size={16} />}
                  label="Move up"
                  disabled={index === 0}
                  onClick={() => moveBlockBy(block.id, -1)}
                />
                <MenuItem
                  icon={<ArrowDown size={16} />}
                  label="Move down"
                  disabled={index === blocksRef.current.length - 1}
                  onClick={() => moveBlockBy(block.id, 1)}
                />
                <MenuItem
                  icon={<IndentIncrease size={16} />}
                  label="Indent"
                  disabled={block.indent >= 8}
                  onClick={() => changeIndent(block.id, 1)}
                />
                <MenuItem
                  icon={<IndentDecrease size={16} />}
                  label="Outdent"
                  disabled={block.indent === 0}
                  onClick={() => changeIndent(block.id, -1)}
                />
                {colorable && (
                  <>
                    <MenuSeparator />
                    <div className="color-row">
                      <button
                        className="color-dot color-default"
                        title="Default"
                        onClick={() => updateBlock(block.id, { props: { ...block.props, color: '' } })}
                      />
                      {CALLOUT_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`color-dot color-${color}`}
                          title={color}
                          onClick={() =>
                            updateBlock(block.id, { props: { ...block.props, color } })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
                <MenuSeparator />
                <MenuItem
                  icon={<Trash2 size={16} />}
                  label="Delete"
                  danger
                  onClick={() => deleteBlock(block.id)}
                />
              </div>
            );
          })()}
      </Popover>

      {toolbar &&
        createPortal(
          <div
            className="inline-toolbar"
            style={{ top: toolbar.top, left: toolbar.left }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button title="Bold" onClick={() => format('bold')}>
              <Bold size={14} />
            </button>
            <button title="Italic" onClick={() => format('italic')}>
              <Italic size={14} />
            </button>
            <button title="Underline" onClick={() => format('underline')}>
              <Underline size={14} />
            </button>
            <button title="Strikethrough" onClick={() => format('strikeThrough')}>
              <Strikethrough size={14} />
            </button>
            <span className="toolbar-separator" />
            <button title="Inline code" onClick={wrapCode}>
              <Code2 size={14} />
            </button>
            <button title="Link" onClick={addLink}>
              <Link2 size={14} />
            </button>
            <span className="toolbar-separator" />
            <button title="Ask AI about this selection" className="ai-tool" onClick={askAIAboutSelection}>
              <Sparkles size={14} />
            </button>
          </div>,
          document.body
        )}

      <Modal
        open={!!imageDialog}
        onClose={() => {
          setImageDialog(null);
          setImageError('');
          setImageUrl('');
        }}
        width={540}
        className="image-modal"
      >
        <div className="image-modal-content">
          <h2>Add an image</h2>
          <label className={cn('image-upload', imageBusy && 'busy')}>
            {imageBusy ? (
              <>
                <Loader2 size={18} className="spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload size={18} /> Upload an image
              </>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={imageBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadImage(file, imageDialog?.afterId, imageDialog?.blockId);
              }}
            />
          </label>
          <div className="image-or">or paste a URL</div>
          <input
            className="text-input"
            value={imageUrl}
            onChange={(event) => {
              setImageUrl(event.target.value);
              setImageError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitImageUrl();
            }}
            placeholder="https://images.unsplash.com/…"
            autoFocus
          />
          {imageError && <div className="form-error">{imageError}</div>}
          <div className="image-modal-actions">
            <button className="btn ghost" onClick={() => setImageDialog(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={submitImageUrl} disabled={!imageUrl.trim() || imageBusy}>
              Add image
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default Editor;
