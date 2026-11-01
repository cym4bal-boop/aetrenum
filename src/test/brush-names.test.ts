import { describe, expect, it } from 'vitest';
import { cleanBrushName } from '@/components/paint/brushes';

describe('brush names have no pack tags', () => {
  it('drops a "· Pack" suffix', () => expect(cleanBrushName('Blending Knife · Classic')).toBe('Blending Knife'));
  it('drops a bullet suffix', () => expect(cleanBrushName('Ink • Deevad')).toBe('Ink'));
  it('drops a Deevad prefix', () => expect(cleanBrushName('Deevad Pencil 2B')).toBe('Pencil 2B'));
  it('drops a MyPaint prefix', () => expect(cleanBrushName('MyPaint Dry Brush')).toBe('Dry Brush'));
  it('keeps plain names', () => expect(cleanBrushName('Studio Pen')).toBe('Studio Pen'));
});
