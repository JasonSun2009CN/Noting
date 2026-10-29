import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  Languages,
  Lightbulb,
  ListChecks,
  Loader2,
  PenLine,
  Send,
  Settings2,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { api } from '../api';
import type { AIChatMessage, Page } from '../types';
import { cn, copyText, uid } from '../lib/utils';
import PageIcon from './PageIcon';
import AIMarkdown from './AIMarkdown';

interface AIPanelProps {
  page: Page;
  contextText: string;
  onInsert?: (markdown: string) => void;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

let lastHandledSeed = 0;

const SUGGESTIONS = [
  {
    icon: <FileText size={15} />,
    label: 'Summarize this page',
    prompt: 'Summarize this page in a short, skimmable outline. Highlight the most important ideas.',
  },
  {
    icon: <PenLine size={15} />,
    label: 'Continue writing',
    prompt: 'Continue writing this page in the same voice, structure, and level of detail.',
  },
  {
    icon: <ListChecks size={15} />,
    label: 'Find action items',
    prompt: 'Extract every action item, decision, or open question from this page as a checklist.',
  },
  {
    icon: <Wand2 size={15} />,
    label: 'Improve the writing',
    prompt: 'Improve the writing on this page. Fix clarity, flow, and grammar without changing the meaning. Return the improved version.',
  },
  {
    icon: <Lightbulb size={15} />,
    label: 'Brainstorm ideas',
    prompt: 'Brainstorm five specific, non-obvious ideas related to this page. Explain each in one sentence.',
  },
  {
    icon: <Languages size={15} />,
    label: 'Translate to Chinese',
    prompt: 'Translate this page into natural, fluent Simplified Chinese. Return only the translation.',
  },
];

function buildSystemPrompt(page: Page, contextText: string) {
  const context = contextText.trim().slice(0, 14_000) || 'This page is currently empty.';
  return `You are Noting AI, a thoughtful writing and thinking partner embedded in a private, self-hosted Notion-like workspace. Respond in the same language the user writes in. Be direct, practical, and grounded in the page context. Use Markdown for structure. Never invent facts about the user. When asked to write or edit, return ready-to-use text without preamble.

CURRENT PAGE
Title: ${page.title?.trim() || 'Untitled'}
Kind: ${page.type === 'database' ? 'Database' : 'Page'}
---
${context}`;
}

export default function AIPanel({ page, contextText, onInsert }: AIPanelProps) {
  const { aiConfig, setSettingsOpen, setAIOpen, aiSeed, toast } = useApp();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const needsKey = aiConfig.provider !== 'ollama' && !aiConfig.apiKey;
  const needsModel = !aiConfig.model.trim();

  const send = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || isStreaming) return;
    if (needsKey || needsModel) {
      toast(
        needsKey ? 'Add your API key to start using Noting AI.' : 'Choose a model in AI settings.',
        'error'
      );
      setSettingsOpen(true);
      return;
    }

    const history: AIChatMessage[] = [
      ...messages
        .filter((message) => message.content.trim())
        .map((message) => ({ role: message.role, content: message.content })),
      { role: 'user', content: prompt },
    ];

    const assistantId = uid();
    setMessages((current) => [
      ...current,
      { id: uid(), role: 'user', content: prompt },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setError('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const system = buildSystemPrompt(page, contextText);
    let didReceive = false;

    const append = (text: string) => {
      if (!text) return;
      didReceive = true;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: message.content + text } : message
        )
      );
    };

