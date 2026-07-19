import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { Claim, Table } from '../types';
import { claimColor, etaLabel, formatDuration } from '../util';
import { useNowMinute } from '../useNow';

// The virtual room is CANVAS x the viewport in each dimension; the default
// view (scale = MIN_SCALE) shows all of it.
const CANVAS = 2;
const MIN_SCALE = 1 / CANVAS;
const MAX_SCALE = 3;
const FIT_VIEW = { scale: MIN_SCALE, tx: 0, ty: 0 };

// Tables snap to a 32x32 board of half-table cells (keep in sync with
// server/db.js): a table covers 2x1 cells, rotated 1x2, so snapped
// tables sit flush against each other.
const GRID_CELL = 1 / 32;
const CELLS = 32;

// The canvas shows a square *window* of that board: the smallest square
// keeping at least FRAME_CELLS empty grid squares between the outermost
// tables and every edge. A lone table or two-table column yields the
// classic 8-squares-across room; wider blocks get a slightly bigger one.
const FRAME_CELLS = 3;
const HOME_SIDE = 8;

interface Placement {
  leftCell: number;
  topCell: number;
  wc: number;
  hc: number;
}

function tablePlacement(x: number, y: number, rot: 0 | 90): Placement {
  const wc = rot === 0 ? 2 : 1;
  const hc = rot === 0 ? 1 : 2;
  return {
    leftCell: Math.min(CELLS - wc, Math.max(0, Math.round(x / GRID_CELL - wc / 2))),
    topCell: Math.min(CELLS - hc, Math.max(0, Math.round(y / GRID_CELL - hc / 2))),
    wc,
    hc,
  };
}

function placementsOverlap(a: Placement, b: Placement) {
  return a.leftCell < b.leftCell + b.wc && b.leftCell < a.leftCell + a.wc &&
    a.topCell < b.topCell + b.hc && b.topCell < a.topCell + a.hc;
}

function placementCenter(p: Placement) {
  return { x: (p.leftCell + p.wc / 2) * GRID_CELL, y: (p.topCell + p.hc / 2) * GRID_CELL };
}

function snapPos(x: number, y: number, rot: 0 | 90) {
  return placementCenter(tablePlacement(x, y, rot));
}

