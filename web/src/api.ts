import type {
  AIConfig,
  AIChatMessage,
  Block,
  Database,
  DbProp,
  DbRow,
  Folder,
  Page,
  PagePayload,
  PageType,
  SearchResult,
  WorkspaceBootstrap,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data?.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<WorkspaceBootstrap>('/api/bootstrap'),

  getPage: (id: string) => request<PagePayload>(`/api/pages/${id}`),

  createPage: (input: {
    parentId?: string | null;
    folderId?: string | null;
    type?: PageType;
    title?: string;
    icon?: string;
  }) => request<PagePayload>('/api/pages', { method: 'POST', body: JSON.stringify(input) }),

  createFolder: (name: string) =>
    request<{ folder: Folder }>('/api/folders', { method: 'POST', body: JSON.stringify({ name }) }),

  renameFolder: (id: string, name: string) =>
    request<{ folder: Folder }>(`/api/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (id: string) =>
    request<{ ok: boolean }>(`/api/folders/${id}`, { method: 'DELETE' }),

  patchPage: (id: string, patch: Partial<Page>) =>
    request<{ page: Page }>(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  duplicatePage: (id: string) =>
    request<{ page: Page }>(`/api/pages/${id}/duplicate`, { method: 'POST' }),

  archivePage: (id: string, archived = true) =>
    request<{ ok: boolean }>(`/api/pages/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),

  deletePage: (id: string) =>
    request<{ ok: boolean }>(`/api/pages/${id}?permanent=1`, { method: 'DELETE' }),

  restorePage: (id: string) =>
    request<{ page: Page }>(`/api/pages/${id}/restore`, { method: 'POST' }),

  trash: () => request<{ pages: Page[] }>('/api/trash'),

  emptyTrash: () => request<{ ok: boolean }>('/api/trash/empty', { method: 'POST' }),

  saveBlocks: (id: string, blocks: Block[]) =>
    request<{ ok: boolean; savedAt: number }>(`/api/pages/${id}/blocks`, {
      method: 'PUT',
      body: JSON.stringify({ blocks }),
    }),

  search: (q: string) =>
    request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),

  updateWorkspace: (name: string) =>
    request<{ name: string }>('/api/workspace', { method: 'PATCH', body: JSON.stringify({ name }) }),

  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string; name: string; size: number }>('/api/upload', {
      method: 'POST',
      body: form,
    });
  },

  addProp: (pageId: string, name: string, type: string) =>
    request<{ prop: DbProp }>(`/api/pages/${pageId}/props`, {
      method: 'POST',
      body: JSON.stringify({ name, type }),
    }),

  updateProp: (id: string, patch: { name?: string; options?: { id?: string; name: string; color?: string }[] }) =>
    request<{ prop: DbProp }>(`/api/props/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteProp: (id: string) =>
    request<{ ok: boolean }>(`/api/props/${id}`, { method: 'DELETE' }),

  addRow: (pageId: string, title = '') =>
    request<{ row: DbRow }>(`/api/pages/${pageId}/rows`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  updateRow: (id: string, patch: { title?: string; props?: Record<string, unknown> }) =>
    request<{ row: DbRow }>(`/api/rows/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteRow: (id: string) => request<{ ok: boolean }>(`/api/rows/${id}`, { method: 'DELETE' }),

  exportUrl: (pageId: string) => `/api/pages/${pageId}/export`,

  aiModels: (config: Pick<AIConfig, 'provider' | 'apiKey' | 'baseUrl'>) =>
    request<{ models: string[] }>('/api/ai/models', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  /** Streams plain text from the local AI proxy. */
  async aiChat(
    config: AIConfig,
    messages: AIChatMessage[],
    system: string,
    signal: AbortSignal
  ): Promise<Response> {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        messages,
        system,
      }),
    });
    if (!response.ok) {
      let message = `AI request failed (${response.status})`;
      try {
        const data = await response.json();
        message = data?.error || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    return response;
  },

  /** Best-effort title for a page after its first AI insertion. */
  async generateTitle(config: AIConfig, text: string, signal: AbortSignal) {
    const response = await this.aiChat(
      { ...config, temperature: 0.2 },
      [
        {
          role: 'user',
          content: `Write a concise title (max 6 words, no quotes, no punctuation at the end) for this note:\n\n${text.slice(0, 1500)}`,
        },
      ],
      'You name documents. Reply with only the title.',
      signal
    );
    const title = (await response.text()).trim().replace(/^["'#\s]+|["'.\s]+$/g, '');
    return title.split('\n')[0].slice(0, 80);
  },
};

export type { Database };
