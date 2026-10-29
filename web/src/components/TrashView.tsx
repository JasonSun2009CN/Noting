import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { Page } from '../types';
import { cn, relativeTime } from '../lib/utils';
import PageIcon from './PageIcon';

export default function TrashView() {
  const {
    sidebarOpen,
    setSidebarOpen,
    navigatePage,
    navigateHome,
    refreshPages,
    restorePage,
    deletePageForever,
    emptyTrash,
    confirm,
    toast,
    workspaceName,
  } = useApp();

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  const load = async () => {
    try {
      const data = await api.trash();
      setPages(data.pages);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load the trash.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = async (page: Page) => {
    setBusyId(page.id);
    try {
      await restorePage(page.id);
      setPages((current) => current.filter((item) => item.id !== page.id));
      navigatePage(page.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (page: Page) => {
    const ok = await confirm({
      title: 'Delete forever?',
      message: `“${page.title?.trim() || 'Untitled'}” and everything inside it will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    });
    if (!ok) return;
    setBusyId(page.id);
    try {
      await deletePageForever(page.id);
      setPages((current) => current.filter((item) => item.id !== page.id));
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    const ok = await confirm({
      title: 'Empty the trash?',
      message: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Empty trash',
      danger: true,
    });
    if (!ok) return;
    setEmptying(true);
    try {
      await emptyTrash();
      setPages([]);
      await refreshPages();
    } finally {
      setEmptying(false);
    }
  };

  const filtered = pages.filter((page) =>
    (page.title || 'Untitled').toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="trash-view">
      <div className="page-topbar scrolled">
        <div className="topbar-left">
          <button
            className="icon-btn"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
          </button>
          <div className="breadcrumbs">
            <span className="breadcrumb-workspace">{workspaceName}</span>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-current">Trash</span>
          </div>
        </div>
        <div className="topbar-right">
          {pages.length > 0 && (
            <button className="btn ghost danger-text small" onClick={handleEmpty} disabled={emptying}>
              {emptying ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} Empty trash
            </button>
          )}
        </div>
      </div>

      <div className="trash-scroll">
        <div className="trash-content">
          <div className="trash-heading">
            <div>
              <h1>
                <Trash2 size={22} /> Trash
              </h1>
              <p>Pages in the trash can be restored, or deleted forever.</p>
            </div>
            <button className="btn ghost" onClick={() => navigateHome()}>
              <ArrowLeft size={15} /> Back to workspace
            </button>
          </div>

          {pages.length > 0 && (
            <div className="trash-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the trash…"
              />
            </div>
          )}

          {loading ? (
            <div className="trash-loading">
              <Loader2 size={18} className="spin" /> Loading trash…
            </div>
          ) : pages.length === 0 ? (
            <div className="trash-empty">
              <div className="trash-empty-icon">🗑️</div>
              <h2>Trash is empty</h2>
              <p>When you move pages to the trash, they will show up here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="trash-empty">
              <div className="trash-empty-icon">🔍</div>
              <h2>No matching pages</h2>
              <p>Try a different search term.</p>
            </div>
          ) : (
            <div className="trash-list">
              {filtered.map((page) => (
                <div key={page.id} className="trash-row">
                  <div className="trash-row-main">
                    <PageIcon page={page} size={20} />
                    <div className="trash-row-copy">
                      <span className="trash-row-title">{page.title?.trim() || 'Untitled'}</span>
                      <span className="trash-row-meta">
                        {page.type === 'database' ? 'Database' : 'Page'} · Deleted{' '}
                        {relativeTime(page.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="trash-row-actions">
                    <button
                      className="btn ghost small"
                      onClick={() => handleRestore(page)}
                      disabled={busyId === page.id}
                    >
                      {busyId === page.id ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <RotateCcw size={14} />
                      )}
                      Restore
                    </button>
                    <button
                      className={cn('btn ghost small danger-text')}
                      onClick={() => handleDelete(page)}
                      disabled={busyId === page.id}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pages.length > 0 && (
            <div className="trash-note">
              <AlertTriangle size={13} />
              Deleted pages are removed from search and the sidebar immediately.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
