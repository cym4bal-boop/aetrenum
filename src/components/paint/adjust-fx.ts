// @ts-nocheck -- pixel loops index typed arrays heavily.
/* Procreate Pocket 5 adjustment effects. Every effect renders in place on a canvas
 * from a plain params object, so destructive adjustments and live adjustment
 * layers share exactly the same maths. `amount` (0–100) is the canvas-swipe %. */
import { adjustHsbPixel } from './hsb-adjustment';

export type Pt01 = { x: number; y: number };
export type CurvePoint = { x: number; y: number };
export type GradientStop = { pos: number; color: string };
export type Gradient = { id: string; name: string; stops: GradientStop[] };

/* ------------------------------------------------------------------ helpers */
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cx2 = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / Math.max(1e-6, b - a)); return t * t * (3 - 2 * t); };
function copyOf(src: HTMLCanvasElement) { const c = mk(src.width, src.height); c.getContext('2d')!.drawImage(src, 0, 0); return c; }
export function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let filterOk: boolean | null = null;
/** Real feature test: some engines accept ctx.filter as an expando without rendering it. */
function canvasFilterWorks() {
  if (filterOk !== null) return filterOk;
  try {
    const c = mk(9, 9); const x = c.getContext('2d', { willReadFrequently: true })!;
    x.filter = 'blur(2px)'; x.fillStyle = '#000'; x.fillRect(4, 4, 1, 1);
    filterOk = x.getImageData(1, 4, 1, 1).data[3] > 0;
  } catch { filterOk = false; }
  return filterOk;
}

/** Box blur along a vector by repeated doubling: log2(taps) GPU draws, exact uniform average. */
function lineBlur(src: HTMLCanvasElement, ux: number, uy: number, length: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  if (length < 0.75) return copyOf(src);
  const k = Math.max(1, Math.min(7, Math.ceil(Math.log2(length / 1.25))));
  const n = 1 << k, s = length / n;
  let a = mk(w, h), b = mk(w, h);
  a.getContext('2d')!.drawImage(src, -ux * (length - s) / 2, -uy * (length - s) / 2);
  for (let i = 0; i < k; i++) {
    const off = s * (1 << i);
    const bx = b.getContext('2d')!;
    bx.globalCompositeOperation = 'source-over'; bx.globalAlpha = 1; bx.clearRect(0, 0, w, h);
    bx.globalAlpha = 0.5; bx.drawImage(a, 0, 0);
    bx.globalCompositeOperation = 'lighter'; bx.drawImage(a, ux * off, uy * off);
    bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    [a, b] = [b, a];
  }
  return a;
}

/** Gaussian-like blur (radius ≈ 2σ). Uses ctx.filter where it really renders, else 3× box. */
export function blurred(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius < 0.4) return copyOf(src);
  if (canvasFilterWorks()) {
    const pad = Math.ceil(radius * 2);
    const out = mk(src.width, src.height); const x = out.getContext('2d')!;
    x.filter = `blur(${radius / 2}px)`;
    // edge-extend by drawing the image itself so borders don't fade to transparent
    x.drawImage(src, 0, 0); x.filter = 'none';
    void pad; return out;
  }
  let c = src;
  const L = Math.max(1, radius);
  for (let i = 0; i < 3; i++) { c = lineBlur(c, 1, 0, L); c = lineBlur(c, 0, 1, L); }
  return c;
}

