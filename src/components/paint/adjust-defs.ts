// @ts-nocheck -- loosely typed adjustment params.
/* Procreate Pocket 5 adjustment catalogue: names, groups, defaults and the
 * built-in Gradient Map library. Pure data so canvas code and UI share it. */
import type { Gradient } from './adjust-fx';

export type AdjustmentName =
  | 'Hue, Saturation, Brightness' | 'Color Balance' | 'Curves' | 'Gradient Map'
  | 'Gaussian Blur' | 'Motion Blur' | 'Perspective Blur'
  | 'Noise' | 'Sharpen' | 'Bloom' | 'Glitch' | 'Halftone' | 'Chromatic Aberration'
  | 'Liquify' | 'Clone';

export const ADJUSTMENT_GROUPS: { title: string; items: AdjustmentName[] }[] = [
  { title: 'Color Adjustments', items: ['Hue, Saturation, Brightness', 'Color Balance', 'Curves', 'Gradient Map'] },
  { title: 'Blur', items: ['Gaussian Blur', 'Motion Blur', 'Perspective Blur'] },
  { title: 'Effects', items: ['Noise', 'Sharpen', 'Bloom', 'Glitch', 'Halftone', 'Chromatic Aberration'] },
  { title: 'Retouch', items: ['Liquify', 'Clone'] },
];
export const ADJUSTMENT_LIST: AdjustmentName[] = ADJUSTMENT_GROUPS.flatMap((g) => g.items);
/** Adjustments that can live as a non-destructive adjustment layer. */
export const LAYER_ADJUSTMENTS: AdjustmentName[] = ADJUSTMENT_LIST.filter((a) => a !== 'Liquify' && a !== 'Clone');

export const ADJUST_LABELS: Record<string, string> = {
  'Hue, Saturation, Brightness': 'Hue, Saturation, Brightness',
  'Chromatic Aberration': 'Chromatic Aberration',
};
export const adjustLabel = (n: string) => ADJUST_LABELS[n] ?? n;
export const SHORT_LABELS: Record<string, string> = { 'Hue, Saturation, Brightness': 'HSB', 'Chromatic Aberration': 'Aberration', 'Gaussian Blur': 'Gaussian Blur' };

/** Panel adjustments are driven by their own controls; the rest by a canvas swipe %. */
export const PANEL_ADJUSTMENTS = new Set<string>(['Hue, Saturation, Brightness', 'Color Balance', 'Curves']);
export const usesSwipe = (n: string) => !PANEL_ADJUSTMENTS.has(n);
/** Adjustments whose readout has a grey handle that expands advanced settings. */
export const HAS_SETTINGS = new Set<string>(['Perspective Blur', 'Noise', 'Bloom', 'Glitch', 'Halftone', 'Chromatic Aberration']);

const identity = () => [{ x: 0, y: 0 }, { x: 1, y: 1 }];

export function defaultParams(name: string): Record<string, any> {
  return { ...rawDefaults(name), pv: 5 };
}
function rawDefaults(name: string): Record<string, any> {
  switch (name) {
    case 'Hue, Saturation, Brightness': return { hue: 50, saturation: 50, brightness: 50 };
    case 'Color Balance': return { tone: 'midtones', cyanRed: [50, 50, 50], magentaGreen: [50, 50, 50], yellowBlue: [50, 50, 50] };
    case 'Curves': return { channel: 'gamma', curves: { gamma: identity(), red: identity(), green: identity(), blue: identity() } };
    case 'Gradient Map': return { amount: 0, gradientId: null, stops: null };
    case 'Motion Blur': return { amount: 0, angle: 0 };
    case 'Perspective Blur': return { amount: 0, mode: 'positional', x: 0.5, y: 0.5, direction: 0 };
    case 'Noise': return { amount: 0, type: 'clouds', scale: 20, octaves: 30, turbulence: 0, multi: false, additive: true };
    case 'Bloom': return { amount: 0, transition: 50, size: 50, burn: 50 };
    case 'Glitch': return {
      amount: 0, mode: 'artifact',
      artifact: { amount: 0, blockSize: 0, zoom: 0 },
      wave: { amplitude: 40, frequency: 40, zoom: 0 },
      signal: { amount: 50, blockSize: 30, zoom: 0 },
      diverge: { red: 50, green: -30, blue: 40, zoom: 0 },
    };
    case 'Halftone': return { amount: 0, style: 'full-color' };
    case 'Chromatic Aberration': return { amount: 0, mode: 'perspective', x: 0.5, y: 0.5, transition: 50, falloff: 0, dx: 0, dy: 0, blur: 0, transparency: 0 };
    default: return { amount: 0 };
  }
}

