import { headImage, headStyle, textureImage } from './brush-heads';
import { parseAbr } from './abr';
import JSZip from 'jszip';
import type { BrushDef } from './brushes';
import { readBrushArchive } from './procreate-plist';

/**
 * Native Aeternum Paint Brush format (.apb) wrapper.
 */
export type ApbFile = {
  version: 2;
  generator: 'AeternumPaint Studio';
  dateExported: string;
  brush: BrushDef;
};

/**
 * Downloads a brush definition as a .apb file.
 */
export function exportBrushToApb(brush: BrushDef) {
  const apb: ApbFile = {
    version: 2,
    generator: 'AeternumPaint Studio',
    dateExported: new Date().toISOString(),
    brush: {
      ...brush,
      author: brush.author || 'AeternumPaint Artist',
      dateCreated: brush.dateCreated || new Date().toLocaleDateString(),
    },
  };

  const json = JSON.stringify(apb, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (brush.name || 'brush').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  a.href = url;
  a.download = `${safeName}.apb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Quality Control sanitizer: ensures all brush parameters are safe,
 * non-stuttering, finite numbers within pleasant, responsive bounds.
 */
export function sanitizeBrushDef(b: { [K in keyof BrushDef]?: BrushDef[K] | undefined }, fallbackName = 'Imported Brush'): BrushDef {
  const clamp = (val: unknown, min: number, max: number, def: number) => {
    const n = typeof val === 'number' && Number.isFinite(val) ? val : def;
    return Math.max(min, Math.min(max, n));
  };

  const id = b.id && b.id.trim() ? b.id : `brush-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = b.name && b.name.trim() ? b.name.trim() : fallbackName;
  const category = b.category && b.category.trim() ? b.category.trim() : 'Imported';

  return {
    id,
    name,
    category,
    author: b.author || 'Imported Brush',
    dateCreated: b.dateCreated || new Date().toLocaleDateString(),
    signName: b.signName || '',

    // Stroke path
    spacing: clamp(b.spacing, 0.01, 1.2, 0.06),
    spacingJitter: clamp(b.spacingJitter, 0, 1, 0),
    jitterLateral: clamp(b.jitterLateral, 0, 1, 0),
    jitterLinear: clamp(b.jitterLinear, 0, 1, 0),
    falloff: clamp(b.falloff, 0, 1, 0),
    streamline: clamp(b.streamline, 0, 100, 30),

    // Stabilization
    stabilization: clamp(b.stabilization, 0, 100, 0),
    motionFiltering: clamp(b.motionFiltering, 0, 100, 0),

    // Taper
    taper: clamp(b.taper, 0, 1, 0.3),
    pressureTaper: clamp(b.pressureTaper, 0, 1, 0),
    touchTaper: clamp(b.touchTaper, 0, 1, 0),
    taperSize: clamp(b.taperSize, 0, 1, 0.5),
    taperOpacity: clamp(b.taperOpacity, 0, 1, 0),
    taperTip: b.taperTip === 'sharp' ? 'sharp' : 'round',

    // Shape
    tipImage: typeof b.tipImage === 'string' ? b.tipImage : undefined,
    hardness: clamp(b.hardness, 0, 1, 0.8),
    roundness: clamp(b.roundness, 0.1, 1, 1),
    angle: clamp(b.angle, -180, 180, 0),
    rotateRandom: Boolean(b.rotateRandom),
    scatter: clamp(b.scatter, 0, 2, 0),
    shapeScatter: clamp(b.shapeScatter, 0, 1, 0),
    shapeRotation: clamp(b.shapeRotation, -180, 180, 0),
    shapeFollowStroke: Boolean(b.shapeFollowStroke),
    shapeCount: Math.round(clamp(b.shapeCount, 1, 16, 1)),
    shapeCountJitter: clamp(b.shapeCountJitter, 0, 1, 0),
    shapeRandomized: Boolean(b.shapeRandomized),

    // Grain
    grain: clamp(b.grain, 0, 1, 0),
    grainScale: clamp(b.grainScale, 0.1, 3, 1),
    grainZoom: clamp(b.grainZoom, 0, 1, 0.5),
    grainDepth: clamp(b.grainDepth, 0, 1, 0.5),
    grainBlend: b.grainBlend === 'multiply' || b.grainBlend === 'overlay' ? b.grainBlend : 'normal',

    // Rendering
    renderMode: b.renderMode || 'glaze',
    flow: clamp(b.flow, 0.05, 1, 0.9),
    wetEdges: clamp(b.wetEdges, 0, 1, 0),
    burntEdges: clamp(b.burntEdges, 0, 1, 0),

    // Wet Mix
    dilution: clamp(b.dilution, 0, 1, 0),
    charge: clamp(b.charge, 0, 1, 1),
    attack: clamp(b.attack, 0, 1, 0.8),
    pull: clamp(b.pull, 0, 1, 0.5),
    grade: clamp(b.grade, 0, 1, 0.5),
    wetJitter: clamp(b.wetJitter, 0, 1, 0),

    // Color Dynamics
    stampColorJitter: clamp(b.stampColorJitter, 0, 1, 0),
    strokeColorJitter: clamp(b.strokeColorJitter, 0, 1, 0),
    colorPressure: clamp(b.colorPressure, 0, 1, 0),

    // Dynamics
    speedSize: clamp(b.speedSize, -1, 1, 0),
    speedOpacity: clamp(b.speedOpacity, -1, 1, 0),
    jitter: clamp(b.jitter, 0, 1, 0),
    jitterOpacity: clamp(b.jitterOpacity, 0, 1, 0),

    // Stylus / Pressure
    sizePressure: clamp(b.sizePressure, 0, 1, 0.6),
    opacityPressure: clamp(b.opacityPressure, 0, 1, 0),
    pressureFlow: clamp(b.pressureFlow, 0, 1, 0.5),
    pressureBleed: clamp(b.pressureBleed, 0, 1, 0),
    tiltAngle: clamp(b.tiltAngle, 0, 90, 0),
    tiltOpacity: clamp(b.tiltOpacity, 0, 1, 0),
    tiltSize: clamp(b.tiltSize, 0, 2, 0),

    // Properties
    useStampPreview: Boolean(b.useStampPreview),
    orientToScreen: Boolean(b.orientToScreen),
    previewSize: clamp(b.previewSize, 0.1, 1, 0.5),
    smudge: clamp(b.smudge, 0, 1, 0),
    minSize: clamp(b.minSize, 1, 200, 2),
    maxSize: clamp(b.maxSize, 10, 500, 80),
    minOpacity: clamp(b.minOpacity, 0, 1, 0),
    maxOpacity: clamp(b.maxOpacity, 0.1, 1, 1),

    // Procreate parity extras
    taperEnd: clamp(b.taperEnd, 0, 1, 0),
    shapeFlipX: Boolean(b.shapeFlipX),
    shapeFlipY: Boolean(b.shapeFlipY),
    shapeAzimuth: Boolean(b.shapeAzimuth),
    grainImage: typeof b.grainImage === 'string' ? b.grainImage : undefined,
    grainMode: b.grainMode === 'moving' ? 'moving' : 'texturized',
    grainRotation: clamp(b.grainRotation, -180, 180, 0),
    grainMinDepth: clamp(b.grainMinDepth, 0, 1, 0),
    grainDepthJitter: clamp(b.grainDepthJitter, 0, 1, 0),
    grainOffsetJitter: clamp(b.grainOffsetJitter, 0, 1, 0),
    grainBrightness: clamp(b.grainBrightness, -1, 1, 0),
    grainContrast: clamp(b.grainContrast, -1, 1, 0),
    grainInverted: Boolean(b.grainInverted),
    blendMode: typeof b.blendMode === 'string' ? b.blendMode : 'normal',
    luminanceBlending: Boolean(b.luminanceBlending),
    blur: clamp(b.blur, 0, 1, 0),
    blurJitter: clamp(b.blurJitter, 0, 1, 0),
    hueJitter: clamp(b.hueJitter, 0, 1, 0),
    saturationJitter: clamp(b.saturationJitter, 0, 1, 0),
    lightnessJitter: clamp(b.lightnessJitter, 0, 1, 0),
    darknessJitter: clamp(b.darknessJitter, 0, 1, 0),
    secondaryColorJitter: clamp(b.secondaryColorJitter, 0, 1, 0),
    strokeHueJitter: clamp(b.strokeHueJitter, 0, 1, 0),
    strokeSaturationJitter: clamp(b.strokeSaturationJitter, 0, 1, 0),
    strokeLightnessJitter: clamp(b.strokeLightnessJitter, 0, 1, 0),
    strokeDarknessJitter: clamp(b.strokeDarknessJitter, 0, 1, 0),
    pressureBrightness: clamp(b.pressureBrightness, -1, 1, 0),
    tiltBleed: clamp(b.tiltBleed, 0, 1, 0),
    pressureSmoothing: clamp(b.pressureSmoothing, 0, 1, 0),

    // Materials
    metallic: clamp(b.metallic, 0, 1, 0),
    roughness: clamp(b.roughness, 0, 1, 0),
  };
}

/**
 * Translates a MyPaint (.myb) JSON string or parsed object into an Aeternum BrushDef.
 */
export function translateMyPaintBrush(obj: Record<string, any>, rawName = 'MyPaint Brush'): BrushDef {
  const settings = obj['settings'] || {};
  const getVal = (key: string, def = 0): number => {
    const item = settings[key];
    if (typeof item === 'number') return item;
    if (item && typeof item.base_value === 'number') return item.base_value;
    return def;
  };

  const hasPressure = (key: string): number => {
    const item = settings[key];
    if (item?.inputs?.pressure?.length) {
      const pts = item.inputs.pressure;
      const last = pts[pts.length - 1];
      if (Array.isArray(last) && typeof last[1] === 'number') return Math.abs(last[1]);
      return 0.6;
    }
    return 0;
  };

  const hardness = Math.min(1, Math.max(0, getVal('hardness', 0.8)));
  const opaque = Math.min(1, Math.max(0.1, getVal('opaque', 0.9)));
  const dabsPerRad = getVal('dabs_per_actual_radius', 2.0);
  const spacing = Math.max(0.02, Math.min(0.8, dabsPerRad > 0 ? 0.35 / dabsPerRad : 0.08));

  const dabRatio = getVal('elliptical_dab_ratio', 1.0);
  const roundness = dabRatio > 0 ? Math.min(1, 1 / dabRatio) : 1;
  const angle = getVal('elliptical_dab_angle', 0);

  const radLog = getVal('radius_logarithmic', 2.0);
  const maxSize = Math.max(16, Math.min(300, Math.round(Math.exp(radLog) * 10)));

  const sizePres = hasPressure('radius_logarithmic') || (hasPressure('radius_by_random') ? 0.4 : 0.6);
  const opacPres = hasPressure('opaque_multiply') || hasPressure('opaque');
  const jitter = Math.min(1, Math.max(0, getVal('radius_by_random', 0)));
  const scatter = Math.min(1, Math.max(0, getVal('offset_by_random', 0)));
  const streamline = Math.round(Math.min(100, Math.max(0, getVal('slow_tracking', 0) * 100)));
  const smudge = Math.min(1, Math.max(0, getVal('smudge', 0)));

  const cleanName = (obj['parent_brush_name'] || rawName)
    .replace(/^.*[\\/]/, '')
    .replace(/\.myb$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return sanitizeBrushDef({
    name: cleanName,
    category: 'MyPaint',
    hardness,
    flow: opaque,
    spacing,
    roundness,
    angle,
    maxSize,
    sizePressure: sizePres ? 0.7 : 0.2,
    opacityPressure: opacPres ? 0.6 : 0,
    jitter,
    scatter,
    streamline,
    pull: smudge,
    smudge,
    taper: 0.3,
    grain: 0.1,
  }, cleanName);
}

/**
 * Translates the dynamics-properties/stroke-properties JSON schema (brushes2.zip) into BrushDef.
 * Heads/textures are named built-ins, rendered procedurally by brush-heads.ts.
 * Expensive engine paths (canvas pickup, grain) only switch on when the source asks for them.
 */
export function translateCustomJsonBrush(data: Record<string, any>, rawName = 'Custom Brush'): BrushDef {
  const stroke = data['stroke-properties'] || {};
  const dyn = data['dynamics-properties'] || {};
  const blend = data['blend-properties'] || {};
  const tex = data['texture-properties'] || {};
  const head = data['head-properties'] || {};
  const jit = data['jitter-properties'] || {};
  const src = data['source-properties'] || {};
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const c01 = (v: number) => Math.max(0, Math.min(1, v));

  const name = data['display-name'] || rawName.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
  const headName = String(src['custom-head'] || src['head'] || '');
  const texName = String(src['custom-stroke texture'] || src['stroke texture'] || '');
  const style = headStyle(headName);
  const sizePres = Boolean(dyn['pressure - effects size']);
  const flowPres = Boolean(dyn['pressure - effects flow']);
  const wet = Boolean(blend['mix-wet']);
  const size = n(stroke['paint-size'], 40);
  const hasTex = !!texName;
  const softness = c01(n(head['softness'], 0.1));

  return sanitizeBrushDef({
    name,
    category: 'Custom',
    spacing: Math.max(0.02, Math.min(1.2, n(head['spacing'], 0.08))),
    flow: Math.max(0.05, c01(n(head['flow'], 0.8))),
    maxOpacity: Math.max(0.05, c01(n(stroke['paint-opacity'], 1))),
    maxSize: Math.max(3, Math.min(400, Math.round(size * 1.3))),
    hardness: style === 'soft' ? Math.min(0.2, 1 - softness) : 1 - softness,
    roundness: style === 'oval' ? 0.32 : 1,
    angle: n(head['angle'], 0) * 360,
    tipImage: headImage(headName),
    orientToScreen: !!head['screen-aligned'],
    shapeFollowStroke: !!head['use-trajectory'],
    shapeScatter: c01(n(jit['angle'], 0)),
    rotateRandom: n(jit['angle'], 0) >= 0.5 && style !== 'oval',
    scatter: c01(n(jit['scatter'], 0)),
    jitter: c01(n(jit['size'], 0)),
    jitterOpacity: c01(n(jit['flow'], 0)),
    hueJitter: c01(n(jit['color-hue'], 0)),
    saturationJitter: c01(n(jit['color-saturation'], 0)),
    lightnessJitter: c01(n(jit['color-brightness'], 0)),
    strokeHueJitter: c01(n(jit['color-start hue'], 0)),
    sizePressure: sizePres ? 0.65 : 0,
    opacityPressure: flowPres ? 0.55 : 0,
    tiltOpacity: dyn['tilt - effects flow'] ? 0.3 : 0,
    tiltSize: dyn['tilt - effects size'] ? 0.4 : 0,
    speedSize: dyn['velocity - effects size'] ? -0.4 : 0,
    speedOpacity: dyn['velocity - effects flow'] ? -0.3 : 0,
    taper: sizePres ? 0.3 : 0.01,
    taperSize: sizePres ? 0.8 : 0,
    taperOpacity: 0,
    // texturized grain is punched per dab, so it needs full depth and contrast to survive dab overlap
    grain: hasTex ? Math.min(1, 0.8 + n(tex['pressure'], 0.5) * 0.2) : 0,
    grainContrast: hasTex ? 0.9 : 0,
    grainImage: hasTex ? textureImage(texName) : undefined,
    grainScale: Math.max(0.1, Math.min(3, n(tex['scale'], 1))),
    grainMode: 'texturized',
    grainInverted: !!tex['invert'],
    wetEdges: c01(n(stroke['wet-edges'], 0)),
    dilution: wet ? c01(n(blend['mix-in dilution'], 0)) : 0,
    pull: wet ? c01(n(blend['smudge-amount'], 0)) * 0.6 : 0,
    smudge: 0,
    streamline: Math.round(c01(n(stroke['lazy-stroke'], 0)) * 100),
  }, name);
}

/**
 * Translates a single Krita .kpp file (PNG with embedded preset metadata).
 */
export function translateKritaPreset(name: string, buffer: ArrayBuffer): BrushDef {
  const cleanName = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.kpp$/i, '')
    .replace(/^[a-z0-9]+\)\s*/i, '') // strip leading "b1) "
    .replace(/[-_]/g, ' ')
    .trim();

  // Inspect preset name to set realistic physical parameters
  const lower = cleanName.toLowerCase();
  let category = 'Deevad';
  let hardness = 0.8;
  let flow = 0.9;
  let grain = 0;
  let size = 60;
  let spacing = 0.05;

  if (lower.includes('airbrush')) {
    category = 'Airbrushing';
    hardness = 0.1;
    flow = 0.2;
    size = 180;
    spacing = 0.04;
  } else if (lower.includes('pencil')) {
    category = 'Sketching';
    hardness = 0.7;
    flow = 0.6;
    grain = 0.6;
    size = 25;
    spacing = 0.09;
  } else if (lower.includes('bristle') || lower.includes('painterly')) {
    category = 'Oils';
    hardness = 0.85;
    flow = 0.85;
    grain = 0.3;
    size = 90;
    spacing = 0.03;
  } else if (lower.includes('chalk')) {
    category = 'Pastels';
    hardness = 0.6;
    flow = 0.5;
    grain = 0.8;
    size = 50;
    spacing = 0.08;
  } else if (lower.includes('eraser')) {
    category = 'Pens';
    hardness = 0.9;
    flow = 1;
    size = 40;
  }

  return sanitizeBrushDef({
    name: cleanName || 'Krita Preset',
    category,
    author: 'David Revoy (Deevad)',
    hardness,
    flow,
    grain,
    maxSize: size,
    spacing,
    sizePressure: 0.75,
    opacityPressure: 0.4,
    streamline: 35,
    taper: 0.35,
  }, cleanName);
}

