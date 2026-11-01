// @ts-nocheck -- UI for loosely typed per-adjustment params.
/* Procreate Pocket 5 Adjustments interface: the grouped menu, the bottom readout
 * (name + % + tick, grey handle for advanced settings), per-adjustment panels,
 * the canvas-tap Adjustment Actions menu and the on-canvas discs. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from './Sheet';
import { X, Check, Plus, ChevronLeft } from 'lucide-react';
import { AdjustGlyph, WandGlyph } from './icons';
import {
  ADJUSTMENT_GROUPS, ADJUSTMENT_LIST, HAS_SETTINGS, MAX_GRADIENT_STOPS, DEFAULT_GRADIENTS, defaultParams, loadGradients, saveGradients,
  adjustLabel, usesSwipe, type AdjustmentName,
} from './adjust-defs';
import { curveLut, type Gradient, type CurvePoint } from './adjust-fx';
import './adjustments.css';

export { ADJUSTMENT_LIST, defaultParams };
export type { AdjustmentName };

const ADVANCED_ONLY = (n: string) => !['Hue, Saturation, Brightness', 'Color Balance', 'Curves', 'Gradient Map'].includes(n);
const glyph = (a: string) => (a === 'Hue, Saturation, Brightness' ? 'HSB' : a);

/* ------------------------------------------------------------ menu */
export function AdjustmentsSheet({ onPick, onClose }: { onPick: (name: AdjustmentName) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Adjustments" className="pp-sheet-inset pp-adjust-menu" height="min(70dvh, 620px)">
      <div className="pp-sheet-head">
        <h2>Adjustments</h2>
        <Button variant="paint" size="paint" type="button" className="pp-circle-btn" aria-label="Close" onClick={onClose}><X size={20} /></Button>
      </div>
      <div className="pp-sheet-scroll">
        {ADJUSTMENT_GROUPS.map((group) => (
          <section className="pp-adjust-group" key={group.title}>
            <h3>{group.title}</h3>
            <div className="pp-adjust-grid">
              {group.items.map((a) => (
                <Button variant="paint" size="paint" key={a} type="button" className="pp-adjust-cell" onClick={() => onPick(a)}>
                  {a === 'Liquify' ? <WandGlyph size={22} /> : <AdjustGlyph name={glyph(a)} size={22} />}
                  <span>{a === 'Hue, Saturation, Brightness' ? 'Hue, Saturation, Brightness' : a}</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ slider */
export function AdjSlider({ label, value, min = 0, max = 100, onChange, onBegin, bg, format }: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; onBegin?: () => void; bg?: string; format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const KNOB = 24;
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left - KNOB / 2) / Math.max(1, r.width - KNOB)));
    onChange(Math.round(min + t * (max - min)));
  };
  const t = (value - min) / (max - min || 1);
  const shown = format ? format(value) : `${Math.round(value)}%`;
  return (
    <div className="pp-adj-row">
      <div className="pp-adj-row-head"><span>{label}</span><b>{shown}</b></div>
      <div ref={ref} className="pp-adj-slider" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onBegin?.(); onChange(Math.max(min, Math.min(max, value + (e.key === 'ArrowRight' ? 1 : -1)))); } }}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onBegin?.(); set(e.clientX); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX); }}>
        <span className="pp-adj-track" style={bg ? { background: bg, height: 6 } : undefined} />
        {!bg && <span className="pp-adj-fill" style={{ width: `calc(${KNOB / 2}px + ${t.toFixed(4)} * (100% - ${KNOB}px))` }} />}
        <span className="pp-adj-knob" style={{ left: `calc(${t.toFixed(4)} * (100% - ${KNOB}px))` }} />
      </div>
    </div>
  );
}

/* Slider-free control for the non-advanced panel: drag anywhere across the pill to change the
 *  value. Moving the finger vertically away from it slows the ratio (precise mode, like Procreate). */
