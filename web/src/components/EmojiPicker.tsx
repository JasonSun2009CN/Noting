import { useMemo, useState } from 'react';
import { Shuffle, Trash2 } from 'lucide-react';
import { EMOJI_GROUPS, cn } from '../lib/utils';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
  className?: string;
}

export default function EmojiPicker({ onSelect, onRemove, className }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Smileys');

  const groups = useMemo(() => {
    if (!query.trim()) return EMOJI_GROUPS;
    const lower = query.toLowerCase();
    return EMOJI_GROUPS.map((item) => ({
      ...item,
      emojis: item.emojis.filter((emoji) => emoji.includes(query) || item.label.toLowerCase().includes(lower)),
    })).filter((item) => item.emojis.length);
  }, [query]);

  const visible = query.trim() ? groups : groups.filter((item) => item.label === group);

  return (
    <div className={cn('emoji-picker', className)}>
      <div className="emoji-search">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji…"
          aria-label="Search emoji"
        />
        <button
          className="icon-btn small"
          title="Surprise me"
          onClick={() => {
            const all = EMOJI_GROUPS.flatMap((item) => item.emojis);
            onSelect(all[Math.floor(Math.random() * all.length)]);
          }}
        >
          <Shuffle size={14} />
        </button>
      </div>
      {!query.trim() && (
        <div className="emoji-tabs">
          {EMOJI_GROUPS.map((item) => (
            <button
              key={item.label}
              className={cn('emoji-tab', group === item.label && 'active')}
              onClick={() => setGroup(item.label)}
            >
              {item.emojis[0]}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-scroll">
        {visible.map((item) => (
          <div key={item.label} className="emoji-group">
            <div className="emoji-group-label">{item.label}</div>
            <div className="emoji-grid">
              {item.emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  className="emoji-cell"
                  onClick={() => onSelect(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {onRemove && (
        <button className="emoji-remove" onClick={onRemove}>
          <Trash2 size={14} /> Remove icon
        </button>
      )}
    </div>
  );
}
