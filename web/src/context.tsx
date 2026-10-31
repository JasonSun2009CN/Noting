import { createContext, useContext } from 'react';
import type { AIConfig, AISeed, Folder, Page, PageType, ThemePreference } from './types';

export type Route = { view: 'page'; pageId: string } | { view: 'trash' } | { view: 'home' };

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AppContextValue {
  loading: boolean;
  pages: Page[];
  folders: Folder[];
  workspaceName: string;
  trashCount: number;
  route: Route;
  currentPageId: string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
  aiOpen: boolean;
  setAIOpen: (open: boolean) => void;
  aiSeed: AISeed | null;
  openAI: (seed?: { prompt?: string; autoSend?: boolean }) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  aiConfig: AIConfig;
  saveAIConfig: (config: AIConfig) => void;
  toast: (message: string, kind?: 'default' | 'error' | 'success') => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  navigatePage: (id: string) => void;
  navigateTrash: () => void;
  navigateHome: () => void;
  refreshPages: () => Promise<void>;
  createPage: (input?: {
    parentId?: string | null;
    folderId?: string | null;
    type?: PageType;
    title?: string;
    icon?: string;
  }) => Promise<Page | null>;
  createFolder: (name: string) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  patchPage: (id: string, patch: Partial<Page>) => Promise<Page | undefined>;
  updatePageLocal: (id: string, patch: Partial<Page>) => void;
  toggleFavorite: (page: Page) => Promise<void>;
  archivePage: (id: string) => Promise<void>;
  restorePage: (id: string) => Promise<void>;
  deletePageForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  duplicatePage: (id: string) => Promise<Page | null>;
  renameWorkspace: (name: string) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppContext');
  return value;
}