// Where a dropped table actually lands (mirrors server/db.js): the
// snapped cell if free, else the nearest free spot at most one cell
// away, else null — the drop is refused.
function findFreeSpot(x: number, y: number, rot: 0 | 90, others: Placement[]) {
  const desired = tablePlacement(x, y, rot);
  let best: { x: number; y: number; dist: number } | null = null;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cand: Placement = {
        leftCell: Math.min(CELLS - desired.wc, Math.max(0, desired.leftCell + dx)),
        topCell: Math.min(CELLS - desired.hc, Math.max(0, desired.topCell + dy)),
        wc: desired.wc,
        hc: desired.hc,
      };
      if (others.some((o) => placementsOverlap(cand, o))) continue;
      const c = placementCenter(cand);
      const dist = Math.hypot(c.x - x, c.y - y);
      if (!best || dist < best.dist) best = { ...c, dist };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function otherPlacements(tables: Table[], excludeId: number): Placement[] {
  return tables.filter((t) => t.id !== excludeId).map((t) => tablePlacement(t.x, t.y, t.rot));
}

interface Win {
  c0: number; // leftmost board cell shown (may be a half cell for centring)
  r0: number;
  side: number; // window size in cells; the canvas shows side x side squares
}

// What the canvas actually shows. The framing above is reasoned about as a
// square (it is the block plus its air, and it is what the camera maths
// scales by), but the room element is rarely square — on a desktop it is a
// wide rectangle. Stretching the square window across it would make a cell
// wider than it is tall, and a table takes its width from one axis and its
// height from the other, so its two halves would disagree and tables would
// stop meeting flush.
//
// Instead the window keeps square CELLS and gets more of them along the
// room's longer axis: the square is preserved on the short axis and the long
// axis is padded with extra board, centred. cellPx = roomW/sideX = roomH/sideY
// by construction, so a cell is square at any room shape.
interface DisplayWin {
  c0: number;
  r0: number;
  sideX: number;
  sideY: number;
}

function displayWin(win: Win, aspect: number): DisplayWin {
  const kx = Math.max(1, aspect);
  const ky = Math.max(1, 1 / aspect);
  const sideX = win.side * kx;
  const sideY = win.side * ky;
  return {
    c0: win.c0 - (sideX - win.side) / 2,
    r0: win.r0 - (sideY - win.side) / 2,
    sideX,
    sideY,
  };
}

const HOME_WIN: Win = { c0: (CELLS - HOME_SIDE) / 2, r0: (CELLS - HOME_SIDE) / 2, side: HOME_SIDE };

// The smallest square window with FRAME_CELLS of air on every side of the
// block, centred on it. Only one axis can need fractional centring (the
// other has exactly FRAME_CELLS on both sides), so the split stays
// symmetric down to the half cell.
function windowFor(tables: Table[]): Win {
  if (tables.length === 0) return HOME_WIN;
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (const t of tables) {
    const p = tablePlacement(t.x, t.y, t.rot);
    minC = Math.min(minC, p.leftCell);
    minR = Math.min(minR, p.topCell);
    maxC = Math.max(maxC, p.leftCell + p.wc);
    maxR = Math.max(maxR, p.topCell + p.hc);
  }
  const side = Math.min(CELLS, Math.max(maxC - minC, maxR - minR) + FRAME_CELLS * 2);
  const c0 = Math.max(0, Math.min(CELLS - side, minC - (side - (maxC - minC)) / 2));
  const r0 = Math.max(0, Math.min(CELLS - side, minR - (side - (maxR - minR)) / 2));
  return { c0, r0, side };
}

const sameWin = (a: Win, b: Win) => a.c0 === b.c0 && a.r0 === b.r0 && a.side === b.side;

// The smallest square window containing both — used to grow the canvas
// without ever pulling it out from under someone's camera.
function unionWin(a: Win, b: Win): Win {
  const c0 = Math.min(a.c0, b.c0);
  const r0 = Math.min(a.r0, b.r0);
  const side = Math.min(
    CELLS,
    Math.max(Math.max(a.c0 + a.side, b.c0 + b.side) - c0, Math.max(a.r0 + a.side, b.r0 + b.side) - r0),
  );
  return {
    c0: Math.max(0, Math.min(CELLS - side, c0)),
    r0: Math.max(0, Math.min(CELLS - side, r0)),
    side,
  };
}

const idsOf = (ts: Table[]) => ts.map((t) => t.id).sort((a, b) => a - b).join(',');

// board fraction -> % of the canvas (which shows exactly the window)
function winLeft(d: DisplayWin, bx: number) {
  return ((bx * CELLS - d.c0) / d.sideX) * 100;
}

function winTop(d: DisplayWin, by: number) {
  return ((by * CELLS - d.r0) / d.sideY) * 100;
}

// Keep a dragged table fully inside the visible window — and on the board,
// since a wide window can show space past the board's edge.
function clampToWin(x: number, y: number, rot: 0 | 90, d: DisplayWin) {
  const hw = (rot === 0 ? 1 : 0.5) * GRID_CELL;
  const hh = (rot === 0 ? 0.5 : 1) * GRID_CELL;
  const left = Math.max(0, d.c0) * GRID_CELL;
  const right = Math.min(CELLS, d.c0 + d.sideX) * GRID_CELL;
  const top = Math.max(0, d.r0) * GRID_CELL;
  const bottom = Math.min(CELLS, d.r0 + d.sideY) * GRID_CELL;
  return {
    x: Math.min(right - hw, Math.max(left + hw, x)),
    y: Math.min(bottom - hh, Math.max(top + hh, y)),
  };
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

// Keep the canvas covering the viewport: translation may never expose
// space beyond the room's edges.
function clampView(view: View, w: number, h: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  return {
    scale,
    tx: Math.min(0, Math.max(w * (1 - CANVAS * scale), view.tx)),
    ty: Math.min(0, Math.max(h * (1 - CANVAS * scale), view.ty)),
  };
}

// A seat label picks the fullest form that fits its compartment on one
// line, without ever changing the font: full name, else the first word
// (for multi-word names), else the first three letters, else two. All
// forms share the one fixed 15px weight so seats read uniformly. Because
// both the box and the font live inside the scaled canvas, this fit is
// the same at any zoom, so it only needs recomputing when the box's own
// (unscaled) size changes — capacity, orientation, or the framing.
const labelCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const labelCtx = labelCanvas ? labelCanvas.getContext('2d') : null;
let labelFont = '';

function fontOf(el: HTMLElement) {
  if (!labelFont) {
    const cs = getComputedStyle(el);
    labelFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  }
  return labelFont;
}

function fitLabel(name: string, maxW: number): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  const first = clean.split(' ')[0] || clean;
  const forms = [clean];
  if (first && first !== clean) forms.push(first); // drop surname first
  forms.push(first.slice(0, 3), first.slice(0, 2));
  const seen = new Set<string>();
  const uniq = forms.filter((f) => f.length > 0 && !seen.has(f) && (seen.add(f), true));
  const shortest = uniq[uniq.length - 1] ?? clean.slice(0, 2);
  if (!labelCtx) return shortest;
  for (const f of uniq) {
    if (labelCtx.measureText(f).width <= maxW) return f;
  }
  return shortest; // two letters, shown even if the seat is very tight
}

function SeatLabel({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(name);
  useLayoutEffect(() => {
    const span = ref.current;
    const box = span?.parentElement;
    if (!span || !box) return;
    const recompute = () => {
      if (labelCtx) labelCtx.font = fontOf(span);
      setText(fitLabel(name, Math.max(0, box.clientWidth - 8)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(box);
    return () => ro.disconnect();
  }, [name]);
  return (
    <span className="seat-name" ref={ref}>
      {text}
    </span>
  );
}

// The seat's own one-liner: how long they've been sitting there, or when
// they're due. CSS hides it when the seat is too small to hold two lines.
function seatSub(claim: Claim, now: number): string {
  if (claim.status !== 'arrived') return etaLabel(claim.eta);
  return claim.arrivedAt ? formatDuration(claim.arrivedAt, now) : 'here';
}

function Segment({
  claim,
  mine,
  now,
  ariaLabel,
  onActivate,
}: {
  claim: Claim | undefined;
  mine: boolean;
  now: number;
  ariaLabel: string;
  onActivate(): void;
}) {
  const keyboardActivate = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Pointer selection is handled by the draggable table so it can resolve
    // the compartment under the finger. Native keyboard/screen-reader clicks
    // have detail=0 and use this direct path instead.
    if (event.detail === 0) onActivate();
  };
  const keyboardKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };
  if (!claim) {
    return (
      <button
        type="button"
        className="segment empty"
        aria-label={ariaLabel}
        onClick={keyboardActivate}
        onKeyDown={keyboardKeyDown}
      >
        <span className="seat-name">free</span>
      </button>
    );
  }
  const color = claimColor(claim);
  const arrived = claim.status === 'arrived';
  // Arrived seats are filled with the colour and knock the text out in white;
  // seats still on the way are only tinted, so the text takes the colour.
  const style = arrived
    ? { background: color }
    : {
        background: `color-mix(in srgb, ${color} 13%, var(--canvas))`,
        boxShadow: `inset 0 0 0 2px ${color}`,
        color,
      };
  const subStyle = arrived ? undefined : { color: `color-mix(in srgb, ${color} 70%, var(--muted))` };
  return (
    <button
      type="button"
      className={`segment ${arrived ? 'taken' : 'coming'}${mine ? ' mine-seat' : ''}`}
      style={style}
      aria-label={ariaLabel}
      onClick={keyboardActivate}
      onKeyDown={keyboardKeyDown}
    >
      <SeatLabel name={claim.guestName ?? claim.username} />
      <span className="seat-sub" style={subStyle}>
        {seatSub(claim, now)}
      </span>
    </button>
  );
}

interface DragInfo {
  id: number;
  rot: 0 | 90;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
}

type Gesture =
  | { type: 'pan'; startX: number; startY: number; origTx: number; origTy: number }
  | { type: 'pinch'; startDist: number; startScale: number; midX: number; midY: number; origTx: number; origTy: number };

export function Room({
  tables,
  currentUserId,
  onTap,
  onMove,
}: {
  tables: Table[];
  currentUserId: number;
  onTap(id: number, seat: number): void;
  onMove(id: number, x: number, y: number): void;
}) {
  const now = useNowMinute(); // drives the "24 min" seat sub-labels
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FIT_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const [live, setLive] = useState<{ id: number; x: number; y: number } | null>(null);
  // In auto mode the window tracks the tables. Any manual pan/zoom freezes
  // it (and unlocks the camera); the ⤢ button snaps both back.
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [win, setWin] = useState<Win>(() => windowFor(tables));
  const winRef = useRef(win);
  winRef.current = win;
  // The room's shape decides how much extra board flanks the square framing.
  // Tracked rather than assumed, so the canvas refills correctly when the
  // window is resized or the sidebar wraps away.
  const [aspect, setAspect] = useState(1);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const prevIds = useRef(idsOf(tables));
  // glide: transform transitions on for a programmatic reframe.
  // frozen: all transitions off for one commit, for invisible canvas growth.
  const [glide, setGlide] = useState(false);
  const glideTimer = useRef<number>();
  const [frozen, setFrozen] = useState(false);

  function pulseGlide() {
    setGlide(true);
    window.clearTimeout(glideTimer.current);
    glideTimer.current = window.setTimeout(() => setGlide(false), 500);
  }

  // Grow the canvas to cover `needed` without moving anything on screen:
  // the camera is rescaled/shifted to exactly cancel the window change, so
  // the new space simply exists off-screen until someone pans over to it.
  function growTo(needed: Win) {
    const cur = winRef.current;
    const next = unionWin(cur, needed);
    if (sameWin(cur, next)) return;
    const rect = outerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      // Cancel the window change in display space — that is what the canvas
      // is laid out in, so compensating in the square framing would leave a
      // visible jolt once the framing is flanked by extra board.
      const a = aspectRef.current;
      const dc = displayWin(cur, a);
      const dn = displayWin(next, a);
      const v = viewRef.current;
      setView({
        scale: (v.scale * dn.sideX) / dc.sideX,
        tx: v.tx + CANVAS * rect.width * (v.scale / dc.sideX) * (dn.c0 - dc.c0),
        ty: v.ty + CANVAS * rect.height * (v.scale / dc.sideY) * (dn.r0 - dc.r0),
      });
    }
    setWin(next);
    setFrozen(true);
  }

  // Re-tighten the canvas to `needed` (it may shrink), keeping the
  // viewer's camera as close as possible: exact compensation first, then
  // clamped back into the smaller room, with any visible correction
  // gliding instead of jumping.
  function shrinkTo(needed: Win) {
    const cur = winRef.current;
    if (sameWin(cur, needed)) return;
    pulseGlide();
    const rect = outerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      const a = aspectRef.current;
      const dc = displayWin(cur, a);
      const dn = displayWin(needed, a);
      const v = viewRef.current;
      setView(
        clampView(
          {
            scale: (v.scale * dn.sideX) / dc.sideX,
            tx: v.tx + CANVAS * rect.width * (v.scale / dc.sideX) * (dn.c0 - dc.c0),
            ty: v.ty + CANVAS * rect.height * (v.scale / dc.sideY) * (dn.r0 - dc.r0),
          },
          rect.width,
          rect.height,
        ),
      );
    }
    setWin(needed);
  }

  useEffect(() => {
    const ids = idsOf(tables);
    const changed = ids !== prevIds.current;
    prevIds.current = ids;
    const needed = windowFor(tables);
    if (changed && autoRef.current) {
      // adding/removing tables re-tightens to the smallest frame, gliding
      pulseGlide();
      setWin((w) => (sameWin(w, needed) ? w : needed));
      setView(FIT_VIEW);
    } else if (changed) {
      // even a manually zoomed camera re-tightens on add/remove — the
      // canvas must not stay big once the tables no longer need it
      shrinkTo(needed);
    } else {
      // a plain move only ever grows the canvas — nobody's view shifts
      // or pans because of it
      growTo(needed);
    }
  }, [tables]);

  useLayoutEffect(() => {
    if (!frozen) return;
    // Force a style recalc while transitions are off: without it a busy
    // (or throttled) tab can skip straight from the old styles to the
    // unfrozen state and replay the invisible growth as a visible glide.
    void canvasRef.current?.offsetWidth;
    const t = window.setTimeout(() => setFrozen(false), 100);
    return () => window.clearTimeout(t);
  }, [frozen]);

  useEffect(() => () => window.clearTimeout(glideTimer.current), []);

  // The first render can only assume a square room; the real shape is only
  // knowable once there's a box to measure. Measuring forces a layout, which
  // fixes the assumed size as a transition's starting point, so the tables
  // must snap to the corrected window rather than glide — otherwise every
  // load opens with them visibly un-stretching themselves. Reshaping the
  // room later (a resize) snaps for the same reason.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = width / height;
      if (Math.abs(next - aspectRef.current) < 0.001) return;
      aspectRef.current = next;
      setFrozen(true);
      setAspect(next);
    };
    measure();
    // The observer catches reshapes the window never hears about (the sidebar
    // wrapping away, a sheet opening); the window event covers the ordinary
    // resize even where observer callbacks are starved by a busy frame.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  function cancelDrag() {
    dragRef.current = null;
    setLive(null);
  }

  function zoomAt(px: number, py: number, newScale: number) {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const v = viewRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    const cx = (px - v.tx) / v.scale;
    const cy = (py - v.ty) / v.scale;
    setView(clampView({ scale, tx: px - cx * scale, ty: py - cy * scale }, rect.width, rect.height));
  }

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setAuto(false);
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, viewRef.current.scale * (e.deltaY < 0 ? 1.07 : 1 / 1.07));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ----- view gestures: pan with one finger on the background, pinch-zoom
  // with two fingers anywhere (a second finger cancels a table drag) -----

  function startPinch() {
    cancelDrag();
    setAuto(false);
    const v = viewRef.current;
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      type: 'pinch',
      startDist: Math.hypot(a.x - b.x, a.y - b.y),
      startScale: v.scale,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      origTx: v.tx,
      origTy: v.ty,
    };
  }

  function bgPointerDown(e: ReactPointerEvent) {
    // Let the zoom controls handle their own clicks. Capturing the pointer
    // here retargets the mouse's compatibility click to the room, so on
    // desktop the buttons would never fire (touch synthesizes the click
    // from the tap, which is why it only broke with a mouse).
    if ((e.target as HTMLElement).closest('.zoom-controls')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onTable = (e.target as HTMLElement).closest('.rtable');
    if (!onTable) {
      try {
        outerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events may not carry a real pointer
      }
    }
    if (pointers.current.size === 2) {
      startPinch();
    } else if (pointers.current.size === 1 && !onTable) {
      setAuto(false);
      const v = viewRef.current;
      gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, origTx: v.tx, origTy: v.ty };
    } else if (pointers.current.size === 1) {
      gesture.current = null; // single finger on a table: the table drags itself
    }
  }

  function bgPointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const rect = outerRef.current?.getBoundingClientRect();
    if (!g || !rect) return;
    if (g.type === 'pan') {
      setView(
        clampView(
          { scale: viewRef.current.scale, tx: g.origTx + e.clientX - g.startX, ty: g.origTy + e.clientY - g.startY },
          rect.width,
          rect.height,
        ),
      );
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.startScale * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist));
      const px = g.midX - rect.left;
      const py = g.midY - rect.top;
      const cx = (px - g.origTx) / g.startScale;
      const cy = (py - g.origTy) / g.startScale;
      setView(clampView({ scale, tx: px - cx * scale, ty: py - cy * scale }, rect.width, rect.height));
    }
  }

  function bgPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
    } else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      const v = viewRef.current;
      gesture.current = { type: 'pan', startX: p.x, startY: p.y, origTx: v.tx, origTy: v.ty };
    }
  }

  // ----- tables: tap to open, drag to move -----

  function finalPos(d: DragInfo, e: ReactPointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect(); // scaled size
    const dw = displayWin(winRef.current, aspectRef.current);
    // board fraction shown across each axis of the canvas; the two ratios
    // agree, because the window's cells are square
    return clampToWin(
      d.origX + ((e.clientX - d.startX) / rect.width) * (dw.sideX * GRID_CELL),
      d.origY + ((e.clientY - d.startY) / rect.height) * (dw.sideY * GRID_CELL),
      d.rot,
      dw,
    );
  }

  function onPointerDown(e: ReactPointerEvent, t: Table) {
    // no stopPropagation: the room must see this pointer so a second
    // finger can turn the interaction into a pinch
    dragRef.current = { id: t.id, rot: t.rot, startX: e.clientX, startY: e.clientY, origX: t.x, origY: t.y, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events may not carry a real pointer
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (pointers.current.size >= 2) return; // pinch owns the pointers now
    const d = dragRef.current;
    if (!d || !canvasRef.current) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
      d.moved = true;
    }
    setLive({ id: d.id, ...finalPos(d, e) });
  }

  function onPointerUp(e: ReactPointerEvent, t: Table) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const pos = finalPos(d, e);
      const spot = findFreeSpot(pos.x, pos.y, t.rot, otherPlacements(tables, t.id));
      if (spot) onMove(d.id, spot.x, spot.y);
      // no free spot: the table springs back to where it was
    } else {
      // a tap targets the compartment under the finger
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const frac = t.rot === 0 ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
      const seat = Math.max(0, Math.min(t.capacity - 1, Math.floor(frac * t.capacity)));
      onTap(d.id, seat);
    }
    setLive(null);
  }

  function onPointerCancel() {
    cancelDrag();
  }

  function buttonZoom(factor: number) {
    setAuto(false);
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.width / 2, rect.height / 2, viewRef.current.scale * factor);
  }

  // The graph paper is its own layer, anchored to whole board cells so the
  // lines stay glued to the snap grid even when the window is centred on a
  // half cell. Line thickness in canvas space is the inverse of the camera
  // zoom, so every line renders at exactly one screen pixel at any zoom —
  // uniform, never thinning out or disappearing.
  const dwin = displayWin(win, aspect);
  const lineW = 1 / view.scale;
  const lineCol = 'var(--grid)';
  const gc0 = Math.floor(dwin.c0) - 1;
  const gr0 = Math.floor(dwin.r0) - 1;
  // whole cells covering the window plus a margin, so the paper never ends
  // inside the view; square cells means the two counts differ, not the sizes
  const gCols = Math.ceil(dwin.sideX) + 4;
  const gRows = Math.ceil(dwin.sideY) + 4;
  const gridStyle = {
    left: `${((gc0 - dwin.c0) / dwin.sideX) * 100}%`,
    top: `${((gr0 - dwin.r0) / dwin.sideY) * 100}%`,
    width: `${(gCols / dwin.sideX) * 100}%`,
    height: `${(gRows / dwin.sideY) * 100}%`,
    backgroundImage: `linear-gradient(${lineCol} ${lineW}px, transparent ${lineW}px), linear-gradient(90deg, ${lineCol} ${lineW}px, transparent ${lineW}px)`,
    backgroundSize: `${(1 / gCols) * 100}% ${(1 / gRows) * 100}%`,
  };

  return (
    <div
      className="room"
      ref={outerRef}
      onPointerDown={bgPointerDown}
      onPointerMove={bgPointerMove}
      onPointerUp={bgPointerUp}
      onPointerCancel={bgPointerUp}
    >
      <div
        className={`room-canvas${glide ? ' animate' : ''}${frozen ? ' still' : ''}`}
        ref={canvasRef}
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        <div className="room-grid" style={gridStyle} />
        {live &&
          (() => {
            // dashed ghost previews the cell the dragged table will land in;
            // red means there is no room and the drop will be refused
            const t = tables.find((tb) => tb.id === live.id);
            if (!t) return null;
            const spot = findFreeSpot(live.x, live.y, t.rot, otherPlacements(tables, t.id));
            const s = spot ?? snapPos(live.x, live.y, t.rot);
            const horizontal = t.rot === 0;
            return (
              <div
                className={`rtable-ghost${spot ? '' : ' invalid'}`}
                style={{
                  left: `${winLeft(dwin, s.x)}%`,
                  top: `${winTop(dwin, s.y)}%`,
                  width: `${((horizontal ? 2 : 1) / dwin.sideX) * 100}%`,
                  height: `${((horizontal ? 1 : 2) / dwin.sideY) * 100}%`,
                }}
              />
            );
          })()}
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
                (t.stolen ? ' stolen' : '') +
                (live?.id === t.id ? ' dragging' : '')
              }
              role={t.released || t.stolen ? 'button' : undefined}
              tabIndex={t.released || t.stolen ? 0 : undefined}
              aria-label={
                t.stolen
                  ? `${t.label}, taken by others. Open table settings`
                  : t.released
                    ? `${t.label}, given back. Open table settings`
                    : undefined
              }
              onKeyDown={(event) => {
                if ((t.released || t.stolen) && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onTap(t.id, 0);
                }
              }}
              style={{
                left: `${winLeft(dwin, pos.x)}%`,
                top: `${winTop(dwin, pos.y)}%`,
                width: `${((horizontal ? 2 : 1) / dwin.sideX) * 100}%`,
                height: `${((horizontal ? 1 : 2) / dwin.sideY) * 100}%`,
              }}
              onPointerDown={(e) => onPointerDown(e, t)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, t)}
              onPointerCancel={onPointerCancel}
            >
              <span className="rtable-tag">{t.label}</span>
              {t.stolen ? (
                <span className="rtable-stolen">taken by others</span>
              ) : t.released ? (
                <span className="rtable-released">given back</span>
              ) : (
                <div className={`segments ${horizontal ? 'srow' : 'scol'}`}>
                  {Array.from({ length: t.capacity }, (_, i) => {
                    const claim = t.claims.find((c) => c.seat === i);
                    return (
                      <Segment
                        key={i}
                        claim={claim}
                        mine={claim?.userId === currentUserId && !claim?.guestName}
                        now={now}
                        ariaLabel={
                          claim
                            ? `${t.label}, seat ${i + 1}: ${claim.guestName ?? claim.username}, ${seatSub(claim, now)}`
                            : `${t.label}, seat ${i + 1}: free`
                        }
                        onActivate={() => onTap(t.id, i)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* the fixed sides of the real room, so the layout reads like the space */}
      <span className="room-wall room-wall-left">Window</span>
      <span className="room-wall room-wall-right">Corridor</span>
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => buttonZoom(1.3)} aria-label="Zoom in">
          ＋
        </button>
        <button className="zoom-btn" onClick={() => buttonZoom(1 / 1.3)} aria-label="Zoom out">
          −
        </button>
        <button
          className="zoom-btn"
          onClick={() => {
            setAuto(true);
            pulseGlide();
            setWin(windowFor(tables));
            setView(FIT_VIEW);
          }}
          aria-label="Fit the tables"
        >
          ⤢
        </button>
      </div>
      <span className="room-hint">Drag tables to move · scroll to zoom · tap a seat to claim it</span>
    </div>
  );
}
