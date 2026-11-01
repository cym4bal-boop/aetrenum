// @ts-nocheck -- strict index checks relaxed for canvas pixel code.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readScale, usePinchScale } from './pinch';
import { Button } from '@/components/ui/button';
import { blendModes, type BlendMode, type LayerState } from './doc';
import { AdjustGlyph, DotsGlyph, PlusGlyph, WandGlyph } from './icons';
import { visibleRows } from './layer-tree';
import { adjustmentList, adjustShort } from './Panels';
import { textures } from './textures';
import { cornerSnap } from './docking';
import './layers-bar.css';
import { constrainWindow } from './window-bounds';
import { readPrefs } from './settings';

/** Layer name that, when too long to fit, scrolls continuously to the right as a seamless
 *  loop (two copies), clipped to its own box (speed from settings). */
const MQ_GAP = 28;
function MarqueeName({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [speed, setSpeed] = useState(() => readPrefs().layerNameSpeed ?? 30);
  const [width, setWidth] = useState(0);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const on = () => setSpeed(readPrefs().layerNameSpeed ?? 30);
    window.addEventListener('pp-prefs', on);
    return () => window.removeEventListener('pp-prefs', on);
  }, []);
  useEffect(() => {
    const b = box.current, i = probe.current;
    if (!b || !i) return;
    const measure = () => { const w = i.offsetWidth; setWidth(w); setOver(w - b.clientWidth > 2); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(b); ro.observe(i);
    return () => ro.disconnect();
  }, [text]);
  const run = over && speed > 0;
  const dur = run ? Math.max(2, (width + MQ_GAP) / Math.max(4, speed * 0.9)) : 0;
  return (
    <span ref={box} className={`pp-marquee ${run ? 'run' : ''}`} title={text}>
      <span className="pp-marquee-inner" style={run ? { ['--pp-mq-from' as string]: `-${width + MQ_GAP}px`, ['--pp-mq-gap' as string]: `${MQ_GAP}px`, animationDuration: `${dur}s` } : undefined}>
        <span className="pp-mq-copy"><span ref={probe}>{text}</span></span>
        {run && <span className="pp-mq-copy" aria-hidden="true">{text}</span>}
      </span>
    </span>
  );
}

/* Procreate-style layers panel: a compact second toolbar that opens from the
 * Layers button. It shows only the add-layer button on top, the layers and the
 * background row — everything else lives in the per-layer options window.
 * It drags with a mouse or two fingers and snaps only to the four corners,
 * mirroring its layout when seated on the left. Rows are tapped to select /
 * open their options window and hold-dragged vertically to reorder. */

const FolderGlyph = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M3 6.8A1.8 1.8 0 0 1 4.8 5h4.1l2 2.2h8.3A1.8 1.8 0 0 1 21 9v8.2a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2Z" /></svg>
);
const CaretGlyph = ({ open }: { open: boolean }) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }}><path d="M9 5.5v13L16.5 12 9 5.5Z" /></svg>
);
/* Clipping-mask marker: an arrow that runs up, then right, toward the layer it clips to. */
const ClipArrow = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V8h12" /><path d="M13 4l4 4-4 4" /></svg>
);
/* Procreate's visibility checkbox: a rounded square, filled with a check when visible. */
const CheckGlyph = ({ on, size = 17 }: { on?: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    {on && <path d="M7.6 12.4l3 3 5.8-6.8" />}
  </svg>
);
const glyphName = (n: string) => (n === 'Hue, Saturation, Brightness' ? 'HSB' : n);

function LayerThumb({ layer, version }: { layer: LayerState; version: number }) {
  if (layer.kind === 'group') return <span className="pp-lb-kind"><FolderGlyph /></span>;
  if (layer.kind === 'adjust') return <span className="pp-lb-kind pp-lb-kind-adj"><AdjustGlyph name={glyphName(layer.adjust?.name ?? '')} size={24} /></span>;
  return <PixelThumb layer={layer} version={version} />;
}
function PixelThumb({ layer, version }: { layer: LayerState; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const tw = Math.round(74 * dpr), th = Math.round(48 * dpr);
    if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / layer.canvas.width, c.height / layer.canvas.height);
    const w = layer.canvas.width * s, h = layer.canvas.height * s;
    ctx.drawImage(layer.canvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }, [layer, version]);
  return <canvas ref={ref} width={222} height={144} className="pp-lb-canvas" />;
}