export function SwipeControl({ label, value, min = 0, max = 100, onChange, onBegin, bg, format }: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; onBegin?: () => void; bg?: string; format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { x: number; y: number; v: number; w: number; begun: boolean; raf: number; next: number }>(null);
  const [active, setActive] = useState(false);
  const t = (value - min) / (max - min || 1);
  const shown = format ? format(value) : `${Math.round(value)}%`;
  return (
    <div ref={ref} className={`pp-swipe-ctl ${active ? 'is-active' : ''}`} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
      style={{ '--t': t.toFixed(4), '--swipe-bg': bg ?? 'var(--pp-active)' } as React.CSSProperties}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onBegin?.(); onChange(Math.max(min, Math.min(max, value + (e.key === 'ArrowRight' ? 1 : -1)))); } }}
      onPointerDown={(e) => {
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, v: value, w: Math.max(80, ref.current!.getBoundingClientRect().width), begun: false, raf: 0, next: value };
        setActive(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.begun) { if (Math.abs(dx) < 3) return; d.begun = true; onBegin?.(); }
        const precision = 1 / (1 + Math.max(0, Math.abs(e.clientY - d.y) - 24) / 60);
        d.next = Math.max(min, Math.min(max, d.v + (dx / d.w) * (max - min) * precision));
        if (!d.raf) d.raf = requestAnimationFrame(() => { const cur = drag.current; if (!cur) return; cur.raf = 0; onChange(Math.round(cur.next)); });
      }}
      onPointerUp={() => { const d = drag.current; if (d?.raf) cancelAnimationFrame(d.raf); if (d?.begun) onChange(Math.round(d.next)); drag.current = null; setActive(false); }}
      onPointerCancel={() => { drag.current = null; setActive(false); }}>
      <span className="pp-swipe-fill" aria-hidden="true" />
      <span className="pp-swipe-label">{label}</span>
      <b className="pp-swipe-value">{shown}</b>
    </div>
  );
}

