/* "Apply palette to layer": every pixel snaps to its nearest palette colour
 * (alpha is kept), so the layer only uses colours from the palette. */
import { hexToRgb } from './color';

export function nearestColor(r: number, g: number, b: number, pal: [number, number, number][]): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i]!;
    // weighted RGB distance (closer to perceived difference than plain RGB)
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Remaps RGBA pixel data in place. Returns how many pixels changed. */
export function mapToPalette(data: Uint8ClampedArray, colors: string[]): number {
  const pal = colors.map((c) => { const { r, g, b } = hexToRgb(c); return [Math.round(r), Math.round(g), Math.round(b)] as [number, number, number]; });
  if (!pal.length) return 0;
  const cache = new Map<number, number>();
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    let idx = cache.get(key);
    if (idx === undefined) { idx = nearestColor(data[i]!, data[i + 1]!, data[i + 2]!, pal); cache.set(key, idx); }
    const p = pal[idx]!;
    if (data[i] !== p[0] || data[i + 1] !== p[1] || data[i + 2] !== p[2]) changed++;
    data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2];
  }
  return changed;
}