function zoomBlur(src: HTMLCanvasElement, cx: number, cy: number, zoom: number, dir: null | { x: number; y: number }) {
  const w = src.width, h = src.height;
  if (zoom <= 1.0005) return copyOf(src);
  const steps = 6, n = 1 << steps;
  const xf = (c: CanvasRenderingContext2D, f: number) => {
    if (!dir) { c.translate(cx, cy); c.scale(f, f); c.translate(-cx, -cy); return; }
    const ux = dir.x, uy = dir.y, k = f - 1;
    // anisotropic scale only along the arrow direction, anchored on the disc
    const a = 1 + k * ux * ux, b = k * ux * uy, d = 1 + k * uy * uy;
    c.translate(cx, cy); c.transform(a, b, b, d, 0, 0); c.translate(-cx, -cy);
  };
  let a = mk(w, h), b = mk(w, h);
  { const x = a.getContext('2d')!; x.save(); xf(x, Math.pow(zoom, -0.5)); x.drawImage(src, 0, 0); x.restore(); }
  for (let i = 0; i < steps; i++) {
    const f = Math.pow(zoom, (1 << i) / n);
    const x = b.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, w, h);
    x.globalAlpha = 0.5; x.drawImage(a, 0, 0);
    x.globalCompositeOperation = 'lighter'; x.save(); xf(x, f); x.drawImage(a, 0, 0); x.restore();
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    [a, b] = [b, a];
  }
  return a;
}

function sampler(d: Uint8ClampedArray, w: number, h: number) {
  return (x: number, y: number, ch: number) => {
    x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = d[(y0 * w + x0) * 4 + ch], b = d[(y0 * w + x1) * 4 + ch], c = d[(y1 * w + x0) * 4 + ch], e = d[(y1 * w + x1) * 4 + ch];
    return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  };
}

/* ------------------------------------------------------------------ curves */
/** Monotone cubic (Fritsch–Carlson) curve through up to 11 nodes → 256 LUT. */
export function curveLut(pts?: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const p = [...(pts && pts.length >= 2 ? pts : [{ x: 0, y: 0 }, { x: 1, y: 1 }])].sort((a, b) => a.x - b.x);
  const n = p.length;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, p[i + 1].x - p[i].x); m[i] = (p[i + 1].y - p[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    let y: number;
    if (x <= p[0].x) y = p[0].y; else if (x >= p[n - 1].x) y = p[n - 1].y;
    else {
      let i = 0; while (i < n - 2 && x > p[i + 1].x) i++;
      const hh = dx[i], u = (x - p[i].x) / hh, u2 = u * u, u3 = u2 * u;
      y = (2 * u3 - 3 * u2 + 1) * p[i].y + (u3 - 2 * u2 + u) * hh * t[i] + (-2 * u3 + 3 * u2) * p[i + 1].y + (u3 - u2) * hh * t[i + 1];
    }
    lut[v] = clamp255(Math.round(clamp01(y) * 255));
  }
  return lut;
}

export function gradientLut(stops: GradientStop[]): Uint8ClampedArray {
  const c = mk(256, 1); const x = cx2(c);
  const g = x.createLinearGradient(0, 0, 256, 0);
  [...stops].sort((a, b) => a.pos - b.pos).forEach((s) => g.addColorStop(clamp01(s.pos), s.color));
  x.fillStyle = g; x.fillRect(0, 0, 256, 1);
  return x.getImageData(0, 0, 256, 1).data;
}

