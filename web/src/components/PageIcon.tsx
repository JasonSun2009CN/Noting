import { Database, FileText, Image as ImageIcon } from 'lucide-react';
import type { Page } from '../types';

interface PageIconProps {
  page: Pick<Page, 'icon' | 'type'>;
  size?: number;
  className?: string;
}

export default function PageIcon({ page, size = 18, className = '' }: PageIconProps) {
  if (page.icon?.startsWith('http') || page.icon?.startsWith('/uploads/')) {
    return (
      <img
        className={`page-emoji page-image-icon ${className}`}
        style={{ width: size, height: size }}
        src={page.icon}
        alt=""
        loading="lazy"
      />
    );
  }
  if (page.icon) {
    return (
      <span
        className={`page-emoji ${className}`}
        style={{ fontSize: Math.round(size * 0.92), width: size, height: size }}
        aria-hidden
      >
        {page.icon}
      </span>
    );
  }
  const Icon = page.type === 'database' ? Database : FileText;
  return (
    <span className={`page-emoji page-emoji-placeholder ${className}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.82)} strokeWidth={1.8} />
    </span>
  );
}

export function PageCoverThumb({ page, size = 18 }: PageIconProps) {
  if (page.icon?.startsWith('http') || page.icon?.startsWith('/uploads/')) {
    return <img src={page.icon} width={size} height={size} alt="" style={{ borderRadius: 4 }} />;
  }
  if (page.icon) return <span style={{ fontSize: size }}>{page.icon}</span>;
  return page.type === 'database' ? <Database size={size} /> : <FileText size={size} />;
}

export function MediaIcon() {
  return <ImageIcon size={16} />;
}
