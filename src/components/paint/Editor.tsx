// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { applyCanvasEffect } from './canvas-ops';
import { brushLibrary, brushTip, eraserTip, stampDab, strokeColorOffset, seededRng, brushComposite, registerBrushes, getBrushDef, updateBrushDef, type BrushDef } from './brushes';
import { BrushStudio } from './BrushStudio';
import { ColorsSheet, dragOrTap, type ColorTab, type Palette } from './ColorsSheet';
import { blendModes, composite, ctx2d, flatten, makeCanvas, type Floating, type LayerMeta, type LayerState, type LiveStroke, type Texture } from './doc';
import { centroid, drawTransformed, dragMesh, homography, locate, meshFromQuad, patch, pointInQuad, quadToQuad, rectQuad, rotateAbout, type TfState } from './transform-math';
import { alphaMask, boundsOf, combine, floodMask, invert as invertMask, isEmpty as maskEmpty, rasterize, trace } from './selection-mask';
import { blockRange, moveRow, visibleRows } from './layer-tree';
import { resolveTexture, textures } from './textures';
import { adjustShort } from './Panels';
import { colorDrop } from './fill';
import { createFillWave, FILL_WAVE_DURATION } from './fill-wave';
import { detectShape, type Pt, type QuickShapeResult } from './geometry';
import { ArrowGlyph, BrushGlyph, DotsGlyph, EraserGlyph, LayersGlyph, SelectGlyph, SmudgeGlyph, WandGlyph, WrenchGlyph } from './icons';
import { Check, ChevronRight, FlipHorizontal2, FlipVertical2, Grid3x3, Magnet, Maximize, Plus, RotateCcw, RotateCw, Scan, Trash2 } from 'lucide-react';
import { AdjustmentPanel, AdjustActions, AdjustOverlay, CloneControls, CloneDisc, defaultParams, type AdjustmentName, type CloneSettings } from './Adjustments';
import { layerValueOf, normalizeParams, usesSwipe } from './adjust-defs';
import { TextSheet } from './TextSheet';
import { defaultDraft, drawText, ensureFont, type TextDraft } from './text';
import { LiquifySheet, BlobGhost, LIQ_DEFAULT, type LiqSettings } from './Liquify';
import { ActionsSheet, BrushSheet, type ActionId } from './Panels';
import { LayersBar } from './LayersBar';
import { cornerSnap } from './docking';
import { canvasToBlob, clampSize, downloadBlob, loadImage, makeId, type Artwork, type StoredLayer } from './storage';
import { loadHistory, saveHistory, type HistEntry, type HistPixels } from './history-store';
import { saveBackup } from './backups';
import type { HarmonyMode } from './color';
import { DEFAULT_ACCENT, applyCurve, applyTheme, readAccent, readFrost, readPrefs, writePrefs, type Prefs } from './settings';
import { CanvasPrefs, colorModeFilter } from './CanvasPrefs';
import { exportArnm, exportPsd, exportZip } from './formats';
import { FloatingPicker, type Floater } from './FloatingPicker';
import { usePinchScale } from './pinch';
import { mapToPalette } from './palette-map';
import { Sheet } from './Sheet';
import { QuickMenu } from './QuickMenu';
import './side-sliders.css';
import type { QuickAction } from './quickmenu';

type Tool = 'brush' | 'smudge' | 'eraser' | 'select' | 'transform';
type PaintTool = 'brush' | 'smudge' | 'eraser';
type Panel = null | 'colors' | 'layers' | 'brush' | 'actions' | 'adjust';
type View = { x: number; y: number; scale: number; rot: number; flip: boolean };
type Rect = { x: number; y: number; w: number; h: number };
type Selection = { path: Path2D; outlines: Pt[][]; inverted: boolean; bounds: Rect };
type SelMode = 'Automatic' | 'Freehand' | 'Rectangle' | 'Ellipse';
let stripeCache: { lw: number; pat: CanvasPattern | null } = { lw: 0, pat: null };
/** Diagonal-line pattern for areas outside a committed selection (cached per zoom level). */
function selStripes(ctx: CanvasRenderingContext2D, lw: number) {
  const k = Math.round(lw * 1000) / 1000;
  if (stripeCache.pat && stripeCache.lw === k) return stripeCache.pat;
  const t = document.createElement('canvas'); t.width = 12; t.height = 12;
  const c = t.getContext('2d')!;
  c.strokeStyle = 'rgba(20,20,28,0.9)'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-3, 15); c.lineTo(15, -3); c.moveTo(-3, 3); c.lineTo(3, -3); c.moveTo(9, 15); c.lineTo(15, 9); c.stroke();
  const pat = ctx.createPattern(t, 'repeat');
  pat?.setTransform(new DOMMatrix().scale(lw, lw));
  stripeCache = { lw: k, pat };
  return pat!;
}

type Tf = TfState;

const HISTORY_BYTES = 220 * 1024 * 1024;
const WORKSPACE = '#e4e4e4';

const defaultPalettes: Palette[] = [
  { id: 'default', name: 'Default', colors: ['#000000', '#3a3a3c', '#8e8e93', '#d1d1d6', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#ffe6d9', '#f4b183', '#c55a11', '#5b3a29'] },
  { id: 'earth', name: 'Skin & Earth', colors: ['#fde7d6', '#f6cba8', '#e8a87c', '#c58b5f', '#8d5b3d', '#5a3825', '#2f1d13', '#d9c7a3', '#a89874', '#6f6a4e', '#4e5b3a', '#2e3b2a'] },
];

function useStored<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV] as const;
}

