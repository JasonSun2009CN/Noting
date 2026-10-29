import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start';

interface PopoverProps {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  placement?: Placement;
  gap?: number;
  matchWidth?: boolean;
  minWidth?: number;
}

export default function Popover({
  open,
  anchor,
  onClose,
  children,
  className = '',
  placement = 'bottom-start',
  gap = 6,
  matchWidth = false,
  minWidth,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    ready: boolean;
    maxHeight?: number;
  }>({
    top: 0,
    left: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!open || !anchor || !popoverRef.current) return;
    const margin = 8;
    const place = () => {
      if (!anchor || !popoverRef.current) return;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const width = matchWidth ? anchorRect.width : popoverRect.width;
      const height = popoverRect.height;
      let left = placement.endsWith('end') ? anchorRect.right - width : anchorRect.left;
      let top = anchorRect.bottom + gap;
      if (placement.startsWith('top')) top = anchorRect.top - height - gap;
      if (placement === 'right-start') {
        left = anchorRect.right + gap;
        top = anchorRect.top;
      }

      // Flip above the anchor when the menu would overflow the viewport.
      if (placement.startsWith('bottom') && top + height > window.innerHeight - margin) {
        const above = anchorRect.top - height - gap;
        if (above >= margin) top = above;
      } else if (placement.startsWith('top') && top < margin) {
        const below = anchorRect.bottom + gap;
        if (below + height <= window.innerHeight - margin) top = below;
      }

      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      const maxHeight = Math.max(160, window.innerHeight - top - margin);
      setPosition({ top, left, ready: true, maxHeight });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popoverRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, placement, gap, matchWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchor]);

  useEffect(() => {
    if (!open) setPosition((current) => ({ ...current, ready: false }));
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`popover ${className}`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        minWidth: matchWidth && anchor ? anchor.getBoundingClientRect().width : minWidth,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
      data-popover
    >
      {children}
    </div>,
    document.body
  );
}
