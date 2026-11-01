// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { Button } from '@/components/ui/button';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { CopyPlus, AudioWaveform, Share, ToggleRight, CircleHelp, ImagePlus, Upload, Sliders, Search, Star, Clock, X } from 'lucide-react';
import { browseBrushes, readBrushBrowser, recordRecent, saveBrushBrowser, toggleFavorite, visibleBrushCategories } from './brush-browser';
import { brushCategories, brushLibrary, brushesInCategory, drawBrushPreview, getBrushDef, cleanBrushName, updateBrushDef, type BrushDef } from './brushes';
import { AdjustGlyph, BrushGlyph, EraserGlyph, SmudgeGlyph, DotsGlyph, PlusGlyph, WandGlyph } from './icons';
import { importBrushFile } from './brush-translator';
import { AdjustmentsSheet as PocketAdjustmentsSheet } from './Adjustments';



/* ---------------- Brush library ---------------- */


/* Brush library previews are expensive (hundreds of dabs each), so they are drawn lazily
 * when scrolled into view, a few per frame, and cached per brush + ink colour. */
const previewCache = new WeakMap<BrushDef, Map<string, HTMLCanvasElement>>();
const previewQueue: (() => void)[] = [];
let previewPumping = false;
function pumpPreviews() {
  if (previewPumping) return;
  previewPumping = true;
  const step = () => {
    const t0 = performance.now();
    while (previewQueue.length && performance.now() - t0 < 8) previewQueue.shift()!();
    if (previewQueue.length) requestAnimationFrame(step); else previewPumping = false;
  };
  requestAnimationFrame(step);
}
function cachedPreview(brush: BrushDef, color: string) {
  let m = previewCache.get(brush);
  if (!m) { m = new Map(); previewCache.set(brush, m); }
  let c = m.get(color);
  if (!c) { c = document.createElement('canvas'); c.width = 300; c.height = 70; drawBrushPreview(c, brush, color); m.set(color, c); }
  return c;
}
let sharedIO: IntersectionObserver | null = null;
const ioCallbacks = new WeakMap<Element, () => void>();
function observeVisible(el: Element, cb: () => void) {
  if (typeof IntersectionObserver === 'undefined') { cb(); return () => {}; }
  sharedIO ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { const f = ioCallbacks.get(e.target); if (f) { sharedIO!.unobserve(e.target); ioCallbacks.delete(e.target); f(); } }
  }, { rootMargin: '200px 0px' });
  ioCallbacks.set(el, cb); sharedIO.observe(el);
  return () => { sharedIO?.unobserve(el); ioCallbacks.delete(el); };
}

function BrushPreview({ brush, selected }: { brush: BrushDef; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const paint = () => {
      if (!live || !ref.current) return;
      const token = getComputedStyle(el).getPropertyValue(selected ? '--pp-paper' : '--pp-ink').trim();
      const src = cachedPreview(brush, token);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(src, 0, 0);
      el.classList.add('is-ready');
    };
    const stop = observeVisible(el, () => { previewQueue.push(paint); pumpPreviews(); });
    return () => { live = false; stop(); };
  }, [brush, selected]);
  return <canvas ref={ref} width={300} height={70} className="pp-brush-preview" />;
}