/* ------------------------------------------------------------------ noise */
function makePerm(seed: number) { const r = mulberry(seed); const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } const out = new Uint8Array(512); for (let i = 0; i < 512; i++) out[i] = p[i & 255]; return out; }
const G2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
function perlin(perm: Uint8Array, x: number, y: number) {
  const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
  const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const g = (h: number, dx: number, dy: number) => { const v = G2[h & 7]; return v[0] * dx + v[1] * dy; };
  const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
  const u = f(xf), v = f(yf);
  const x1 = g(aa, xf, yf) + (g(ba, xf - 1, yf) - g(aa, xf, yf)) * u;
  const x2 = g(ab, xf, yf - 1) + (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1)) * u;
  return (x1 + (x2 - x1) * v) * 0.7071; // ~[-1,1]
}
const noiseCache = new Map<string, Uint8ClampedArray>();
function noiseField(w: number, h: number, p: any): Uint8ClampedArray {
  const key = [w, h, p.type, p.scale, p.octaves, p.turbulence, !!p.multi].join('|');
  const hit = noiseCache.get(key); if (hit) return hit;
  const maxSide = Math.max(w, h);
  const feature = 1.2 + Math.pow(p.scale / 100, 2) * maxSide * 0.35;
  const step = Math.max(1, Math.floor(feature / 3));
  const sw = Math.ceil(w / step), sh = Math.ceil(h / step);
  const oct = 1 + Math.round((p.octaves / 100) * 7);
  const turb = (p.turbulence / 100) * 2.2;
  const perms = [makePerm(11), makePerm(23), makePerm(37)];
  const warp = makePerm(91);
  const small = new ImageData(sw, sh);
  const sd = small.data;
  const chans = p.multi ? 3 : 1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let nx = (x * step) / feature, ny = (y * step) / feature;
    if (turb > 0) { const wx = perlin(warp, nx * 0.5, ny * 0.5), wy = perlin(warp, nx * 0.5 + 5.2, ny * 0.5 + 1.3); nx += wx * turb; ny += wy * turb; }
    for (let c = 0; c < chans; c++) {
      let sum = 0, amp = 1, fr = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        let v = perlin(perms[c], nx * fr + c * 17.1, ny * fr + o * 3.7);
        if (p.type === 'billows') v = Math.abs(v) * 2 - 1;
        else if (p.type === 'ridges') { v = 1 - Math.abs(v); v = v * v * 2 - 1; }
        sum += v * amp; norm += amp; amp *= 0.5; fr *= 2;
      }
      const val = clamp255(128 + (sum / norm) * 160);
      const i = (y * sw + x) * 4;
      if (chans === 1) { sd[i] = sd[i + 1] = sd[i + 2] = val; } else sd[i + c] = val;
    }
    sd[(y * sw + x) * 4 + 3] = 255;
  }
  const sc = mk(sw, sh); sc.getContext('2d')!.putImageData(small, 0, 0);
  const big = mk(w, h); const bx = cx2(big); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
  bx.drawImage(sc, 0, 0, sw * step, sh * step);
  const data = bx.getImageData(0, 0, w, h).data;
  if (noiseCache.size > 6) noiseCache.clear();
  noiseCache.set(key, data);
  return data;
}

