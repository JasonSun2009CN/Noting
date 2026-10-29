import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Database,
  FileText,
  Loader2,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { SearchResult } from '../types';
import { cn, isMac, relativeTime } from '../lib/utils';
import Modal from './Modal';
import PageIcon from './PageIcon';

interface Command {
  id: string;
  label: string;
  subtitle?: string;
  snippet?: string;
  icon: React.ReactNode;
  kind: 'page' | 'action';
  shortcut?: string;
  action: () => void;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}

export default function SearchModal() {
  const {
    searchOpen,
    setSearchOpen,
    pages,
    createPage,
    navigatePage,
    navigateTrash,
    setSettingsOpen,
    openAI,
    theme,
    setTheme,
    resolvedTheme,
  } = useApp();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    setQuery('');
    setResults([]);
    setActiveIndex(0);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .search(trimmed)
        .then((data) => {
          if (id !== requestId.current) return;
          setResults(data.results);
          setActiveIndex(0);
        })
        .catch(() => {
          if (id === requestId.current) setResults([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 170);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  const commands = useMemo<Command[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const recent = [...pages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
      return [
        ...recent.map((page) => ({
          id: `page-${page.id}`,
          label: page.title?.trim() || 'Untitled',
          subtitle: `Edited ${relativeTime(page.updatedAt)}`,
          icon: <PageIcon page={page} size={18} />,
          kind: 'page' as const,
          action: () => {
            setSearchOpen(false);
            navigatePage(page.id);
          },
        })),
        {
          id: 'new-page',
          label: 'Create a new page',
          subtitle: 'Start from a blank page',
          icon: <Plus size={17} />,
          kind: 'action',
          shortcut: isMac() ? '⌘⇧N' : 'Ctrl Shift N',
          action: () => {
            setSearchOpen(false);
            createPage();
          },
        },
        {
          id: 'new-db',
          label: 'Create a new database',
          subtitle: 'Table and board views',
          icon: <Database size={17} />,
          kind: 'action',
          action: () => {
            setSearchOpen(false);
            createPage({ type: 'database', icon: '🗂️' });
          },
        },
        {
          id: 'ai',
          label: 'Ask Noting AI',
          subtitle: 'Think with your notes',
          icon: <Sparkles size={17} />,
          kind: 'action',
          action: () => {
            setSearchOpen(false);
            openAI();
          },
        },
        {
          id: 'theme',
          label: resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
          subtitle: `Currently ${resolvedTheme}`,
          icon: resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />,
          kind: 'action',
          action: () => {
            setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
            setSearchOpen(false);
          },
        },
        {
          id: 'settings',
          label: 'Open settings',
          icon: <Settings size={17} />,
          kind: 'action',
          action: () => {
            setSearchOpen(false);
            setSettingsOpen(true);
          },
        },
        {
          id: 'trash',
          label: 'Open trash',
          icon: <Trash2 size={17} />,
          kind: 'action',
          action: () => {
            setSearchOpen(false);
            navigateTrash();
          },
        },
      ];
    }

    return [
      ...results.map((page) => ({
        id: `result-${page.id}`,
        label: page.title?.trim() || 'Untitled',
        subtitle: page.parentTitle || (page.type === 'database' ? 'Database' : 'Private'),
        snippet: page.snippet,
        icon: <PageIcon page={page} size={18} />,
        kind: 'page' as const,
        action: () => {
          setSearchOpen(false);
          navigatePage(page.id);
        },
      })),
      {
        id: 'create-from-search',
        label: `Create a page called “${trimmed}”`,
        icon: <Plus size={17} />,
        kind: 'action',
        action: () => {
          setSearchOpen(false);
          createPage({ title: trimmed });
        },
      },
      {
        id: 'ask-ai',
        label: `Ask Noting AI about “${trimmed}”`,
        subtitle: 'Use this page’s context',
        icon: <Sparkles size={17} />,
        kind: 'action',
        action: () => {
          setSearchOpen(false);
          openAI({ prompt: trimmed, autoSend: false });
        },
      },
    ];
  }, [
    query,
    pages,
    results,
    navigatePage,
    createPage,
    openAI,
    resolvedTheme,
    setSearchOpen,
    setSettingsOpen,
    setTheme,
    navigateTrash,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [commands.length]);

  useEffect(() => {
    if (!searchOpen) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, searchOpen]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    command.action();
  };

  const recentLabel = query.trim() ? 'Search results' : 'Recently edited';
  const pagesShown = commands.filter((command) => command.kind === 'page');
  const actionsShown = commands.filter((command) => command.kind === 'action');

  return (
    <Modal
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      width={660}
      className="search-modal"
      overlayClassName="search-overlay"
      hideClose
    >
      <div className="search-box">
        <div className="search-input-row">
          {loading ? <Loader2 size={18} className="spin search-icon" /> : <Search size={18} className="search-icon" />}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, or ask Noting AI…"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => (commands.length ? (index + 1) % commands.length : 0));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) =>
                  commands.length ? (index - 1 + commands.length) % commands.length : 0
                );
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                run(commands[activeIndex]);
              }
            }}
          />
          <span className="search-esc">Esc</span>
        </div>

        <div className="search-results" ref={listRef}>
          {pagesShown.length > 0 && (
            <div className="search-section">
              <div className="search-section-label">
                {recentLabel}
                {query.trim() && <span>{pagesShown.length}</span>}
              </div>
              {pagesShown.map((command) => {
                const globalIndex = commands.indexOf(command);
                return (
                  <button
                    key={command.id}
                    data-command-index={globalIndex}
                    className={cn('search-result', activeIndex === globalIndex && 'active')}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => run(command)}
                  >
                    <span className="search-result-icon">{command.icon}</span>
                    <span className="search-result-copy">
                      <span className="search-result-title">
                        <Highlighted text={command.label} query={query} />
                      </span>
                      {command.snippet ? (
                        <span className="search-result-snippet">
                          <Highlighted text={command.snippet} query={query} />
                        </span>
                      ) : (
                        <span className="search-result-subtitle">{command.subtitle}</span>
                      )}
                    </span>
                    <span className="search-result-meta">
                      {command.kind === 'page' ? command.subtitle : ''}
                      <ArrowRight size={13} className="search-enter" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {query.trim() && !loading && pagesShown.length === 0 && (
            <div className="search-no-results">
              <span>No pages found for “{query.trim()}”</span>
              <span>Try a different search, or create one below.</span>
            </div>
          )}

          <div className="search-section">
            <div className="search-section-label">{query.trim() ? 'Actions' : 'Quick actions'}</div>
            {actionsShown.map((command) => {
              const globalIndex = commands.indexOf(command);
              return (
                <button
                  key={command.id}
                  data-command-index={globalIndex}
                  className={cn('search-result action', activeIndex === globalIndex && 'active')}
                  onMouseEnter={() => setActiveIndex(globalIndex)}
                  onClick={() => run(command)}
                >
                  <span className="search-result-icon">{command.icon}</span>
                  <span className="search-result-copy">
                    <span className="search-result-title">
                      <Highlighted text={command.label} query={query} />
                    </span>
                    {command.subtitle && (
                      <span className="search-result-subtitle">{command.subtitle}</span>
                    )}
                  </span>
                  {command.shortcut && <span className="search-shortcut">{command.shortcut}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="search-footer">
          <span>
            <kbd>↑</kbd><kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <Sparkles size={12} /> Ask AI from here
          </span>
        </div>
      </div>
    </Modal>
  );
}
