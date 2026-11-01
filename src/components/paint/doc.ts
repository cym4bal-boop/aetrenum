// @ts-nocheck -- strict index checks relaxed for canvas pixel code.
import type { BlendMode } from './storage';
import { applyCanvasEffect } from './canvas-ops';

export type LayerMeta = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  locked: boolean;
  alphaLock: boolean;
  /** pixel = paintable layer, adjust = live adjustment layer, group = folder */
  kind?: 'pixel' | 'adjust' | 'group';
  parent?: string;
  collapsed?: boolean;
  /** clipping mask: only shows where the layer below it has pixels */
  clip?: boolean;
  adjust?: { name: string; value: number; params?: Record<string, unknown> };
  /** live (non-rasterized) text: pixels are rendered from this until the user rasterizes */
  text?: { draft: import('./text').TextDraft; color: string };
};
export type LayerState = LayerMeta & { canvas: HTMLCanvasElement };

export const blendModes: { mode: BlendMode; label: string; short: string }[] = [
  { mode: 'source-over', label: 'Normal', short: 'N' },
  { mode: 'multiply', label: 'Multiply', short: 'M' },
  { mode: 'darken', label: 'Darken', short: 'D' },
  { mode: 'color-burn', label: 'Color Burn', short: 'Cb' },
  { mode: 'lighten', label: 'Lighten', short: 'L' },
  { mode: 'screen', label: 'Screen', short: 'S' },
  { mode: 'color-dodge', label: 'Color Dodge', short: 'Cd' },
  { mode: 'lighter', label: 'Add', short: 'A' },
  { mode: 'overlay', label: 'Overlay', short: 'O' },
  { mode: 'soft-light', label: 'Soft Light', short: 'Sl' },
  { mode: 'hard-light', label: 'Hard Light', short: 'Hl' },
  { mode: 'difference', label: 'Difference', short: 'Di' },
  { mode: 'exclusion', label: 'Exclusion', short: 'E' },
  { mode: 'hue', label: 'Hue', short: 'H' },
  { mode: 'saturation', label: 'Saturation', short: 'Sa' },
  { mode: 'color', label: 'Color', short: 'C' },
  { mode: 'luminosity', label: 'Luminosity', short: 'Lu' },
];
export const blendShort = (m: BlendMode) => blendModes.find((b) => b.mode === m)?.short ?? 'N';

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement) {
  return c.getContext('2d', { willReadFrequently: false })!;
}

export type Floating = { layerId: string; canvas: HTMLCanvasElement; matrix: DOMMatrix };
export type LiveStroke = { layerId: string; canvas: HTMLCanvasElement; alpha: number; clip: Path2D | null; alphaLock: boolean; blend?: GlobalCompositeOperation };

export type Texture = { image: CanvasImageSource; width: number; height: number; strength: number };

const pool = new Map<string, HTMLCanvasElement>();
function pooled(key: string, w: number, h: number) {
  const k = `${key}:${w}x${h}`;
  let c = pool.get(k);
  if (!c) { c = makeCanvas(w, h); pool.set(k, c); }
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.clearRect(0, 0, w, h);
  return c;
}

type Opts = { stroke?: LiveStroke | null; floating?: Floating | null; texture?: Texture | null };

/** A layer's own pixels (folders rendered flat), at full opacity, with any live stroke / transform. */
function content(l: LayerState, all: LayerState[], opts: Opts, depth: number, w: number, h: number, slot: string): HTMLCanvasElement {
  if ((l.kind ?? 'pixel') === 'group') {
    const buf = pooled(`${slot}g${depth}`, w, h);
    renderList(buf, all, all.filter((x) => x.parent === l.id), opts, depth + 1);
    return buf;
  }
  const f = opts.floating && opts.floating.layerId === l.id ? opts.floating : null;
  const s = opts.stroke && opts.stroke.layerId === l.id ? opts.stroke : null;
  if (!f && !s) return l.canvas;
  const buf = pooled(`${slot}p${depth}`, w, h);
  const c = buf.getContext('2d')!;
  c.drawImage(l.canvas, 0, 0);
  if (f) { c.save(); c.setTransform(f.matrix); c.drawImage(f.canvas, 0, 0); c.restore(); }
  if (s) {
    c.save();
    if (s.clip) c.clip(s.clip, 'evenodd');
    c.globalAlpha = s.alpha;
    if (s.alphaLock) c.globalCompositeOperation = 'source-atop';
    else if (s.blend) c.globalCompositeOperation = s.blend;
    c.drawImage(s.canvas, 0, 0);
    c.restore();
  }
  return buf;
}

