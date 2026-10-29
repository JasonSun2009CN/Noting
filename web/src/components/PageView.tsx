import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Menu,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Smile,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import type { Block, Database, Page, PagePayload, PageSettings } from '../types';
import { api } from '../api';
import {
  COVER_GRADIENTS,
  PAGE_FONTS,
  blocksToPlainText,
  cn,
  copyText,
  coverStyle,
  databaseToPlainText,
  pageAncestors,
  relativeTime,
} from '../lib/utils';
import { markdownToBlocks } from '../lib/markdown';
import Editor, { type EditorHandle } from './Editor';
import PageIcon from './PageIcon';
import EmojiPicker from './EmojiPicker';
import Popover from './Popover';
import Modal from './Modal';
import { MenuItem, MenuLabel, MenuSeparator } from './MenuItems';
import DatabaseView from './DatabaseView';
import AIPanel from './AIPanel';

interface PageViewProps {
  pageId: string;
}

export default function PageView({ pageId }: PageViewProps) {
  const {
    pages,
    sidebarOpen,
    setSidebarOpen,
    patchPage,
    updatePageLocal,
    toggleFavorite,
    duplicatePage,
    archivePage,
    toast,
    aiOpen,
    setAIOpen,
    workspaceName,
    resolvedTheme,
  } = useApp();

  const [payload, setPayload] = useState<PagePayload | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [database, setDatabase] = useState<Database | undefined>();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverError, setCoverError] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleTimer = useRef<number | null>(null);
  const titleDirty = useRef(false);
  const titleValue = useRef('');
  const autofocusDone = useRef(false);

  const livePage: Page | undefined = pages.find((page) => page.id === pageId) || payload?.page;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setScrolled(false);
    setPayload(null);
    autofocusDone.current = false;
    api
      .getPage(pageId)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setTitle(data.page.title);
        titleValue.current = data.page.title;
        setBlocks(data.blocks);
        setDatabase(data.database);
        setLoading(false);
        if (!data.page.title && data.page.type === 'page' && !autofocusDone.current) {
          autofocusDone.current = true;
          window.setTimeout(() => titleRef.current?.focus(), 80);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Page not found.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pageId]);

  useEffect(() => {
    return () => {
      if (titleTimer.current) window.clearTimeout(titleTimer.current);
      if (titleDirty.current) {
        api.patchPage(pageId, { title: titleValue.current }).catch(() => {});
      }
    };
  }, [pageId]);

  useEffect(() => {
    if (!livePage) return;
    document.title = `${livePage.title?.trim() || 'Untitled'} · Noting`;
  }, [livePage?.title]);

  useEffect(() => {
    if (!livePage) return;
    if (document.activeElement === titleRef.current) return;
    if (title !== livePage.title) setTitle(livePage.title);
    titleValue.current = livePage.title;
  }, [livePage?.title]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, loading, livePage?.settings.fullWidth, livePage?.settings.font]);

  useEffect(() => {
    if (!payload) return;
    setBlocks(payload.blocks);
  }, [payload]);

  const scheduleTitleSave = (value: string) => {
    titleValue.current = value;
    setTitle(value);
    titleDirty.current = true;
    updatePageLocal(pageId, { title: value });
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      titleDirty.current = false;
      void patchPage(pageId, { title: titleValue.current });
    }, 500);
  };

  const updateSettings = (patch: Partial<PageSettings>) => {
    if (!livePage) return;
    const settings = { ...livePage.settings, ...patch };
    updatePageLocal(pageId, { settings });
    void patchPage(pageId, { settings });
  };

  const copyLink = async () => {
    await copyText(`${window.location.origin}${window.location.pathname}#/page/${pageId}`);
    toast('Link copied to clipboard');
    setMenuAnchor(null);
  };

  const updateCover = async (cover: string | null) => {
    updatePageLocal(pageId, { cover });
    await patchPage(pageId, { cover });
    setCoverOpen(false);
  };

  const uploadCover = async (file: File) => {
    setCoverBusy(true);
    setCoverError('');
    try {
      const { url } = await api.upload(file);
      await updateCover(url);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setCoverBusy(false);
    }
  };

  const applyCoverUrl = async () => {
    const url = coverUrl.trim();
    if (!/^(https?:\/\/|\/uploads\/).+/i.test(url)) {
      setCoverError('Enter a valid image URL.');
      return;
    }
    await updateCover(url);
  };

  const handleInsertFromAI = (text: string) => {
    const incoming = markdownToBlocks(text);
    editorRef.current?.insertBlocks(incoming);
    toast('Inserted into the page', 'success');
  };

  if (loading) {
    return (
      <div className="page-view">
        <TopbarPlaceholder />
        <div className="page-skeleton">
          <div className="skeleton-line short" />
          <div className="skeleton-title" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line medium" />
        </div>
      </div>
    );
  }

  if (error || !livePage) {
    return (
      <div className="page-view">
        <div className="page-topbar scrolled">
          <div className="topbar-left">
            <button
              className="icon-btn"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
            </button>
          </div>
        </div>
        <div className="not-found">
          <div className="not-found-icon">🫥</div>
          <h1>Page not found</h1>
          <p>{error || 'This page may have been moved to the trash.'}</p>
          <button className="btn primary" onClick={() => (window.location.hash = '#/')}>
            Back to workspace
          </button>
        </div>
      </div>
    );
  }

  const ancestors = pageAncestors(pages, pageId).slice(0, -1);
  const settings = livePage.settings || {};
  const fontClass = PAGE_FONTS.find((font) => font.id === settings.font)?.className || '';
  const contextText =
    livePage.type === 'database' && database
      ? databaseToPlainText(livePage, database)
      : blocksToPlainText(blocks);

  return (
    <div className="page-view">
      <div
        className="page-scroll"
        ref={scrollRef}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 12)}
      >
        {livePage.cover && (
          <div className="page-cover" style={coverStyle(livePage.cover)}>
            <div className="cover-actions">
              <button onClick={() => setCoverOpen(true)}>Change cover</button>
              <button onClick={() => updateCover(null)}>Remove</button>
            </div>
          </div>
        )}

        <div
          className={cn(
            'page-content',
            settings.fullWidth && 'page-full',
            settings.smallText && 'page-small',
            fontClass,
            !livePage.cover && 'no-cover'
          )}
        >
          <div className={cn('page-icon-row', !livePage.icon && 'is-empty')}>
            <button
              ref={iconButtonRef}
              className={cn('page-icon-button', !livePage.icon && 'empty')}
              onClick={(event) => setIconAnchor(event.currentTarget)}
              title={livePage.icon ? 'Change icon' : 'Add icon'}
            >
              {livePage.icon ? (
                <PageIcon page={livePage} size={64} />
              ) : (
                <>
                  <Smile size={18} />
                  <span>Add icon</span>
                </>
              )}
            </button>
          </div>

          <textarea
            ref={titleRef}
            className="page-title"
            value={title}
            rows={1}
            placeholder="Untitled"
            spellCheck
            onChange={(event) => scheduleTitleSave(event.target.value.replace(/\n/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (livePage.type === 'page') editorRef.current?.focusStart();
              }
              if (event.key === 'Escape') event.currentTarget.blur();
            }}
          />

          {livePage.type === 'database' && database ? (
            <DatabaseView key={livePage.id} page={livePage} database={database} />
          ) : (
            <Editor
              key={livePage.id}
              ref={editorRef}
              pageId={livePage.id}
              initialBlocks={blocks}
              onChange={setBlocks}
            />
          )}
        </div>

        <button className="page-add-cover" onClick={() => setCoverOpen(true)}>
          <ImageIcon size={15} /> {livePage.cover ? 'Change cover' : 'Add cover'}
        </button>
      </div>

      <div
        className={cn(
          'page-topbar',
          scrolled && 'scrolled',
          livePage.cover && !scrolled && 'over-cover'
        )}
      >
        <div className="topbar-left">
          <button
            className="icon-btn"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
          </button>
          <div className="breadcrumbs">
            {ancestors.length === 0 ? (
              <span className="breadcrumb-workspace">{workspaceName}</span>
            ) : (
              ancestors.slice(-3).map((ancestor) => (
                <span key={ancestor.id} className="breadcrumb-item">
                  <button onClick={() => (window.location.hash = `#/page/${ancestor.id}`)}>
                    <PageIcon page={ancestor} size={15} />
                    <span>{ancestor.title?.trim() || 'Untitled'}</span>
                  </button>
                  <span className="breadcrumb-slash">/</span>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="topbar-right">
          <span className="edited-label">Edited {relativeTime(livePage.updatedAt)}</span>
          <button
            className={cn('ai-topbar-button', aiOpen && 'active')}
            onClick={() => setAIOpen(!aiOpen)}
            title="Noting AI"
          >
            <Sparkles size={15} />
            <span>AI</span>
          </button>
          <button
            className={cn('icon-btn', livePage.favorite && 'favorited')}
            title={livePage.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => toggleFavorite(livePage)}
          >
            <Star size={17} fill={livePage.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-btn"
            title="More"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {aiOpen && (
        <AIPanel
          page={livePage}
          contextText={contextText}
          onInsert={livePage.type === 'page' ? handleInsertFromAI : undefined}
        />
      )}

      <Popover
        open={!!iconAnchor}
        anchor={iconAnchor}
        onClose={() => setIconAnchor(null)}
        className="emoji-popover page-icon-popover"
      >
        <EmojiPicker
          onSelect={async (emoji) => {
            updatePageLocal(pageId, { icon: emoji });
            await patchPage(pageId, { icon: emoji });
            setIconAnchor(null);
          }}
          onRemove={async () => {
            updatePageLocal(pageId, { icon: null });
            await patchPage(pageId, { icon: null });
            setIconAnchor(null);
          }}
        />
      </Popover>

      <Popover
        open={!!menuAnchor}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        className="menu page-menu"
        minWidth={250}
        placement="bottom-end"
      >
        <MenuLabel>{livePage.title?.trim() || 'Untitled'}</MenuLabel>
        <MenuItem
          icon={<Star size={16} />}
          label={livePage.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => {
            toggleFavorite(livePage);
            setMenuAnchor(null);
          }}
        />
        <MenuItem
          icon={<Smile size={16} />}
          label={livePage.icon ? 'Change icon' : 'Add icon'}
          onClick={() => {
            setMenuAnchor(null);
            setIconAnchor(iconButtonRef.current);
          }}
        />
        <MenuItem
          icon={<ImageIcon size={16} />}
          label={livePage.cover ? 'Change cover' : 'Add cover'}
          onClick={() => {
            setMenuAnchor(null);
            setCoverUrl('');
            setCoverError('');
            setCoverOpen(true);
          }}
        />
        <MenuItem icon={<Copy size={16} />} label="Copy link" onClick={copyLink} />
        <MenuSeparator />
        <MenuItem
          icon={<FileText size={16} />}
          label="Duplicate"
          onClick={() => {
            duplicatePage(livePage.id);
            setMenuAnchor(null);
          }}
        />
        <MenuItem
          icon={<Download size={16} />}
          label="Export as Markdown"
          onClick={() => {
            window.location.href = api.exportUrl(livePage.id);
            setMenuAnchor(null);
          }}
        />
        <MenuSeparator />
        <MenuLabel>Typography</MenuLabel>
        <MenuItem
          label="Small text"
          trailing={settings.smallText ? <Check size={14} /> : undefined}
          onClick={() => updateSettings({ smallText: !settings.smallText })}
        />
        <MenuItem
          label="Full width"
          trailing={settings.fullWidth ? <Check size={14} /> : undefined}
          onClick={() => updateSettings({ fullWidth: !settings.fullWidth })}
        />
        {PAGE_FONTS.map((font) => (
          <MenuItem
            key={font.id}
            label={`${font.label} font`}
            className={font.className}
            trailing={settings.font === font.id ? <Check size={14} /> : undefined}
            onClick={() => updateSettings({ font: font.id })}
          />
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Trash2 size={16} />}
          label="Move to trash"
          danger
          onClick={() => {
            setMenuAnchor(null);
            archivePage(livePage.id);
          }}
        />
        <div className="menu-footnote">
          <Loader2 size={12} /> Changes save automatically
        </div>
      </Popover>

      <Modal
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        width={620}
        className="cover-modal"
      >
        <div className="cover-modal-content">
          <h2>{livePage.cover ? 'Change cover' : 'Add cover'}</h2>
          <div className="cover-preview" style={livePage.cover ? coverStyle(livePage.cover) : undefined}>
            {!livePage.cover && <span>Choose a cover for this page</span>}
          </div>
          <div className="cover-section-label">Gradients</div>
          <div className="cover-grid">
            {Object.entries(COVER_GRADIENTS).map(([name, gradient]) => (
              <button
                key={name}
                className="cover-swatch"
                style={{ backgroundImage: gradient }}
                title={name}
                onClick={() => updateCover(`gradient:${name}`)}
              />
            ))}
          </div>
          <div className="cover-section-label">Image</div>
          <div className="cover-image-row">
            <label className="btn ghost cover-upload">
              {coverBusy ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
              Upload
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadCover(file);
                }}
              />
            </label>
            <input
              className="text-input"
              value={coverUrl}
              onChange={(event) => {
                setCoverUrl(event.target.value);
                setCoverError('');
              }}
              placeholder="Paste an image URL…"
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyCoverUrl();
              }}
            />
            <button className="btn ghost" onClick={applyCoverUrl} disabled={!coverUrl.trim()}>
              Apply
            </button>
          </div>
          {coverError && <div className="form-error">{coverError}</div>}
          <div className="cover-modal-actions">
            {livePage.cover && (
              <button
                className="btn ghost danger-text"
                onClick={() => updateCover(null)}
              >
                Remove cover
              </button>
            )}
            <button className="btn primary" onClick={() => setCoverOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </Modal>

      <button
        className="mobile-sidebar-button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar"
      >
        <Menu size={18} />
      </button>
    </div>
  );
}

function TopbarPlaceholder() {
  return (
    <div className="page-topbar scrolled">
      <div className="topbar-left">
        <div className="skeleton-circle" />
      </div>
    </div>
  );
}
