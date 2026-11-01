import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Disc } from './ColorsSheet';
import { hexToHsv, hsvToHex, type HSV } from './color';
import { accentOptions, applyTheme, readAccent, readDark, readFrost, readPrefs, resetPrefs, writePrefs, type Prefs } from './settings';
import { PrefCycle, PrefSection, PrefSlider, PrefToggle, ResetButton } from './PrefsUI';
import { CardGlyph, CheckCircleGlyph, DocGlyph, GearGlyph, PhotosGlyph, PlusGlyph } from './icons';
import { createPortal } from 'react-dom';
import { makeId, type Artwork } from './storage';
import { deleteBackup, listBackups, type Backup } from './backups';
import { fitSheet, entryKey, moveEntry, normalize, renameStack, reorderInStack, stackOnto, unstack, type Entry } from './gallery-order';
import { useCardDrag, type DragSlot } from './card-drag';
import './gallery.css';

export type CanvasPreset = { name: string; space: 'P3' | 'sRGB'; width: number; height: number; label: string };

function screenPreset(): CanvasPreset {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  return { name: 'Screen Size', space: 'P3', width: w, height: h, label: `${w} × ${h}px` };
}

export const presets: CanvasPreset[] = [
  { name: 'Untitled Canvas', space: 'P3', width: 1500, height: 500, label: '1500 × 500px' },
  { name: 'Untitled Canvas', space: 'P3', width: 16, height: 16, label: '16 × 16px' },
  { name: 'Untitled Canvas', space: 'P3', width: 2000, height: 2500, label: '2000 × 2500px' },
  { name: 'Square', space: 'sRGB', width: 2048, height: 2048, label: '2048 × 2048px' },
  { name: '4K', space: 'sRGB', width: 4096, height: 1714, label: '4096 × 1714px' },
  { name: 'A4', space: 'sRGB', width: 2480, height: 3508, label: '210 × 297mm' },
  { name: '4 × 6 Photo', space: 'sRGB', width: 1800, height: 1200, label: '6" × 4"' },
  { name: 'Paper', space: 'sRGB', width: 3300, height: 2550, label: '11" × 8.5"' },
  { name: 'Comic', space: 'sRGB', width: 1988, height: 3075, label: '6.63" × 10.25"' },
  { name: 'Story', space: 'P3', width: 1080, height: 1920, label: '1080 × 1920px' },
];

type Rect = { left: number; top: number; width: number; height: number };
type Pos = { x: number; y: number };
type Slot = { key: string; e: Entry; x: number; y: number; w: number; h: number };
const ORDER_KEY = 'pp.galleryOrder';
const loadOrder = (): Entry[] => { try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

/* Vertical masonry strip: cards flow top-to-bottom in fixed columns.
   Nothing is cropped — every card always fits the visible width. */
const GAP_X = 18, GAP_Y = 14, PAD = 18, TOP = 96, BOTTOM = 116;
const DOCK_KEY = 'pp.dockSide';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? { ...(fallback as object), ...v } as T : fallback;
  } catch { return fallback; }
}
const saveJSON = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

const thumbH = (a: Artwork, cardW: number) => Math.max(64, Math.min(cardW * 2.4, cardW * (a.height / Math.max(1, a.width))));

type Props = {
  artworks: Artwork[];
  loading: boolean;
  onOpen: (a: Artwork, rect: Rect) => void;
  onCreate: (width: number, height: number, title?: string) => void;
  onImport: (files: FileList) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onRename: (id: string, title: string) => void;
  onShare: (ids: string[]) => void;
  onRestore: (a: Artwork) => void;
};

