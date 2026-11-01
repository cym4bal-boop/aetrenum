/* Raster selection maths for Procreate Pocket style selections.
 * Selections are stored as traced, non-overlapping outlines (outer loops + holes) so the
 * rest of the editor can keep clipping with a single Path2D and the 'evenodd' rule.
 * Combining (Add / Remove / Invert / Automatic / Feather) happens on a coarse mask grid. */
import type { Pt } from './geometry';

export type Mask = { data: Uint8Array; w: number; h: number; sx: number; sy: number };

/** Mask grid for a W×H document, capped so traces stay fast on huge canvases. */
export function maskGrid(W: number, H: number, cap = 1536) {
  const k = Math.min(1, cap / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  return { w, h, sx: W / w, sy: H / h };
}

let scratch: HTMLCanvasElement | null = null;
function scratchCtx(w: number, h: number) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const c = scratch.getContext('2d', { willReadFrequently: true })!;
  c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return c;
}

/** Rasterises outlines (evenodd) into a mask on the given grid. Optional blur feathers before thresholding. */
export function rasterize(outlines: Pt[][], W: number, H: number, blurPx = 0): Mask {
  const g = maskGrid(W, H);
  const c = scratchCtx(g.w, g.h);
  c.setTransform(1 / g.sx, 0, 0, 1 / g.sy, 0, 0);
  if (blurPx > 0) c.filter = `blur(${(blurPx / g.sx).toFixed(2)}px)`;
  c.fillStyle = '#000';
  c.beginPath();
  for (const o of outlines) { o.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); }
  c.fill('evenodd');
  const img = c.getImageData(0, 0, g.w, g.h).data;
  const data = new Uint8Array(g.w * g.h);
  for (let i = 0, p = 3; i < data.length; i++, p += 4) data[i] = img[p]! >= 128 ? 1 : 0;
  return { data, ...g };
}

export function emptyMask(W: number, H: number): Mask { const g = maskGrid(W, H); return { data: new Uint8Array(g.w * g.h), ...g }; }

export function combine(a: Mask, b: Mask, op: 'add' | 'remove'): Mask {
  const out = new Uint8Array(a.data.length);
  if (op === 'add') for (let i = 0; i < out.length; i++) out[i] = a.data[i]! | b.data[i]!;
  else for (let i = 0; i < out.length; i++) out[i] = a.data[i]! & (b.data[i]! ^ 1);
  return { ...a, data: out };
}

export function invert(a: Mask): Mask {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i]! ^ 1;
  return { ...a, data: out };
}

/** Pixel-crack contour tracing. Returns loops in document coordinates; inside is always on the
 *  same side, so outer loops and holes clip correctly with 'evenodd'. Corners are chamfered via
 *  edge midpoints and collinear points removed, which keeps outlines light and smooth. */
export function trace(m: Mask): Pt[][] {
  const { w, h, data } = m;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? data[y * w + x]! : 0);
  const VW = w + 1;
  // directed edges keyed by start vertex; inside on the right (y-down, clockwise)
  const next = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * VW + x0, v = y1 * VW + x1;
    const l = next.get(k); if (l) l.push(v); else next.set(k, [v]);
  };
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!data[row + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops: Pt[][] = [];
  for (const [start] of next) {
    let l = next.get(start);
    while (l && l.length) {
      const verts: number[] = [start];
      let cur = l.pop()!;
      if (!l.length) next.delete(start);
      let guard = 0;
      while (cur !== start && guard++ < 1e7) {
        verts.push(cur);
        const nl = next.get(cur);
        if (!nl || !nl.length) break;
        const v = nl.pop()!;
        if (!nl.length) next.delete(cur);
        cur = v;
      }
      if (verts.length >= 4) loops.push(simplify(verts, VW, m.sx, m.sy));
      l = next.get(start);
    }
  }
  return loops.filter((o) => o.length >= 3);
}

