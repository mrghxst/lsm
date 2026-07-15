import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

// Shared sheet chrome: a bottom sheet on phones, a centered dialog on
// desktop (see index.css). A tall sheet can cover the whole phone screen
// and leave no backdrop to tap, so it must always offer more ways out:
// the ✕ button, dragging the top area down, and the Escape key.
const DISMISS_DRAG_PX = 70;

export function Sheet({
  title,
  meta,
  className,
  onClose,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ id: number; startY: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function grabDown(e: ReactPointerEvent) {
    // Buttons in the draggable header must keep their own pointer sequence.
    // Capturing a press that starts on Close retargets its click to the grab
    // area in Chromium, leaving a dialog that looks dismissible but is not.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    drag.current = { id: e.pointerId, startY: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events may not carry a real pointer
    }
  }

  function grabMove(e: ReactPointerEvent) {
    if (drag.current?.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  }

  function grabUp(e: ReactPointerEvent) {
    if (drag.current?.id !== e.pointerId) return;
    const dy = e.clientY - drag.current.startY;
    drag.current = null;
    if (dy > DISMISS_DRAG_PX) onClose();
    else setDragY(0);
  }

  function grabCancel() {
    drag.current = null;
    setDragY(0);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={className ? `sheet ${className}` : 'sheet'}
        onClick={(e) => e.stopPropagation()}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-grab"
          onPointerDown={grabDown}
          onPointerMove={grabMove}
          onPointerUp={grabUp}
          onPointerCancel={grabCancel}
        >
          <div className="sheet-handle" />
          <div className="sheet-head">
            <h2>{title}</h2>
            {meta}
            <button className="sheet-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
