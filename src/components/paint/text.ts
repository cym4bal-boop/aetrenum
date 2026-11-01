/* Text tool: a curated set of Google Fonts plus fonts the user imports. */
export type FontDef = { family: string; weights: number[]; custom?: boolean };
export type TextDraft = {
  value: string; family: string; weight: number; size: number;
  tracking: number; leading: number; opacity: number;
  align: 'left' | 'center' | 'right'; caps: boolean; underline: boolean; outline: boolean;
};

const R = (a: number, b: number) => Array.from({ length: (b - a) / 100 + 1 }, (_, i) => a + i * 100);
export const googleFonts: FontDef[] = [
  { family: 'Azeret Mono', weights: R(100, 900) },
  { family: 'Libre Baskerville', weights: [400, 700] },
  { family: 'Big Shoulders Display', weights: R(100, 900) },
  { family: 'Bodoni Moda', weights: R(400, 900) },
  { family: 'Bebas Neue', weights: [400] },
  { family: 'Playfair Display', weights: R(400, 900) },
  { family: 'Inter', weights: R(100, 900) },
  { family: 'Montserrat', weights: R(100, 900) },
  { family: 'Fraunces', weights: R(100, 900) },
  { family: 'Space Grotesk', weights: R(300, 700) },
  { family: 'Syne', weights: R(400, 800) },
  { family: 'Oswald', weights: R(200, 700) },
  { family: 'Roboto Slab', weights: R(100, 900) },
  { family: 'Cormorant Garamond', weights: R(300, 700) },
  { family: 'DM Serif Display', weights: [400] },
  { family: 'Abril Fatface', weights: [400] },
  { family: 'Archivo Black', weights: [400] },
  { family: 'Anton', weights: [400] },
  { family: 'JetBrains Mono', weights: R(100, 800) },
  { family: 'Caveat', weights: R(400, 700) },
  { family: 'Permanent Marker', weights: [400] },
  { family: 'Pacifico', weights: [400] },
  { family: 'Lobster', weights: [400] },
  { family: 'Righteous', weights: [400] },
];

export const weightName: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

const plus = (f: string) => f.replace(/ /g, '+');
const linked = new Set<string>();
function addLink(href: string) {
  if (linked.has(href) || typeof document === 'undefined') return;
  linked.add(href);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}
/** Loads every font at a single weight so the picker can show each typeface in itself. */
export function loadPreviewFonts() {
  const fams = googleFonts.map((f) => `family=${plus(f.family)}${f.weights.length > 1 ? `:wght@${f.weights.includes(400) ? 400 : f.weights[0]}` : ''}`).join('&');
  addLink(`https://fonts.googleapis.com/css2?${fams}&display=swap`);
}
/** Loads all weights of one Google font. */
export function loadFamily(f: FontDef) {
  if (f.custom) return;
  addLink(`https://fonts.googleapis.com/css2?family=${plus(f.family)}${f.weights.length > 1 ? `:wght@${f.weights.join(';')}` : ''}&display=swap`);
}
export async function ensureFont(d: TextDraft) {
  try { await document.fonts.load(`${d.weight} ${Math.min(200, d.size)}px "${d.family}"`); } catch { /* fall back */ }
}

const CUSTOM_KEY = 'pp.customFonts';
type StoredFont = { family: string; data: string };
const readCustom = (): StoredFont[] => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]'); } catch { return []; } };

async function register(family: string, src: ArrayBuffer | string) {
  const face = new FontFace(family, typeof src === 'string' ? `url(${src})` : src);
  await face.load();
  document.fonts.add(face);
}
/** Re-registers fonts imported in earlier sessions. */
export async function restoreCustomFonts(): Promise<FontDef[]> {
  const out: FontDef[] = [];
  for (const f of readCustom()) {
    try { await register(f.family, f.data); out.push({ family: f.family, weights: [400], custom: true }); } catch { /* skip broken */ }
  }
  return out;
}
/** Imports a .ttf/.otf/.woff/.woff2 file and remembers it when it is small enough. */
export async function importFont(file: File): Promise<FontDef> {
  const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported Font';
  await register(family, await file.arrayBuffer());
  if (file.size < 1_500_000) {
    const data: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([...readCustom().filter((f) => f.family !== family), { family, data }])); } catch { /* too big for storage */ }
  }
  return { family, weights: [400], custom: true };
}

export const defaultDraft = (W: number, H: number): TextDraft => ({
  value: 'Text', family: 'Big Shoulders Display', weight: 700, size: Math.round(Math.min(W, H) / 6),
  tracking: 0, leading: 1.15, opacity: 1, align: 'center', caps: false, underline: false, outline: false,
});

/** Draws the text block centered on the canvas. */
export function drawText(c: CanvasRenderingContext2D, d: TextDraft, W: number, H: number, color: string) {
  c.save();
  c.globalAlpha = d.opacity;
  c.fillStyle = color; c.strokeStyle = color;
  c.font = `${d.weight} ${d.size}px "${d.family}", sans-serif`;
  (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${d.tracking}px`;
  c.textBaseline = 'middle';
  c.textAlign = d.align;
  const lines = (d.caps ? d.value.toUpperCase() : d.value).split('\n');
  const lh = d.size * d.leading;
  const x = d.align === 'left' ? W * 0.08 : d.align === 'right' ? W * 0.92 : W / 2;
  lines.forEach((line, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * lh;
    if (d.outline) { c.lineWidth = Math.max(1, d.size / 18); c.lineJoin = 'round'; c.strokeText(line, x, y); }
    else c.fillText(line, x, y);
    if (d.underline && line) {
      const w = c.measureText(line).width;
      const x0 = d.align === 'left' ? x : d.align === 'right' ? x - w : x - w / 2;
      c.fillRect(x0, y + d.size * 0.45, w, Math.max(1, d.size / 16));
    }
  });
  c.restore();
}
