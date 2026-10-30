export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'image'
  | 'page';

export type PageType = 'page' | 'database';
export type PropType = 'text' | 'number' | 'select' | 'multi_select' | 'checkbox' | 'date' | 'url';

export interface PageSettings {
  smallText?: boolean;
  fullWidth?: boolean;
  font?: 'default' | 'serif' | 'mono';
}

export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: string | null;
  type: PageType;
  favorite: boolean;
  archived: boolean;
  sortOrder: number;
  settings: PageSettings;
  createdAt: number;
  updatedAt: number;
}

export interface BlockProps {
  checked?: boolean;
  collapsed?: boolean;
  language?: string;
  emoji?: string;
  color?: string;
  src?: string;
  caption?: string;
  pageId?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  html: string;
  props: BlockProps;
  indent: number;
}

export interface Database {
  props: DbProp[];
  rows: DbRow[];
}

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface DbProp {
  id: string;
  pageId: string;
  name: string;
  type: PropType;
  options: SelectOption[];
  sortOrder: number;
}

export interface DbRow {
  id: string;
  pageId: string;
  title: string;
  props: Record<string, unknown>;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface PagePayload {
  page: Page;
  blocks: Block[];
  database?: Database;
}

export interface WorkspaceBootstrap {
  pages: Page[];
  favorites: string[];
  workspace: { name: string };
  trashCount: number;
}

export interface SearchResult extends Page {
  snippet: string;
  parentTitle: string;
}

export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'orcarouter' | 'ollama' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AISeed {
  prompt: string;
  autoSend: boolean;
  nonce: number;
}

export type ThemePreference = 'light' | 'dark' | 'system';
