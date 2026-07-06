import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Claim, Table } from '../types';

function clamp(v: number) {
  return Math.min(0.94, Math.max(0.06, v));
}

function Segment({ claim, mine }: { claim: Claim | undefined; mine: boolean }) {
  if (!claim) return <div className="segment empty" />;
  const style =
    claim.status === 'arrived'
      ? { background: claim.color }
      : { background: `${claim.color}38`, boxShadow: `inset 0 0 0 2px ${claim.color}` };
  return (
    <div className={`segment${mine ? ' mine-seat' : ''}`} style={style}>
      <span>{(claim.guestName ?? claim.username).slice(0, 2)}</span>
    </div>
  );
}

interface DragInfo {
  id: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
}

export function Room({
  tables,
  currentUserId,
  canArrange,
  onTap,
  onMove,
}: {
  tables: Table[];
  currentUserId: number;
  canArrange: boolean;
  onTap(id: number): void;
  onMove(id: number, x: number, y: number): void;
}) {
  const roomRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const [live, setLive] = useState<{ id: number; x: number; y: number } | null>(null);

  function finalPos(d: DragInfo, e: ReactPointerEvent) {
    const rect = roomRef.current!.getBoundingClientRect();
    return {
      x: clamp(d.origX + (e.clientX - d.startX) / rect.width),
      y: clamp(d.origY + (e.clientY - d.startY) / rect.height),
    };
  }

  function onPointerDown(e: ReactPointerEvent, t: Table) {
    dragRef.current = { id: t.id, startX: e.clientX, startY: e.clientY, origX: t.x, origY: t.y, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events may not carry a real pointer
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || !roomRef.current) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
      if (!canArrange) return; // only the owner rearranges tables
      d.moved = true;
    }
    setLive({ id: d.id, ...finalPos(d, e) });
  }

  function onPointerUp(e: ReactPointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const pos = finalPos(d, e);
      onMove(d.id, pos.x, pos.y);
    } else {
      onTap(d.id);
    }
    setLive(null);
  }

  function onPointerCancel() {
    dragRef.current = null;
    setLive(null);
  }

  return (
    <div className="room" ref={roomRef}>
      {tables.map((t) => {
        const pos = live?.id === t.id ? live : { x: t.x, y: t.y };
        const horizontal = t.rot === 0;
        const mine = t.claims.some((c) => c.userId === currentUserId && !c.guestName);
        return (
          <div
            key={t.id}
            className={
              'rtable' +
              (mine ? ' mine' : '') +
              (t.released ? ' released' : '') +
              (live?.id === t.id ? ' dragging' : '')
            }
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: horizontal ? '40%' : '20%',
              aspectRatio: horizontal ? '2 / 1' : '1 / 2',
              touchAction: canArrange ? 'none' : undefined,
            }}
            onPointerDown={(e) => onPointerDown(e, t)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <span className="rtable-tag">{t.label}</span>
            {t.released ? (
              <span className="rtable-released">given back</span>
            ) : (
              <div className={`segments ${horizontal ? 'srow' : 'scol'}`}>
                {Array.from({ length: t.capacity }, (_, i) => (
                  <Segment
                    key={i}
                    claim={t.claims[i]}
                    mine={t.claims[i]?.userId === currentUserId && !t.claims[i]?.guestName}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
