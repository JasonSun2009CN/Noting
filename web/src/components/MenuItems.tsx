import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface MenuItemProps {
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  className?: string;
}

export function MenuItem({
  icon,
  label,
  onClick,
  danger,
  shortcut,
  active,
  disabled,
  trailing,
  className,
}: MenuItemProps) {
  return (
    <button
      type="button"
      className={cn('menu-item', danger && 'danger', active && 'active', className)}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
      {trailing}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label-text">{children}</div>;
}
