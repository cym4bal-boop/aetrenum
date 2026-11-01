// @ts-nocheck -- strict index checks relaxed for canvas pixel code.
import { hexToRgb } from './color';

/** Default "smart gap" radius (px) for a canvas: small gaps in line art up to
 *  roughly twice this size are bridged so the fill doesn't leak through. */
export const autoGap = (w: number, h: number) => Math.max(2, Math.min(10, Math.round(Math.min(w, h) / 320)));

/**
 * Flood-fill mask with Procreate-style gap closing.
 * 1. Pixels that don't match the seed colour are "walls".
 * 2. Walls are thickened by `gap` px so small openings close.
 * 3. The region is flooded inside the thickened walls.
 * 4. The fill is regrown by `gap` px through matching pixels so it reaches the real lines again.
 * Falls back to a plain fill when the seed sits inside a thickened wall.
 */
export function fillMask(src: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, threshold: number, gap = 0): Uint8Array {
  const i0 = (sy * w + sx) * 4;
  const tr = src[i0], tg = src[i0 + 1], tb = src[i0 + 2], ta = src[i0 + 3];
  const tol = (threshold / 100) * 255;
  const N = w * h;
  const open = new Uint8Array(N);
  for (let o = 0, p = 0; o < N; o++, p += 4) {
    const a = src[p + 3];
    open[o] = ta < 8
      ? (a <= tol * 0.9 + 4 ? 1 : 0)
      : (Math.abs(a - ta) <= tol + 4 && Math.abs(src[p] - tr) <= tol + 4 && Math.abs(src[p + 1] - tg) <= tol + 4 && Math.abs(src[p + 2] - tb) <= tol + 4 ? 1 : 0);
  }
  let pass = open;
  const r = Math.max(0, Math.floor(gap));
  if (r > 0) {
    // separable square dilation of the walls (1 - open)
    const rowWall = new Uint8Array(N);
    const pre = new Int32Array(Math.max(w, h) + 1);
    for (let y = 0; y < h; y++) {
      const base = y * w;
      for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + (open[base + x] ? 0 : 1);
      for (let x = 0; x < w; x++) {
        const a = Math.max(0, x - r), b = Math.min(w, x + r + 1);
        rowWall[base + x] = pre[b] - pre[a] > 0 ? 1 : 0;
      }
    }
    const shrunk = new Uint8Array(N);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + rowWall[y * w + x];
      for (let y = 0; y < h; y++) {
        const a = Math.max(0, y - r), b = Math.min(h, y + r + 1);
        shrunk[y * w + x] = pre[b] - pre[a] > 0 ? 0 : 1;
      }
    }
    if (shrunk[sy * w + sx]) pass = shrunk;
  }
  const mask = flood(pass, w, h, sx, sy);
  if (pass !== open) {
    // regrow through the original open pixels, up to r steps
    let frontier: number[] = [];
    for (let o = 0; o < N; o++) if (mask[o]) frontier.push(o);
    for (let step = 0; step < r && frontier.length; step++) {
      const next: number[] = [];
      for (const o of frontier) {
        const x = o % w, y = (o - x) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] || !open[q]) continue;
          mask[q] = 1; next.push(q);
        }
      }
      frontier = next;
    }
  }
  return mask;
}

function flood(pass: Uint8Array, w: number, h: number, sx: number, sy: number) {
  const mask = new Uint8Array(w * h);
  if (!pass[sy * w + sx]) return mask;
  const stack = [sx, sy];
  while (stack.length) {
    const cy = stack.pop()!;
    let cx = stack.pop()!;
    let o = cy * w + cx;
    while (cx >= 0 && !mask[o] && pass[o]) { cx--; o--; }
    cx++; o++;
    let up = false, down = false;
    while (cx < w && !mask[o] && pass[o]) {
      mask[o] = 1;
      if (cy > 0) { const m = !mask[o - w] && pass[o - w] === 1; if (m && !up) stack.push(cx, cy - 1); up = m; }
      if (cy < h - 1) { const m = !mask[o + w] && pass[o + w] === 1; if (m && !down) stack.push(cx, cy + 1); down = m; }
      cx++; o++;
    }
  }
  return mask;
}

/**
 * ColorDrop flood fill. Reads boundaries from `sample`, paints into `target`.
 * threshold is 0-100 (%). gap is the smart gap-closing radius in px
 * (defaults to an automatic size). Returns false when nothing was filled.
 */
export function colorDrop(
  target: HTMLCanvasElement,
  sample: HTMLCanvasElement,
  x: number,
  y: number,
  hex: string,
  threshold: number,
  clip: Path2D | null,
  alphaLock: boolean,
  gap?: number,
  edgeDetect = true,
) {
  const w = sample.width, h = sample.height;
  const sx = Math.floor(x), sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
  const sctx = sample.getContext('2d', { willReadFrequently: true })!;
  const src = sctx.getImageData(0, 0, w, h).data;
  const actualGap = edgeDetect ? (gap ?? autoGap(w, h)) : 0;
  const mask = fillMask(src, w, h, sx, sy, threshold, actualGap);
  // Grow the mask by one pixel only if edgeDetect is on
  const fill = hexToRgb(hex);
  const out = new ImageData(w, h);
  const d = out.data;
  let any = false;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const o = yy * w + xx;
      const hit = edgeDetect
        ? (mask[o] || (xx > 0 && mask[o - 1]) || (xx < w - 1 && mask[o + 1]) || (yy > 0 && mask[o - w]) || (yy < h - 1 && mask[o + w]))
        : mask[o];
      if (!hit) continue;
      any = true;
      const p = o * 4;
      d[p] = fill.r; d[p + 1] = fill.g; d[p + 2] = fill.b; d[p + 3] = 255;
    }
  }
  if (!any) return false;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d')!.putImageData(out, 0, 0);
  const tctx = target.getContext('2d')!;
  tctx.save();
  if (clip) tctx.clip(clip, 'evenodd');
  if (alphaLock) tctx.globalCompositeOperation = 'source-atop';
  tctx.drawImage(tmp, 0, 0);
  tctx.restore();
  return true;
}
