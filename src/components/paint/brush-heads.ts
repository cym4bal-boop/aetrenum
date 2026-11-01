/* Procedural brush heads and grain textures for the bundled brush pack.
 * The pack names its built-in heads/textures (e.g. "head_bristle", "texture_4") but
 * ships no images, so each name maps to a hand-tuned generator. Results are cached
 * as PNG data URLs (white = paint) and only built in the browser. */

type Rng = () => number;
function rngFor(name: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type HeadStyle = 'round' | 'soft' | 'oval' | 'square' | 'grainy' | 'bristle' | 'splatter' | 'sponge' | 'wash' | 'hatch' | 'star' | 'ring';

/** Which generator a head name uses (pure; tested). Empty name = plain round. */
export function headStyle(name: string): HeadStyle {
  const n = name.toLowerCase();
  if (!n || /sharp_round|^brush_head_oval|light$|neon/.test(n)) return 'round';
  if (/bokeh/.test(n)) return 'ring';
  if (/airbrush|cloud|smoke|feather|glow/.test(n)) return 'soft';
  if (/flat_oval|copic|felt|highlighter|calligraphy|toothpaste|shadow_script/.test(n)) return 'oval';
  if (/crosshatch|zigzag/.test(n)) return 'hatch';
  if (/spike|rose|flame/.test(n)) return 'star';
  if (/bristle|bamboo|fan|fibers|tear/.test(n)) return 'bristle';
  if (/splatter|water_dots|sand_blast|scattered/.test(n)) return 'splatter';
  if (/sponge|grungy|chunks|pixelated|jagged|smear|doodle/.test(n)) return 'sponge';
  if (/wash|watercolor|bleed|granulation/.test(n)) return 'wash';
  if (/square/.test(n)) return 'square';
  return 'grainy'; // pencils, charcoals, chalks
}

const S = 128;
const cache = new Map<string, string>();
const canvases = new Map<string, HTMLCanvasElement>();
/** The canvas behind a procedural data URL, so the engine can stamp it synchronously (no image decode wait). */
export function proceduralCanvas(url?: string): HTMLCanvasElement | undefined { return url ? canvases.get(url) : undefined; }

function canvas(px: number) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  return [c, c.getContext('2d', { willReadFrequently: true })] as const;
}

function noiseOut(x: CanvasRenderingContext2D, px: number, r: Rng, amount: number, cell = 1) {
  const d = x.getImageData(0, 0, px, px);
  for (let y = 0; y < px; y += cell) for (let xx = 0; xx < px; xx += cell) {
    const k = 1 - r() * amount;
    for (let j = 0; j < cell && y + j < px; j++) for (let i = 0; i < cell && xx + i < px; i++) {
      const p = ((y + j) * px + xx + i) * 4 + 3; d.data[p] = Math.round(d.data[p]! * k);
    }
  }
  x.putImageData(d, 0, 0);
}

function softDisc(x: CanvasRenderingContext2D, cx: number, cy: number, rad: number, hard: number, a = 1) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(hard, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
}

function drawHead(style: HeadStyle, r: Rng): string | undefined {
  if (style === 'round' || style === 'soft' || style === 'oval') return undefined; // engine draws these from hardness/roundness
  const [c, x] = canvas(S); const m = S / 2;
  if (!x) return undefined;
  x.fillStyle = '#fff';
  switch (style) {
    case 'ring':
      softDisc(x, m, m, m * 0.95, 0.85, 0.55);
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = S * 0.05; x.beginPath(); x.arc(m, m, m * 0.86, 0, Math.PI * 2); x.stroke();
      break;
    case 'square':
      x.fillRect(S * 0.12, S * 0.12, S * 0.76, S * 0.76); noiseOut(x, S, r, 0.75, 2);
      break;
    case 'grainy':
      softDisc(x, m, m, m * 0.96, 0.7); noiseOut(x, S, r, 0.9, 1);
      break;
    case 'bristle':
      for (let i = 0; i < 46; i++) {
        const t = r() * Math.PI * 2, d = Math.sqrt(r()) * m * 0.88;
        softDisc(x, m + Math.cos(t) * d, m + Math.sin(t) * d * 0.55, S * (0.03 + r() * 0.05), 0.5, 0.65 + r() * 0.35);
      }
      break;
    case 'splatter':
      for (let i = 0; i < 34; i++) {
        const t = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * m * 0.92, rad = S * (0.012 + Math.pow(r(), 3) * 0.09);
        x.beginPath(); x.arc(m + Math.cos(t) * d, m + Math.sin(t) * d, rad, 0, Math.PI * 2); x.fill();
      }
      break;
    case 'sponge':
      for (let i = 0; i < 70; i++) {
        const t = r() * Math.PI * 2, d = Math.sqrt(r()) * m * 0.85;
        x.globalAlpha = 0.5 + r() * 0.5; x.beginPath(); x.arc(m + Math.cos(t) * d, m + Math.sin(t) * d, S * (0.02 + r() * 0.06), 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      break;
    case 'wash':
      for (let i = 0; i < 9; i++) softDisc(x, m + (r() - 0.5) * S * 0.18, m + (r() - 0.5) * S * 0.18, m * (0.62 + r() * 0.3), 0.4, 0.35);
      noiseOut(x, S, r, 0.35, 2);
      break;
    case 'hatch':
      x.strokeStyle = '#fff'; x.lineWidth = S * 0.035;
      for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(m + i * S * 0.1 - m, 0); x.lineTo(m + i * S * 0.1 + m, S); x.stroke(); }
      x.globalCompositeOperation = 'destination-in'; softDisc(x, m, m, m, 0.8);
      break;
    case 'star':
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rad = i % 2 ? m * 0.38 : m * 0.95; x.lineTo(m + Math.cos(a) * rad, m + Math.sin(a) * rad); }
      x.closePath(); x.fill();
      break;
  }
  const url = c.toDataURL('image/png');
  canvases.set(url, c);
  return url;
}

