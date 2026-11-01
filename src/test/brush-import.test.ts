import { readFileSync } from 'node:fs';
import { File as NodeFile } from 'node:buffer';
import { expect, it } from 'vitest';
import { parseAbr } from '@/components/paint/abr';
import { importBrushFile } from '@/components/paint/brush-translator';

function abrFixture(version: number, rle: boolean, sub = 1) {
  const a: number[] = [];
  const u16 = (n: number) => a.push((n >>> 8) & 255, n & 255);
  const u32 = (n: number) => a.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  u16(version); u16(version < 6 ? 1 : sub);
  if (version < 6) { u16(2); u32((version === 2 ? 8 : 0) + 34 + (rle ? 7 : 2)); u32(0); u16(25); if (version === 2) { u32(2); u16(65); u16(0); } a.push(...new Array(9).fill(0)); }
  else { a.push(...[...'8BIMsamp'].map((c) => c.charCodeAt(0))); const len = (sub === 1 ? 47 : 301) + 19 + (rle ? 7 : 2); u32(4 + Math.ceil(len / 4) * 4); u32(len); a.push(...new Array(sub === 1 ? 47 : 301).fill(0)); }
  u32(0); u32(0); u32(1); u32(2); u16(8); a.push(rle ? 1 : 0);
  if (rle) { u16(5); a.push(128, 128, 1, 0, 255); } else a.push(0, 255);
  if (version >= 6) while (a.length % 4) a.push(0);
  return new Uint8Array(a).buffer;
}

it('reads Photoshop ABR v1, v2, v6 and v7 sampled tips, raw and RLE', () => {
  for (const v of [1, 2, 6, 7]) for (const rle of [false, true]) {
    const tips = parseAbr(abrFixture(v, rle), 'Set.abr');
    expect(tips).toHaveLength(1);
    expect(tips[0]!.tipImage).toMatch(/^data:image\/png;base64,/);
  }
});

it('names v2 ABR tips from the file', () => {
  expect(parseAbr(abrFixture(2, false))[0]!.name).toBe('A');
});

it('imports a real Procreate .brush once (ignores the Reset copy)', async () => {
  const bytes = readFileSync('src/test/fixtures/Hard_Oval_Brush.brush');
  const brushes = await importBrushFile(new NodeFile([bytes], 'Hard_Oval_Brush.brush') as unknown as File);
  expect(brushes).toHaveLength(1);
  expect(brushes[0]!.spacing).toBeGreaterThan(0);
});
