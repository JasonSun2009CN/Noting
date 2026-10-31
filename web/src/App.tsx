import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type ConfirmOptions, type Route } from './context';
import type { AIConfig, AISeed, Folder, Page, PageType, ThemePreference } from './types';
import { api } from './api';
import { descendantPageIds, isMac } from './lib/utils';
import Sidebar from './components/Sidebar';
import PageView from './components/PageView';
import SearchModal from './components/SearchModal';
import SettingsModal from './components/SettingsModal';
import TrashView from './components/TrashView';
import Modal from './components/Modal';
import { Check, FileText, Info, Loader2, Plus, Sparkles, X } from 'lucide-react';

const AI_DEFAULTS: AIConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.7,
};

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('page/')) {
    const id = hash.slice(5).split('?')[0];
    if (id) return { view: 'page', pageId: id };
  }
  if (hash === 'trash') return { view: 'trash' };
  return { view: 'home' };
}

type ToastItem = { id: string; message: string; kind: 'default' | 'error' | 'success' };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<Page[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [trashCount, setTrashCount] = useState(0);
  const [route, setRoute] = useState<Route>(parseHash);

  const [sidebarOpen, setSidebarOpenState] = useState(() => {
    try {
      if (window.innerWidth < 860) return false;
      return localStorage.getItem('noting.sidebar') !== 'closed';
    } catch {
      return true;
    }
  });

  const [theme, setThemeState] = useState<ThemePreference>(() => {
    try {
      const stored = localStorage.getItem('noting.theme') as ThemePreference | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // ignore
    }
    return 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  const [aiOpen, setAIOpen] = useState(false);
  const [aiSeed, setAISeed] = useState<AISeed | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiConfig, setAIConfig] = useState<AIConfig>(() => {
    try {
      const stored = localStorage.getItem('noting.ai');
      if (stored) return { ...AI_DEFAULTS, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
    return AI_DEFAULTS;
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const currentPageId = route.view === 'page' ? route.pageId : null;

  const toast = useCallback((message: string, kind: 'default' | 'error' | 'success' = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((items) => [...items.slice(-3), { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, kind === 'error' ? 6000 : 3800);
    timers.current.set(id, timer);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ options, resolve });
      }),
    []
  );

  const refreshPages = useCallback(async () => {
    const data = await api.bootstrap();
    setPages(data.pages);
    setFolders(data.folders || []);
    setWorkspaceName(data.workspace.name);
    setTrashCount(data.trashCount);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshPages()
      .catch((error) => {
        toast(error?.message || 'Could not connect to the Noting server.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshPages, toast]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (route.view === 'home') {
      if (!pages.length) return;
      let last = '';
      try {
        last = localStorage.getItem('noting.lastPage') || '';
      } catch {
        // ignore
      }
      const target =
        pages.find((page) => page.id === last) ||
        pages.find((page) => page.favorite) ||
        pages[0];
      if (target) navigatePage(target.id);
    }
    if (route.view === 'page') {
      try {
        localStorage.setItem('noting.lastPage', route.pageId);
      } catch {
        // ignore
      }
    }
  }, [loading, route, pages]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#191919' : '#ffffff');
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('noting.theme', theme);
    } catch {
      // ignore
    }
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    try {
      localStorage.setItem('noting.sidebar', open ? 'open' : 'closed');
    } catch {
      // ignore
    }
  }, []);

  const navigatePage = useCallback((id: string) => {
    if (window.location.hash !== `#/page/${id}`) {
      window.location.hash = `#/page/${id}`;
    }
    setRoute({ view: 'page', pageId: id });
  }, []);

  const navigateTrash = useCallback(() => {
    if (window.location.hash !== '#/trash') window.location.hash = '#/trash';
    setRoute({ view: 'trash' });
  }, []);

  const navigateHome = useCallback(() => {
    if (window.location.hash !== '#/') window.location.hash = '#/';
    setRoute({ view: 'home' });
  }, []);

  const updatePageLocal = useCallback((id: string, patch: Partial<Page>) => {
    setPages((items) => items.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }, []);

  const patchPage = useCallback(
    async (id: string, patch: Partial<Page>) => {
      try {
        const { page } = await api.patchPage(id, patch);
        updatePageLocal(id, page);
        return page;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not save the page.', 'error');
        return undefined;
      }
    },
    [toast, updatePageLocal]
  );

  const createPage = useCallback(
    async (input?: {
      parentId?: string | null;
      folderId?: string | null;
      type?: PageType;
      title?: string;
      icon?: string;
    }) => {
      try {
        const payload = await api.createPage({
          parentId: input?.parentId ?? null,
          folderId: input?.folderId ?? null,
          type: input?.type ?? 'page',
          title: input?.title ?? '',
          icon: input?.icon,
        });
        await refreshPages();
        navigatePage(payload.page.id);
        return payload.page;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not create the page.', 'error');
        return null;
      }
    },
    [navigatePage, refreshPages, toast]
  );

  const createFolder = useCallback(
    async (name: string) => {
      try {
        const { folder } = await api.createFolder(name);
        await refreshPages();
        toast('Folder created');
        return folder;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not create the folder.', 'error');
        return null;
      }
    },
    [refreshPages, toast]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      try {
        await api.renameFolder(id, name);
        await refreshPages();
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not rename the folder.', 'error');
      }
    },
    [refreshPages, toast]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      try {
        await api.deleteFolder(id);
        await refreshPages();
        toast('Folder deleted · pages moved to Private');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not delete the folder.', 'error');
      }
    },
    [refreshPages, toast]
  );

  const toggleFavorite = useCallback(
    async (page: Page) => {
      const updated = await patchPage(page.id, { favorite: !page.favorite });
      if (updated) toast(updated.favorite ? 'Added to favorites' : 'Removed from favorites');
    },
    [patchPage, toast]
  );

  const archivePage = useCallback(
    async (id: string) => {
      try {
        const target = pages.find((page) => page.id === id);
        const affected = new Set([id, ...descendantPageIds(pages, id)]);
        await api.archivePage(id, true);
        await refreshPages();
        if (currentPageId && affected.has(currentPageId)) {
          const fallback =
            (target?.parentId && pages.find((page) => page.id === target.parentId)) ||
            pages.find((page) => !affected.has(page.id));
          if (fallback) navigatePage(fallback.id);
          else navigateHome();
        }
        toast('Moved to trash');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not move the page to trash.', 'error');
      }
    },
    [currentPageId, navigateHome, navigatePage, pages, refreshPages, toast]
  );

  const restorePage = useCallback(
    async (id: string) => {
      try {
        const { page } = await api.restorePage(id);
        await refreshPages();
        navigatePage(page.id);
        toast('Page restored');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not restore the page.', 'error');
      }
    },
    [navigatePage, refreshPages, toast]
  );

  const deletePageForever = useCallback(
    async (id: string) => {
      try {
        await api.deletePage(id);
        await refreshPages();
        toast('Page deleted forever');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not delete the page.', 'error');
      }
    },
    [refreshPages, toast]
  );

  const emptyTrash = useCallback(async () => {
    try {
      await api.emptyTrash();
      await refreshPages();
      toast('Trash emptied');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not empty the trash.', 'error');
    }
  }, [refreshPages, toast]);

  const duplicatePage = useCallback(
    async (id: string) => {
      try {
        const { page } = await api.duplicatePage(id);
        await refreshPages();
        navigatePage(page.id);
        toast('Page duplicated');
        return page;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not duplicate the page.', 'error');
        return null;
      }
    },
    [navigatePage, refreshPages, toast]
  );

  const renameWorkspace = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      try {
        const response = await api.updateWorkspace(name.trim());
        setWorkspaceName(response.name);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not rename the workspace.', 'error');
      }
    },
    [toast]
  );

  const saveAIConfig = useCallback((config: AIConfig) => {
    setAIConfig(config);
    try {
      localStorage.setItem('noting.ai', JSON.stringify(config));
    } catch {
      // ignore
    }
  }, []);

  const openAI = useCallback((seed?: { prompt?: string; autoSend?: boolean }) => {
    setAIOpen(true);
    setAISeed({
      prompt: seed?.prompt || '',
      autoSend: seed?.autoSend ?? false,
      nonce: Date.now(),
    });
  }, []);

  const setTheme = useCallback((next: ThemePreference) => setThemeState(next), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && aiOpen && !searchOpen && !settingsOpen) {
        if (event.defaultPrevented) return;
        setAIOpen(false);
        return;
      }
      const mod = isMac() ? event.metaKey : event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();

      if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      if (key === 'j' && !event.shiftKey) {
        event.preventDefault();
        openAI();
        return;
      }
      if (key === '\\') {
        event.preventDefault();
        setSidebarOpen(!sidebarOpen);
        return;
      }
      if (event.shiftKey && key === 'n') {
        event.preventDefault();
        createPage();
        return;
      }
      if (event.shiftKey && key === 'l') {
        event.preventDefault();
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        return;
      }
      if (event.shiftKey && key === 'e' && currentPageId) {
        event.preventDefault();
        window.location.href = api.exportUrl(currentPageId);
        return;
      }
      if (event.shiftKey && key === 'p' && currentPageId) {
        const page = pages.find((item) => item.id === currentPageId);
        if (page) {
          event.preventDefault();
          toggleFavorite(page);
        }
        return;
      }
      if (event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete') && currentPageId) {
        event.preventDefault();
        archivePage(currentPageId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    aiOpen,
    archivePage,
    createPage,
    currentPageId,
    openAI,
    pages,
    resolvedTheme,
    searchOpen,
    setSidebarOpen,
    setTheme,
    settingsOpen,
    sidebarOpen,
    toggleFavorite,
  ]);

  useEffect(() => {
    const cleanups = Array.from(timers.current.values());
    return () => cleanups.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const contextValue = useMemo(
    () => ({
      loading,
      pages,
      folders,
      workspaceName,
      trashCount,
      route,
      currentPageId,
      sidebarOpen,
      setSidebarOpen,
      theme,
      resolvedTheme,
      setTheme,
      aiOpen,
      setAIOpen,
      aiSeed,
      openAI,
      searchOpen,
      setSearchOpen,
      settingsOpen,
      setSettingsOpen,
      aiConfig,
      saveAIConfig,
      toast,
      confirm,
      navigatePage,
      navigateTrash,
      navigateHome,
      refreshPages,
      createPage,
      createFolder,
      renameFolder,
      deleteFolder,
      patchPage,
      updatePageLocal,
      toggleFavorite,
      archivePage,
      restorePage,
      deletePageForever,
      emptyTrash,
      duplicatePage,
      renameWorkspace,
    }),
    [
      loading,
      pages,
      folders,
      workspaceName,
      trashCount,
      route,
      currentPageId,
      sidebarOpen,
      setSidebarOpen,
      theme,
      resolvedTheme,
      setTheme,
      aiOpen,
      aiSeed,
      openAI,
      searchOpen,
      settingsOpen,
      aiConfig,
      saveAIConfig,
      toast,
      confirm,
      navigatePage,
      navigateTrash,
      navigateHome,
      refreshPages,
      createPage,
      createFolder,
      renameFolder,
      deleteFolder,
      patchPage,
      updatePageLocal,
      toggleFavorite,
      archivePage,
      restorePage,
      deletePageForever,
      emptyTrash,
      duplicatePage,
      renameWorkspace,
    ]
  );

  const finishConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  let content;
  if (loading) {
    content = (
      <div className="splash">
        <div className="splash-logo">
          <span className="brand-n">N</span>
          <Sparkles size={16} className="brand-spark" />
        </div>
        <div className="splash-loading">
          <Loader2 size={15} className="spin" /> Loading your workspace
        </div>
      </div>
    );
  } else if (route.view === 'trash') {
    content = <TrashView />;
  } else if (route.view === 'page') {
    content = <PageView key={route.pageId} pageId={route.pageId} />;
  } else {
    content = (
      <div className="empty-workspace">
        <div className="empty-icon">🪴</div>
        <h1>Your workspace is empty</h1>
        <p>Create your first page and start writing.</p>
        <button className="btn primary" onClick={() => createPage()}>
          <Plus size={16} /> New page
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app">
        <Sidebar />
        <main className={`main ${sidebarOpen ? '' : 'main-full'}`}>{content}</main>
        <SearchModal />
        <SettingsModal />
        <Modal
          open={!!confirmState}
          onClose={() => finishConfirm(false)}
          className="confirm-modal"
          width={420}
        >
          {confirmState && (
            <div className="confirm">
              <div className="confirm-icon">
                <Info size={20} />
              </div>
              <h2>{confirmState.options.title}</h2>
              {confirmState.options.message && <p>{confirmState.options.message}</p>}
              <div className="confirm-actions">
                <button className="btn ghost" onClick={() => finishConfirm(false)}>
                  {confirmState.options.cancelLabel || 'Cancel'}
                </button>
                <button
                  className={`btn ${confirmState.options.danger ? 'danger' : 'primary'}`}
                  onClick={() => finishConfirm(true)}
                  autoFocus
                >
                  {confirmState.options.confirmLabel || 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </Modal>

        <div className="toast-stack" aria-live="polite">
          {toasts.map((item) => (
            <div key={item.id} className={`toast ${item.kind}`}>
              {item.kind === 'error' ? (
                <X size={15} />
              ) : item.kind === 'success' ? (
                <Check size={15} />
              ) : (
                <FileText size={15} />
              )}
              <span>{item.message}</span>
              <button
                className="toast-close"
                onClick={() => {
                  setToasts((items) => items.filter((toastItem) => toastItem.id !== item.id));
                  const timer = timers.current.get(item.id);
                  if (timer) window.clearTimeout(timer);
                  timers.current.delete(item.id);
                }}
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppContext.Provider>
  );
}
