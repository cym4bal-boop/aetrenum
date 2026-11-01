/** App-wide appearance settings (dark mode + custom accent color), persisted in localStorage. */
const DARK_KEY = 'pp.dark';
const ACCENT_KEY = 'pp.accent';
const FROST_KEY = 'pp.frost';
export const DEFAULT_ACCENT = '#0785ff';

export const accentOptions = () => ['#0785ff', '#00c7be', '#34c759', '#ff9500', '#ff2d55', '#af52de', '#5856d6', '#ff3b30'];

export function readDark(): boolean {
  try { return JSON.parse(localStorage.getItem(DARK_KEY) ?? 'false') === true; } catch { return false; }
}

export function readAccent(): string {
  try { const v = JSON.parse(localStorage.getItem(ACCENT_KEY) ?? '""'); return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
}

export function readFrost(): boolean {
  try { return JSON.parse(localStorage.getItem(FROST_KEY) ?? 'false') === true; } catch { return false; }
}

export function writeFrost(frost: boolean) {
  try { localStorage.setItem(FROST_KEY, JSON.stringify(frost)); } catch { /* ignore */ }
  animateAppearance(() => document.documentElement.classList.toggle('frost', frost));
}

let themeTimer = 0;
/** Light/Dark, accent and Frost/Liquid Glass changes cross-fade instead of snapping. A temporary
 *  class transitions colours/backgrounds for 320ms and is removed, so drawing never pays for it. */
function animateAppearance(update: () => void) {
  const root = document.documentElement;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !root.dataset['ppThemed']) { update(); root.dataset['ppThemed'] = '1'; return; }
  root.classList.add('pp-theme-changing');
  update();
  window.clearTimeout(themeTimer);
  themeTimer = window.setTimeout(() => root.classList.remove('pp-theme-changing'), 340);
}

/** Applies settings at once; undefined keeps the stored value. Call on app start and on every change. */
export function applyTheme(dark?: boolean, accent?: string, frost?: boolean) {
  const d = dark ?? readDark();
  const a = accent ?? readAccent();
  const f = frost ?? readFrost();
  const root = document.documentElement;
  const changed = root.classList.contains('dark') !== d || root.classList.contains('frost') !== f || root.style.getPropertyValue('--pp-active') !== a;
  const update = () => {
    root.classList.toggle('dark', d);
    root.classList.toggle('frost', f);
    root.style.setProperty('--pp-active', a);
  };
  if (changed) animateAppearance(update); else root.dataset['ppThemed'] = '1';
  try {
    if (dark !== undefined) localStorage.setItem(DARK_KEY, JSON.stringify(dark));
    if (accent !== undefined) localStorage.setItem(ACCENT_KEY, JSON.stringify(accent));
    if (frost !== undefined) localStorage.setItem(FROST_KEY, JSON.stringify(frost));
  } catch { /* ignore */ }
}

/* ---------------- app preferences ----------------
 * Global prefs live in the gallery Settings window. Canvas-specific prefs
 * (rendering, workflow, brush behaviour) are only reachable from inside a
 * canvas, like Procreate. Everything persists on this device. */
const PREFS_KEY = 'pp.prefs';

export type CurveKind = 'linear' | 'ease-in' | 'ease-out';
export type Prefs = {
  // gestures
  doubleTap: 'nothing' | 'undo' | 'eyedropper';
  longPress: 'eyedropper' | 'nothing';
  /** Pocket 5 multi-finger gestures, each can be switched off */
  gTapUndo: boolean;        // two-finger tap undo, hold = rapid undo
  gTapRedo: boolean;        // three-finger tap redo, hold = rapid redo
  gScrubClear: boolean;     // three-finger scrub clears the layer
  gSwipeCopy: boolean;      // three-finger swipe down: Copy & Paste
  gFullscreen: boolean;     // four-finger tap: full screen
  gQuickPinch: boolean;     // quick pinch: fit canvas to screen
  quickMenuGesture: 'three-swipe-up' | 'four-hold' | 'off';
  /** QuickMenu enabled (Actions → Prefs); opens with a one-finger double tap */
  quickMenu: boolean;
  // brush settings (canvas-only)
  drawCursor: boolean;
  shapeDetection: boolean;
  curvePressure: CurveKind;
  curveVelocity: CurveKind;
  curveTilt: CurveKind;
  // rendering (canvas-only)
  lowLatency: 'active' | 'off';
  colorMode: 'standard' | 'vivid' | 'muted';
  gamma: boolean;
  deepColor: boolean;
  // workflow (canvas-only)
  rotateCanvas: boolean;
  showLayerChanges: boolean;
  // ColorDrop: off = plain flood fill, no edge/gap detection
  edgeDetect: boolean;
  /** Layer-name marquee speed in px/s; 0 turns scrolling off. */
  layerNameSpeed: number;
  // saving
  savePrompt: boolean;
  historyLimit: number; // max undo steps kept per canvas
  // new project
  timelapse: boolean;
  videoQuality: '720p' | '1080p' | '4K';
  // hardware
  volumeKeys: 'nothing' | 'brush-size' | 'undo';
  disableBack: boolean;
  // language
  language: 'default';
};

export const DEFAULT_PREFS: Prefs = {
  doubleTap: 'nothing',
  longPress: 'eyedropper',
  gTapUndo: true,
  gTapRedo: true,
  gScrubClear: true,
  gSwipeCopy: true,
  gFullscreen: true,
  gQuickPinch: false,
  quickMenuGesture: 'three-swipe-up',
  quickMenu: true,
  drawCursor: false,
  shapeDetection: true,
  curvePressure: 'linear',
  curveVelocity: 'linear',
  curveTilt: 'linear',
  lowLatency: 'active',
  colorMode: 'standard',
  gamma: true,
  deepColor: false,
  rotateCanvas: true,
  showLayerChanges: true,
  edgeDetect: true,
  layerNameSpeed: 30,
  savePrompt: false,
  historyLimit: 10000,
  timelapse: true,
  videoQuality: '720p',
  volumeKeys: 'nothing',
  disableBack: false,
  language: 'default',
};

export function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    // v6 defaults: QuickMenu on, quick-pinch fit-to-screen off (one-time migration)
    if (v && typeof v === 'object' && !v.__v6) { v.quickMenu = true; v.gQuickPinch = false; v.__v6 = true; try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
    return { ...DEFAULT_PREFS, ...(v && typeof v === 'object' ? v : {}) };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('pp-prefs')); } catch { /* ignore */ }
  return next;
}

export function resetPrefs(patch: (keyof Prefs)[]): Prefs {
  const keep = readPrefs();
  const next = { ...keep };
  for (const k of patch) (next as Record<string, unknown>)[k] = DEFAULT_PREFS[k];
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('pp-prefs')); } catch { /* ignore */ }
  return next;
}

/** Pressure/velocity curve shaping: linear passes through, ease-in starts soft, ease-out starts strong. */
export function applyCurve(kind: CurveKind, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  if (kind === 'ease-in') return x * x;
  if (kind === 'ease-out') return 1 - (1 - x) * (1 - x);
  return x;
}