function simplify(verts: number[], VW: number, sx: number, sy: number): Pt[] {
  const n = verts.length;
  const mids: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i]!, b = verts[(i + 1) % n]!;
    mids.push({ x: (((a % VW) + (b % VW)) / 2) * sx, y: ((Math.floor(a / VW) + Math.floor(b / VW)) / 2) * sy });
  }
  const out: Pt[] = [];
  for (let i = 0; i < mids.length; i++) {
    const p = mids[(i - 1 + mids.length) % mids.length]!, c = mids[i]!, q = mids[(i + 1) % mids.length]!;
    const cross = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x);
    if (Math.abs(cross) > 1e-6) out.push(c);
  }
  return out;
}

/** Automatic selection: flood region from a seed on a downsampled copy of `src`. */
export function floodMask(src: HTMLCanvasElement, W: number, H: number, x: number, y: number, threshold: number, cache: { key?: HTMLCanvasElement; data?: Uint8ClampedArray }): Mask {
  const g = maskGrid(W, H, 1024);
  if (cache.key !== src || !cache.data) {
    const c = scratchCtx(g.w, g.h);
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, g.w, g.h);
    cache.data = c.getImageData(0, 0, g.w, g.h).data;
    cache.key = src;
  }
  const d = cache.data;
  const sx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.sx))), sy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.sy)));
  const i0 = (sy * g.w + sx) * 4;
  const tr = d[i0]!, tg = d[i0 + 1]!, tb = d[i0 + 2]!, ta = d[i0 + 3]!;
  const tol = (threshold / 100) * 255 + 2;
  const N = g.w * g.h;
  const out = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const match = (o: number) => {
    const p = o * 4;
    if (ta < 8) return d[p + 3]! <= tol;
    return Math.abs(d[p]! - tr) <= tol && Math.abs(d[p + 1]! - tg) <= tol && Math.abs(d[p + 2]! - tb) <= tol && Math.abs(d[p + 3]! - ta) <= tol;
  };
  stack[sp++] = sy * g.w + sx; out[sy * g.w + sx] = 1;
  while (sp) {
    const o = stack[--sp]!;
    const x0 = o % g.w;
    if (x0 > 0 && !out[o - 1] && match(o - 1)) { out[o - 1] = 1; stack[sp++] = o - 1; }
    if (x0 < g.w - 1 && !out[o + 1] && match(o + 1)) { out[o + 1] = 1; stack[sp++] = o + 1; }
    if (o >= g.w && !out[o - g.w] && match(o - g.w)) { out[o - g.w] = 1; stack[sp++] = o - g.w; }
    if (o + g.w < N && !out[o + g.w] && match(o + g.w)) { out[o + g.w] = 1; stack[sp++] = o + g.w; }
  }
  // resample onto the standard mask grid
  const t = maskGrid(W, H);
  if (t.w === g.w && t.h === g.h) return { data: out, ...g };
  const res = new Uint8Array(t.w * t.h);
  for (let yy = 0; yy < t.h; yy++) {
    const gy = Math.min(g.h - 1, Math.floor((yy * t.sy) / g.sy));
    for (let xx = 0; xx < t.w; xx++) res[yy * t.w + xx] = out[gy * g.w + Math.min(g.w - 1, Math.floor((xx * t.sx) / g.sx))]!;
  }
  return { data: res, ...t };
}

/** Layer alpha → mask (Select layer contents). */
export function alphaMask(src: HTMLCanvasElement, W: number, H: number): Mask {
  const g = maskGrid(W, H);
  const c = scratchCtx(g.w, g.h);
  c.drawImage(src, 0, 0, g.w, g.h);
  const img = c.getImageData(0, 0, g.w, g.h).data;
  const data = new Uint8Array(g.w * g.h);
  for (let i = 0, p = 3; i < data.length; i++, p += 4) data[i] = img[p]! > 8 ? 1 : 0;
  return { data, ...g };
}

export function isEmpty(m: Mask) { for (let i = 0; i < m.data.length; i++) if (m.data[i]) return false; return true; }

export function boundsOf(outlines: Pt[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of outlines) for (const p of o) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