export function Gallery({ artworks, loading, onOpen, onCreate, onImport, onDelete, onDuplicate, onRename, onShare, onRestore }: Props) {
  const [sheet, setSheet] = useState(false);
  // destructive actions animate out first (cards shrink + fade, neighbours glide in)
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const removeAnimated = (ids: string[]) => {
    if (!ids.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onDelete(ids); return; }
    setLeaving((l) => new Set([...l, ...ids]));
    window.setTimeout(() => { onDelete(ids); setLeaving((l) => { const n = new Set(l); ids.forEach((id) => n.delete(id)); return n; }); }, 240);
  };
  const isLeaving = (e: Entry) => (e.t === 'a' ? leaving.has(e.id) : e.items.length > 0 && e.items.every((id) => leaving.has(id)));
  // empty-gallery text fades in and out instead of popping
  const emptyNow = !loading && artworks.length === 0;
  const [emptyMounted, setEmptyMounted] = useState(emptyNow);
  useEffect(() => {
    if (emptyNow) { setEmptyMounted(true); return; }
    const t = window.setTimeout(() => setEmptyMounted(false), 260);
    return () => window.clearTimeout(t);
  }, [emptyNow]);
  const [settings, setSettings] = useState(false);
  const [dark, setDarkState] = useState(() => readDark());
  const [accent, setAccentState] = useState(() => readAccent());
  const [frost, setFrostState] = useState(() => readFrost());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [restoreFor, setRestoreFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [cols, setCols] = useState(2);
  const [vpW, setVpW] = useState(390);
  const viewportRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);

  /* gallery order + stacks: opening a canvas never moves it */
  const [openStack, setOpenStack] = useState<string | null>(null);
  const [rawOrder, setRawOrder] = useState<Entry[]>(loadOrder);
  const idsKey = artworks.map((a) => a.id).join('|');
  const order = useMemo(() => normalize(rawOrder, artworks.map((a) => a.id)), [rawOrder, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const orderRef = useRef(order); orderRef.current = order;
  const setOrder = (fn: (o: Entry[]) => Entry[]) => setRawOrder(fn(orderRef.current));
  useEffect(() => { if (!loading) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ } } }, [order, loading]);
  const byId = useMemo(() => new Map(artworks.map((a) => [a.id, a])), [artworks]);
  const boardRef = useRef<HTMLDivElement>(null);

  /* ---------- dock: two-finger drag, bottom corners only ---------- */
  const [dockSide, setDockSide] = useState<'left' | 'right'>(() => loadJSON<'left' | 'right'>(DOCK_KEY, 'right'));
  const dockSideRef = useRef(dockSide); dockSideRef.current = dockSide;
  // the settings gear spins each time it changes corners with the dock
  const [gearSpin, setGearSpin] = useState(0);
  const prevSide = useRef(dockSide);
  useEffect(() => { if (prevSide.current !== dockSide) { prevSide.current = dockSide; setGearSpin((s) => s + 1); } }, [dockSide]);

  const [dockDrag, setDockDrag] = useState<Pos | null>(null);
  const dockDragRef = useRef<Pos | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockPts = useRef(new Map<number, Pos>());
  const dockGest = useRef<null | { cx: number; cy: number }>(null);

  useEffect(() => { saveJSON(DOCK_KEY, dockSide); }, [dockSide]);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const mid = () => { const [a, b] = [...dockPts.current.values()] as [Pos, Pos]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const down = (e: PointerEvent) => {
      dockPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dockPts.current.size === 2 && !dockGest.current) {
        const m = mid();
        dockGest.current = { cx: m.x, cy: m.y };
        suppressClick.current = true;
      }
    };
    const move = (e: PointerEvent) => {
      if (!dockPts.current.has(e.pointerId)) return;
      dockPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = dockGest.current;
      if (!g || dockPts.current.size < 2) return;
      e.preventDefault();
      const m = mid();
      // Horizontal follows the finger; the bottom edge is rubber-banded —
      // the dock resists and can never leave the screen.
      const rawDy = m.y - g.cy;
      const dy = rawDy > 0 ? rawDy * 0.28 : rawDy * 0.5;
      const next = { x: m.x - g.cx, y: Math.max(-40, dy) };
      dockDragRef.current = next;
      setDockDrag(next);
    };
    const up = (e: PointerEvent) => {
      dockPts.current.delete(e.pointerId);
      if (dockPts.current.size < 2 && dockGest.current) {
        dockGest.current = null;
        // snap to the nearest bottom corner
        const dx = dockDragRef.current?.x ?? 0;
        const side: 'left' | 'right' = dx > 0 ? 'right' : 'left';
        dockDragRef.current = null;
        setDockDrag(null);
        if (side !== dockSideRef.current) {
          setDockSide(side);
          try { navigator.vibrate?.(8); } catch { /* ignore */ }
        }
        window.setTimeout(() => { suppressClick.current = false; }, 0);
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
  const dockClickGuard = (e: React.MouseEvent) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); }
  };

  useEffect(() => { if (!selecting) setSelected([]); }, [selecting]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Select mode → Stack: gather the selected artworks into one new stack, preserving index
  const stackSelected = () => {
    if (selected.length < 2) return;
    const id = makeId();
    const sel = new Set(selected);
    setOrder((o) => {
      const firstIdx = o.findIndex((e) => (e.t === 'a' ? sel.has(e.id) : false));
      const items = o.filter((e) => e.t === 'a' && sel.has(e.id)).map((e) => e.id);
      const remaining = o.filter((e) => !(e.t === 'a' && sel.has(e.id)));
      const newStack: Entry = { t: 's', id, name: 'Stack', items };
      const next = [...remaining];
      next.splice(Math.max(0, Math.min(next.length, firstIdx >= 0 ? firstIdx : 0)), 0, newStack);
      return next;
    });
    setSelected([]);
    setSelecting(false);
  };

  /* Multitouch stacking: press and hold card A, tap card B with second finger */
  const touchHold = useRef<{ key: string; pointerId: number; time: number } | null>(null);
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (touchHold.current && touchHold.current.pointerId === e.pointerId) {
        touchHold.current = null;
      }
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  /* Auto-add new artworks to open stack when created or imported from inside the stack */
  const prevArtIds = useRef(new Set(artworks.map((a) => a.id)));
  useEffect(() => {
    const cur = new Set(artworks.map((a) => a.id));
    const added = artworks.filter((a) => !prevArtIds.current.has(a.id)).map((a) => a.id);
    prevArtIds.current = cur;
    if (added.length && openStack) {
      setOrder((o) =>
        o.map((e) => (e.t === 's' && e.id === openStack ? { ...e, items: [...e.items, ...added] } : e))
      );
    }
  }, [artworks, openStack]);

  /* masonry layout: measure the visible width, then flow cards down fixed columns */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; setVpW(w); setCols(w < 480 ? 2 : w < 780 ? 3 : 4); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flow = (entries: Entry[]) => {
    const cardW = Math.max(90, Math.min(320, Math.floor((vpW - PAD * 2 - GAP_X * (cols - 1)) / cols)));
    const colH = new Array(cols).fill(TOP);
    const slots: Slot[] = [];
    for (const e of entries) {
      const first = byId.get(e.t === 'a' ? e.id : e.items[0]!);
      if (!first) continue;
      const c = colH.indexOf(Math.min(...colH));
      const s: Slot = { key: entryKey(e), e, x: PAD + c * (cardW + GAP_X), y: colH[c], w: cardW, h: e.t === 's' ? Math.max(...e.items.slice(0, 3).map((id) => byId.get(id)).filter(Boolean).map((a) => thumbH(a as Artwork, cardW))) + 22 : thumbH(first, cardW) };
      colH[c] += s.h + GAP_Y;
      slots.push(s);
    }
    const boardH = Math.max(200, Math.max(...colH, TOP) - GAP_Y + BOTTOM);
    return { slots, cardW, boardH };
  };
  const base = useMemo(() => flow(order), [order, cols, vpW, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseRef = useRef(base); baseRef.current = base;
  const cd = useCardDrag({
    boardRef, scrollRef: viewportRef,
    slots: (): DragSlot[] => baseRef.current.slots.map(({ key, x, y, w, h }) => ({ key, x, y, w, h })),
    canStack: (drag, target) => !(drag.startsWith('stack:') && target.startsWith('stack:')), // a stack pours into a canvas, but never into another stack
    onDrop: (key, r) => {
      if (!r) return;
      if (r.type === 'move') setOrder((o) => moveEntry(o, key, r.index));
      else if (r.type === 'stack') setOrder((o) => stackOnto(o, key, r.target, makeId()));
    },
    onHold: (key, x, y) => setMenu({ id: key, x, y }),
  });
  const layout = useMemo(() => (cd.drag && cd.drag.index !== null && !cd.drag.stack ? flow(moveEntry(order, cd.drag.key, cd.drag.index)) : base),
    [cd.drag?.key, cd.drag?.index, cd.drag?.stack, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardClick = (a: Artwork, e: React.MouseEvent) => {
    if (suppressClick.current || cd.suppressed()) { suppressClick.current = false; return; }
    if (selecting) { toggle(a.id); return; }
    const el = (e.currentTarget as HTMLElement).querySelector('.pp-thumb') ?? e.currentTarget;
    const r = el.getBoundingClientRect();
    onOpen(a, { left: r.left, top: r.top, width: r.width, height: r.height });
  };

  const cardFace = (a: Artwork, thumbHeight: number, isSel: boolean, isSelecting: boolean, isRenaming: boolean) => (
    <>
      <span className={`pp-thumb ${isSel ? 'is-selected' : ''}`} style={{ height: thumbHeight }}>
        {a.preview ? <img src={a.preview} alt="" draggable={false} decoding="async" /> : <span className="pp-thumb-blank" />}
        {isSelecting && <span className={`pp-check ${isSel ? 'on' : ''}`}>{isSel ? '✓' : ''}</span>}
        {/* Canvas name sits inside the thumb, bottom-left, over a soft black fade */}
        <span className="pp-card-shade" aria-hidden="true" />
        <span className="pp-card-meta">
          {isRenaming ? (
            <input
              className="pp-rename"
              autoFocus
              defaultValue={a.title}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => { onRename(a.id, e.currentTarget.value.trim() || 'Untitled Artwork'); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
            />
          ) : (
            <Button variant="paint" size="paint" type="button" className="pp-card-title" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setRenaming(a.id); }}>{a.title}</Button>
          )}
          <span className="pp-card-dim">{a.width} × {a.height}px</span>
        </span>
      </span>
    </>
  );

  const stackFace = (e: Extract<Entry, { t: 's' }>, h: number, w: number) => {
    const arts = e.items.map((id) => byId.get(id)).filter(Boolean) as Artwork[];
    return (
      <>
        <span className="pp-stack-pile" style={{ height: h }}>
          {arts.slice(0, 3).reverse().map((a, i, all) => {
            const k = all.length - 1 - i;
            // name + fade live inside the TOP canvas so they always fit it exactly
            const top = k === 0;
            return (
              <span key={a.id} className="pp-thumb pp-stack-sheet pp-fit" data-k={k} style={(() => {
                const f = fitSheet(a.width, a.height, Math.max(1, w - 20), Math.max(1, h - 16));
                return { '--sl': `${10 + f.left}px`, '--st': `${8 + f.top}px`, '--sw': `${f.width}px`, '--sh': `${f.height}px` } as React.CSSProperties;
              })()}>
                {a.preview ? <img src={a.preview} alt="" draggable={false} decoding="async" /> : <span className="pp-thumb-blank" />}
                {top && (
                  <>
                    <span className="pp-card-shade" aria-hidden="true" />
                    <span className="pp-card-meta">
                      {renaming === `stack:${e.id}` ? (
                        <input className="pp-rename" autoFocus defaultValue={e.name} onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => ev.stopPropagation()}
                          onBlur={(ev) => { const n = ev.currentTarget.value.trim() || 'Stack'; setOrder((o) => renameStack(o, e.id, n)); setRenaming(null); }}
                          onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setRenaming(null); }} />
                      ) : <span className="pp-card-title">{e.name}</span>}
                      <span className="pp-card-dim">{arts.length} {arts.length === 1 ? 'artwork' : 'artworks'}</span>
                    </span>
                  </>
                )}
              </span>
            );
          })}
        </span>
      </>
    );
  };
  const stackEntry = order.find((x) => x.t === 's' && x.id === openStack) as Extract<Entry, { t: 's' }> | undefined;

  const handleCardPointerDown = (key: string, ev: React.PointerEvent) => {
    if (ev.pointerType === 'touch') {
      if (!touchHold.current) {
        touchHold.current = { key, pointerId: ev.pointerId, time: performance.now() };
      } else if (touchHold.current.pointerId !== ev.pointerId) {
        const held = touchHold.current;
        if (held.key !== key && performance.now() - held.time > 80) {
          ev.preventDefault();
          ev.stopPropagation();
          suppressClick.current = true;
          if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
          setOrder((o) => stackOnto(o, key, held.key, makeId()));
          touchHold.current = null;
          return;
        }
      }
    }
    cd.down(key, ev);
  };

  return (
    <div className="pp-gallery">
      <header className="pp-gallery-head">
        <h1><b>Aeternum</b>Paint</h1>
      </header>

      <div className="pp-viewport" ref={viewportRef}>
        {emptyMounted && (
          <div className={`pp-empty pp-empty-anim ${emptyNow ? '' : 'is-leaving'}`}>
            <p><b>Draw, draw — and keep drawing.</b></p>
            <span>—CreatriXstudioS</span>
          </div>
        )}

        <div className="pp-board" ref={boardRef} style={{ height: layout.boardH }}>
          {layout.slots.map(({ key, e, x, y, w, h }, i) => {
            const isDrag = cd.drag?.key === key;
            const cls = `pp-mcard ${isDrag ? 'pp-drag-src' : ''} ${cd.drag?.stack === key ? 'pp-stack-target' : ''} ${cd.drag ? 'pp-reflow' : ''} ${cd.armed === key ? 'pp-armed' : ''} ${isLeaving(e) ? 'pp-leaving' : ''}`;
            if (e.t === 'a') {
              const a = byId.get(e.id)!;
              return (
                <div key={key} data-card={key} className={cls} style={{ left: x, top: y, width: w, animationDelay: `${Math.min(i * 30, 300)}ms` }}
                  onPointerDown={(ev) => handleCardPointerDown(key, ev)}
                  onClick={(ev) => cardClick(a, ev)}
                  onContextMenu={(ev) => { ev.preventDefault(); setMenu({ id: a.id, x: ev.clientX, y: ev.clientY }); }}>
                  {cardFace(a, h, selected.includes(a.id), selecting, renaming === a.id)}
                </div>
              );
            }
            return (
              <div key={key} data-card={key} className={`${cls} pp-stack-card`} style={{ left: x, top: y, width: w, animationDelay: `${Math.min(i * 30, 300)}ms` }}
                onPointerDown={(ev) => handleCardPointerDown(key, ev)}
                onClick={() => { if (cd.suppressed() || suppressClick.current) { suppressClick.current = false; return; } setOpenStack(e.id); }}
                onContextMenu={(ev) => { ev.preventDefault(); setMenu({ id: key, x: ev.clientX, y: ev.clientY }); }}>
                {stackFace(e, h, w)}
              </div>
            );
          })}
        </div>
      </div>
      {cd.drag && (() => {
        const d = cd.drag; const e = order.find((x) => entryKey(x) === d.key);
        if (!e) return null;
        return createPortal(
          <div className={`pp-mcard pp-drag-float ${d.stack ? 'over-stack' : ''}`} style={{ left: d.x - d.ox, top: d.y - d.oy, width: d.w }}>
            {e.t === 'a' ? cardFace(byId.get(e.id)!, d.h, false, false, false) : stackFace(e, d.h, d.w)}
          </div>, document.body);
      })()}

      <input ref={fileRef} hidden type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.psd,.zip,.arnm,application/zip" multiple onChange={(e) => { if (e.target.files?.length) onImport(e.target.files); e.target.value = ''; }} />
      <input ref={photoRef} hidden type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files?.length) onImport(e.target.files); e.target.value = ''; }} />

      <div
        ref={dockRef}
        className={`pp-dock ${dockSide === 'left' ? 'dock-left' : 'dock-right'} ${dockDrag ? 'dragging' : ''}`}
        style={dockDrag ? { transform: `translate(${dockDrag.x}px, ${dockDrag.y}px)` } : undefined}
        onClickCapture={dockClickGuard}
        title="Drag with two fingers to the bottom-left or bottom-right corner"
      >
        {selecting ? (
          <>
            <div className="pp-dock-pill pp-dock-text">
              <Button variant="paint" size="paint" type="button" disabled={!selected.length} onClick={() => onShare(selected)}>Share</Button>
              <Button variant="paint" size="paint" type="button" disabled={!selected.length} onClick={() => { onDuplicate(selected); setSelecting(false); }}>Duplicate</Button>
              <Button variant="paint" size="paint" type="button" disabled={selected.length < 2} onClick={stackSelected}>Stack</Button>
              <Button variant="paint" size="paint" type="button" className="danger" disabled={!selected.length} onClick={() => { removeAnimated(selected); setSelecting(false); }}>Delete</Button>
            </div>
            <Button variant="paint" size="paint" type="button" className="pp-dock-round pp-dock-done" onClick={() => setSelecting(false)}>Done</Button>
          </>
        ) : (
          <>
            <div className="pp-dock-pill">
              <Button variant="paint" size="paint" type="button" aria-label="Select artworks" onClick={() => setSelecting(true)}><CheckCircleGlyph /></Button>
              <Button variant="paint" size="paint" type="button" aria-label="Import a file" onClick={() => fileRef.current?.click()}><DocGlyph /></Button>
              <Button variant="paint" size="paint" type="button" aria-label="Import a photo" onClick={() => photoRef.current?.click()}><PhotosGlyph /></Button>
            </div>
            <Button variant="paint" size="paint" type="button" className="pp-dock-round" aria-label="New canvas" onClick={() => setSheet(true)}><PlusGlyph /></Button>
          </>
        )}
      </div>

      {/* Settings: sits in the corner opposite the dock */}
      <Button variant="paint" size="paint" type="button" className={`pp-settings-btn ${dockSide === 'left' ? 'side-right' : 'side-left'}`} aria-label="Settings" onClick={() => setSettings(true)}>
        <span key={gearSpin} className="pp-gear-spin"><GearGlyph size={16} /></span>
      </Button>

      {stackEntry && (
        <StackWindow stack={stackEntry} byId={byId} face={(a, h, sel, seling) => cardFace(a, h, !!sel, !!seling, renaming === a.id)}
          onClose={() => setOpenStack(null)}
          onOpen={onOpen}
          onRename={(n) => setOrder((o) => renameStack(o, stackEntry.id, n))}
          onReorder={(id, i) => setOrder((o) => reorderInStack(o, stackEntry.id, id, i))}
          onUnstack={(id) => setOrder((o) => unstack(o, stackEntry.id, id))}
          onHold={(id, x, y) => setMenu({ id, x, y })}
          onImportFile={() => fileRef.current?.click()}
          onImportPhoto={() => photoRef.current?.click()}
          onSettings={() => setSettings(true)}
          onNewCanvas={() => setSheet(true)}
          onShare={onShare}
          onDuplicate={onDuplicate}
          onDelete={removeAnimated} leaving={leaving} />
      )}
      {menu && menu.id.startsWith('stack:') && (
        <Sheet label="Stack options" className="pp-nested-menu" onClose={() => setMenu(null)}>
          <div className="pp-menu-items">
            <Button variant="paint" size="paint" type="button" onClick={() => { setRenaming(menu.id); setMenu(null); }}>Rename</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { const e = order.find((x) => entryKey(x) === menu.id); if (e?.t === 's') onShare(e.items); setMenu(null); }}>Share</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { setOrder((o) => o.flatMap((x) => (entryKey(x) === menu.id && x.t === 's' ? x.items.map((id): Entry => ({ t: 'a', id })) : [x]))); setMenu(null); }}>Unstack</Button>
          </div>
        </Sheet>
      )}
      {menu && !menu.id.startsWith('stack:') && (
        <Sheet label="Artwork options" className="pp-nested-menu" onClose={() => setMenu(null)}>
          <div className="pp-menu-items">
            {selected.length >= 2 && (
              <Button variant="paint" size="paint" type="button" onClick={() => { stackSelected(); setMenu(null); }}>Stack</Button>
            )}
            <Button variant="paint" size="paint" type="button" onClick={() => { setRenaming(menu.id); setMenu(null); }}>Rename</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { setRestoreFor(menu.id); setMenu(null); }}>Restore</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { const id = menu.id; if (window.confirm('Delete undo and redo history for this canvas? Your artwork will not be changed.')) { void import('./history-store').then(({ clearHistory }) => clearHistory(id)); setMenu(null); } }}>Delete Undo History</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { onShare(selected.length ? selected : [menu.id]); setMenu(null); }}>Share</Button>
            <Button variant="paint" size="paint" type="button" onClick={() => { onDuplicate(selected.length ? selected : [menu.id]); setMenu(null); }}>Duplicate</Button>
            <Button variant="paint" size="paint" type="button" className="danger" onClick={() => { removeAnimated(selected.length ? selected : [menu.id]); setMenu(null); }}>Delete</Button>
          </div>
        </Sheet>
      )}

      {sheet && <NewCanvasSheet onClose={() => setSheet(false)} onCreate={(w, h, t) => { setSheet(false); onCreate(w, h, t); }} />}
      {settings && (
        <SettingsSheet
          onClose={() => setSettings(false)}
          dark={dark} onDark={(v) => { setDarkState(v); applyTheme(v); }}
          accent={accent} onAccent={(v) => { setAccentState(v); applyTheme(undefined, v); }}
          frost={frost} onFrost={(v) => { setFrostState(v); applyTheme(undefined, undefined, v); }}
        />
      )}
      {restoreFor && (
        <RestoreSheet artwork={byId.get(restoreFor)} onClose={() => setRestoreFor(null)}
          onRestore={(a) => { onRestore(a); setRestoreFor(null); }} />
      )}
    </div>
  );
}

