import { useEffect, useRef, useState, type RefObject } from 'react';

/* Procreate-style gallery drag: press and hold a card, then move it (or put two
 * fingers on it) to pick it up. Hovering over the middle of another card for a
 * moment arms a stack drop; hovering near its edge reorders. A plain long press
 * without moving opens the card menu. */
export type DragSlot = { key: string; x: number; y: number; w: number; h: number };
export type DropResult = { type: 'move'; index: number } | { type: 'stack'; target: string } | { type: 'out' } | null;
export type DragState = { key: string; x: number; y: number; ox: number; oy: number; w: number; h: number; from: number; index: number | null; stack: string | null; out: boolean };

type Gest = {
  key: string; sx: number; sy: number; armed: boolean; dragging: boolean; done: boolean;
  armTimer: number; menuTimer: number; stackTimer: number; stackCand: string | null;
  pts: Map<number, { x: number; y: number }>; snap: DragSlot[]; last: { x: number; y: number };
  h?: { down: (e: PointerEvent) => void; move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; touch: (e: TouchEvent) => void };
};

export function useCardDrag(o: {
  boardRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLElement | null>;
  slots: () => DragSlot[];
  canStack: (drag: string, target: string) => boolean;
  onDrop: (key: string, r: DropResult) => void;
  onHold?: (key: string, x: number, y: number) => void;
}) {
  const [drag, setDragState] = useState<DragState | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => { dragRef.current = d; setDragState(d); };
  const g = useRef<Gest | null>(null);
  const opts = useRef(o); opts.current = o;
  const suppress = useRef(false);
  const scrollTimer = useRef<number | undefined>(undefined);

  const mid = (pts: Map<number, { x: number; y: number }>) => {
    const v = [...pts.values()];
    return { x: v.reduce((s, p) => s + p.x, 0) / v.length, y: v.reduce((s, p) => s + p.y, 0) / v.length };
  };

  const end = () => {
    const s = g.current;
    if (s) { window.clearTimeout(s.armTimer); window.clearTimeout(s.menuTimer); window.clearTimeout(s.stackTimer); }
    setArmedKey(null);
    g.current = null;
    window.clearInterval(scrollTimer.current);
    const h = s?.h;
    if (!h) return;
    window.removeEventListener('pointerdown', h.down, true);
    window.removeEventListener('pointermove', h.move, true);
    window.removeEventListener('pointerup', h.up, true);
    window.removeEventListener('pointercancel', h.up, true);
    window.removeEventListener('touchmove', h.touch);
  };

  const update = (p: { x: number; y: number }) => {
    const s = g.current, d = dragRef.current;
    if (!s || !d) return;
    s.last = p;
    const board = opts.current.boardRef.current?.getBoundingClientRect();
    if (!board) return;
    const bx = p.x - board.left, by = p.y - board.top;
    let index = d.index, stack = d.stack;
    const hit = s.snap.findIndex((sl) => sl.key !== s.key && bx >= sl.x && bx <= sl.x + sl.w && by >= sl.y && by <= sl.y + sl.h);
    if (hit >= 0) {
      const sl = s.snap[hit]!;
      const inner = Math.abs(bx - (sl.x + sl.w / 2)) < sl.w * 0.35 && Math.abs(by - (sl.y + sl.h / 2)) < sl.h * 0.35;
      if (inner && opts.current.canStack(s.key, sl.key)) {
        if (s.stackCand !== sl.key) {
          s.stackCand = sl.key;
          window.clearTimeout(s.stackTimer);
          s.stackTimer = window.setTimeout(() => {
            const cur = dragRef.current;
            if (cur && g.current?.stackCand === sl.key) { setDrag({ ...cur, stack: sl.key }); try { navigator.vibrate?.(12); } catch { /* ignore */ } }
          }, 320);
        }
      } else {
        s.stackCand = null; window.clearTimeout(s.stackTimer); stack = null;
        index = hit;
      }
    } else { s.stackCand = null; window.clearTimeout(s.stackTimer); stack = null; }
    let out = false;
    const panel = opts.current.panelRef?.current?.getBoundingClientRect();
    if (panel) out = p.x < panel.left || p.x > panel.right || p.y < panel.top || p.y > panel.bottom;
    setDrag({ ...d, x: p.x, y: p.y, index, stack: stack && stack === d.stack ? stack : stack, out });
  };

  const start = (p: { x: number; y: number }) => {
    const s = g.current;
    if (!s) return;
    window.clearTimeout(s.menuTimer);
    s.dragging = true;
    s.snap = opts.current.slots();
    const from = s.snap.findIndex((sl) => sl.key === s.key);
    const sl = s.snap[from];
    const board = opts.current.boardRef.current?.getBoundingClientRect();
    if (!sl || !board) { end(); return; }
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
    setDrag({ key: s.key, x: p.x, y: p.y, ox: p.x - (board.left + sl.x), oy: p.y - (board.top + sl.y), w: sl.w, h: sl.h, from, index: null, stack: null, out: false });
    scrollTimer.current = window.setInterval(() => {
      const el = opts.current.scrollRef.current, cur = g.current;
      if (!el || !cur) return;
      const r = el.getBoundingClientRect();
      const dy = cur.last.y < r.top + 70 ? -14 : cur.last.y > r.bottom - 70 ? 14 : 0;
      if (dy) { el.scrollTop += dy; update(cur.last); }
    }, 16);
  };

  function onDown(e: PointerEvent) {
    const s = g.current;
    if (!s || s.pts.has(e.pointerId) || e.pointerType === 'mouse') return;
    if (s.pts.size >= 2) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // hold a card and tap another one with a second finger: stack them straight away
    if (s.armed && !s.dragging) {
      const slots = opts.current.slots();
      const board = opts.current.boardRef.current?.getBoundingClientRect();
      if (board) {
        const bx = e.clientX - board.left, by = e.clientY - board.top;
        const hit = slots.findIndex((sl) => sl.key !== s.key && bx >= sl.x && bx <= sl.x + sl.w && by >= sl.y && by <= sl.y + sl.h);
        if (hit >= 0 && opts.current.canStack(s.key, slots[hit]!.key)) {
          end();
          suppress.current = true;
          window.setTimeout(() => { suppress.current = false; }, 400);
          try { navigator.vibrate?.(12); } catch { /* ignore */ }
          opts.current.onDrop(s.key, { type: 'stack', target: slots[hit]!.key });
          return;
        }
      }
    }
    e.preventDefault(); e.stopPropagation();
    // two fingers pick the card up straight away
    if (!s.dragging) start(mid(s.pts));
  }
  function onMove(e: PointerEvent) {
    const s = g.current;
    if (!s || !s.pts.has(e.pointerId)) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = mid(s.pts);
    if (!s.dragging) {
      if (Math.hypot(p.x - s.sx, p.y - s.sy) < 8) return;
      if (s.armed) start(p); else end();
      return;
    }
    e.preventDefault();
    update(p);
  }
  function onUp(e: PointerEvent) {
    const s = g.current;
    if (!s || !s.pts.has(e.pointerId)) return;
    s.pts.delete(e.pointerId);
    if (s.pts.size > 0) return;
    const d = dragRef.current;
    const wasDragging = s.dragging;
    end();
    if (!wasDragging || !d) return;
    suppress.current = true;
    window.setTimeout(() => { suppress.current = false; }, 60);
    const r: DropResult = d.out ? { type: 'out' } : d.stack ? { type: 'stack', target: d.stack } : d.index !== null ? { type: 'move', index: d.index } : null;
    setDrag(null);
    if (e.type === 'pointerup') opts.current.onDrop(d.key, r);
  }
  function onTouch(ev: TouchEvent) {
    const s = g.current;
    if (s && (s.armed || s.dragging || ev.touches.length >= 2) && ev.cancelable) ev.preventDefault();
  }

  const down = (key: string, e: React.PointerEvent) => {
    if (g.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const s: Gest = {
      key, sx: e.clientX, sy: e.clientY, armed: false, dragging: false, done: false, armTimer: 0, menuTimer: 0, stackTimer: 0, stackCand: null,
      pts: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]), snap: [], last: { x: e.clientX, y: e.clientY },
    };
    s.armTimer = window.setTimeout(() => {
      s.armed = true;
      setArmedKey(key); // the card lifts: clear "picked up, ready to drag" feedback
      try { navigator.vibrate?.(6); } catch { /* ignore */ }
    }, 250);
    s.menuTimer = window.setTimeout(() => {
      if (g.current !== s || s.dragging) return;
      suppress.current = true;
      window.setTimeout(() => { suppress.current = false; }, 400);
      end();
      opts.current.onHold?.(key, s.sx, s.sy);
      try { navigator.vibrate?.(10); } catch { /* ignore */ }
    }, 900);
    g.current = s;
    s.h = { down: onDown, move: onMove, up: onUp, touch: onTouch };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('touchmove', onTouch, { passive: false });
  };

  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { drag, armed: armedKey, down, suppressed: () => suppress.current };
}