/**
 * Universal Brush Importer: takes any uploaded file (.apb, .myb, .kpp, .bundle, .json, .zip)
 * and translates it into an array of validated Aeternum BrushDef presets.
 */
/* ---------------- Procreate (.brush / .brushset) ----------------
 * Brush.archive is an NSKeyedArchiver plist. Key names have changed between
 * Procreate versions, so every setting is looked up through a list of known
 * aliases and then a case-insensitive fuzzy match; missing keys fall back to
 * Procreate's defaults via sanitizeBrushDef. */
type Dict = Record<string, any>;
function keyFinder(data: Dict) {
  const lower = new Map<string, any>();
  for (const [k, v] of Object.entries(data)) lower.set(k.toLowerCase(), v);
  const raw = (...keys: string[]) => {
    for (const k of keys) { if (data[k] !== undefined && data[k] !== null) return data[k]; const v = lower.get(k.toLowerCase()); if (v !== undefined && v !== null) return v; }
    return undefined;
  };
  const num = (...keys: string[]): number | undefined => {
    const v = raw(...keys);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return undefined;
  };
  const bool = (...keys: string[]): boolean | undefined => { const v = raw(...keys); if (v === undefined) return undefined; return v === true || v === 1 || v === '1' || v === 'true'; };
  /** first key matching all patterns and none of the excluded */
  const fuzzy = (all: RegExp[], none: RegExp[] = []): number | undefined => {
    for (const [k, v] of lower) if (typeof v === 'number' && all.every((r) => r.test(k)) && !none.some((r) => r.test(k))) return v;
    return undefined;
  };
  return { raw, num, bool, fuzzy };
}
const scale = (v: number | undefined, k: number, add = 0) => (v === undefined ? undefined : v * k + add);