function Seg<T extends string>({ options, value, onPick, labels }: { options: readonly T[]; value: T; onPick: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <div className="pp-adj-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} onClick={() => onPick(o)}>
          {labels?.[o] ?? o.charAt(0).toUpperCase() + o.slice(1).replace('-', ' ')}
        </button>
      ))}
    </div>
  );
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <button type="button" className={`pp-adj-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>;
}

/* ------------------------------------------------------------ main panel */
export function AdjustmentPanel({ name, params, onChange, onBegin, onDone, isLayer = false, histogramSource }: {
  name: AdjustmentName; params: any; onChange: (p: any) => void; onBegin: () => void; onDone: () => void; isLayer?: boolean; histogramSource?: HTMLCanvasElement | null;
}) {
  const [open, setOpen] = useState(false);
  const p = { ...defaultParams(name), ...(params ?? {}) };
  const set = (patch: any) => onChange({ ...p, ...patch });
  const begin = onBegin;
  const pct = Math.round(p.amount ?? 0);
  const handleY = useRef<number | null>(null);
  const hasSettings = HAS_SETTINGS.has(name);

  let body: ReactNode = null;
  if (name === 'Hue, Saturation, Brightness') {
    body = <div className="pp-adj-group">
      <SwipeControl label="Hue" value={p.hue} onBegin={begin} onChange={(v) => set({ hue: v })} bg="linear-gradient(90deg,#00ffff,#0000ff,#ff00ff,#ff0000,#ffff00,#00ff00,#00ffff)" />
      <SwipeControl label="Saturation" value={p.saturation} onBegin={begin} onChange={(v) => set({ saturation: v })} bg="linear-gradient(90deg,#8a8a8a,#ff2d55)" />
      <SwipeControl label="Brightness" value={p.brightness} onBegin={begin} onChange={(v) => set({ brightness: v })} bg="linear-gradient(90deg,#000,#fff)" />
    </div>;
  } else if (name === 'Color Balance') {
    const idx = p.tone === 'shadows' ? 0 : p.tone === 'highlights' ? 2 : 1;
    const up = (key: string, v: number) => { const arr = [...p[key]]; arr[idx] = v; set({ [key]: arr }); };
    body = <div className="pp-adj-group">
      <SwipeControl label="Cyan · Red" value={p.cyanRed[idx]} onBegin={begin} onChange={(v) => up('cyanRed', v)} bg="linear-gradient(90deg,#00e5ff,#ff2a2a)" />
      <SwipeControl label="Magenta · Green" value={p.magentaGreen[idx]} onBegin={begin} onChange={(v) => up('magentaGreen', v)} bg="linear-gradient(90deg,#ff2bd6,#25d63c)" />
      <SwipeControl label="Yellow · Blue" value={p.yellowBlue[idx]} onBegin={begin} onChange={(v) => up('yellowBlue', v)} bg="linear-gradient(90deg,#ffe600,#2a5bff)" />
      <Seg options={['shadows', 'midtones', 'highlights'] as const} value={p.tone} onPick={(t) => set({ tone: t })} />
    </div>;
  } else if (name === 'Curves') {
    body = <CurvesPanel p={p} set={set} begin={begin} source={histogramSource} />;
  } else if (name === 'Gradient Map') {
    body = <GradientLibrary p={p} set={set} begin={begin} />;
  } else if (hasSettings) {
    if (name === 'Perspective Blur') body = <div className="pp-adj-group"><Seg options={['positional', 'directional'] as const} value={p.mode} onPick={(m) => { begin(); set({ mode: m }); }} /></div>;
    if (name === 'Noise') body = <div className="pp-adj-group">
      <Seg options={['clouds', 'billows', 'ridges'] as const} value={p.type} onPick={(t) => { begin(); set({ type: t }); }} />
      <AdjSlider label="Scale" value={p.scale} onBegin={begin} onChange={(v) => set({ scale: v })} />
      <AdjSlider label="Octaves" value={p.octaves} onBegin={begin} onChange={(v) => set({ octaves: v })} />
      <AdjSlider label="Turbulence" value={p.turbulence} onBegin={begin} onChange={(v) => set({ turbulence: v })} />
      <div className="pp-adj-toggles"><Toggle label="Multi" on={!!p.multi} onClick={() => { begin(); set({ multi: !p.multi }); }} /><Toggle label="Additive" on={p.additive !== false} onClick={() => { begin(); set({ additive: p.additive === false }); }} /></div>
    </div>;
    if (name === 'Bloom') body = <div className="pp-adj-group">
      <AdjSlider label="Transition" value={p.transition} onBegin={begin} onChange={(v) => set({ transition: v })} />
      <AdjSlider label="Size" value={p.size} onBegin={begin} onChange={(v) => set({ size: v })} />
      <AdjSlider label="Burn" value={p.burn} onBegin={begin} onChange={(v) => set({ burn: v })} />
    </div>;
    if (name === 'Glitch') {
      const m = p.mode; const q = p[m] ?? {};
      const sq = (patch: any) => set({ [m]: { ...q, ...patch } });
      const none = (v: number) => (v <= 0 ? 'None' : v >= 100 ? 'Max' : `${v}%`);
      body = <div className="pp-adj-group">
        <Seg options={['artifact', 'wave', 'signal', 'diverge'] as const} value={m} onPick={(v) => { begin(); set({ mode: v }); }} />
        {m === 'artifact' && <>
          <AdjSlider label="Amount" value={q.amount} format={none} onBegin={begin} onChange={(v) => sq({ amount: v })} />
          <AdjSlider label="Block Size" value={q.blockSize} format={none} onBegin={begin} onChange={(v) => sq({ blockSize: v })} />
          <AdjSlider label="Zoom" value={q.zoom} format={none} onBegin={begin} onChange={(v) => sq({ zoom: v })} /></>}
        {m === 'wave' && <>
          <AdjSlider label="Amplitude" value={q.amplitude} format={none} onBegin={begin} onChange={(v) => sq({ amplitude: v })} />
          <AdjSlider label="Frequency" value={q.frequency} format={none} onBegin={begin} onChange={(v) => sq({ frequency: v })} />
          <AdjSlider label="Zoom" value={q.zoom} format={none} onBegin={begin} onChange={(v) => sq({ zoom: v })} /></>}
        {m === 'signal' && <>
          <AdjSlider label="Amount" value={q.amount} format={none} onBegin={begin} onChange={(v) => sq({ amount: v })} />
          <AdjSlider label="Block Size" value={q.blockSize} format={none} onBegin={begin} onChange={(v) => sq({ blockSize: v })} />
          <AdjSlider label="Zoom" value={q.zoom} format={none} onBegin={begin} onChange={(v) => sq({ zoom: v })} /></>}
        {m === 'diverge' && <>
          <AdjSlider label="Red Shift" value={q.red} min={-100} max={100} onBegin={begin} onChange={(v) => sq({ red: v })} />
          <AdjSlider label="Green Shift" value={q.green} min={-100} max={100} onBegin={begin} onChange={(v) => sq({ green: v })} />
          <AdjSlider label="Blue Shift" value={q.blue} min={-100} max={100} onBegin={begin} onChange={(v) => sq({ blue: v })} />
          <AdjSlider label="Zoom" value={q.zoom} format={none} onBegin={begin} onChange={(v) => sq({ zoom: v })} /></>}
      </div>;
    }
    if (name === 'Halftone') body = <div className="pp-adj-group"><Seg options={['full-color', 'screen-print', 'newspaper'] as const} value={p.style} onPick={(s) => { begin(); set({ style: s }); }} labels={{ 'full-color': 'Full Color', 'screen-print': 'Screen Print', newspaper: 'Newspaper' }} /></div>;
    if (name === 'Chromatic Aberration') body = <div className="pp-adj-group">
      <Seg options={['perspective', 'displace'] as const} value={p.mode} onPick={(m) => { begin(); set({ mode: m }); }} />
      {p.mode === 'perspective' ? <>
        <AdjSlider label="Transition" value={p.transition} onBegin={begin} onChange={(v) => set({ transition: v })} />
        <AdjSlider label="Fall off" value={p.falloff} onBegin={begin} onChange={(v) => set({ falloff: v })} />
      </> : <>
        <AdjSlider label="Blur" value={p.blur} onBegin={begin} onChange={(v) => set({ blur: v })} />
        <AdjSlider label="Transparency" value={p.transparency} onBegin={begin} onChange={(v) => set({ transparency: v })} />
      </>}
    </div>;
  }

  const showMeter = usesSwipe(name);
  return (
    <div className={`pp-adj ${open ? 'open' : ''}`} role="region" aria-label={`${adjustLabel(name)} adjustment`} onPointerDown={(e) => e.stopPropagation()}>
      {hasSettings && (
        <button type="button" className="pp-adj-handle" aria-label={open ? 'Hide settings' : 'Show settings'} aria-expanded={open}
          onPointerDown={(e) => { handleY.current = e.clientY; }}
          onPointerUp={(e) => { const dy = handleY.current === null ? 0 : e.clientY - handleY.current; handleY.current = null; if (dy < -8) setOpen(true); else if (dy > 8) setOpen(false); else setOpen((o) => !o); }}>
          <i />
        </button>
      )}
      {body && (ADVANCED_ONLY(name)
        ? <div className="pp-adj-collapse" data-open={open} aria-hidden={!open}><div className="pp-adj-collapse-inner"><div className="pp-adj-body">{body}</div></div></div>
        : <div className="pp-adj-body">{body}</div>)}
      <div className="pp-adj-readout">
        <div className="pp-adj-title" title={isLayer ? 'Adjustment layer' : 'Slide on the canvas to change the amount'}>
          <b>{adjustLabel(name)}</b>
        </div>
        {/* Procreate: the amount lives in a circle; you change it by sliding on the canvas */}
        {showMeter && <span className="pp-adj-amount" role="status" aria-label={`Amount ${pct}%`}>{pct}%</span>}
        <button type="button" className="pp-adj-tick" aria-label={isLayer ? 'Done' : 'Apply adjustment'} onClick={onDone}><Check size={22} strokeWidth={2.6} /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ curves */
const CH = ['gamma', 'red', 'green', 'blue'] as const;
const CH_COLOR: Record<string, string> = { gamma: '#ffffff', red: '#ff453a', green: '#32d74b', blue: '#0a84ff' };
function CurvesPanel({ p, set, begin, source }: { p: any; set: (x: any) => void; begin: () => void; source?: HTMLCanvasElement | null }) {
  const ch = p.channel ?? 'gamma';
  const pts: CurvePoint[] = p.curves?.[ch] ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const [sel, setSel] = useState<number | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<null | { i: number; moved: boolean }>(null);
  const hist = useRef<null | { r: Float32Array; g: Float32Array; b: Float32Array }>(null);
  useEffect(() => {
    if (!source) return;
    const s = 256, c = document.createElement('canvas'); c.width = s; c.height = Math.max(1, Math.round(s * source.height / source.width));
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(source, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const r = new Float32Array(256), g = new Float32Array(256), b = new Float32Array(256);
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++; }
    const mx = Math.max(1, ...r, ...g, ...b) ** 0.5;
    for (let i = 0; i < 256; i++) { r[i] = r[i] ** 0.5 / mx; g[i] = g[i] ** 0.5 / mx; b[i] = b[i] ** 0.5 / mx; }
    hist.current = { r, g, b };
  }, [source]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1; const W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d')!;
    x.clearRect(0, 0, W, H);
    const hs = hist.current;
    if (hs) {
      x.globalCompositeOperation = 'lighter';
      ([['r', '#ff3b30'], ['g', '#34c759'], ['b', '#0a84ff']] as const).forEach(([k, col]) => {
        if (ch !== 'gamma' && ch[0] !== k) return;
        x.fillStyle = col; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(0, H);
        for (let i = 0; i < 256; i++) x.lineTo((i / 255) * W, H - hs[k][i] * H * 0.95);
        x.lineTo(W, H); x.closePath(); x.fill();
      });
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = dpr;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo((W * i) / 4, 0); x.lineTo((W * i) / 4, H); x.moveTo(0, (H * i) / 4); x.lineTo(W, (H * i) / 4); x.stroke(); }
    const lut = curveLut(pts);
    x.strokeStyle = CH_COLOR[ch]; x.lineWidth = 2.5 * dpr; x.beginPath();
    for (let i = 0; i < 256; i++) { const px = (i / 255) * W, py = H - (lut[i] / 255) * H; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
    pts.forEach((q, i) => {
      x.beginPath(); x.arc(q.x * W, H - q.y * H, (i === sel ? 9 : 7) * dpr, 0, Math.PI * 2);
      x.fillStyle = i === sel ? CH_COLOR[ch] : '#1c1c1e'; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 2 * dpr; x.stroke();
    });
  });
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) }; };
  const write = (next: CurvePoint[]) => set({ curves: { ...p.curves, [ch]: next } });
  return (
    <div className="pp-adj-group">
      <div className="pp-adj-seg pp-adj-curves-tabs" role="radiogroup">
        {CH.map((c) => <button key={c} type="button" role="radio" aria-checked={ch === c} className={`${ch === c ? 'on' : ''} ch-${c}`} onClick={() => { setSel(null); set({ channel: c }); }}>{c[0].toUpperCase() + c.slice(1)}</button>)}
      </div>
      <div className="pp-adj-curves">
        <canvas ref={ref} aria-label="Curves graph"
          onPointerDown={(e) => {
            e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
            const q = at(e); const r = ref.current!.getBoundingClientRect();
            let hit = -1, best = 22;
            pts.forEach((pt, i) => { const d = Math.hypot((pt.x - q.x) * r.width, (pt.y - q.y) * r.height); if (d < best) { best = d; hit = i; } });
            begin();
            if (hit < 0) {
              if (pts.length >= 11) return;
              const next = [...pts, q].sort((a, b) => a.x - b.x); hit = next.indexOf(q); write(next);
            }
            setSel(hit); drag.current = { i: hit, moved: false };
          }}
          onPointerMove={(e) => {
            const dr = drag.current; if (!dr) return;
            const q = at(e); const next = [...pts]; const i = dr.i;
            const lo = i > 0 ? next[i - 1].x + 0.01 : 0, hi = i < next.length - 1 ? next[i + 1].x - 0.01 : 1;
            next[i] = { x: i === 0 ? Math.min(q.x, hi) : i === next.length - 1 ? Math.max(q.x, lo) : Math.max(lo, Math.min(hi, q.x)), y: q.y };
            dr.moved = true; write(next);
          }}
          onPointerUp={() => { drag.current = null; }} />
        {sel !== null && pts.length > 2 && sel > 0 && sel < pts.length - 1 && (
          <button type="button" className="pp-adj-delete" onClick={() => { begin(); write(pts.filter((_, i) => i !== sel)); setSel(null); }}>Delete</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ gradient map */
const gcss = (stops: { pos: number; color: string }[]) => `linear-gradient(90deg, ${[...stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`).join(', ')})`;
function GradientLibrary({ p, set, begin }: { p: any; set: (x: any) => void; begin: () => void }) {
  const [lib, setLib] = useState<Gradient[]>(() => loadGradients());
  const [editing, setEditing] = useState<Gradient | null>(null);
  const [menu, setMenu] = useState<null | { id: string }>(null);
  const [restore, setRestore] = useState(false);
  const hold = useRef<{ t: number; id: string; x: number; dragging: boolean; fired: boolean } | null>(null);
  const store = (next: Gradient[]) => { setLib(next); saveGradients(next); };
  const pick = (g: Gradient) => { begin(); set({ gradientId: g.id, stops: g.stops, amount: (p.amount ?? 0) > 0 ? p.amount : 100 }); };
  if (editing) return <GradientEditor g={editing} onDone={(g) => {
    const exists = lib.some((x) => x.id === g.id);
    const next = exists ? lib.map((x) => (x.id === g.id ? g : x)) : [...lib, g];
    store(next); setEditing(null); begin(); set({ gradientId: g.id, stops: g.stops, amount: (p.amount ?? 0) > 0 ? p.amount : 100 });
  }} onLive={(g) => set({ gradientId: g.id, stops: g.stops, amount: (p.amount ?? 0) > 0 ? p.amount : 100 })} />;
  return (
    <div className="pp-adj-group pp-adj-gradlib">
      <div className="pp-adj-gradhead">
        <span>Gradient Library</span>
        <button type="button" className="pp-adj-iconbtn" aria-label="New gradient"
          onPointerDown={() => { hold.current = { t: window.setTimeout(() => { setRestore(true); if (hold.current) hold.current.fired = true; }, 550), id: '+', x: 0, dragging: false, fired: false }; }}
          onPointerUp={() => { const h = hold.current; hold.current = null; if (h) window.clearTimeout(h.t); if (h && !h.fired) setEditing({ id: `g-${Date.now().toString(36)}`, name: 'New Gradient', stops: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }] }); }}>
          <Plus size={18} />
        </button>
      </div>
      {restore && <div className="pp-adj-pop"><button type="button" onClick={() => { store(DEFAULT_GRADIENTS.map((g) => ({ ...g, stops: g.stops.map((s) => ({ ...s })) }))); setRestore(false); }}>Restore defaults</button><button type="button" onClick={() => setRestore(false)}>Cancel</button></div>}
      <div className="pp-adj-grads" role="listbox" aria-label="Gradient Library">
        {lib.map((g, idx) => (
          <button key={g.id} type="button" role="option" aria-selected={p.gradientId === g.id} className={`pp-adj-grad ${p.gradientId === g.id ? 'on' : ''}`}
            onPointerDown={(e) => {
              const id = g.id;
              hold.current = { t: window.setTimeout(() => { if (hold.current) { hold.current.fired = true; setMenu({ id }); } }, 520), id, x: e.clientX, dragging: false, fired: false };
            }}
            onPointerMove={(e) => {
              const h = hold.current; if (!h) return;
              if (!h.fired && Math.abs(e.clientX - h.x) > 8) { window.clearTimeout(h.t); hold.current = null; return; }
              if (h.fired && Math.abs(e.clientX - h.x) > 40) {
                // touch, hold and drag reorders the library
                const dir = e.clientX > h.x ? 1 : -1; const to = Math.max(0, Math.min(lib.length - 1, idx + dir));
                if (to !== idx) { const next = [...lib]; const [it] = next.splice(idx, 1); next.splice(to, 0, it); store(next); setMenu(null); h.x = e.clientX; }
              }
            }}
            onPointerUp={() => { const h = hold.current; hold.current = null; if (h) window.clearTimeout(h.t); if (h && !h.fired) { if (p.gradientId === g.id) setEditing(g); else pick(g); } }}>
            <span className="pp-adj-grad-bar" style={{ background: gcss(g.stops) }} />
            <span className="pp-adj-grad-name">{g.name}</span>
          </button>
        ))}
      </div>
      {menu && <div className="pp-adj-pop">
        <button type="button" onClick={() => { const g = lib.find((x) => x.id === menu.id); if (g) store([...lib, { ...g, id: `g-${Date.now().toString(36)}`, name: `${g.name} copy`, stops: g.stops.map((s) => ({ ...s })) }]); setMenu(null); }}>Duplicate</button>
        <button type="button" className="danger" onClick={() => { store(lib.filter((x) => x.id !== menu.id)); setMenu(null); }}>Delete</button>
        <button type="button" onClick={() => setMenu(null)}>Cancel</button>
      </div>}
    </div>
  );
}

function GradientEditor({ g, onDone, onLive }: { g: Gradient; onDone: (g: Gradient) => void; onLive: (g: Gradient) => void }) {
  const [cur, setCur] = useState<Gradient>(() => ({ ...g, stops: g.stops.map((s) => ({ ...s })) }));
  const [active, setActive] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const drag = useRef<null | { i: number; x: number; moved: boolean; t: number; held: boolean }>(null);
  const update = (next: Gradient) => { setCur(next); onLive(next); };
  const posAt = (clientX: number) => { const r = bar.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)); };
  return (
    <div className="pp-adj-group pp-adj-gradedit">
      <div className="pp-adj-gradhead">
        <input className="pp-adj-gradtitle" value={cur.name} aria-label="Gradient name" onChange={(e) => setCur({ ...cur, name: e.target.value })} />
        <button type="button" className="pp-adj-done" onClick={() => onDone({ ...cur, name: cur.name.trim() || 'Gradient' })}>Done</button>
      </div>
      <div ref={bar} className="pp-adj-gradbar" style={{ background: gcss(cur.stops) }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.stop) return;
          e.stopPropagation();
          if (cur.stops.length >= MAX_GRADIENT_STOPS) return;
          const pos = posAt(e.clientX);
          // new point takes the colour the gradient already has there
          const sorted = [...cur.stops].sort((a, b) => a.pos - b.pos);
          const right = sorted.find((s) => s.pos >= pos) ?? sorted[sorted.length - 1];
          const next = { ...cur, stops: [...cur.stops, { pos, color: right.color }] };
          update(next); setActive(next.stops.length - 1);
        }}>
        {cur.stops.map((s, i) => (
          <span key={i} data-stop="1" className={`pp-adj-stop ${active === i ? 'on' : ''}`} style={{ left: `${s.pos * 100}%`, background: s.color }}
            onPointerDown={(e) => {
              e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
              const t = window.setTimeout(() => {
                // touch and hold deletes a colour point (at least two must remain)
                if (drag.current && !drag.current.moved && cur.stops.length > 2) { drag.current.held = true; update({ ...cur, stops: cur.stops.filter((_, k) => k !== i) }); setActive(null); }
              }, 600);
              drag.current = { i, x: e.clientX, moved: false, t, held: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current; if (!d || d.held) return;
              if (!d.moved && Math.abs(e.clientX - d.x) < 5) return;
              d.moved = true; window.clearTimeout(d.t);
              const stops = cur.stops.map((x, k) => (k === d.i ? { ...x, pos: posAt(e.clientX) } : x));
              update({ ...cur, stops });
            }}
            onPointerUp={() => {
              const d = drag.current; drag.current = null; if (!d) return; window.clearTimeout(d.t);
              if (!d.moved && !d.held) { setActive(d.i); window.setTimeout(() => colorRef.current?.click(), 0); }
            }} />
        ))}
      </div>
      <p className="pp-adj-hint">Tap the bar to add a colour, tap a point to recolour it, hold a point to delete it.</p>
      <input ref={colorRef} type="color" className="pp-adj-colorinput" aria-label="Colour point"
        value={active !== null && cur.stops[active] ? cur.stops[active].color : '#000000'}
        onChange={(e) => { if (active === null) return; update({ ...cur, stops: cur.stops.map((x, k) => (k === active ? { ...x, color: e.target.value } : x)) }); }} />
      <button type="button" className="pp-adj-back" onClick={() => onDone(g)}><ChevronLeft size={16} /> Back</button>
    </div>
  );
}

