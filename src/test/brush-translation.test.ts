import { expect, it } from 'vitest';
import { sanitizeBrushDef, translateCustomJsonBrush, translateProcreateBrush } from '@/components/paint/brush-translator';
import presets from '@/components/paint/painter-brushes.json';

it('loads all 175 provided brushes including the repaired Hard Round JSON', () => {
  expect(presets).toHaveLength(175);
  expect(presets.some((p) => p.path === 'brushes/hard_round.json')).toBe(true);
});
it('uses the provided Pencil spacing and softness rather than one universal stamp', () => {
  const preset = presets.find((p) => p.path === 'brushes/2b_pencil.json');
  if (!preset) throw new Error('Missing supplied pencil');
  const brush = translateCustomJsonBrush(preset.data);
  expect(brush.spacing).toBeCloseTo(0.077778697);
  expect(brush.hardness).toBeCloseTo(0.796874985);
  expect(brush.flow).toBeCloseTo(0.4017);
});
it('maps actual Procreate Plain Stitch archive spacing and pressure', () => {
  const brush = translateProcreateBrush({ name: 'Plain Stitch', plotSpacing: 0.5507699847, dynamicsPressureSize: 0, maxSize: 0.492417991, tipImage: 'data:image/png;base64,AAAA' });
  expect(brush.spacing).toBeCloseTo(0.5507699847);
  expect(brush.sizePressure).toBe(0);
  expect(brush.maxSize).toBeCloseTo(246.2089955);
  expect(brush.tipImage).toBe('data:image/png;base64,AAAA');
});
it('rejects nonfinite brush values through safe defaults', () => {
  expect(sanitizeBrushDef({ spacing: Infinity }).spacing).toBe(0.06);
});
it('maps Procreate Brush Studio keys one-to-one', () => {
  const brush = translateProcreateBrush({
    name: 'Inky', plotSpacing: 0.25, plotSmoothing: 0.42, plotJitter: 0.1, dynamicsFalloff: 0.3,
    taperStartLength: 0.2, taperEndLength: 0.35, taperSize: 0.7, taperOpacity: 0.6,
    shapeCount: 4, shapeCountJitter: 0.3, shapeRoundness: 0.65, shapeFlipX: true, shapeRandomise: true,
    textureDepth: 0.8, textureMovement: 1, textureRotation: 0.5,
    dynamicsLoad: 0.8, dynamicsMix: 0.35, dynamicsWetAccumulation: 0.45, renderingFlow: 0.5,
    dynamicsWetEdges: 0.15, dynamicsBurntEdges: 0.25,
    pencilPressureSize: 0.9, pencilPressureOpacity: 0.4, pencilTiltOpacity: 0.2,
    dynamicsSpeedSize: -0.5, dynamicsJitterSize: 0.1,
  }, 'Inky folder', 'My Set');
  expect(brush.name).toBe('Inky');
  expect(brush.category).toBe('My Set');
  expect(brush.spacing).toBe(0.25);
  expect(brush.streamline).toBe(42);
  expect(brush.jitterLateral).toBe(0.1);
  expect(brush.falloff).toBe(0.3);
  expect(brush.taper).toBe(0.2);
  expect(brush.taperEnd).toBe(0.35);
  expect(brush.taperSize).toBe(0.7);
  expect(brush.taperOpacity).toBe(0.6);
  expect(brush.shapeCount).toBe(4);
  expect(brush.shapeCountJitter).toBe(0.3);
  expect(brush.roundness).toBe(0.65);
  expect(brush.shapeFlipX).toBe(true);
  expect(brush.rotateRandom).toBe(true);
  expect(brush.grain).toBe(0.8);
  expect(brush.grainMode).toBe('moving');
  expect(brush.grainRotation).toBe(90);
  expect(brush.charge).toBe(0.8);
  expect(brush.dilution).toBe(0.35);
  expect(brush.attack).toBe(0.45);
  expect(brush.flow).toBe(0.5);
  expect(brush.wetEdges).toBe(0.15);
  expect(brush.burntEdges).toBe(0.25);
  expect(brush.sizePressure).toBe(0.9);
  expect(brush.opacityPressure).toBe(0.4);
  expect(brush.tiltOpacity).toBe(0.2);
  expect(brush.speedSize).toBe(-0.5);
  expect(brush.jitter).toBe(0.1);
});

it('falls back to Procreate defaults and never crashes on odd values', () => {
  const brush = translateProcreateBrush({ plotSpacing: 'nope', shapeCount: Infinity, textureDepth: null });
  expect(brush.spacing).toBe(0.06);
  expect(brush.shapeCount).toBe(1);
  expect(brush.grain).toBe(0);
  expect(brush.grainMode).toBe('texturized');
});

it('pack brushes only pay for canvas pickup when they are wet and keep angle jitter as rotation, not scatter', async () => {
  const { translateCustomJsonBrush } = await import('@/components/paint/brush-translator');
  const b = translateCustomJsonBrush({ 'blend-properties': { 'smudge-amount': 0.5, 'mix-wet': false }, 'jitter-properties': { angle: 0.5, scatter: 0.08 }, 'head-properties': { flow: 0.4 } }, 'x.json');
  expect(b.pull).toBe(0);
  expect(b.scatter).toBeCloseTo(0.08);
  expect(b.shapeScatter).toBe(0.5);
  expect(b.grain).toBe(0);
});