/** Renders `items` (top first, all siblings) bottom-up into target. Clipping-mask
 *  layers sit above a base layer and only show where the base has pixels. */
function renderList(target: HTMLCanvasElement, all: LayerState[], items: LayerState[], opts: Opts, depth: number) {
  const ctx = target.getContext('2d')!;
  const w = target.width, h = target.height;
  for (let i = items.length - 1; i >= 0; i--) {
    const l = items[i];
    const kind = l.kind ?? 'pixel';
    if (kind === 'adjust') {
      if (!l.visible) continue;
      const a = l.adjust;
      if (!a || a.value <= 0) continue;
      const fx = pooled(`a${depth}`, w, h);
      fx.getContext('2d')!.drawImage(target, 0, 0);
      applyCanvasEffect(fx, a.name, a.value, a.params);
      ctx.save();
      if (l.opacity >= 0.999 && l.blend === 'source-over') {
        ctx.globalCompositeOperation = 'copy';
      } else {
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blend;
      }
      ctx.drawImage(fx, 0, 0);
      ctx.restore();
      continue;
    }
    // clipping layers stacked directly above this base
    const clips: LayerState[] = [];
    let j = i - 1;
    while (j >= 0 && items[j].clip && (items[j].kind ?? 'pixel') !== 'adjust') { clips.push(items[j]); j--; }
    const skipTo = j + 1; // next loop iteration continues below the clips
    if (!l.visible) { i = skipTo; continue; }
    let src = content(l, all, opts, depth, w, h, 'b');
    const live = clips.filter((c) => c.visible && c.opacity > 0);
    if (live.length) {
      const base = pooled(`cb${depth}`, w, h);
      const bc = base.getContext('2d')!;
      bc.drawImage(src, 0, 0);
      const tmp = pooled(`ct${depth}`, w, h);
      const tc = tmp.getContext('2d')!;
      for (const c of live) {
        tc.globalCompositeOperation = 'source-over'; tc.globalAlpha = 1;
        tc.clearRect(0, 0, w, h);
        tc.drawImage(content(c, all, opts, depth, w, h, 'c'), 0, 0);
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(src === l.canvas ? l.canvas : content(l, all, opts, depth, w, h, 'm'), 0, 0);
        bc.save();
        bc.globalAlpha = c.opacity;
        bc.globalCompositeOperation = c.blend;
        bc.drawImage(tmp, 0, 0);
        bc.restore();
      }
      src = base;
    }
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    i = skipTo;
  }
}

/** Draws the paper texture over the artwork (multiply), tiled at a doc-relative scale. */
export function drawTexture(ctx: CanvasRenderingContext2D, t: Texture, w: number, h: number) {
  const scale = Math.max(0.5, Math.max(w, h) / 2048);
  const tw = t.width * scale, th = t.height * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = t.strength;
  for (let y = 0; y < h; y += th) for (let x = 0; x < w; x += tw) ctx.drawImage(t.image, x, y, tw, th);
  ctx.restore();
}

/** Draws every visible layer (bottom first, folders and adjustment layers included)
 *  plus any in-progress stroke or transform onto ctx. */
export function composite(
  ctx: CanvasRenderingContext2D,
  layers: LayerState[],
  background: string,
  backgroundVisible: boolean,
  opts: Opts = {},
) {
  const w = layers[0]?.canvas.width ?? 0, h = layers[0]?.canvas.height ?? 0;
  if (!w || !h) return;
  const acc = pooled('root', w, h);
  const actx = acc.getContext('2d')!;
  if (backgroundVisible) {
    actx.fillStyle = background;
    actx.fillRect(0, 0, w, h);
  }
  renderList(acc, layers, layers.filter((l) => !l.parent), opts, 0);
  if (opts.texture && backgroundVisible) drawTexture(actx, opts.texture, w, h);
  ctx.drawImage(acc, 0, 0);
}

/** Composite into a new canvas scaled to fit maxSide (for thumbnails and exports). */
export function flatten(layers: LayerState[], background: string, backgroundVisible: boolean, maxSide = Infinity, texture: Texture | null = null) {
  const w = layers[0].canvas.width, h = layers[0].canvas.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const out = makeCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const c = ctx2d(out);
  c.scale(s, s);
  composite(c, layers, background, backgroundVisible, { texture });
  return out;
}

export function isEmpty(canvas: HTMLCanvasElement) {
  const small = makeCanvas(64, 64);
  const c = small.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(canvas, 0, 0, 64, 64);
  const d = c.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
  return true;
}