export function translateProcreateBrush(data: Record<string, any>, rawName = 'Procreate Brush', category = 'Imported'): BrushDef {
  const { raw, num, bool, fuzzy } = keyFinder(data);
  const renderingModes = ['light-glaze', 'glaze', 'blending', 'intense-blending'] as const;
  const rm = num('renderingMode', 'renderMode', 'renderingModel');
  const textureMovement = num('textureMovement', 'grainMovement');
  const textureMode = raw('textureMode', 'grainMode', 'textureApplication');
  const rotation = num('shapeRotation');
  const name = String(raw('name', 'brushName', 'title') ?? rawName).replace(/^.*\//, '').replace(/\.brush$/i, '').trim() || rawName;
  return sanitizeBrushDef({
    name,
    category,
    author: typeof raw('authorName', 'author', 'madeBy') === 'string' ? raw('authorName', 'author', 'madeBy') : 'Procreate brush',
    signName: typeof raw('signatureName', 'signature') === 'string' ? raw('signatureName', 'signature') : '',
    tipImage: data['tipImage'],
    grainImage: data['grainImage'],

    // 1. Stroke path
    spacing: num('plotSpacing', 'spacing'),
    spacingJitter: num('plotSpacingJitter', 'spacingJitter'),
    jitterLateral: num('plotJitter', 'plotJitterLateral', 'jitterLateral'),
    jitterLinear: num('plotJitterLinear', 'jitterLinear'),
    falloff: num('dynamicsFalloff', 'plotFalloff', 'falloff'),
    streamline: scale(num('plotSmoothing', 'streamLine', 'streamline'), 100),

    // 2. Stabilization
    stabilization: scale(num('stabilizationAmount', 'plotStabilization', 'stabilization', 'stampStabilization'), 100),
    motionFiltering: scale(num('motionFilteringAmount', 'motionFiltering', 'plotMotionFiltering'), 100),

    // 3. Taper
    taper: num('taperStartLength', 'pencilTaperStartLength', 'taperStart'),
    taperEnd: num('taperEndLength', 'pencilTaperEndLength', 'taperEnd'),
    pressureTaper: num('pencilTaperStartLength', 'taperPressure', 'pressureTaper'),
    touchTaper: num('taperStartLength', 'touchTaperStartLength'),
    taperSize: num('taperSize'),
    taperOpacity: num('taperOpacity'),
    taperTip: (num('taperTip', 'taperShape', 'tipSharpness') ?? 0) > 0.5 ? 'sharp' : 'round',

    // 4. Shape
    shapeScatter: num('shapeScatter'),
    shapeRotation: scale(rotation, 180),
    shapeFollowStroke: rotation !== undefined ? Math.abs(rotation) > 0.01 : bool('shapeFollowStroke'),
    shapeCount: num('shapeCount'),
    shapeCountJitter: num('shapeCountJitter'),
    shapeRandomized: bool('shapeRandomise', 'shapeRandomize', 'shapeRandomized'),
    rotateRandom: bool('shapeRandomise', 'shapeRandomize', 'shapeRandomized'),
    shapeAzimuth: bool('shapeAzimuth', 'azimuth'),
    shapeFlipX: bool('shapeFlipX', 'shapeFlipHorizontal'),
    shapeFlipY: bool('shapeFlipY', 'shapeFlipVertical'),
    roundness: num('shapeRoundness', 'roundness'),
    angle: scale(num('shapeOrientation', 'shapeAngle'), 180),
    hardness: num('shapeHardness', 'hardness') ?? (data['tipImage'] ? 1 : undefined),

    // 5. Grain
    grain: num('textureDepth', 'grainDepth') ?? (data['grainImage'] ? 1 : 0),
    grainDepth: num('textureDepth', 'grainDepth'),
    grainMinDepth: num('textureMinDepth', 'textureDepthMinimum'),
    grainDepthJitter: num('textureDepthJitter'),
    grainOffsetJitter: num('textureOffsetJitter') !== undefined ? num('textureOffsetJitter') : bool('textureOffsetJitter') ? 1 : 0,
    grainScale: scale(num('textureScale', 'grainScale'), 2.6, 0.15),
    grainZoom: num('textureZoom', 'grainZoom'),
    grainRotation: scale(num('textureRotation', 'grainRotation'), 180),
    grainBrightness: num('textureBrightness'),
    grainContrast: num('textureContrast'),
    grainInverted: bool('textureInverted', 'textureInvert', 'grainInverted'),
    grainMode: typeof textureMode === 'string' ? (/mov|roll/i.test(textureMode) ? 'moving' : 'texturized')
      : textureMovement !== undefined ? (textureMovement > 0 ? 'moving' : 'texturized')
      : bool('textureRolling', 'textureMoving') ? 'moving' : 'texturized',
    grainBlend: (() => { const m = num('textureBlendMode', 'grainBlendMode'); return m === 1 ? 'multiply' : m === 2 ? 'overlay' : 'normal'; })(),

    // 6. Rendering
    renderMode: rm !== undefined && rm >= 0 && rm < 4 ? renderingModes[Math.round(rm)] : bool('dynamicsGlaze') === false ? 'blending' : 'glaze',
    flow: num('renderingFlow', 'dynamicsGlazedFlow', 'flow', 'glazedFlow'),
    wetEdges: num('dynamicsWetEdges', 'renderingWetEdges', 'wetEdges'),
    burntEdges: num('dynamicsBurntEdges', 'renderingBurntEdges', 'burntEdges'),
    blendMode: typeof raw('blendMode', 'renderingBlendMode') === 'string' ? raw('blendMode', 'renderingBlendMode') : 'normal',
    luminanceBlending: bool('renderingLuminanceBlending', 'luminanceBlending'),

    // 7. Wet mix
    dilution: num('dynamicsMix', 'wetMixDilution', 'dilution'),
    charge: num('dynamicsLoad', 'wetMixCharge', 'charge'),
    attack: num('dynamicsWetAccumulation', 'wetMixAttack', 'attack'),
    pull: num('dynamicsPull', 'dynamicsPressureMix', 'wetMixPull', 'pull'),
    grade: num('dynamicsGrade', 'wetMixGrade', 'grade'),
    blur: num('dynamicsBlur', 'wetMixBlur', 'blur'),
    blurJitter: num('dynamicsBlurJitter', 'blurJitter'),
    wetJitter: num('dynamicsWetnessJitter', 'wetnessJitter', 'wetJitter'),

    // 8. Color dynamics
    hueJitter: num('colorDynamicsStampHue', 'stampHueJitter', 'dynamicsHueJitter') ?? fuzzy([/hue/, /jitter|stamp/], [/stroke|pressure|tilt/]),
    saturationJitter: num('colorDynamicsStampSaturation', 'stampSaturationJitter') ?? fuzzy([/saturation/, /jitter|stamp/], [/stroke|pressure|tilt/]),
    lightnessJitter: num('colorDynamicsStampLightness', 'stampBrightnessJitter', 'stampLightnessJitter') ?? fuzzy([/lightness|brightness/, /jitter|stamp/], [/stroke|pressure|tilt|texture/]),
    darknessJitter: num('colorDynamicsStampDarkness', 'stampDarknessJitter') ?? fuzzy([/darkness/, /jitter|stamp/], [/stroke|pressure|tilt/]),
    secondaryColorJitter: num('colorDynamicsSecondaryColor', 'secondaryColorJitter') ?? fuzzy([/secondary/], []),
    strokeHueJitter: num('colorDynamicsStrokeHue', 'strokeHueJitter') ?? fuzzy([/stroke/, /hue/], []),
    strokeSaturationJitter: num('colorDynamicsStrokeSaturation', 'strokeSaturationJitter') ?? fuzzy([/stroke/, /saturation/], []),
    strokeLightnessJitter: num('colorDynamicsStrokeLightness', 'strokeBrightnessJitter') ?? fuzzy([/stroke/, /lightness|brightness/], []),
    strokeDarknessJitter: num('colorDynamicsStrokeDarkness', 'strokeDarknessJitter') ?? fuzzy([/stroke/, /darkness/], []),
    colorPressure: num('colorDynamicsPressureHue', 'pressureHue') ?? fuzzy([/pressure/, /hue/], []),
    pressureBrightness: num('colorDynamicsPressureBrightness', 'pressureBrightness') ?? fuzzy([/pressure/, /brightness|lightness/], [/texture/]),

    // 9. Dynamics
    speedSize: num('dynamicsSpeedSize', 'speedSize'),
    speedOpacity: num('dynamicsSpeedOpacity', 'speedOpacity'),
    jitter: num('dynamicsJitterSize', 'jitterSize'),
    jitterOpacity: num('dynamicsJitterOpacity', 'jitterOpacity'),

    // 10. Stylus (Apple Pencil)
    sizePressure: num('pencilPressureSize', 'dynamicsPressureSize', 'pressureSize'),
    opacityPressure: num('pencilPressureOpacity', 'dynamicsPressureOpacity', 'pressureOpacity'),
    pressureFlow: num('pencilPressureFlow', 'pressureFlow'),
    pressureBleed: num('pencilPressureBleed', 'pressureBleed'),
    pressureSmoothing: num('pencilPressureSmoothing', 'pressureSmoothing'),
    tiltAngle: (() => { const v = num('pencilTiltAngle', 'tiltAngle'); return v === undefined ? undefined : v <= 1 ? v * 90 : v; })(),
    tiltOpacity: num('pencilTiltOpacity', 'tiltOpacity'),
    tiltSize: num('pencilTiltSize', 'tiltSize'),
    tiltBleed: num('pencilTiltBleed', 'tiltBleed'),

    // 11. Properties
    orientToScreen: bool('oriented', 'orientToScreen', 'orientedToScreen'),
    useStampPreview: bool('stamp', 'useStampPreview', 'stampPreview'),
    previewSize: num('previewSize'),
    smudge: num('smudge', 'smudgeAmount'),
    maxSize: (() => { const v = num('maxSize'); return v === undefined ? undefined : v <= 1.5 ? v * 500 : v; })(),
    minSize: (() => { const v = num('minSize'); return v === undefined ? undefined : v <= 1.5 ? Math.max(1, v * 500) : v; })(),
    maxOpacity: num('maxOpacity'),
    minOpacity: num('minOpacity'),
  }, name);
}

async function pngToDataUrl(bytes: Uint8Array): Promise<string> {
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}
/** Procreate shapes/grains paint with white; this engine paints with dark/opaque pixels, so invert unless already inverted. */
async function procreateImage(bytes: Uint8Array, invert: boolean): Promise<string> {
  if (bytes.length > 10_000_000) throw new Error('Brush image is too large');
  const src = await pngToDataUrl(bytes);
  if (typeof document === 'undefined' || !invert) return src;
  const img = new Image(); img.src = src; await img.decode();
  if (img.width * img.height > 16_000_000) throw new Error('Brush image dimensions are too large');
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); if (!ctx) return src;
  ctx.drawImage(img, 0, 0); const px = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < px.data.length; i += 4) { px.data[i] = 255 - px.data[i]!; px.data[i + 1] = 255 - px.data[i + 1]!; px.data[i + 2] = 255 - px.data[i + 2]!; }
  ctx.putImageData(px, 0, 0); return c.toDataURL();
}

