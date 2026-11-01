/* Brush Studio — remade: dark glass panels, Procreate-style rows and sliders.
 * Same editing surface as before (every brush field is still adjustable),
 * just presented cleanly: left category rail, drawing pad on top, glass
 * settings rows below. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Check, RotateCcw, Download, ImagePlus, CircleDot, Save, Copy, Trash2
} from 'lucide-react';
import {
  brushTip, stampDab, cleanBrushName, drawBrushPreview, resetBrushDef, loadBrushHead,
  type BrushDef
} from './brushes';
import { Button } from '@/components/ui/button';
import { exportBrushToApb } from './brush-translator';
import './brush-studio.css';

function StrokePathIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15c2-4 4-6 7-3s5 5 9 1" />
    </svg>
  );
}

function StabilizationIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7v5l3 3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function TaperIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 19.5c4-3 9-8 16-15-2 6-7 11-16 15Z" />
    </svg>
  );
}

function ShapeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 4.3 4.5-1-1.3 4.4 4.2 1.8-3.4 3 2.7 3.7-4.4.8.4 4.5-4.2-1.7-2.3 3.9-2.3-3.9-4.2 1.7.4-4.5-4.4-.8 2.7-3.7-3.4-3 4.2-1.8-1.3-4.4 4.5 1L12 2Z" />
    </svg>
  );
}

function GrainIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={3 + c * 7} y={3 + r * 7} width="5" height="5" rx="1" opacity={(r + c) % 2 ? 0.4 : 1} />
      )))}
    </svg>
  );
}

function RenderingIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="8" y="4" width="8" height="3.5" rx="1" />
      <rect x="5.5" y="9.5" width="13" height="3.5" rx="1" />
      <rect x="3" y="15" width="18" height="3.5" rx="1" />
    </svg>
  );
}

function WetMixIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5c-3.5 5.5-7 9.8-7 13.5a7 7 0 0 0 14 0c0-3.7-3.5-8-7-13.5Z" />
    </svg>
  );
}

function ColorDynamicsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2.5" /><circle cx="17" cy="7" r="2.5" opacity=".8" />
      <circle cx="19" cy="12" r="2.5" opacity=".6" /><circle cx="17" cy="17" r="2.5" opacity=".4" />
      <circle cx="12" cy="19" r="2.5" opacity=".3" /><circle cx="7" cy="17" r="2.5" opacity=".5" />
      <circle cx="5" cy="12" r="2.5" opacity=".7" /><circle cx="7" cy="7" r="2.5" opacity=".9" />
    </svg>
  );
}

function DynamicsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17a9 9 0 1 1 16 0" />
      <path d="M12 12l4-4" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function StylusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 3.5l1 1a1.5 1.5 0 0 1 0 2.1l-10 10-3.5.5.5-3.5 10-10a1.5 1.5 0 0 1 2-.1Z" />
      <path d="M4 21c1.5 0 2.5-.5 3-1.5s0-2-1.5-2-2.5.5-3 1.5.5 2 1.5 2Z" opacity=".7" />
    </svg>
  );
}

function PropertiesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="6" width="18" height="2" rx="1" /><circle cx="8" cy="7" r="3" />
      <rect x="3" y="16" width="18" height="2" rx="1" /><circle cx="16" cy="17" r="3" />
    </svg>
  );
}

function MaterialsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="9" ry="3.5" />
    </svg>
  );
}

function AboutIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="3" />
      <line x1="12" y1="11" x2="12" y2="16" strokeWidth="2.4" />
    </svg>
  );
}

const CATEGORIES = [
  { id: 'stroke', name: 'Stroke properties', icon: StrokePathIcon },
  { id: 'stabilization', name: 'Stabilization', icon: StabilizationIcon },
  { id: 'taper', name: 'Taper', icon: TaperIcon },
  { id: 'shape', name: 'Shape', icon: ShapeIcon },
  { id: 'grain', name: 'Grain', icon: GrainIcon },
  { id: 'rendering', name: 'Rendering', icon: RenderingIcon },
  { id: 'wetmix', name: 'Wet Mix', icon: WetMixIcon },
  { id: 'colordynamics', name: 'Color dynamics', icon: ColorDynamicsIcon },
  { id: 'dynamics', name: 'Dynamics', icon: DynamicsIcon },
  { id: 'pencil', name: 'Stylus', icon: StylusIcon },
  { id: 'properties', name: 'Properties', icon: PropertiesIcon },
  { id: 'materials', name: 'Materials', icon: MaterialsIcon },
  { id: 'about', name: 'About this brush', icon: AboutIcon },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const PAD_COLORS = ['#000000', '#ffffff', '#ff3b30', '#ff9500', '#34c759', '#00c7be', '#007aff', '#af52de'];

/* Procreate-style slider: thin glass track, round glass knob. */
function StudioSlider({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(min, Math.min(max, min + (clientX - r.left - 11) / Math.max(1, r.width - 22) * (max - min))));
  };
  return (
    <div
      ref={ref}
      className="pp-pro-slider"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onKeyDown={(e) => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); onChange(value + (e.key === 'ArrowRight' ? (max - min) / 40 : -(max - min) / 40)); } }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e.clientX); }}
    >
      <span className="pp-pro-slider-track" />
      <span className="pp-pro-slider-knob" style={{ left: `calc(${(((value - min) / (max - min)) * 100).toFixed(1)}% + ${(11 - ((value - min) / (max - min)) * 22).toFixed(1)}px)` }} />
    </div>
  );
}

