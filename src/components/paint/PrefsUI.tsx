/* Shared preference controls for the Settings windows (gallery + canvas). */
import { Button } from '@/components/ui/button';
import type { CurveKind } from './settings';

export function PrefToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Button variant="paint" size="paint" type="button" className="pp-preset pp-set-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="pp-preset-name">{label}</span>
      <span className={`pp-toggle ${on ? 'on' : ''}`} aria-hidden="true"><span /></span>
    </Button>
  );
}

/** Dropdown-style pill; tapping cycles through the options (mobile-friendly). */
export function PrefCycle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  const next = () => {
    const i = options.indexOf(value);
    onChange(options[(i + 1) % options.length]!);
  };
  return (
    <Button variant="paint" size="paint" type="button" className="pp-preset pp-set-row" onClick={next} aria-label={`${label}: ${value}. Tap to change.`}>
      <span className="pp-preset-name">{label}</span>
      <span className="pp-set-pill">{value}</span>
    </Button>
  );
}

export function PrefSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="pp-preset pp-set-row pp-set-slider">
      <span className="pp-preset-name">{label}</span>
      <span className="pp-set-num">{value}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={(e) => e.stopPropagation()} />
    </div>
  );
}

const CURVE_PTS: Record<CurveKind, string> = {
  'linear': '2,46 46,2',
  'ease-in': '2,46 14,44 30,36 46,2',
  'ease-out': '2,46 12,20 30,6 46,2',
};
const CURVE_ORDER: CurveKind[] = ['linear', 'ease-in', 'ease-out'];

/** Global pressure/velocity/tilt curve graph; tap a graph to cycle its shape. */
export function CurveGraph({ label, kind, onChange }: { label: string; kind: CurveKind; onChange: (v: CurveKind) => void }) {
  return (
    <button type="button" className="pp-curve" aria-label={`${label} curve: ${kind}. Tap to change.`}
      onClick={() => onChange(CURVE_ORDER[(CURVE_ORDER.indexOf(kind) + 1) % CURVE_ORDER.length]!)}>
      <span className="pp-curve-label">{label}</span>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M2 2v44h46" className="pp-curve-axis" />
        <path d="M2 16h44M2 31h44M16 2v44M31 2v44" className="pp-curve-grid" />
        <polyline points={CURVE_PTS[kind]} className="pp-curve-line" />
      </svg>
    </button>
  );
}

export function PrefSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pp-group" aria-label={label}>{children}</div>
  );
}

export function ResetButton({ label = 'Reset to defaults', onReset }: { label?: string; onReset: () => void }) {
  return (
    <Button variant="paint" size="paint" type="button" className="pp-preset pp-set-row pp-set-reset" onClick={onReset}>
      <span className="pp-preset-name">{label}</span>
    </Button>
  );
}
