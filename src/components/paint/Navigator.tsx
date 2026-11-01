/* Canvas Navigator: a floating window (same behaviour as the colour picker pips) that shows the
 * whole artwork with the visible area outlined. Tap or drag inside to move the view there.
 * The artwork thumbnail redraws only when the document changes (throttled, off the stroke path);
 * the view outline is drawn on its own tiny overlay so panning never re-renders the artwork. */
import { useEffect, useRef } from 'react';
import type { Pt } from './geometry';

type Props = {
  size: number;
  docW: number;
  docH: number;
  version: number;
  drawArt: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  viewQuad: () => Pt[] | null;
  subscribe: (fn: () => void) => () => void;
  onJump: (docX: number, docY: number) => void;
};

export function NavigatorView({ size, docW, docH, version, drawArt, viewQuad, subscribe, onJump }: Props) {
  const art = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const k = Math.min(size / docW, size / docH);
  const w = Math.max(1, Math.round(docW * k)), h = Math.max(1, Math.round(docH * k));
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  // artwork thumbnail: at most ~4 redraws/second, scheduled when the browser is idle
  const last = useRef(0);
  useEffect(() => {
    const c = art.current;
    if (!c) return;
    let id = 0, idle = 0;
    const run = () => {
      last.current = performance.now();
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'medium';
      drawArt(ctx, c.width, c.height);
    };
    const wait = Math.max(0, 250 - (performance.now() - last.current));
    id = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(run, { timeout: 300 }); else run();
    }, wait);
    return () => { window.clearTimeout(id); (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(idle); };
  }, [version, w, h, drawArt]);

  useEffect(() => {
    const c = over.current;
    if (!c) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const q = viewQuad();
      if (!q) return;
      const s = (c.width / docW);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      ctx.lineWidth = 2.5 / s; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
      ctx.lineWidth = 1.5 / s; ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--pp-active') || '#0a84ff'; ctx.stroke();
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
    queue();
    const off = subscribe(queue);
    return () => { off(); if (raf) cancelAnimationFrame(raf); };
  }, [subscribe, viewQuad, docW, w, h]);

  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump(((e.clientX - r.left) / r.width) * docW, ((e.clientY - r.top) / r.height) * docH);
  };

  return (
    <div className="pp-nav" style={{ width: size, height: size }}>
      <div className="pp-nav-frame" style={{ width: w, height: h }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); jump(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) jump(e); }}>
        <canvas ref={art} width={Math.round(w * dpr)} height={Math.round(h * dpr)} style={{ width: w, height: h }} />
        <canvas ref={over} width={Math.round(w * dpr)} height={Math.round(h * dpr)} style={{ width: w, height: h }} />
      </div>
    </div>
  );
}
