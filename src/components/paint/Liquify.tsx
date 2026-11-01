import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from './Sheet';

export type LiqMode = 'Push' | 'Twirl Right' | 'Twirl Left' | 'Pinch' | 'Expand' | 'Crystals' | 'Edge' | 'Reconstruct';
export type LiqSettings = { mode: LiqMode; amount: number; size: number; pressure: number; distortion: number; momentum: number };
export const LIQ_DEFAULT: LiqSettings = { mode: 'Push', amount: 100, size: 40, pressure: 70, distortion: 0, momentum: 0 };
export const LIQ_MODES: LiqMode[] = ['Push', 'Twirl Right', 'Twirl Left', 'Pinch', 'Expand', 'Crystals', 'Edge', 'Reconstruct'];

/* Procreate-style mode glyphs */
export function LiqGlyph({ mode, size = 22 }: { mode: LiqMode; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (mode) {
    case 'Push': return <svg {...p} fill="currentColor"><path d="M3 5.5c5.5.4 11 2.8 18 6.5-7 3.7-12.5 6.1-18 6.5 3-2.3 4.6-4.4 4.6-6.5S6 7.8 3 5.5Z" /></svg>;
    case 'Twirl Right':
    case 'Twirl Left': {
      const flip = mode === 'Twirl Left' ? { transform: 'scale(-1,1) translate(-24,0)' } : {};
      return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><g {...flip}><path d="M12 12.2a1.6 1.6 0 1 1 1.6-1.6c0 2.6-2.3 4.6-5 4.4A5.4 5.4 0 0 1 3.6 9.4 7 7 0 0 1 11 3c4.7 0 8.8 3.8 8.8 8.6A8.6 8.6 0 0 1 11.2 20.6" /></g></svg>;
    }
    case 'Pinch': return <svg {...p} fill="currentColor"><path d="M3 3h6.5c0 3 1 4.3 2.5 4.3S14.5 6 14.5 3H21v6.5c-3 0-4.3 1-4.3 2.5s1.3 2.5 4.3 2.5V21h-6.5c0-3-1-4.3-2.5-4.3S9.5 18 9.5 21H3v-6.5c3 0 4.3-1 4.3-2.5S6 9.5 3 9.5Z" /></svg>;
    case 'Expand': return <svg {...p} fill="currentColor"><path d="M4 4c3 1.2 5.5 1.6 8 1.6S17 5.2 20 4c-1.2 3-1.6 5.5-1.6 8s.4 5 1.6 8c-3-1.2-5.5-1.6-8-1.6S7 18.8 4 20c1.2-3 1.6-5.5 1.6-8S5.2 7 4 4Z" /></svg>;
    case 'Crystals': return <svg {...p} fill="currentColor"><path d="M12 1.5 13.4 9 19.8 4.2 15 10.6l7.5 1.4-7.5 1.4 4.8 6.4-6.4-4.8L12 22.5 10.6 15l-6.4 4.8L9 13.4 1.5 12 9 10.6 4.2 4.2 10.6 9Z" /></svg>;
    case 'Edge': return <svg {...p} fill="currentColor"><path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3Z" /></svg>;
    case 'Reconstruct': return <svg {...p} fill="currentColor"><rect x="12" y="7" width="9" height="10" rx="1.5" /><path d="M6 10.5h4.5v3H6z" opacity=".7" /><rect x="2.5" y="11" width="2.5" height="2" rx=".5" opacity=".5" /><rect x="6" y="6" width="2.5" height="2.5" rx=".5" opacity=".5" /><rect x="6" y="15.5" width="2.5" height="2.5" rx=".5" opacity=".5" /></svg>;
  }
}

/** Thin blue Procreate slider. The knob is inset so it never sits on the very ends. */
function LiqSlider({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const KNOB = 26;
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = (clientX - r.left - KNOB / 2) / Math.max(1, r.width - KNOB);
    onChange(Math.round(Math.max(min, Math.min(100, t * 100))));
  };
  const t = value / 100;
  return (
    <div className="pp-liq-row">
      <div className="pp-liq-row-head"><span>{label}</span><b>{value >= 100 ? 'Max' : `${value}%`}</b></div>
      <div ref={ref} className="pp-liq-slider" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={100} aria-valuenow={value}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.max(min, Math.min(100, value + (e.key === 'ArrowRight' ? 1 : -1)))); } }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX); }}>
        <span className="pp-liq-track" />
        <span className="pp-liq-fill" style={{ width: `calc(${KNOB / 2}px + ${t.toFixed(4)} * (100% - ${KNOB}px))` }} />
        <span className="pp-liq-knob" style={{ left: `calc(${t.toFixed(4)} * (100% - ${KNOB}px))` }} />
      </div>
    </div>
  );
}

