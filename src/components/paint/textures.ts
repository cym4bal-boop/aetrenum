// Canvas paper textures. Source photos are CC0 from ambientCG (ambientcg.com),
// levelled so white paper stays near white and only the grain multiplies in.
import watercolor from '@/assets/textures/watercolor-paper.jpg.asset.json';
import recycled from '@/assets/textures/recycled-paper.jpg.asset.json';
import crumpled from '@/assets/textures/crumpled-paper.jpg.asset.json';
import kraft from '@/assets/textures/kraft-paper.jpg.asset.json';
import kraftLined from '@/assets/textures/kraft-lined.jpg.asset.json';
import linen from '@/assets/textures/linen-canvas.jpg.asset.json';
import weave from '@/assets/textures/canvas-weave.jpg.asset.json';
import cardboard from '@/assets/textures/cardboard.jpg.asset.json';
import type { Texture } from './doc';

export type TextureDef = { id: string; name: string; url: string; strength: number };

export const textures: TextureDef[] = [
  { id: 'watercolor', name: 'Watercolor Paper', url: watercolor.url, strength: 0.9 },
  { id: 'recycled', name: 'Recycled Paper', url: recycled.url, strength: 0.75 },
  { id: 'crumpled', name: 'Crumpled Paper', url: crumpled.url, strength: 0.8 },
  { id: 'linen', name: 'Linen Canvas', url: linen.url, strength: 0.7 },
  { id: 'weave', name: 'Canvas Weave', url: weave.url, strength: 0.55 },
  { id: 'kraft', name: 'Kraft Paper', url: kraft.url, strength: 0.85 },
  { id: 'kraft-lined', name: 'Ribbed Kraft', url: kraftLined.url, strength: 0.8 },
  { id: 'cardboard', name: 'Cardboard', url: cardboard.url, strength: 0.8 },
];

const cache = new Map<string, Promise<HTMLImageElement>>();
export function loadTexture(id: string): Promise<HTMLImageElement> | null {
  const def = textures.find((t) => t.id === id);
  if (!def) return null;
  let p = cache.get(id);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = def.url;
    });
    cache.set(id, p);
  }
  return p;
}

export async function resolveTexture(t: { id: string; strength: number } | null | undefined): Promise<Texture | null> {
  if (!t) return null;
  const p = loadTexture(t.id);
  if (!p) return null;
  try {
    const img = await p;
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, strength: t.strength };
  } catch { return null; }
}
