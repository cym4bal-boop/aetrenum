// @ts-nocheck -- loose optional types for file-format plumbing, like the other pixel modules.
/* File formats: ZIP (layers as PNGs, groups as folders), PSD (via ag-psd) and
 * .arnm — the app's own format that keeps everything a flat image can't:
 * layer tree, adjustment layers, clipping masks, undo/redo history, palettes,
 * canvas settings and the active selection. An .arnm file is a zip with a
 * manifest.json plus PNG blobs. */
import JSZip from 'jszip';
import { readPsd, writePsd, type Layer as PsdLayer } from 'ag-psd';
import { canvasToBlob, clampSize, loadImage, makeId, type Artwork, type BlendMode, type StoredLayer } from './storage';
import { readPackedHistory, writePackedHistory, type PackedHistory } from './history-store';
import { composite, ctx2d, makeCanvas, type LayerState } from './doc';

export const ARNM_VERSION = 1;
const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Layer';
const pad = (n: number) => String(n).padStart(3, '0');

/* ---------- shared helpers ---------- */

export async function layerCanvases(a: Artwork): Promise<LayerState[]> {
  const out: LayerState[] = [];
  for (const l of a.layers) {
    const canvas = makeCanvas(a.width, a.height);
    if (l.image) { try { ctx2d(canvas).drawImage(await loadImage(l.image), 0, 0, a.width, a.height); } catch { /* broken */ } }
    out.push({ ...l, canvas, visible: l.visible !== false, opacity: l.opacity ?? 1, blend: l.blend ?? 'source-over', locked: !!l.locked, alphaLock: !!l.alphaLock } as LayerState);
  }
  return out;
}

async function previewOf(layers: LayerState[], w: number, h: number, bg: string, bgVisible: boolean) {
  const s = Math.min(1, 1400 / Math.max(w, h));
  const p = makeCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const c = ctx2d(p); c.scale(s, s);
  if (layers.length) composite(c, layers, bg, bgVisible);
  else if (bgVisible) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  return p.toDataURL('image/jpeg', 0.92);
}

async function finishArtwork(title: string, w: number, h: number, layers: StoredLayer[], extra: Partial<Artwork> = {}): Promise<Artwork> {
  const now = Date.now();
  const a: Artwork = { id: makeId(), title, width: w, height: h, created: now, updated: now, background: '#ffffff', backgroundVisible: true, layers, ...extra };
  if (!a.layers.length) a.layers = [{ id: makeId(), name: 'Layer 1', visible: true }];
  a.preview = await previewOf(await layerCanvases(a), w, h, a.background ?? '#ffffff', a.backgroundVisible ?? true);
  return a;
}

const baseName = (f: { name: string }) => f.name.replace(/\.[^.]+$/, '') || 'Imported';

/* ---------- ZIP ---------- */

