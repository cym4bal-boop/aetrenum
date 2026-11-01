import { expect, it } from 'vitest';
import { discPoint, discValues } from '../components/paint/color';

it('keeps initial HSV selections inside the inner disc at all extremes', () => {
  for (const s of [0, .25, .5, .75, 1]) for (const v of [0, .25, .5, .75, 1]) {
    const p = discPoint(s, v, 83);
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(83.000001);
  }
});
it('preserves the selected colour when its inner knob is touched', () => {
  for (const s of [0, .25, .5, .75, 1]) for (const v of [0, .25, .5, .75, 1]) {
    const p = discPoint(s, v, 83), selected = discValues(p.x, p.y, 83);
    expect(selected.s).toBeCloseTo(s); expect(selected.v).toBeCloseTo(v);
  }
});