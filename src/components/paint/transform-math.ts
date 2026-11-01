/* Transform geometry (Procreate Pocket Freeform / Uniform / Distort / Warp).
 * The floating content is described by 4 document-space corners (TL, TR, BR, BL) and an
 * optional 4×4 bicubic Bézier warp mesh. Parallelograms render through one affine drawImage;
 * perspective and warp render as an adaptive triangle mesh. */
import type { Pt } from './geometry';

export type Rect = { x: number; y: number; w: number; h: number };
export type TfState = { quad: Pt[]; mesh: Pt[] | null };

export const rectQuad = (b: Rect): Pt[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
export const centroid = (q: Pt[]): Pt => ({ x: (q[0]!.x + q[1]!.x + q[2]!.x + q[3]!.x) / 4, y: (q[0]!.y + q[1]!.y + q[2]!.y + q[3]!.y) / 4 });
export const isParallelogram = (q: Pt[]) => Math.abs(q[0]!.x + q[2]!.x - q[1]!.x - q[3]!.x) < 0.01 && Math.abs(q[0]!.y + q[2]!.y - q[1]!.y - q[3]!.y) < 0.01;

/** Homography mapping the unit square to quad (TL,TR,BR,BL). */
export function homography(q: Pt[]) {
  const [p0, p1, p2, p3] = q as [Pt, Pt, Pt, Pt];
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
  return (u: number, v: number): Pt => { const w = g * u + h * v + 1; return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }; };
}

/** Inverse homography via the square→quad map of the inverse direction (numerical). */
export function quadToQuad(from: Pt[], to: Pt[]) {
  const inv = invertHomography(from);
  const fwd = homography(to);
  return (p: Pt) => { const uv = inv(p); return fwd(uv.x, uv.y); };
}

function invertHomography(q: Pt[]) {
  // build matrix of square→quad and invert it
  const [p0, p1, p2, p3] = q as [Pt, Pt, Pt, Pt];
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { const den = dx1 * dy2 - dx2 * dy1 || 1e-9; g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
  // M = [[a,b,c],[d,e,f],[g,h,1]]
  const A = e - f * h, B = c * h - b, C = b * f - c * e;
  const D = f * g - d, E = a - c * g, F = c * d - a * f;
  const G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
  return (p: Pt): Pt => { const w = G * p.x + Hh * p.y + I || 1e-9; return { x: (A * p.x + B * p.y + C) / w, y: (D * p.x + E * p.y + F) / w }; };
}

const bern = (t: number): [number, number, number, number] => { const s = 1 - t; return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]; };

export function meshFromQuad(q: Pt[]): Pt[] {
  const H = homography(q);
  const out: Pt[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) out.push(H(i / 3, j / 3));
  return out;
}

export function patch(mesh: Pt[]) {
  return (u: number, v: number): Pt => {
    const bu = bern(u), bv = bern(v);
    let x = 0, y = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const w = bu[i]! * bv[j]!; const p = mesh[j * 4 + i]!; x += p.x * w; y += p.y * w; }
    return { x, y };
  };
}

/** Direct manipulation: move the surface point at (u,v) by d, spreading over control points. */
export function dragMesh(mesh: Pt[], u: number, v: number, d: Pt): Pt[] {
  const bu = bern(u), bv = bern(v);
  let s2 = 0;
  const w: number[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const k = bu[i]! * bv[j]!; w.push(k); s2 += k * k; }
  return mesh.map((p, k) => ({ x: p.x + (d.x * w[k]!) / s2, y: p.y + (d.y * w[k]!) / s2 }));
}

/** Approximate (u,v) of a document point on the warp surface / quad (coarse search + refine). */
export function locate(map: (u: number, v: number) => Pt, p: Pt): { u: number; v: number; d: number } {
  let best = { u: 0.5, v: 0.5, d: Infinity };
  const N = 16;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const q = map(i / N, j / N); const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) best = { u: i / N, v: j / N, d };
  }
  let step = 1 / N;
  for (let it = 0; it < 12; it++) {
    step /= 2;
    for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const u = Math.max(0, Math.min(1, best.u + du)), v = Math.max(0, Math.min(1, best.v + dv));
      const q = map(u, v); const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best.d) best = { u, v, d };
    }
  }
  return best;
}

