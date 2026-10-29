import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import type { Page } from '../types';
import { api } from '../api';
import {
  cn,
  copyText,
  isMac,
  pageAncestors,
  relativeTime,
  shortcutLabel,
} from '../lib/utils';
import PageIcon from './PageIcon';
import Popover from './Popover';
import { MenuItem, MenuLabel, MenuSeparator } from './MenuItems';

function loadExpanded(): Set<string> {
  try {
    const stored = localStorage.getItem('noting.expanded');
    if (stored) return new Set(JSON.parse(stored) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

export default function Sidebar() {
  const {
    pages,
    currentPageId,
    navigatePage,
    navigateTrash,
    sidebarOpen,
    setSidebarOpen,
    createPage,
    archivePage,
    duplicatePage,
    toggleFavorite,
    patchPage,
    updatePageLocal,
    toast,
    settingsOpen,
    setSettingsOpen,
    theme,
    resolvedTheme,
    setTheme,
    aiOpen,
    openAI,
    setSearchOpen,
    workspaceName,
    renameWorkspace,
    trashCount,
    route,
  } = useApp();

  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [privateOpen, setPrivateOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [pageMenu, setPageMenu] = useState<{ page: Page; anchor: HTMLElement } | null>(null);
  const [workspaceMenu, setWorkspaceMenu] = useState<HTMLElement | null>(null);
  const [sectionMenu, setSectionMenu] = useState<HTMLElement | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState(workspaceName);

  useEffect(() => {
    try {
      localStorage.setItem('noting.expanded', JSON.stringify(Array.from(expanded)));
    } catch {
      // ignore
    }
  }, [expanded]);

  useEffect(() => {
    if (!currentPageId) return;
    const ancestors = pageAncestors(pages, currentPageId).slice(0, -1);
    if (!ancestors.length) return;
    setExpanded((current) => {
      let changed = false;
      const next = new Set(current);
      for (const page of ancestors) {
        if (!next.has(page.id)) {
          next.add(page.id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [currentPageId, pages]);

  useEffect(() => {
    setWorkspaceDraft(workspaceName);
  }, [workspaceName]);

  const childMap = useMemo(() => {
    const map = new Map<string | null, Page[]>();
    for (const page of pages) {
      const key = page.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(page);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    }
    return map;
  }, [pages]);

  const favorites = useMemo(
    () => pages.filter((page) => page.favorite).sort((a, b) => b.updatedAt - a.updatedAt),
    [pages]
  );

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (page: Page) => {
    setDraftTitle(page.title || '');
    setRenamingId(page.id);
    setPageMenu(null);
  };

  const commitRename = async (page: Page) => {
    const title = draftTitle.trim();
    setRenamingId(null);
    if (title === page.title) return;
    updatePageLocal(page.id, { title });
    await patchPage(page.id, { title });
  };

  const openPageMenu = (page: Page, event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setPageMenu({ page, anchor: event.currentTarget });
  };

  const createChild = async (parent: Page) => {
    const page = await createPage({ parentId: parent.id });
    if (page) setExpanded((current) => new Set(current).add(parent.id));
  };

  const handleNewPage = () => {
    createPage();
  };

  const handleNewDatabase = async () => {
    const page = await createPage({ type: 'database', icon: '🗂️' });
    if (page) {
      setExpanded((current) => new Set(current).add(page.id));
    }
  };

  const copyPageLink = async (page: Page) => {
    const url = `${window.location.origin}${window.location.pathname}#/page/${page.id}`;
    await copyText(url);
    toast('Link copied to clipboard');
  };

  const exportPage = (page: Page) => {
    window.location.href = api.exportUrl(page.id);
  };

  const renderPage = (page: Page, level: number): React.ReactNode => {
    const children = childMap.get(page.id) || [];
    const isExpanded = expanded.has(page.id);
    const active = currentPageId === page.id;
    const title = page.title?.trim() || 'Untitled';

    return (
      <div key={page.id}>
        <div
          className={cn('page-row', active && 'active')}
          style={{ paddingLeft: 6 + level * 12 }}
        >
          <button
            className={cn('disclosure', !children.length && 'hidden')}
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(page.id);
            }}
            aria-label={isExpanded ? 'Collapse page' : 'Expand page'}
            tabIndex={children.length ? 0 : -1}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          {renamingId === page.id ? (
            <input
              className="page-rename-input"
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => commitRename(page)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename(page);
                }
                if (event.key === 'Escape') {
                  setRenamingId(null);
                }
              }}
            />
          ) : (
            <a
              className="page-link"
              href={`#/page/${page.id}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                navigatePage(page.id);
                if (window.innerWidth < 860) setSidebarOpen(false);
              }}
              onDoubleClick={() => startRename(page)}
            >
              <PageIcon page={page} size={17} />
              <span className="page-title">{title}</span>
            </a>
          )}

          <div className="row-actions">
            <button
              className="row-action"
              title="Add a page inside"
              onClick={(event) => {
                event.stopPropagation();
                createChild(page);
              }}
            >
              <Plus size={14} />
            </button>
            <button
              className="row-action"
              title="More options"
              onClick={(event) => openPageMenu(page, event)}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>
        {children.length > 0 && isExpanded && (
          <div className="page-children">{children.map((child) => renderPage(child, level + 1))}</div>
        )}
      </div>
    );
  };

  const roots = childMap.get(null) || [];

  return (
    <>
      <aside className={cn('sidebar', !sidebarOpen && 'sidebar-collapsed')}>
        <div className="sidebar-header">
          <div className="workspace-button">
            <span className="workspace-avatar">N</span>
            {editingWorkspace ? (
              <input
                className="workspace-name-input"
                autoFocus
                value={workspaceDraft}
                onChange={(event) => setWorkspaceDraft(event.target.value)}
                onBlur={async () => {
                  setEditingWorkspace(false);
                  if (workspaceDraft.trim() && workspaceDraft.trim() !== workspaceName) {
                    await renameWorkspace(workspaceDraft);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                  if (event.key === 'Escape') {
                    setEditingWorkspace(false);
                    setWorkspaceDraft(workspaceName);
                  }
                }}
              />
            ) : (
              <button
                className="workspace-name-button"
                onClick={(event) => setWorkspaceMenu(event.currentTarget)}
              >
                <span className="workspace-name">{workspaceName}</span>
                <ChevronDown size={13} className="workspace-chevron" />
              </button>
            )}
          </div>
          <div className="sidebar-header-actions">
            <button className="icon-btn small" title="Search" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
            </button>
            <button className="icon-btn small" title="New page" onClick={handleNewPage}>
              <Plus size={17} />
            </button>
            <button
              className="icon-btn small sidebar-hide-btn"
              title="Close sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-top-actions">
          <button className="nav-row" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Search</span>
            <span className="nav-shortcut">{isMac() ? '⌘K' : 'Ctrl K'}</span>
          </button>
          <button
            className={cn('nav-row', aiOpen && 'active')}
            onClick={() => openAI()}
          >
            <Sparkles size={16} className="ai-sparkle" />
            <span>Noting AI</span>
            <span className="nav-shortcut">{isMac() ? '⌘J' : 'Ctrl J'}</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          {favorites.length > 0 && (
            <div className="sidebar-section">
              <div className="section-header">
                <button className="section-toggle" onClick={() => setFavoritesOpen(!favoritesOpen)}>
                  {favoritesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Favorites</span>
                </button>
              </div>
              {favoritesOpen && (
                <div className="favorites-list">
                  {favorites.map((page) => (
                    <div
                      key={page.id}
                      className={cn('page-row favorite-row', currentPageId === page.id && 'active')}
                      style={{ paddingLeft: 6 }}
                    >
                      <span className="disclosure hidden" />
                      <a
                        className="page-link"
                        href={`#/page/${page.id}`}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                          event.preventDefault();
                          navigatePage(page.id);
                          if (window.innerWidth < 860) setSidebarOpen(false);
                        }}
                      >
                        <PageIcon page={page} size={17} />
                        <span className="page-title">{page.title?.trim() || 'Untitled'}</span>
                      </a>
                      <div className="row-actions">
                        <button
                          className="row-action"
                          title="More options"
                          onClick={(event) => openPageMenu(page, event)}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="sidebar-section">
            <div className="section-header">
              <button className="section-toggle" onClick={() => setPrivateOpen(!privateOpen)}>
                {privateOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Private</span>
              </button>
              <div className="section-actions">
                <button className="icon-btn tiny" title="New page" onClick={handleNewPage}>
                  <Plus size={14} />
                </button>
                <button
                  className="icon-btn tiny"
                  title="More"
                  onClick={(event) => setSectionMenu(event.currentTarget)}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            {privateOpen && (
              <div className="page-tree">
                {roots.length === 0 ? (
                  <button className="sidebar-empty" onClick={handleNewPage}>
                    <FilePlus2 size={15} />
                    Create your first page
                  </button>
                ) : (
                  roots.map((page) => renderPage(page, 0))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className={cn('nav-row', route.view === 'trash' && 'active')}
            onClick={navigateTrash}
          >
            <Trash2 size={16} />
            <span>Trash</span>
            {trashCount > 0 && <span className="trash-count">{trashCount}</span>}
          </button>
          <button
            className={cn('nav-row', settingsOpen && 'active')}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <button
            className="nav-row"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            <span className="nav-shortcut">{isMac() ? '⌘⇧L' : 'Ctrl Shift L'}</span>
          </button>
          <div className="sidebar-hint">
            <span className="sidebar-hint-dot" />
            Local workspace
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Popover
        open={!!workspaceMenu}
        anchor={workspaceMenu}
        onClose={() => setWorkspaceMenu(null)}
        className="menu workspace-menu"
        minWidth={240}
      >
        <MenuLabel>{workspaceName}</MenuLabel>
        <MenuItem
          icon={<FileText size={16} />}
          label="Rename workspace"
          onClick={() => {
            setEditingWorkspace(true);
            setWorkspaceMenu(null);
          }}
        />
        <MenuItem
          icon={<Search size={16} />}
          label="Search"
          shortcut={isMac() ? '⌘K' : 'Ctrl K'}
          onClick={() => {
            setWorkspaceMenu(null);
            setSearchOpen(true);
          }}
        />
        <MenuItem
          icon={<Settings size={16} />}
          label="Settings"
          onClick={() => {
            setWorkspaceMenu(null);
            setSettingsOpen(true);
          }}
        />
        <MenuSeparator />
        <MenuItem
          icon={<Trash2 size={16} />}
          label="Trash"
          onClick={() => {
            setWorkspaceMenu(null);
            navigateTrash();
          }}
        />
        <MenuItem
          icon={<Copy size={16} />}
          label="Copy workspace link"
          onClick={async () => {
            await copyText(`${window.location.origin}${window.location.pathname}`);
            setWorkspaceMenu(null);
            toast('Workspace link copied');
          }}
        />
      </Popover>

      <Popover
        open={!!sectionMenu}
        anchor={sectionMenu}
        onClose={() => setSectionMenu(null)}
        className="menu"
        minWidth={210}
      >
        <MenuItem
          icon={<FileText size={16} />}
          label="New page"
          onClick={() => {
            setSectionMenu(null);
            handleNewPage();
          }}
        />
        <MenuItem
          icon={<Database size={16} />}
          label="New database"
          onClick={() => {
            setSectionMenu(null);
            handleNewDatabase();
          }}
        />
      </Popover>

      <Popover
        open={!!pageMenu}
        anchor={pageMenu?.anchor || null}
        onClose={() => setPageMenu(null)}
        className="menu"
        minWidth={230}
      >
        {pageMenu && (
          <>
            <MenuLabel>{pageMenu.page.title?.trim() || 'Untitled'}</MenuLabel>
            <MenuItem
              icon={<FilePlus2 size={16} />}
              label="Add page inside"
              onClick={() => {
                createChild(pageMenu.page);
                setPageMenu(null);
              }}
            />
            <MenuItem
              icon={<FileText size={16} />}
              label="Rename"
              onClick={() => startRename(pageMenu.page)}
            />
            <MenuItem
              icon={<Star size={16} />}
              label={pageMenu.page.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => {
                toggleFavorite(pageMenu.page);
                setPageMenu(null);
              }}
            />
            <MenuItem
              icon={<Copy size={16} />}
              label="Copy link"
              onClick={() => {
                copyPageLink(pageMenu.page);
                setPageMenu(null);
              }}
            />
            <MenuItem
              icon={<Download size={16} />}
              label="Export as Markdown"
              onClick={() => {
                exportPage(pageMenu.page);
                setPageMenu(null);
              }}
            />
            <MenuSeparator />
            <MenuItem
              icon={<FileText size={16} />}
              label="Duplicate"
              onClick={() => {
                duplicatePage(pageMenu.page.id);
                setPageMenu(null);
              }}
            />
            <MenuItem
              icon={<Trash2 size={16} />}
              label="Move to trash"
              danger
              onClick={() => {
                archivePage(pageMenu.page.id);
                setPageMenu(null);
              }}
            />
            <div className="menu-footnote">
              Edited {relativeTime(pageMenu.page.updatedAt)}
            </div>
          </>
        )}
      </Popover>
    </>
  );
}