/* Option-window glyphs, drawn to match Procreate's dark panel. */
const GS = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const OptEye = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12s-3.5 6.2-9.5 6.2S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.7" /></svg>
);
const OptDuplicate = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><rect x="8.5" y="8.5" width="12" height="12" rx="2.4" /><path d="M15.5 4.5v-.4A2.1 2.1 0 0 0 13.4 2H5.1a2.1 2.1 0 0 0-2.1 2.1v8.3a2.1 2.1 0 0 0 2.1 2.1h.4" /></svg>
);
const OptClear = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M6.6 2.6h6.6l5.3 5.3v11.4a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V4.8a2.2 2.2 0 0 1 2.2-2.2Z" /><path d="M13 2.8v4.4a1 1 0 0 0 1 1h4.4" /></svg>
);
const OptLock = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" /><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" /></svg>
);
const OptMerge = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M7 3v4.5L12 12l5-4.5V3" /><path d="M12 12v9" /><path d="M8.5 17.5 12 21l3.5-3.5" /></svg>
);
const OptDelete = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M3.5 6.5h17M9 6.5V4.2A1.7 1.7 0 0 1 10.7 2.5h2.6A1.7 1.7 0 0 1 15 4.2v2.3M5.5 6.5l1 13.2a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-13.2" /><path d="M10 10.5v6.5M14 10.5v6.5" /></svg>
);
const OptClip = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS}><path d="M12 3v11" /><path d="M7.5 9.5 12 14l4.5-4.5" /><path d="M4 20.5h16" /></svg>
);
const OptSelect = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...GS} strokeDasharray="3.2 3.4"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></svg>
);
const OptMask = ({ size = 21 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.4" fill="currentColor" /><circle cx="12" cy="12" r="4.1" fill="var(--pro-cut, #3a3a3e)" /></svg>
);
const OptCaret = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 9h13L12 16.5 5.5 9Z" /></svg>
);

const POS_KEY = 'pp.lbPos';
const FULL_W = 238;
const COMPACT_W = 106;
type Pos = { x: number; y: number; l?: boolean; r?: boolean; t?: boolean; b?: boolean };

function loadPos(): Pos | null {
  try {
    const s = localStorage.getItem(POS_KEY);
    if (!s) return null;
    const p = JSON.parse(s) as Pos;
    const isLeft = p.l === true || (p.r !== true && typeof window !== 'undefined' && p.x < window.innerWidth / 2);
    const isBottom = p.b === true || (p.t !== true && typeof window !== 'undefined' && p.y > window.innerHeight / 2);
    return {
      x: p.x,
      y: p.y,
      l: isLeft,
      r: !isLeft,
      t: !isBottom,
      b: isBottom,
    };
  } catch {
    return null;
  }
}

const REC_KEY = 'pp.hideWhenRecording';
const COMPACT_KEY = 'pp.lbCompact';

/** One-finger swipe classifier for the layers bar. Returns 'compact' when the swipe
 *  heads toward the screen edge the bar sits on, 'expand' when it heads away. */
export function swipeIntent(dx: number, dy: number, sideLeft: boolean): 'compact' | 'expand' | null {
  if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy) * 1.2) return null;
  const towardEdge = sideLeft ? dx < 0 : dx > 0;
  return towardEdge ? 'compact' : 'expand';
}
const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY) ?? 'false') === true; } catch { return false; } };

/* Procreate-style opacity slider: a thin light track with a round knob. */
function ProSlider({ value, onChange, label = 'Layer opacity' }: { value: number; onChange: (v: number) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (clientX - r.left - 11) / Math.max(1, r.width - 22))));
  };
  return (
    <div
      ref={ref}
      className="pp-pro-slider"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      onKeyDown={(e) => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); onChange(value + (e.key === 'ArrowRight' ? 0.05 : -0.05)); } }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e.clientX); }}
    >
      <span className="pp-pro-slider-track" />
      <span className="pp-pro-slider-knob" style={{ left: `calc(${(value * 100).toFixed(1)}% + ${(11 - value * 22).toFixed(1)}px)` }} />
    </div>
  );
}