async function procreateFromZip(zip: JSZip, setName?: string): Promise<BrushDef[]> {
  // brushset.plist names the set and fixes the brush order
  let category = setName ?? 'Imported';
  let order: string[] = [];
  const setPlist = Object.values(zip.files).find((e) => /(^|\/)brushset\.plist$/i.test(e.name) && !e.dir);
  if (setPlist) {
    try {
      const bytes = await setPlist.async('uint8array');
      let meta: any;
      try { meta = readBrushArchive(bytes); } catch {
        const xml = new TextDecoder().decode(bytes);
        const nm = /<key>name<\/key>\s*<string>([^<]*)<\/string>/i.exec(xml);
        meta = { name: nm?.[1], brushes: [...xml.matchAll(/<string>([0-9A-F-]{36})<\/string>/gi)].map((m) => m[1]) };
      }
      if (typeof meta?.name === 'string' && meta.name.trim()) category = meta.name.trim();
      if (Array.isArray(meta?.brushes)) order = meta.brushes.map(String);
    } catch { /* names are optional */ }
  }
  const archives = Object.values(zip.files).filter((entry) => /(^|\/)Brush\.archive$/i.test(entry.name) && !/(^|\/)Reset\//i.test(entry.name) && !entry.dir);
  const folderOf = (n: string) => n.slice(0, n.lastIndexOf('/') + 1);
  archives.sort((a, b) => {
    const ia = order.indexOf(folderOf(a.name).replace(/\/$/, '').split('/').pop() ?? ''), ib = order.indexOf(folderOf(b.name).replace(/\/$/, '').split('/').pop() ?? '');
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  const results: BrushDef[] = [];
  for (const archive of archives) {
    try {
      const bytes = await archive.async('uint8array');
      if (bytes.length > 5_000_000) throw new Error('Brush settings are too large');
      const settings: Dict = readBrushArchive(bytes) as Dict;
      const folder = folderOf(archive.name);
      const { bool } = keyFinder(settings);
      const shape = zip.file(`${folder}Shape.png`) ?? Object.values(zip.files).find((e) => e.name.startsWith(folder) && /shape[^/]*\.png$/i.test(e.name));
      if (shape) settings['tipImage'] = await procreateImage(await shape.async('uint8array'), !bool('shapeInverted', 'shapeInvert'));
      const grain = zip.file(`${folder}Grain.png`) ?? Object.values(zip.files).find((e) => e.name.startsWith(folder) && /grain[^/]*\.png$/i.test(e.name));
      // grain stays white-is-paint: the engine reads grain luminance directly
      if (grain) settings['grainImage'] = await procreateImage(await grain.async('uint8array'), false);
      const fallback = folder.replace(/\/$/, '').split('/').pop() || 'Procreate Brush';
      results.push(translateProcreateBrush(settings, fallback, category));
    } catch { /* skip one broken brush, keep the rest of the set */ }
  }
  return results;
}

/* ---------------- GIMP .gbr ---------------- */
export function translateGimpBrush(buffer: ArrayBuffer, fileName: string): BrushDef | null {
  const v = new DataView(buffer);
  if (buffer.byteLength < 28) return null;
  const headerSize = v.getUint32(0), version = v.getUint32(4), w = v.getUint32(8), h = v.getUint32(12), bytes = v.getUint32(16);
  if (!(version === 1 || version === 2) || !w || !h || w * h > 16_000_000 || ![1, 4].includes(bytes)) return null;
  const spacing = version === 2 ? v.getUint32(24) : 25;
  const nameBytes = new Uint8Array(buffer, version === 2 ? 28 : 20, Math.max(0, headerSize - (version === 2 ? 28 : 20)));
  const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, '').trim() || fileName.replace(/\.gbr$/i, '');
  if (headerSize + w * h * bytes > buffer.byteLength || typeof document === 'undefined') return null;
  const px = new Uint8Array(buffer, headerSize, w * h * bytes);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    // GIMP: grey value = paint amount; RGBA brushes carry their own alpha
    const a = bytes === 1 ? px[i]! : px[i * 4 + 3]!;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return sanitizeBrushDef({ name, category: 'Imported', tipImage: c.toDataURL(), spacing: Math.max(0.01, spacing / 100), hardness: 1, maxSize: Math.max(16, Math.min(400, Math.max(w, h))), sizePressure: 0.6 }, name);
}

/** Sniffs the real format from the bytes, not just the file extension. */
function sniff(bytes: Uint8Array, ext: string): 'zip' | 'json' | 'png' | 'gbr' | 'abr' | 'unknown' {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length > 24 && bytes[20] === 0x47 && bytes[21] === 0x49 && bytes[22] === 0x4d && bytes[23] === 0x50) return 'gbr';
  if (ext === 'gbr') return 'gbr';
  if (bytes.length >= 4 && bytes[0] === 0 && ([1, 2].includes(bytes[1]!) || (bytes[1]! >= 6 && bytes[1]! <= 10 && [1, 2].includes((bytes[2]! << 8) | bytes[3]!)))) return 'abr';
  let i = 0; while (i < bytes.length && i < 64 && /\s/.test(String.fromCharCode(bytes[i]!))) i++;
  if (bytes[i] === 0x7b || bytes[i] === 0x5b) return 'json';
  return 'unknown';
}

export async function importBrushFile(file: File): Promise<BrushDef[]> {
  if (file.size > 50_000_000) throw new Error('Brush files must be under 50 MB');
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const kind = sniff(head, ext);
  if (kind === 'abr' || ext === 'abr') {
    return parseAbr(await file.arrayBuffer(), file.name).map((b) => sanitizeBrushDef(b, b.name || file.name));
  }
  const setName = ext === 'brushset' ? file.name.replace(/\.brushset$/i, '') : undefined;
  if (kind === 'gbr') {
    const b = translateGimpBrush(await file.arrayBuffer(), file.name);
    if (b) return [b];
  }
  if (kind === 'png' && ext !== 'kpp') {
    // a plain image becomes a brush shape
    const src = await pngToDataUrl(new Uint8Array(await file.arrayBuffer()));
    const name = file.name.replace(/\.[^.]+$/, '');
    return [sanitizeBrushDef({ name, category: 'Imported', tipImage: src, hardness: 1, spacing: 0.1 }, name)];
  }
  if (kind === 'zip' && !['bundle', 'zip', 'brushset', 'brush'].includes(ext)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const found = await procreateFromZip(zip, setName);
    if (found.length) return found;
  }
  if (kind === 'json' && !['apb', 'myb', 'json'].includes(ext)) {
    const json = JSON.parse(await file.text());
    if (json.brush) return [sanitizeBrushDef(json.brush, file.name)];
    if (json.settings) return [translateMyPaintBrush(json, file.name)];
    if (json['stroke-properties'] || json['blend-properties']) return [translateCustomJsonBrush(json, file.name)];
    return [sanitizeBrushDef(json, file.name)];
  }

  if (ext === 'apb') {
    const text = await file.text();
    const data = JSON.parse(text);
    const brush = data['brush'] || data;
    return [sanitizeBrushDef(brush, file.name.replace(/\.apb$/i, ''))];
  }

  if (ext === 'myb') {
    const text = await file.text();
    const json = JSON.parse(text);
    return [translateMyPaintBrush(json, file.name)];
  }

  if (ext === 'kpp') {
    const buffer = await file.arrayBuffer();
    return [translateKritaPreset(file.name, buffer)];
  }

  if (ext === 'json') {
    const text = await file.text();
    const json = JSON.parse(text);
    if (json.brush) {
      return [sanitizeBrushDef(json.brush, file.name)];
    }
    if (json.settings && json.version) {
      return [translateMyPaintBrush(json, file.name)];
    }
    if (json['stroke-properties'] || json['blend-properties']) {
      return [translateCustomJsonBrush(json, file.name)];
    }
    if (Array.isArray(json)) {
      return json.map((item, idx) => sanitizeBrushDef(item, `${file.name} #${idx + 1}`));
    }
    return [sanitizeBrushDef(json, file.name)];
  }

  if (ext === 'bundle' || ext === 'zip' || ext === 'brushset' || ext === 'brush') {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    if (Object.keys(zip.files).length > 2000) throw new Error('Too many entries in brush archive');
    const procreate = await procreateFromZip(zip, setName);
    if (procreate.length) return procreate;
    const results: BrushDef[] = [];

    const entries = Object.keys(zip.files);
    for (const path of entries) {
      const entry = zip.files[path];
      if (!entry || entry.dir) continue;
      const lower = path.toLowerCase();

      try {
        if (lower.endsWith('.brush')) {
          const nested = await JSZip.loadAsync(await entry.async('arraybuffer'));
          results.push(...await procreateFromZip(nested, setName));
        } else if (lower.endsWith('.apb')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          results.push(sanitizeBrushDef(data['brush'] || data, path));
        } else if (lower.endsWith('.myb')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          results.push(translateMyPaintBrush(data, path));
        } else if (lower.endsWith('.kpp')) {
          const ab = await entry.async('arraybuffer');
          results.push(translateKritaPreset(path, ab));
        } else if (lower.endsWith('.json') && !lower.includes('manifest') && !lower.includes('package')) {
          const txt = await entry.async('text');
          const data = JSON.parse(txt);
          if (data['stroke-properties'] || data['blend-properties']) {
            results.push(translateCustomJsonBrush(data, path));
          } else if (data['settings']) {
            results.push(translateMyPaintBrush(data, path));
          } else {
            results.push(sanitizeBrushDef(data, path));
          }
        }
      } catch {
        // Skip corrupted entries
      }
    }

    if (results.length > 0) return results;
  }

  throw new Error(`Could not read .${ext}. Supported: .brush, .brushset, .apb, .myb, .kpp, .gbr, .png, .bundle, .json and .zip`);
}