/** Exports layers as PNGs; groups become folders. Names are prefixed bottom-first (001 = bottom). */
export async function exportZip(a: Artwork): Promise<Blob> {
  const zip = new JSZip();
  const layers = await layerCanvases(a);
  const walk = (folder: JSZip, parent: string | undefined) => {
    const kids = layers.filter((l) => (l.parent ?? undefined) === parent && (l.kind ?? 'pixel') !== 'adjust');
    kids.slice().reverse().forEach((l, i) => {
      const name = `${pad(i + 1)} ${safe(l.name)}`;
      if (l.kind === 'group') walk(folder.folder(name)!, l.id);
      else folder.file(`${name}.png`, canvasToBlob(l.canvas));
    });
  };
  walk(zip, undefined);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

type ZNode = { name: string; children: Map<string, ZNode>; file?: JSZip.JSZipObject };

/** Imports a zip: each image becomes a layer, each folder a group (folders nest one level, deeper ones flatten). */
export async function importZip(file: Blob & { name: string }): Promise<Artwork> {
  const zip = await JSZip.loadAsync(file);
  let root: ZNode = { name: '', children: new Map() };
  zip.forEach((path, entry) => {
    if (path.startsWith('__MACOSX') || path.split('/').some((p) => p.startsWith('.'))) return;
    const parts = path.split('/').filter(Boolean);
    if (!entry.dir && !IMG.test(path)) return;
    let n = root;
    parts.forEach((p, i) => {
      if (!n.children.has(p)) n.children.set(p, { name: p, children: new Map() });
      n = n.children.get(p)!;
      if (i === parts.length - 1 && !entry.dir) n.file = entry;
    });
  });
  // unwrap a single wrapping folder
  while (root.children.size === 1 && ![...root.children.values()][0]!.file) root = [...root.children.values()][0]!;

  // decode images, figure canvas size
  const imgs = new Map<ZNode, HTMLImageElement>();
  const collect = async (n: ZNode) => { for (const c of n.children.values()) { if (c.file) { try { imgs.set(c, await loadImage(await c.file.async('blob'))); } catch { /* skip */ } } else await collect(c); } };
  await collect(root);
  if (!imgs.size) throw new Error('No images in that zip');
  let mw = 1, mh = 1;
  for (const im of imgs.values()) { mw = Math.max(mw, im.naturalWidth); mh = Math.max(mh, im.naturalHeight); }
  const { width, height } = clampSize(mw, mh);
  const s = Math.min(1, width / mw);

  const out: StoredLayer[] = [];
  const sorted = (n: ZNode) => [...n.children.values()].sort((x, y) => y.name.localeCompare(x.name, undefined, { numeric: true })); // top first
  const clean = (n: string) => n.replace(IMG, '').replace(/^\d{1,4}[ _-]+/, '') || 'Layer';
  const emitImage = async (n: ZNode, parent?: string, prefix = '') => {
    const im = imgs.get(n); if (!im) return;
    const c = makeCanvas(width, height);
    ctx2d(c).drawImage(im, 0, 0, im.naturalWidth * s, im.naturalHeight * s);
    out.push({ id: makeId(), name: prefix + clean(n.name), visible: true, opacity: 1, blend: 'source-over', parent, image: await canvasToBlob(c) });
  };
  const flatInto = async (n: ZNode, parent: string, prefix: string) => {
    for (const c of sorted(n)) { if (c.file) await emitImage(c, parent, prefix); else await flatInto(c, parent, `${prefix}${clean(c.name)} / `); }
  };
  for (const c of sorted(root)) {
    if (c.file) await emitImage(c);
    else {
      const gid = makeId();
      out.push({ id: gid, name: clean(c.name), visible: true, opacity: 1, blend: 'source-over', kind: 'group' });
      await flatInto(c, gid, '');
    }
  }
  return finishArtwork(baseName(file), width, height, out, { backgroundVisible: false });
}

/* ---------- PSD ---------- */

const toPsdBlend: Partial<Record<BlendMode, string>> = {
  'source-over': 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color-dodge': 'color dodge', 'color-burn': 'color burn', 'hard-light': 'hard light', 'soft-light': 'soft light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', lighter: 'linear dodge',
};
const fromPsdBlend = Object.fromEntries(Object.entries(toPsdBlend).map(([k, v]) => [v, k])) as Record<string, BlendMode>;

export async function exportPsd(a: Artwork): Promise<Blob> {
  const layers = await layerCanvases(a);
  const build = (parent: string | undefined): PsdLayer[] => layers
    .filter((l) => (l.parent ?? undefined) === parent && (l.kind ?? 'pixel') !== 'adjust')
    .slice().reverse() // PSD children are bottom first
    .map((l) => ({
      name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: (toPsdBlend[l.blend] ?? 'normal') as PsdLayer['blendMode'], clipping: !!l.clip,
      ...(l.kind === 'group' ? { children: build(l.id), opened: !l.collapsed } : { canvas: l.canvas, left: 0, top: 0 }),
    }));
  const children = build(undefined);
  if (a.backgroundVisible !== false) {
    const bg = makeCanvas(a.width, a.height); const c = ctx2d(bg); c.fillStyle = a.background ?? '#ffffff'; c.fillRect(0, 0, a.width, a.height);
    children.unshift({ name: 'Background', canvas: bg, left: 0, top: 0 });
  }
  const flat = makeCanvas(a.width, a.height);
  composite(ctx2d(flat), layers, a.background ?? '#ffffff', a.backgroundVisible !== false);
  const buf = writePsd({ width: a.width, height: a.height, children, canvas: flat });
  return new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
}

export async function importPsd(file: Blob & { name: string }): Promise<Artwork> {
  const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true });
  const { width, height } = clampSize(psd.width, psd.height);
  const s = width / psd.width;
  const out: StoredLayer[] = [];
  const pix = async (l: PsdLayer, parent?: string, prefix = '') => {
    const c = makeCanvas(width, height);
    if (l.canvas) ctx2d(c).drawImage(l.canvas as HTMLCanvasElement, (l.left ?? 0) * s, (l.top ?? 0) * s, (l.canvas.width) * s, (l.canvas.height) * s);
    out.push({ id: makeId(), name: prefix + (l.name || 'Layer'), visible: !l.hidden, opacity: l.opacity ?? 1, blend: fromPsdBlend[l.blendMode ?? 'normal'] ?? 'source-over', clip: !!l.clipping, parent, image: await canvasToBlob(c) });
  };
  const flatInto = async (kids: PsdLayer[], parent: string, prefix: string) => {
    for (const k of kids.slice().reverse()) { if (k.children) await flatInto(k.children, parent, `${prefix}${k.name} / `); else await pix(k, parent, prefix); }
  };
  const top = psd.children ?? [];
  for (const l of top.slice().reverse()) {
    if (l.children) {
      const gid = makeId();
      out.push({ id: gid, name: l.name || 'Group', visible: !l.hidden, opacity: l.opacity ?? 1, blend: 'source-over', kind: 'group', collapsed: l.opened === false });
      await flatInto(l.children, gid, '');
    } else await pix(l);
  }
  if (!out.length && psd.canvas) await pix({ name: 'Image', canvas: psd.canvas, left: 0, top: 0 });
  return finishArtwork(baseName(file), width, height, out, { backgroundVisible: false });
}