export function BrushSheet({
  title,
  brushId,
  onPick,
  onClose,
  streamline,
  onStreamline,
  onOpenStudio,
  onImportBrushes,
}: {
  title: string;
  brushId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  streamline: number;
  onStreamline: (v: number) => void;
  onOpenStudio?: (brush: BrushDef) => void;
  onImportBrushes?: (brushes: BrushDef[]) => void;
}) {
  const [cat, setCat] = useState(() => getBrushDef(brushId).category);
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [browser, setBrowser] = useState(readBrushBrowser);
  const categories = ['Recent', 'Favorites', ...visibleBrushCategories(brushLibrary, brushCategories)];
  const displayed = browseBrushes(brushLibrary, cat, query, browser);
  const pick = (id: string) => {
    const next = recordRecent(browser, id);
    setBrowser(next); saveBrushBrowser(next); onPick(id);
  };
  const lpTimer = useRef(0);
  const lpFired = useRef(false);
  const favorite = (id: string) => {
    const next = toggleFavorite(browser, id);
    setBrowser(next); saveBrushBrowser(next);
  };
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const icons = [EraserGlyph, SmudgeGlyph, EraserGlyph, EraserGlyph, BrushGlyph, BrushGlyph, EraserGlyph];

  const currentBrush = brushesInCategory(cat).find((b) => b.id === brushId) ?? getBrushDef(brushId);

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allImported: BrushDef[] = [];
    setImportError('');
    for (const f of files) {
      try {
        const imported = await importBrushFile(f);
        allImported.push(...imported);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : `Could not import ${f.name}`);
      }
    }
    if (allImported.length && onImportBrushes) {
      onImportBrushes(allImported);
      setCat(allImported[0].category || 'Imported');
      pick(allImported[0].id);
    }
    e.target.value = '';
  };

  return (
    <Sheet onClose={onClose} label="Brush library" className="pp-sheet-inset pp-brushes" height="50dvh">
      {importError && <p role="alert">{importError}</p>}
      <div className="pp-sheet-head">
        <h2>{title === 'Brushes' ? 'Brush Library' : `${title} Library`}</h2>
        <div className="pp-head-btns">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={handleImportFiles}
          />
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Import brushes"
            title="Import brushes from file (.apb, .myb, .kpp, .bundle, .json, .zip)"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} />
          </Button>
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Open Brush Studio"
            title="Open Procreate Pocket Brush Studio"
            onClick={() => {
              if (onOpenStudio && currentBrush) {
                onOpenStudio(currentBrush);
              } else {
                setSettings((v) => !v);
              }
            }}
          >
            <DotsGlyph />
          </Button>
          <Button
            variant="paint"
            size="paint"
            className="pp-circle-btn"
            aria-label="Duplicate brush"
            title="Duplicate brush and edit in Studio"
            onClick={() => {
              const source = currentBrush ?? brushesInCategory(cat)[0];
              if (!source) return;
              const copy: BrushDef = {
                ...source,
                id: `custom-${Date.now()}`,
                name: `${source.name} copy`,
                category: cat,
              };
              updateBrushDef(copy);
              pick(copy.id);
              if (onOpenStudio) onOpenStudio(copy);
            }}
          >
            <PlusGlyph />
          </Button>
        </div>
      </div>
      <div className="pp-brush-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Search brushes" placeholder="Search brushes" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <Button variant="paint" size="paint" aria-label="Clear brush search" title="Clear search" onClick={() => setQuery('')}><X size={18} /></Button>}
      </div>
      <div className="pp-brush-columns pp-pl-columns">
        <div className="pp-brush-cats pp-pl-cats" role="tablist" aria-label="Brush sets">
          {categories.map((c, i) => {
            const Icon = c === 'Recent' ? Clock : c === 'Favorites' ? Star : icons[i - 2] ?? BrushGlyph;
            return (
              <Button
                variant="paint"
                size="paint"
                key={c}
                role="tab"
                aria-selected={c === cat}
                className={`pp-pl-cat ${c === cat ? 'on' : ''}`}
                onClick={() => { setCat(c); setQuery(''); }}
              >
                <span className="pp-pl-cat-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="pp-pl-cat-name">{c}</span>
              </Button>
            );
          })}
        </div>
        <div className="pp-brush-list pp-pl-list" key={cat}>
          {displayed.length === 0 && <p className="pp-brush-empty">{query ? 'No brushes found' : cat === 'Favorites' ? 'No favorite brushes' : 'No recent brushes'}</p>}
          {displayed.map((b) => {
            const isSel = b.id === brushId;
            return (
              <div key={b.id} className="pp-brush-entry">
              <Button
                variant="paint"
                size="paint"
                key={b.id}
                className={`pp-brush pp-pl-brush ${isSel ? 'on' : ''}`}
                aria-pressed={isSel}
                title={isSel ? 'Tap again to edit in Brush Studio' : undefined}
                onPointerDown={() => { lpFired.current = false; window.clearTimeout(lpTimer.current); lpTimer.current = window.setTimeout(() => { lpFired.current = true; favorite(b.id); try { navigator.vibrate?.(12); } catch { /* ignore */ } }, 480); }}
                onPointerUp={() => window.clearTimeout(lpTimer.current)}
                onPointerLeave={() => window.clearTimeout(lpTimer.current)}
                onPointerCancel={() => window.clearTimeout(lpTimer.current)}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (lpFired.current) { lpFired.current = false; return; }
                  if (isSel && onOpenStudio) onOpenStudio(b);
                  else pick(b.id);
                }}
              >
                <span className="pp-pl-name">{cleanBrushName(b.name)}</span>
                <BrushPreview brush={b} selected={isSel} />
              </Button>
              {browser.favorites.includes(b.id) && <span className="pp-brush-favorite is-on" aria-label="Favorite"><Star size={14} fill="currentColor" /></span>}
              </div>
            );
          })}
        </div>
      </div>
      {settings && (
        <Sheet label="Brush settings" className="pp-nested-menu" onClose={() => setSettings(false)}>
          <div className="pp-sheet-head">
            <h2>Brush settings</h2>
          </div>
          <label className="pp-range-row">
            <span>StreamLine</span>
            <input
              type="range"
              min={0}
              max={100}
              value={streamline}
              onChange={(e) => onStreamline(Number(e.target.value))}
            />
            <b>{streamline}%</b>
          </label>
          {onOpenStudio && currentBrush && (
            <div className="p-3">
              <Button
                variant="paint"
                size="paint"
                className="w-full py-2 pp-pl-open"
                onClick={() => {
                  setSettings(false);
                  onOpenStudio(currentBrush);
                }}
              >
                Open in Brush Studio
              </Button>
            </div>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}

/* ---------------- Actions ---------------- */

export type ActionId =
  | 'insert-photo' | 'add-text' | 'cut' | 'copy' | 'paste' | 'flip-canvas-h' | 'flip-canvas-v' | 'rotate-canvas'
  | 'guide' | 'reference' | 'export-png' | 'export-jpg' | 'export-layers' | 'export-psd' | 'export-zip' | 'export-arnm' | 'clear-all' | 'rename' | 'info';

function Switch({ on }: { on: boolean }) {
  return <span className={`pp-ios-switch ${on ? 'on' : ''}`} aria-hidden="true"><span /></span>;
}

type Row = { id?: ActionId; label: string; toggle?: boolean; on?: boolean; onToggle?: () => void; dim?: boolean };

export function ActionsSheet({ onClose, onAction, guide, reference, tab, onTab, info, dark, onDark, frost, onFrost, prefsSlot }: {
  onClose: () => void; onAction: (a: ActionId) => void; guide: boolean; reference: boolean; tab: string; onTab: (t: string) => void;
  info: string[]; dark: boolean; onDark: (v: boolean) => void; frost?: boolean; onFrost?: (v: boolean) => void; prefsSlot?: React.ReactNode;
}) {
  const tabs = [['Add', CopyPlus], ['Canvas', AudioWaveform], ['Share', Share], ['Settings', ToggleRight], ['Help', CircleHelp]] as const;
  const current = tabs.some(([t]) => t === tab) ? tab : 'Add';
  const groups: Record<string, Row[][]> = {
    Add: [[{ id: 'insert-photo', label: 'Insert a photo' }, { id: 'add-text', label: 'Add text' }], [{ id: 'cut', label: 'Cut' }, { id: 'copy', label: 'Copy' }, { id: 'paste', label: 'Paste' }]],
    Canvas: [
      [{ id: 'guide', label: 'Drawing Guide', toggle: true, on: guide }],
      [{ id: 'reference', label: 'Reference', toggle: true, on: reference }],
      [{ id: 'flip-canvas-h', label: 'Flip horizontal' }, { id: 'flip-canvas-v', label: 'Flip vertical' }, { id: 'rotate-canvas', label: 'Rotate 90°' }],
      [{ id: 'clear-all', label: 'Clear all layers' }],
      [{ label: 'Canvas information', onToggle: () => onTab('Help') }],
    ],
    Share: [[{ id: 'export-arnm', label: 'Aeternum (.arnm)' }, { id: 'export-psd', label: 'PSD' }, { id: 'export-jpg', label: 'JPEG' }, { id: 'export-png', label: 'PNG' }], [{ id: 'export-zip', label: 'ZIP (layers & groups)' }, { id: 'export-layers', label: 'PNG Files' }]],
    Settings: [
      [
        { label: 'Dark interface', toggle: true, on: dark, onToggle: () => onDark(!dark) },
        { label: 'frost', toggle: true, on: !!frost, onToggle: () => onFrost?.(!frost) },
      ],
    ],
    Help: [[{ id: 'rename', label: 'Rename artwork' }]],
  };
  return (
    <Sheet onClose={onClose} label="Actions" className="pp-sheet-inset pp-actions" height="50dvh">
      <div className="pp-sheet-head"><h2>Actions</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Insert a photo" onClick={() => onAction('insert-photo')}><ImagePlus size={22} /></Button>
      </div>
      <div className="pp-icon-tabs" role="tablist">
        {tabs.map(([t, Icon]) => (
          <Button variant="paint" size="paint" key={t} type="button" role="tab" aria-selected={t === current} className={t === current ? 'on' : ''} onClick={() => onTab(t)}>
            <Icon size={24} /><span>{t}</span>
          </Button>
        ))}
      </div>
      <div className="pp-sheet-scroll pp-action-list">
        {groups[current].map((g, gi) => (<Fragment key={gi}>
          <div key={gi} className="pp-cell-group">
            {g.map((r) => (
              <Button variant="paint" size="paint" key={r.label} type="button" className="pp-cell" role={r.toggle ? 'switch' : undefined} aria-checked={r.toggle ? !!r.on : undefined}
                onClick={() => (r.onToggle ? r.onToggle() : r.id && onAction(r.id))}>
                <span>{r.label}</span>{r.toggle && <Switch on={!!r.on} />}
              </Button>
            ))}
          </div>
        </Fragment>))}
        {current === 'Settings' && prefsSlot}
        {current === 'Help' && (
          <div className="pp-cell-group pp-info">
            {info.map((line) => <div key={line} className="pp-cell pp-cell-static">{line}</div>)}
          </div>
        )}
        {current === 'Help' && (
          <div className="pp-cell-group pp-info">
            {['Two-finger tap — Undo', 'Three-finger tap — Redo', 'Three-finger scrub — Clear layer', 'Three-finger swipe down — Copy & Paste menu', 'Four-finger tap — Hide interface', 'Pinch — Zoom & rotate', 'Touch and hold — Eyedropper', 'Draw and hold — QuickShape', 'Drag the color circle — ColorDrop', 'Swipe the layers bar sideways — Compact layers'].map((l) => <div key={l} className="pp-cell pp-cell-static">{l}</div>)}
          </div>
        )}
      </div>
    </Sheet>
  );
}


/* ---------------- Adjustments ---------------- */

export const adjustmentList = [
  'Hue, Saturation, Brightness', 'Color Balance', 'Curves', 'Gradient Map', 'Gaussian Blur', 'Motion Blur', 'Perspective Blur',
  'Noise', 'Sharpen', 'Bloom', 'Glitch', 'Halftone', 'Chromatic Aberration', 'Liquify',
];

export const adjustShort = (name: string) => adjustLabels[name] ?? name;
const adjustLabels: Record<string, string> = {
  'Hue, Saturation, Brightness': 'HSB',
  'Chromatic Aberration': 'Aberration',
  'Perspective Blur': 'Perspective',
  'Gaussian Blur': 'Gaussian',
};

/* Procreate-style icon grid: each adjustment is an icon cell with its label. */
export function AdjustmentsSheet({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  return <PocketAdjustmentsSheet onPick={onPick} onClose={onClose} />;
}