/* ------------------------------------------------------------------ render */
export function renderAdjustment(canvas: HTMLCanvasElement, name: string, params: any) {
  const p = params ?? {};
  const w = canvas.width, h = canvas.height, maxSide = Math.max(w, h);
  const ctx = cx2(canvas);
  const a = Math.max(0, Math.min(100, Number(p.amount ?? 0))) / 100;
  const replace = (src: HTMLCanvasElement, keepAlphaFrom?: HTMLCanvasElement) => {
    const keep = keepAlphaFrom ? copyOf(keepAlphaFrom) : null;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(src, 0, 0); ctx.restore();
    if (keep) { ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(keep, 0, 0); ctx.restore(); }
  };

  switch (name) {
    case 'Gaussian Blur': {
      if (a <= 0) return;
      replace(blurred(canvas, Math.pow(a, 1.5) * maxSide * 0.045));
      return;
    }
    case 'Motion Blur': {
      if (a <= 0) return;
      const ang = ((p.angle ?? 0) * Math.PI) / 180;
      replace(lineBlur(canvas, Math.cos(ang), Math.sin(ang), Math.pow(a, 1.3) * maxSide * 0.12));
      return;
    }
    case 'Perspective Blur': {
      if (a <= 0) return;
      const cx = (p.x ?? 0.5) * w, cy = (p.y ?? 0.5) * h;
      const zoom = 1 + Math.pow(a, 1.2) * 0.35;
      if (p.mode === 'directional') {
        const ang = ((p.direction ?? 0) * Math.PI) / 180;
        const u = { x: Math.cos(ang), y: Math.sin(ang) };
        const blur = zoomBlur(canvas, cx, cy, zoom, u);
        // only the side the arrow points to is blurred
        const m = cx2(blur); m.save(); m.globalCompositeOperation = 'destination-in';
        const R = maxSide * 0.25;
        const g = m.createLinearGradient(cx, cy, cx + u.x * R, cy + u.y * R);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        m.fillStyle = g; m.fillRect(0, 0, w, h); m.restore();
        ctx.drawImage(blur, 0, 0);
      } else replace(zoomBlur(canvas, cx, cy, zoom, null));
      return;
    }
    case 'Bloom': {
      if (a <= 0) return;
      const src = ctx.getImageData(0, 0, w, h); const d = src.data;
      const bright = new ImageData(w, h); const bd = bright.data;
      const tr = (p.transition ?? 50) / 100;
      const thr = 1 - a;
      const knee = 0.04 + (1 - tr) * 0.9;
      for (let i = 0; i < d.length; i += 4) {
        const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const m = smooth(thr - knee * 0.5, thr + knee * 0.5, L) * (d[i + 3] / 255);
        bd[i] = d[i]; bd[i + 1] = d[i + 1]; bd[i + 2] = d[i + 2]; bd[i + 3] = 255 * m;
      }
      const bc = mk(w, h); bc.getContext('2d')!.putImageData(bright, 0, 0);
      const glow = cx2(blurred(bc, (0.004 + Math.pow((p.size ?? 50) / 100, 1.4) * 0.07) * maxSide)).getImageData(0, 0, w, h).data;
      const gain = 0.35 + ((p.burn ?? 50) / 100) * 2.6;
      for (let i = 0; i < d.length; i += 4) {
        const ga = glow[i + 3] / 255;
        for (let c = 0; c < 3; c++) {
          const base = d[i + c] / 255, g = clamp01((glow[i + c] / 255) * ga * gain);
          d[i + c] = 255 * (1 - (1 - base) * (1 - g));
        }
        d[i + 3] = Math.max(d[i + 3], Math.min(255, glow[i + 3] * gain));
      }
      ctx.putImageData(src, 0, 0);
      return;
    }
  }

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  switch (name) {
    case 'Hue, Saturation, Brightness': {
      const hu = ((p.hue ?? 50) - 50) * 3.6, sa = ((p.saturation ?? 50) - 50) * 2, br = ((p.brightness ?? 50) - 50) * 2;
      if (!hu && !sa && !br) return;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const [r, g, b] = adjustHsbPixel(d[i], d[i + 1], d[i + 2], hu, sa, br);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      break;
    }
    case 'Color Balance': {
      const v = (arr: any, k: number) => (((arr?.[k] ?? 50) - 50) / 50);
      const cr = [0, 1, 2].map((k) => v(p.cyanRed, k)), mg = [0, 1, 2].map((k) => v(p.magentaGreen, k)), yb = [0, 1, 2].map((k) => v(p.yellowBlue, k));
      if (![...cr, ...mg, ...yb].some(Boolean)) return;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const sh = Math.exp(-((L / 0.3) ** 2)), hi = Math.exp(-(((1 - L) / 0.3) ** 2)), mid = Math.max(0, 1 - sh - hi);
        const wts = [sh, mid, hi];
        let dr = 0, dg = 0, db = 0;
        for (let k = 0; k < 3; k++) { dr += cr[k] * wts[k]; dg += mg[k] * wts[k]; db += yb[k] * wts[k]; }
        let nr = clamp255(r + dr * 110), ng = clamp255(g + dg * 110), nb = clamp255(b + db * 110);
        // Procreate keeps luminosity while shifting the balance
        const L2 = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;
        if (L2 > 0.002) { const k = L / L2; nr = clamp255(nr * k); ng = clamp255(ng * k); nb = clamp255(nb * k); }
        d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
      }
      break;
    }
    case 'Curves': {
      const c = p.curves ?? {};
      const G = curveLut(c.gamma ?? c.composite), R = curveLut(c.red), Gr = curveLut(c.green), B = curveLut(c.blue);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        d[i] = R[G[d[i]]]; d[i + 1] = Gr[G[d[i + 1]]]; d[i + 2] = B[G[d[i + 2]]];
      }
      break;
    }
    case 'Gradient Map': {
      if (a <= 0 || !p.stops?.length) return;
      const lut = gradientLut(p.stops);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const L = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * 4;
        d[i] += (lut[L] - d[i]) * a; d[i + 1] += (lut[L + 1] - d[i + 1]) * a; d[i + 2] += (lut[L + 2] - d[i + 2]) * a;
      }
      break;
    }
    case 'Noise': {
      if (a <= 0) return;
      const n = noiseField(w, h, { type: p.type ?? 'clouds', scale: p.scale ?? 20, octaves: p.octaves ?? 30, turbulence: p.turbulence ?? 0, multi: !!p.multi });
      const additive = p.additive !== false;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        for (let c = 0; c < 3; c++) {
          d[i + c] = additive ? clamp255(d[i + c] + (n[i + c] - 128) * 1.6 * a) : d[i + c] + (n[i + c] - d[i + c]) * a;
        }
      }
      break;
    }
    case 'Sharpen': {
      if (a <= 0) return;
      const b = cx2(blurred(canvas, 2 + maxSide * 0.0012)).getImageData(0, 0, w, h).data;
      const k = a * 2.2;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        for (let c = 0; c < 3; c++) d[i + c] = clamp255(d[i + c] + (d[i + c] - b[i + c]) * k);
      }
      break;
    }
    case 'Halftone': {
      if (a <= 0) return;
      halftone(d, w, h, a, p.style ?? 'full-color', maxSide, canvas);
      break;
    }
    case 'Chromatic Aberration': {
      if (a <= 0 && p.mode !== 'displace') return;
      const orig = new Uint8ClampedArray(d);
      if (p.mode === 'displace') {
        const ox = p.dx ?? 0, oy = p.dy ?? 0;
        if (!ox && !oy) return;
        const len = Math.hypot(ox, oy);
        const srcC = (p.blur ?? 0) > 0 ? cx2(blurred(canvas, (p.blur / 100) * len * 0.8)).getImageData(0, 0, w, h).data : orig;
        const S = sampler(srcC, w, h);
        const op = 1 - (p.transparency ?? 0) / 100;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = S(x - ox, y - oy, 0), b = S(x + ox, y + oy, 2);
          d[i] = orig[i] + (r - orig[i]) * op; d[i + 2] = orig[i + 2] + (b - orig[i + 2]) * op;
          d[i + 3] = Math.max(orig[i + 3], (S(x - ox, y - oy, 3) * op), (S(x + ox, y + oy, 3) * op));
        }
      } else {
        const fx = (p.x ?? 0.5) * w, fy = (p.y ?? 0.5) * h;
        const s = Math.pow(a, 1.2) * 0.045;
        const tr = (p.transition ?? 50) / 100, fo = (p.falloff ?? 0) / 100;
        const srcC = tr < 0.99 ? cx2(blurred(canvas, (1 - tr) * s * maxSide * 0.6)).getImageData(0, 0, w, h).data : orig;
        const S = sampler(srcC, w, h);
        const maxD = Math.hypot(Math.max(fx, w - fx), Math.max(fy, h - fy)) || 1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const dx = x - fx, dy = y - fy, dd = Math.hypot(dx, dy) / maxD;
          const m = smooth(fo * 0.95, fo * 0.95 + 0.12 + tr * 0.1, dd);
          if (m <= 0) continue;
          const k = s * m;
          d[i] = S(fx + dx * (1 - k), fy + dy * (1 - k), 0);
          d[i + 2] = S(fx + dx * (1 + k), fy + dy * (1 + k), 2);
          d[i + 3] = Math.max(orig[i + 3], S(fx + dx * (1 - k), fy + dy * (1 - k), 3), S(fx + dx * (1 + k), fy + dy * (1 + k), 3));
        }
      }
      break;
    }
    case 'Glitch': {
      if (a <= 0) return;
      ctx.putImageData(image, 0, 0);
      glitch(canvas, a, p);
      return;
    }
    default:
      return;
  }
  ctx.putImageData(image, 0, 0);
}

