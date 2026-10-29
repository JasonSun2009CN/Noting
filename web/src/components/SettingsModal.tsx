import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  FileText,
  Github,
  Heart,
  Info,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { AIProvider, AIConfig, ThemePreference } from '../types';
import { AI_PROVIDERS, cn } from '../lib/utils';
import Modal from './Modal';

type Tab = 'ai' | 'appearance' | 'workspace' | 'about';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'ai', label: 'AI', icon: <Sparkles size={15} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'workspace', label: 'Workspace', icon: <Server size={15} /> },
  { id: 'about', label: 'About', icon: <Info size={15} /> },
];

export default function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    aiConfig,
    saveAIConfig,
    theme,
    setTheme,
    pages,
    workspaceName,
    renameWorkspace,
    trashCount,
    toast,
  } = useApp();

  const [tab, setTab] = useState<Tab>('ai');
  const [draft, setDraft] = useState<AIConfig>(aiConfig);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [workspaceDraft, setWorkspaceDraft] = useState(workspaceName);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const testAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    setDraft(aiConfig);
    setWorkspaceDraft(workspaceName);
    setTestResult(null);
    setTestMessage('');
    setModelsError('');
  }, [settingsOpen, aiConfig, workspaceName]);

  useEffect(() => {
    if (!settingsOpen) {
      testAbort.current?.abort();
      testAbort.current = null;
    }
  }, [settingsOpen]);

  const providerMeta = useMemo(
    () => AI_PROVIDERS.find((provider) => provider.id === draft.provider) || AI_PROVIDERS[0],
    [draft.provider]
  );

  const stats = useMemo(() => {
    const databases = pages.filter((page) => page.type === 'database').length;
    const favorites = pages.filter((page) => page.favorite).length;
    return { pages: pages.length, databases, favorites };
  }, [pages]);

  const dirty =
    draft.provider !== aiConfig.provider ||
    draft.apiKey !== aiConfig.apiKey ||
    draft.baseUrl !== aiConfig.baseUrl ||
    draft.model !== aiConfig.model ||
    draft.temperature !== aiConfig.temperature;

  const chooseProvider = (provider: AIProvider) => {
    const meta = AI_PROVIDERS.find((item) => item.id === provider);
    setDraft((current) => ({
      ...current,
      provider,
      baseUrl: provider === 'custom' ? current.baseUrl : meta?.baseUrl || current.baseUrl,
      model: provider === 'custom' ? current.model : meta?.model || current.model,
    }));
    setModels([]);
    setModelsError('');
    setTestResult(null);
  };

  const loadModels = async () => {
    if (modelsBusy) return;
    setModelsBusy(true);
    setModelsError('');
    try {
      const { models: list } = await api.aiModels({
        provider: draft.provider,
        apiKey: draft.apiKey,
        baseUrl: draft.baseUrl,
      });
      setModels(list);
      if (!list.length) setModelsError('No models were returned by this provider.');
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : 'Could not load models.');
    } finally {
      setModelsBusy(false);
    }
  };

  const testConnection = async () => {
    if (testing) return;
    if (draft.provider !== 'ollama' && !draft.apiKey.trim()) {
      setTestResult('fail');
      setTestMessage('Add an API key first.');
      return;
    }
    if (!draft.model.trim()) {
      setTestResult('fail');
      setTestMessage('Choose a model first.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestMessage('');
    const controller = new AbortController();
    testAbort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await api.aiChat(
        draft,
        [{ role: 'user', content: 'Reply with the single word: OK' }],
        'You are a connection test. Reply with only the word OK.',
        controller.signal
      );
      const text = await response.text();
      if (text.trim()) {
        setTestResult('ok');
        setTestMessage('Connected. Your key works with this model.');
      } else {
        setTestResult('fail');
        setTestMessage('The provider returned an empty response.');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setTestResult('fail');
        setTestMessage('The request timed out after 30 seconds.');
      } else {
        setTestResult('fail');
        setTestMessage(error instanceof Error ? error.message : 'Could not reach the provider.');
      }
    } finally {
      window.clearTimeout(timer);
      setTesting(false);
      testAbort.current = null;
    }
  };

  const saveAI = () => {
    const trimmed: AIConfig = {
      ...draft,
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      model: draft.model.trim(),
    };
    if (!trimmed.baseUrl) {
      toast('Add an API base URL.', 'error');
      return;
    }
    if (!trimmed.model) {
      toast('Choose a model.', 'error');
      return;
    }
    if (trimmed.provider !== 'ollama' && !trimmed.apiKey) {
      toast('Add your API key. Keys stay in this browser only.', 'error');
      return;
    }
    saveAIConfig(trimmed);
    toast('AI settings saved', 'success');
    setSettingsOpen(false);
  };

  const saveWorkspace = async () => {
    const name = workspaceDraft.trim();
    if (!name) return;
    if (name === workspaceName) {
      toast('Workspace name unchanged');
      return;
    }
    setSavingWorkspace(true);
    try {
      await renameWorkspace(name);
      toast('Workspace renamed', 'success');
    } finally {
      setSavingWorkspace(false);
    }
  };

  const themeOptions: { id: ThemePreference; label: string; description: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', description: 'Bright and crisp', icon: <Sun size={17} /> },
    { id: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: <Moon size={17} /> },
    { id: 'system', label: 'System', description: 'Match your device', icon: <Monitor size={17} /> },
  ];

  return (
    <Modal
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      width={860}
      className="settings-modal"
      overlayClassName="settings-overlay"
    >
      <div className="settings-shell">
        <aside className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          {TABS.map((item) => (
            <button
              key={item.id}
              className={cn('settings-tab', tab === item.id && 'active')}
              onClick={() => setTab(item.id)}
            >
              <span className="settings-tab-icon">{item.icon}</span>
              {item.label}
              <ChevronRight size={14} className="settings-tab-arrow" />
            </button>
          ))}
          <div className="settings-nav-footer">
            <ShieldCheck size={14} />
            <span>Your notes never leave this server.</span>
          </div>
        </aside>

        <div className="settings-body">
          {tab === 'ai' && (
            <section className="settings-section">
              <header className="settings-header">
                <div>
                  <h2>Noting AI</h2>
                  <p>
                    Bring your own key. Requests go from your browser through this server straight to
                    the provider you choose, and keys are stored in local storage only.
                  </p>
                </div>
                <div className="settings-badge">
                  <KeyRound size={13} /> BYOK
                </div>
              </header>

              <div className="settings-field">
                <label>Provider</label>
                <div className="provider-grid">
                  {AI_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      className={cn('provider-card', draft.provider === provider.id && 'active')}
                      onClick={() => chooseProvider(provider.id as AIProvider)}
                    >
                      <span className="provider-card-name">{provider.label}</span>
                      <span className="provider-card-url">{provider.baseUrl || 'Custom endpoint'}</span>
                      {draft.provider === provider.id && (
                        <span className="provider-card-check">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="ai-base-url">API base URL</label>
                <input
                  id="ai-base-url"
                  className="text-input"
                  value={draft.baseUrl}
                  onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="ai-key">
                  API key
                  {draft.provider === 'ollama' && <span className="field-hint">optional for local Ollama</span>}
                </label>
                <div className="input-with-action">
                  <input
                    id="ai-key"
                    className="text-input"
                    type={showKey ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(event) => {
                      setDraft({ ...draft, apiKey: event.target.value });
                      setTestResult(null);
                    }}
                    placeholder={draft.provider === 'ollama' ? 'Leave empty for local models' : 'sk-…'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="icon-btn small"
                    onClick={() => setShowKey((value) => !value)}
                    title={showKey ? 'Hide key' : 'Show key'}
                    type="button"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="field-hint">
                  Stored only in this browser. Never written to the database or sent anywhere except
                  your provider.
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="ai-model">Model</label>
                <div className="input-with-action">
                  <input
                    id="ai-model"
                    className="text-input"
                    list="ai-model-list"
                    value={draft.model}
                    onChange={(event) => {
                      setDraft({ ...draft, model: event.target.value });
                      setTestResult(null);
                    }}
                    placeholder={providerMeta.model || 'Model name'}
                    spellCheck={false}
                  />
                  <datalist id="ai-model-list">
                    {models.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  <button
                    className="btn ghost small"
                    onClick={loadModels}
                    disabled={modelsBusy}
                    type="button"
                  >
                    {modelsBusy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                    Load models
                  </button>
                </div>
                {modelsError && <div className="form-error">{modelsError}</div>}
                {!modelsError && models.length > 0 && (
                  <div className="model-chips">
                    {models.slice(0, 12).map((model) => (
                      <button
                        key={model}
                        className={cn('model-chip', draft.model === model && 'active')}
                        onClick={() => setDraft({ ...draft, model })}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label htmlFor="ai-temp">
                  Temperature <span className="field-value">{draft.temperature.toFixed(1)}</span>
                </label>
                <input
                  id="ai-temp"
                  className="range-input"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(event) =>
                    setDraft({ ...draft, temperature: Number(event.target.value) })
                  }
                />
                <div className="range-labels">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              <div className="settings-callout">
                <Zap size={16} />
                <div>
                  <strong>How requests flow</strong>
                  <span>
                    Noting sends your key and prompt to its local proxy, which forwards them to the
                    provider and streams the reply back. Nothing is logged or stored on the server.
                  </span>
                </div>
              </div>

              {testResult && (
                <div className={cn('settings-test', testResult)}>
                  {testResult === 'ok' ? <Check size={15} /> : <Info size={15} />}
                  <span>{testMessage}</span>
                </div>
              )}

              <div className="settings-actions">
                <button className="btn ghost" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  Test connection
                </button>
                <div className="settings-actions-right">
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setDraft(aiConfig);
                      setTestResult(null);
                    }}
                    disabled={!dirty}
                  >
                    Reset
                  </button>
                  <button className="btn primary" onClick={saveAI}>
                    Save AI settings
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === 'appearance' && (
            <section className="settings-section">
              <header className="settings-header">
                <div>
                  <h2>Appearance</h2>
                  <p>Choose how Noting looks on this device. Your preference is saved in the browser.</p>
                </div>
              </header>

              <div className="settings-field">
                <label>Theme</label>
                <div className="theme-grid">
                  {themeOptions.map((option) => (
                    <button
                      key={option.id}
                      className={cn('theme-card', theme === option.id && 'active')}
                      onClick={() => setTheme(option.id)}
                    >
                      <span className={cn('theme-preview', option.id)}>
                        <span className="theme-preview-sidebar" />
                        <span className="theme-preview-body">
                          <span />
                          <span />
                          <span />
                        </span>
                      </span>
                      <span className="theme-card-copy">
                        <span className="theme-card-label">
                          {option.icon}
                          {option.label}
                        </span>
                        <span className="theme-card-description">{option.description}</span>
                      </span>
                      {theme === option.id && (
                        <span className="theme-card-check">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-callout">
                <Monitor size={16} />
                <div>
                  <strong>System theme</strong>
                  <span>
                    When set to System, Noting follows your operating system and switches
                    automatically when it changes.
                  </span>
                </div>
              </div>
            </section>
          )}

          {tab === 'workspace' && (
            <section className="settings-section">
              <header className="settings-header">
                <div>
                  <h2>Workspace</h2>
                  <p>Rename your workspace and review what lives inside it.</p>
                </div>
              </header>

              <div className="settings-field">
                <label htmlFor="workspace-name">Workspace name</label>
                <div className="input-with-action">
                  <input
                    id="workspace-name"
                    className="text-input"
                    value={workspaceDraft}
                    onChange={(event) => setWorkspaceDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveWorkspace();
                    }}
                    maxLength={80}
                  />
                  <button
                    className="btn primary small"
                    onClick={saveWorkspace}
                    disabled={savingWorkspace || !workspaceDraft.trim()}
                  >
                    {savingWorkspace ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                    Save
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">
                    <FileText size={18} />
                  </div>
                  <div className="stat-value">{stats.pages}</div>
                  <div className="stat-label">Pages</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <Database size={18} />
                  </div>
                  <div className="stat-value">{stats.databases}</div>
                  <div className="stat-label">Databases</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <Heart size={18} />
                  </div>
                  <div className="stat-value">{stats.favorites}</div>
                  <div className="stat-label">Favorites</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <Trash2 size={18} />
                  </div>
                  <div className="stat-value">{trashCount}</div>
                  <div className="stat-label">In trash</div>
                </div>
              </div>

              <div className="settings-callout">
                <Users size={16} />
                <div>
                  <strong>Single-user, self-hosted</strong>
                  <span>
                    Noting is a personal workspace. Add a password with the{' '}
                    <code>NOTING_PASSWORD</code> environment variable to protect it when hosting
                    publicly.
                  </span>
                </div>
              </div>

              <div className="settings-info-row">
                <Settings2 size={15} />
                <div>
                  <strong>Backups</strong>
                  <span>
                    Everything lives in <code>data/</code> next to the app: the SQLite database and
                    uploaded images. Copy that folder to back up your workspace.
                  </span>
                </div>
              </div>
            </section>
          )}

          {tab === 'about' && (
            <section className="settings-section">
              <header className="settings-header">
                <div>
                  <h2>About Noting</h2>
                  <p>A private, self-hosted home for your notes, docs, and databases.</p>
                </div>
              </header>

              <div className="about-hero">
                <div className="about-logo">
                  <span>N</span>
                  <Sparkles size={14} />
                </div>
                <div>
                  <strong>Noting</strong>
                  <span>Version 0.1.0 · Apache-2.0</span>
                </div>
              </div>

              <div className="about-features">
                <div>
                  <FileText size={16} />
                  <span>Block editor with nesting, toggles, and markdown shortcuts</span>
                </div>
                <div>
                  <Database size={16} />
                  <span>Tables and boards with inline properties and drag-and-drop</span>
                </div>
                <div>
                  <Sparkles size={16} />
                  <span>Bring-your-own-key AI that can write into your pages</span>
                </div>
                <div>
                  <ShieldCheck size={16} />
                  <span>Your data stays in a local SQLite file you own</span>
                </div>
              </div>

              <div className="about-links">
                <button
                  className="btn ghost"
                  onClick={() =>
                    window.open('https://github.com', '_blank', 'noopener,noreferrer')
                  }
                >
                  <Github size={15} /> Source
                </button>
                <button className="btn ghost" onClick={() => setTab('ai')}>
                  <KeyRound size={15} /> Configure AI
                </button>
              </div>

              <div className="settings-callout">
                <Heart size={16} />
                <div>
                  <strong>Built to be owned</strong>
                  <span>
                    No accounts, no subscriptions, no telemetry. Fork it, extend it, and keep your
                    workspace for as long as you want.
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
