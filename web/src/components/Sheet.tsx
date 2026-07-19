import { useEffect, useId, useRef, useState } from 'react';
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
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = dialog.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(
        '[autofocus], button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panel).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, []);

  function grabDown(e: ReactPointerEvent) {
    // Interactive elements in the draggable header must keep their own
    // pointer sequence. Capturing a press that starts on one of them
    // retargets its click to the grab area in Chromium, leaving a control
    // that looks clickable but is not.
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
        ref={dialog}
        className={className ? `sheet ${className}` : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
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
            <h2 id={titleId}>{title}</h2>
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