export function BrushStudio({ brush, onSave, onClose }: { brush: BrushDef; onSave: (updated: BrushDef) => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<CategoryId>('stroke');
  const [b, setB] = useState<BrushDef>({ ...brush });
  const [padColor, setPadColor] = useState('#000000');
  const [showSheet, setShowSheet] = useState(false);
  const [touchMode, setTouchMode] = useState(true);
  const [headVer, setHeadVer] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const headInput = useRef<HTMLInputElement>(null);
  const grainInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(b) !== JSON.stringify(brush);

  const padCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokeTravelled = useRef(0);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const headCanvasRef = useRef<HTMLCanvasElement>(null);

  const update = useCallback((patch: Partial<BrushDef>) => setB((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    if (previewCanvasRef.current) drawBrushPreview(previewCanvasRef.current, b, '#1c1c1e');
    const c = headCanvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      if (ctx) { ctx.clearRect(0, 0, 48, 48); const tip = brushTip(b, padColor, 40); ctx.drawImage(tip, 4, 4, 40, 40); }
    }
  }, [b, padColor, headVer]);

  /** Live preview: the pad redraws a sample stroke every time a setting changes. */
  const drawSample = useCallback(() => {
    const cvs = padCanvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cvs.width / dpr, h = cvs.height / dpr;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cvs.width, cvs.height); ctx.restore();
    const tip = brushTip(b, padColor);
    const size = Math.min(h * 0.5, b.maxSize * (b.previewSize || 0.5));
    const step = Math.max(0.8, size * Math.max(0.01, b.spacing || 0.05));
    let prev: { x: number; y: number } | null = null, travelled = 0, acc = 0;
    for (let t = 0; t <= 1; t += 0.0015) {
      const x = w * 0.12 + t * w * 0.76;
      const y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2;
      if (prev) { const d = Math.hypot(x - prev.x, y - prev.y); travelled += d; acc += d; }
      if (prev && acc < step) continue;
      acc = 0;
      // simulated pressure: light at the ends, heavy through the middle
      const pressure = 0.25 + 0.75 * Math.sin(t * Math.PI);
      const fade = Math.min(1, t * 12, (1 - t) * 12);
      stampDab(ctx, tip, b, { x, y, pressure: pressure * Math.max(0.3, fade), travelled, dx: prev ? x - prev.x : 1, dy: prev ? y - prev.y : 0 }, size);
      prev = { x, y };
    }
    ctx.globalAlpha = 1;
  }, [b, padColor]);
  useEffect(() => { drawSample(); }, [drawSample, headVer]);
  useEffect(() => { if (b.tipImage) void loadBrushHead(b.tipImage).then(() => setHeadVer((v) => v + 1)); }, [b.tipImage]);

  const pickHead = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      // downscale to keep saved brushes small
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        update({ tipImage: c.toDataURL('image/png') });
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  };

  const saveAsNew = () => { onSave({ ...b, id: `custom-${Date.now()}`, name: b.name === brush.name ? `${b.name} copy` : b.name }); onClose(); };
  const overwrite = () => { onSave({ ...b, id: brush.id }); onClose(); };
  const finish = () => { if (dirty) setConfirmExit(true); else onClose(); };

  const clearPad = useCallback(() => {
    const ctx = padCanvasRef.current?.getContext('2d');
    if (ctx?.canvas) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }, []);

  useEffect(() => {
    const cvs = padCanvasRef.current;
    if (!cvs) return;
    const fit = () => {
      const rect = cvs.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(rect.width * dpr);
      cvs.height = Math.round(rect.height * dpr);
      cvs.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      setHeadVer((v) => v + 1);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const pressureOf = (e: React.PointerEvent<HTMLCanvasElement>) =>
    touchMode && e.pointerType === 'touch' ? 0.8 : (e.pressure || 0.6);

  const handlePadPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cvs = padCanvasRef.current;
    if (!cvs) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const rect = cvs.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    lastPoint.current = { x, y };
    strokeTravelled.current = 0;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const tip = brushTip(b, padColor);
    const size = b.maxSize * (b.previewSize || 0.5);
    stampDab(ctx, tip, b, { x, y, pressure: pressureOf(e), travelled: 0 }, size);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPoint.current) return;
    const cvs = padCanvasRef.current;
    const ctx = cvs?.getContext('2d');
    if (!ctx) return;
    const rect = cvs!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const tip = brushTip(b, padColor);
    const p1 = lastPoint.current;
    const dist = Math.hypot(x - p1.x, y - p1.y);
    const size = b.maxSize * (b.previewSize || 0.5);
    const step = Math.max(1, size * (b.spacing || 0.05));
    const pressure = pressureOf(e);
    const steps = Math.ceil(dist / step);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const dStep = dist / steps;
      strokeTravelled.current += dStep;
      stampDab(ctx, tip, b, {
        x: p1.x + (x - p1.x) * t, y: p1.y + (y - p1.y) * t, pressure,
        travelled: strokeTravelled.current, dx: x - p1.x, dy: y - p1.y,
      }, size);
    }
    lastPoint.current = { x, y };
  };

  const handlePadPointerUp = () => { isDrawing.current = false; lastPoint.current = null; };

  const currentCat = CATEGORIES.find((c) => c.id === activeTab) ?? CATEGORIES[0];

  const slider = (label: string, val: number, min: number, max: number, onChange: (n: number) => void, fmt: (v: number) => string = (v) => `${Math.round(v)}%`) => (
    <div className="ap-bs-row" key={label}>
      <span className="ap-bs-label">{label}</span>
      <div className="ap-bs-slider"><StudioSlider label={label} value={val} min={min} max={max} onChange={onChange} /></div>
      <span className="ap-bs-num">{fmt(val)}</span>
    </div>
  );

  const toggle = (label: string, on: boolean, onChange: (v: boolean) => void) => (
    <div className="ap-bs-row" key={label}>
      <span className="ap-bs-label">{label}</span>
      <Button variant="paint" size="paint" type="button" role="switch" aria-checked={on} aria-label={label}
        onClick={() => onChange(!on)}>
        <span className={`pp-toggle ${on ? 'on' : ''}`} aria-hidden="true"><span /></span>
      </Button>
    </div>
  );

  const seg = <T extends string>(label: string, options: readonly T[], value: T, onPick: (v: T) => void, names?: Record<string, string>) => (
    <div className="ap-bs-row" key={label}>
      <span className="ap-bs-label">{label}</span>
      <div className="ap-bs-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <Button variant="paint" size="paint" key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} onClick={() => onPick(o)}>
            {names?.[o] ?? o}
          </Button>
        ))}
      </div>
    </div>
  );
  const pickGrain = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { if (typeof r.result === 'string') update({ grainImage: r.result, grain: b.grain || 0.6 }); };
    r.readAsDataURL(file);
  };

  return (
    <div className="ap-bs" role="dialog" aria-label="Brush Studio">
      {/* left rail: stroke preview + categories */}
      <div className="ap-bs-rail">
        <div className="ap-bs-preview"><canvas ref={previewCanvasRef} width={80} height={36} style={{ width: 44 }} /></div>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Button variant="paint" size="paint" key={cat.id} type="button"
              className={`ap-bs-cat ${activeTab === cat.id ? 'on' : ''}`}
              onClick={() => setActiveTab(cat.id)} title={cat.name} aria-label={cat.name} aria-pressed={activeTab === cat.id}>
              <Icon size={20} />
              <span className="ap-bs-cat-name">{cat.name}</span>
            </Button>
          );
        })}
      </div>

      {/* main: drawing pad + settings */}
      <div className="ap-bs-main">
        <div className="ap-bs-pad">
          <canvas ref={padCanvasRef}
            onPointerDown={handlePadPointerDown}
            onPointerMove={handlePadPointerMove}
            onPointerUp={handlePadPointerUp}
            onPointerCancel={handlePadPointerUp}
          />
          <div className="ap-bs-pill">
            <Button variant="paint" size="paint" type="button" onClick={() => setShowSheet(true)} title="Drawing pad settings" aria-label="Drawing pad settings"><StrokePathIcon size={17} /></Button>
            <Button variant="paint" size="paint" type="button" onClick={clearPad} title="Clear drawing pad" aria-label="Clear drawing pad"><X size={17} /></Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-done" title="Done editing brush" aria-label="Done"
              onClick={finish}><Check size={18} strokeWidth={2.6} /></Button>
          </div>
        </div>

        <div className="ap-bs-panel">
          <div className="ap-bs-head">
            <canvas ref={headCanvasRef} width={48} height={48} style={{ width: 44, height: 44, borderRadius: 12, flex: 'none' }} title="Brush head dab preview" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b className="ap-bs-head-name" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanBrushName(b.name)}</b>
              <span className="ap-bs-head-sub">{b.category || 'General'}, {Math.round(b.maxSize)}px</span>
            </div>
            <canvas className="ap-bs-stroke-mini" ref={(c) => { if (c) drawBrushPreview(c, b, padColor); }} width={96} height={40} title="Stroke preview" />
          </div>

          <h2 className="ap-bs-title">{currentCat.name}</h2>

          {activeTab === 'stroke' && (
            <>
              {slider('Spacing', (b.spacing || 0.05) * 100, 1, 100, (v) => update({ spacing: v / 100 }))}
              {slider('Spacing Jitter', (b.spacingJitter || 0) * 100, 0, 100, (v) => update({ spacingJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Jitter Lateral', (b.jitterLateral || 0) * 100, 0, 100, (v) => update({ jitterLateral: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Jitter Linear', (b.jitterLinear || 0) * 100, 0, 100, (v) => update({ jitterLinear: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Fall off', (b.falloff || 0) * 100, 0, 100, (v) => update({ falloff: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('StreamLine', b.streamline ?? 30, 0, 100, (v) => update({ streamline: v }))}
            </>
          )}

          {activeTab === 'stabilization' && (
            <>
              {slider('StreamLine Amount', b.streamline ?? 30, 0, 100, (v) => update({ streamline: v }))}
              {slider('Stabilization', b.stabilization ?? 0, 0, 100, (v) => update({ stabilization: v }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Motion Filtering', b.motionFiltering ?? 0, 0, 100, (v) => update({ motionFiltering: v }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
            </>
          )}

          {activeTab === 'taper' && (
            <>
              {slider('Taper start', (b.taper || 0) * 100, 0, 100, (v) => update({ taper: v / 100, pressureTaper: v / 100, touchTaper: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Taper end', (b.taperEnd || 0) * 100, 0, 100, (v) => update({ taperEnd: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Size', (b.taperSize ?? 0.5) * 100, 0, 100, (v) => update({ taperSize: v / 100 }))}
              {slider('Opacity', (b.taperOpacity ?? 0.8) * 100, 0, 100, (v) => update({ taperOpacity: v / 100 }))}
              <div className="ap-bs-row">
                <span className="ap-bs-label">Tip</span>
                <div className="ap-bs-seg" role="radiogroup" aria-label="Taper tip">
                  {(['round', 'sharp'] as const).map((t) => (
                    <Button variant="paint" size="paint" key={t} type="button" role="radio" aria-checked={(b.taperTip ?? 'round') === t}
                      className={(b.taperTip ?? 'round') === t ? 'on' : ''} onClick={() => update({ taperTip: t })}>
                      {t === 'round' ? 'Round' : 'Sharp'}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'shape' && (
            <>
              <div className="ap-bs-row ap-bs-headrow">
                <span className="ap-bs-headbox" aria-hidden="true">
                  <canvas ref={(c) => { if (!c) return; const x = c.getContext('2d'); if (!x) return; x.clearRect(0, 0, 72, 72); x.drawImage(brushTip(b, padColor === '#ffffff' ? '#000000' : padColor, 64), 4, 4, 64, 64); }} width={72} height={72} />
                </span>
                <div className="ap-bs-headcopy">
                  <span className="ap-bs-label">Brush head</span>
                  <span className="ap-bs-head-sub">{b.tipImage ? 'Custom image' : 'Round (built-in)'}</span>
                </div>
                <input ref={headInput} type="file" accept="image/*" hidden onChange={(e) => { pickHead(e.target.files?.[0]); e.target.value = ''; }} />
                <Button variant="paint" size="paint" type="button" className="ap-bs-chip" onClick={() => headInput.current?.click()}><ImagePlus size={16} /> Import</Button>
                {b.tipImage && <Button variant="paint" size="paint" type="button" className="ap-bs-chip" onClick={() => update({ tipImage: undefined })}><CircleDot size={16} /> Round</Button>}
              </div>
              {slider('Scatter', (b.shapeScatter ?? b.scatter ?? 0) * 100, 0, 100, (v) => update({ shapeScatter: v / 100, scatter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Rotation', b.angle ?? 0, -180, 180, (v) => update({ angle: v, shapeRotation: v }), (v) => `${Math.round(v)}°`)}
              {slider('Count', b.shapeCount ?? 1, 1, 16, (v) => update({ shapeCount: Math.round(v) }), (v) => `${Math.round(v)}`)}
              {slider('Count Jitter', (b.shapeCountJitter ?? 0) * 100, 0, 100, (v) => update({ shapeCountJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {toggle('Follow stroke', Boolean(b.shapeFollowStroke), (v) => update({ shapeFollowStroke: v }))}
              {toggle('Randomized', Boolean(b.rotateRandom || b.shapeRandomized), (v) => update({ rotateRandom: v, shapeRandomized: v }))}
              {toggle('Azimuth', Boolean(b.shapeAzimuth), (v) => update({ shapeAzimuth: v }))}
              {toggle('Flip X', Boolean(b.shapeFlipX), (v) => update({ shapeFlipX: v }))}
              {toggle('Flip Y', Boolean(b.shapeFlipY), (v) => update({ shapeFlipY: v }))}
              {slider('Roundness', (b.roundness ?? 1) * 100, 10, 100, (v) => update({ roundness: v / 100 }))}
              {slider('Hardness', (b.hardness ?? 0.8) * 100, 0, 100, (v) => update({ hardness: v / 100 }))}
            </>
          )}

          {activeTab === 'grain' && (
            <>
              <div className="ap-bs-row ap-bs-headrow">
                <div className="ap-bs-headcopy">
                  <span className="ap-bs-label">Grain source</span>
                  <span className="ap-bs-head-sub">{b.grainImage ? 'Custom image' : 'Paper (built-in)'}</span>
                </div>
                <input ref={grainInput} type="file" accept="image/*" hidden onChange={(e) => { pickGrain(e.target.files?.[0]); e.target.value = ''; }} />
                <Button variant="paint" size="paint" type="button" className="ap-bs-chip" onClick={() => grainInput.current?.click()}><ImagePlus size={16} /> Import</Button>
                {b.grainImage && <Button variant="paint" size="paint" type="button" className="ap-bs-chip" onClick={() => update({ grainImage: undefined })}><CircleDot size={16} /> Paper</Button>}
              </div>
              {seg('Grain behavior', ['moving', 'texturized'] as const, b.grainMode ?? 'texturized', (m) => update({ grainMode: m }), { moving: 'Moving', texturized: 'Texturized' })}
              {slider('Depth', (b.grain ?? 0) * 100, 0, 100, (v) => update({ grain: v / 100, grainDepth: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Minimum depth', (b.grainMinDepth ?? 0) * 100, 0, 100, (v) => update({ grainMinDepth: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Depth jitter', (b.grainDepthJitter ?? 0) * 100, 0, 100, (v) => update({ grainDepthJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {toggle('Offset jitter', (b.grainOffsetJitter ?? 0) > 0, (v) => update({ grainOffsetJitter: v ? 1 : 0 }))}
              {slider('Scale', (b.grainScale ?? 1) * 100, 10, 300, (v) => update({ grainScale: v / 100 }))}
              {slider('Zoom', (b.grainZoom ?? 0.5) * 100, 0, 100, (v) => update({ grainZoom: v / 100 }))}
              {slider('Rotation', b.grainRotation ?? 0, -180, 180, (v) => update({ grainRotation: v }), (v) => `${Math.round(v)}°`)}
              {slider('Brightness', (b.grainBrightness ?? 0) * 100, -100, 100, (v) => update({ grainBrightness: v / 100 }))}
              {slider('Contrast', (b.grainContrast ?? 0) * 100, -100, 100, (v) => update({ grainContrast: v / 100 }))}
              {toggle('Invert grain', Boolean(b.grainInverted), (v) => update({ grainInverted: v }))}
            </>
          )}

          {activeTab === 'rendering' && (
            <>
              <div className="ap-bs-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <span className="ap-bs-label">Rendering mode</span>
                <div className="ap-bs-grid2">
                  {(['light-glaze', 'glaze', 'blending', 'intense-blending'] as const).map((m) => (
                    <Button variant="paint" size="paint" key={m} type="button" role="radio" aria-checked={b.renderMode === m}
                      className={b.renderMode === m ? 'on' : ''} onClick={() => update({ renderMode: m })}>
                      {m.replace(/-/g, ' ')}
                    </Button>
                  ))}
                </div>
              </div>
              {slider('Flow', (b.flow ?? 0.9) * 100, 1, 100, (v) => update({ flow: v / 100 }))}
              {slider('Wet Edges', (b.wetEdges ?? 0) * 100, 0, 100, (v) => update({ wetEdges: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Burnt Edges', (b.burntEdges ?? 0) * 100, 0, 100, (v) => update({ burntEdges: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {toggle('Luminance blending', Boolean(b.luminanceBlending), (v) => update({ luminanceBlending: v }))}
            </>
          )}

          {activeTab === 'wetmix' && (
            <>
              {slider('Dilution', (b.dilution ?? 0) * 100, 0, 100, (v) => update({ dilution: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Charge', (b.charge ?? 1) * 100, 0, 100, (v) => update({ charge: v / 100 }))}
              {slider('Attack', (b.attack ?? 0.8) * 100, 0, 100, (v) => update({ attack: v / 100 }))}
              {slider('Pull', (b.pull ?? b.smudge ?? 0.5) * 100, 0, 100, (v) => update({ pull: v / 100, smudge: v / 100 }))}
              {slider('Grade', (b.grade ?? 0.5) * 100, 0, 100, (v) => update({ grade: v / 100 }))}
              {slider('Blur', (b.blur ?? 0) * 100, 0, 100, (v) => update({ blur: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Blur jitter', (b.blurJitter ?? 0) * 100, 0, 100, (v) => update({ blurJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Wetness jitter', (b.wetJitter ?? 0) * 100, 0, 100, (v) => update({ wetJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
            </>
          )}

          {activeTab === 'colordynamics' && (
            <>
              <span className="ap-bs-subhead">Stamp color jitter</span>
              {slider('Hue', (b.hueJitter ?? b.stampColorJitter ?? 0) * 100, 0, 100, (v) => update({ hueJitter: v / 100, stampColorJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Saturation', (b.saturationJitter ?? 0) * 100, 0, 100, (v) => update({ saturationJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Lightness', (b.lightnessJitter ?? 0) * 100, 0, 100, (v) => update({ lightnessJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Darkness', (b.darknessJitter ?? 0) * 100, 0, 100, (v) => update({ darknessJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Secondary color', (b.secondaryColorJitter ?? 0) * 100, 0, 100, (v) => update({ secondaryColorJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              <span className="ap-bs-subhead">Stroke color jitter</span>
              {slider('Hue ', (b.strokeHueJitter ?? b.strokeColorJitter ?? 0) * 100, 0, 100, (v) => update({ strokeHueJitter: v / 100, strokeColorJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Saturation ', (b.strokeSaturationJitter ?? 0) * 100, 0, 100, (v) => update({ strokeSaturationJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Lightness ', (b.strokeLightnessJitter ?? 0) * 100, 0, 100, (v) => update({ strokeLightnessJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Darkness ', (b.strokeDarknessJitter ?? 0) * 100, 0, 100, (v) => update({ strokeDarknessJitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              <span className="ap-bs-subhead">Color pressure</span>
              {slider('Hue  ', (b.colorPressure ?? 0) * 100, 0, 100, (v) => update({ colorPressure: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Brightness', (b.pressureBrightness ?? 0) * 100, -100, 100, (v) => update({ pressureBrightness: v / 100 }))}
            </>
          )}

          {activeTab === 'dynamics' && (
            <>
              {slider('Speed Size', (b.speedSize ?? 0) * 100, -100, 100, (v) => update({ speedSize: v / 100 }))}
              {slider('Speed Opacity', (b.speedOpacity ?? 0) * 100, -100, 100, (v) => update({ speedOpacity: v / 100 }))}
              {slider('Jitter Size', (b.jitter ?? 0) * 100, 0, 100, (v) => update({ jitter: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Jitter Opacity', (b.jitterOpacity ?? 0) * 100, 0, 100, (v) => update({ jitterOpacity: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
            </>
          )}

          {activeTab === 'pencil' && (
            <>
              {slider('Pressure Size', (b.sizePressure ?? 0.6) * 100, 0, 100, (v) => update({ sizePressure: v / 100 }))}
              {slider('Pressure Opacity', (b.opacityPressure ?? 0) * 100, 0, 100, (v) => update({ opacityPressure: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Pressure Bleed', (b.pressureBleed ?? 0) * 100, 0, 100, (v) => update({ pressureBleed: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Pressure Flow', (b.pressureFlow ?? 0) * 100, 0, 100, (v) => update({ pressureFlow: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Pressure Smoothing', (b.pressureSmoothing ?? 0) * 100, 0, 100, (v) => update({ pressureSmoothing: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Tilt Angle', b.tiltAngle ?? 0, 0, 90, (v) => update({ tiltAngle: v }), (v) => `${Math.round(v)}°`)}
              {slider('Tilt Opacity', (b.tiltOpacity ?? 0) * 100, 0, 100, (v) => update({ tiltOpacity: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Tilt Bleed', (b.tiltBleed ?? 0) * 100, 0, 100, (v) => update({ tiltBleed: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Tilt Size', (b.tiltSize ?? 0) * 100, 0, 200, (v) => update({ tiltSize: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
            </>
          )}

          {activeTab === 'properties' && (
            <>
              {toggle('Stamp preview', Boolean(b.useStampPreview), (v) => update({ useStampPreview: v }))}
              {toggle('Orient to screen', Boolean(b.orientToScreen), (v) => update({ orientToScreen: v }))}
              {slider('Preview size', (b.previewSize ?? 0.5) * 100, 10, 100, (v) => update({ previewSize: v / 100 }))}
              {slider('Maximum Size', b.maxSize, 10, 500, (v) => update({ maxSize: v }), (v) => `${Math.round(v)}px`)}
              {slider('Minimum Size', b.minSize ?? 2, 1, 50, (v) => update({ minSize: v }), (v) => `${Math.round(v)}px`)}
              {slider('Maximum Opacity', (b.maxOpacity ?? 1) * 100, 10, 100, (v) => update({ maxOpacity: v / 100 }))}
              {slider('Minimum Opacity', (b.minOpacity ?? 0) * 100, 0, 50, (v) => update({ minOpacity: v / 100 }))}
            </>
          )}

          {activeTab === 'materials' && (
            <>
              {slider('Metallic', (b.metallic ?? 0) * 100, 0, 100, (v) => update({ metallic: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
              {slider('Roughness', (b.roughness ?? 0) * 100, 0, 100, (v) => update({ roughness: v / 100 }), (v) => (v === 0 ? 'None' : `${Math.round(v)}%`))}
            </>
          )}

          {activeTab === 'about' && (
            <>
              <div className="ap-bs-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <span className="ap-bs-label">Brush name</span>
                <input className="ap-bs-input" type="text" value={b.name} onChange={(e) => update({ name: e.target.value })} aria-label="Brush name" />
              </div>
              <div className="ap-bs-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <span className="ap-bs-label">Made by</span>
                <input className="ap-bs-input" type="text" value={b.author || ''} placeholder="Artist / Creator"
                  onChange={(e) => update({ author: e.target.value })} aria-label="Made by" />
              </div>
              <div style={{ paddingTop: 6 }}>
                <Button variant="paint" size="paint" type="button" className="ap-bs-action" onClick={() => exportBrushToApb(b)}>
                  <Download size={17} /> Export as .apb file
                </Button>
                <Button variant="paint" size="paint" type="button" className="ap-bs-action"
                  onClick={() => { const restored = resetBrushDef(b.id); if (restored) setB(restored); }}>
                  <RotateCcw size={17} /> Reset to default settings
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmExit && (
        <div className="ap-bs-sheet-backdrop" onClick={() => setConfirmExit(false)}>
          <div className="ap-bs-sheet ap-bs-exit" role="dialog" aria-label="Save brush" onClick={(e) => e.stopPropagation()}>
            <div className="ap-bs-grab" />
            <div className="ap-bs-sheet-head"><h3>Save changes to “{brush.name}”?</h3></div>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action primary" onClick={saveAsNew}><Copy size={17} /> Save as new brush</Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action" onClick={overwrite}><Save size={17} /> Overwrite “{brush.name}”</Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action danger" onClick={onClose}><Trash2 size={17} /> Discard changes</Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action" onClick={() => setConfirmExit(false)}>Keep editing</Button>
          </div>
        </div>
      )}

      {/* drawing pad settings sheet */}
      {showSheet && (
        <div className="ap-bs-sheet-backdrop" onClick={() => setShowSheet(false)}>
          <div className="ap-bs-sheet" role="dialog" aria-label="Drawing pad settings" onClick={(e) => e.stopPropagation()}>
            <div className="ap-bs-grab" />
            <div className="ap-bs-sheet-head">
              <h3>Drawing Pad Settings</h3>
              <Button variant="paint" size="paint" type="button" aria-label="Close pad settings" onClick={() => setShowSheet(false)}><X size={18} /></Button>
            </div>
            <div className="ap-bs-row">
              <span className="ap-bs-label">Preview size</span>
              <div className="ap-bs-slider"><StudioSlider label="Preview size" value={Math.round((b.previewSize || 0.5) * 100)} min={10} max={100}
                onChange={(v) => update({ previewSize: v / 100 })} /></div>
              <span className="ap-bs-num">{Math.round((b.previewSize || 0.5) * 100)}%</span>
            </div>
            <div className="ap-bs-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span className="ap-bs-label">Drawing pad color</span>
              <div className="ap-bs-swatches">
                {PAD_COLORS.map((c) => (
                  <Button variant="paint" size="paint" key={c} type="button" role="radio" aria-checked={padColor === c} aria-label={`Pad color ${c}`}
                    className={`ap-bs-swatch ${padColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setPadColor(c)} />
                ))}
              </div>
            </div>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action" role="switch" aria-checked={touchMode}
              onClick={() => setTouchMode((v) => !v)}>
              Touch simulation: {touchMode ? 'Active (pressure curve)' : 'Stylus only'}
            </Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action"
              onClick={() => { clearPad(); setShowSheet(false); }}>Clear drawing pad</Button>
            <Button variant="paint" size="paint" type="button" className="ap-bs-action"
              onClick={() => { const restored = resetBrushDef(b.id); if (restored) setB(restored); clearPad(); }}>
              Reset all brush settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