/* Restore window: a bottom sheet with a two-row masonry of backups, newest first. */
function RestoreSheet({ artwork, onClose, onRestore }: { artwork: Artwork | undefined; onClose: () => void; onRestore: (a: Artwork) => void }) {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [confirm, setConfirm] = useState<Backup | null>(null);
  useEffect(() => { if (artwork) void listBackups(artwork.id).then(setBackups); }, [artwork]);
  const fmt = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <Sheet onClose={onClose} dim label={`Restore ${artwork?.title ?? 'canvas'}`} className="pp-sheet-inset pp-restore" height="50dvh">
      <div className="pp-sheet-head">
        <h2>Restore</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Close restore" onClick={onClose}><span className="pp-x">✕</span></Button>
      </div>
      <p className="pp-hint pp-restore-hint">A backup is saved each time you leave “{artwork?.title}” after making changes.</p>
      {backups === null ? null : backups.length === 0 ? (
        <p className="pp-restore-empty">No backups yet. Backups appear here after you edit this canvas and leave it.</p>
      ) : (
        <div className="pp-restore-grid">
          {backups.map((b) => (
            <div key={b.key} className={`pp-restore-card ${confirm?.key === b.key ? 'confirm' : ''}`}>
              <button type="button" className="pp-restore-face" onClick={() => setConfirm(confirm?.key === b.key ? null : b)}>
                {b.preview ? <img src={b.preview} alt="" draggable={false} /> : <span className="pp-thumb-blank" />}
                <span className="pp-restore-date">{fmt(b.ts)}</span>
              </button>
              {confirm?.key === b.key && (
                <div className="pp-restore-actions">
                  <Button variant="paint" size="paint" type="button" className="pp-primary" onClick={() => onRestore({ ...b.snapshot, updated: Date.now() })}>Restore</Button>
                  <Button variant="paint" size="paint" type="button" className="danger" onClick={() => { void deleteBackup(b.key); setBackups(backups.filter((x) => x.key !== b.key)); setConfirm(null); }}>Delete</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function SettingsSheet({ onClose, dark, onDark, accent, onAccent, frost, onFrost }: {
  onClose: () => void; dark: boolean; onDark: (v: boolean) => void; accent: string; onAccent: (v: string) => void;
  frost: boolean; onFrost: (v: boolean) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(accent));
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const set = (patch: Partial<Prefs>) => setPrefs(writePrefs(patch));
  return (
    <Sheet onClose={onClose} dim label="Settings" className="pp-sheet-inset pp-newcanvas pp-settings" height="50dvh">
      <div className="pp-sheet-head">
        <h2>Settings</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Close settings" onClick={onClose}><span className="pp-x">✕</span></Button>
      </div>
      <div className="pp-sheet-scroll">
        <PrefSection label="Appearance">
          <PrefToggle label="Dark mode" on={dark} onChange={onDark} />
          <PrefToggle label="frost" on={frost} onChange={onFrost} />
        </PrefSection>
        
        <div className="pp-group pp-set-accent">
          <div className="pp-accent-swatches">
            {accentOptions().map((c) => (
              <Button variant="paint" size="paint" key={c} type="button" className={`pp-accent-dot ${accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }}
                aria-label={`Use ${c} accent`} aria-pressed={accent.toLowerCase() === c.toLowerCase()} onClick={() => onAccent(c)} />
            ))}
            <Button variant="paint" size="paint" type="button" className={`pp-accent-custom ${picker ? 'on' : ''}`} aria-label="Custom accent color" aria-expanded={picker} onClick={() => setPicker((v) => !v)} />
          </div>
          {picker && (
            <div className="pp-accent-disc">
              <Disc hsv={hsv} onChange={(h) => { setHsv(h); onAccent(hsvToHex(h)); }} onCommit={() => {}} />
            </div>
          )}
        </div>
        <PrefSection label="Language">
          <PrefCycle label="Language" value={prefs.language} options={['default'] as const} onChange={(v) => set({ language: v })} />
        </PrefSection>
        <PrefSection label="Gestures">
          <PrefCycle label="Double tap" value={prefs.doubleTap} options={['nothing', 'undo', 'eyedropper'] as const} onChange={(v) => set({ doubleTap: v })} />
          <PrefCycle label="Long press" value={prefs.longPress} options={['eyedropper', 'nothing'] as const} onChange={(v) => set({ longPress: v })} />
        </PrefSection>
        <PrefSection label="New Project">
          <PrefToggle label="Timelapse" on={prefs.timelapse} onChange={(v) => set({ timelapse: v })} />
          <PrefCycle label="Video quality" value={prefs.videoQuality} options={['720p', '1080p', '4K'] as const} onChange={(v) => set({ videoQuality: v })} />
        </PrefSection>
        <PrefSection label="Hardware">
          <PrefCycle label="Volume keys" value={prefs.volumeKeys} options={['nothing', 'brush-size', 'undo'] as const} onChange={(v) => set({ volumeKeys: v })} />
          <PrefToggle label="Disable Back" on={prefs.disableBack} onChange={(v) => set({ disableBack: v })} />
        </PrefSection>
        <PrefSection label="Saving">
          <PrefToggle label="Save changes prompt" on={prefs.savePrompt} onChange={(v) => set({ savePrompt: v })} />
          <PrefSlider label="History" value={prefs.historyLimit} min={10} max={10000} onChange={(v) => set({ historyLimit: v })} />
        </PrefSection>
        <ResetButton onReset={() => setPrefs(resetPrefs(['doubleTap', 'longPress', 'timelapse', 'videoQuality', 'volumeKeys', 'disableBack', 'savePrompt', 'historyLimit', 'language']))} />
        <p className="pp-hint">Saved on this device. Canvas settings (color mode, brush behaviour, rendering) live inside a canvas under Actions → Settings.</p>
      </div>
    </Sheet>
  );
}

function NewCanvasSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (w: number, h: number, title?: string) => void }) {
  const screen = useMemo(screenPreset, []);
  const [custom, setCustom] = useState(false);
  const [w, setW] = useState('2048');
  const [h, setH] = useState('2048');
  const [name, setName] = useState('Untitled Canvas');

  return (
    <Sheet onClose={onClose} dim label="New canvas" className="pp-sheet-inset pp-newcanvas">
      <div className="pp-sheet-head">
        <h2>{custom ? 'Custom canvas' : 'New canvas'}</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label={custom ? 'Back to presets' : 'Custom canvas'} onClick={() => setCustom((c) => !c)}>
          {custom ? <span className="pp-x">✕</span> : <CardGlyph />}
        </Button>
      </div>
      {custom ? (
        <form className="pp-custom" onSubmit={(e) => { e.preventDefault(); onCreate(Number(w) || 2048, Number(h) || 2048, name); }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="pp-custom-row">
            <label>Width<input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/\D/g, ''))} /><em>px</em></label>
            <label>Height<input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} /><em>px</em></label>
          </div>
          <p className="pp-custom-note">Maximum 4096px on the longest side.</p>
          <Button variant="paint" size="paint" type="submit" className="pp-primary">Create</Button>
        </form>
      ) : (
        <div className="pp-sheet-scroll">
          <div className="pp-group">
            <PresetRow p={screen} onClick={() => onCreate(screen.width, screen.height)} />
          </div>
          <div className="pp-group pp-group-plain">
            {presets.map((p, i) => <PresetRow key={i} p={p} onClick={() => onCreate(p.width, p.height, p.name === 'Untitled Canvas' ? undefined : p.name)} />)}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function PresetRow({ p, onClick }: { p: CanvasPreset; onClick: () => void }) {
  return (
    <Button variant="paint" size="paint" type="button" className="pp-preset" onClick={onClick}>
      <span className="pp-preset-name">{p.name}</span>
      <span className="pp-chips"><span>{p.space}</span><span>{p.label}</span></span>
    </Button>
  );
}

/* Procreate-style stack window: a mini masonry gallery with the stack name at the
 * top left. Drag inside to reorder; drag a canvas out of the window to unstack it.
 * A bottom action row mirrors the gallery dock (select, import file, import photo,
 * settings, new canvas); the content scrolls underneath it with a soft fade. */
function StackWindow({ stack, byId, face, onClose, onOpen, onRename, onReorder, onUnstack, onHold, onImportFile, onImportPhoto, onSettings, onNewCanvas, onShare, onDuplicate, onDelete, leaving }: {
  stack: Extract<Entry, { t: 's' }>;
  leaving?: Set<string>;
  byId: Map<string, Artwork>;
  face: (a: Artwork, h: number, sel?: boolean, selecting?: boolean) => React.ReactNode;
  onClose: () => void;
  onOpen: (a: Artwork, rect: Rect) => void;
  onRename: (name: string) => void;
  onReorder: (id: string, index: number) => void;
  onUnstack: (id: string) => void;
  onHold: (id: string, x: number, y: number) => void;
  onImportFile: () => void;
  onImportPhoto: () => void;
  onSettings: () => void;
  onNewCanvas: () => void;
  onShare: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  const [editing, setEditing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const m = () => setW(el.clientWidth); m();
    const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!selecting) setSelected([]); }, [selecting]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const arts = stack.items.map((id) => byId.get(id)).filter(Boolean) as Artwork[];
  const flow = (list: Artwork[]) => {
    const cols = w < 420 ? 2 : 3, gap = 12, pad = 14;
    const cw = Math.floor((w - pad * 2 - gap * (cols - 1)) / cols);
    const colH = new Array(cols).fill(4);
    const slots = list.map((a) => {
      const c = colH.indexOf(Math.min(...colH));
      const s = { a, key: a.id, x: pad + c * (cw + gap), y: colH[c], w: cw, h: thumbH(a, cw) };
      colH[c] += s.h + gap; return s;
    });
    return { slots, h: Math.max(...colH) + 95 };
  };
  const base = flow(arts);
  const baseRef = useRef(base); baseRef.current = base;
  const cd = useCardDrag({
    boardRef, scrollRef, panelRef,
    slots: () => baseRef.current.slots.map(({ key, x, y, w: sw, h }) => ({ key, x, y, w: sw, h })),
    canStack: () => false,
    onDrop: (key, r) => { if (!r) return; if (r.type === 'out') onUnstack(key); else if (r.type === 'move') onReorder(key, r.index); },
    onHold,
  });
  const shown = cd.drag && cd.drag.index !== null && !cd.drag.out ? flow((() => { const l = arts.filter((a) => a.id !== cd.drag!.key); l.splice(cd.drag!.index!, 0, byId.get(cd.drag!.key)!); return l; })()) : base;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const dragArt = cd.drag ? byId.get(cd.drag.key) : undefined;
  return createPortal(
    <>
      <div className="pp-stack-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className={`pp-stack-window ${cd.drag?.out ? 'dropping-out' : ''}`} role="dialog" aria-label={stack.name}>
        <div className="pp-stack-head">
          {editing ? (
            <input className="pp-stack-name-input" autoFocus defaultValue={stack.name} aria-label="Stack name"
              onBlur={(e) => { onRename(e.currentTarget.value.trim() || 'Stack'); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }} />
          ) : <button type="button" className="pp-stack-title" onClick={() => setEditing(true)}>{stack.name}</button>}
          <button type="button" className="pp-stack-close" aria-label="Close stack" onClick={onClose}>Done</button>
        </div>
        <div className="pp-stack-scroll" ref={scrollRef}>
          <div className="pp-board" ref={boardRef} style={{ height: shown.h }}>
            {shown.slots.map(({ a, key, x, y, w: sw, h }) => (
              <div key={key} className={`pp-mcard ${cd.drag?.key === key ? 'pp-drag-src' : ''} ${cd.drag ? 'pp-reflow' : ''} ${leaving?.has(key) ? 'pp-leaving' : ''}`} style={{ left: x, top: y, width: sw }}
                onPointerDown={(e) => cd.down(key, e)}
                onClick={(e) => {
                  if (cd.suppressed()) return;
                  if (selecting) { toggle(a.id); return; }
                  const r = ((e.currentTarget as HTMLElement).querySelector('.pp-thumb') ?? e.currentTarget).getBoundingClientRect();
                  onOpen(a, { left: r.left, top: r.top, width: r.width, height: r.height });
                }}>
                {face(a, h, selected.includes(a.id), selecting)}
              </div>
            ))}
          </div>
        </div>
        <div className="pp-stack-actions">
          {selecting ? (
            <>
              <div className="pp-dock-pill pp-dock-text">
                <Button variant="paint" size="paint" type="button" disabled={!selected.length} onClick={() => onShare(selected)}>Share</Button>
                <Button variant="paint" size="paint" type="button" disabled={!selected.length} onClick={() => { onDuplicate(selected); setSelecting(false); }}>Duplicate</Button>
                <Button variant="paint" size="paint" type="button" className="danger" disabled={!selected.length} onClick={() => { onDelete(selected); setSelecting(false); }}>Delete</Button>
              </div>
              <Button variant="paint" size="paint" type="button" className="pp-dock-round pp-dock-done" onClick={() => setSelecting(false)}>Done</Button>
            </>
          ) : (
            <>
              <div className="pp-dock-pill">
                <Button variant="paint" size="paint" type="button" aria-label="Select artworks in this stack" onClick={() => setSelecting(true)}><CheckCircleGlyph /></Button>
                <Button variant="paint" size="paint" type="button" aria-label="Import a file" onClick={onImportFile}><DocGlyph /></Button>
                <Button variant="paint" size="paint" type="button" aria-label="Import a photo" onClick={onImportPhoto}><PhotosGlyph /></Button>
                <Button variant="paint" size="paint" type="button" aria-label="Settings" onClick={onSettings}><GearGlyph /></Button>
              </div>
              <Button variant="paint" size="paint" type="button" className="pp-dock-round" aria-label="New canvas" onClick={onNewCanvas}><PlusGlyph /></Button>
            </>
          )}
        </div>
      </div>
      {cd.drag && dragArt && (
        <div className={`pp-mcard pp-drag-float ${cd.drag.out ? 'over-stack' : ''}`} style={{ left: cd.drag.x - cd.drag.ox, top: cd.drag.y - cd.drag.oy, width: cd.drag.w }}>
          {face(dragArt, cd.drag.h)}
        </div>
      )}
    </>, document.body);
}
