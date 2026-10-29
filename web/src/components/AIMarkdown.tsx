import type { ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('~~') && token.endsWith('~~')) {
      return <s key={key}>{token.slice(2, -2)}</s>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={key}>{token.slice(1, -1)}</code>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const safe = /^(https?:|mailto:)/i.test(link[2]);
      return safe ? (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      ) : (
        <span key={key}>{link[1]}</span>
      );
    }
    return <span key={key}>{token}</span>;
  });
}

/** Safe, dependency-free Markdown renderer for AI messages. */
export default function AIMarkdown({ content }: { content: string }) {
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const output: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let codeLang = '';

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li key={`li-${output.length}-${index}`}>{renderInline(item, `l-${output.length}-${index}`)}</li>
    ));
    output.push(list.ordered ? <ol key={`ol-${output.length}`}>{items}</ol> : <ul key={`ul-${output.length}`}>{items}</ul>);
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (code) {
        output.push(
          <pre key={`code-${i}`}>
            <code>{code.join('\n')}</code>
          </pre>
        );
        code = null;
        codeLang = '';
      } else {
        flushList();
        code = [];
        codeLang = fence[1].trim();
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = renderInline(heading[2], `h-${i}`);
      if (level === 1) output.push(<h2 key={`h-${i}`}>{text}</h2>);
      else if (level === 2) output.push(<h3 key={`h-${i}`}>{text}</h3>);
      else output.push(<h4 key={`h-${i}`}>{text}</h4>);
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) flushList();
      list = list && !list.ordered ? list : { ordered: false, items: [] };
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (!list || !list.ordered) flushList();
      list = list && list.ordered ? list : { ordered: true, items: [] };
      list.items.push(numbered[1]);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushList();
      output.push(<blockquote key={`q-${i}`}>{renderInline(quote[1], `q-${i}`)}</blockquote>);
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushList();
      output.push(<hr key={`hr-${i}`} />);
      continue;
    }
    flushList();
    output.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>);
  }
  flushList();
  if (code) {
    output.push(
      <pre key="code-final">
        <code>{code.join('\n')}</code>
      </pre>
    );
  }

  return <div className="ai-markdown">{output}</div>;
}