export function LayersBar({ layers, activeId, version, background, backgroundVisible, onSelect, onAdd, onToggle, onReorder, onUpdate, onAction, onBackground, onBackgroundVisible, onAdjustments, onNotice, onClose,
  onAddAdjustment, onInsertImage, onAddGroup, onAddText, onSelectAll, onShare, onAdjustValue, texture, onTexture, adjustRequest, onMergeLayers, onDeleteLayers, onEditText, onRasterize }: {
  onMergeLayers?: (ids: string[]) => void;
  onEditText?: (id: string) => void;
  onRasterize?: (id: string) => void;
  onDeleteLayers?: (ids: string[]) => void;
  onAddAdjustment: (name: string) => void;
  /** bump to open the Adjustments window (used by QuickMenu / Actions) */
  adjustRequest?: number;
  onInsertImage?: () => void;
  onAddGroup: () => void;
  onAddText: () => void;
  onSelectAll: () => void;
  onShare: () => void;
  onAdjustValue: (id: string, value: number) => void;
  texture: string | null;
  onTexture: (id: string | null) => void;
  layers: LayerState[];
  activeId: string;
  version: number;
  background: string;
  backgroundVisible: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onUpdate: (id: string, patch: Partial<LayerState>) => void;
  onAction: (id: string, action: 'duplicate' | 'delete' | 'clear' | 'merge' | 'rename' | 'fill' | 'select' | 'flatten' | 'invert') => void;
  onBackground: () => void;
  onBackgroundVisible: () => void;
  /** regular (destructive) adjustment picked from the shared Adjustments window */
  onAdjustments: (name: string) => void;
  onNotice?: (message: string) => void;
  onClose?: () => void;
}) {
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const posRef = useRef(pos); posRef.current = pos;
  const [snapping, setSnapping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [options, setOptions] = useState<string | null>(null);
  const [optPos, setOptPos] = useState({ left: 12, top: 80 });
  const [blendOpen, setBlendOpen] = useState(false);
  const [extras, setExtras] = useState(false);
  const [recHide, setRecHide] = useState(loadRec);
  // remember compact state across close and reopen
  const [compact, setCompactState] = useState(() => {
    try {
      const s = localStorage.getItem(COMPACT_KEY);
      return s === '0' ? false : true;
    } catch {
      return true;
    }
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  /* Procreate Pocket layer gestures: swipe right = secondary selection, two-finger swipe right =
   * Alpha Lock, pinch two rows together = merge everything between them. */
  const [secondary, setSecondary] = useState<string[]>([]);
  useEffect(() => { setSecondary((s) => s.filter((id) => id !== activeId && layers.some((l) => l.id === id))); }, [activeId, layers]);
  const rowPtrs = useRef(new Map<number, { x0: number; y0: number; x: number; y: number; row: number; t: number }>());
  const rowGest = useRef<{ done: boolean; d0?: number } | null>(null);
  const rowIndexAt = (el: Element | null) => { const w = el?.closest('[data-row]') as HTMLElement | null; return w ? Number(w.dataset.row) : -1; };
  const rowDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || compact) return;
    const row = rowIndexAt(e.target as Element);
    if (row < 0 || (e.target as HTMLElement).closest('input, .pp-lb-eye, .pp-lb-caret')) return;
    if (!rowGest.current) rowGest.current = { done: false };
    rowPtrs.current.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, row, t: performance.now() });
    if (rowPtrs.current.size === 2) {
      const [a, b] = [...rowPtrs.current.values()];
      rowGest.current.d0 = Math.abs(a!.y - b!.y);
    }
    const move = (ev: PointerEvent) => {
      const p = rowPtrs.current.get(ev.pointerId); const g = rowGest.current;
      if (!p || !g || g.done) return;
      p.x = ev.clientX; p.y = ev.clientY;
      const pts = [...rowPtrs.current.values()];
      if (pts.length !== 2) return;
      const [a, b] = pts as [any, any];
      const d = Math.abs(a.y - b.y);
      if (a.row !== b.row && g.d0 !== undefined && g.d0 - d > 36 && Math.abs(a.x - a.x0) < 60) {
        g.done = true; rowMoved.current = true;
        const lo = Math.min(a.row, b.row), hi = Math.max(a.row, b.row);
        const ids = rows.slice(lo, hi + 1).filter((l) => (l.kind ?? 'pixel') === 'pixel' && !l.parent).map((l) => l.id);
        if (ids.length >= 2) onMergeLayers?.(ids); else onNotice?.('Pinch two pixel layers to merge them');
      } else if (a.x - a.x0 > 50 && b.x - b.x0 > 50 && Math.abs(a.y - a.y0) < 30 && Math.abs(b.y - b.y0) < 30) {
        g.done = true; rowMoved.current = true;
        const l = rows[a.row];
        if (l && (l.kind ?? 'pixel') === 'pixel') { onUpdate(l.id, { alphaLock: !l.alphaLock }); onNotice?.(l.alphaLock ? 'Alpha Lock off' : 'Alpha Lock on'); }
      }
    };
    const up = (ev: PointerEvent) => {
      const p = rowPtrs.current.get(ev.pointerId); const g = rowGest.current;
      if (!p) return;
      const single = rowPtrs.current.size === 1;
      rowPtrs.current.delete(ev.pointerId);
      if (g && !g.done && single && ev.type === 'pointerup') {
        const dx = p.x - p.x0, dy = p.y - p.y0;
        if (dx > 50 && Math.abs(dy) < 24 && performance.now() - p.t < 700) {
          const l = rows[p.row];
          if (l && l.id !== activeId) { rowMoved.current = true; setSecondary((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id])); }
        }
      }
      if (rowPtrs.current.size === 0) {
        rowGest.current = null;
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
      }
    };
    if (rowPtrs.current.size === 1) {
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    }
  };
  const [menu, setMenu] = useState<null | { left: number; top: number; sub: null | 'adjust' | 'regular' | 'texture' }>(null);
  const rows = visibleRows(layers);
  const openMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 250;
    const menuH = 420;
    let top = Math.max(12, Math.min(window.innerHeight - menuH - 12, r.bottom + 6));
    const left = Math.max(12, Math.min(window.innerWidth - W - 12, r.right - W + 6));
    setMenu({ left, top, sub: null });
  };
  useEffect(() => {
    if (!adjustRequest) return;
    const el = rootRef.current;
    const r = el?.getBoundingClientRect() ?? { left: window.innerWidth / 2, right: window.innerWidth / 2 + 125, top: 80, bottom: 80 };
    const W = 250, menuH = 420;
    const top = Math.max(12, Math.min(window.innerHeight - menuH - 12, r.top));
    const left = Math.max(12, Math.min(window.innerWidth - W - 12, r.right - W));
    setMenu({ left, top, sub: 'regular' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustRequest]);
  const [nameDraft, setNameDraft] = useState('');
  const setCompact = (v: boolean) => {
    setCompactState(v);
    try { localStorage.setItem(COMPACT_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    compactRef.current = v;
    // re-seat from the bar's own (target) size so the drag box never drifts sideways
    if (posRef.current) snap(undefined, true);
  };
  const commitRename = () => {
    if (renaming) { const n = nameDraft.trim(); if (n) onUpdate(renaming, { name: n }); }
    setRenaming(null);
  };
  const [drag, setDrag] = useState<{ index: number; y: number; over: number } | null>(null);
  const morphTimer = useRef<number | undefined>(undefined);
  const flipTimer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const rowMoved = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowH = 66;
  const sideLeft = !!(pos?.l && !pos.r);
  const sideLeftRef = useRef(sideLeft); sideLeftRef.current = sideLeft;
  const compactRef = useRef(false); compactRef.current = compact;

  const optLayer = layers.find((l) => l.id === options);
  // remember where the bar was seated
  useEffect(() => { if (pos && !dragging) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } } }, [pos, dragging]);
  // a single tap on the canvas closes the options window first, then the bar
  const optionsRef = useRef(options); optionsRef.current = options;
  const menuRef = useRef(menu); menuRef.current = menu;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const onTap = () => { if (menuRef.current) setMenu(null); else if (optionsRef.current) setOptions(null); };
    window.addEventListener('pp-close-windows', onTap);
    return () => window.removeEventListener('pp-close-windows', onTap);
  }, []);
  useEffect(() => { setBlendOpen(false); setExtras(false); }, [options]);
  useEffect(() => () => { window.clearTimeout(morphTimer.current); window.clearTimeout(flipTimer.current); }, []);

  /* Bar size in screen pixels, computed from layout values (never from a mid-transition
     bounding box): base width for the current mode x pinch scale. The bar is always placed
     with left/top and scales from its top-left corner, so pos.x/pos.y IS the on-screen box. */
  const barScale = () => parseFloat(rootRef.current?.style.scale ?? '') || readScale('pp.lbScale');
  const rect = () => {
    const s = barScale();
    const baseW = Math.min(compactRef.current ? COMPACT_W : FULL_W, window.innerWidth - 28);
    const el = rootRef.current;
    return { w: baseW * s, h: (el ? el.offsetHeight : 320) * s };
  };
  const defaultPos = () => {
    const el = rootRef.current;
    if (!el) return { x: window.innerWidth - (compact ? COMPACT_W : FULL_W) - 14, y: 14, r: true, l: false, t: true, b: false };
    const r = el.getBoundingClientRect();
    const isLeft = r.left + r.width / 2 < window.innerWidth / 2;
    const isBottom = r.top + r.height / 2 > window.innerHeight / 2;
    return { x: r.left, y: r.top, l: isLeft, r: !isLeft, t: !isBottom, b: isBottom };
  };
  const clamp = (x: number, y: number) => {
    const { w, h } = rect();
    return constrainWindow(x, y, w, h, window.innerWidth, window.innerHeight);
  };
  /** Snap to the nearest corner only — never an edge or screen center.
   *  keepSide pins the bar to its current corner (used when folding/unfolding). */
  const snap = (targetW?: number, keepSide = false) => {
    const r0 = rect();
    const w = targetW === undefined ? r0.w : targetW * barScale(), h = r0.h;
    const prev0 = posRef.current;
    const prefer = keepSide && prev0 && (prev0.l || prev0.r) ? { left: !prev0.r, top: !!prev0.t } : undefined;
    const seat = cornerSnap(prev0 ?? defaultPos(), w, h, window.innerWidth, window.innerHeight, 14, prefer);
    const prev = posRef.current;
    const prevSide = prev?.l ? 'l' : prev?.r ? 'r' : null;
    if (prevSide && prevSide !== (seat.l ? 'l' : 'r')) {
      setFlipped(true);
      window.clearTimeout(flipTimer.current);
      flipTimer.current = window.setTimeout(() => setFlipped(false), 560);
    }
    window.clearTimeout(morphTimer.current);
    setSnapping(true);
    morphTimer.current = window.setTimeout(() => setSnapping(false), 480);
    setPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
  };
  // keep a seated panel in its corner after resizes
  useEffect(() => {
    const resnap = () => {
      const p = posRef.current;
      if (gest.current) return;
      if (!p) { snap(); return; }
      if (p.l || p.r || p.t || p.b) snap(undefined, true);
      else setPos({ ...p, ...clamp(p.x, p.y) });
    };
    resnap();
    const onResize = () => { resnap(); window.setTimeout(resnap, 60); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- panel drag: mouse drag on the frame, or two fingers anywhere ---------- */
  type Gest = { move: boolean; cx: number; cy: number; pos0: any; moved: boolean; lx?: number; ly?: number; multi?: boolean; vy?: number; ty?: number; lastY?: number; over?: number };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<Gest | null>(null);
  const winMove = (e: PointerEvent) => {
    const g = gest.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) { g.lx = e.clientX; g.ly = e.clientY; }
    const dx = e.clientX - g.cx;
    const dy = e.clientY - g.cy;
    if (Math.hypot(dx, dy) > 8) {
      g.moved = true;
    }
    if (pts.length >= 2) {
      g.multi = true;
      e.preventDefault();
      const [a, b] = pts;
      setPos(follow(g, g.pos0.x + (a.x + b.x) / 2 - g.cx, g.pos0.y + (a.y + b.y) / 2 - g.cy));
    } else if (g.move && g.moved && (Math.abs(dy) > 12 || Math.abs(dx) < 25)) {
      const [a] = pts;
      setPos(follow(g, g.pos0.x + a.x - g.cx, g.pos0.y + a.y - g.cy));
    }
  };
  /** Like the floating colour picker: the bar follows the finger past the bottom edge (clamped
   *  everywhere else); released far enough down - or flicked down - it slides off and closes. */
  const follow = (g: Gest, rx: number, ry: number) => {
    const p = clamp(rx, ry);
    const y = ry > p.y ? ry : p.y;
    const now = performance.now();
    if (g.ty !== undefined && now > g.ty) g.vy = ((y - (g.lastY ?? y)) / (now - g.ty)) * 0.6 + (g.vy ?? 0) * 0.4;
    g.ty = now; g.lastY = y; g.over = y - p.y;
    return { x: p.x, y };
  };
  const dismissing = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const tryDismiss = (g: Gest) => {
    const { h } = rect();
    const over = g.over ?? 0;
    if (over <= 0) return false;
    const fast = (g.vy ?? 0) > 0.9 && over > 40;
    if (!(fast || over > Math.min(h * 0.45, 220))) return false;
    dismissing.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      // keep the seat it had before the drag, so it reopens exactly where it was
      setPos(g.pos0);
      try { localStorage.setItem(POS_KEY, JSON.stringify(g.pos0)); } catch { /* ignore */ }
      onCloseRef.current?.();
    }, 260);
    return true;
  };
  const winUp = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    window.removeEventListener('pointerdown', winDown, true);
    window.removeEventListener('pointermove', winMove, true);
    window.removeEventListener('pointerup', winUp, true);
    window.removeEventListener('pointercancel', winUp, true);
    const g = gest.current;
    gest.current = null;
    setDragging(false);
    if (!g) return;
    if (!g.multi && g.lx !== undefined && e.type === 'pointerup') {
      const intent = swipeIntent(g.lx - g.cx, (g.ly ?? g.cy) - g.cy, sideLeftRef.current);
      if (intent) {
        suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 350);
        if ((intent === 'compact') !== compactRef.current) setCompact(intent === 'compact');
        return;
      }
    }
    if (g.moved) {
      // swallow the click a drag that started on a header button would otherwise fire
      const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', eat, true);
      window.setTimeout(() => window.removeEventListener('click', eat, true), 400);
    }
    if (g.moved) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 350); if (!tryDismiss(g)) snap(); }
  };
  const winDown = (e: PointerEvent) => {
    if (!gest.current || pointers.current.has(e.pointerId) || e.pointerType === 'mouse') return;
    if (pointers.current.size >= 2) return;
    e.preventDefault(); e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    gest.current = { move: true, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, pos0: posRef.current ?? defaultPos(), moved: true, multi: true };
    setDragging(true);
  };

  const frameDown = (e: React.PointerEvent) => {
    const onWidget = !!(e.target as HTMLElement).closest('button, .pp-lb-row, input');
    if ((e.target as HTMLElement).closest('input')) return;
    suppressClick.current = false;
    if (e.pointerType === 'mouse') {
      if (onWidget) return;
      e.preventDefault();
      pointers.current.clear();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gest.current = { move: true, cx: e.clientX, cy: e.clientY, pos0: posRef.current ?? defaultPos(), moved: false };
      window.addEventListener('pointermove', winMove, true);
      window.addEventListener('pointerup', winUp, true);
      window.addEventListener('pointercancel', winUp, true);
      return;
    }
    if (gest.current || pointers.current.size > 0) return;
    // touches that start on a layer row belong to the layer gestures (select / alpha lock / pinch merge)
    if (!compact && (e.target as HTMLElement).closest('.pp-lb-row')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // register the gesture so a second finger can claim it for a panel drag,
    // or a one-finger horizontal swipe can fold / unfold the bar
    // one finger on the bar's frame (not a row / button / the scrolling list) drags it, so it can be pulled down to dismiss
    // header buttons (+, …) also grab the bar; a plain tap on them still clicks
    const onFrame = !(e.target as HTMLElement).closest('.pp-lb-scroll, input, [role=menu]');
    gest.current = { move: onFrame, cx: e.clientX, cy: e.clientY, pos0: posRef.current ?? defaultPos(), moved: false };
    if (onFrame) setDragging(true);
    window.addEventListener('pointerdown', winDown, true);
    window.addEventListener('pointermove', winMove, { capture: true, passive: false });
    window.addEventListener('pointerup', winUp, true);
    window.addEventListener('pointercancel', winUp, true);
  };

  /* ---------- row gesture: hold-drag vertically to reorder ---------- */
  const startDrag = (index: number, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') e.stopPropagation();
    if ((e.target as HTMLElement).closest('input, .pp-lb-name')) return;
    const startY = e.clientY, startX = e.clientX, pid = e.pointerId;
    let started = false;
    let over = index;
    const t = window.setTimeout(() => {
      started = true;
      over = index;
      setDrag({ index, y: 0, over: index });
    }, 280);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const dy = ev.clientY - startY;
      if (!started) {
        if (Math.abs(dy) < 10 && Math.abs(ev.clientX - startX) < 10) return;
        window.clearTimeout(t);
        cleanup();
        return;
      }
      ev.preventDefault();
      over = Math.max(0, Math.min(rows.length - 1, index + Math.round(dy / rowH)));
      setDrag({ index, y: dy, over });
    };
    const up = () => {
      window.clearTimeout(t);
      cleanup();
      if (started) {
        rowMoved.current = true;
        if (over !== index) onReorder(index, over);
      }
      setDrag(null);
    };
    const blockScroll = (ev: TouchEvent) => { if (started && ev.cancelable) ev.preventDefault(); };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', blockScroll);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  };

  const cls = ['pp-lb', leaving ? 'pp-lb-leaving' : '', compact ? 'pp-lb-compact' : '', sideLeft ? 'pp-lb-left' : 'pp-lb-right', dragging ? 'dragging' : '',
    snapping ? 'snapping' : '', flipped ? 'pp-lb-flip' : '', pos?.l ? 'snap-l' : '', pos?.r ? 'snap-r' : '', pos?.t ? 'snap-t' : '', pos?.b ? 'snap-b' : '',
    !pos || (!pos.l && !pos.r && !pos.t && !pos.b) ? 'floating' : ''].filter(Boolean).join(' ');
  // always placed by left/top in screen pixels and scaled from the top-left corner,
  // so the movement box and the visible bar are the same rectangle at every size
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transformOrigin: '0 0' }
    : { right: 14, top: 14, transformOrigin: '0 0' };

  const blendLabel = (m: string) => blendModes.find((b) => b.mode === m)?.label ?? 'Normal';
  const openOptions = (l: LayerState, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 272, H = 420;
    setOptPos({
      left: Math.max(12, Math.min(window.innerWidth - W - 12, r.left > window.innerWidth / 2 ? r.left - W - 10 : r.right + 10)),
      top: Math.max(12, Math.min(window.innerHeight - H - 12, Math.max(12, r.top - 120))),
    });
    setOptions(l.id);
  };

  usePinchScale(rootRef, 'pp.lbScale', '0 0', () => {
    const p = posRef.current ?? defaultPos();
    if (p.l || p.r) { posRef.current = p; snap(undefined, true); return; }
    setPos({ ...p, ...clamp(p.x, p.y) });
  });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (dragging || gest.current || !posRef.current) return;
      const p = posRef.current;
      if (p.r || p.l) {
        // height changed (rows added, compact fold): keep the seated corner exact
        const { w, h } = rect();
        const seat = cornerSnap(p, w, h, window.innerWidth, window.innerHeight, 14, { left: !p.r, top: !!p.t });
        if (Math.abs(seat.x - p.x) > .5 || Math.abs(seat.y - p.y) > .5) setPos({ ...p, x: seat.x, y: seat.y });
        return;
      }
      const bounded = clamp(p.x, p.y);
      if (Math.abs(bounded.x - p.x) > .1 || Math.abs(bounded.y - p.y) > .1) setPos({ ...p, ...bounded });
    });
    observer.observe(el); return () => observer.disconnect();
  }, [dragging]);

  return (
    <div ref={rootRef} className={cls} style={style as React.CSSProperties}
      onPointerDownCapture={frameDown}
      onClickCapture={(e) => { if (suppressClick.current || rowMoved.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; rowMoved.current = false; } }}>
      <div className="pp-lb-inner">
        {/* compact face: adjustments + add on top, the layers, the background */}
        <div className="pp-lb-main">
          <div className="pp-lb-head">
            {!compact && <Button variant="paint" size="paint" type="button" className={`pp-lb-wand ${menu ? 'on' : ''}`} aria-label="Layer menu" aria-expanded={!!menu} onClick={(e) => { if (menu) setMenu(null); else openMenu(e.currentTarget); }}><DotsGlyph size={20} /></Button>}
            <Button variant="paint" size="paint" type="button" className="pp-circle-btn pp-lb-add" aria-label="Add layer" onClick={onAdd}><PlusGlyph size={22} /></Button>
            <span className="pp-lb-head-spacer" aria-hidden="true" />
          </div>
          <div className="pp-lb-scroll" onPointerDown={rowDown}>
            {rows.map((l, i) => {
              let shift = 0;
              if (drag && i !== drag.index) {
                if (drag.index < i && drag.over >= i) shift = -rowH;
                if (drag.index > i && drag.over <= i) shift = rowH;
              }
              const isDrag = drag?.index === i;
              const op = Math.round((l.opacity ?? 1) * 100);
              return (
                <div key={l.id} data-row={i} className="pp-lb-row-wrap"
                  style={{ transform: `translateY(${isDrag ? drag?.y ?? 0 : shift}px)`, zIndex: isDrag ? 2 : undefined, animationDelay: `${Math.min(i * 35, 320)}ms` }}>
                  <div className={`pp-lb-row ${l.id === activeId ? 'active' : ''} ${secondary.includes(l.id) ? 'secondary' : ''} ${isDrag ? 'dragging' : ''} ${l.parent ? 'pp-lb-child' : ''} ${l.kind === 'group' ? 'pp-lb-group' : ''} ${l.clip ? 'pp-lb-clipped' : ''}`}
                    onPointerDown={(e) => startDrag(i, e)}
                    onClick={(e) => {
                      if (drag || rowMoved.current) { rowMoved.current = false; return; }
                      if (l.id === activeId) { if (options === l.id) setOptions(null); else openOptions(l, e.currentTarget); }
                      else onSelect(l.id);
                    }}>
                    {l.kind === 'group' && (
                      <Button variant="paint" size="paint" type="button" className="pp-lb-caret" aria-label={l.collapsed ? 'Open folder' : 'Close folder'} aria-expanded={!l.collapsed}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onUpdate(l.id, { collapsed: !l.collapsed }); }}><CaretGlyph open={!l.collapsed} /></Button>
                    )}
                    {l.clip && <span className="pp-lb-cliparrow" aria-label="Clipping mask"><ClipArrow /></span>}
                    <div className="pp-lb-thumb">
                      <LayerThumb layer={l} version={version} />
                      {op < 100 && <span className="pp-lb-badge">{op}%</span>}
                      {l.text && <span className="pp-lb-textbadge" aria-label="Editable text">T</span>}
                      {l.kind === 'group' && <span className="pp-lb-count">{layers.filter((x) => x.parent === l.id).length}</span>}
                    </div>
                    {!compact && (renaming === l.id ? (
                      <input className="pp-lb-name-input" aria-label="Layer name" autoFocus value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} />
                    ) : (
                      <Button variant="paint" size="paint" type="button" className="pp-lb-name" aria-label={`Rename ${l.name}`}
                        onClick={(e) => { e.stopPropagation(); if (suppressClick.current) return; setNameDraft(l.name); setRenaming(l.id); }}>
                        <MarqueeName text={l.name} />
                        {l.kind === 'adjust' && <small> · {Math.round(l.adjust?.value ?? 0)}%</small>}
                        {l.kind === 'group' && l.blend !== 'source-over' && <small> · {blendModes.find((b) => b.mode === l.blend)?.short}</small>}
                        {l.locked && <small> · Locked</small>}
                        {l.alphaLock && <small> · α</small>}
                      </Button>
                    ))}
                    <Button variant="paint" size="paint" type="button" className={`pp-lb-eye pp-lb-check ${l.visible ? 'on' : 'off'}`} aria-label={l.visible ? 'Hide layer' : 'Show layer'} aria-pressed={l.visible} onClick={(e) => { e.stopPropagation(); onToggle(l.id); }}>
                      <CheckGlyph on={l.visible} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pp-lb-foot">
            <Button variant="paint" size="paint" type="button" className="pp-lb-bgdot" style={{ background }} aria-label="Set background to the current color" onClick={onBackground} />
            {!compact && <Button variant="paint" size="paint" type="button" className={`pp-lb-eye pp-lb-check ${backgroundVisible ? 'on' : 'off'}`} aria-label={backgroundVisible ? 'Hide background' : 'Show background'} aria-pressed={backgroundVisible} onClick={onBackgroundVisible}>
              <CheckGlyph on={backgroundVisible} />
            </Button>}
          </div>
        </div>
      </div>

      {/* ⋯ layer menu: Procreate 6 style */}
      {menu && createPortal(
        <div className="pp-pro-window pp-glass-window pp-lb-menu" role="menu" aria-label="Layer menu" style={{ left: menu.left, top: menu.top }}>
          {menu.sub ? (
            <>
              <Button variant="paint" size="paint" type="button" className="pp-lb-menu-back" onClick={() => setMenu({ ...menu, sub: null })}>‹ {menu.sub === 'adjust' ? 'Add Adjustment layer' : menu.sub === 'regular' ? 'Adjustments' : 'Canvas texture'}</Button>
              <div className="pp-lb-menu-list pp-lb-menu-enter" key={menu.sub}>
                {menu.sub === 'adjust' || menu.sub === 'regular' ? [...adjustmentList.filter((a) => menu.sub === 'regular' || a !== 'Liquify'), ...(menu.sub === 'regular' ? ['Clone'] : [])].map((a) => (
                  <Button variant="paint" size="paint" key={a} type="button" role="menuitem" onClick={() => { if (menu.sub === 'regular') onAdjustments(a); else onAddAdjustment(a); setMenu(null); }}>
                    <AdjustGlyph name={glyphName(a)} size={18} /><span>{adjustShort(a)}</span>
                  </Button>
                )) : <>
                  <Button variant="paint" size="paint" type="button" role="menuitemradio" aria-checked={!texture} className={!texture ? 'on' : ''} onClick={() => onTexture(null)}><span className="pp-tex-swatch none" /><span>None</span></Button>
                  {textures.map((t) => (
                    <Button variant="paint" size="paint" key={t.id} type="button" role="menuitemradio" aria-checked={texture === t.id} className={texture === t.id ? 'on' : ''} onClick={() => onTexture(t.id)}>
                      <span className="pp-tex-swatch" style={{ backgroundImage: `url(${t.url})` }} /><span>{t.name}</span>
                    </Button>
                  ))}
                </>}
              </div>
            </>
          ) : (
            <div className="pp-lb-menu-list">
              {secondary.length > 0 && <>
                <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { const ids = rows.filter((l) => l.id === activeId || secondary.includes(l.id)).map((l) => l.id); onMergeLayers?.(ids); setSecondary([]); setMenu(null); }}><OptMerge size={18} /><span>Merge selected ({secondary.length + 1})</span></Button>
                <Button variant="paint" size="paint" type="button" role="menuitem" className="danger" onClick={() => { onDeleteLayers?.([activeId, ...secondary]); setSecondary([]); setMenu(null); }}><OptDelete size={18} /><span>Delete selected ({secondary.length + 1})</span></Button>
                <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { setSecondary([]); setMenu(null); }}><span className="pp-lb-menu-t">×</span><span>Clear selection</span></Button>
                <div className="pp-lb-menu-sep" />
              </>}
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onSelectAll(); setMenu(null); }}><OptSelect size={18} /><span>Select All</span></Button>
              <div className="pp-lb-menu-sep" />
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => setMenu({ ...menu, sub: 'adjust' })}><WandGlyph size={18} /><span>Add Adjustment layer</span><em>›</em></Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onAddText(); setMenu(null); onClose?.(); }}><span className="pp-lb-menu-t">T</span><span>Add text</span></Button>
              {onInsertImage && <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { setMenu(null); onInsertImage(); }}><svg width={18} height={18} viewBox="0 0 24 24" {...GS}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg><span>Insert a photo</span></Button>}
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onAddGroup(); setMenu(null); }}><FolderGlyph size={18} /><span>Add folder</span></Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => setMenu({ ...menu, sub: 'texture' })}><span className="pp-tex-swatch small" /><span>Canvas texture</span><em>›</em></Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => setMenu({ ...menu, sub: 'regular' })}><AdjustGlyph name="Curves" size={18} /><span>Adjustments</span><em>›</em></Button>
              <div className="pp-lb-menu-sep" />
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onShare(); setMenu(null); }}><svg width={18} height={18} viewBox="0 0 24 24" {...GS}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" /></svg><span>Share</span></Button>
              <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onAction(activeId, 'duplicate'); setMenu(null); }}><OptDuplicate size={18} /><span>Duplicate</span></Button>
              <div className="pp-lb-menu-sep" />
              <Button variant="paint" size="paint" type="button" role="menuitem" className="danger" onClick={() => { onAction(activeId, 'delete'); setMenu(null); }}><OptDelete size={18} /><span>Delete</span></Button>
            </div>
          )}
        </div>, (document.querySelector('.pp-editor') ?? document.body) as HTMLElement
      )}

      {/* Procreate-style layer options window (tap the active layer) */}
      {optLayer && createPortal(
        <>
          <div className="pp-pro-window pp-glass-window" role="menu" aria-label={`Options for ${optLayer.name}`} style={{ left: optPos.left, top: optPos.top }}>
            <div className="pp-pro-titlebar">
              <Button variant="paint" size="paint" type="button" className="pp-pro-title" aria-label={`Rename ${optLayer.name}`} onClick={() => onAction(optLayer.id, 'rename')}>{optLayer.name}</Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-close" aria-label="Close layer options" onClick={() => setOptions(null)}>✕</Button>
            </div>
            <Button variant="paint" size="paint" type="button" className="pp-pro-blend" aria-expanded={blendOpen} onClick={() => setBlendOpen((v) => !v)}>
              <span>{blendLabel(optLayer.blend)}</span><OptCaret />
            </Button>
            {blendOpen && (
              <div className="pp-pro-blend-list" role="listbox" aria-label="Blend mode">
                {blendModes.map((b) => (
                  <Button variant="paint" size="paint" key={b.mode} type="button" role="option" aria-selected={optLayer.blend === b.mode}
                    className={optLayer.blend === b.mode ? 'on' : ''}
                    onClick={() => onUpdate(optLayer.id, { blend: b.mode as BlendMode })}>
                    <span>{b.label}</span><em>{b.short}</em>
                  </Button>
                ))}
              </div>
            )}
            <span className="pp-pro-label">Opacity</span>
            <ProSlider value={optLayer.opacity ?? 1} onChange={(v) => onUpdate(optLayer.id, { opacity: v })} />
            {optLayer.kind === 'adjust' && <>
              <span className="pp-pro-label">{optLayer.adjust?.name} · {Math.round(optLayer.adjust?.value ?? 0)}%</span>
              <ProSlider label="Adjustment strength" value={(optLayer.adjust?.value ?? 0) / 100} onChange={(v) => onAdjustValue(optLayer.id, Math.round(v * 100))} />
            </>}
            {optLayer.kind && optLayer.kind !== 'pixel' ? (
              <div className="pp-pro-grid">
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => onToggle(optLayer.id)}><OptEye /><span>{optLayer.visible ? 'Hide' : 'Show'}</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => onAction(optLayer.id, 'duplicate')}><OptDuplicate /><span>Duplicate</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'merge'); setOptions(null); }}><OptMerge /><span>{optLayer.kind === 'group' ? 'Flatten' : 'Merge'}</span></Button>
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'rename'); }}><OptClear /><span>Rename</span></Button>
                {optLayer.kind === 'group' && <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.clip ? 'on' : ''}`} aria-pressed={!!optLayer.clip} onClick={() => onUpdate(optLayer.id, { clip: !optLayer.clip })}><OptClip /><span>Clip</span></Button>}
                <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'delete'); setOptions(null); }}><OptDelete /><span>Delete</span></Button>
              </div>
            ) : (
            <div className="pp-pro-grid">
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onToggle(optLayer.id); }}>
                <OptEye /><span>Hide</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'duplicate'); }}>
                <OptDuplicate /><span>Duplicate</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'clear'); }}>
                <OptClear /><span>Clear</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.locked ? 'on' : ''}`} aria-pressed={optLayer.locked} onClick={() => onUpdate(optLayer.id, { locked: !optLayer.locked })}>
                <OptLock /><span>Lock</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'merge'); }}>
                <OptMerge /><span>Merge</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'delete'); }}>
                <OptDelete /><span>Delete</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className={`pp-pro-cell ${optLayer.clip ? 'on' : ''}`} aria-pressed={!!optLayer.clip} onClick={() => onUpdate(optLayer.id, { clip: !optLayer.clip })}>
                <OptClip /><span>Clip</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onAction(optLayer.id, 'select'); }}>
                <OptSelect /><span>Select</span>
              </Button>
              <Button variant="paint" size="paint" type="button" className="pp-pro-cell" onClick={() => { onNotice?.("Layer masks aren't available yet"); }}>
                <OptMask /><span>Mask</span>
              </Button>
            </div>
            )}
            <div className="pp-pro-foot">
              <label className="pp-pro-rec">
                <span>Hide when recording</span>
                <input type="checkbox" hidden checked={recHide} onChange={(e) => {
                  setRecHide(e.target.checked);
                  try { localStorage.setItem(REC_KEY, JSON.stringify(e.target.checked)); } catch { /* ignore */ }
                }} />
                <span className={`pp-toggle ${recHide ? 'on' : ''}`} aria-hidden="true"><span /></span>
              </label>
              <Button variant="paint" size="paint" type="button" className="pp-pro-more" aria-label="More layer options" aria-expanded={extras} onClick={() => setExtras((v) => !v)}><DotsGlyph size={18} /></Button>
            </div>
            {extras && (
              <div className="pp-pro-extras" role="menu" aria-label="More layer options">
                {optLayer.text && <>
                  <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onEditText?.(optLayer.id); }}>Edit Text</Button>
                  <Button variant="paint" size="paint" type="button" role="menuitem" onClick={() => { onRasterize?.(optLayer.id); }}>Rasterize</Button>
                </>}
                {([
                  ['rename', 'Rename'], ['fill', 'Fill Layer'], ['invert', 'Invert'],
                ] as const).map(([a, label]) => (
                  <Button variant="paint" size="paint" key={a} type="button" role="menuitem" onClick={() => { onAction(optLayer.id, a); }}>{label}</Button>
                ))}
                <Button variant="paint" size="paint" type="button" role="menuitemcheckbox" aria-checked={optLayer.alphaLock} className={optLayer.alphaLock ? 'on' : ''}
                  onClick={() => onUpdate(optLayer.id, { alphaLock: !optLayer.alphaLock })}>Alpha Lock</Button>
                <Button variant="paint" size="paint" type="button" role="menuitemcheckbox" aria-checked={optLayer.locked} className={optLayer.locked ? 'on' : ''}
                  onClick={() => onUpdate(optLayer.id, { locked: !optLayer.locked })}>Lock</Button>
              </div>
            )}
          </div>
        </>, (document.querySelector('.pp-editor') ?? document.body) as HTMLElement
      )}
    </div>
  );
}