/* ------------------------------------------------------------------ halftone */
function halftone(d: Uint8ClampedArray, w: number, h: number, a: number, style: string, maxSide: number, canvas: HTMLCanvasElement) {
  const cell = 3 + Math.pow(a, 1.25) * maxSide * 0.035;
  // cell-averaged colour lookup (smoothly downsampled copy)
  const sw = Math.max(1, Math.round(w / cell * 2)), sh = Math.max(1, Math.round(h / cell * 2));
  const small = mk(sw, sh); const sx = cx2(small); sx.imageSmoothingQuality = 'high'; sx.drawImage(canvas, 0, 0, sw, sh);
  const sd = sx.getImageData(0, 0, sw, sh).data;
  const look = (x: number, y: number, c: number) => { const ix = Math.max(0, Math.min(sw - 1, Math.floor(x / w * sw))), iy = Math.max(0, Math.min(sh - 1, Math.floor(y / h * sh))); return sd[(iy * sw + ix) * 4 + c] / 255; };
  const screens = style === 'newspaper' ? [{ ang: 45, ch: 'k' }] : [{ ang: 15, ch: 'c' }, { ang: 75, ch: 'm' }, { ang: 0, ch: 'y' }, { ang: 45, ch: 'k' }];
  const trig = screens.map((s) => ({ ...s, c: Math.cos((s.ang * Math.PI) / 180), s: Math.sin((s.ang * Math.PI) / 180) }));
  const aa = 0.9;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    let R = 1, G = 1, B = 1;
    for (const s of trig) {
      // rotate into screen space, find the cell centre, rotate back to sample the image there
      const u = (x * s.c + y * s.s) / cell, v = (-x * s.s + y * s.c) / cell;
      const cu = Math.floor(u) + 0.5, cv = Math.floor(v) + 0.5;
      const px = (cu * s.c - cv * s.s) * cell, py = (cu * s.s + cv * s.c) * cell;
      const r = look(px, py, 0), g = look(px, py, 1), b = look(px, py, 2);
      let ink: number;
      const k = 1 - Math.max(r, g, b);
      if (s.ch === 'k') ink = style === 'newspaper' ? 1 - (0.299 * r + 0.587 * g + 0.114 * b) : k;
      else { const base = s.ch === 'c' ? r : s.ch === 'm' ? g : b; ink = k >= 1 ? 0 : (1 - base - k) / (1 - k); }
      const rad = Math.sqrt(Math.max(0, ink)) * 0.7071;
      const dist = Math.hypot(u - cu, v - cv);
      const cover = clamp01((rad - dist) * cell / aa + 0.5);
      if (cover <= 0) continue;
      if (s.ch === 'c') R *= 1 - cover; else if (s.ch === 'm') G *= 1 - cover; else if (s.ch === 'y') B *= 1 - cover; else { R *= 1 - cover; G *= 1 - cover; B *= 1 - cover; }
    }
    if (style === 'full-color') {
      // magazine look: the artwork's own colour stays visible behind the dots
      const or = d[i] / 255, og = d[i + 1] / 255, ob = d[i + 2] / 255;
      const bgR = 0.55 + or * 0.45, bgG = 0.55 + og * 0.45, bgB = 0.55 + ob * 0.45;
      d[i] = 255 * R * bgR; d[i + 1] = 255 * G * bgG; d[i + 2] = 255 * B * bgB;
    } else { d[i] = 255 * R; d[i + 1] = 255 * G; d[i + 2] = 255 * B; }
  }
}