export function LiquifySheet({ value, onChange, onReset, onDone }: { value: LiqSettings; onChange: (v: LiqSettings) => void; onReset: () => void; onDone: () => void }) {
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<LiqSettings>) => onChange({ ...value, ...patch });
  let body: ReactNode;
  if (picking) {
    body = (
      <>
        <div className="pp-liq-head pp-liq-head-center">
          <Button variant="paint" size="paint" type="button" className="pp-liq-circle" aria-label="Back" onClick={() => setPicking(false)}><ChevronLeft size={22} /></Button>
          <h3>Liquify Mode</h3>
          <span className="pp-liq-circle-spacer" aria-hidden="true" />
        </div>
        <div className="pp-liq-group pp-liq-modes" role="listbox" aria-label="Liquify mode">
          {LIQ_MODES.map((m) => (
            <Button variant="paint" size="paint" key={m} type="button" role="option" aria-selected={value.mode === m} className="pp-liq-mode"
              onClick={() => { set({ mode: m }); setPicking(false); }}>
              <LiqGlyph mode={m} /><span>{m}</span>{value.mode === m && <Check size={20} className="pp-liq-tick" />}
            </Button>
          ))}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="pp-liq-head">
          <h3>Liquify</h3>
          <Button variant="paint" size="paint" type="button" className="pp-liq-circle" aria-label="Apply Liquify" onClick={onDone}><Check size={24} strokeWidth={2.4} /></Button>
        </div>
        <div className="pp-liq-actions">
          <Button variant="paint" size="paint" type="button" className="pp-liq-pill pp-liq-modebtn" onClick={() => setPicking(true)}>
            <LiqGlyph mode={value.mode} /><span>{value.mode}</span><ChevronRight size={20} />
          </Button>
          <Button variant="paint" size="paint" type="button" className="pp-liq-pill pp-liq-reset" onClick={onReset}>Reset</Button>
        </div>
        <div className="pp-liq-group">
          <LiqSlider label="Amount" value={value.amount} onChange={(v) => set({ amount: v })} />
          <LiqSlider label="Size" value={value.size} min={2} onChange={(v) => set({ size: v })} />
          <LiqSlider label="Pressure" value={value.pressure} min={1} onChange={(v) => set({ pressure: v })} />
          <LiqSlider label="Distortion" value={value.distortion} onChange={(v) => set({ distortion: v })} />
          <LiqSlider label="Momentum" value={value.momentum} onChange={(v) => set({ momentum: v })} />
        </div>
      </>
    );
  }
  return (
    <Sheet modal={false} label="Liquify" className="pp-bottombar pp-liq-sheet" onClose={onDone}>
      {body}
    </Sheet>
  );
}

/** Gooey ColorDrop blob: a trailing drop stretches behind the finger and melts back in. */
export function BlobGhost({ x, y, color }: { x: number; y: number; color: string }) {
  const target = useRef({ x, y });
  target.current = { x, y };
  const mid = useRef({ x, y });
  const tail = useRef({ x, y });
  const [, tick] = useState(0);
  const [grow, setGrow] = useState(0.4);
  useEffect(() => {
    let id = 0;
    const step = () => {
      const t = target.current;
      mid.current = { x: mid.current.x + (t.x - mid.current.x) * 0.3, y: mid.current.y + (t.y - mid.current.y) * 0.3 };
      tail.current = { x: tail.current.x + (mid.current.x - tail.current.x) * 0.2, y: tail.current.y + (mid.current.y - tail.current.y) * 0.2 };
      setGrow((g) => Math.min(1, g + (1 - g) * 0.2));
      tick((n) => (n + 1) % 1e6);
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, []);
  const R = 24 * grow;
  return (
    <svg className="pp-blob-ghost" aria-hidden="true">
      <defs>
        <filter id="pp-goo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" />
        </filter>
      </defs>
      <g filter="url(#pp-goo)" fill={color}>
        <circle cx={tail.current.x} cy={tail.current.y} r={R * 0.42} />
        <circle cx={mid.current.x} cy={mid.current.y} r={R * 0.68} />
        <circle cx={x} cy={y} r={R} />
      </g>
    </svg>
  );
}
