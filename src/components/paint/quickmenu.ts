/* QuickMenu (Procreate Pocket 5 style): six customizable radial buttons, grouped in
 * named profiles. Pure state helpers + device-local persistence. */

export const QUICK_ACTIONS = {
  none: 'No Action',
  undo: 'Undo',
  redo: 'Redo',
  brush: 'Brush',
  smudge: 'Smudge',
  eraser: 'Eraser',
  select: 'Selection',
  transform: 'Transform',
  layers: 'Layers',
  'new-layer': 'New layer',
  'clear-layer': 'Clear layer',
  'merge-down': 'Merge down',
  'fill-layer': 'Fill layer',
  'duplicate-layer': 'Duplicate Layer',
  'alpha-lock': 'Alpha Lock',
  adjustments: 'Adjustments',
  colors: 'Colours',
  'flip-h': 'Flip horizontally',
  'flip-v': 'Flip vertically',
  fit: 'Fit to Screen',
  fullscreen: 'Full screen',
  copy: 'Copy',
  paste: 'Paste',
  'copy-paste': 'Copy & Paste',
  reference: 'Reference',
  navigator: 'Canvas Navigator',
  guide: 'Drawing Guide',
  'add-text': 'Add Text',
  'export-png': 'Share PNG',
} as const;
export type QuickAction = keyof typeof QUICK_ACTIONS;
export const QUICK_ACTION_IDS = Object.keys(QUICK_ACTIONS) as QuickAction[];

export type QuickProfile = { id: string; name: string; slots: QuickAction[] };
export type QuickState = { active: string; profiles: QuickProfile[] };

export const SLOT_COUNT = 6;
const KEY = 'pp.quickmenu';

export const DEFAULT_QUICK: QuickState = {
  active: 'default',
  profiles: [
    // Procreate Pocket defaults; slot order = top, upper right, lower right, bottom, lower left, upper left
    { id: 'default', name: 'QuickMenu 1', slots: ['new-layer', 'flip-h', 'copy', 'merge-down', 'clear-layer', 'flip-v'] },
  ],
};

const uid = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const valid = (a: unknown): a is QuickAction => typeof a === 'string' && a in QUICK_ACTIONS;

export function sanitizeQuick(v: unknown): QuickState {
  if (!v || typeof v !== 'object') return structuredClone(DEFAULT_QUICK);
  const raw = v as { active?: unknown; profiles?: unknown };
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p, i) => {
      const slots = (Array.isArray(p['slots']) ? p['slots'] : []).filter(valid).slice(0, SLOT_COUNT);
      while (slots.length < SLOT_COUNT) slots.push(DEFAULT_QUICK.profiles[0]!.slots[slots.length]!);
      return { id: typeof p['id'] === 'string' ? (p['id'] as string) : `p${i}`, name: typeof p['name'] === 'string' && p['name'] ? (p['name'] as string) : `QuickMenu ${i + 1}`, slots };
    });
  if (!profiles.length) return structuredClone(DEFAULT_QUICK);
  const active = typeof raw.active === 'string' && profiles.some((p) => p.id === raw.active) ? raw.active : profiles[0]!.id;
  return { active, profiles };
}

export type QuickOp =
  | { type: 'assign'; slot: number; action: QuickAction }
  | { type: 'create'; name?: string; id?: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'switch'; id: string };

/** Pure reducer: every QuickMenu change goes through here (tested). */
export function quickReducer(s: QuickState, op: QuickOp): QuickState {
  const cur = s.profiles.find((p) => p.id === s.active) ?? s.profiles[0]!;
  switch (op.type) {
    case 'assign':
      if (op.slot < 0 || op.slot >= SLOT_COUNT || !valid(op.action)) return s;
      return { ...s, profiles: s.profiles.map((p) => (p.id === cur.id ? { ...p, slots: p.slots.map((a, i) => (i === op.slot ? op.action : a)) } : p)) };
    case 'create': {
      const id = op.id ?? uid();
      let k = s.profiles.length + 1;
      while (s.profiles.some((p) => p.name === `QuickMenu ${k}`)) k++;
      const name = (op.name ?? '').trim() || `QuickMenu ${k}`;
      // a new profile starts with No Action on all six buttons (Procreate Pocket)
      return { active: id, profiles: [{ id, name, slots: Array<QuickAction>(SLOT_COUNT).fill('none') }, ...s.profiles] };
    }
    case 'rename': {
      const name = op.name.trim();
      if (!name) return s;
      return { ...s, profiles: s.profiles.map((p) => (p.id === op.id ? { ...p, name } : p)) };
    }
    case 'delete': {
      if (s.profiles.length <= 1) return s;
      const profiles = s.profiles.filter((p) => p.id !== op.id);
      return { active: s.active === op.id ? profiles[0]!.id : s.active, profiles };
    }
    case 'switch':
      return s.profiles.some((p) => p.id === op.id) ? { ...s, active: op.id } : s;
  }
}

export function activeProfile(s: QuickState): QuickProfile {
  return s.profiles.find((p) => p.id === s.active) ?? s.profiles[0]!;
}

export function readQuick(): QuickState {
  try { return sanitizeQuick(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return structuredClone(DEFAULT_QUICK); }
}
export function writeQuick(s: QuickState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Keeps the radial menu fully on screen: returns a clamped centre. */
export function clampCentre(x: number, y: number, radius: number, vw: number, vh: number, margin = 12) {
  const r = radius + margin;
  return { x: Math.max(r, Math.min(vw - r, x)), y: Math.max(r, Math.min(vh - r, y)) };
}