/* ------------------------------------------------------------ actions menu */
export function AdjustActions({ x, y, preview, onPreview, onApply, onReset, onUndo, onCancel, onClose }: {
  x: number; y: number; preview: boolean; onPreview: () => void; onApply: () => void; onReset: () => void; onUndo: () => void; onCancel: () => void; onClose: () => void;
}) {
  const left = Math.max(12, Math.min(window.innerWidth - 332, x - 160));
  const top = Math.max(12, Math.min(window.innerHeight - 70, y - 70));
  return (
    <>
      <div className="pp-adj-actions-scrim" onPointerDown={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="pp-adj-actions" role="menu" aria-label="Adjustment Actions" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" role="menuitemcheckbox" aria-checked={!preview} className={!preview ? 'on' : ''} onClick={onPreview}>Preview</button>
        <button type="button" role="menuitem" onClick={onApply}>Apply</button>
        <button type="button" role="menuitem" onClick={onReset}>Reset</button>
        <button type="button" role="menuitem" onClick={onUndo}>Undo</button>
        <button type="button" role="menuitem" className="danger" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ on-canvas discs */
export function AdjustOverlay({ name, params, toScreen, fromScreen, onBegin, onChange }: {
  name: string; params: any; toScreen: (x: number, y: number) => { x: number; y: number }; fromScreen: (x: number, y: number) => { x: number; y: number };
  onBegin: () => void; onChange: (p: any) => void;
}) {
  const p = { ...defaultParams(name), ...(params ?? {}) };
  const disc = name === 'Perspective Blur' || (name === 'Chromatic Aberration' && p.mode !== 'displace');
  if (!disc) return null;
  const c = toScreen(p.x, p.y);
  const directional = name === 'Perspective Blur' && p.mode === 'directional';
  const R = directional ? 46 : 26;
  const ang = ((p.direction ?? 0) * Math.PI) / 180;
  const drag = (kind: 'move' | 'rotate') => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); onBegin();
    const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (kind === 'move') { const q = fromScreen(ev.clientX, ev.clientY); onChange({ ...p, x: q.x, y: q.y }); }
      else { const cur = toScreen(p.x, p.y); onChange({ ...p, direction: (Math.atan2(ev.clientY - cur.y, ev.clientX - cur.x) * 180) / Math.PI }); }
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return (
    <div className="pp-adj-overlay" aria-hidden="false">
      <div className={`pp-adj-disc ${directional ? 'dir' : ''} ${name === 'Chromatic Aberration' ? 'focal' : ''}`} role="button" aria-label={name === 'Chromatic Aberration' ? 'Focal point' : 'Blur centre'}
        style={{ left: c.x - R, top: c.y - R, width: R * 2, height: R * 2 }} onPointerDown={drag('move')}>
        <i />
      </div>
      {directional && (
        <>
          <div className="pp-adj-arrow" style={{ left: c.x, top: c.y, transform: `rotate(${p.direction ?? 0}deg)` }} />
          <div className="pp-adj-arrow-knob" role="slider" aria-label="Blur direction" aria-valuenow={Math.round(p.direction ?? 0)}
            style={{ left: c.x + Math.cos(ang) * 78 - 14, top: c.y + Math.sin(ang) * 78 - 14 }} onPointerDown={drag('rotate')} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ clone */
export type CloneSettings = { size: number; strength: number };
export function CloneControls({ value, onChange, onDone, locked }: { value: CloneSettings; onChange: (v: CloneSettings) => void; onDone: () => void; locked: boolean }) {
  const vs = (key: 'size' | 'strength', label: string) => (
    <VSlider label={label} value={value[key]} onChange={(v) => onChange({ ...value, [key]: v })} />
  );
  return (
    <>
      <div className="pp-clone-side" onPointerDown={(e) => e.stopPropagation()}>
        {vs('size', 'Brush size')}
        {vs('strength', 'Strength')}
      </div>
      <div className="pp-adj" role="region" aria-label="Clone" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pp-adj-readout">
          <div className="pp-adj-title"><small>{locked ? 'Clone lock' : 'Paint to clone from the disc'}</small><b>Clone</b></div>
          <button type="button" className="pp-adj-tick" aria-label="Finish cloning" onClick={onDone}><Check size={22} strokeWidth={2.6} /></button>
        </div>
      </div>
    </>
  );
}
function VSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (y: number) => { const r = ref.current!.getBoundingClientRect(); onChange(Math.round(Math.max(1, Math.min(100, (1 - (y - r.top) / r.height) * 100)))); };
  return (
    <div ref={ref} className="pp-vslider" role="slider" aria-label={label} aria-valuemin={1} aria-valuemax={100} aria-valuenow={value} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, Math.min(100, value + (e.key === 'ArrowUp' ? 1 : -1)))); } }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientY); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientY); }}>
      <span className="pp-vslider-knob" style={{ bottom: `calc(${value / 100} * (100% - 22px))` }} />
    </div>
  );
}
export function CloneDisc({ x, y, locked, onMove, onToggleLock }: { x: number; y: number; locked: boolean; onMove: (cx: number, cy: number) => void; onToggleLock: () => void }) {
  const timer = useRef<number | undefined>(undefined);
  return (
    <div className={`pp-clone-disc ${locked ? 'locked' : ''}`} role="button" aria-label={locked ? 'Clone source (locked)' : 'Clone source'} style={{ left: x - 30, top: y - 30 }}
      onPointerDown={(e) => {
        e.stopPropagation(); e.preventDefault();
        const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
        const sx = e.clientX, sy = e.clientY; let moved = false;
        timer.current = window.setTimeout(() => { if (!moved) onToggleLock(); }, 600);
        const move = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { moved = true; window.clearTimeout(timer.current); } if (moved) onMove(ev.clientX, ev.clientY); };
        const up = () => { window.clearTimeout(timer.current); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      }}>
      <i />
    </div>
  );
}

/** Kept for older imports. */
export const AdjustmentBar = AdjustmentPanel;
