import { expect, it } from 'vitest';
import { brushComposite, mixPaint, renderModeFactor, seededRng } from '@/components/paint/brushes';
import { DEFAULT_PREFS } from '@/components/paint/settings';

it('replays identical randomness for the same seed (end taper keeps the stroke)', () => {
  const a = seededRng(42), b = seededRng(42);
  const xs = Array.from({ length: 5 }, () => a());
  expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
  expect(seededRng(43)()).not.toBe(xs[0]);
});
it('maps Procreate rendering blend modes to canvas modes', () => {
  expect(brushComposite('Multiply')).toBe('multiply');
  expect(brushComposite('linear dodge')).toBe('lighter');
  expect(brushComposite(undefined)).toBe('source-over');
});
it('builds up less with light glaze and more with intense blending', () => {
  expect(renderModeFactor('light-glaze')).toBeLessThan(1);
  expect(renderModeFactor('glaze')).toBe(1);
  expect(renderModeFactor('intense-blending')).toBeGreaterThan(renderModeFactor('blending'));
});
it('pulls the picked-up colour into the paint by the pull amount', () => {
  expect(mixPaint('#000000', '#ffffff', 0)).toBe('#000000');
  expect(mixPaint('#000000', null, 1)).toBe('#000000');
  expect(mixPaint('#000000', '#ffffff', 0.5)).toBe('#808080');
});
it('has Pocket gestures on by default except fit-to-screen pinch; QuickMenu on', () => {
  expect([DEFAULT_PREFS.gTapUndo, DEFAULT_PREFS.gTapRedo, DEFAULT_PREFS.gScrubClear, DEFAULT_PREFS.gSwipeCopy, DEFAULT_PREFS.gFullscreen]).toEqual([true, true, true, true, true]);
  expect(DEFAULT_PREFS.gQuickPinch).toBe(false);
  expect(DEFAULT_PREFS.quickMenu).toBe(true);
  expect(DEFAULT_PREFS.quickMenuGesture).toBe('three-swipe-up');
});
