import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface SlashItem {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  group: string;
  keywords?: string[];
  action: () => void;
}

interface SlashMenuProps {
  items: SlashItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashItem) => void;
  query: string;
}

export default function SlashMenu({ items, activeIndex, onHover, onSelect, query }: SlashMenuProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!items.length) {
    return (
      <div className="slash-menu">
        <div className="slash-empty">No results for “{query}”</div>
      </div>
    );
  }

  let lastGroup = '';
  return (
    <div className="slash-menu">
      <div className="slash-hint">Basic blocks</div>
      {items.map((item, index) => {
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.id}>
            {showGroup && index > 0 && <div className="slash-group">{item.group}</div>}
            <button
              ref={index === activeIndex ? activeRef : undefined}
              className={cn('slash-item', index === activeIndex && 'active')}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
            >
              <span className="slash-icon">{item.icon}</span>
              <span className="slash-copy">
                <span className="slash-label">{item.label}</span>
                {item.description && <span className="slash-description">{item.description}</span>}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