export function pointInQuad(q: Pt[], p: Pt) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i]!, b = q[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** Draw src (its region `b`, located at document `b`) into ctx using the transform state. */
export function drawTransformed(ctx: CanvasRenderingContext2D, src: CanvasImageSource, b: Rect, ox: number, oy: number, t: TfState, quality: 'live' | 'final', smooth: boolean) {
  const q = t.quad;
  ctx.imageSmoothingEnabled = smooth;
  if (!t.mesh && isParallelogram(q)) {
    const a = (q[1]!.x - q[0]!.x) / b.w, bb = (q[1]!.y - q[0]!.y) / b.w;
    const c = (q[3]!.x - q[0]!.x) / b.h, d = (q[3]!.y - q[0]!.y) / b.h;
    ctx.save();
    ctx.transform(a, bb, c, d, q[0]!.x - a * b.x - c * b.y, q[0]!.y - bb * b.x - d * b.y);
    ctx.drawImage(src, ox, oy);
    ctx.restore();
    return;
  }
  const map = t.mesh ? patch(t.mesh) : homography(q);
  const n = quality === 'final' ? 40 : t.mesh ? 14 : 10;
  const grid: Pt[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) grid.push(map(i / n, j / n));
  const cw = b.w / n, ch = b.h / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p00 = grid[j * (n + 1) + i]!, p10 = grid[j * (n + 1) + i + 1]!, p01 = grid[(j + 1) * (n + 1) + i]!, p11 = grid[(j + 1) * (n + 1) + i + 1]!;
    const sx = b.x + i * cw, sy = b.y + j * ch;
    tri(ctx, src, ox, oy, sx, sy, sx + cw, sy, sx, sy + ch, p00, p10, p01, cw, ch);
    tri(ctx, src, ox, oy, sx + cw, sy + ch, sx, sy + ch, sx + cw, sy, p11, p01, p10, cw, ch);
  }
}

function tri(ctx: CanvasRenderingContext2D, src: CanvasImageSource, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, d0: Pt, d1: Pt, d2: Pt, cw: number, ch: number) {
  // inflate destination triangle slightly to hide seams
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  const inf = (p: Pt) => { const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / l) * 0.6, y: p.y + (dy / l) * 0.6 }; };
  const e0 = inf(d0), e1 = inf(d1), e2 = inf(d2);
  const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(den) < 1e-9) return;
  const a = ((d1.x - d0.x) * (y2 - y0) - (d2.x - d0.x) * (y1 - y0)) / den;
  const b = ((d1.y - d0.y) * (y2 - y0) - (d2.y - d0.y) * (y1 - y0)) / den;
  const c = ((d2.x - d0.x) * (x1 - x0) - (d1.x - d0.x) * (x2 - x0)) / den;
  const d = ((d2.y - d0.y) * (x1 - x0) - (d1.y - d0.y) * (x2 - x0)) / den;
  const e = d0.x - a * x0 - c * y0, f = d0.y - b * x0 - d * y0;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  const sx = Math.min(x0, x1, x2), sy = Math.min(y0, y1, y2);
  const pad = 1;
  ctx.drawImage(src, sx - ox - pad, sy - oy - pad, cw + pad * 2, ch + pad * 2, sx - pad, sy - pad, cw + pad * 2, ch + pad * 2);
  ctx.restore();
}

export const mapQuad = (q: Pt[], f: (p: Pt) => Pt) => q.map(f);
export const rotateAbout = (c: Pt, deg: number) => { const r = (deg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r); return (p: Pt) => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * si, y: c.y + (p.x - c.x) * si + (p.y - c.y) * co }); };