    try {
      const response = await api.aiChat(aiConfig, history, system, controller.signal);
      if (!response.body) throw new Error('The provider returned an empty response.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(decoder.decode(value, { stream: true }));
      }
      append(decoder.decode());
      if (!didReceive) {
        setError('The provider returned an empty response. Try a different model.');
        setMessages((current) => current.filter((message) => message.id !== assistantId));
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.filter((message) => !(message.id === assistantId && !message.content.trim()))
        );
      } else {
        setError(err instanceof Error ? err.message : 'The AI request failed.');
        setMessages((current) =>
          current.filter((message) => !(message.id === assistantId && !message.content.trim()))
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  sendRef.current = send;

  useEffect(() => {
    if (!aiSeed || aiSeed.nonce <= lastHandledSeed) return;
    lastHandledSeed = aiSeed.nonce;
    if (aiSeed.prompt) setInput(aiSeed.prompt);
    if (aiSeed.autoSend && aiSeed.prompt) {
      window.setTimeout(() => {
        void sendRef.current(aiSeed.prompt);
      }, 80);
    }
  }, [aiSeed]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [input]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const insert = (message: ChatEntry) => {
    if (!onInsert) return;
    onInsert(message.content);
    setInsertedId(message.id);
    window.setTimeout(() => setInsertedId(null), 1800);
  };

  return (
    <aside className="ai-panel" aria-label="Noting AI">
      <header className="ai-header">
        <div className="ai-title">
          <span className="ai-orb small">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>Noting AI</strong>
            <span>Your notes, your key</span>
          </div>
        </div>
        <button className="icon-btn" onClick={() => setAIOpen(false)} title="Close AI panel">
          <X size={17} />
        </button>
      </header>

      <div className="ai-context-chip">
        <PageIcon page={page} size={14} />
        <span className="ai-context-title">{page.title?.trim() || 'Untitled'}</span>
        <span className="ai-context-kind">{page.type === 'database' ? 'Database' : 'Page'}</span>
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-welcome">
            <div className="ai-orb">
              <Sparkles size={22} />
            </div>
            <h2>How can I help?</h2>
            <p>
              I can summarize this page, draft new sections, find action items, or think through an
              idea with you.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  className="ai-suggestion"
                  onClick={() => void send(suggestion.prompt)}
                >
                  <span className="ai-suggestion-icon">{suggestion.icon}</span>
                  <span>{suggestion.label}</span>
                </button>
              ))}
            </div>
            {(needsKey || needsModel) && (
              <div className="ai-setup">
                <div>
                  <strong>Connect your AI</strong>
                  <span>
                    {needsKey
                      ? 'Add an API key for OpenAI, Anthropic, DeepSeek, or any compatible endpoint.'
                      : 'Pick a model to use with your provider.'}
                  </span>
                </div>
                <button className="btn primary small" onClick={() => setSettingsOpen(true)}>
                  Open AI settings
                </button>
              </div>
            )}
            {!needsKey && !needsModel && (
              <div className="ai-privacy">
                <span className="privacy-dot" />
                Using <strong>{aiConfig.model}</strong> with your own key
              </div>
            )}
          </div>
        )}

        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="ai-message user">
              <div className="ai-user-bubble">{message.content}</div>
            </div>
          ) : (
            <div key={message.id} className="ai-message assistant">
              <div className="ai-assistant-avatar">
                <Sparkles size={13} />
              </div>
              <div className="ai-assistant-body">
                {message.content ? (
                  <AIMarkdown content={message.content} />
                ) : (
                  <div className="ai-thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                {message.content && !isStreaming && (
                  <div className="ai-message-actions">
                    <button
                      onClick={() => copyText(message.content)}
                      title="Copy response"
                    >
                      <Copy size={13} /> Copy
                    </button>
                    {onInsert ? (
                      <button
                        onClick={() => insert(message)}
                        title="Insert into this page"
                      >
                        {insertedId === message.id ? <Check size={13} /> : <PenLine size={13} />}
                        {insertedId === message.id ? 'Inserted' : 'Insert'}
                      </button>
                    ) : (
                      <span className="ai-insert-hint">Open a page to insert</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {error && (
          <div className="ai-error">
            <AlertCircle size={16} />
            <div>
              <strong>Something went wrong</strong>
              <span>{error}</span>
              <button
                className="link-button"
                onClick={() => {
                  setError('');
                  setSettingsOpen(true);
                }}
              >
                Check AI settings
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={cn('ai-composer', isStreaming && 'streaming')}>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          placeholder={isStreaming ? 'Noting AI is writing…' : 'Ask anything about this page…'}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="ai-composer-footer">
          <div className="ai-composer-meta">
            <button
              className="ai-model-button"
              onClick={() => setSettingsOpen(true)}
              title="AI settings"
            >
              <Settings2 size={13} />
              <span>{aiConfig.model || 'Choose a model'}</span>
            </button>
            <span className="ai-own-key">BYOK</span>
          </div>
          {isStreaming ? (
            <button className="ai-send stop" onClick={stop} title="Stop generating">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              className="ai-send"
              onClick={() => void send(input)}
              disabled={!input.trim()}
              title="Send"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="ai-footer-hint">
        <Sparkles size={11} />
        {onInsert ? 'Responses can be inserted into your page' : 'Copy responses into your database'}
      </div>
    </aside>
  );
}