/* ------------------------------------------------------------------ glitch */
function glitch(canvas: HTMLCanvasElement, a: number, p: any) {
  const w = canvas.width, h = canvas.height, maxSide = Math.max(w, h);
  const ctx = cx2(canvas);
  const src = copyOf(canvas);
  const mode = p.mode ?? 'artifact';
  const rnd = mulberry(mode === 'artifact' ? 101 : mode === 'wave' ? 202 : mode === 'signal' ? 303 : 404);
  const q = p[mode] ?? {};
  const zoom = 1 + ((q.zoom ?? 0) / 100) * 6;
  const strip = (y: number, hh: number, dx: number) => { ctx.clearRect(0, y, w, hh); ctx.drawImage(src, 0, y, w, hh, dx, y, w, hh); };
  const blocks = (count: number, sizeT: number, op?: string, fill?: () => string) => {
    for (let i = 0; i < count; i++) {
      const bw = (0.02 + sizeT * 0.25) * maxSide * (0.4 + rnd()) * zoom * 0.6, bh = bw * (0.15 + rnd() * 0.5);
      const x = rnd() * w, y = rnd() * h, dx = (rnd() - 0.5) * bw * 1.6, dy = (rnd() - 0.5) * bh * 0.6;
      ctx.clearRect(x + dx, y + dy, bw, bh);
      ctx.drawImage(src, x, y, bw, bh, x + dx, y + dy, bw, bh);
      if (op && fill) { ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = fill(); ctx.fillRect(x + dx, y + dy, bw, bh); ctx.restore(); }
    }
  };
  if (mode === 'artifact') {
    const lines = Math.round(a * h * 0.06);
    for (let i = 0; i < lines; i++) { const y = rnd() * h, hh = Math.max(1, (1 + rnd() * 2) * zoom); strip(y, hh, (rnd() - 0.5) * w * 0.06 * a); }
    blocks(Math.round(((q.amount ?? 0) / 100) * 80 * a), (q.blockSize ?? 0) / 100);
  } else if (mode === 'wave') {
    const amp = ((q.amplitude ?? 0) / 100) * w * 0.08 * a, freq = ((q.frequency ?? 0) / 100) * 0.06;
    if (!amp || !freq) return;
    const band = Math.max(1, Math.round(1 + ((q.zoom ?? 0) / 100) * maxSide * 0.02));
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += band) strip(y, band, Math.sin(y * freq * (2048 / maxSide)) * amp + Math.sin(y * freq * 0.37) * amp * 0.4);
  } else if (mode === 'signal') {
    const amt = (q.amount ?? 0) / 100;
    if (!amt && !(q.blockSize ?? 0)) return;
    ctx.save(); ctx.globalAlpha = 0.5 * a; ctx.drawImage(src, maxSide * 0.004 * a * zoom, 0); ctx.restore();
    let y = 0;
    while (y < h) { const hh = Math.max(1, (1 + rnd() * 6) * zoom); if (rnd() < amt * a) strip(y, hh, (rnd() - 0.3) * w * 0.03 * a); y += hh; }
    blocks(Math.round(((q.blockSize ?? 0) / 100) * 50 * a), (q.blockSize ?? 0) / 100, 'color', () => (rnd() < 0.5 ? '#808080' : `hsl(${(rnd() * 360) | 0} 90% 50%)`));
  } else if (mode === 'diverge') {
    const k = maxSide * 0.03 * a / 100;
    const r = (q.red ?? 0) * k, g = (q.green ?? 0) * k, b = (q.blue ?? 0) * k;
    const sd = cx2(src).getImageData(0, 0, w, h).data;
    const img = ctx.getImageData(0, 0, w, h); const d = img.data;
    const S = sampler(sd, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = S(x - r, y - r, 0); d[i + 1] = S(x - g, y + g, 1); d[i + 2] = S(x, y - b, 2);
      d[i + 3] = Math.max(S(x - r, y - r, 3), S(x - g, y + g, 3), S(x, y - b, 3));
    }
    ctx.putImageData(img, 0, 0);
    const lines = Math.round(Math.abs(q.green ?? 0) / 100 * a * h * 0.03);
    const shifted = copyOf(canvas);
    for (let i = 0; i < lines; i++) { const y = rnd() * h, hh = Math.max(1, (1 + rnd() * 4) * zoom); ctx.clearRect(0, y, w, hh); ctx.drawImage(shifted, 0, y, w, hh, (rnd() - 0.5) * Math.abs(g) * 6, y, w, hh); }
  }
}