/** Older saves stored HSB / Color Balance as signed values (0 = neutral); new
 *  params are 0–100 with 50 neutral and carry pv: 5. */
export function normalizeParams(name: string, params?: Record<string, any> | null): Record<string, any> {
  const base = defaultParams(name);
  if (!params) return base;
  if (params.pv === 5) return { ...base, ...params };
  const p: Record<string, any> = { ...params, pv: 5 };
  if (name === 'Hue, Saturation, Brightness') {
    p.hue = 50 + (Number(params.hue ?? 0) / 3.6); p.saturation = 50 + Number(params.saturation ?? 0) / 2; p.brightness = 50 + Number(params.brightness ?? 0) / 2;
  } else if (name === 'Color Balance') {
    for (const k of ['cyanRed', 'magentaGreen', 'yellowBlue']) p[k] = (params[k] ?? [0, 0, 0]).map((v: number) => 50 + v / 2);
  } else if (name === 'Curves' && params.curves?.composite && !params.curves.gamma) {
    p.curves = { ...params.curves, gamma: params.curves.composite };
    if (p.channel === 'composite') p.channel = 'gamma';
  }
  return { ...base, ...p };
}

/** Layer value: panel adjustments are simply "on" (100); swipe ones use their amount. */
export const layerValueOf = (name: string, params: Record<string, any>) => (usesSwipe(name) ? Number(params.amount ?? 0) : 100);

export const DEFAULT_GRADIENTS: Gradient[] = [
  { id: 'mystic', name: 'Mystic', stops: [{ pos: 0, color: '#120b2e' }, { pos: 0.35, color: '#4b2a8a' }, { pos: 0.7, color: '#4fa3c7' }, { pos: 1, color: '#e9f7ff' }] },
  { id: 'breeze', name: 'Breeze', stops: [{ pos: 0, color: '#0b2a33' }, { pos: 0.45, color: '#2f8f8a' }, { pos: 0.8, color: '#9fe0c3' }, { pos: 1, color: '#f4fff5' }] },
  { id: 'instant', name: 'Instant', stops: [{ pos: 0, color: '#2a1a12' }, { pos: 0.4, color: '#7d5a48' }, { pos: 0.75, color: '#d9b48f' }, { pos: 1, color: '#fff3dd' }] },
  { id: 'venice', name: 'Venice', stops: [{ pos: 0, color: '#14213d' }, { pos: 0.4, color: '#3d7a74' }, { pos: 0.75, color: '#e9c46a' }, { pos: 1, color: '#f6e7c8' }] },
  { id: 'blaze', name: 'Blaze', stops: [{ pos: 0, color: '#1a0000' }, { pos: 0.35, color: '#a3150c' }, { pos: 0.7, color: '#ff8a00' }, { pos: 1, color: '#fff7b0' }] },
  { id: 'neon', name: 'Neon', stops: [{ pos: 0, color: '#090022' }, { pos: 0.35, color: '#7700a6' }, { pos: 0.7, color: '#ff007f' }, { pos: 1, color: '#00f6ff' }] },
  { id: 'noir', name: 'Noir', stops: [{ pos: 0, color: '#000000' }, { pos: 0.5, color: '#5a5a5a' }, { pos: 1, color: '#ffffff' }] },
  { id: 'mocha', name: 'Mocha', stops: [{ pos: 0, color: '#2c1810' }, { pos: 0.45, color: '#6d4c41' }, { pos: 0.8, color: '#bcaaa4' }, { pos: 1, color: '#f5ebe6' }] },
];

const GRAD_KEY = 'pp.gradients';
export function loadGradients(): Gradient[] {
  try { const v = JSON.parse(localStorage.getItem(GRAD_KEY) ?? 'null'); if (Array.isArray(v) && v.length) return v; } catch { /* ignore */ }
  return DEFAULT_GRADIENTS.map((g) => ({ ...g, stops: g.stops.map((s) => ({ ...s })) }));
}
export function saveGradients(list: Gradient[]) { try { localStorage.setItem(GRAD_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
export const MAX_GRADIENT_STOPS = 12;
