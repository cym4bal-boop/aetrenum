/* Pinch-to-resize for floating UI (toolbar, layers bar, floating color pickers, sliders).
 * Two fingers on the element scale it smoothly with stable pointer tracking.
 * Maintains stable pointer identifiers throughout the gesture, calculates resizing
 * using the distance between the two fingers relative to initial dimensions,
 * preserves anchor and enforces screen boundaries. */
import { useEffect, useRef, type RefObject } from 'react';

export const clampScale = (s: number, min = 0.7, max = 1.5) => Math.max(min, Math.min(max, s));

/** Scale after a pinch: ignores small distance changes so two-finger drags don't resize. */
export function pinchScale(s0: number, d0: number, d: number, min = 0.7, max = 1.5, dead = 0.08) {
  if (d0 <= 0) return s0;
  const r = d / d0;
  if (Math.abs(r - 1) < dead) return s0;
  const eff = r > 1 ? r - dead : r + dead;
  return clampScale(s0 * eff, min, max);
}

export function readScale(key: string, fallback = 1) {
  try { const v = Number(localStorage.getItem(key)); return v > 0 ? clampScale(v) : fallback; } catch { return fallback; }
}

export function readSize(key: string, fallback = 240, min = 180, max = 400) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Robust two-finger pinch resizing for square floating windows (e.g. PiP color pickers).
 * - Tracks both pointers independently by stable pointerId.
 * - Calculates size = clamp(size0 * (d / d0), min, max).
 * - Always maintains 1:1 aspect ratio.
 * - Keeps element strictly within visible screen boundaries.
 * - Zero jumping, jitter, or switching of active pointers.
 */
export function useSquarePinchResize({
  ref,
  size,
  onResize,
  minSize = 180,
  maxSize = 380,
  storageKey,
}: {
  ref: RefObject<HTMLElement | null>;
  size: number;
  onResize: (newSize: number) => void;
  minSize?: number;
  maxSize?: number;
  storageKey?: string;
}) {
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let initial: { id1: number; id2: number; d0: number; size0: number } | null = null;

    const getDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!el.contains(e.target as Node)) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && !initial) {
        const entries = [...pointers.entries()];
        const first = entries[0], second = entries[1];
        if (!first || !second) return;
        const p1 = first[1], p2 = second[1];
        const d0 = getDistance(p1, p2);
        if (d0 > 10) {
          initial = {
            id1: first[0],
            id2: second[0],
            d0,
            size0: sizeRef.current,
          };
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (!initial) return;
      const p1 = pointers.get(initial.id1);
      const p2 = pointers.get(initial.id2);
      if (!p1 || !p2) return;

      const d = getDistance(p1, p2);
      if (d <= 0 || initial.d0 <= 0) return;

      const maxAllowed = Math.min(
        maxSize,
        Math.max(minSize, window.innerWidth - 16),
        Math.max(minSize, window.innerHeight - 16)
      );
      const scale = d / initial.d0;
      const raw = Math.round(initial.size0 * scale);
      const clamped = Math.max(minSize, Math.min(maxAllowed, raw));

      if (clamped !== sizeRef.current) {
        sizeRef.current = clamped;
        onResizeRef.current(clamped);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (initial && (e.pointerId === initial.id1 || e.pointerId === initial.id2 || pointers.size < 2)) {
        initial = null;
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, String(sizeRef.current));
          } catch {
            /* ignore */
          }
        }
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
    window.addEventListener('pointerup', onPointerEnd, { passive: true, capture: true });
    window.addEventListener('pointercancel', onPointerEnd, { passive: true, capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerEnd, true);
      window.removeEventListener('pointercancel', onPointerEnd, true);
    };
  }, [ref, minSize, maxSize, storageKey]);
}

export function usePinchScale(ref: RefObject<HTMLElement | null>, key: string, origin = '0 0', onScale?: (s: number) => void) {
  const scale = useRef(readScale(key));
  const cb = useRef(onScale); cb.current = onScale;
  useEffect(() => {
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      el.style.scale = String(scale.current);
      if (origin) el.style.transformOrigin = origin;
    };
    apply();
    const pts = new Map<number, { x: number; y: number }>();
    let g: { d0: number; s0: number } | null = null;
    const dist = () => { const [a, b] = [...pts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const down = (e: PointerEvent) => {
      const el = ref.current;
      if (!el || e.pointerType === 'mouse') return;
      if (!el.contains(e.target as Node)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) g = { d0: dist(), s0: scale.current };
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g || pts.size !== 2) return;
      const el = ref.current;
      const maximum = el ? Math.min(1.5, (window.innerWidth - 16) / Math.max(1, el.offsetWidth), (window.innerHeight - 16) / Math.max(1, el.offsetHeight)) : 1.5;
      const s = pinchScale(g.s0, g.d0, dist(), Math.min(.7, maximum), maximum);
      if (s === scale.current) return;
      scale.current = s;
      apply();
      cb.current?.(s);
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size < 2 && g) {
        g = null;
        try { localStorage.setItem(key, String(scale.current)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [ref, key, origin]);
}

