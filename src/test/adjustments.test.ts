import { expect, it } from 'vitest';
import { ADJUSTMENT_GROUPS, ADJUSTMENT_LIST, DEFAULT_GRADIENTS, defaultParams, layerValueOf, normalizeParams, usesSwipe } from '@/components/paint/adjust-defs';
import { curveLut } from '@/components/paint/adjust-fx';
import { isGhostArtwork } from '@/components/paint/storage';

it('has the fifteen Procreate Pocket adjustments in four groups', () => {
  expect(ADJUSTMENT_LIST).toHaveLength(15);
  expect(ADJUSTMENT_GROUPS.map((g) => g.items.length)).toEqual([4, 3, 6, 2]);
  expect(ADJUSTMENT_GROUPS[3]!.items).toEqual(['Liquify', 'Clone']);
});
it('ships the eight Gradient Map library presets', () => {
  expect(DEFAULT_GRADIENTS.map((g) => g.name)).toEqual(['Mystic', 'Breeze', 'Instant', 'Venice', 'Blaze', 'Neon', 'Noir', 'Mocha']);
});
it('starts swipe adjustments at 0%', () => {
  for (const n of ['Gaussian Blur', 'Motion Blur', 'Perspective Blur', 'Noise', 'Sharpen', 'Bloom', 'Glitch', 'Halftone', 'Chromatic Aberration']) {
    expect(defaultParams(n)['amount']).toBe(0);
    expect(usesSwipe(n)).toBe(true);
  }
});
it('drives HSB, Color Balance and Curves by their own controls, always on as a layer', () => {
  expect(usesSwipe('Curves')).toBe(false);
  expect(layerValueOf('Hue, Saturation, Brightness', defaultParams('Hue, Saturation, Brightness'))).toBe(100);
  expect(layerValueOf('Gaussian Blur', { amount: 37 })).toBe(37);
});
it('keeps older signed HSB layers looking the same', () => {
  const p = normalizeParams('Hue, Saturation, Brightness', { hue: 0, saturation: 0, brightness: 0 });
  expect([p['hue'], p['saturation'], p['brightness']]).toEqual([50, 50, 50]);
});
it('leaves an untouched curve as identity and bends a lifted midpoint upward', () => {
  const id = curveLut([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  expect(id[0]).toBe(0); expect(id[128]).toBe(128); expect(id[255]).toBe(255);
  const lift = curveLut([{ x: 0, y: 0 }, { x: 0.5, y: 0.75 }, { x: 1, y: 1 }]);
  expect(lift[128]).toBeGreaterThan(180);
});
it('treats never-opened empty canvases as removable placeholders', () => {
  expect(isGhostArtwork({ id: 'a', title: 'Untitled Artwork', width: 1500, height: 500, created: 0, updated: 0, layers: [{ id: 'l', name: 'Layer 1', visible: true }] })).toBe(true);
  expect(isGhostArtwork({ id: 'b', title: 'Mine', width: 10, height: 10, created: 0, updated: 0, layers: [{ id: 'l', name: 'Layer 1', visible: true }], preview: 'data:x' })).toBe(false);
});