const metaOf = (l: LayerState): LayerMeta => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, alphaLock: l.alphaLock, kind: l.kind ?? 'pixel', parent: l.parent, collapsed: l.collapsed, clip: l.clip, adjust: l.adjust ? { ...l.adjust } : undefined, text: l.text ? { draft: { ...l.text.draft }, color: l.text.color } : undefined });
const unionRect = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export function Editor({ artwork, onExit, onSaved }: { artwork: Artwork; onExit: (a: Artwork) => void; onSaved: (a: Artwork) => void | Promise<void> }) {
  const W = artwork.width, H = artwork.height;
  const viewCanvas = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<LayerState[]>([]);
  const [layers, setLayersState] = useState<LayerState[]>([]);
  const [activeId, setActiveIdState] = useState('');
  const activeRef = useRef('');
  const [bg, setBgState] = useState(artwork.background ?? '#ffffff');
  const [bgVisible, setBgVisibleState] = useState(artwork.backgroundVisible ?? true);
  const bgRef = useRef({ color: bg, visible: bgVisible });
  const [title, setTitle] = useState(artwork.title);
  const [texture, setTextureState] = useState<{ id: string; strength: number } | null>(artwork.texture ?? null);
  const textureSel = useRef(texture);
  const texRef = useRef<Texture | null>(null);
  useEffect(() => {
    textureSel.current = texture;
    let off = false;
    void resolveTexture(texture).then((t) => { if (!off) { texRef.current = t; requestRender(); } });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture?.id, texture?.strength]);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const fillReveal = useRef<{ layerId: string; canvas: HTMLCanvasElement } | null>(null);
  const fillFrame = useRef<number | undefined>(undefined);
  const finishFillWave = () => { if (fillFrame.current !== undefined) cancelAnimationFrame(fillFrame.current); fillReveal.current = null; };
  useEffect(() => () => finishFillWave(), []);

  const [tool, setTool] = useState<Tool>('brush');
  const toolRef = useRef(tool); toolRef.current = tool;
  const [brushIds, setBrushIds] = useStored<Record<PaintTool, string>>('pp.brushIds', { brush: 'sleepyhead', smudge: 'soft-brush', eraser: 'soft-brush' });
  const [sizes, setSizes] = useStored<Record<PaintTool, number>>('pp.sizes', { brush: 0.25, smudge: 0.4, eraser: 0.4 });
  const [opacities, setOpacities] = useStored<Record<PaintTool, number>>('pp.opacity', { brush: 1, smudge: 0.7, eraser: 1 });
  const [streamline, setStreamline] = useStored('pp.streamline', 30);
  const [color, setColor] = useStored('pp.color', readAccent());
  const [prevColor, setPrevColor] = useStored('pp.prevColor', '#ffb74d');
  const [recent, setRecent] = useStored<string[]>('pp.recent', []);
  const [palettes, setPalettes] = useStored<Palette[]>('pp.palettes', defaultPalettes);
  const [colorTab, setColorTab] = useStored<ColorTab>('pp.colorTab', 'Harmony');
  const [harmony, setHarmony] = useStored<HarmonyMode>('pp.harmony', 'Tetradic');
  const [expanded, setExpanded] = useStored('pp.toolbarOpen', true);
  const [panel, setPanel] = useState<Panel>(null);
  // bump to open the shared Adjustments window (Layer bar menu) from QuickMenu / gestures
  const [adjReq, setAdjReq] = useState(0);
  const openAdjustments = () => { setPanel('layers'); setAdjReq(Date.now()); window.setTimeout(() => setAdjReq(0), 80); };
  const [dark, setDark] = useStored('pp.dark', false);
  const [frost, setFrostState] = useState(() => readFrost());
  const setFrost = (v: boolean) => {
    setFrostState(v);
    applyTheme(undefined, undefined, v);
  };
  const [accent, setAccent] = useStored('pp.accent', DEFAULT_ACCENT);
  const [tbPos, setTbPos] = useStored<null | { x: number; y: number; l?: boolean; r?: boolean; t?: boolean; b?: boolean }>('pp.tbPos', null);
  const [tbDrag, setTbDrag] = useState(false);
  const [tbSnapping, setTbSnapping] = useState(false);
  const [tbFlip, setTbFlip] = useState(false);
  const [paletteView, setPaletteView] = useStored<'Compact' | 'Cards'>('pp.paletteView', 'Compact');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tbPosRef = useRef(tbPos); tbPosRef.current = tbPos;
  usePinchScale(toolbarRef, 'pp.tbScale');
  // canvas-only settings (Actions → Settings)
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [floaters, setFloaters] = useStored<Floater[]>('pp.floaters', []);
  const [grabbedFloater, setGrabbedFloater] = useState<string | null>(null);
  const [hideUI, setHideUI] = useState(false);
  const [sliderDrag, setSliderDrag] = useState<null | { kind: 'size' | 'opacity'; fine: boolean }>(null);
  const sliderGrab = useRef<null | { y: number; x: number; v: number; h: number }>(null);
  /** Four-finger tap: full screen = hide the interface and, where the browser allows, real full screen. */
  const toggleFullscreen = () => {
    setHideUI((prev) => {
      const next = !prev;
      try {
        if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
        else if (!next && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch { /* not allowed here */ }
      flash(next ? 'Full screen (four-finger tap to exit)' : 'Interface restored');
      return next;
    });
  };
  const [quickMenu, setQuickMenu] = useState<null | { x: number; y: number }>(null);
  const openQuickMenu = (x: number, y: number) => { setQuickMenu({ x, y }); };
  const [sliderHeights, setSliderHeights] = useStored<{ size: number; opacity: number }>('pp.sliderHeights', { size: 108, opacity: 108 });
  const [editingBrush, setEditingBrush] = useState<BrushDef | null>(null);

  /* ---------- toolbar: drag (mouse or two fingers). Snapping is corner-only:
     the nearest corner wins; the bar keeps its size and never folds on its own,
     and it flips its layout when it seats on the opposite left/right side. ---------- */
  type TbGest = { drag: boolean; cx: number; cy: number; pos0: { x: number; y: number }; moved: boolean };
  const tbPointers = useRef(new Map<number, { x: number; y: number }>());
  const tbGest = useRef<TbGest | null>(null);
  const tbMorphTimer = useRef<number | undefined>(undefined);
  const tbFlipTimer = useRef<number | undefined>(undefined);
  const tbSuppressClick = useRef(false);
  const tbRect = () => {
    const el = toolbarRef.current;
    if (!el) return { w: 244, h: 150 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const tbDefaultPos = () => {
    const el = toolbarRef.current;
    if (!el) return { x: 24, y: 60 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  };
  const tbClamp = (x: number, y: number) => {
    const { w, h } = tbRect();
    return { x: Math.max(6, Math.min(window.innerWidth - w - 6, x)), y: Math.max(6, Math.min(window.innerHeight - h - 6, y)) };
  };
  const tbSnap = () => {
    const { w, h } = tbRect();
    const seat = cornerSnap(tbPosRef.current ?? { x: 24, y: 60 }, w, h, window.innerWidth, window.innerHeight);
    // flip pop when the bar seats on the opposite left/right side from before
    const prev = tbPosRef.current;
    const prevSide = prev?.l ? 'l' : prev?.r ? 'r' : null;
    if (prevSide && prevSide !== (seat.l ? 'l' : 'r')) {
      setTbFlip(true);
      window.clearTimeout(tbFlipTimer.current);
      tbFlipTimer.current = window.setTimeout(() => setTbFlip(false), 560);
    }
    window.clearTimeout(tbMorphTimer.current);
    setTbSnapping(true);
    tbMorphTimer.current = window.setTimeout(() => setTbSnapping(false), 480);
    setTbPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
  };
  // Toolbar gestures track every finger at window level, so a second finger landing
  // next to the (small) toolbar still counts as a two-finger drag / pinch.
  const tbStartGesture = (pos0: { x: number; y: number }) => {
    const [a, b] = [...tbPointers.current.values()];
    tbGest.current = { drag: true, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, pos0, moved: true };
    setTbDrag(true);
  };
  const tbWinDown = (e: PointerEvent) => {
    if (!tbGest.current || tbPointers.current.has(e.pointerId) || e.pointerType === 'mouse') return;
    if (tbPointers.current.size >= 2) return;
    // second finger: claim it for the toolbar so it never paints on the canvas
    e.preventDefault(); e.stopPropagation();
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tbStartGesture(tbPosRef.current ?? tbDefaultPos());
  };
  const tbWinMove = (e: PointerEvent) => {
    const g = tbGest.current;
    if (!g || !tbPointers.current.has(e.pointerId)) return;
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...tbPointers.current.values()];
    if (pts.length >= 2) {
      e.preventDefault();
      const [a, b] = pts;
      const p = tbClamp(g.pos0.x + (a.x + b.x) / 2 - g.cx, g.pos0.y + (a.y + b.y) / 2 - g.cy);
      g.moved = true;
      setTbPos({ x: p.x, y: p.y });
    } else if (g.drag) {
      const [a] = pts;
      const p = tbClamp(g.pos0.x + a.x - g.cx, g.pos0.y + a.y - g.cy);
      g.moved = true;
      setTbPos({ x: p.x, y: p.y });
    }
  };
  const tbWinUp = (e: PointerEvent) => {
    if (!tbPointers.current.has(e.pointerId)) return;
    tbPointers.current.delete(e.pointerId);
    if (tbPointers.current.size > 0) return;
    window.removeEventListener('pointerdown', tbWinDown, true);
    window.removeEventListener('pointermove', tbWinMove, true);
    window.removeEventListener('pointerup', tbWinUp, true);
    window.removeEventListener('pointercancel', tbWinUp, true);
    const g = tbGest.current;
    tbGest.current = null;
    setTbDrag(false);
    if (!g) return;
    if (g.moved) { tbSuppressClick.current = true; window.setTimeout(() => { tbSuppressClick.current = false; }, 350); tbSnap(); }
  };
  const tbDown = (e: RPE<HTMLDivElement>) => {
    const onButton = !!(e.target as HTMLElement).closest('button');
    if (onButton && e.pointerType === 'mouse') return;
    if (tbPointers.current.has(e.pointerId)) return;
    const pos0 = tbPosRef.current ?? tbDefaultPos();
    if (tbGest.current && tbPointers.current.size === 1) {
      e.preventDefault();
      tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tbStartGesture(pos0);
      return;
    }
    tbPointers.current.clear();
    tbPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tbGest.current = { drag: e.pointerType === 'mouse' && !onButton, cx: e.clientX, cy: e.clientY, pos0, moved: false };
    if (e.pointerType === 'mouse') { e.preventDefault(); setTbDrag(true); }
    window.addEventListener('pointerdown', tbWinDown, true);
    window.addEventListener('pointermove', tbWinMove, { capture: true, passive: false });
    window.addEventListener('pointerup', tbWinUp, true);
    window.addEventListener('pointercancel', tbWinUp, true);
  };
  const tbClickGuard = (e: React.MouseEvent) => {
    if (tbSuppressClick.current) { e.preventDefault(); e.stopPropagation(); tbSuppressClick.current = false; }
  };
  useEffect(() => () => { window.clearTimeout(tbMorphTimer.current); window.clearTimeout(tbFlipTimer.current); }, []);
  const tbProps = (extra: string) => {
    const p = tbPos;
    const cls = ['pp-toolbar', extra, tbFlip ? 'pp-tb-flip' : '', tbDrag ? 'dragging' : '', tbSnapping ? 'snapping' : '',
      p?.l ? 'snap-l' : '', p?.r ? 'snap-r' : '', p?.t ? 'snap-t' : '', p?.b ? 'snap-b' : '', p && !p.l && !p.r && !p.t && !p.b ? 'floating' : ''].filter(Boolean).join(' ');
    return {
      ref: toolbarRef,
      className: cls,
      style: p ? { left: p.x, top: p.y, right: 'auto', bottom: 'auto' } : undefined,
      onPointerDown: tbDown, onClickCapture: tbClickGuard,
    };
  };
  // the toolbar starts seated in the top-left corner
  useEffect(() => {
    if (tbPosRef.current) return;
    const id = requestAnimationFrame(() => {
      if (tbPosRef.current) return;
      const seat = cornerSnap({ x: 0, y: 0 }, tbRect().w, tbRect().h, window.innerWidth, window.innerHeight);
      setTbPos({ x: seat.x, y: seat.y, l: seat.l, r: seat.r, t: seat.t, b: seat.b });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // keep the toolbar on screen after resizes / mode changes
  useEffect(() => {
    if (!tbPosRef.current) return;
    const resnap = () => {
      const p = tbPosRef.current;
      if (!p || tbGest.current) return;
      // only re-seat already-snapped toolbars; a floating one stays where it is
      if (p.l || p.r || p.t || p.b) tbSnap();
    };
    window.addEventListener('resize', resnap);
    return () => window.removeEventListener('resize', resnap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);
  /* Fold / unfold keeps the seated edge fixed: the new bar is positioned before paint, so it
     never opens/closes in one spot and then jumps to its corner afterwards. */
  // Layout box (offset*) instead of getBoundingClientRect: the fold/unfold morph animation
  // scales the bar, and measuring that transformed box made the bar drift on every toggle.
  const layoutBox = (el: HTMLElement) => {
    const left = el.offsetLeft, top = el.offsetTop, width = el.offsetWidth, height = el.offsetHeight;
    return { left, top, width, height, right: left + width, bottom: top + height };
  };
  const tbFoldFrom = useRef<ReturnType<typeof layoutBox> | null>(null);
  const toggleToolbar = (v: boolean) => {
    tbFoldFrom.current = toolbarRef.current ? layoutBox(toolbarRef.current) : null;
    setExpanded(v);
  };
  useLayoutEffect(() => {
    const old = tbFoldFrom.current; tbFoldFrom.current = null;
    const el = toolbarRef.current; const p = tbPosRef.current;
    if (!old || !el || !p) return;
    const r = layoutBox(el);
    const vw = window.innerWidth, vh = window.innerHeight;
    const right = p.r || (!p.l && old.left + old.width / 2 > vw / 2);
    const bottom = p.b || (!p.t && old.top + old.height / 2 > vh / 2);
    const x = right ? old.right - r.width : old.left;
    const y = bottom ? old.bottom - r.height : old.top;
    const nx = Math.max(6, Math.min(vw - r.width - 6, x)), ny = Math.max(6, Math.min(vh - r.height - 6, y));
    window.clearTimeout(tbMorphTimer.current); setTbSnapping(false);
    el.style.left = `${nx}px`; el.style.top = `${ny}px`;
    setTbPos({ ...p, x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);
  const [actionTab, setActionTab] = useState('Add');
  useEffect(() => { applyTheme(dark, accent, frost); }, [dark, accent, frost]);
  const [toast, setToast] = useState('');
  const previewTimer = useRef(0);
  const [loupe, setLoupe] = useState<null | { x: number; y: number; color: string; old: string }>(null);
  const [ghost, setGhost] = useState<null | { x: number; y: number; color: string; gliding?: boolean }>(null);
  const [drop, setDrop] = useState<null | { x: number; y: number; color: string; threshold: number; layerId: string; base: HTMLCanvasElement; continuing?: boolean }>(null);
  const [selection, setSelectionState] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const [selMode, setSelMode] = useState<SelMode>('Freehand');
  const [guide, setGuide] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  type AdjState = { name: string; value: number; params: any; base: HTMLCanvasElement; layerId: string; hist: any[]; hidden: boolean; applied: boolean };
  const [adjust, setAdjustState] = useState<null | AdjState>(null);
  const adjustRef = useRef<null | AdjState>(null);
  const setAdjust = (a: null | AdjState) => { adjustRef.current = a; setAdjustState(a); };
  const [adjMenu, setAdjMenu] = useState<null | { x: number; y: number }>(null);
  const [adjLayerHidden, setAdjLayerHidden] = useState<string | null>(null);
  const layerHist = useRef<{ id: string; stack: any[]; start: any; visible: boolean } | null>(null);
  const adjDrag = useRef<null | { client: Pt; start: any; began: boolean; t: number; doc: Pt }>(null);
  const [, setViewTick] = useState(0);
  const histCache = useRef<{ id: string; c: HTMLCanvasElement } | null>(null);
  const histFor = (id: string) => {
    if (histCache.current?.id !== id) {
      const below = layersRef.current.filter((l) => l.id !== id);
      histCache.current = { id, c: below.length ? flatten(below, bgRef.current.color, bgRef.current.visible, 256) : makeCanvas(1, 1) };
    }
    return histCache.current.c;
  };
  const overlayLive = useRef(false);
  const [cloneSet, setCloneSet] = useStored<CloneSettings>('pp.clone', { size: 30, strength: 100 });
  const [cloneSrc, setCloneSrc] = useState<Pt>({ x: 0, y: 0 });
  const cloneSrcRef = useRef(cloneSrc); cloneSrcRef.current = cloneSrc;
  const [cloneLocked, setCloneLocked] = useState(false);
  const cloneStroke = useRef<null | { snap: HTMLCanvasElement; mask: HTMLCanvasElement; tmp: HTMLCanvasElement; off: Pt; last: Pt; residual: number; travelled: number }>(null);
  const [liq, setLiq] = useStored<LiqSettings>('pp.liq', LIQ_DEFAULT);
  const [dropThreshold, setDropThreshold] = useStored('pp.dropThreshold', 34);
  const [dropSliding, setDropSliding] = useState(false);
  const [dropLive, setDropLive] = useState<number | null>(null);
  const dropRef = useRef(drop); dropRef.current = drop;
  const dropGesture = useRef<{ pts: Map<number, { x: number; y: number }>; panning: boolean; moved: boolean; pan: null | { c0: { x: number; y: number }; d0: number; a0: number; v0: View; n: number; anchor: { x: number; y: number }; r: DOMRect }; startX: number; startY: number; startT: number; raf: number; pending: number | null }>({ pts: new Map(), panning: false, moved: false, pan: null, startX: 0, startY: 0, startT: 0, raf: 0, pending: null });
  const [clipMenu, setClipMenu] = useState(false); // three-finger swipe down: cut / copy / paste
  const [tf, setTfState] = useState<Tf>({ quad: rectQuad({ x: 0, y: 0, w: 1, h: 1 }), mesh: null });
  const [tfMode, setTfModeState] = useState<'Freeform' | 'Uniform' | 'Distort' | 'Warp'>('Uniform');
  const tfModeRef = useRef(tfMode); tfModeRef.current = tfMode;
  const [snapOn, setSnapOn] = useStored<boolean>('pp.tf.snap', false);
  const [magnetics, setMagnetics] = useStored<boolean>('pp.tf.magnetics', false);
  const [snapDist, setSnapDist] = useStored<number>('pp.tf.snapDist', 12);
  const [advMesh, setAdvMesh] = useState(false);
  const [tfPanel, setTfPanel] = useState<null | 'snap' | 'interp'>(null);
  const snapRef = useRef({ on: false, mag: false, dist: 12, adv: false }); snapRef.current = { on: snapOn, mag: magnetics, dist: snapDist, adv: advMesh };
  /** live readout ("Scale 120%", "45°") and snapping guides drawn on the canvas while transforming */
  const tfHud = useRef<{ text: string | null; guides: { x?: number; y?: number; canvas: boolean }[] }>({ text: null, guides: [] });
  const [interp, setInterp] = useStored<'Nearest neighbor' | 'Bilinear' | 'Bicubic'>('pp.interp', 'Nearest neighbor');
  const interpRef = useRef(interp); interpRef.current = interp;
  const cycleInterp = () => {
    const order = ['Nearest neighbor', 'Bilinear', 'Bicubic'] as const;
    const next = order[(order.indexOf(interpRef.current) + 1) % order.length]!;
    setInterp(next);
    flash(`Interpolation: ${next}`);
  };
  const tfRef = useRef(tf);
  const floatingRef = useRef<null | { layerId: string; canvas: HTMLCanvasElement; bounds: Rect }>(null);
  const tfLive = useRef(false);
  const [floatingOn, setFloatingOn] = useState(false);
  const [textDraft, setTextDraft] = useState<null | TextDraft>(null);
  /** live text layer hidden while its edit preview is on screen */
  const textHidden = useRef<string | null>(null);
  const textPreview = useRef<HTMLCanvasElement | null>(null);
  const [historyInfo, setHistoryInfo] = useState({ undo: 0, redo: 0 });

  const view = useRef<View>({ x: 0, y: 0, scale: 1, rot: 0, flip: false });
  const undoStack = useRef<HistEntry[]>([]);
  const redoStack = useRef<HistEntry[]>([]);
  const strokeCanvas = useRef<HTMLCanvasElement | null>(null);
  const backup = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<LiveStroke | null>(null);
  const draftOverlay = useRef<null | { kind: 'lasso'; points: Pt[] } | { kind: 'rect' | 'ellipse'; from: Pt; to: Pt }>(null);
  const clipboard = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(new Set<string>());
  const blobCache = useRef(new Map<string, Blob>());
  const saveTimer = useRef<number | undefined>(undefined);
  const renderQueued = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setTf = (t: Tf) => { tfRef.current = t; setTfState(t); requestRender(); };
  const setSelection = (s: Selection | null) => { selectionRef.current = s; setSelectionState(s); requestRender(); };
  const setLayers = (next: LayerState[]) => { layersRef.current = next; setLayersState(next); };
  const setActiveId = (id: string) => { activeRef.current = id; setActiveIdState(id); };
  const setBg = (c: string) => { bgRef.current.color = c; setBgState(c); requestRender(); };
  const setBgVisible = (v: boolean) => { bgRef.current.visible = v; setBgVisibleState(v); requestRender(); };
  const active = () => layersRef.current.find((l) => l.id === activeRef.current) ?? layersRef.current[0];
  const notPixel = (l: LayerState) => {
    if ((l.kind ?? 'pixel') === 'pixel' && l.text) { flash('Text layer: tap Rasterize in its options to paint on it'); return true; }
    if ((l.kind ?? 'pixel') === 'pixel') return false;
    flash(l.kind === 'group' ? 'Select a layer inside the folder to paint' : 'Adjustment layers can’t be painted on');
    return true;
  };
  const flash = useCallback((m: string) => setToast(m), []);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 1700); return () => window.clearTimeout(t); }, [toast]);

  const docScale = Math.max(W, H) / 1500;
  const paintTool: PaintTool = tool === 'smudge' || tool === 'eraser' ? tool : 'brush';
  const brushFor = (t: PaintTool): BrushDef => brushLibrary.find((b) => b.id === brushIds[t]) ?? brushLibrary[0];
  const sizePx = (t: PaintTool) => Math.max(1, brushFor(t).maxSize * Math.pow(sizes[t], 1.7) * Math.max(docScale, 0.02) * 2.2);
  const colorRef = useRef(color); colorRef.current = color;
  const paintToolRef = useRef(paintTool); paintToolRef.current = paintTool;
  const sliderPreview = useRef<null | { kind: 'size' | 'opacity'; value: number }>(null);

  /* ---------- load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored: StoredLayer[] = artwork.layers?.length ? artwork.layers : [{ id: makeId(), name: 'Layer 1', visible: true }];
      const built: LayerState[] = [];
      for (const s of stored) {
        const c = makeCanvas(W, H);
        if (s.image) {
          try { const img = await loadImage(s.image); ctx2d(c).drawImage(img, 0, 0, W, H); } catch { /* skip broken layer */ }
          if (s.image instanceof Blob) blobCache.current.set(s.id, s.image);
        }
        built.push({ id: s.id, name: s.name, visible: s.visible !== false, opacity: s.opacity ?? 1, blend: s.blend ?? 'source-over', locked: !!s.locked, alphaLock: !!s.alphaLock, kind: s.kind ?? 'pixel', parent: s.parent, collapsed: s.collapsed, clip: s.clip, adjust: s.adjust, canvas: c });
      }
      if (cancelled) return;
      strokeCanvas.current = makeCanvas(W, H);
      backup.current = makeCanvas(W, H);
      setLayers(built);
      setActiveId(built[0].id);
      setReady(true);
      fitView();
      const ss = artwork.selection;
      if (ss?.outlines?.[0]?.length) { const sel = ss.inverted ? buildSelection(ss.outlines[0], true) : buildSel(ss.outlines); if (sel) setSelection(sel); }
      // undo/redo history survives leaving the canvas; never wipe stacks the user
      // already started building while the async load was in flight
      void loadHistory(artwork.id).then((h) => {
        if (cancelled) return;
        historyLoaded.current = true; // only now may saves replace the stored stacks
        if (!h) { if (undoStack.current.length || redoStack.current.length) void saveHistory(artwork.id, undoStack.current, redoStack.current); return; }
        if (undoStack.current.length > 0 || redoStack.current.length > 0) {
          // edits made while loading are newer: keep them on top of the saved undo steps;
          // the saved redo branch no longer applies once new edits exist
          undoStack.current = [...h.undo, ...undoStack.current];
          void saveHistory(artwork.id, undoStack.current, redoStack.current);
        } else {
          undoStack.current = h.undo;
          redoStack.current = h.redo;
        }
        setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- view & rendering ---------- */
  const matrix = () => {
    const v = view.current;
    return new DOMMatrix().translate(v.x, v.y).rotate(v.rot).scale(v.scale * (v.flip ? -1 : 1), v.scale);
  };
  const toDoc = (clientX: number, clientY: number): Pt => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const p = matrix().inverse().transformPoint(new DOMPoint(clientX - r.left, clientY - r.top));
    return { x: p.x, y: p.y };
  };
  const toScreen = (p: Pt): Pt => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const q = matrix().transformPoint(new DOMPoint(p.x, p.y));
    return { x: q.x + r.left, y: q.y + r.top };
  };
  function fitView() {
    const el = wrapRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.min(cw / W, ch / H);
    view.current = { x: (cw - W * s) / 2, y: (ch - H * s) / 2, scale: s, rot: 0, flip: view.current.flip };
    if (view.current.flip) view.current.x += W * s;
    requestRender();
  }

  const smoothFor = () => interpRef.current !== 'Nearest neighbor';

  const render = () => {
    renderQueued.current = false;
    if (overlayLive.current) setViewTick((t) => (t + 1) % 1e6);
    const c = viewCanvas.current;
    if (!c || !layersRef.current.length) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // workspace behind the canvas: dark in dark mode, separate from the artwork background
    ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#151517' : WORKSPACE;
    ctx.fillRect(0, 0, c.width, c.height);
    const m = new DOMMatrix().scale(dpr, dpr).multiply(matrix());
    ctx.setTransform(m);
    ctx.imageSmoothingEnabled = view.current.scale < 2;
    ctx.save();
    ctx.shadowColor = document.documentElement.classList.contains('dark') ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (!bgRef.current.visible) {
      // transparency checkerboard
      const sz = Math.max(8, 14 / view.current.scale);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e9e9e9';
      for (let y = 0; y < H; y += sz) for (let x = (Math.floor(y / sz) % 2) * sz; x < W; x += sz * 2) ctx.fillRect(x, y, sz, sz);
    }
    const f = floatingRef.current;
    const floating: Floating | null = f ? { layerId: f.layerId, canvas: f.canvas, paint: (cx) => {
      cx.imageSmoothingQuality = interpRef.current === 'Bicubic' ? 'high' : 'medium';
      drawTransformed(cx, f.canvas, f.bounds, f.bounds.x, f.bounds.y, tfRef.current, tfLive.current ? 'live' : 'final', smoothFor());
    } } : null;
    const hiddenText = textPreview.current ? textHidden.current : null;
    const renderedLayers0 = hiddenText ? layersRef.current.filter((l) => l.id !== hiddenText) : layersRef.current;
    const renderedLayers = fillReveal.current ? renderedLayers0.map((layer) => layer.id === fillReveal.current?.layerId ? { ...layer, canvas: fillReveal.current.canvas } : layer) : renderedLayers0;
    composite(ctx, renderedLayers, bgRef.current.color, bgRef.current.visible, { stroke: live.current, floating, texture: texRef.current });
    if (textPreview.current) ctx.drawImage(textPreview.current, 0, 0);
    if (guideRef.current) {
      const step = Math.max(W, H) / 12;
      ctx.strokeStyle = 'rgba(0,122,255,0.35)';
      ctx.lineWidth = 1 / view.current.scale;
      ctx.beginPath();
      for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    ctx.restore();
    // overlays (selection, drafts, transform box)
    const lw = 1 / view.current.scale;
    const ants = (draw: () => void) => {
      ctx.save();
      ctx.lineWidth = lw * 1.2;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      draw(); ctx.stroke();
      ctx.setLineDash([5 * lw, 5 * lw]);
      ctx.strokeStyle = '#1c1c1e';
      draw(); ctx.stroke();
      ctx.restore();
    };
    const sel = selectionRef.current;
    if (sel && !f) {
      const outline = () => { ctx.beginPath(); sel.outlines.forEach((o) => { o.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }); };
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      sel.outlines.forEach((o) => { o.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); });
      const vis = Math.max(0, Math.min(1, (prefsRef.current.selMaskVis ?? 50) / 100));
      if (toolRef.current === 'select') {
        // selecting: selected area tinted, marching outline
        ctx.globalAlpha = 0.18 + vis * 0.2;
        ctx.fillStyle = '#0a84ff';
        outline(); ctx.fill('evenodd');
      } else {
        // committed: semi-transparent diagonal lines outside the selection
        ctx.clip('evenodd');
        ctx.globalAlpha = 0.25 + vis * 0.6;
        ctx.fillStyle = selStripes(ctx, lw);
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      ants(outline);
    }
    const d = draftOverlay.current;
    if (d) {
      ants(() => {
        ctx.beginPath();
        if (d.kind === 'lasso') d.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        else if (d.kind === 'rect') ctx.rect(Math.min(d.from.x, d.to.x), Math.min(d.from.y, d.to.y), Math.abs(d.to.x - d.from.x), Math.abs(d.to.y - d.from.y));
        else ctx.ellipse((d.from.x + d.to.x) / 2, (d.from.y + d.to.y) / 2, Math.abs(d.to.x - d.from.x) / 2 || 1, Math.abs(d.to.y - d.from.y) / 2 || 1, 0, 0, Math.PI * 2);
      });
      if (d.kind === 'lasso' && d.points.length) {
        // the origin shows a gray circle: tap it to close the selection
        const o = d.points[0]!;
        ctx.save(); ctx.beginPath(); ctx.arc(o.x, o.y, 11 * lw, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(142,142,147,0.85)'; ctx.fill(); ctx.lineWidth = 1.5 * lw; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
      }
    }
    if (f && floating) {
      const t = tfRef.current, q = t.quad;
      const accent = '#0a84ff';
      ctx.save();
      ctx.lineWidth = lw * 1.5;
      if (t.mesh) {
        // Warp: solid border + mesh lines through the surface
        const P = patch(t.mesh);
        ctx.strokeStyle = accent;
        ctx.beginPath();
        for (let k = 0; k <= 3; k++) {
          for (let i = 0; i <= 24; i++) { const pt = P(i / 24, k / 3); i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y); }
          for (let i = 0; i <= 24; i++) { const pt = P(k / 3, i / 24); i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y); }
        }
        ctx.stroke();
      } else {
        ctx.beginPath(); q.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
        ctx.setLineDash([6 * lw, 4 * lw]); ctx.lineDashOffset = -(performance.now() / 60) % (10 * lw);
        ctx.strokeStyle = accent; ctx.stroke(); ctx.setLineDash([]);
      }
      const node = (pt: Pt, fill: string, r = 7) => { ctx.beginPath(); ctx.arc(pt.x, pt.y, r * lw, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw * 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); };
      for (const h of tfHandles()) node(h.p, h.kind === 'rotate' ? '#34c759' : accent, h.kind === 'rotate' ? 7.5 : 7);
      // snapping guides: blue to other content, yellow to the canvas
      for (const g of tfHud.current.guides) {
        ctx.beginPath(); ctx.strokeStyle = g.canvas ? '#ffd60a' : accent; ctx.lineWidth = lw * 1.2;
        if (g.x !== undefined) { ctx.moveTo(g.x, 0); ctx.lineTo(g.x, H); } else if (g.y !== undefined) { ctx.moveTo(0, g.y); ctx.lineTo(W, g.y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (f && tfHud.current.text) {
      const d = window.devicePixelRatio || 1;
      ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
      const r = c.getBoundingClientRect();
      ctx.font = '600 14px system-ui, sans-serif';
      const tw = ctx.measureText(tfHud.current.text).width + 28;
      ctx.fillStyle = 'rgba(28,28,30,0.82)';
      ctx.beginPath(); ctx.roundRect((r.width - tw) / 2, 64, tw, 32, 16); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tfHud.current.text, r.width / 2, 80);
      ctx.restore();
    }
    // live brush size / opacity preview, drawn directly on the canvas.
    // The tip is rendered natively at the preview size so the size preview
    // truly grows with the slider, and the opacity preview shows the same
    // brush dimmed to the current opacity.
    const pv = sliderPreview.current;
    if (pv && !live.current) {
      const r = c.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const cx = r.width / 2, cy = r.height / 2;
      let rad = 36;
      ctx.save();
      const t = paintToolRef.current;
      const brush = brushFor(t);
      const s = Math.max(12, Math.min(r.width * 0.85, r.height * 0.85, sizePx(t) * view.current.scale));
      // render the tip at its native resolution (capped) — never an upscaled sprite
      const px = Math.max(16, Math.min(Math.ceil(s), 512));
      const tip = t === 'brush' ? brushTip(brush, colorRef.current, px) : eraserTip(brush, px);
      if (pv.kind === 'size') {
        ctx.drawImage(tip, cx - s / 2, cy - s / 2, s, s);
        rad = s / 2;
      } else {
        ctx.globalAlpha = pv.value;
        ctx.drawImage(tip, cx - s / 2, cy - s / 2, s, s);
        ctx.globalAlpha = 1;
        rad = s / 2;
      }
      ctx.restore();
    }
  };
  const guideRef = useRef(guide);
  guideRef.current = guide;
  function requestRender() {
    if (renderQueued.current) return;
    renderQueued.current = true;
    requestAnimationFrame(render);
  }
  useEffect(() => { requestRender(); });

  useEffect(() => {
    const resize = () => {
      const c = viewCanvas.current, el = wrapRef.current;
      if (!c || !el) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      requestRender();
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- history ---------- */
  const capture = (ids: string[], rect?: Rect, fromBackup?: HTMLCanvasElement): HistEntry => {
    const pixels = new Map<string, HistPixels>();
    for (const id of ids) {
      const l = layersRef.current.find((x) => x.id === id);
      if (!l) continue;
      const r = rect ? clipRect(rect) : { x: 0, y: 0, w: W, h: H };
      if (r.w <= 0 || r.h <= 0) continue;
      const src = fromBackup ?? l.canvas;
      pixels.set(id, { rect: r, data: src.getContext('2d', { willReadFrequently: true })!.getImageData(r.x, r.y, r.w, r.h) });
    }
    return { metas: layersRef.current.map(metaOf), activeId: activeRef.current, bg: bgRef.current.color, bgVisible: bgRef.current.visible, pixels };
  };
  const clipRect = (r: Rect): Rect => {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
  };
  const bytes = (e: HistEntry) => { let b = 0; e.pixels.forEach((p) => (b += p.data.data.length)); return b + 1000; };
  const pushEntry = (e: HistEntry) => {
    undoStack.current.push(e);
    redoStack.current = [];
    let total = undoStack.current.reduce((s, x) => s + bytes(x), 0);
    while (total > HISTORY_BYTES && undoStack.current.length > 1) total -= bytes(undoStack.current.shift()!);
    while (undoStack.current.length > Math.max(5, prefsRef.current.historyLimit || 60)) undoStack.current.shift();
    setHistoryInfo({ undo: undoStack.current.length, redo: 0 });
    persistHistory();
  };
  // Incremental, debounced IndexedDB write of both stacks (encoded snapshots are cached per entry).
  const persistHistory = () => { if (!historyLoaded.current) return; void saveHistory(artwork.id, undoStack.current, redoStack.current); };
  const pushHistory = (ids: string[] = [], rect?: Rect) => pushEntry(capture(ids, rect));
  const restore = (e: HistEntry) => {
    const byId = new Map(layersRef.current.map((l) => [l.id, l]));
    const next = e.metas.map((m) => {
      const existing = byId.get(m.id);
      const canvas = existing?.canvas ?? makeCanvas(W, H);
      return { ...m, canvas };
    });
    e.pixels.forEach((p, id) => {
      const l = next.find((x) => x.id === id);
      if (l) { l.canvas.getContext('2d')!.putImageData(p.data, p.rect.x, p.rect.y); dirty.current.add(id); }
    });
    next.forEach((l) => dirty.current.add(l.id));
    setLayers(next);
    setActiveId(next.some((l) => l.id === e.activeId) ? e.activeId : next[0].id);
    setBg(e.bg); setBgVisible(e.bgVisible);
    bump();
  };
  const inverseOf = (e: HistEntry) => {
    const ids = new Set(e.pixels.keys());
    const keep = new Set(e.metas.map((m) => m.id));
    const extra = layersRef.current.filter((l) => !keep.has(l.id)).map((l) => l.id);
    const inv = capture([...ids], undefined);
    // match rects for partial entries
    e.pixels.forEach((p, id) => {
      const l = layersRef.current.find((x) => x.id === id);
      if (l) inv.pixels.set(id, { rect: p.rect, data: l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(p.rect.x, p.rect.y, p.rect.w, p.rect.h) });
    });
    extra.forEach((id) => {
      const l = layersRef.current.find((x) => x.id === id)!;
      inv.pixels.set(id, { rect: { x: 0, y: 0, w: W, h: H }, data: l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H) });
    });
    return inv;
  };
  const undo = () => {
    finishFillWave();
    finishTransientModes();
    const e = undoStack.current.pop();
    if (!e) { flash('Nothing to undo'); return; }
    redoStack.current.push(inverseOf(e));
    restore(e);
    setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
    persistHistory();
    flash('Undo');
  };
  const redo = () => {
    finishFillWave();
    finishTransientModes();
    const e = redoStack.current.pop();
    if (!e) { flash('Nothing to redo'); return; }
    undoStack.current.push(inverseOf(e));
    restore(e);
    setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
    persistHistory();
    flash('Redo');
  };

  /* ---------- saving ---------- */
  const changedSinceOpen = useRef(false);
  const historyLoaded = useRef(false);
  const bump = () => { changedSinceOpen.current = true; setVersion((v) => v + 1); requestRender(); scheduleSave(); };
  const markDirty = (id: string) => { dirty.current.add(id); bump(); };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void save().catch(() => flash("Could not save artwork. Please try again.")); }, 1500);
  };
  const save = async (): Promise<Artwork> => {
    window.clearTimeout(saveTimer.current);
    const ls = layersRef.current;
    const stored: StoredLayer[] = [];
    for (const l of ls) {
      let blob = blobCache.current.get(l.id);
      if (!blob || dirty.current.has(l.id)) {
        blob = await canvasToBlob(l.canvas);
        blobCache.current.set(l.id, blob);
      }
      stored.push({ ...metaOf(l), image: blob });
    }
    dirty.current.clear();
    const preview = ls.length ? flatten(ls, bgRef.current.color, bgRef.current.visible, 1400, texRef.current).toDataURL(bgRef.current.visible ? 'image/jpeg' : 'image/png', 0.95) : artwork.preview;
    const next: Artwork = { ...artwork, title: titleRef.current, layers: stored, preview, background: bgRef.current.color, backgroundVisible: bgRef.current.visible, texture: textureSel.current, selection: selectionRef.current ? { outlines: selectionRef.current.outlines, inverted: selectionRef.current.inverted } : null, updated: Date.now() };
    await onSaved(next);
    return next;
  };
  const titleRef = useRef(title);
  titleRef.current = title;

  const exit = async () => {
    finishTransientModes();
    const a = await save();
    // keep the undo/redo stacks for next time, and snapshot a restorable backup
    persistHistory();
    if (changedSinceOpen.current) void saveBackup(a);
    onExit(a);
  };

  /* ---------- painting ---------- */
  type StrokeState = {
    tool: PaintTool; brush: BrushDef; tip: HTMLCanvasElement; size: number; layer: LayerState;
    last: Pt; smooth: Pt; travelled: number; residual: number; started: number; pressure: number;
    raw: Pt[]; bbox: Rect | null; smudgeBuf?: HTMLCanvasElement; shape: QuickShapeResult; shapeAnchor?: Pt;
    /** recorded dabs (seeded) so the end taper can replay the stroke exactly */
    seed?: number; dabs?: { x: number; y: number; pressure: number; travelled: number; dx?: number; dy?: number; speed?: number; tilt?: number; pickup?: string | null }[]; pickup?: string | null;
    dir?: Pt; speed?: number; lastT?: number; tilt?: number; sj?: { h: number; s: number; l: number };
  };
  const stroke = useRef<StrokeState | null>(null);
  const penTilt = useRef(1);
  const holdTimer = useRef<number | undefined>(undefined);
  const eyedropTimer = useRef<number | undefined>(undefined);
  const pickSampler = useRef<HTMLCanvasElement | null>(null);

  const beginStroke = (p: Pt, pressure: number) => {
    const layer = active();
    if (!layer) return false;
    if (notPixel(layer)) return false;
    if (layer.locked) { flash('Layer is locked'); return false; }
    if (!layer.visible) { flash('Layer is hidden'); return false; }
    const t = paintTool;
    const brush = brushFor(t);
    const size = sizePx(t);
    ctx2d(backup.current!).clearRect(0, 0, W, H);
    ctx2d(backup.current!).drawImage(layer.canvas, 0, 0);
    const st: StrokeState = { tool: t, brush, tip: t === 'brush' ? brushTip(brush, color) : eraserTip(brush), size, layer, last: p, smooth: p, travelled: 0, residual: 0, started: performance.now(), pressure, raw: [p], bbox: null, shape: null, lastT: performance.now(), speed: 0, tilt: penTilt.current, sj: strokeColorOffset(brush), seed: (Math.random() * 2 ** 31) | 0, dabs: [] };
    if (t === 'brush') {
      ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
      live.current = { layerId: layer.id, canvas: strokeCanvas.current!, alpha: opacities.brush, clip: selectionRef.current?.path ?? null, alphaLock: layer.alphaLock, blend: brushComposite(brush.blendMode) };
    }
    if (t === 'smudge') {
      const s = Math.ceil(size) + 2;
      const buf = makeCanvas(s, s);
      ctx2d(buf).drawImage(layer.canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
      st.smudgeBuf = buf;
    }
    stroke.current = st;
    dab(st, p, pressure);
    requestRender();
    return true;
  };

  /** Wet Mix pull: colour of the committed layer under the brush (sampled every few dabs). */
  const pickupAt = (st: StrokeState, p: Pt) => {
    const n = st.dabs?.length ?? 0;
    if (n % 3 !== 0 && st.pickup !== undefined) return st.pickup;
    if (!pickSampler.current) { pickSampler.current = makeCanvas(1, 1); }
    const sc = pickSampler.current.getContext('2d', { willReadFrequently: true })!;
    const r = Math.max(2, st.size * 0.25);
    sc.clearRect(0, 0, 1, 1);
    sc.drawImage(st.layer.canvas, p.x - r, p.y - r, r * 2, r * 2, 0, 0, 1, 1);
    const d = sc.getImageData(0, 0, 1, 1).data;
    st.pickup = d[3]! < 24 ? null : '#' + [d[0]!, d[1]!, d[2]!].map((v) => v.toString(16).padStart(2, '0')).join('');
    return st.pickup;
  };
  const dab = (st: StrokeState, p: Pt, pressure: number) => {
    const sel = selectionRef.current;
    const rec = st.dabs && st.dabs.length < 40000 ? { x: p.x, y: p.y, pressure, travelled: st.travelled, dx: st.dir?.x, dy: st.dir?.y, speed: st.speed, tilt: st.tilt, pickup: undefined as string | null | undefined } : null;
    const rng = seededRng((st.seed ?? 1) + (st.dabs?.length ?? 0) * 7919);
    if (st.tool === 'brush') {
      const c = ctx2d(strokeCanvas.current!);
      const pickup = (st.brush.pull ?? 0) > 0 ? pickupAt(st, p) : null;
      if (rec) rec.pickup = pickup;
      const s = stampDab(c, st.tip, st.brush, { ...p, pressure, travelled: st.travelled, dx: st.dir?.x, dy: st.dir?.y, speed: st.speed, tilt: st.tilt, color: colorRef.current, strokeJitter: st.sj, rng, pickup }, st.size);
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
      if (rec) st.dabs!.push(rec);
    } else if (st.tool === 'eraser') {
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (sel) c.clip(sel.path, 'evenodd');
      c.globalCompositeOperation = 'destination-out';
      if (rec) st.dabs!.push(rec);
      const s = stampDab(c, st.tip, st.brush, { ...p, pressure, travelled: st.travelled, dx: st.dir?.x, dy: st.dir?.y, speed: st.speed, tilt: st.tilt, rng }, st.size, opacities.eraser);
      c.restore();
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
    } else if (st.smudgeBuf) {
      const buf = st.smudgeBuf;
      const s = buf.width;
      const masked = makeCanvas(s, s);
      const mc = ctx2d(masked);
      mc.drawImage(buf, 0, 0);
      mc.globalCompositeOperation = 'destination-in';
      mc.drawImage(st.tip, 0, 0, s, s);
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (sel) c.clip(sel.path, 'evenodd');
      if (st.layer.alphaLock) c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = opacities.smudge * (0.35 + 0.65 * pressure);
      c.drawImage(masked, p.x - s / 2, p.y - s / 2);
      c.restore();
      const bc = ctx2d(buf);
      bc.globalAlpha = 0.25;
      bc.drawImage(st.layer.canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, s, s);
      bc.globalAlpha = 1;
      st.bbox = unionRect(st.bbox, { x: p.x - s, y: p.y - s, w: s * 2, h: s * 2 });
    }
  };

  const strokeTo = (st: StrokeState, target: Pt, pressure: number) => {
    // per-brush StreamLine / Stabilization / Motion filtering (Procreate Brush Studio)
    const b = st.brush;
    const smoothing = Math.max(streamline, b.streamline ?? 0, (b.stabilization ?? 0) * 0.95, (b.motionFiltering ?? 0) * 0.8);
    const k = 1 - (Math.min(100, smoothing) / 100) * 0.88;
    pressure = st.pressure + (pressure - st.pressure) * (0.45 * (1 - (b.pressureSmoothing ?? 0) * 0.8));
    const sm = { x: st.smooth.x + (target.x - st.smooth.x) * k, y: st.smooth.y + (target.y - st.smooth.y) * k };
    st.smooth = sm;
    const dx = sm.x - st.last.x, dy = sm.y - st.last.y;
    const dist = Math.hypot(dx, dy);
    const now = performance.now();
    const dt = Math.max(1, now - (st.lastT ?? now));
    st.speed = (st.speed ?? 0) * 0.7 + (dist / dt) * 0.3;
    st.lastT = now;
    if (dist > 0) st.dir = { x: dx, y: dy };
    const base = Math.max(0.4, st.size * b.spacing);
    const jit = () => (b.spacingJitter ? base * (1 + (Math.random() - 0.5) * 1.6 * b.spacingJitter) : base);
    let spacing = jit();
    let d = spacing - st.residual;
    while (d <= dist) {
      const t = d / dist;
      const pt = { x: st.last.x + dx * t, y: st.last.y + dy * t };
      st.travelled += spacing;
      const pr = st.pressure + (pressure - st.pressure) * t;
      dab(st, pt, pr);
      spacing = jit();
      d += spacing;
    }
    st.residual = Math.max(0, dist - (d - spacing));
    st.last = sm;
    st.pressure = pressure;
  };

  const redrawShape = (st: StrokeState) => {
    const s = st.shape;
    if (!s) return;
    if (st.tool === 'brush') ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
    else { const c = ctx2d(st.layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(backup.current!, 0, 0); }
    let pts: Pt[] = [];
    if (s.kind === 'line') pts = [s.from, s.to];
    else if (s.kind === 'rect') pts = [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }, { x: s.x, y: s.y }];
    else {
      const n = 160;
      for (let i = 0; i <= n; i++) pts.push({ x: s.cx + Math.cos((i / n) * Math.PI * 2) * s.rx, y: s.cy + Math.sin((i / n) * Math.PI * 2) * s.ry });
    }
    st.travelled = st.size * 10; st.residual = 0; st.last = pts[0]; st.smooth = pts[0]; st.pressure = 1;
    const savedStream = streamline;
    dab(st, pts[0], 1);
    for (const p of pts.slice(1)) {
      // bypass streamline while tracing a perfect shape
      const dx = p.x - st.last.x, dy = p.y - st.last.y;
      const dist = Math.hypot(dx, dy);
      const spacing = Math.max(0.4, st.size * st.brush.spacing);
      for (let d = spacing; d <= dist; d += spacing) dab(st, { x: st.last.x + (dx * d) / dist, y: st.last.y + (dy * d) / dist }, 1);
      st.last = p;
    }
    void savedStream;
    requestRender();
  };

  const triggerQuickShape = () => {
    const st = stroke.current;
    if (!st || st.tool === 'smudge' || st.shape || !prefsRef.current.shapeDetection) return;
    const s = detectShape(st.raw);
    if (!s) return;
    let shape = s;
    if (s.kind === 'ellipse' && s.circle) { const r = (s.rx + s.ry) / 2; shape = { ...s, rx: r, ry: r }; }
    st.shape = shape;
    st.shapeAnchor = st.raw[st.raw.length - 1];
    redrawShape(st);
    flash(`QuickShape · ${shape.kind === 'line' ? 'Line' : shape.kind === 'rect' ? 'Rectangle' : (shape as { circle: boolean }).circle ? 'Circle' : 'Ellipse'}`);
  };

  const adjustShape = (st: StrokeState, p: Pt) => {
    const s = st.shape;
    if (!s || !st.shapeAnchor) return;
    if (s.kind === 'line') st.shape = { ...s, to: p };
    else if (s.kind === 'rect') st.shape = { ...s, w: p.x - s.x, h: p.y - s.y };
    else {
      const a = st.shapeAnchor;
      const k = Math.hypot(p.x - s.cx, p.y - s.cy) / Math.max(1, Math.hypot(a.x - s.cx, a.y - s.cy));
      st.shape = { ...s, rx: s.rx * k, ry: s.ry * k };
      st.shapeAnchor = p;
    }
    redrawShape(st);
  };

  const endStroke = () => {
    window.clearTimeout(holdTimer.current);
    const st = stroke.current;
    if (!st) return;
    stroke.current = null;
    const rect = st.shape || st.tool !== 'brush' ? { x: 0, y: 0, w: W, h: H } : st.bbox ?? { x: 0, y: 0, w: 1, h: 1 };
    const fullRect = st.shape ? { x: 0, y: 0, w: W, h: H } : rect;
    pushEntry(capture([st.layer.id], fullRect, backup.current!));
    // End taper: replay the recorded (seeded) dabs with the tail thinning out. Identical
    // randomness means only the end of the stroke changes when the finger lifts.
    const endLen = st.size * 6 * (st.brush.taperEnd ?? 0);
    if (endLen > 0 && !st.shape && st.dabs && st.dabs.length > 1 && st.dabs.length < 40000 && (st.tool === 'brush' || st.tool === 'eraser')) {
      const T = st.travelled;
      const replay = (c: CanvasRenderingContext2D, eraser: boolean) => {
        st.dabs!.forEach((r, i) => {
          const endK = Math.max(0, Math.min(1, (T - r.travelled) / endLen));
          const rng = seededRng((st.seed ?? 1) + i * 7919);
          if (eraser) stampDab(c, st.tip, st.brush, { ...r, rng, endK }, st.size, opacities.eraser);
          else stampDab(c, st.tip, st.brush, { ...r, color: colorRef.current, strokeJitter: st.sj, rng, endK }, st.size);
        });
      };
      if (st.tool === 'brush') { const c = ctx2d(strokeCanvas.current!); c.clearRect(0, 0, W, H); replay(c, false); }
      else {
        const c = ctx2d(st.layer.canvas);
        c.clearRect(0, 0, W, H); c.drawImage(backup.current!, 0, 0);
        c.save(); if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
        c.globalCompositeOperation = 'destination-out'; replay(c, true); c.restore();
      }
    }
    if (st.tool === 'brush') {
      const c = ctx2d(st.layer.canvas);
      c.save();
      if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
      c.globalAlpha = opacities.brush;
      if (st.layer.alphaLock) c.globalCompositeOperation = 'source-atop';
      else c.globalCompositeOperation = brushComposite(st.brush.blendMode);
      c.drawImage(strokeCanvas.current!, 0, 0);
      c.restore();
      ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H);
      live.current = null;
    }
    markDirty(st.layer.id);
  };

  const cancelStroke = () => {
    window.clearTimeout(holdTimer.current);
    const st = stroke.current;
    if (!st) return;
    stroke.current = null;
    if (st.tool === 'brush') { ctx2d(strokeCanvas.current!).clearRect(0, 0, W, H); live.current = null; }
    else { const c = ctx2d(st.layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(backup.current!, 0, 0); }
    requestRender();
  };

  /* ---------- eyedropper ---------- */
  const sampleAt = (p: Pt) => {
    const c = makeCanvas(1, 1);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.translate(-Math.floor(p.x), -Math.floor(p.y));
    composite(ctx, layersRef.current, bgRef.current.color, true);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const eyedropAt = (clientX: number, clientY: number, old: string) => {
    const p = toDoc(clientX, clientY);
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
    const c = sampleAt(p);
    setLoupe({ x: clientX, y: clientY, color: c, old });
  };

  const pickColor = (c: string) => {
    if (c.toLowerCase() === color.toLowerCase()) return;
    setPrevColor(color);
    setColor(c);
  };
  const commitRecent = (c: string = color) => setRecent((r) => [c, ...r.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 20));

  /* ---------- ColorDrop ---------- */
  /* ColorDrop two-finger gestures: same pan / pinch-zoom / rotate maths as the normal canvas gesture */
  const dropPanStart = (c: { x: number; y: number }, d: number, pts: { x: number; y: number }[]) => {
    const v0 = { ...view.current };
    const r = viewCanvas.current!.getBoundingClientRect();
    const a0 = pts.length >= 2 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : 0;
    const inv = new DOMMatrix().rotate(v0.rot).scale(v0.scale * (v0.flip ? -1 : 1), v0.scale).inverse();
    const anchor = inv.transformPoint(new DOMPoint(c.x - r.left - v0.x, c.y - r.top - v0.y));
    return { c0: c, d0: d, a0, v0, n: pts.length, anchor: { x: anchor.x, y: anchor.y }, r };
  };
  const dropPanMove = (g: ReturnType<typeof dropPanStart>, pts: { x: number; y: number }[]) => {
    const c = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const two = pts.length >= 2 && g.d0 > 10;
    const scale = two ? Math.max(0.02, Math.min(64, g.v0.scale * (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / g.d0))) : g.v0.scale;
    let rot = g.v0.rot;
    if (two && prefsRef.current.rotateCanvas) {
      rot = g.v0.rot + ((Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - g.a0) * 180) / Math.PI;
      const snap = Math.round(rot / 90) * 90, off = rot - snap;
      if (Math.abs(off) < 6) rot = snap + off * Math.pow(Math.abs(off) / 6, 2);
    }
    const q = new DOMMatrix().rotate(rot).scale(scale * (g.v0.flip ? -1 : 1), scale).transformPoint(new DOMPoint(g.anchor.x, g.anchor.y));
    view.current = { ...g.v0, scale, rot, x: c.x - g.r.left - q.x, y: c.y - g.r.top - q.y };
  };
  const doColorDrop = (clientX: number, clientY: number, hex: string, threshold = dropThreshold, continuing = false) => {
    finishFillWave();
    const layer = active();
    const p = toDoc(clientX, clientY);
    if (!layer || p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    const base = makeCanvas(W, H);
    ctx2d(base).drawImage(layer.canvas, 0, 0);
    pushHistory([layer.id]);
    const ref = layersRef.current.find((l) => l.id === referenceId);
    const ok = colorDrop(layer.canvas, ref ? ref.canvas : base, p.x, p.y, hex, threshold, selectionRef.current?.path ?? null, layer.alphaLock, undefined, prefsRef.current.edgeDetect);
    if (!ok) { undoStack.current.pop(); return; }
    if (!layer.visible) { layer.visible = true; setLayers([...layersRef.current]); }
    markDirty(layer.id);
    pickColor(hex);
    commitRecent(hex);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const wave = createFillWave(base, layer.canvas, p.x, p.y);
      if (wave) {
        const started = performance.now();
        fillReveal.current = { layerId: layer.id, canvas: wave.canvas };
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / FILL_WAVE_DURATION);
          wave.draw(progress); requestRender();
          if (progress < 1) fillFrame.current = requestAnimationFrame(tick);
          else { fillReveal.current = null; requestRender(); }
        };
        wave.draw(0); fillFrame.current = requestAnimationFrame(tick);
      }
    }
    setDrop({ x: p.x, y: p.y, color: hex, threshold, layerId: layer.id, base, continuing });
  };
  const redoDrop = (threshold: number) => {
    finishFillWave();
    if (!drop) return;
    const layer = layersRef.current.find((l) => l.id === drop.layerId);
    if (!layer) return;
    const c = ctx2d(layer.canvas);
    c.clearRect(0, 0, W, H);
    c.drawImage(drop.base, 0, 0);
    const ref = layersRef.current.find((l) => l.id === referenceId);
    colorDrop(layer.canvas, ref ? ref.canvas : drop.base, drop.x, drop.y, drop.color, threshold, selectionRef.current?.path ?? null, layer.alphaLock, undefined, prefsRef.current.edgeDetect);
    setDrop({ ...drop, threshold });
    setDropThreshold(threshold);
    markDirty(layer.id);
  };

  const startColorDrag = (hex: string, e: { clientX: number; clientY: number }) => {
    setPanel(null);
    setGhost({ x: e.clientX, y: e.clientY, color: hex });
    const move = (ev: PointerEvent) => setGhost({ x: ev.clientX, y: ev.clientY, color: hex });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el === viewCanvas.current) doColorDrop(ev.clientX, ev.clientY, hex);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- selection ---------- */
  const buildSel = (outlines: Pt[][]): Selection | null => {
    const loops = outlines.filter((o) => o.length >= 3);
    if (!loops.length) return null;
    const bb = boundsOf(loops);
    if (bb.w < 1 && bb.h < 1) return null;
    const path = new Path2D();
    for (const o of loops) { o.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y))); path.closePath(); }
    return { path, outlines: loops, inverted: false, bounds: clipRect(bb) };
  };
  const buildSelection = (outline: Pt[], inverted = false): Selection | null => {
    if (!inverted) return buildSel([outline]);
    return buildSel(trace(invertMask(rasterize([outline], W, H))));
  };
  /** Add / Remove a shape to the current selection (Procreate's Add / Remove buttons). */
  const applySel = (shape: Pt[][], op: 'add' | 'remove') => {
    const cur = selectionRef.current;
    if (!cur) { if (op === 'add') { const n = buildSel(shape); if (n) { setSelection(n); lastSel.current = n.outlines; } } return; }
    const m = combine(rasterize(cur.outlines, W, H), rasterize(shape, W, H), op);
    const n = maskEmpty(m) ? null : buildSel(trace(m));
    setSelection(n);
    if (n) lastSel.current = n.outlines;
  };
  const lastSel = useRef<Pt[][] | null>(null);
  const floodCache = useRef<{ key?: HTMLCanvasElement; data?: Uint8ClampedArray }>({});
  /** Automatic selection session: the seed, the selection before it, and the live threshold. */
  const selClose = useRef(false);
  const [selPanel, setSelPanel] = useState<null | 'feather' | 'saved'>(null);
  const [feather, setFeather] = useState(20);
  const selHold = useRef<{ t: number; fired: boolean }>({ t: 0, fired: false });
  const reloadSelection = () => {
    const l = lastSel.current ?? selectionRef.current?.outlines;
    if (!l) { flash('No previous selection'); return; }
    if (floatingRef.current) commitTransform();
    const n = buildSel(l);
    setSelection(n);
    setTool('select');
    flash('Mask Reloaded');
  };
  const autoSel = useRef<null | { p: Pt; base: Pt[][] | null; thr: number; client: Pt; t: number; holding: boolean; raf: number }>(null);
  const autoThreshold = useRef(30);
  const runAuto = (p: Pt, base: Pt[][] | null, thr: number) => {
    const layer = active();
    if (!layer) return;
    let m = floodMask(layer.canvas, W, H, p.x, p.y, thr, floodCache.current);
    if (base) m = combine(rasterize(base, W, H), m, 'add');
    const n = maskEmpty(m) ? null : buildSel(trace(m));
    setSelection(n);
    if (n) lastSel.current = n.outlines;
  };
  /** commits an unfinished Freehand / Rectangle / Ellipse draft */
  const commitDraft = (op: 'add' | 'remove' = 'add') => {
    const d = draftOverlay.current;
    draftOverlay.current = null;
    if (!d) return false;
    const outline = d.kind === 'lasso' ? d.points : d.kind === 'rect' ? rectPts(d.from, d.to) : ellipsePts(d.from, d.to);
    if (outline.length >= 3) applySel([outline], op);
    requestRender();
    return true;
  };
  const featherSel = (px: number) => {
    const cur = selectionRef.current;
    if (!cur || px <= 0) return;
    const n = buildSel(trace(rasterize(cur.outlines, W, H, px)));
    setSelection(n); if (n) lastSel.current = n.outlines;
  };
  const [savedSels, setSavedSels] = useState<{ id: string; name: string; outlines: Pt[][]; thumb: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem(`pp.sels.${artwork.id}`) ?? '[]'); } catch { return []; }
  });
  const saveCurrentSel = () => {
    const cur = selectionRef.current;
    if (!cur) { flash('Make a selection first'); return; }
    const t = document.createElement('canvas'); const k = 64 / Math.max(W, H); t.width = Math.max(1, Math.round(W * k)); t.height = Math.max(1, Math.round(H * k));
    const c = t.getContext('2d')!; c.fillStyle = '#3a3a3c'; c.fillRect(0, 0, t.width, t.height); c.scale(k, k); c.fillStyle = '#fff'; c.fill(cur.path, 'evenodd');
    const next = [...savedSels, { id: `s${Date.now()}`, name: `Selection ${savedSels.length + 1}`, outlines: cur.outlines.map((o) => o.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))), thumb: t.toDataURL() }];
    setSavedSels(next);
    try { localStorage.setItem(`pp.sels.${artwork.id}`, JSON.stringify(next)); } catch { flash('Saved for this session only'); }
  };
  const deleteSavedSel = (id: string) => {
    const next = savedSels.filter((x) => x.id !== id);
    setSavedSels(next);
    try { localStorage.setItem(`pp.sels.${artwork.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const ellipsePts = (a: Pt, b: Pt) => {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    return Array.from({ length: 96 }, (_, i) => ({ x: cx + Math.cos((i / 96) * Math.PI * 2) * rx, y: cy + Math.sin((i / 96) * Math.PI * 2) * ry }));
  };
  const rectPts = (a: Pt, b: Pt) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

  const selectionAction = (a: 'invert' | 'clear' | 'fill' | 'delete' | 'copy-paste' | 'all') => {
    const sel = selectionRef.current;
    const layer = active();
    if (a === 'all') { setSelection(buildSelection([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }])); return; }
    if (!sel) { flash('Draw a selection first'); return; }
    if (a === 'clear') { setSelection(null); draftOverlay.current = null; return; }
    if (a === 'invert') { const n = buildSel(trace(invertMask(rasterize(sel.outlines, W, H)))); setSelection(n); if (n) lastSel.current = n.outlines; return; }
    if (!layer) return;
    if (a === 'copy-paste') { copySelection(false); pasteClipboard(); return; }
    pushHistory([layer.id]);
    const c = ctx2d(layer.canvas);
    c.save();
    c.clip(sel.path, 'evenodd');
    if (a === 'fill') { c.fillStyle = color; if (layer.alphaLock) c.globalCompositeOperation = 'source-atop'; c.fillRect(0, 0, W, H); }
    else c.clearRect(0, 0, W, H);
    c.restore();
    markDirty(layer.id);
  };

  /* ---------- clipboard ---------- */
  const copySelection = (cut: boolean) => {
    const layer = active();
    if (!layer) return;
    const sel = selectionRef.current;
    const out = makeCanvas(W, H);
    const c = ctx2d(out);
    if (sel) c.clip(sel.path, 'evenodd');
    c.drawImage(layer.canvas, 0, 0);
    clipboard.current = out;
    if (cut) {
      pushHistory([layer.id]);
      const lc = ctx2d(layer.canvas);
      lc.save(); if (sel) lc.clip(sel.path, 'evenodd'); lc.clearRect(0, 0, W, H); lc.restore();
      markDirty(layer.id);
    }
    flash(cut ? 'Cut' : 'Copied');
  };
  const pasteClipboard = () => {
    if (!clipboard.current) { flash('Clipboard is empty'); return; }
    const l = insertLayer('Pasted Layer');
    ctx2d(l.canvas).drawImage(clipboard.current, 0, 0);
    markDirty(l.id);
  };

  /* ---------- layers ---------- */
  const insertLayer = (name?: string, opts?: { kind?: 'pixel' | 'adjust' | 'group'; adjust?: { name: string; value: number } }) => {
    pushHistory([]);
    const cur = active();
    const idx = Math.max(0, layersRef.current.findIndex((l) => l.id === activeRef.current));
    const count = layersRef.current.filter((l) => (l.kind ?? 'pixel') === 'pixel').length + 1;
    // inside an open folder the new layer joins it; otherwise it sits above the active row
    const intoGroup = cur?.kind === 'group' && !cur.collapsed;
    const parent = intoGroup ? cur.id : cur?.parent;
    const l: LayerState = { id: makeId(), name: name ?? `Layer ${count}`, visible: true, opacity: 1, blend: 'source-over', locked: false, alphaLock: false, kind: opts?.kind ?? 'pixel', parent: opts?.kind === 'group' ? undefined : parent, adjust: opts?.adjust, canvas: makeCanvas(W, H) };
    const next = [...layersRef.current];
    const at = l.kind === 'group' && cur?.parent ? blockRange(next, cur.parent)[0] : intoGroup ? idx + 1 : idx;
    next.splice(Math.max(0, at), 0, l);
    setLayers(next);
    setActiveId(l.id);
    dirty.current.add(l.id);
    bump();
    return l;
  };
  const updateLayer = (id: string, patch: Partial<LayerState>) => {
    pushHistory([]);
    setLayers(layersRef.current.map((l) => (l.id === id ? Object.assign(l, patch) : l)));
    bump();
  };
  /** Pinch-to-merge / merge-selected: flattens the given pixel layers (keeping their stacking,
   *  blend and opacity) into the lowest one, as one undo step. */
  const mergeLayers = (ids: string[]) => {
    const ls = layersRef.current;
    const picked = ls.filter((l) => ids.includes(l.id));
    if (picked.length < 2) return;
    if (picked.some((l) => (l.kind ?? 'pixel') !== 'pixel')) { flash('Only pixel layers can be merged'); return; }
    if (picked.some((l) => l.locked)) { flash('A locked layer can’t be merged'); return; }
    const bottom = picked[picked.length - 1]!;
    pushHistory(picked.map((l) => l.id));
    const out = makeCanvas(W, H);
    composite(ctx2d(out), picked.map((x) => ({ ...x, parent: undefined, clip: false })), '#000', false);
    const c = ctx2d(bottom.canvas); c.clearRect(0, 0, W, H); c.drawImage(out, 0, 0);
    bottom.opacity = 1; bottom.blend = 'source-over'; bottom.text = undefined;
    const gone = new Set(picked.slice(0, -1).map((l) => l.id));
    setLayers(ls.filter((l) => !gone.has(l.id)));
    setActiveId(bottom.id); markDirty(bottom.id); bump();
    flash(`Merged ${picked.length} layers`);
  };
  const layerAction = (id: string, a: 'duplicate' | 'delete' | 'clear' | 'merge' | 'rename' | 'fill' | 'select' | 'flatten' | 'invert') => {
    const ls = layersRef.current;
    const idx = ls.findIndex((l) => l.id === id);
    const l = ls[idx];
    if (!l) return;
    if (a === 'duplicate') {
      pushHistory([]);
      const [bs, be] = blockRange(ls, id);
      const gid = makeId();
      const copies: LayerState[] = ls.slice(bs, be).map((x, k) => {
        const c: LayerState = { ...metaOf(x), id: k === 0 ? gid : makeId(), name: k === 0 ? `${x.name} copy` : x.name, parent: k === 0 ? x.parent : gid, canvas: makeCanvas(W, H) };
        ctx2d(c.canvas).drawImage(x.canvas, 0, 0);
        dirty.current.add(c.id);
        return c;
      });
      const next = [...ls]; next.splice(idx, 0, ...copies);
      setLayers(next); setActiveId(gid); bump();
    } else if (a === 'delete') {
      const [bs, be] = blockRange(ls, id);
      const doomed = new Set(ls.slice(bs, be).map((x) => x.id));
      if (!ls.some((x) => !doomed.has(x.id) && (x.kind ?? 'pixel') === 'pixel')) {
        if ((l.kind ?? 'pixel') === 'pixel') { pushHistory([l.id]); ctx2d(l.canvas).clearRect(0, 0, W, H); markDirty(l.id); }
        else flash('A canvas needs at least one layer');
        return;
      }
      pushHistory([...doomed]);
      const next = ls.filter((x) => !doomed.has(x.id));
      setLayers(next);
      setActiveId(next[Math.min(idx, next.length - 1)].id);
      bump();
    } else if (a === 'clear') {
      pushHistory([l.id]); ctx2d(l.canvas).clearRect(0, 0, W, H); markDirty(l.id);
    } else if (a === 'fill') {
      pushHistory([l.id]);
      const c = ctx2d(l.canvas); c.save(); if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
      if (l.alphaLock) c.globalCompositeOperation = 'source-atop';
      c.fillStyle = color; c.fillRect(0, 0, W, H); c.restore(); markDirty(l.id);
    } else if (a === 'invert') {
      pushHistory([l.id]);
      const c = l.canvas.getContext('2d', { willReadFrequently: true })!;
      const img = c.getImageData(0, 0, W, H);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; }
      c.putImageData(img, 0, 0); markDirty(l.id);
    } else if (a === 'merge') {
      if (l.kind === 'group') {
        // collapse the folder into one layer that keeps the folder's blend + opacity
        const kids = ls.filter((x) => x.parent === id);
        pushHistory([id, ...kids.map((x) => x.id)]);
        const out = makeCanvas(W, H);
        composite(ctx2d(out), kids.map((x) => ({ ...x, parent: undefined })), '#000', false);
        ctx2d(l.canvas).clearRect(0, 0, W, H); ctx2d(l.canvas).drawImage(out, 0, 0);
        const kidIds = new Set(kids.map((x) => x.id));
        setLayers(ls.filter((x) => !kidIds.has(x.id)).map((x) => (x.id === id ? Object.assign(x, { kind: 'pixel' as const, collapsed: undefined }) : x)));
        dirty.current.add(id); bump(); flash('Folder merged into one layer');
        return;
      }
      const sibs = ls.filter((x) => x.parent === l.parent);
      const below = sibs[sibs.indexOf(l) + 1];
      if (!below) { flash('No layer below'); return; }
      if ((below.kind ?? 'pixel') !== 'pixel') { flash(below.kind === 'group' ? 'Merge the folder first' : 'Can’t merge onto an adjustment layer'); return; }
      pushHistory([l.id, below.id]);
      const c = ctx2d(below.canvas);
      if (l.kind === 'adjust') {
        // bake the adjustment into the layer below
        if (l.visible && l.adjust && l.adjust.value > 0) {
          const fx = makeCanvas(W, H); ctx2d(fx).drawImage(below.canvas, 0, 0);
          applyCanvasEffect(fx, l.adjust.name, l.adjust.value, l.adjust.params);
          c.save();
          if (l.opacity >= 0.999 && l.blend === 'source-over') c.globalCompositeOperation = 'copy';
          else { c.globalAlpha = l.opacity; c.globalCompositeOperation = l.blend; }
          c.drawImage(fx, 0, 0); c.restore();
        }
      } else {
        // a clipping mask only shows where the layer it's clipped to has pixels: bake that in
        let src: HTMLCanvasElement = l.canvas;
        if (l.clip) {
          src = makeCanvas(W, H);
          const sx = ctx2d(src); sx.drawImage(l.canvas, 0, 0);
          sx.globalCompositeOperation = 'destination-in'; sx.drawImage(below.canvas, 0, 0);
        }
        c.save(); c.globalAlpha = l.opacity; c.globalCompositeOperation = l.clip && l.blend === 'source-over' ? 'source-atop' : l.blend; if (l.visible) c.drawImage(src, 0, 0); c.restore();
      }
      setLayers(ls.filter((x) => x.id !== id)); setActiveId(below.id); dirty.current.add(below.id); bump();
    } else if (a === 'flatten') {
      pushHistory(ls.map((x) => x.id));
      const out = makeCanvas(W, H);
      composite(ctx2d(out), ls, bgRef.current.color, false);
      const base = ls[ls.length - 1];
      ctx2d(base.canvas).clearRect(0, 0, W, H);
      ctx2d(base.canvas).drawImage(out, 0, 0);
      const merged = { ...base, opacity: 1, blend: 'source-over' as const, visible: true, name: 'Layer 1', kind: 'pixel' as const, parent: undefined, adjust: undefined, collapsed: undefined };
      setLayers([merged]); setActiveId(merged.id); dirty.current.add(merged.id); bump();
    } else if (a === 'rename') {
      const name = window.prompt('Layer name', l.name);
      if (name) updateLayer(id, { name });
    } else if (a === 'select') {
      // Select layer contents: only painted pixels, respecting transparency
      const m = alphaMask(l.canvas, W, H);
      if (maskEmpty(m)) { flash('Layer is empty'); return; }
      const n = buildSel(trace(m));
      setSelection(n); if (n) lastSel.current = n.outlines;
    }
  };
  const reorder = (from: number, to: number) => {
    pushHistory([]);
    setLayers(moveRow(layersRef.current, from, to));
    bump();
  };

  const addAdjustmentLayer = (name: string) => {
    if (name === 'Liquify') { startAdjust('Liquify'); return; }
    if (name === 'Clone') { startAdjust('Clone'); return; }
    const params = defaultParams(name as AdjustmentName);
    insertLayer(adjustShort(name), { kind: 'adjust', adjust: { name, value: layerValueOf(name, params), params } });
    flash(`${adjustShort(name)} adjustment layer added`);
  };
  const addGroup = () => {
    const cur = active();
    const l = insertLayer('New Group', { kind: 'group' });
    // Procreate drops the active layer into the new folder
    if (cur && (cur.kind ?? 'pixel') !== 'group' && !cur.parent) {
      setLayers(moveRow(layersRef.current.map((x) => (x.id === l.id ? Object.assign(x, { collapsed: false }) : x)),
        visibleRows(layersRef.current).findIndex((x) => x.id === cur.id), visibleRows(layersRef.current).findIndex((x) => x.id === l.id) + 1));
      bump();
    }
  };
  const setAdjustValue = (id: string, value: number) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (!l?.adjust) return;
    l.adjust = { ...l.adjust, value };
    setLayers([...layersRef.current]);
    bump();
  };
  const selectAll = () => {
    setSelection(buildSelection(rectPts({ x: 0, y: 0 }, { x: W, y: H })));
    setTool('select');
    flash('Selected all');
  };
  const chooseTexture = (id: string | null) => {
    pushHistory([]);
    const def = textures.find((t) => t.id === id);
    const next = def ? { id: def.id, strength: def.strength } : null;
    setTextureState(next); textureSel.current = next;
    if (!next) { texRef.current = null; requestRender(); }
    scheduleSave();
    flash(def ? `Canvas: ${def.name}` : 'Texture removed');
  };

  /* ---------- transform ---------- */
  /** tight bounds of painted pixels inside rect (bounding box = exact content size, like Procreate) */
  const contentBounds = (canvas: HTMLCanvasElement, r: Rect): Rect | null => {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(W, Math.ceil(r.x + r.w)), y1 = Math.min(H, Math.ceil(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) return null;
    const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const w = x1 - x0, h = y1 - y0;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) { const row = y * w * 4; for (let x = 0; x < w; x++) if (d[row + x * 4 + 3]! > 2) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    if (maxX < 0) return null;
    return { x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  const startTransform = () => {
    const layer = active();
    if (!layer || floatingRef.current) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    const sel = selectionRef.current;
    const area = sel ? sel.bounds : { x: 0, y: 0, w: W, h: H };
    const b = contentBounds(layer.canvas, area) ?? (sel ? { x: Math.floor(area.x), y: Math.floor(area.y), w: Math.max(1, Math.ceil(area.w)), h: Math.max(1, Math.ceil(area.h)) } : null);
    if (!b) { flash('Nothing to transform on this layer'); return; }
    pushHistory([layer.id]);
    // floating content is cropped to its bounds: every live frame draws only what moves
    const fc = makeCanvas(b.w, b.h);
    const c = ctx2d(fc);
    c.translate(-b.x, -b.y);
    if (sel) { c.save(); c.clip(sel.path, 'evenodd'); }
    c.drawImage(layer.canvas, 0, 0);
    if (sel) c.restore();
    const lc = ctx2d(layer.canvas);
    lc.save(); if (sel) lc.clip(sel.path, 'evenodd'); else { lc.beginPath(); lc.rect(b.x, b.y, b.w, b.h); lc.clip(); } lc.clearRect(0, 0, W, H); lc.restore();
    floatingRef.current = { layerId: layer.id, canvas: fc, bounds: b };
    setFloatingOn(true);
    setTf({ quad: rectQuad(b), mesh: tfModeRef.current === 'Warp' ? meshFromQuad(rectQuad(b)) : null });
  };
  const commitTransform = (cancel = false) => {
    const f = floatingRef.current;
    if (!f) return;
    const layer = layersRef.current.find((l) => l.id === f.layerId);
    if (layer) {
      const c = ctx2d(layer.canvas);
      c.save();
      c.imageSmoothingQuality = interpRef.current === 'Bicubic' ? 'high' : 'medium';
      if (cancel) c.drawImage(f.canvas, f.bounds.x, f.bounds.y);
      else drawTransformed(c, f.canvas, f.bounds, f.bounds.x, f.bounds.y, tfRef.current, 'final', smoothFor());
      c.restore();
      markDirty(layer.id);
    }
    floatingRef.current = null;
    tfHud.current = { text: null, guides: [] };
    setFloatingOn(false);
    setTfPanel(null);
    // once a resize/transform is applied the selection is finished with: clear it
    if (!cancel && selectionRef.current) setSelection(null);
    requestRender();
    if (cancel) undoStack.current.pop();
    else bump();
  };
  /* ---- transform editing: everything is an operation on the 4 corners (and the warp mesh) ---- */
  const applyQuad = (q0: Tf, quad: Pt[]) => {
    const mesh = q0.mesh ? q0.mesh.map(quadToQuad(q0.quad, quad)) : null;
    setTf({ quad, mesh });
  };
  const mapTf = (q0: Tf, fn: (p: Pt) => Pt) => setTf({ quad: q0.quad.map(fn), mesh: q0.mesh ? q0.mesh.map(fn) : null });
  const setTfMode = (m: 'Freeform' | 'Uniform' | 'Distort' | 'Warp') => {
    setTfModeState(m);
    const t = tfRef.current;
    if (m === 'Warp' && !t.mesh && floatingRef.current) setTf({ quad: t.quad, mesh: meshFromQuad(t.quad) });
    requestRender();
  };
  const tfReset = () => { const f = floatingRef.current; if (f) setTf({ quad: rectQuad(f.bounds), mesh: tfModeRef.current === 'Warp' ? meshFromQuad(rectQuad(f.bounds)) : null }); };
  const tfFlip = (h: boolean) => {
    const t = tfRef.current, q = t.quad;
    const quad = h ? [q[1]!, q[0]!, q[3]!, q[2]!] : [q[3]!, q[2]!, q[1]!, q[0]!];
    const mesh = t.mesh ? (h ? [0, 1, 2, 3].flatMap((j) => [3, 2, 1, 0].map((i) => t.mesh![j * 4 + i]!)) : [3, 2, 1, 0].flatMap((j) => [0, 1, 2, 3].map((i) => t.mesh![j * 4 + i]!))) : null;
    setTf({ quad, mesh });
  };
  const tfRotate45 = () => { const t = tfRef.current; mapTf(t, rotateAbout(centroid(t.quad), 45)); };
  const tfFitScreen = () => {
    const t = tfRef.current;
    const pts = t.mesh ?? t.quad;
    const bb = boundsOf([pts]);
    if (bb.w < 1 || bb.h < 1) return;
    const k = Math.min(W / bb.w, H / bb.h);
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    mapTf(t, (p) => ({ x: W / 2 + (p.x - cx) * k, y: H / 2 + (p.y - cy) * k }));
  };
  /** Handles in document space: 8 transformation nodes + the green rotation node, or warp nodes. */
  const tfHandles = (): { kind: 'corner' | 'side' | 'rotate' | 'mesh'; i: number; p: Pt; u?: number; v?: number }[] => {
    const t = tfRef.current;
    if (t.mesh) {
      const P = patch(t.mesh);
      const out: { kind: 'mesh'; i: number; p: Pt; u: number; v: number }[] = [];
      for (let j = 0; j <= 3; j++) for (let i = 0; i <= 3; i++) {
        const border = i === 0 || j === 0 || i === 3 || j === 3;
        if (!border && !snapRef.current.adv) continue;
        out.push({ kind: 'mesh', i: j * 4 + i, p: P(i / 3, j / 3), u: i / 3, v: j / 3 });
      }
      return out;
    }
    const q = t.quad;
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const hs: { kind: 'corner' | 'side' | 'rotate'; i: number; p: Pt }[] = [
      ...q.map((p, i) => ({ kind: 'corner' as const, i, p })),
      ...[0, 1, 2, 3].map((i) => ({ kind: 'side' as const, i, p: mid(q[i]!, q[(i + 1) % 4]!) })),
    ];
    const top = mid(q[0]!, q[1]!), c = centroid(q);
    const dx = top.x - c.x, dy = top.y - c.y, l = Math.hypot(dx, dy) || 1;
    const off = 30 / view.current.scale;
    hs.push({ kind: 'rotate', i: 0, p: { x: top.x + (dx / l) * off, y: top.y + (dy / l) * off } });
    return hs;
  };
  type TfDrag = { kind: 'move' | 'corner' | 'side' | 'rotate' | 'mesh' | 'distort'; i: number; t0: Tf; p0: Pt; client0: Pt; u?: number; v?: number; fromCenter?: boolean; holdTimer?: number; moved: boolean; started: number; outside: boolean };
  const tfDrag = useRef<TfDrag | null>(null);
  const beginTfDrag = (clientX: number, clientY: number) => {
    const t = tfRef.current;
    const p = toDoc(clientX, clientY);
    const hit = tfHandles().map((h) => ({ h, d: Math.hypot(toScreen(h.p).x - clientX, toScreen(h.p).y - clientY) })).filter((x) => x.d < 30).sort((a, b) => a.d - b.d)[0]?.h;
    const base = { t0: { quad: t.quad.map((x) => ({ ...x })), mesh: t.mesh ? t.mesh.map((x) => ({ ...x })) : null }, p0: p, client0: { x: clientX, y: clientY }, moved: false, started: performance.now() };
    if (hit) {
      const d: TfDrag = { kind: hit.kind, i: hit.i, u: (hit as { u?: number }).u, v: (hit as { v?: number }).v, outside: false, ...base };
      const m = tfModeRef.current;
      // hold a node: Uniform scales from the centre, Freeform corners switch to Distort while held
      if ((hit.kind === 'corner' || hit.kind === 'side') && (m === 'Uniform' || m === 'Freeform')) {
        d.holdTimer = window.setTimeout(() => {
          const cur = tfDrag.current;
          if (cur !== d || d.moved) return;
          if (m === 'Uniform') { d.fromCenter = true; tfHud.current.text = 'Scale from centre'; }
          else if (hit.kind === 'corner') { d.kind = 'distort'; tfHud.current.text = 'Distort'; }
          try { navigator.vibrate?.(10); } catch { /* ignore */ }
          requestRender();
        }, 420);
      }
      tfDrag.current = d;
      return;
    }
    if (t.mesh && tfModeRef.current === 'Warp') {
      const loc = locate(patch(t.mesh), p);
      if (loc.d * view.current.scale < 24) { tfDrag.current = { kind: 'mesh', i: -1, u: loc.u, v: loc.v, outside: false, ...base }; return; }
    }
    tfDrag.current = { kind: 'move', i: -1, outside: !pointInQuad(t.quad, p), ...base };
  };
  const snapMove = (dx: number, dy: number, t0: Tf) => {
    const g: { x?: number; y?: number; canvas: boolean }[] = [];
    const sr = snapRef.current;
    if (sr.mag) {
      // Magnetics: slide along horizontal, vertical or 45° lines
      const a = Math.atan2(dy, dx), step = Math.PI / 4;
      const sa = Math.round(a / step) * step, len = dx * Math.cos(sa) + dy * Math.sin(sa);
      dx = Math.cos(sa) * len; dy = Math.sin(sa) * len;
    }
    if (sr.on) {
      const bb = boundsOf([t0.mesh ?? t0.quad]);
      const tol = sr.dist / view.current.scale;
      const xs = [bb.x + dx, bb.x + bb.w / 2 + dx, bb.x + bb.w + dx], ys = [bb.y + dy, bb.y + bb.h / 2 + dy, bb.y + bb.h + dy];
      const tx = [0, W / 2, W], ty = [0, H / 2, H];
      let bx: number | null = null, by: number | null = null, bdx = tol, bdy = tol;
      for (const x of xs) for (const T of tx) if (Math.abs(x - T) < bdx) { bdx = Math.abs(x - T); bx = T - x; }
      for (const y of ys) for (const T of ty) if (Math.abs(y - T) < bdy) { bdy = Math.abs(y - T); by = T - y; }
      if (bx !== null) { dx += bx; const x = xs.map((v) => v + bx!).find((v) => tx.some((T) => Math.abs(v - T) < 0.01)); if (x !== undefined) g.push({ x, canvas: true }); }
      if (by !== null) { dy += by; const y = ys.map((v) => v + by!).find((v) => ty.some((T) => Math.abs(v - T) < 0.01)); if (y !== undefined) g.push({ y, canvas: true }); }
    }
    tfHud.current.guides = g;
    return { dx, dy };
  };
  const moveTfDrag = (clientX: number, clientY: number) => {
    const d = tfDrag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(clientX - d.client0.x, clientY - d.client0.y) < 4) return;
    d.moved = true;
    const p = toDoc(clientX, clientY);
    const t0 = d.t0, q0 = t0.quad;
    const m = tfModeRef.current;
    const sr = snapRef.current;
    tfLive.current = true;
    if (d.kind === 'move') {
      const s = snapMove(p.x - d.p0.x, p.y - d.p0.y, t0);
      mapTf(t0, (x) => ({ x: x.x + s.dx, y: x.y + s.dy }));
      tfHud.current.text = null;
      return;
    }
    if (d.kind === 'mesh' && t0.mesh) {
      const u = d.u ?? 0, v = d.v ?? 0;
      const P0 = patch(t0.mesh)(u, v);
      setTf({ quad: q0, mesh: dragMesh(t0.mesh, u, v, { x: p.x - P0.x, y: p.y - P0.y }) });
      return;
    }
    if (d.kind === 'rotate') {
      const c = centroid(q0);
      const a0 = Math.atan2(d.p0.y - c.y, d.p0.x - c.x), a1 = Math.atan2(p.y - c.y, p.x - c.x);
      let deg = ((a1 - a0) * 180) / Math.PI;
      const base = ((Math.atan2(q0[1]!.y - q0[0]!.y, q0[1]!.x - q0[0]!.x) * 180) / Math.PI);
      let total = base + deg;
      if (sr.mag || Math.abs(total - Math.round(total / 15) * 15) < 1.5) { total = Math.round(total / 15) * 15; deg = total - base; }
      mapTf(t0, rotateAbout(c, deg));
      tfHud.current.text = `${Math.round(((total % 360) + 540) % 360 - 180)}°`;
      return;
    }
    if (d.kind === 'distort' || (m === 'Distort' && d.kind === 'corner')) {
      const quad = q0.map((x) => ({ ...x }));
      quad[d.i] = p;
      applyQuad(t0, quad);
      tfHud.current.text = d.kind === 'distort' ? 'Distort' : null;
      return;
    }
    if (m === 'Distort' && d.kind === 'side') {
      // shear: the side's two corners travel with the finger (Magnetics: along the side only)
      let dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (sr.mag) {
        const a = q0[d.i]!, b = q0[(d.i + 1) % 4]!;
        const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey || 1;
        const k = (dx * ex + dy * ey) / l2; dx = ex * k; dy = ey * k;
      }
      const quad = q0.map((x, i) => (i === d.i || i === (d.i + 1) % 4 ? { x: x.x + dx, y: x.y + dy } : { ...x }));
      applyQuad(t0, quad);
      return;
    }
    // Freeform / Uniform node scaling in the content's own (possibly rotated, sheared) frame
    const ex = { x: q0[1]!.x - q0[0]!.x, y: q0[1]!.y - q0[0]!.y };
    const ey = { x: q0[3]!.x - q0[0]!.x, y: q0[3]!.y - q0[0]!.y };
    const det = ex.x * ey.y - ex.y * ey.x || 1e-9;
    const toUV = (pt: Pt) => { const rx = pt.x - q0[0]!.x, ry = pt.y - q0[0]!.y; return { u: (rx * ey.y - ry * ey.x) / det, v: (ex.x * ry - ex.y * rx) / det }; };
    const fromUV = (u: number, v: number) => ({ x: q0[0]!.x + ex.x * u + ey.x * v, y: q0[0]!.y + ex.y * u + ey.y * v });
    // node position in unit coords
    const cornerUV = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
    const sideUV = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] as const;
    const [nu, nv] = d.kind === 'corner' ? cornerUV[d.i]! : sideUV[d.i]!;
    const au = d.fromCenter ? 0.5 : 1 - nu, av = d.fromCenter ? 0.5 : 1 - nv;
    const cur = toUV(p);
    const uniform = m === 'Uniform' || (m === 'Freeform' && sr.mag && d.kind === 'corner');
    let ku = nu !== au ? (cur.u - au) / (nu - au) : 1;
    let kv = nv !== av ? (cur.v - av) / (nv - av) : 1;
    if (uniform) {
      let k: number;
      if (d.kind === 'corner') {
        // project the finger onto the anchor→node diagonal
        const A = fromUV(au, av), N = fromUV(nu, nv), P2 = p;
        const vx = N.x - A.x, vy = N.y - A.y;
        k = ((P2.x - A.x) * vx + (P2.y - A.y) * vy) / (vx * vx + vy * vy || 1);
      } else k = nu !== au ? ku : kv;
      ku = kv = k;
    }
    const fn = (pt: Pt) => { const uv = toUV(pt); return fromUV(au + (uv.u - au) * ku, av + (uv.v - av) * kv); };
    mapTf(t0, fn);
    const w0 = Math.hypot(ex.x, ex.y), h0 = Math.hypot(ey.x, ey.y);
    const f = floatingRef.current;
    if (f) {
      const sx = (w0 * Math.abs(ku)) / f.bounds.w, sy = (h0 * Math.abs(kv)) / f.bounds.h;
      tfHud.current.text = Math.abs(sx - sy) < 0.005 ? `Scale ${Math.round(sx * 100)}%` : `W ${Math.round(sx * 100)}%  H ${Math.round(sy * 100)}%`;
    }
  };
  const endTfDrag = (clientX: number, clientY: number) => {
    const d = tfDrag.current;
    tfDrag.current = null;
    if (!d) return;
    window.clearTimeout(d.holdTimer);
    tfLive.current = false;
    tfHud.current = { text: null, guides: [] };
    if (!d.moved && d.kind === 'move' && d.outside && performance.now() - d.started < 300) {
      // tap outside the bounding box: nudge one step towards the tap
      const t = tfRef.current, c = centroid(t.quad), p = toDoc(clientX, clientY);
      const dx = p.x - c.x, dy = p.y - c.y;
      const step = Math.max(1, 1 / view.current.scale);
      const nx = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) * step : 0, ny = Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) * step : 0;
      mapTf(t, (x) => ({ x: x.x + nx, y: x.y + ny }));
    }
    requestRender();
  };

  /* ---------- adjustments (Procreate Pocket 5) ---------- */
  const startAdjust = (name: string) => {
    setPanel(null);
    setAdjMenu(null);
    const layer = active();
    if (!layer) return;
    if (notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    pushHistory([layer.id]);
    const base = makeCanvas(W, H);
    ctx2d(base).drawImage(layer.canvas, 0, 0);
    setAdjust({ name, value: 0, params: defaultParams(name), base, layerId: layer.id, hist: [], hidden: false, applied: false });
    if (name === 'Clone') {
      const r = wrapRef.current?.getBoundingClientRect();
      setCloneSrc(r ? toDoc(r.left + r.width / 2, r.top + r.height / 2) : { x: W / 2, y: H / 2 });
      setCloneLocked(false);
    }
    setTool('brush');
  };
  const adjustFrame = useRef<number | undefined>(undefined);
  const adjScratch = useRef<HTMLCanvasElement | null>(null);
  const adjFinal = useRef<number | undefined>(undefined);
  const adjSmall = useRef<HTMLCanvasElement | null>(null);
  /* While the value is moving, the effect runs on a downscaled copy (≤ ~1.2 MP) so swiping
   * stays smooth on big canvases; ~160 ms after the last change it re-renders at full size. */
  const adjLowRes = useRef(false);
  const renderDirect = (a: AdjState, final = false) => {
    if (adjustFrame.current) cancelAnimationFrame(adjustFrame.current);
    window.clearTimeout(adjFinal.current);
    adjustFrame.current = requestAnimationFrame(() => paintAdjust(a, final));
  };
  /** Before committing, make sure the layer holds the full-resolution result. */
  const flushAdjust = () => {
    const a = adjustRef.current;
    if (adjustFrame.current) cancelAnimationFrame(adjustFrame.current);
    window.clearTimeout(adjFinal.current);
    if (a && adjLowRes.current) paintAdjust(a, true);
  };
  const paintAdjust = (a: AdjState, final: boolean) => {
    {
      const layer = layersRef.current.find((l) => l.id === a.layerId);
      if (!layer) return;
      const k = final ? 1 : Math.min(1, Math.sqrt(1_200_000 / (W * H)));
      const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      let fx = k === 1 ? adjScratch.current : adjSmall.current;
      if (!fx || fx.width !== w || fx.height !== h) { fx = makeCanvas(w, h); if (k === 1) adjScratch.current = fx; else adjSmall.current = fx; }
      const fc = ctx2d(fx);
      fc.clearRect(0, 0, w, h);
      fc.drawImage(a.base, 0, 0, w, h);
      if (!a.hidden) applyCanvasEffect(fx, a.name, layerValueOf(a.name, a.params), a.params);
      const c = ctx2d(layer.canvas);
      c.clearRect(0, 0, W, H);
      if (selectionRef.current) {
        c.drawImage(a.base, 0, 0);
        c.save();
        c.clip(selectionRef.current.path, 'evenodd');
        c.clearRect(0, 0, W, H);
        c.drawImage(fx, 0, 0, W, H);
        c.restore();
      } else c.drawImage(fx, 0, 0, W, H);
      markDirty(layer.id);
      adjLowRes.current = k < 1;
      if (k < 1) adjFinal.current = window.setTimeout(() => { const cur = adjustRef.current; if (cur) paintAdjust(cur, true); }, 160);
    }
  };
  /** Old call sites: set the swipe amount (and optionally params) of the running adjustment. */
  const applyAdjust = (value: number, params?: any) => {
    const a = adjustRef.current;
    if (!a) return;
    const p = { ...(params ?? a.params), amount: value };
    const next = { ...a, value, params: p };
    setAdjust(next); renderDirect(next);
  };
  const endAdjust = (cancel: boolean) => {
    if (!cancel) flushAdjust(); else { if (adjustFrame.current) cancelAnimationFrame(adjustFrame.current); window.clearTimeout(adjFinal.current); }
    const a = adjustRef.current;
    if (!a) return;
    setAdjMenu(null);
    if (cancel) {
      const layer = layersRef.current.find((l) => l.id === a.layerId);
      if (layer) { const c = ctx2d(layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(a.base, 0, 0); markDirty(layer.id); }
      if (!a.applied) {
        undoStack.current.pop();
        setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
      }
    }
    setAdjust(null);
  };

  /* An adjustment target is either the running destructive adjustment or the
   * selected adjustment layer, which can't be painted on and shows its own UI. */
  const activeAdjLayer = (): LayerState | null => {
    const l = layersRef.current.find((x) => x.id === activeRef.current);
    return l && l.kind === 'adjust' && l.adjust ? l : null;
  };
  type AdjTarget = { kind: 'direct' | 'layer'; name: string; params: any; layer?: LayerState };
  const adjTarget = (): AdjTarget | null => {
    const a = adjustRef.current;
    if (a) return a.name === 'Liquify' || a.name === 'Clone' ? null : { kind: 'direct', name: a.name, params: normalizeParams(a.name, a.params) };
    const l = activeAdjLayer();
    if (l && adjLayerHidden !== l.id) return { kind: 'layer', name: l.adjust!.name, params: normalizeParams(l.adjust!.name, l.adjust!.params), layer: l };
    return null;
  };
  useEffect(() => {
    const l = activeAdjLayer();
    layerHist.current = l ? { id: l.id, stack: [], start: JSON.parse(JSON.stringify(l.adjust!.params ?? defaultParams(l.adjust!.name))), visible: l.visible } : null;
    setAdjLayerHidden(null);
    setAdjMenu(null);
    histCache.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  const setTargetParams = (params: any) => {
    const a = adjustRef.current;
    if (a) { const next = { ...a, params, value: layerValueOf(a.name, params) }; setAdjust(next); renderDirect(next); return; }
    const l = activeAdjLayer();
    if (!l) return;
    l.adjust = { name: l.adjust!.name, value: layerValueOf(l.adjust!.name, params), params };
    setLayers([...layersRef.current]);
    bump();
  };
  const beginAdj = () => {
    const t = adjTarget();
    if (!t) return;
    const snap = JSON.parse(JSON.stringify(t.params));
    if (t.kind === 'direct') { const a = adjustRef.current!; a.hist = [...a.hist, snap].slice(-60); }
    else if (layerHist.current) layerHist.current.stack = [...layerHist.current.stack, snap].slice(-60);
  };
  const undoAdj = () => {
    const t = adjTarget();
    if (!t) return;
    const stack = t.kind === 'direct' ? adjustRef.current!.hist : layerHist.current?.stack ?? [];
    const prev = stack.pop();
    if (!prev) { flash('Nothing to undo'); return; }
    setTargetParams(prev);
  };
  const resetAdj = () => { const t = adjTarget(); if (!t) return; beginAdj(); setTargetParams(defaultParams(t.name)); };
  const previewAdj = () => {
    const a = adjustRef.current;
    if (a) { const next = { ...a, hidden: !a.hidden }; setAdjust(next); renderDirect(next); return; }
    const l = activeAdjLayer();
    if (l) { l.visible = !l.visible; setLayers([...layersRef.current]); bump(); }
  };
  const isPreviewOff = () => { const a = adjustRef.current; if (a) return a.hidden; const l = activeAdjLayer(); return l ? !l.visible : false; };
  const applyAdjStay = () => {
    flushAdjust();
    const a = adjustRef.current;
    if (a) {
      // commit what's there, then keep adjusting on top of it
      const layer = layersRef.current.find((l) => l.id === a.layerId);
      if (!layer) return;
      const base = makeCanvas(W, H); ctx2d(base).drawImage(layer.canvas, 0, 0);
      setAdjust({ ...a, base, params: defaultParams(a.name), value: 0, hist: [], hidden: false, applied: true });
      flash(`${a.name} applied`);
      return;
    }
    const l = activeAdjLayer();
    if (l) {
      if (!l.visible) { l.visible = true; setLayers([...layersRef.current]); bump(); }
      if (layerHist.current) layerHist.current.start = JSON.parse(JSON.stringify(l.adjust!.params ?? {}));
      flash('Adjustment applied');
    }
  };
  const cancelAdj = () => {
    if (adjustRef.current) { endAdjust(true); return; }
    const l = activeAdjLayer();
    if (l && layerHist.current) {
      l.visible = layerHist.current.visible;
      setTargetParams(layerHist.current.start);
      layerHist.current.stack = [];
      setAdjLayerHidden(l.id);
    }
    setAdjMenu(null);
  };
  const doneAdj = () => {
    setAdjMenu(null);
    if (adjustRef.current) { endAdjust(false); return; }
    const l = activeAdjLayer();
    if (l) { if (!l.visible) { l.visible = true; setLayers([...layersRef.current]); bump(); } setAdjLayerHidden(l.id); }
  };
  /** Canvas swipe: % for most adjustments, direction for Motion Blur, vector for Displace. */
  const adjSwipe = (clientX: number, clientY: number) => {
    const s = adjDrag.current;
    const t = adjTarget();
    if (!s || !t) return;
    const dx = clientX - s.client.x, dy = clientY - s.client.y;
    if (!s.began) { if (Math.hypot(dx, dy) < 7) return; s.began = true; beginAdj(); }
    if (!usesSwipe(t.name)) return;
    const width = wrapRef.current?.clientWidth ?? 400;
    const d1 = toDoc(clientX, clientY);
    const ddx = d1.x - s.doc.x, ddy = d1.y - s.doc.y;
    const cl = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
    let next: any;
    if (t.name === 'Motion Blur') next = { ...s.start, amount: cl((Math.hypot(dx, dy) / (width * 0.8)) * 100), angle: (Math.atan2(ddy, ddx) * 180) / Math.PI };
    else if (t.name === 'Chromatic Aberration' && s.start.mode === 'displace') next = { ...s.start, dx: ddx * 0.25, dy: ddy * 0.25, amount: cl((Math.hypot(ddx, ddy) * 0.25 / (Math.max(W, H) * 0.05)) * 100) || 1 };
    else next = { ...s.start, amount: cl((s.start.amount ?? 0) + (dx / width) * 120) };
    setTargetParams(next);
  };

  /* ---------- clone ---------- */
  const cloneSizePx = () => 2 + Math.pow(cloneSet.size / 100, 1.7) * Math.max(W, H) * 0.12;
  const beginClone = (p: Pt, pressure: number) => {
    const a = adjustRef.current;
    if (!a) return;
    const layer = layersRef.current.find((l) => l.id === a.layerId);
    if (!layer) return;
    const snap = makeCanvas(W, H); ctx2d(snap).drawImage(layer.canvas, 0, 0);
    const src = cloneSrcRef.current;
    cloneStroke.current = { snap, mask: makeCanvas(W, H), tmp: makeCanvas(W, H), off: { x: src.x - p.x, y: src.y - p.y }, last: p, residual: 0, travelled: 0 };
    cloneDab(p, pressure);
    cloneComposite();
  };
  const cloneDab = (p: Pt, pressure: number) => {
    const st = cloneStroke.current; if (!st) return;
    const brush = brushFor('brush');
    const size = cloneSizePx();
    const tip = eraserTip(brush);
    stampDab(ctx2d(st.mask), tip, brush, { ...p, pressure, travelled: st.travelled + size * 2 }, size);
  };
  const moveClone = (p: Pt, pressure: number) => {
    const st = cloneStroke.current; if (!st) return;
    const size = cloneSizePx();
    const step = Math.max(1, size * Math.max(0.05, brushFor('brush').spacing));
    const dx = p.x - st.last.x, dy = p.y - st.last.y, dist = Math.hypot(dx, dy);
    let t = step - st.residual;
    while (t <= dist) { cloneDab({ x: st.last.x + (dx * t) / dist, y: st.last.y + (dy * t) / dist }, pressure); t += step; }
    st.residual = dist - (t - step);
    st.travelled += dist;
    st.last = p;
    if (!cloneLocked) setCloneSrc({ x: p.x + st.off.x, y: p.y + st.off.y });
    cloneComposite();
  };
  const cloneComposite = () => {
    const st = cloneStroke.current; const a = adjustRef.current;
    if (!st || !a) return;
    const layer = layersRef.current.find((l) => l.id === a.layerId);
    if (!layer) return;
    const tc = ctx2d(st.tmp);
    tc.globalCompositeOperation = 'source-over'; tc.globalAlpha = 1; tc.clearRect(0, 0, W, H);
    tc.drawImage(st.snap, -st.off.x, -st.off.y);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(st.mask, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    const c = ctx2d(layer.canvas);
    c.clearRect(0, 0, W, H); c.drawImage(st.snap, 0, 0);
    c.save();
    if (selectionRef.current) c.clip(selectionRef.current.path, 'evenodd');
    c.globalAlpha = cloneSet.strength / 100;
    c.drawImage(st.tmp, 0, 0);
    c.restore();
    dirty.current.add(layer.id);
    requestRender();
  };
  const endClone = () => {
    const st = cloneStroke.current;
    cloneStroke.current = null;
    if (!st) return;
    const a = adjustRef.current;
    if (a) markDirty(a.layerId);
  };
  const liquifyAt = (p: Pt, prev: Pt, strength = 1) => {
    if (!adjust) return;
    const layer = layersRef.current.find((l) => l.id === adjust.layerId);
    if (!layer) return;
    const R = Math.max(6, (liq.size / 100) * Math.min(W, H) * 0.3);
    const rect = clipRect({ x: p.x - R, y: p.y - R, w: R * 2, h: R * 2 });
    if (rect.w <= 0 || rect.h <= 0) return;
    const c = layer.canvas.getContext('2d', { willReadFrequently: true })!;
    const src = c.getImageData(rect.x, rect.y, rect.w, rect.h);
    const baseData = liq.mode === 'Reconstruct' ? adjust.base.getContext('2d', { willReadFrequently: true })!.getImageData(rect.x, rect.y, rect.w, rect.h).data : null;
    const out = new ImageData(new Uint8ClampedArray(src.data), rect.w, rect.h);
    const k = (liq.pressure / 100) * strength;
    const amt = 0.25 + (liq.amount / 100) * 1.75;
    const dist0 = liq.distortion / 100;
    const ddx = p.x - prev.x, ddy = p.y - prev.y;
    const dl = Math.hypot(ddx, ddy) || 1;
    const nx = -ddy / dl, ny = ddx / dl;
    const hash = (x: number, y: number) => { const t = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return t - Math.floor(t) - 0.5; };
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
      const gx = rect.x + x, gy = rect.y + y;
      const dx = gx - p.x, dy = gy - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= R) continue;
      const f = Math.pow(1 - dist / R, 2) * k;
      let sx = gx, sy = gy;
      if (liq.mode === 'Push') { sx = gx - ddx * f; sy = gy - ddy * f; }
      else if (liq.mode === 'Twirl Right' || liq.mode === 'Twirl Left') {
        const a = (liq.mode === 'Twirl Right' ? 1 : -1) * f * 0.22 * amt;
        sx = p.x + dx * Math.cos(a) - dy * Math.sin(a); sy = p.y + dx * Math.sin(a) + dy * Math.cos(a);
      } else if (liq.mode === 'Pinch') { sx = p.x + dx * (1 + f * 0.1 * amt); sy = p.y + dy * (1 + f * 0.1 * amt); }
      else if (liq.mode === 'Expand') { sx = p.x + dx * (1 - f * 0.1 * amt); sy = p.y + dy * (1 - f * 0.1 * amt); }
      else if (liq.mode === 'Crystals') { sx = gx + hash(gx, gy) * f * R * 0.12 * amt; sy = gy + hash(gy, gx) * f * R * 0.12 * amt; }
      else if (liq.mode === 'Edge') { const d = dx * nx + dy * ny; sx = gx + nx * d * f * 0.12 * amt; sy = gy + ny * d * f * 0.12 * amt; }
      if (dist0 > 0 && !baseData) { sx += hash(gx * 0.05 | 0, gy * 0.05 | 0) * f * R * 0.08 * dist0; sy += hash(gy * 0.05 | 0, gx * 0.05 | 0) * f * R * 0.08 * dist0; }
      const o = (y * rect.w + x) * 4;
      if (baseData) {
        for (let ch = 0; ch < 4; ch++) out.data[o + ch] = src.data[o + ch]! + (baseData[o + ch]! - src.data[o + ch]!) * Math.min(1, f * 1.5 * amt);
        continue;
      }
      const ix = Math.round(sx) - rect.x, iy = Math.round(sy) - rect.y;
      if (ix < 0 || iy < 0 || ix >= rect.w || iy >= rect.h) continue;
      const si = (iy * rect.w + ix) * 4;
      out.data[o] = src.data[si]!; out.data[o + 1] = src.data[si + 1]!; out.data[o + 2] = src.data[si + 2]!; out.data[o + 3] = src.data[si + 3]!;
    }
    c.putImageData(out, rect.x, rect.y);
    dirty.current.add(layer.id);
    requestRender();
  };
  /** Momentum: the liquify brush keeps gliding after the finger lifts. */
  const liqMomentum = useRef<number | undefined>(undefined);
  const glideLiquify = (from: Pt, v: Pt) => {
    const steps = Math.round((liq.momentum / 100) * 24);
    if (!steps || Math.hypot(v.x, v.y) < 0.5) return;
    let p = from, vel = v, i = 0;
    const tick = () => {
      if (i++ >= steps) { bump(); return; }
      vel = { x: vel.x * 0.86, y: vel.y * 0.86 };
      const next = { x: p.x + vel.x, y: p.y + vel.y };
      liquifyAt(next, p, 1 - i / steps);
      p = next;
      liqMomentum.current = requestAnimationFrame(tick);
    };
    liqMomentum.current = requestAnimationFrame(tick);
  };
  const resetLiquify = () => {
    if (!adjust) return;
    if (liqMomentum.current) cancelAnimationFrame(liqMomentum.current);
    const layer = layersRef.current.find((l) => l.id === adjust.layerId);
    if (!layer) return;
    const c = ctx2d(layer.canvas); c.clearRect(0, 0, W, H); c.drawImage(adjust.base, 0, 0);
    markDirty(layer.id);
    requestRender();
  };

  /* ---------- misc ---------- */
  const finishTransientModes = () => {
    if (stroke.current) endStroke();
    if (floatingRef.current) commitTransform();
    if (adjust) setAdjust(null);
    setAdjMenu(null);
    setDrop(null);
  };

  const chooseTool = (t: Tool) => {
    if (t !== 'transform' && floatingRef.current) commitTransform();
    if (adjust) endAdjust(false);
    setDrop(null);
    if (t === tool && (t === 'brush' || t === 'smudge' || t === 'eraser')) { setPanel(panel === 'brush' ? null : 'brush'); return; }
    if (t !== 'select' && tool === 'select') commitDraft('add');
    if (t === tool && t === 'select') {
      // tapping Selection again cancels the selection and returns to the artwork
      draftOverlay.current = null;
      if (selectionRef.current) lastSel.current = selectionRef.current.outlines;
      setSelection(null); setTool('brush'); return;
    }
    setTool(t);
    if (t === 'transform') startTransform();
  };

  const applyPaletteToLayer = (colors: string[]) => {
    const layer = active();
    if (!layer || notPixel(layer)) return;
    if (layer.locked) { flash('Layer is locked'); return; }
    pushHistory([layer.id]);
    const c = layer.canvas.getContext('2d', { willReadFrequently: true })!;
    const img = c.getImageData(0, 0, W, H);
    mapToPalette(img.data, colors);
    c.putImageData(img, 0, 0);
    markDirty(layer.id);
    flash(`“${layer.name}” now uses only this palette`);
  };

  const runQuick = (a: QuickAction) => {
    const id = activeRef.current;
    switch (a) {
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'brush': case 'smudge': case 'eraser': case 'select': case 'transform': setTool(a as Tool); break;
      case 'layers': setPanel('layers'); break;
      case 'colors': setPanel('colors'); break;
      case 'new-layer': insertLayer(); break;
      case 'clear-layer': layerAction(id, 'clear'); break;
      case 'merge-down': layerAction(id, 'merge'); break;
      case 'duplicate-layer': layerAction(id, 'duplicate'); break;
      case 'alpha-lock': { const l = layersRef.current.find((x) => x.id === id); if (l) { updateLayer(l.id, { alphaLock: !l.alphaLock }); flash(l.alphaLock ? 'Alpha Lock off' : 'Alpha Lock on'); } break; }
      case 'adjustments': openAdjustments(); break;
      case 'flip-h': void runAction('flip-canvas-h'); break;
      case 'flip-v': void runAction('flip-canvas-v'); break;
      case 'fit': fitView(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'copy': void runAction('copy'); break;
      case 'paste': void runAction('paste'); break;
      case 'copy-paste': setClipMenu(true); break;
      case 'reference': void runAction('reference'); break;
      case 'guide': void runAction('guide'); break;
      case 'add-text': void runAction('add-text'); break;
      case 'export-png': void runAction('export-png'); break;
      case 'fill-layer': layerAction(id, 'fill'); break;
      case 'none': break;
    }
  };
  const runAction = async (a: ActionId) => {
    const layer = active();
    switch (a) {
      case 'insert-photo': setPanel(null); fileRef.current?.click(); break;
      case 'add-text': setPanel(null); setTextDraft(defaultDraft(W, H)); break;
      case 'cut': copySelection(true); break;
      case 'copy': copySelection(false); break;
      case 'paste': pasteClipboard(); break;
      case 'flip-canvas-h':
      case 'flip-canvas-v': {
        pushHistory(layersRef.current.map((l) => l.id));
        for (const l of layersRef.current) {
          const tmp = makeCanvas(W, H); ctx2d(tmp).drawImage(l.canvas, 0, 0);
          const c = ctx2d(l.canvas); c.save(); c.clearRect(0, 0, W, H);
          if (a === 'flip-canvas-h') { c.translate(W, 0); c.scale(-1, 1); } else { c.translate(0, H); c.scale(1, -1); }
          c.drawImage(tmp, 0, 0); c.restore(); dirty.current.add(l.id);
        }
        bump(); break;
      }
      case 'rotate-canvas': {
        const el = wrapRef.current!;
        const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
        const anchor = toDoc(el.getBoundingClientRect().left + cx, el.getBoundingClientRect().top + cy);
        view.current.rot = (view.current.rot + 90) % 360;
        const q = new DOMMatrix().rotate(view.current.rot).scale(view.current.scale * (view.current.flip ? -1 : 1), view.current.scale).transformPoint(new DOMPoint(anchor.x, anchor.y));
        view.current.x = cx - q.x; view.current.y = cy - q.y; requestRender(); break;
      }
      case 'guide': setGuide((g) => !g); break;
      case 'reference':
        if (referenceId) { setReferenceId(null); flash('Reference off'); }
        else if (layer) { setReferenceId(layer.id); flash(`ColorDrop will follow “${layer.name}”`); }
        break;
      case 'clear-all':
        pushHistory(layersRef.current.map((l) => l.id));
        layersRef.current.forEach((l) => { ctx2d(l.canvas).clearRect(0, 0, W, H); dirty.current.add(l.id); });
        bump(); break;
      case 'export-png':
      case 'export-jpg': {
        const out = flatten(layersRef.current, bgRef.current.color, a === 'export-jpg' ? true : bgRef.current.visible, Infinity, texRef.current);
        const blob = await canvasToBlob(out, a === 'export-png' ? 'image/png' : 'image/jpeg', 0.95);
        downloadBlob(blob, `${title || 'Artwork'}.${a === 'export-png' ? 'png' : 'jpg'}`);
        break;
      }
      case 'export-psd':
      case 'export-zip':
      case 'export-arnm': {
        finishTransientModes();
        flash('Packing your file…');
        try {
          const art = await save();
          const name = title || 'Artwork';
          if (a === 'export-psd') downloadBlob(await exportPsd(art), `${name}.psd`);
          else if (a === 'export-zip') downloadBlob(await exportZip(art), `${name}.zip`);
          else {
            await saveHistory(artwork.id, undoStack.current, redoStack.current);
            const sel = selectionRef.current;
            downloadBlob(await exportArnm(art, { palettes, selection: sel ? { outlines: sel.outlines, inverted: sel.inverted } : null }), `${name}.arnm`);
          }
          flash('Exported');
        } catch { flash('Could not export that file'); }
        break;
      }
      case 'export-layers':
        for (const [i, l] of layersRef.current.entries()) downloadBlob(await canvasToBlob(l.canvas), `${title}-${i + 1}-${l.name}.png`);
        break;
      case 'rename': { const n = window.prompt('Artwork name', title); if (n) { setTitle(n); titleRef.current = n; scheduleSave(); } break; }
      default: break;
    }
  };

  const insertImage = async (file: File) => {
    try {
      const img = await loadImage(file);
      const l = insertLayer('Inserted Image');
      setActiveId(l.id);
      const s = Math.min(1, W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx2d(l.canvas).drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      markDirty(l.id);
      setTool('transform');
      setTimeout(startTransform, 0);
    } catch { flash('Could not open that image'); }
  };

  // live text preview drawn over the artwork until the text is applied
  useEffect(() => {
    if (!textDraft) { textPreview.current = null; textHidden.current = null; requestRender(); return; }
    let off = false;
    void ensureFont(textDraft).then(() => {
      if (off) return;
      const c = textPreview.current && textPreview.current.width === W ? textPreview.current : makeCanvas(W, H);
      const x = ctx2d(c); x.clearRect(0, 0, W, H);
      const editing = textHidden.current ? layersRef.current.find((l) => l.id === textHidden.current)?.text : undefined;
      drawText(x, textDraft, W, H, editing?.color ?? color);
      textPreview.current = c; requestRender();
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textDraft, color]);
  /** id of the live text layer being edited (null = the draft creates a new text layer) */
  const [editingText, setEditingText] = useState<string | null>(null);
  const textName = (d: TextDraft) => d.value.trim().split('\n')[0]!.slice(0, 24) || 'Text';
  const applyText = () => {
    if (!textDraft || !textDraft.value.trim()) { setTextDraft(null); setEditingText(null); return; }
    const d = textDraft;
    const editId = editingText;
    void ensureFont(d).then(() => {
      const target = editId ? layersRef.current.find((x) => x.id === editId && x.text) : undefined;
      if (target) {
        pushHistory([target.id]);
        const c = ctx2d(target.canvas); c.clearRect(0, 0, W, H);
        const col = target.text!.color;
        drawText(c, d, W, H, col);
        setLayers(layersRef.current.map((x) => (x.id === target.id ? Object.assign(x, { text: { draft: { ...d }, color: col }, name: textName(d) }) : x)));
        markDirty(target.id); bump();
      } else {
        // text stays editable (non-rasterized) until the user explicitly rasterizes it
        const l = insertLayer(textName(d));
        drawText(ctx2d(l.canvas), d, W, H, color);
        l.text = { draft: { ...d }, color };
        setLayers([...layersRef.current]);
        markDirty(l.id);
      }
      setTextDraft(null); setEditingText(null);
    });
  };
  const editTextLayer = (id: string) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (!l?.text) return;
    setActiveId(id); setPanel(null);
    textHidden.current = id;
    setEditingText(id); setTextDraft({ ...l.text.draft });
  };
  const rasterizeText = (id: string) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (!l?.text) return;
    pushHistory([id]);
    setLayers(layersRef.current.map((x) => (x.id === id ? Object.assign(x, { text: undefined }) : x)));
    markDirty(id); bump();
    flash('Text rasterized: you can paint on it now');
  };

  /* ---------- pointer handling ---------- */
  type Ptr = { x: number; y: number; sx: number; sy: number; type: string };
  const pointers = useRef(new Map<number, Ptr>());
  const mode = useRef<'idle' | 'draw' | 'gesture' | 'eyedrop' | 'select' | 'transform' | 'pan' | 'adjust' | 'liquify' | 'clone' | 'tapclose'>('idle');
  const gesture = useRef<null | { start: number; max: number; moved: boolean; v0: View; anchor: Pt; d0: number; a0: number; c0: Pt; tf0: Tf; s0: number; vx0: number; vy0: number }>(null);
  const dragStart = useRef<{ p: Pt; tf: Tf; client: Pt; value: number } | null>(null);
  const lastLiq = useRef<Pt | null>(null);
  const liqVel = useRef<Pt>({ x: 0, y: 0 });
  const pendingTap = useRef<null | { p: Pt; pressure: number }>(null);
  /** A single quick tap on the canvas closes open windows and does nothing else. */
  const closeWindows = () => { window.dispatchEvent(new Event('pp-close-windows')); };
  const spaceDown = useRef(false);
  const holdRepeat = useRef<{ timer?: number; iv?: number }>({});
  const stopHoldRepeat = () => { window.clearTimeout(holdRepeat.current.timer); window.clearTimeout(holdRepeat.current.iv); };

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  const onPointerDown = (e: RPE<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    finishFillWave();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType });
    penTilt.current = e.pointerType === 'pen' ? 1 - Math.min(1, Math.hypot(e.tiltX || 0, e.tiltY || 0) / 90) : 1;
    // windows stay open until the user closes them — painting never dismisses them
    if (drop) setDrop(null);
    const n = pointers.current.size;
    if (n >= 2 && e.pointerType === 'touch') {
      window.clearTimeout(eyedropTimer.current);
      if (mode.current === 'draw') {
        const st = stroke.current;
        if (st && performance.now() - st.started < 400) cancelStroke(); else endStroke();
      }
      if (mode.current === 'select') draftOverlay.current = null;
      if (mode.current === 'eyedrop') setLoupe(null);
      const pts0 = [...pointers.current.values()] as [Ptr, Ptr];
      const g = twoFinger();
      const v0 = { ...view.current };
      gesture.current = { start: gesture.current?.start ?? performance.now(), max: Math.max(n, gesture.current?.max ?? 0), moved: gesture.current?.moved ?? false, v0, anchor: toDoc(g.c.x, g.c.y), d0: g.d, a0: g.a, c0: g.c, tf0: { ...tfRef.current }, s0: v0.scale, vx0: pts0[1].x - pts0[0].x, vy0: pts0[1].y - pts0[0].y };
      mode.current = 'gesture';
      // two/three-finger touch-and-hold: rapid undo / redo (accelerating), like Pocket 5
      window.clearTimeout(holdRepeat.current.timer); window.clearInterval(holdRepeat.current.iv);
      const gp = prefsRef.current;
      if ((n === 2 && gp.gTapUndo) || (n === 3 && gp.gTapRedo)) {
        holdRepeat.current.timer = window.setTimeout(() => {
          const g2 = gesture.current as any;
          if (!g2 || g2.moved || pointers.current.size !== n) return;
          g2.held = true;
          const step = n === 2 ? undo : redo;
          let k = 0, delay = 260;
          const tick = () => {
            if (!gesture.current || pointers.current.size !== n) return;
            step(); k++;
            delay = Math.max(45, delay * 0.82);
            holdRepeat.current.iv = window.setTimeout(tick, delay) as unknown as number;
          };
          tick();
        }, 520);
      }
      if (n === 4 && gp.quickMenuGesture === 'four-hold') {
        holdRepeat.current.timer = window.setTimeout(() => {
          const g2 = gesture.current as any;
          if (!g2 || g2.moved || pointers.current.size !== 4) return;
          g2.held = true; openQuickMenu(g.c.x, g.c.y);
        }, 450);
      }
      return;
    }
    if (n > 1) return;
    gesture.current = null;
    const p = toDoc(e.clientX, e.clientY);
    if (spaceDown.current || e.button === 1) { mode.current = 'pan'; dragStart.current = { p, tf: tfRef.current, client: { x: e.clientX, y: e.clientY }, value: 0 }; return; }
    if (e.altKey) { mode.current = 'eyedrop'; eyedropAt(e.clientX, e.clientY, color); return; }
    if (adjMenu) { setAdjMenu(null); mode.current = 'idle'; return; }
    if (adjust && adjust.name === 'Liquify') { mode.current = 'liquify'; lastLiq.current = p; return; }
    if (adjust && adjust.name === 'Clone') {
      mode.current = 'clone';
      beginClone(p, e.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, e.pressure || 0.5) : 1);
      return;
    }
    {
      const t = adjTarget();
      if (t) {
        mode.current = 'adjust';
        adjDrag.current = { client: { x: e.clientX, y: e.clientY }, start: JSON.parse(JSON.stringify(t.params)), began: false, t: performance.now(), doc: p };
        return;
      }
      // a dismissed adjustment layer's UI comes back with a tap
      const al = activeAdjLayer();
      if (al && tool !== 'select' && tool !== 'transform') { setAdjLayerHidden(null); mode.current = 'idle'; return; }
    }
    if (tool === 'transform') {
      if (!floatingRef.current) startTransform();
      if (!floatingRef.current) { mode.current = 'idle'; return; }
      mode.current = 'transform';
      beginTfDrag(e.clientX, e.clientY);
      return;
    }
    if (tool === 'select') {
      mode.current = 'select';
      if (selMode === 'Automatic') {
        // tap adds an area; tap-and-hold then drag left/right sets the threshold
        const base = selectionRef.current?.outlines ?? null;
        const a = { p, base, thr: autoThreshold.current, client: { x: e.clientX, y: e.clientY }, t: performance.now(), holding: false, raf: 0 };
        autoSel.current = a;
        runAuto(p, base, a.thr);
        window.setTimeout(() => { if (autoSel.current === a) { a.holding = true; flash(`Selection Threshold ${Math.round(a.thr)}%`); } }, 380);
        return;
      }
      const d = draftOverlay.current;
      if (selMode === 'Freehand') {
        if (d && d.kind === 'lasso' && d.points.length > 2) {
          const o = toScreen(d.points[0]!);
          if (Math.hypot(o.x - e.clientX, o.y - e.clientY) < 26) { selClose.current = true; return; }
          d.points.push(p); // polygon line from the previous node, then keep drawing freehand
        } else draftOverlay.current = { kind: 'lasso', points: [p] };
      } else {
        if (d) commitDraft('add');
        draftOverlay.current = { kind: selMode === 'Rectangle' ? 'rect' : 'ellipse', from: p, to: p };
      }
      requestRender();
      return;
    }
    const pressure = e.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, e.pressure || 0.5) : 1;
    if (panel) {
      // wait: a tap closes the window, a drag still paints
      mode.current = 'tapclose';
      pendingTap.current = { p, pressure };
      return;
    }
    if (beginStroke(p, pressure)) {
      mode.current = 'draw';
      const old = color;
      window.clearTimeout(eyedropTimer.current);
      eyedropTimer.current = window.setTimeout(() => {
        const ptr = pointers.current.get(e.pointerId);
        if (!ptr || mode.current !== 'draw' || Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) return;
        cancelStroke();
        mode.current = 'eyedrop';
        eyedropAt(ptr.x, ptr.y, old);
      }, 480);
    }
  };

  const onPointerMove = (e: RPE<HTMLCanvasElement>) => {
    const ptr = pointers.current.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (e.pointerType === 'pen') penTilt.current = 1 - Math.min(1, Math.hypot(e.tiltX || 0, e.tiltY || 0) / 90);
    if (mode.current === 'tapclose' && pointers.current.size === 1) {
      if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) <= 8) return;
      const pt = pendingTap.current;
      pendingTap.current = null;
      mode.current = pt && beginStroke(pt.p, pt.pressure) ? 'draw' : 'idle';
    }
    const m = mode.current;
    if (m === 'gesture' && gesture.current && pointers.current.size >= 2) {
      const g = gesture.current;
      const t = twoFinger();
      // multi-finger gestures: 3-finger scrub (horizontal & vertical back-and-forth) clears active layer; 3-finger swipe down opens clipboard menu
      const gX = g as any;
      if (pointers.current.size >= 3) {
        const all = [...pointers.current.values()];
        const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
        const cy = all.reduce((s, p) => s + p.y, 0) / all.length;
        gX.mx = cx;
        gX.my = cy;
        if (!gX.cleared && prefsRef.current.gScrubClear) {
          if (!gX.scrub) {
            gX.scrub = { lastX: cx, lastY: cy, revX: 0, revY: 0, dirX: 0, dirY: 0, totalDist: 0 };
          } else {
            const sc = gX.scrub;
            const ddx = cx - sc.lastX;
            const ddy = cy - sc.lastY;
            sc.totalDist += Math.hypot(ddx, ddy);
            const stepThresh = 12;
            if (Math.abs(ddx) > stepThresh) {
              const signX = ddx > 0 ? 1 : -1;
              if (sc.dirX !== 0 && signX !== sc.dirX) {
                sc.revX++;
              }
              sc.dirX = signX;
              sc.lastX = cx;
            }
            if (Math.abs(ddy) > stepThresh) {
              const signY = ddy > 0 ? 1 : -1;
              if (sc.dirY !== 0 && signY !== sc.dirY) {
                sc.revY++;
              }
              sc.dirY = signY;
              sc.lastY = cy;
            }
            // Scrub detected in either horizontal or vertical direction
            if ((sc.revX >= 2 || sc.revY >= 2) && sc.totalDist > 45) {
              gX.cleared = true;
              const l = active();
              if (l && (l.kind ?? 'pixel') === 'pixel' && !l.locked && !l.text) {
                pushHistory([l.id]);
                ctx2d(l.canvas).clearRect(0, 0, W, H);
                markDirty(l.id);
                flash('Layer cleared');
              }
            }
          }
        }
        // Three-finger downward swipe: Copy & Paste; upward swipe: QuickMenu (once per gesture,
        // never after a scrub or a hold, and only while the fingers move together)
        if (!gX.cleared && !gX.held && !gX.swiped && !(gX.scrub && (gX.scrub.revX || gX.scrub.revY))) {
          const dy = cy - g.c0.y;
          const dx = cx - g.c0.x;
          if (dy > 75 && Math.abs(dy) > Math.abs(dx) * 1.3 && prefsRef.current.gSwipeCopy) {
            gX.swiped = true; setClipMenu(true);
          } else if (dy < -75 && Math.abs(dy) > Math.abs(dx) * 1.3 && prefsRef.current.quickMenuGesture === 'three-swipe-up') {
            gX.swiped = true; openQuickMenu(cx, cy);
          }
        }
      }
      if (Math.hypot(t.c.x - g.c0.x, t.c.y - g.c0.y) > 10 || Math.abs(t.d - g.d0) > 12) { if (!g.moved) stopHoldRepeat(); g.moved = true; }
      (g as any).dLast = t.d;
      if (tool === 'transform' && floatingRef.current) {
        // two fingers: move, scale and rotate (Uniform keeps proportions; Freeform stretches along the fingers)
        if (tfDrag.current) { window.clearTimeout(tfDrag.current.holdTimer); tfDrag.current = null; }
        tfLive.current = true;
        const d0 = toDoc(g.c0.x, g.c0.y), d1 = toDoc(t.c.x, t.c.y);
        const t0 = g.tf0;
        const k = t.d / g.d0, rot = ((t.a - g.a0) * 180) / Math.PI;
        const R = rotateAbout({ x: 0, y: 0 }, rot);
        mapTf(t0, (pt) => { const r = R({ x: (pt.x - d0.x) * k, y: (pt.y - d0.y) * k }); return { x: d1.x + r.x, y: d1.y + r.y }; });
        tfHud.current.text = `Scale ${Math.round(k * 100)}%`;
        return;
      }
      const scale = Math.max(0.02, Math.min(64, g.v0.scale * (t.d / g.d0)));
      let rot = prefsRef.current.rotateCanvas ? g.v0.rot + ((t.a - g.a0) * 180) / Math.PI : g.v0.rot;
      // soft magnet towards right angles instead of a hard jump
      const snap = Math.round(rot / 90) * 90, off = rot - snap;
      if (Math.abs(off) < 6) rot = snap + off * Math.pow(Math.abs(off) / 6, 2);
      const base = new DOMMatrix().rotate(rot).scale(scale * (g.v0.flip ? -1 : 1), scale);
      const q = base.transformPoint(new DOMPoint(g.anchor.x, g.anchor.y));
      const gr = g as typeof g & { rect?: DOMRect };
      const r = gr.rect ?? (gr.rect = viewCanvas.current!.getBoundingClientRect());
      view.current = { ...g.v0, scale, rot, x: t.c.x - r.left - q.x, y: t.c.y - r.top - q.y };
      requestRender();
      return;
    }
    if (pointers.current.size > 1) return;
    if (m === 'draw' && stroke.current) {
      const st = stroke.current;
      if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) window.clearTimeout(eyedropTimer.current);
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const p = toDoc(ev.clientX, ev.clientY);
        const pressure = ev.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, ev.pressure || 0.5) : 1;
        if (st.shape) { adjustShape(st, p); continue; }
        const last = st.raw[st.raw.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) st.raw.push(p);
        strokeTo(st, p, pressure);
      }
      if (!st.shape) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(triggerQuickShape, 650);
      }
      requestRender();
    } else if (m === 'eyedrop') {
      eyedropAt(e.clientX, e.clientY, loupe?.old ?? color);
    } else if (m === 'select' && autoSel.current) {
      const a = autoSel.current;
      if (!a.holding) return;
      const thr = Math.max(0, Math.min(100, autoThreshold.current + (e.clientX - a.client.x) / 3));
      a.thr = thr;
      if (!a.raf) a.raf = requestAnimationFrame(() => { a.raf = 0; runAuto(a.p, a.base, a.thr); setToast(`Selection Threshold ${Math.round(a.thr)}%`); });
    } else if (m === 'select' && draftOverlay.current && !selClose.current) {
      const p = toDoc(e.clientX, e.clientY);
      const d = draftOverlay.current;
      if (d.kind === 'lasso') { const l = d.points[d.points.length - 1]!; if (Math.hypot(p.x - l.x, p.y - l.y) * view.current.scale > 1.5) d.points.push(p); } else d.to = p;
      requestRender();
    } else if (m === 'transform') {
      moveTfDrag(e.clientX, e.clientY);
    } else if (m === 'pan' && dragStart.current) {
      const s = dragStart.current;
      view.current.x += e.clientX - s.client.x; view.current.y += e.clientY - s.client.y;
      s.client = { x: e.clientX, y: e.clientY };
      requestRender();
    } else if (m === 'adjust' && adjDrag.current) {
      adjSwipe(e.clientX, e.clientY);
    } else if (m === 'clone') {
      moveClone(toDoc(e.clientX, e.clientY), e.pointerType === 'pen' ? applyCurve(prefsRef.current.curvePressure, e.pressure || 0.5) : 1);
    } else if (m === 'liquify' && lastLiq.current) {
      const p = toDoc(e.clientX, e.clientY);
      liquifyAt(p, lastLiq.current);
      liqVel.current = { x: p.x - lastLiq.current.x, y: p.y - lastLiq.current.y };
      lastLiq.current = p;
    }
  };

  /* QuickMenu double tap: two quick one-finger taps open the menu; the dots those
   * taps painted are reverted silently (no redo entry), as if they never happened. */
  const lastTap = useRef<{ t: number; x: number; y: number; undoLen: number } | null>(null);
  const maybeQuickMenuTap = (x: number, y: number) => {
    if (!prefsRef.current.quickMenu) return;
    const now = performance.now(), prev = lastTap.current;
    if (prev && now - prev.t < 360 && Math.hypot(x - prev.x, y - prev.y) < 44) {
      lastTap.current = null;
      const keep = Math.max(0, prev.undoLen - 1);
      while (undoStack.current.length > keep) { const en = undoStack.current.pop(); if (en) restore(en); }
      setHistoryInfo({ undo: undoStack.current.length, redo: redoStack.current.length });
      persistHistory();
      openQuickMenu(x, y);
      return;
    }
    lastTap.current = { t: now, x, y, undoLen: undoStack.current.length };
  };
  const onPointerUp = (e: RPE<HTMLCanvasElement>) => {
    const had = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const m = mode.current;
    if (m === 'gesture') {
      stopHoldRepeat();
      if (pointers.current.size === 0) {
        const g = gesture.current;
        if (g) {
          const dur = performance.now() - g.start;
          const gX = g as any;
          const gp = prefsRef.current;
          if (gX.held) { /* rapid undo/redo or QuickMenu hold already handled it */ }
          else if (!g.moved && dur < 400) {
            if (g.max === 2) { if (gp.gTapUndo) undo(); }
            else if (g.max === 3) { if (gp.gTapRedo) redo(); }
            else if (g.max >= 4 && gp.gFullscreen) toggleFullscreen();
          } else if (g.max === 2 && gp.gQuickPinch && dur < 320 && gX.dLast !== undefined && gX.dLast < g.d0 * 0.62) {
            // quick pinch (fast pinch-in and release): fit the canvas to the screen
            fitView();
            flash('Fit to screen');
          } else if (g.max === 3 && !gX.swiped && gp.gSwipeCopy) {
            // three-finger swipe down opens the cut / copy / paste menu
            if (gX.my !== undefined && !gX.cleared) {
              const dx = (gX.mx ?? g.c0.x) - g.c0.x, dy = gX.my - g.c0.y;
              if (dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.2) setClipMenu(true);
            }
          }
        }
        gesture.current = null;
        mode.current = 'idle';
        if (tfLive.current) { tfLive.current = false; tfHud.current = { text: null, guides: [] }; requestRender(); }
      }
      return;
    }
    if (pointers.current.size > 0) return;
    window.clearTimeout(eyedropTimer.current);
    if (m === 'tapclose') {
      pendingTap.current = null;
      mode.current = 'idle';
      if (e.type === 'pointerup') closeWindows();
      return;
    }
    if (m === 'draw') {
      const st = stroke.current;
      const tapLike = !!st && performance.now() - st.started < 260 && st.travelled * view.current.scale < 10;
      endStroke();
      if (tapLike) maybeQuickMenuTap(e.clientX, e.clientY);
      else lastTap.current = null;
    }
    else if (m === 'eyedrop') {
      if (loupe) { pickColor(loupe.color); commitRecent(loupe.color); }
      setLoupe(null);
    } else if (m === 'select' && autoSel.current) {
      const a = autoSel.current;
      autoSel.current = null;
      if (a.raf) { cancelAnimationFrame(a.raf); runAuto(a.p, a.base, a.thr); }
      if (a.holding) autoThreshold.current = a.thr;
    } else if (m === 'select' && selClose.current) {
      // tapped the gray start circle: close the freehand selection
      selClose.current = false;
      commitDraft('add');
    } else if (m === 'select' && draftOverlay.current) {
      const d = draftOverlay.current;
      // rectangles / ellipses too small to be meant are dropped; freehand stays open for more lines
      if (d.kind !== 'lasso' && Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) * view.current.scale < 6) draftOverlay.current = null;
      requestRender();
    } else if (m === 'liquify') {
      const last = lastLiq.current;
      lastLiq.current = null;
      if (last) glideLiquify(last, liqVel.current); else bump();
      liqVel.current = { x: 0, y: 0 };
    } else if (m === 'adjust') {
      const s = adjDrag.current;
      adjDrag.current = null;
      // a quick tap opens Adjustment Actions; a swipe already changed the value
      if (s && !s.began && performance.now() - s.t < 450) setAdjMenu({ x: e.clientX, y: e.clientY });
      else bump();
    } else if (m === 'clone') {
      endClone();
    } else if (m === 'transform') {
      endTfDrag(e.clientX, e.clientY);
    }
    void had;
    dragStart.current = null;
    mode.current = 'idle';
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = viewCanvas.current!.getBoundingClientRect();
    const zoom = e.ctrlKey || e.metaKey || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0 && e.deltaMode === 0 && Number.isInteger(e.deltaY));
    if (zoom) {
      const anchor = toDoc(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      const v = view.current;
      v.scale = Math.max(0.02, Math.min(64, v.scale * factor));
      const q = new DOMMatrix().rotate(v.rot).scale(v.scale * (v.flip ? -1 : 1), v.scale).transformPoint(new DOMPoint(anchor.x, anchor.y));
      v.x = e.clientX - r.left - q.x; v.y = e.clientY - r.top - q.y;
    } else {
      view.current.x -= e.deltaX; view.current.y -= e.deltaY;
    }
    requestRender();
  };

  // keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'c') { copySelection(false); return; }
      if (mod && e.key.toLowerCase() === 'x') { copySelection(true); return; }
      if (mod && e.key.toLowerCase() === 'v') { pasteClipboard(); return; }
      if (e.code === 'Space') { spaceDown.current = true; return; }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === 'b') chooseTool('brush');
      else if (k === 's') chooseTool('smudge');
      else if (k === 'e') chooseTool('eraser');
      else if (k === 'v') chooseTool('transform');
      else if (k === 'l') chooseTool('select');
      else if (k === '[') setSizes((s) => ({ ...s, [paintTool]: Math.max(0.01, s[paintTool] - 0.04) }));
      else if (k === ']') setSizes((s) => ({ ...s, [paintTool]: Math.min(1, s[paintTool] + 0.04) }));
      else if (k === 'escape') { setPanel(null); if (floatingRef.current) commitTransform(true); if (adjust) endAdjust(true); setDrop(null); }
      else if (k === 'enter') { if (floatingRef.current) commitTransform(); if (adjust) endAdjust(false); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  useEffect(() => () => { window.clearTimeout(saveTimer.current); }, []);

  /* ---------- side sliders: the pair is repositioned together with two
     fingers and seats on the left or right side only — never top, bottom,
     center or a corner. ---------- */
  const [sbSide, setSbSide] = useStored<'left' | 'right'>('pp.sbSide', 'left');
  const [sbDrag, setSbDrag] = useState<null | { x: number; y: number }>(null);
  const [sbY, setSbY] = useStored('pp.sbY', 0);
  const sbYRef = useRef(sbY); sbYRef.current = sbY;
  const sbDragRef = useRef<null | { x: number; y: number }>(null);
  const sbPts = useRef(new Map<number, { x: number; y: number }>());
  const sbGest = useRef<null | { cx: number; cy: number }>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sbBusy = useRef(false);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const mid = () => {
      const [a, b] = [...sbPts.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      sbPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (sbPts.current.size === 2 && !sbGest.current) {
        const m = mid();
        sbGest.current = { cx: m.x, cy: m.y };
        sbBusy.current = true; // freeze slider value changes while moving the pair
        e.preventDefault(); e.stopPropagation();
      }
    };
    const move = (e: PointerEvent) => {
      if (!sbPts.current.has(e.pointerId)) return;
      sbPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = sbGest.current;
      if (!g || sbPts.current.size < 2) return;
      e.preventDefault();
      const m = mid();
      const next = { x: m.x - g.cx, y: m.y - g.cy };
      sbDragRef.current = next;
      setSbDrag(next);
    };
    const up = (e: PointerEvent) => {
      if (!sbPts.current.has(e.pointerId)) return;
      sbPts.current.delete(e.pointerId);
      if (sbPts.current.size < 2 && sbGest.current) {
        sbGest.current = null;
        const dx = sbDragRef.current?.x ?? 0;
        const dy = sbDragRef.current?.y ?? 0;
        sbDragRef.current = null;
        setSbDrag(null);
        // seat on the nearer side only — left or right, nothing else
        const el2 = sidebarRef.current;
        let side: 'left' | 'right';
        if (el2) {
          const r = el2.getBoundingClientRect();
          side = r.left + dx + r.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
          // keep the vertical spot the pair was dropped at (stays on screen)
          const top = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top + dy));
          setSbY(sbYRef.current + (top - r.top));
        } else side = dx >= 0 ? 'right' : 'left';
        setSbSide(side);
        window.setTimeout(() => { sbBusy.current = false; }, 60);
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  /* pinch or resize the slider pair, then keep it fully on screen */
  const clampSbY = () => {
    requestAnimationFrame(() => {
      const el = sidebarRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minTop = 10;
      const maxBottom = window.innerHeight - 10;
      let nextY = sbYRef.current;
      if (r.top < minTop) {
        nextY += (minTop - r.top);
      } else if (r.bottom > maxBottom) {
        nextY -= (r.bottom - maxBottom);
      }
      if (Math.abs(nextY - sbYRef.current) > 1) {
        setSbY(Math.round(nextY));
      }
    });
  };
  usePinchScale(sidebarRef, 'pp.sbScale', 'center center', clampSbY);
  useEffect(() => {
    window.addEventListener('resize', clampSbY);
    return () => window.removeEventListener('resize', clampSbY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSliderResizeStart = (kind: 'size' | 'opacity', e: React.PointerEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const startH = sliderHeights[kind] || 108;
    const onMove = (ev: PointerEvent) => {
      const nextH = Math.max(68, Math.min(240, Math.round(startH + (ev.clientY - startY))));
      setSliderHeights((h) => ({ ...h, [kind]: nextH }));
      clampSbY();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clampSbY();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const showPreview = (kind: 'size' | 'opacity', value: number) => {
    window.clearTimeout(previewTimer.current);
    sliderPreview.current = { kind, value };
    requestRender();
  };
  const fadePreview = () => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => { sliderPreview.current = null; requestRender(); }, 550);
  };
  const sideSlider = (kind: 'size' | 'opacity') => {
    const value = kind === 'size' ? sizes[paintTool] : opacities[paintTool];
    const height = sliderHeights[kind] || 108;
    const set = (v: number) => {
      const c = Math.max(0.01, Math.min(1, v));
      if (kind === 'size') setSizes((s) => ({ ...s, [paintTool]: c })); else setOpacities((s) => ({ ...s, [paintTool]: c }));
      showPreview(kind, c);
    };
    const KNOB = 40, INSET = 7;
    const fromY = (el: HTMLElement, y: number) => { const r = el.getBoundingClientRect(); return 1 - (y - r.top - INSET - KNOB / 2) / (r.height - KNOB - INSET * 2); };
    const down = (e: RPE<HTMLDivElement>) => {
      if (sbBusy.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const knobY = r.top + INSET + KNOB / 2 + (1 - value) * (r.height - KNOB - INSET * 2);
      // tapping the track jumps there; grabbing the knob keeps its value (no jump)
      const v = Math.abs(e.clientY - knobY) <= KNOB * 0.75 ? value : fromY(el, e.clientY);
      sliderGrab.current = { y: e.clientY, x: e.clientX, v, h: r.height - KNOB - INSET * 2 };
      set(v);
      setSliderDrag({ kind, fine: false });
    };
    const move = (e: RPE<HTMLDivElement>) => {
      const g = sliderGrab.current;
      if (!g || !e.currentTarget.hasPointerCapture(e.pointerId) || sbBusy.current) return;
      // Pocket 5 precise control: the further the finger drifts sideways from the slider, the finer the steps
      const away = Math.abs(e.clientX - g.x);
      const fine = away > 40 ? 1 / (1 + (away - 40) / 45) : 1;
      const dy = e.clientY - g.y;
      g.v = Math.max(0.01, Math.min(1, g.v - (dy / g.h) * fine));
      g.y = e.clientY;
      set(g.v);
      if ((fine < 1) !== (sliderDrag?.fine ?? false)) setSliderDrag({ kind, fine: fine < 1 });
    };
    const up = () => { sliderGrab.current = null; setSliderDrag(null); fadePreview(); };
    const pct = `${Math.round(value * 100)}%`;
    const active = sliderDrag?.kind === kind;
    return (
      <div className="pp-vwrap">
        {kind === 'size' && <span className="pp-vlabel">{pct}</span>}
        <div
          className={`pp-bslider ${active ? 'is-active' : ''}`}
          style={{ height, '--v': value.toFixed(4), '--h': typeof height === 'number' ? `${height}px` : height } as React.CSSProperties}
          role="slider"
          tabIndex={0}
          aria-valuemin={1}
          aria-valuemax={100}
          onKeyDown={(e) => { if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); set(e.key === 'Home' ? 0.01 : e.key === 'End' ? 1 : value + (e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.01 : -0.01)); } }}
          onBlur={fadePreview}
          aria-label={kind === 'size' ? 'Brush size' : 'Brush opacity'}
          aria-valuenow={Math.round(value * 100)}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className="pp-bslider-fill" />
          <span className="pp-bslider-knob" />
          <span className={`pp-bslider-bubble ${active ? 'show' : ''}`} aria-hidden="true">
            <small>{kind === 'size' ? 'Size' : 'Opacity'}</small><b>{Math.round(value * 100)}%</b>{active && sliderDrag?.fine ? <small>fine</small> : null}
          </span>
        </div>
        {kind === 'opacity' && <span className="pp-vlabel">{pct}</span>}
      </div>
    );
  };

  const toolIcon = { brush: BrushGlyph, smudge: SmudgeGlyph, eraser: EraserGlyph }[paintTool];
  const ToolIcon = toolIcon;
  const brushTitle = { brush: 'Brushes', smudge: 'Smudge', eraser: 'Erase' }[paintTool];
  const infoLines = useMemo(() => [`${W} × ${H}px`, `${layers.length} layer${layers.length === 1 ? '' : 's'}`, `Created ${new Date(artwork.created).toLocaleDateString()}`, title], [W, H, layers.length, artwork.created, title]);

  /* ---------- UI ---------- */
  return (
    <div className="pp-editor" ref={wrapRef}>
      <canvas
        ref={viewCanvas}
        className="pp-view"
        style={{ filter: colorModeFilter(prefs.colorMode), cursor: prefs.drawCursor ? 'crosshair' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Canvas"
      />
      {!ready && <div className="pp-loading">Opening…</div>}

      {/* toolbar */}
      {!hideUI && (!expanded ? (
        <div key="folded" {...tbProps('compact pp-collapse')}>
          <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool !== 'select' && tool !== 'transform' ? 'on' : ''}`} aria-label={brushTitle} onClick={() => (tool === 'select' || tool === 'transform' ? chooseTool('brush') : setPanel(panel === 'brush' ? null : 'brush'))}>
            {tool === 'select' ? <SelectGlyph size={18} /> : tool === 'transform' ? <ArrowGlyph size={18} /> : <ToolIcon size={20} />}
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-more" aria-label="Show tools" onClick={() => toggleToolbar(true)}><DotsGlyph size={20} /></Button>
        </div>
      ) : (
        <div key="unfolded" {...tbProps('pp-unfold')}>
          <div className="pp-row">
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'brush' ? 'on' : ''}`} aria-label="Paint" onClick={() => chooseTool('brush')}><BrushGlyph size={22} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'smudge' ? 'on' : ''}`} aria-label="Smudge" onClick={() => chooseTool('smudge')}><SmudgeGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${tool === 'eraser' ? 'on' : ''}`} aria-label="Erase" onClick={() => chooseTool('eraser')}><EraserGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-tool ${panel === 'layers' ? 'on' : ''}`} aria-label="Layers" onClick={() => setPanel(panel === 'layers' ? null : 'layers')}><LayersGlyph size={24} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-color-btn ${panel === 'colors' ? 'on' : ''}`} aria-label="Colors (drag onto the canvas to fill)" style={{ background: color }}
              onPointerDown={(e) => dragOrTap(e, () => setPanel(panel === 'colors' ? null : 'colors'), () => startColorDrag(color, e))} />
          </div>
          <div className="pp-row pp-row2">
            <Button variant="paint" size="paint" type="button" className="pp-back" aria-label="Gallery" onClick={() => { void exit().catch(() => flash("Could not save artwork. Please try again.")); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l-8 8 8 8" /></svg>
            </Button>
            <Button variant="paint" size="paint" type="button" className={`pp-sub ${panel === 'actions' ? 'on' : ''}`} aria-label="Actions" onClick={() => setPanel(panel === 'actions' ? null : 'actions')}><WrenchGlyph size={18} /></Button>

            <Button variant="paint" size="paint" type="button" className={`pp-sub ${tool === 'select' || (selection && tool !== 'transform') ? 'on' : ''}`} aria-label="Selection (hold to reload the last selection)"
              onPointerDown={() => { selHold.current.fired = false; window.clearTimeout(selHold.current.t); selHold.current.t = window.setTimeout(() => { selHold.current.fired = true; reloadSelection(); }, 480); }}
              onPointerUp={() => window.clearTimeout(selHold.current.t)} onPointerLeave={() => window.clearTimeout(selHold.current.t)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => { if (selHold.current.fired) { selHold.current.fired = false; return; } chooseTool('select'); }}><SelectGlyph size={17} /></Button>
            <Button variant="paint" size="paint" type="button" className={`pp-sub ${tool === 'transform' ? 'on' : ''}`} aria-label="Transform" onClick={() => chooseTool(tool === 'transform' ? 'brush' : 'transform')}><ArrowGlyph size={17} /></Button>
            <Button variant="paint" size="paint" type="button" className="pp-sub pp-fold-btn" aria-label="Fold toolbar" onClick={() => toggleToolbar(false)}><DotsGlyph size={16} /></Button>
          </div>
        </div>
      ))}

      {/* side sliders — moved together with two fingers; seat on the left or right side */}
      {!hideUI && (
        <div ref={sidebarRef} className={`pp-sidebar sb-${sbSide} ${sbDrag ? 'sb-dragging' : ''}`}
          style={{ transform: sbDrag ? `translate(${sbDrag.x}px, ${sbY + sbDrag.y}px)` : `translateY(${sbY}px)` }}>
          {sideSlider('size')}
          {sideSlider('opacity')}
        </div>
      )}

      {toast && <div className="pp-toast">{toast}</div>}
      {quickMenu && <QuickMenu x={quickMenu.x} y={quickMenu.y} onClose={() => setQuickMenu(null)} onRun={(a) => runQuick(a)} />}

      {/* contextual bottom bars */}
      {!hideUI && tool === 'select' && !panel && !adjust && (
        <Sheet modal={false} label="Selection" className="pp-bottombar pp-sel-sheet" onClose={() => { commitDraft('add'); setTool('brush'); }}>
          <div className="pp-seg small pp-sel-modes" role="tablist" aria-label="Selection mode">
            {(['Automatic', 'Freehand', 'Rectangle', 'Ellipse'] as SelMode[]).map((m) => <Button variant="paint" size="paint" key={m} type="button" role="tab" aria-selected={selMode === m} className={selMode === m ? 'on' : ''} onClick={() => { if (m !== selMode) commitDraft('add'); setSelMode(m); }}>{m}</Button>)}
          </div>
          <div className="pp-chip-row pp-sel-actions">
            <Button variant="paint" size="paint" type="button" onClick={() => { if (!commitDraft('add')) flash('Draw a shape to add'); }}>Add</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { if (!commitDraft('remove')) flash('Draw a shape to remove'); }}>Remove</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { commitDraft('add'); selectionAction('invert'); }}>Invert</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { commitDraft('add'); selectionAction('copy-paste'); }}>Copy &amp; Paste</Button>
            <Button variant="paint" size="paint" type="button" className={selPanel === 'feather' ? 'on' : ''} onClick={() => { commitDraft('add'); setSelPanel(selPanel === 'feather' ? null : 'feather'); }}>Feather</Button>
            <Button variant="paint" size="paint" type="button" className={selPanel === 'saved' ? 'on' : ''} onClick={() => { commitDraft('add'); setSelPanel(selPanel === 'saved' ? null : 'saved'); }}>Save &amp; Load</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { commitDraft('add'); selectionAction('fill'); }}>Color Fill</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => selectionAction('clear')}>Clear</Button>
          </div>
          {selPanel === 'feather' && (
            <div className="pp-sel-panel">
              <div className="pp-sel-panel-row"><span>Feather</span><b>{feather}%</b></div>
              <input type="range" min={0} max={100} value={feather} className="pp-range" aria-label="Feather amount" onChange={(e) => setFeather(Number(e.target.value))} />
              <Button variant="paint" size="paint" type="button" className="pp-primary" onClick={() => { featherSel((feather / 100) * Math.max(W, H) * 0.04); setSelPanel(null); }}>Apply</Button>
            </div>
          )}
          {selPanel === 'saved' && (
            <div className="pp-sel-panel">
              <div className="pp-sel-panel-row"><span>Selections</span>
                <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Save current selection" onClick={saveCurrentSel}><Plus size={18} /></Button></div>
              {savedSels.length === 0 ? <p className="pp-hint">Tap + to store the current selection.</p> : (
                <div className="pp-sel-saved">
                  {savedSels.map((x) => (
                    <div key={x.id} className="pp-sel-saved-item">
                      <Button variant="paint" size="paint" type="button" onClick={() => { const n = buildSel(x.outlines); setSelection(n); if (n) lastSel.current = n.outlines; flash(`${x.name} loaded`); }}>
                        <img src={x.thumb} alt="" /><span>{x.name}</span>
                      </Button>
                      <Button variant="paint" size="paint" type="button" aria-label={`Delete ${x.name}`} onClick={() => deleteSavedSel(x.id)}><Trash2 size={16} /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}
      {!hideUI && tool === 'transform' && floatingOn && !panel && (
        <Sheet modal={false} label="Transform" className="pp-bottombar pp-tf-sheet" onClose={() => { commitTransform(); setTool('brush'); }}>
          <div className="pp-seg small pp-tf-tabs" role="tablist" aria-label="Transform mode">
            {(['Freeform', 'Uniform', 'Distort', 'Warp'] as const).map((m) => (
              <Button variant="paint" size="paint" key={m} type="button" role="tab" aria-selected={tfMode === m} className={tfMode === m ? 'on' : ''}
                onClick={() => setTfMode(m)}>{m}</Button>
            ))}
          </div>
          <div className="pp-tf-icons">
            {tfMode === 'Warp'
              ? <Button variant="paint" size="paint" type="button" className={advMesh ? 'on' : ''} aria-pressed={advMesh} aria-label="Advanced Mesh" onClick={() => { setAdvMesh(!advMesh); requestRender(); }}><Grid3x3 size={19} /></Button>
              : <Button variant="paint" size="paint" type="button" className={snapOn || magnetics ? 'on' : ''} aria-label="Snapping" onClick={() => setTfPanel(tfPanel === 'snap' ? null : 'snap')}><Magnet size={19} /></Button>}
            <Button variant="paint" size="paint" type="button" aria-label="Flip horizontally" onClick={() => tfFlip(true)}><FlipHorizontal2 size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Flip vertically" onClick={() => tfFlip(false)}><FlipVertical2 size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Rotate 45 degrees" onClick={tfRotate45}><RotateCw size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Fit to screen" onClick={tfFitScreen}><Maximize size={19} /></Button>
            <Button variant="paint" size="paint" type="button" aria-label="Reset transform" onClick={tfReset}><RotateCcw size={19} /></Button>
          </div>
          {tfPanel === 'snap' && tfMode !== 'Warp' && (
            <div className="pp-sel-panel">
              <label className="pp-sel-panel-row"><span>Snapping</span><input type="checkbox" className="pp-switch" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /></label>
              <label className="pp-sel-panel-row"><span>Magnetics</span><input type="checkbox" className="pp-switch" checked={magnetics} onChange={(e) => setMagnetics(e.target.checked)} /></label>
              <div className="pp-sel-panel-row"><span>Distance</span><b>{snapDist}</b></div>
              <input type="range" min={1} max={50} value={snapDist} className="pp-range" aria-label="Snapping distance" disabled={!snapOn} onChange={(e) => setSnapDist(Number(e.target.value))} />
            </div>
          )}
          <Button variant="paint" size="paint" type="button" className="pp-tf-interp" onClick={() => setTfPanel(tfPanel === 'interp' ? null : 'interp')}>
            <span>Interpolation: {interp}</span><ChevronRight size={17} style={{ transform: tfPanel === 'interp' ? 'rotate(90deg)' : undefined, transition: 'transform 180ms ease' }} />
          </Button>
          {tfPanel === 'interp' && (
            <div className="pp-sel-panel pp-tf-interp-list">
              {(['Nearest neighbor', 'Bilinear', 'Bicubic'] as const).map((x) => (
                <Button variant="paint" size="paint" key={x} type="button" className={interp === x ? 'on' : ''} onClick={() => { setInterp(x); setTfPanel(null); requestRender(); }}>{x}{interp === x && <Check size={16} />}</Button>
              ))}
            </div>
          )}
          <Button variant="paint" size="paint" type="button" className="pp-tf-done" aria-label="Apply transform" onClick={() => { commitTransform(); setTool('brush'); }}>
            <Check size={20} />
          </Button>
        </Sheet>
      )}
      {!hideUI && (() => {
        const t = adjTarget();
        if (!t) { overlayLive.current = false; return null; }
        overlayLive.current = t.name === 'Perspective Blur' || t.name === 'Chromatic Aberration';
        const histSrc = t.kind === 'direct' ? adjust?.base ?? null : null;
        return (
          <>
            <AdjustOverlay name={t.name} params={t.params}
              toScreen={(x, y) => toScreen({ x: x * W, y: y * H })}
              fromScreen={(x, y) => { const d = toDoc(x, y); return { x: d.x / W, y: d.y / H }; }}
              onBegin={beginAdj} onChange={setTargetParams} />
            <AdjustmentPanel key={`${t.kind}-${t.layer?.id ?? ''}-${t.name}`} name={t.name as AdjustmentName} params={t.params} isLayer={t.kind === 'layer'}
              histogramSource={t.name !== 'Curves' ? null : histSrc ?? histFor(t.layer!.id)}
              onBegin={beginAdj} onChange={setTargetParams} onDone={doneAdj} />
            {adjMenu && <AdjustActions x={adjMenu.x} y={adjMenu.y} preview={!isPreviewOff()}
              onPreview={previewAdj} onApply={() => { applyAdjStay(); setAdjMenu(null); }} onReset={() => { resetAdj(); setAdjMenu(null); }}
              onUndo={undoAdj} onCancel={cancelAdj} onClose={() => setAdjMenu(null)} />}
          </>
        );
      })()}
      {!hideUI && adjust && adjust.name === 'Clone' && (() => {
        const s = toScreen(cloneSrc);
        overlayLive.current = true;
        return (
          <>
            <CloneDisc x={s.x} y={s.y} locked={cloneLocked}
              onMove={(cx, cy) => setCloneSrc(toDoc(cx, cy))}
              onToggleLock={() => { setCloneLocked((v) => { flash(v ? 'Clone unlocked' : 'Clone lock'); return !v; }); }} />
            <CloneControls value={cloneSet} onChange={setCloneSet} locked={cloneLocked} onDone={() => { overlayLive.current = false; endAdjust(false); }} />
          </>
        );
      })()}
      {!hideUI && adjust && adjust.name === 'Liquify' && (
        <LiquifySheet value={liq} onChange={setLiq} onReset={resetLiquify} onDone={() => endAdjust(false)} />
      )}
      {!hideUI && drop && (
        <div
          className="pp-drop-capture"
          onPointerDown={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.setPointerCapture(e.pointerId);
            const st = dropGesture.current;
            st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (st.pts.size >= 2 || e.button === 1 || spaceDown.current) {
              // second finger (or middle mouse / space): pan & zoom the canvas, never adjust
              st.panning = true; st.moved = true; setDropSliding(false);
              const pts = [...st.pts.values()];
              const c = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
              const d = pts.length >= 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0;
              st.pan = dropPanStart(c, d, pts);
              return;
            }
            if (st.pts.size > 1) return;
            st.panning = false; st.moved = false;
            const startX = e.clientX, startY = e.clientY, startT = drop.threshold;
            st.startX = startX; st.startY = startY; st.startT = startT;
            const move = (ev: PointerEvent) => {
              if (!st.pts.has(ev.pointerId)) return;
              st.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
              if (st.panning && st.pan) {
                const pts = [...st.pts.values()];
                if (pts.length !== st.pan.n) { const c = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]; st.pan = dropPanStart(c, pts.length >= 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0, pts); return; }
                dropPanMove(st.pan, pts);
                requestRender();
                return;
              }
              const dx = ev.clientX - startX;
              if (!st.moved && Math.abs(dx) > 6) { st.moved = true; setDropSliding(true); }
              if (!st.moved) return;
              // fractional preview value for the bar, fills coalesced to one per frame
              const tf = Math.max(0, Math.min(100, startT + (dx - Math.sign(dx) * 6) / 4));
              setDropLive(tf);
              const t = Math.round(tf);
              st.pending = t;
              if (!st.raf) st.raf = requestAnimationFrame(() => {
                st.raf = 0;
                if (st.pending != null && st.pending !== dropRef.current?.threshold) redoDrop(st.pending);
                st.pending = null;
              });
            };
            const up = (ev: PointerEvent) => {
              st.pts.delete(ev.pointerId);
              if (st.pts.size > 0) return;
              el.removeEventListener('pointermove', move);
              el.removeEventListener('pointerup', up);
              el.removeEventListener('pointercancel', up);
              setDropSliding(false); setDropLive(null);
              const wasPan = st.panning; st.panning = false; st.pan = null;
              if (st.moved || wasPan) return;
              if (drop.continuing) doColorDrop(startX, startY, drop.color, drop.threshold, true);
              else setDrop(null);
            };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
          }}
        >
        </div>
      )}
      {!hideUI && drop && (
        <div className="pp-adjust-pill pp-drop-pill" role="group" aria-label="ColorDrop">
          <div className="pp-adjust-pill-copy">
            <b>ColorDrop</b>
            <span>Slide canvas to adjust</span>
          </div>
          <Button variant="paint" size="paint" type="button" className={`pp-drop-continue ${drop.continuing ? 'on' : ''}`} aria-pressed={!!drop.continuing}
            onClick={() => setDrop({ ...drop, continuing: !drop.continuing })}>Continue filling</Button>
          <Button variant="paint" size="paint" type="button" className={`pp-adjust-check pp-drop-edge-btn ${prefs.edgeDetect ? 'on' : ''}`}
            title="Edge detection" aria-label="Toggle edge detection" aria-pressed={prefs.edgeDetect}
            onClick={() => { const next = !prefs.edgeDetect; setPrefs(writePrefs({ edgeDetect: next })); flash(next ? 'Edge detection on' : 'Edge detection off — plain flood fill'); }}>
            <Scan size={20} strokeWidth={2.6} aria-hidden="true" />
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-adjust-check" aria-label="Finish ColorDrop" onClick={() => { finishFillWave(); requestRender(); setDrop(null); }}>
            <Check size={20} strokeWidth={2.6} />
          </Button>
        </div>
      )}
      {!hideUI && textDraft && <TextSheet draft={textDraft} onChange={setTextDraft} onCancel={() => { setTextDraft(null); setEditingText(null); }} onApply={applyText} onNotice={flash} />}

      {/* three-finger swipe down: cut / copy / paste for the current layer */}
      {!hideUI && clipMenu && (
        <Sheet label="Copy & Paste" className="pp-nested-menu pp-clipmenu" onClose={() => setClipMenu(false)}>
          <div className="pp-menu-items">
            <Button variant="paint" size="paint" type="button" onClick={() => { copySelection(true); setClipMenu(false); }}>Cut</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { copySelection(false); setClipMenu(false); }}>Copy</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { pasteClipboard(); setClipMenu(false); }}>Paste</Button>
          </div>
        </Sheet>
      )}

      {/* ColorDrop wave animation, loupe & ColorDrop ghost */}
      {loupe && (
        <div className="pp-loupe" style={{ left: Math.max(46, Math.min(window.innerWidth - 46, loupe.x)), top: Math.max(46, Math.min(window.innerHeight - 46, loupe.y - 70)), background: `linear-gradient(180deg, ${loupe.color} 50%, ${loupe.old} 50%)` }} />
      )}
      {ghost && <BlobGhost x={ghost.x} y={ghost.y} color={ghost.color} />}

      <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); e.target.value = ''; }} />

      {/* panels */}
      {!hideUI && panel === 'colors' && (
        <ColorsSheet
          color={color} previous={prevColor} recent={recent} palettes={palettes} tab={colorTab} harmony={harmony}
          onTab={setColorTab} onHarmony={setHarmony}
          onChange={(c) => setColor(c)}
          onCommit={() => commitRecent()}
          onSwap={() => { setPrevColor(color); setColor(prevColor); }}
          onPalettes={setPalettes}
          onDragStart={(hex, e) => startColorDrag(hex, e)}
          paletteView={paletteView} onPaletteView={setPaletteView}
          onClearHistory={() => setRecent([])}
          onClose={() => { setPanel(null); commitRecent(); }}
          onDetach={(t, x, y, paletteId) => {
            const id = makeId();
            setPanel(null);
            setGrabbedFloater(id);
            setFloaters((f) => [...f.slice(-5), { id, tab: t, x, y, paletteId }]);
          }}
          onApplyPalette={applyPaletteToLayer}
        />
      )}
      {!hideUI && floaters.map((f) => (
        <FloatingPicker key={f.id} floater={f} grabbed={grabbedFloater === f.id}
          color={color} previous={prevColor} recent={recent} palettes={palettes} harmony={harmony} paletteView={paletteView}
          onChange={(c) => setColor(c)} onCommit={() => commitRecent()}
          onHarmony={setHarmony} onPalettes={setPalettes} onPaletteView={setPaletteView}
          onDragStart={(hex, e) => startColorDrag(hex, e)}
          onMove={(x, y) => { setGrabbedFloater(null); setFloaters((all) => all.map((o) => (o.id === f.id ? { ...o, x, y } : o))); }}
          onRemove={() => { setGrabbedFloater(null); setFloaters((all) => all.filter((o) => o.id !== f.id)); try { localStorage.removeItem(`pp.floatScale.${f.id}`); } catch { /* ignore */ } }} />
      ))}
      {!hideUI && panel === 'layers' && (
        <LayersBar
          layers={layers} activeId={activeId} version={version} background={bg} backgroundVisible={bgVisible}
          onSelect={(id) => setActiveId(id)}
          onAdd={() => insertLayer()}
          onInsertImage={() => { fileRef.current?.click(); }}
          onToggle={(id) => { const l = layersRef.current.find((x) => x.id === id); if (l) updateLayer(id, { visible: !l.visible }); }}
          onReorder={reorder}
          onUpdate={updateLayer}
          onAction={layerAction}
          onAdjustments={(name) => { if (adjust) endAdjust(false); setPanel(null); startAdjust(name); }}
          adjustRequest={adjReq}
          onAddAdjustment={addAdjustmentLayer}
          onMergeLayers={mergeLayers}
          onEditText={editTextLayer}
          onRasterize={rasterizeText}
          onDeleteLayers={(ids) => { for (const id of ids) layerAction(id, 'delete'); }}
          onAddGroup={addGroup}
          onAddText={() => void runAction('add-text')}
          onSelectAll={selectAll}
          onShare={() => void runAction('export-png')}
          onAdjustValue={setAdjustValue}
          texture={texture?.id ?? null}
          onTexture={chooseTexture}
          onNotice={flash}
          onClose={() => setPanel(null)}
          onBackground={() => { pushHistory([]); setBg(color); scheduleSave(); flash('Background set to current color'); }}
          onBackgroundVisible={() => { pushHistory([]); setBgVisible(!bgVisible); scheduleSave(); }}
        />
      )}
      {!hideUI && panel === 'brush' && (
        <BrushSheet
          title={brushTitle}
          brushId={brushIds[paintTool]}
          streamline={streamline}
          onStreamline={setStreamline}
          onPick={(id) => setBrushIds((b) => ({ ...b, [paintTool]: id }))}
          onOpenStudio={(b) => setEditingBrush(b)}
          onImportBrushes={(imported) => {
            registerBrushes(imported);
            if (imported.length > 0) {
              setBrushIds((b) => ({ ...b, [paintTool]: imported[0].id }));
              flash(`Imported ${imported.length} brush${imported.length === 1 ? '' : 'es'}`);
            }
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {!hideUI && panel === 'actions' && (
        <ActionsSheet tab={actionTab} onTab={setActionTab} guide={guide} reference={!!referenceId} info={infoLines} dark={dark} onDark={setDark} frost={frost} onFrost={setFrost}
          prefsSlot={<CanvasPrefs prefs={prefs} onPrefs={setPrefs} />}
          onAction={(a) => void runAction(a)} onClose={() => setPanel(null)} />
      )}

      {editingBrush && (
        <BrushStudio
          brush={editingBrush}
          onSave={(updated) => {
            updateBrushDef(updated);
            setBrushIds((ids) => ({ ...ids, [paintTool]: updated.id }));
            flash(`Saved "${updated.name}"`);
            setEditingBrush(null);
          }}
          onClose={() => setEditingBrush(null)}
        />
      )}
    </div>
  );
}

export { blendModes, clampSize };