/** Head image (data URL) for a pack head name, or undefined for engine-drawn round/oval tips. */
export function headImage(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = `h:${name}`;
  if (cache.has(key)) return cache.get(key) || undefined;
  const url = drawHead(headStyle(name), rngFor(name)) ?? '';
  cache.set(key, url);
  return url || undefined;
}

export type TextureStyle = 'fbm' | 'hlines' | 'vlines' | 'dots' | 'checker' | 'grid' | 'bricks' | 'scratch' | 'paper';
export function textureStyle(name: string): TextureStyle {
  const n = name.toLowerCase();
  if (/horizontal_lines|dash/.test(n)) return 'hlines';
  if (/rope|zigzag/.test(n)) return 'vlines';
  if (/screentone|dot|tone/.test(n)) return 'dots';
  if (/checker/.test(n)) return 'checker';
  if (/grid|tiles/.test(n)) return 'grid';
  if (/brick/.test(n)) return 'bricks';
  if (/scratch|metal/.test(n)) return 'scratch';
  if (/^texture_\d+/.test(n)) return 'paper';
  return 'fbm';
}

/** Tileable grain (data URL, white = paint) for a pack texture name; undefined when none. */
export function textureImage(name: string): string | undefined {
  if (!name || typeof document === 'undefined') return undefined;
  const key = `t:${name}`;
  if (cache.has(key)) return cache.get(key) || undefined;
  const P = 256, r = rngFor(name), style = textureStyle(name);
  const [c, x] = canvas(P);
  if (!x) return undefined;
  const d = x.createImageData(P, P);
  // tileable value noise, a few octaves
  const oct = (cells: number) => {
    const g = Array.from({ length: cells * cells }, () => r());
    return (u: number, v: number) => {
      const fx = (u / P) * cells, fy = (v / P) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a: number, b: number) => g[((b % cells) * cells) + (a % cells)]!;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    };
  };
  const o1 = oct(8), o2 = oct(32), o3 = oct(128);
  const seed = r() * 10;
  for (let y = 0; y < P; y++) for (let xx = 0; xx < P; xx++) {
    const n = o1(xx, y) * 0.35 + o2(xx, y) * 0.35 + o3(xx, y) * 0.3;
    let v: number;
    switch (style) {
      case 'hlines': v = (y % 8) < 4 ? 1 : 0.15; break;
      case 'vlines': v = ((xx + Math.round(Math.sin(y / 6 + seed) * 3)) % 10) < 5 ? 1 : 0.15; break;
      case 'dots': { const cx = (xx % 8) - 4, cy = (y % 8) - 4; v = cx * cx + cy * cy < 7 ? 1 : 0; break; }
      case 'checker': v = ((xx >> 4) + (y >> 4)) % 2 ? 1 : 0.1; break;
      case 'grid': v = xx % 32 < 2 || y % 32 < 2 ? 1 : 0.1; break;
      case 'bricks': { const row = y >> 4, off = row % 2 ? 16 : 0; v = y % 16 < 2 || (xx + off) % 32 < 2 ? 0.1 : 0.9 * (0.7 + n * 0.3); break; }
      case 'scratch': v = Math.min(1, n * 0.6 + (o3(xx * 4, y / 4) > 0.82 ? 0.6 : 0.25)); break;
      case 'paper': v = Math.min(1, Math.max(0, (n - 0.25) * 1.9)); break;
      default: v = Math.min(1, Math.max(0, (n - 0.2) * 1.6));
    }
    const i = (y * P + xx) * 4; const b = Math.round(v * 255);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = b; d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  const url = c.toDataURL('image/png');
  canvases.set(url, c);
  cache.set(key, url);
  return url;
}