/* ---------- .arnm ---------- */

export type ArnmExtras = {
  palettes?: { id: string; name: string; colors: string[] }[];
  selection?: { outlines: { x: number; y: number }[][]; inverted: boolean } | null;
};
type Manifest = {
  format: 'arnm'; version: number;
  artwork: Omit<Artwork, 'layers' | 'preview'> & { layers: Omit<StoredLayer, 'image'>[] };
  history: { undo: unknown[]; redo: unknown[] } | null;
} & ArnmExtras;

export async function exportArnm(a: Artwork, extras: ArnmExtras = {}): Promise<Blob> {
  const zip = new JSZip();
  const { preview, layers, ...rest } = a;
  const metaLayers = layers.map(({ image: _img, ...m }) => m);
  for (const l of layers) {
    if (!l.image) continue;
    const blob = typeof l.image === 'string' ? await (await fetch(l.image)).blob() : l.image;
    zip.file(`layers/${l.id}.png`, blob);
  }
  if (preview) zip.file('preview.jpg', await (await fetch(preview)).blob());
  const h = await readPackedHistory(a.id);
  let history: Manifest['history'] = null;
  if (h) {
    let n = 0;
    const pack = (list: PackedHistory['undo']) => list.map((e) => ({
      ...e, pixels: e.pixels.map((p) => { const path = `history/${n++}.png`; zip.file(path, p.blob); return { id: p.id, rect: p.rect, path }; }),
    }));
    history = { undo: pack(h.undo), redo: pack(h.redo) };
  }
  const manifest: Manifest = { format: 'arnm', version: ARNM_VERSION, artwork: { ...rest, layers: metaLayers }, history, ...extras };
  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then((b) => new Blob([b], { type: 'application/x-arnm' }));
}

/** Reads an .arnm into a fresh artwork (new id) and restores its undo/redo history. */
export async function importArnm(file: Blob): Promise<{ artwork: Artwork; extras: ArnmExtras }> {
  const zip = await JSZip.loadAsync(file);
  const mf = zip.file('manifest.json');
  if (!mf) throw new Error('Not an .arnm file');
  const m = JSON.parse(await mf.async('string')) as Manifest;
  if (m.format !== 'arnm') throw new Error('Not an .arnm file');
  const layers: StoredLayer[] = [];
  for (const l of m.artwork.layers) {
    const f = zip.file(`layers/${l.id}.png`);
    layers.push({ ...l, image: f ? new Blob([await f.async('arraybuffer')], { type: 'image/png' }) : undefined });
  }
  const pv = zip.file('preview.jpg');
  const preview = pv ? `data:image/jpeg;base64,${await pv.async('base64')}` : undefined;
  const now = Date.now();
  const artwork: Artwork = { ...m.artwork, id: makeId(), layers, preview, created: m.artwork.created ?? now, updated: now, selection: m.selection ?? m.artwork.selection ?? null };
  if (!artwork.preview) artwork.preview = await previewOf(await layerCanvases(artwork), artwork.width, artwork.height, artwork.background ?? '#ffffff', artwork.backgroundVisible ?? true);
  if (m.history) {
    const unpack = async (list: unknown[]) => Promise.all((list as { pixels: { id: string; rect: never; path: string }[] }[]).map(async (e) => ({
      ...e, pixels: (await Promise.all(e.pixels.map(async (p) => { const f = zip.file(p.path); return f ? { id: p.id, rect: p.rect, blob: new Blob([await f.async('arraybuffer')], { type: 'image/png' }) } : null; }))).filter(Boolean),
    })));
    await writePackedHistory(artwork.id, { undo: await unpack(m.history.undo), redo: await unpack(m.history.redo) } as PackedHistory);
  }
  return { artwork, extras: { palettes: m.palettes, selection: m.selection ?? null } };
}

/** Routes any importable file to the right reader. */
export async function importAny(file: File): Promise<{ artwork: Artwork; extras?: ArnmExtras }> {
  const n = file.name.toLowerCase();
  if (n.endsWith('.arnm')) return importArnm(file);
  if (n.endsWith('.psd')) return { artwork: await importPsd(file) };
  if (n.endsWith('.zip') || file.type === 'application/zip') return { artwork: await importZip(file) };
  const { artworkFromImage } = await import('./storage');
  return { artwork: await artworkFromImage(file, baseName(file)) };
}
