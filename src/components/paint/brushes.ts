// Dab-based brush engine: brush definitions, tinted tip cache and stamping.
export type BrushDef = {
  id: string;
  name: string;
  category: string;
  author?: string;
  dateCreated?: string;
  signName?: string;

  // 1. Stroke path
  spacing: number; // fraction of size between dabs (0.01 – 1.2)
  spacingJitter?: number; // 0 – 1
  jitterLateral?: number; // 0 – 1
  jitterLinear?: number; // 0 – 1
  falloff?: number; // 0 – 1 (0 = infinite)
  streamline?: number; // 0 – 100

  // 2. Stabilization
  stabilization?: number; // 0 – 100
  motionFiltering?: number; // 0 – 100

  // 3. Taper
  taper: number; // start taper 0 – 1
  pressureTaper?: number; // 0 – 1
  touchTaper?: number; // 0 – 1
  taperSize?: number; // 0 – 1
  taperOpacity?: number; // 0 – 1
  taperTip?: 'sharp' | 'round';

  // 4. Shape
  /** Custom brush head (shape) image as a data URL; dark or opaque pixels paint. */
  tipImage?: string | undefined;
  hardness: number; // 0 soft – 1 hard
  roundness: number; // 1 round, <1 flattened
  angle: number; // tip angle in degrees
  rotateRandom: boolean;
  scatter: number; // position scatter fraction
  shapeScatter?: number; // 0 – 1
  shapeRotation?: number; // -180 – 180
  shapeFollowStroke?: boolean;
  shapeCount?: number; // 1 – 16 dabs
  shapeCountJitter?: number; // 0 – 1
  shapeRandomized?: boolean;

  // 5. Grain
  grain: number; // 0 – 1 noisy texture amount
  grainScale?: number; // 0.1 – 3.0
  grainZoom?: number; // 0 – 1
  grainDepth?: number; // 0 – 1
  grainBlend?: 'multiply' | 'overlay' | 'normal';

  // 6. Rendering
  renderMode?: 'light-glaze' | 'glaze' | 'blending' | 'intense-blending';
  flow: number; // per-dab alpha 0 – 1
  wetEdges?: number; // 0 – 1
  burntEdges?: number; // 0 – 1

  // 7. Wet Mix
  dilution?: number; // 0 – 1
  charge?: number; // 0 – 1
  attack?: number; // 0 – 1
  pull?: number; // 0 – 1
  grade?: number; // 0 – 1
  wetJitter?: number; // 0 – 1

  // 8. Color dynamics
  stampColorJitter?: number; // 0 – 1
  strokeColorJitter?: number; // 0 – 1
  colorPressure?: number; // 0 – 1

  // 9. Dynamics
  speedSize?: number; // -1 – 1
  speedOpacity?: number; // -1 – 1
  jitter: number; // size jitter 0 – 1
  jitterOpacity?: number; // 0 – 1

  // 10. Stylus
  sizePressure: number; // 0 – 1 how much pressure shrinks size
  opacityPressure: number; // 0 – 1 how much pressure reduces flow
  pressureFlow?: number; // 0 – 1
  pressureBleed?: number; // 0 – 1
  tiltAngle?: number; // 0 – 90
  tiltOpacity?: number; // 0 – 1
  tiltSize?: number; // 0 – 2

  // 11. Properties
  useStampPreview?: boolean;
  orientToScreen?: boolean;
  previewSize?: number; // 0.1 – 1
  smudge?: number; // 0 – 1
  minSize?: number; // px
  maxSize: number; // px at 100% size slider
  minOpacity?: number; // 0 – 1
  maxOpacity?: number; // 0 – 1

  // Procreate parity extras
  taperEnd?: number; // end taper length 0 – 1
  shapeFlipX?: boolean;
  shapeFlipY?: boolean;
  shapeAzimuth?: boolean;
  grainImage?: string | undefined; // Grain.png as a data URL (white = paint)
  grainMode?: 'moving' | 'texturized';
  grainRotation?: number; // -180 – 180
  grainMinDepth?: number; // 0 – 1
  grainDepthJitter?: number; // 0 – 1
  grainOffsetJitter?: number; // 0 – 1
  grainBrightness?: number; // -1 – 1
  grainContrast?: number; // -1 – 1
  grainInverted?: boolean;
  blendMode?: string;
  luminanceBlending?: boolean;
  blur?: number; // wet mix blur 0 – 1
  blurJitter?: number;
  hueJitter?: number; // stamp colour jitter, 0 – 1
  saturationJitter?: number;
  lightnessJitter?: number;
  darknessJitter?: number;
  secondaryColorJitter?: number;
  strokeHueJitter?: number;
  strokeSaturationJitter?: number;
  strokeLightnessJitter?: number;
  strokeDarknessJitter?: number;
  pressureBrightness?: number; // -1 – 1
  tiltBleed?: number;
  pressureSmoothing?: number; // 0 – 1

  // 12. Materials
  metallic?: number; // 0 – 1
  roughness?: number; // 0 – 1
};

const base: Omit<BrushDef, 'id' | 'name' | 'category'> = {
  spacing: 0.08, hardness: 0.85, flow: 1, sizePressure: 0.6, opacityPressure: 0, jitter: 0,
  scatter: 0, grain: 0, roundness: 1, angle: 0, rotateRandom: false, taper: 0.4, maxSize: 80,
  streamline: 30, renderMode: 'glaze', shapeCount: 1, minSize: 2, minOpacity: 0, maxOpacity: 1,
};

const defaultLibrary: BrushDef[] = [
  // Pens
  { ...base, id: 'studio-pen', name: 'Studio Pen', category: 'Pens', spacing: 0.04, hardness: 0.98, flow: 1, sizePressure: 0.85, taper: 0.7, maxSize: 60, streamline: 50 },
  { ...base, id: 'technical-pen', name: 'Technical Pen', category: 'Pens', spacing: 0.04, hardness: 1, flow: 1, sizePressure: 0, taper: 0, maxSize: 40 },
  { ...base, id: 'gel-pen', name: 'Gel Pen', category: 'Pens', spacing: 0.03, hardness: 0.95, flow: 0.98, sizePressure: 0.45, taper: 0.3, maxSize: 48 },
  { ...base, id: 'fine-tip', name: 'Fine Tip Pen', category: 'Pens', spacing: 0.04, hardness: 0.92, flow: 0.95, sizePressure: 0.6, taper: 0.5, maxSize: 35 },
  { ...base, id: 'fountain-pen', name: 'Fountain Pen', category: 'Pens', spacing: 0.03, hardness: 0.96, flow: 0.9, sizePressure: 0.8, roundness: 0.4, angle: -30, taper: 0.6, maxSize: 55 },

  // Inks
  { ...base, id: 'dry-ink', name: 'Dry Ink', category: 'Inks', spacing: 0.06, hardness: 0.92, flow: 0.9, sizePressure: 0.5, grain: 0.4, rotateRandom: true, maxSize: 50 },
  { ...base, id: 'gesinski-ink', name: 'Gesinski Ink', category: 'Inks', spacing: 0.05, hardness: 0.88, flow: 0.95, sizePressure: 0.75, grain: 0.25, taper: 0.45, maxSize: 65 },
  { ...base, id: 'pandani-ink', name: 'Pandani Ink', category: 'Inks', spacing: 0.04, hardness: 0.94, flow: 0.85, sizePressure: 0.6, roundness: 0.6, angle: 15, grain: 0.3, maxSize: 70 },
  { ...base, id: 'thistle-ink', name: 'Thistle Ink', category: 'Inks', spacing: 0.05, hardness: 0.85, flow: 0.9, sizePressure: 0.7, grain: 0.5, jitter: 0.1, rotateRandom: true, maxSize: 55 },
  { ...base, id: 'bleed-ink', name: 'Bleed Ink', category: 'Inks', spacing: 0.06, hardness: 0.75, flow: 0.82, sizePressure: 0.65, grain: 0.45, maxSize: 80, wetEdges: 0.3 },

  // Markers
  { ...base, id: 'sleepyhead', name: 'Sleepyhead', category: 'Markers', roundness: 0.5, grain: 0.82, opacityPressure: 0.4, hardness: 0.65, maxSize: 130 },
  { ...base, id: 'magpie', name: 'Magpie', category: 'Markers', roundness: 0.35, angle: -12, grain: 0.3, flow: 0.75, maxSize: 110 },
  { ...base, id: 'apsley', name: 'Apsley', category: 'Markers', roundness: 0.3, angle: 12, grain: 0.25, flow: 0.9, maxSize: 120 },
  { ...base, id: 'flynn', name: 'Flynn', category: 'Markers', roundness: 0.25, angle: -15, hardness: 0.95, flow: 0.95, maxSize: 150 },
  { ...base, id: 'centurion', name: 'Centurion', category: 'Markers', roundness: 0.35, grain: 0.6, flow: 0.65, maxSize: 135 },
  { ...base, id: 'chisel-marker', name: 'Chisel Marker', category: 'Markers', roundness: 0.2, angle: 45, hardness: 0.9, flow: 0.85, maxSize: 160 },

  // Pastels
  { ...base, id: 'pastel', name: 'Soft Pastel', category: 'Pastels', grain: 0.9, flow: 0.45, hardness: 0.6, rotateRandom: true, maxSize: 100 },
  { ...base, id: 'oil-pastel', name: 'Oil Pastel', category: 'Pastels', grain: 0.7, flow: 0.8, hardness: 0.75, roundness: 0.8, rotateRandom: true, maxSize: 110 },
  { ...base, id: 'pan-pastel', name: 'Pan Pastel', category: 'Pastels', grain: 0.85, flow: 0.35, hardness: 0.4, maxSize: 140 },
  { ...base, id: 'chalk-pastel', name: 'Chalk Pastel', category: 'Pastels', grain: 0.95, flow: 0.5, hardness: 0.65, jitter: 0.15, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'conte-crayon', name: 'Conté Crayon', category: 'Pastels', grain: 0.8, flow: 0.7, hardness: 0.8, roundness: 0.4, angle: 30, maxSize: 80 },

  // Oils
  { ...base, id: 'oil', name: 'Oil Paint', category: 'Oils', roundness: 0.4, grain: 0.4, flow: 0.85, maxSize: 140, pull: 0.6 },
  { ...base, id: 'wet-acrylic', name: 'Wet Acrylic', category: 'Oils', roundness: 0.6, grain: 0.2, flow: 0.9, hardness: 0.85, maxSize: 130, pull: 0.5 },
  { ...base, id: 'turpentine-glaze', name: 'Turpentine Glaze', category: 'Oils', roundness: 0.7, grain: 0.3, flow: 0.4, opacityPressure: 0.6, maxSize: 160 },
  { ...base, id: 'filbert-bristle', name: 'Filbert Bristle', category: 'Oils', roundness: 0.5, grain: 0.5, flow: 0.8, hardness: 0.78, angle: -15, maxSize: 135 },
  { ...base, id: 'impasto-oil', name: 'Impasto Oil', category: 'Oils', roundness: 0.35, grain: 0.6, flow: 0.95, hardness: 0.9, angle: 25, maxSize: 150 },

  // Paints
  { ...base, id: 'round-brush', name: 'Round Brush', category: 'Paints', spacing: 0.04, hardness: 0.9, flow: 0.9, sizePressure: 0.7, taper: 0.5, maxSize: 120 },
  { ...base, id: 'flat-brush', name: 'Flat Brush', category: 'Paints', spacing: 0.03, hardness: 0.8, flow: 0.7, sizePressure: 0.2, roundness: 0.25, angle: 45, taper: 0.2, maxSize: 140 },
  { ...base, id: 'wet-wash', name: 'Wet Wash', category: 'Paints', spacing: 0.05, hardness: 0.3, flow: 0.35, sizePressure: 0.5, opacityPressure: 0.7, grain: 0.2, maxSize: 220, wetEdges: 0.4 },
  { ...base, id: 'fan-brush', name: 'Fan Brush', category: 'Paints', spacing: 0.05, hardness: 0.7, flow: 0.65, roundness: 0.15, angle: 0, grain: 0.6, maxSize: 150 },
  { ...base, id: 'stucco-acrylic', name: 'Stucco Acrylic', category: 'Paints', spacing: 0.03, hardness: 0.85, flow: 0.88, grain: 0.55, rotateRandom: true, maxSize: 130 },

  // Gouache
  { ...base, id: 'gouache', name: 'Gouache', category: 'Gouache', spacing: 0.05, hardness: 0.7, flow: 0.55, sizePressure: 0.4, opacityPressure: 0.4, grain: 0.45, roundness: 0.75, angle: 30, maxSize: 140 },
  { ...base, id: 'wet-gouache', name: 'Wet Gouache', category: 'Gouache', spacing: 0.04, hardness: 0.55, flow: 0.65, sizePressure: 0.5, grain: 0.3, roundness: 0.85, maxSize: 150 },
  { ...base, id: 'dry-gouache', name: 'Dry Gouache', category: 'Gouache', spacing: 0.06, hardness: 0.82, flow: 0.75, grain: 0.7, rotateRandom: true, maxSize: 120 },
  { ...base, id: 'thick-gouache', name: 'Thick Gouache', category: 'Gouache', spacing: 0.03, hardness: 0.9, flow: 0.9, roundness: 0.4, angle: 40, maxSize: 135 },
  { ...base, id: 'opaque-gouache', name: 'Opaque Gouache', category: 'Gouache', spacing: 0.03, hardness: 0.95, flow: 1, sizePressure: 0.3, maxSize: 125 },

  // Sketching
  { ...base, id: 'hb-pencil', name: '6B Pencil', category: 'Sketching', spacing: 0.1, hardness: 0.6, flow: 0.55, sizePressure: 0.3, opacityPressure: 0.7, grain: 0.75, rotateRandom: true, maxSize: 30 },
  { ...base, id: 'narinder', name: 'Narinder Pencil', category: 'Sketching', spacing: 0.12, hardness: 0.7, flow: 0.4, sizePressure: 0.2, opacityPressure: 0.8, grain: 0.85, rotateRandom: true, maxSize: 20 },
  { ...base, id: 'technical-pencil', name: 'HB Pencil', category: 'Sketching', spacing: 0.08, hardness: 0.8, flow: 0.6, sizePressure: 0.25, grain: 0.5, maxSize: 18 },
  { ...base, id: 'peppermint', name: 'Peppermint', category: 'Sketching', spacing: 0.09, hardness: 0.65, flow: 0.5, sizePressure: 0.35, grain: 0.65, rotateRandom: true, maxSize: 28 },
  { ...base, id: 'derwent', name: 'Derwent Sketch', category: 'Sketching', spacing: 0.11, hardness: 0.5, flow: 0.5, sizePressure: 0.4, grain: 0.8, rotateRandom: true, maxSize: 36 },

  // Airbrushing
  { ...base, id: 'soft-brush', name: 'Soft Brush', category: 'Airbrushing', spacing: 0.06, hardness: 0, flow: 0.12, sizePressure: 0.1, opacityPressure: 0.6, taper: 0, maxSize: 260 },
  { ...base, id: 'hard-airbrush', name: 'Hard Airbrush', category: 'Airbrushing', spacing: 0.06, hardness: 0.55, flow: 0.25, sizePressure: 0.1, opacityPressure: 0.5, taper: 0, maxSize: 200 },
  { ...base, id: 'medium-airbrush', name: 'Medium Airbrush', category: 'Airbrushing', spacing: 0.05, hardness: 0.25, flow: 0.18, sizePressure: 0.1, opacityPressure: 0.55, maxSize: 230 },
  { ...base, id: 'flow-airbrush', name: 'Flow Airbrush', category: 'Airbrushing', spacing: 0.04, hardness: 0.15, flow: 0.08, sizePressure: 0.15, opacityPressure: 0.7, maxSize: 280 },
  { ...base, id: 'soft-blend', name: 'Soft Blend', category: 'Airbrushing', spacing: 0.05, hardness: 0.05, flow: 0.15, sizePressure: 0.2, maxSize: 250 },

  // Charcoals
  { ...base, id: 'charcoal', name: 'Vine Charcoal', category: 'Charcoals', spacing: 0.12, hardness: 0.4, flow: 0.45, sizePressure: 0.3, opacityPressure: 0.6, grain: 0.95, jitter: 0.25, scatter: 0.06, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'willow-charcoal', name: 'Willow Charcoal', category: 'Charcoals', spacing: 0.1, hardness: 0.35, flow: 0.5, sizePressure: 0.35, grain: 0.9, jitter: 0.2, rotateRandom: true, maxSize: 95 },
  { ...base, id: 'compressed-charcoal', name: 'Compressed Charcoal', category: 'Charcoals', spacing: 0.08, hardness: 0.75, flow: 0.7, sizePressure: 0.4, grain: 0.8, rotateRandom: true, maxSize: 75 },
  { ...base, id: 'charcoal-block', name: 'Charcoal Block', category: 'Charcoals', spacing: 0.07, hardness: 0.6, flow: 0.6, roundness: 0.4, angle: 45, grain: 0.85, maxSize: 110 },
  { ...base, id: 'burnt-stick', name: 'Burnt Stick', category: 'Charcoals', spacing: 0.14, hardness: 0.5, flow: 0.4, grain: 1, jitter: 0.3, scatter: 0.1, rotateRandom: true, maxSize: 85 },

  // Spraypaints
  { ...base, id: 'spray', name: 'Medium Nozzle', category: 'Spraypaints', spacing: 0.2, hardness: 0.3, flow: 0.18, sizePressure: 0.2, grain: 1, jitter: 0.5, scatter: 0.4, rotateRandom: true, taper: 0, maxSize: 200 },
  { ...base, id: 'fine-spray', name: 'Fine Spray', category: 'Spraypaints', spacing: 0.15, hardness: 0.4, flow: 0.12, sizePressure: 0.15, grain: 1, jitter: 0.4, scatter: 0.25, rotateRandom: true, taper: 0, maxSize: 160 },
  { ...base, id: 'fat-cap', name: 'Fat Cap', category: 'Spraypaints', spacing: 0.18, hardness: 0.2, flow: 0.25, sizePressure: 0.3, grain: 1, jitter: 0.6, scatter: 0.5, rotateRandom: true, taper: 0, maxSize: 260 },
  { ...base, id: 'flicks', name: 'Flicks', category: 'Spraypaints', spacing: 0.35, hardness: 0.8, flow: 0.7, jitter: 0.9, scatter: 0.8, rotateRandom: true, maxSize: 180 },
  { ...base, id: 'splatter', name: 'Splatter', category: 'Spraypaints', spacing: 0.28, hardness: 0.6, flow: 0.5, jitter: 0.8, scatter: 0.7, grain: 0.8, rotateRandom: true, maxSize: 220 },

  // Calligraphy
  { ...base, id: 'calligraphy', name: 'Script', category: 'Calligraphy', spacing: 0.03, hardness: 1, flow: 1, sizePressure: 0.75, roundness: 0.3, angle: 45, taper: 0.6, maxSize: 60 },
  { ...base, id: 'monoline', name: 'Monoline', category: 'Calligraphy', spacing: 0.04, hardness: 1, flow: 1, sizePressure: 0, taper: 0, maxSize: 50 },
  { ...base, id: 'water-pen', name: 'Water Pen', category: 'Calligraphy', spacing: 0.04, hardness: 0.85, flow: 0.75, sizePressure: 0.7, roundness: 0.5, angle: -35, taper: 0.5, maxSize: 65 },
  { ...base, id: 'brush-pen', name: 'Brush Pen', category: 'Calligraphy', spacing: 0.03, hardness: 0.92, flow: 0.95, sizePressure: 0.85, taper: 0.8, maxSize: 70 },
  { ...base, id: 'chisel-nib', name: 'Chisel Nib', category: 'Calligraphy', spacing: 0.02, hardness: 1, flow: 1, sizePressure: 0.2, roundness: 0.15, angle: 45, maxSize: 75 },

  // Deevad Digital (Translated & Calibrated from Deevad bundle)
  { ...base, id: 'deevad-brush-pointy', name: 'Thin Pointy', category: 'Inks', spacing: 0.04, hardness: 0.9, flow: 0.95, sizePressure: 0.85, grain: 0.15, taper: 0.6, maxSize: 65, author: 'David Revoy' },
  { ...base, id: 'deevad-pencil-2b', name: 'Pencil 2B', category: 'Sketching', spacing: 0.08, hardness: 0.72, flow: 0.65, sizePressure: 0.5, grain: 0.7, taper: 0.4, maxSize: 32, author: 'David Revoy' },
  { ...base, id: 'deevad-bristles-lineart', name: 'Bristles Lineart', category: 'Inks', spacing: 0.04, hardness: 0.88, flow: 0.9, sizePressure: 0.7, roundness: 0.6, angle: 25, grain: 0.35, maxSize: 75, author: 'David Revoy' },
  { ...base, id: 'deevad-painterly', name: 'Painterly Brush', category: 'Paints', spacing: 0.035, hardness: 0.82, flow: 0.8, sizePressure: 0.6, grain: 0.4, roundness: 0.5, angle: -20, maxSize: 130, pull: 0.5, author: 'David Revoy' },
  { ...base, id: 'deevad-airbrush', name: 'Smooth Airbrush', category: 'Airbrushing', spacing: 0.05, hardness: 0.1, flow: 0.16, sizePressure: 0.1, opacityPressure: 0.65, maxSize: 240, author: 'David Revoy' },

  // MyPaint Classic (Translated from MyPaint pack)
  { ...base, id: 'mypaint-calligraphy', name: 'Calligraphy', category: 'Calligraphy', spacing: 0.03, hardness: 0.92, flow: 0.95, sizePressure: 0.7, roundness: 0.25, angle: 45, maxSize: 70 },
  { ...base, id: 'mypaint-dry-brush', name: 'Dry Brush', category: 'Paints', spacing: 0.06, hardness: 0.75, flow: 0.7, sizePressure: 0.5, grain: 0.6, rotateRandom: true, maxSize: 90 },
  { ...base, id: 'mypaint-coarse-bulk', name: 'Coarse Bulk', category: 'Oils', spacing: 0.05, hardness: 0.7, flow: 0.8, roundness: 0.6, angle: 30, grain: 0.5, maxSize: 140 },
  { ...base, id: 'mypaint-blending-knife', name: 'Blending Knife', category: 'Blending', spacing: 0.04, hardness: 0.85, flow: 0.6, roundness: 0.3, angle: -45, pull: 0.7, smudge: 0.8, maxSize: 120 },
];

function loadSavedCustomBrushes(): BrushDef[] {
  try {
    const raw = localStorage.getItem('pp.customBrushes');
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const savedCustom = loadSavedCustomBrushes().map((b) => {
  // older builds filed brushes under pack names; move them into real categories
  if (b.category === 'Deevad' || b.category === 'MyPaint') return { ...b, category: 'Custom' };
  return b;
});
export const brushLibrary: BrushDef[] = [...defaultLibrary, ...savedCustom];
export const personalBrushIds = new Set(savedCustom.map((b) => b.id));
/** Bundled preset ids that are untouched — never written to storage (re-installed each launch). */
export const pristineSupplied = new Set<string>();

export function saveCustomBrushes() {
  try {
    const custom = brushLibrary.filter((b) => !pristineSupplied.has(b.id) && (!defaultLibrary.some((d) => d.id === b.id) || b.id.startsWith('custom-')));
    localStorage.setItem('pp.customBrushes', JSON.stringify(custom));
  } catch {
    // Ignore storage quota
  }
}

export function registerBrushes(brushes: BrushDef[]) {
  for (const b of brushes) {
    const idx = brushLibrary.findIndex((item) => item.id === b.id);
    if (idx >= 0) {
      brushLibrary[idx] = b;
    } else {
      brushLibrary.push(b);
    }
  }
  saveCustomBrushes();
}

export function getBrushDef(id: string): BrushDef {
  const brush = brushLibrary.find((b) => b.id === id) ?? brushLibrary[0] ?? defaultLibrary[0];
  if (!brush) throw new Error('Brush library is empty');
  return brush;
}

export function updateBrushDef(brush: BrushDef) {
  pristineSupplied.delete(brush.id);
  const idx = brushLibrary.findIndex((b) => b.id === brush.id);
  if (idx >= 0) {
    brushLibrary[idx] = { ...brush };
  } else {
    brushLibrary.push({ ...brush });
  }
  for (const key of shapeCache.keys()) { if (key.startsWith(`${brush.id}@`)) shapeCache.delete(key); }
  // Clear any cached tints for this brush
  for (const k of tintCache.keys()) {
    if (k.startsWith(`${brush.id}|`)) tintCache.delete(k);
  }
  saveCustomBrushes();
}

export function resetBrushDef(id: string): BrushDef | null {
  const original = defaultLibrary.find((b) => b.id === id);
  if (original) {
    updateBrushDef({ ...original });
    return { ...original };
  }
  return null;
}

export const brushCategories = [
  'Pens', 'Inks', 'Markers', 'Pastels', 'Oils', 'Paints', 'Gouache', 'Sketching',
  'Airbrushing', 'Charcoals', 'Spraypaints', 'Calligraphy', 'Watercolor', 'Blending', 'Erasers',
  'Textures', 'Elements', 'Custom', 'Imported'
];

export function brushesInCategory(category: string) {
  return brushLibrary.filter((b) => b.category === category);
}

const TIP = 128;
const shapeCache = new Map<string, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

import { proceduralCanvas } from './brush-heads';
const headImages = new Map<string, HTMLImageElement>();
const headKey = (src?: string) => (src ? `${src.length}:${src.slice(-24)}` : '');
/** Loads a custom head image; resolves once it can be stamped. */
export function loadBrushHead(src: string): Promise<void> {
  const k = headKey(src);
  const have = headImages.get(k);
  if (have?.complete && have.naturalWidth) return Promise.resolve();
  return new Promise((res) => {
    const img = have ?? new Image();
    img.onload = () => { shapeCache.clear(); tintCache.clear(); res(); };
    img.onerror = () => res();
    if (!have) { img.crossOrigin = 'anonymous'; img.src = src; headImages.set(k, img); }
  });
}

function drawHead(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, px: number) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.min(px / iw, px / ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
  const data = ctx.getImageData(0, 0, px, px);
  const d = data.data;
  let transparent = false;
  for (let i = 3; i < d.length; i += 16) if (d[i]! < 250) { transparent = true; break; }
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) / 255;
    // transparent PNGs use their alpha; flat images paint where they're dark
    const a = transparent ? d[i + 3]! : Math.round((1 - lum) * 255);
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a;
  }
  ctx.putImageData(data, 0, 0);
}

function tipShape(brush: BrushDef, px = TIP) {
  const key = `${brush.id}@${px}:${brush.hardness}:${brush.roundness}:${brush.angle}:${brush.wetEdges ?? 0}:${headKey(brush.tipImage)}`;
  const cached = shapeCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  const r = px / 2;
  const proc = proceduralCanvas(brush.tipImage);
  const head: HTMLImageElement | HTMLCanvasElement | undefined = proc ?? (brush.tipImage ? headImages.get(headKey(brush.tipImage)) : undefined);
  if (brush.tipImage && !head) void loadBrushHead(brush.tipImage);
  if (head && (proc || ((head as HTMLImageElement).complete && (head as HTMLImageElement).naturalWidth))) {
    ctx.save();
    ctx.translate(r, r); ctx.rotate((brush.angle * Math.PI) / 180); ctx.scale(1, brush.roundness); ctx.translate(-r, -r);
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = px;
    drawHead(tmp.getContext('2d', { willReadFrequently: true })!, head, px);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  } else {
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const solid = Math.max(0, Math.min(0.98, brush.hardness));
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(solid, 'rgba(255,255,255,1)');
  g.addColorStop(Math.min(1, solid + 0.02), solid > 0.95 ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate((brush.angle * Math.PI) / 180);
  ctx.scale(1, brush.roundness);
  ctx.translate(-r, -r);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  }

  // Wet edges: paint pools at the rim, the centre of each dab thins out
  if ((brush.wetEdges ?? 0) > 0) {
    const rim = edgeMask(c);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(0.85, brush.wetEdges! * 0.75);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, px, px); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, brush.wetEdges! * 0.9);
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = px; const tx = tmp.getContext('2d')!;
    tx.drawImage(rim, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, px, px);
    ctx.drawImage(tmp, 0, 0); ctx.restore();
  }
  if (shapeCache.size > 32) shapeCache.clear();
  shapeCache.set(key, c);
  return c;
}

/** Tinted brush tip. `px` renders the tip natively at that diameter (0 = default 128). */
export function brushTip(brush: BrushDef, color: string, px = TIP) {
  const key = `${brush.id}|${color}|${px}|${brush.hardness}|${brush.roundness}|${brush.angle}|${brush.wetEdges ?? 0}|${brush.burntEdges ?? 0}|${headKey(brush.tipImage)}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(tipShape(brush, px), 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, px, px);
  // Burnt edges: the rim of each dab darkens (Procreate Rendering › Burnt edges)
  if ((brush.burntEdges ?? 0) > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(1, brush.burntEdges! * 0.8);
    ctx.drawImage(edgeMask(tipShape(brush, px)), 0, 0);
    ctx.globalAlpha = 1;
  }
  if (tintCache.size > 160) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

/** Dark rim of a tip shape (alpha minus its blurred interior). */
function edgeMask(shape: HTMLCanvasElement) {
  const px = shape.width;
  const m = document.createElement('canvas'); m.width = m.height = px;
  const x = m.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(shape, 0, 0);
  const src = x.getImageData(0, 0, px, px);
  const a = new Float32Array(px * px);
  for (let i = 0; i < a.length; i++) a[i] = src.data[i * 4 + 3]! / 255;
  const r = Math.max(1, Math.round(px * 0.06));
  const er = new Float32Array(a.length);
  // cheap erosion: min over a cross neighbourhood
  for (let y = 0; y < px; y++) for (let xx = 0; xx < px; xx++) {
    let mn = a[y * px + xx]!;
    for (let k = 1; k <= r; k++) {
      mn = Math.min(mn, a[y * px + Math.max(0, xx - k)]!, a[y * px + Math.min(px - 1, xx + k)]!, a[Math.max(0, y - k) * px + xx]!, a[Math.min(px - 1, y + k) * px + xx]!);
    }
    er[y * px + xx] = mn;
  }
  for (let i = 0; i < a.length; i++) {
    const e = Math.max(0, a[i]! - er[i]!);
    src.data[i * 4] = src.data[i * 4 + 1] = src.data[i * 4 + 2] = 0; src.data[i * 4 + 3] = Math.round(Math.min(1, e * 1.6) * 255);
  }
  x.putImageData(src, 0, 0);
  return m;
}

export function eraserTip(brush: BrushDef, px = TIP) {
  return brushTip(brush, '#000000', px);
}

export type DabInput = {
  x: number;
  y: number;
  pressure: number;
  travelled: number;
  dx?: number;
  dy?: number;
  /** pointer speed in doc px per ms */
  speed?: number;
  /** 0 = flat, 1 = upright */
  tilt?: number;
  /** base paint colour; enables colour dynamics */
  color?: string;
  /** per-stroke colour offset (stroke colour jitter), set once per stroke */
  strokeJitter?: { h: number; s: number; l: number };
  /** deterministic random source, so a stroke can be replayed identically (end taper) */
  rng?: () => number;
  /** 0 – 1 end-taper factor applied when a stroke is finished (1 = no taper) */
  endK?: number;
  /** colour picked up from the canvas under the dab (Wet Mix pull) */
  pickup?: string | null;
};

/** Small fast seeded PRNG (mulberry32). */
export function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Procreate rendering blend mode → canvas composite operation. */
export function brushComposite(mode?: string): GlobalCompositeOperation {
  const m = (mode ?? 'normal').toLowerCase().replace(/[\s_]+/g, '-');
  const map: Record<string, GlobalCompositeOperation> = {
    normal: 'source-over', multiply: 'multiply', darken: 'darken', 'color-burn': 'color-burn', 'linear-burn': 'multiply',
    lighten: 'lighten', screen: 'screen', 'color-dodge': 'color-dodge', add: 'lighter', 'linear-dodge': 'lighter',
    overlay: 'overlay', 'soft-light': 'soft-light', 'hard-light': 'hard-light', difference: 'difference', exclusion: 'exclusion',
    hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  };
  return map[m] ?? 'source-over';
}

/** Rendering mode: per-dab alpha multiplier and how much a stroke builds up over itself. */
export function renderModeFactor(mode?: BrushDef['renderMode']) {
  return mode === 'light-glaze' ? 0.7 : mode === 'blending' ? 1.15 : mode === 'intense-blending' ? 1.4 : 1;
}

/** Wet Mix: mixes the paint colour with the colour picked up under the brush. */
export function mixPaint(paint: string, pickup: string | null | undefined, pull: number): string {
  if (!pickup || pull <= 0) return paint;
  const a = hexRgb(paint), b = hexRgb(pickup);
  if (!a || !b) return paint;
  const k = Math.max(0, Math.min(1, pull));
  // quantised so the tinted-tip cache stays small
  const c = a.map((v, i) => Math.min(255, Math.round((v + (b[i]! - v) * k) / 8) * 8));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
function hexRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------------- grain ---------------- */
const grainImages = new Map<string, HTMLImageElement>();
let proceduralGrain: HTMLCanvasElement | null = null;
/** Grain source: the brush's own Grain.png, else a paper-like procedural texture. */
function grainSource(brush: BrushDef): HTMLCanvasElement | HTMLImageElement {
  if (brush.grainImage) {
    const pc = proceduralCanvas(brush.grainImage);
    if (pc) return pc;
    const k = headKey(brush.grainImage);
    let img = grainImages.get(k);
    if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.src = brush.grainImage; grainImages.set(k, img); }
    if (img.complete && img.naturalWidth) return img;
  }
  if (!proceduralGrain) {
    const n = 256; const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d')!; const d = x.createImageData(n, n); const rnd = seeded(4242);
    const cells = new Float32Array(32 * 32).map(() => rnd());
    for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
      const fx = (xx / n) * 32, fy = (y / n) * 32, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const v = (i: number, j: number) => cells[((j & 31) * 32 + (i & 31))]!;
      const low = (v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx) * (1 - ty) + (v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx) * ty;
      const val = Math.max(0, Math.min(1, low * 0.55 + rnd() * 0.45));
      const i = (y * n + xx) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.round(val * 255); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0); proceduralGrain = c;
  }
  return proceduralGrain;
}
const holeCache = new Map<string, HTMLCanvasElement>();
/** Converts the grain into "holes": opaque where the grain is dark (no paint). */
function grainHoles(brush: BrushDef) {
  const src = grainSource(brush);
  const key = `${src === proceduralGrain ? 'proc' : headKey(brush.grainImage)}|${brush.grainInverted ? 1 : 0}|${brush.grainBrightness ?? 0}|${brush.grainContrast ?? 0}`;
  const hit = holeCache.get(key); if (hit) return hit;
  const w = (src as HTMLImageElement).naturalWidth || src.width, h = (src as HTMLImageElement).naturalHeight || src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, w, h);
  const br = brush.grainBrightness ?? 0, ct = 1 + (brush.grainContrast ?? 0);
  for (let i = 0; i < d.data.length; i += 4) {
    let l = (d.data[i]! * 0.299 + d.data[i + 1]! * 0.587 + d.data[i + 2]! * 0.114) / 255;
    if (brush.grainInverted) l = 1 - l;
    l = Math.max(0, Math.min(1, (l - 0.5) * ct + 0.5 + br));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; d.data[i + 3] = Math.round((1 - l) * 255);
  }
  x.putImageData(d, 0, 0);
  if (holeCache.size > 12) holeCache.clear();
  holeCache.set(key, c);
  return c;
}

let dabBuf: HTMLCanvasElement | null = null;
function dabCanvas(n: number) {
  if (!dabBuf || dabBuf.width < n) { dabBuf = document.createElement('canvas'); dabBuf.width = dabBuf.height = Math.max(n, 64); }
  const x = dabBuf.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, n + 2, n + 2);
  return dabBuf;
}

/* ---------------- colour dynamics ---------------- */
function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null;
  const v = parseInt(m[1]!, 16); const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; }
  return [h, s, l];
}
const q = (v: number, step: number) => Math.round(v / step) * step;
function jitterColor(brush: BrushDef, base: string, pressure: number, stroke?: { h: number; s: number; l: number }, rnd: () => number = Math.random): string {
  const hsl = hexToHsl(base); if (!hsl) return base;
  let [h, s, l] = hsl;
  const hj = brush.hueJitter ?? brush.stampColorJitter ?? 0;
  if (hj) h += (rnd() - 0.5) * 360 * hj;
  if (brush.saturationJitter) s *= 1 - rnd() * brush.saturationJitter;
  if (brush.lightnessJitter) l += rnd() * (1 - l) * brush.lightnessJitter;
  if (brush.darknessJitter) l -= rnd() * l * brush.darknessJitter;
  if (stroke) { h += stroke.h; s = Math.max(0, Math.min(1, s + stroke.s)); l = Math.max(0, Math.min(1, l + stroke.l)); }
  // colour pressure: light pressure shifts hue / brightness
  const cp = brush.colorPressure ?? 0;
  if (cp) { h += (1 - pressure) * 60 * cp; l = l + (1 - pressure) * (1 - l) * cp * 0.5; }
  if (brush.pressureBrightness) l += (pressure - 0.5) * brush.pressureBrightness * 0.6;
  h = ((q(h, 6) % 360) + 360) % 360; s = Math.max(0, Math.min(1, q(s, 0.04))); l = Math.max(0, Math.min(1, q(l, 0.03)));
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}
const colorDynamic = (b: BrushDef) => !!(b.hueJitter || b.stampColorJitter || b.saturationJitter || b.lightnessJitter || b.darknessJitter || b.colorPressure || b.pressureBrightness || b.strokeColorJitter || b.strokeHueJitter);
/** Per-stroke colour offset, Procreate "Color Jitter (stroke)". Call once per stroke. */
export function strokeColorOffset(brush: BrushDef) {
  const hj = brush.strokeHueJitter ?? brush.strokeColorJitter ?? 0;
  return { h: (Math.random() - 0.5) * 360 * hj, s: -(Math.random() * (brush.strokeSaturationJitter ?? 0)), l: (Math.random() - 0.5) * ((brush.strokeLightnessJitter ?? 0) + (brush.strokeDarknessJitter ?? 0)) };
}

/** Stamps one dab of the brush. size = diameter in canvas px at full pressure. */
export function stampDab(
  ctx: CanvasRenderingContext2D,
  tip: HTMLCanvasElement,
  brush: BrushDef,
  d: DabInput,
  size: number,
  flowScale = 1
) {
  const rnd = d.rng ?? Math.random;
  const endK = d.endK ?? 1;
  const taperLen = size * 6 * (brush.taper || 0.3);
  const tIn = taperLen > 0 ? Math.min(1, d.travelled / taperLen) : 1;
  const tAll = Math.min(tIn, endK);
  const taperSizeK = 1 - (1 - tAll) * (brush.taperSize ?? 0.85);
  const taperOpK = 1 - (1 - tAll) * (brush.taperOpacity ?? 0) ;
  const p = Math.max(0.05, Math.min(1, d.pressure));
  const tilt = d.tilt ?? 1;
  const speed = Math.max(0, Math.min(1, (d.speed ?? 0) / 3));

  // Size: pressure, taper, jitter, speed, tilt
  let s = size * (1 - brush.sizePressure + brush.sizePressure * p) * Math.max(0.15, taperSizeK);
  if (brush.jitter) s *= 1 - rnd() * brush.jitter;
  if (brush.speedSize) s *= Math.max(0.15, 1 + brush.speedSize * speed);
  if (brush.tiltSize) s *= 1 + brush.tiltSize * (1 - tilt);
  s = Math.max(brush.minSize ?? 1.5, Math.min(brush.maxSize * 1.5, s));

  // Opacity: flow, pressure, jitter, speed, tilt, wet mix
  let alpha = brush.flow * (1 - brush.opacityPressure + brush.opacityPressure * p) * flowScale * taperOpK;
  if (brush.pressureFlow) alpha *= 1 - brush.pressureFlow * 0.8 * (1 - p);
  if (brush.jitterOpacity) alpha *= 1 - rnd() * brush.jitterOpacity;
  if (brush.speedOpacity) alpha *= Math.max(0, 1 + brush.speedOpacity * speed);
  if (brush.tiltOpacity) alpha *= 1 - brush.tiltOpacity * (1 - tilt);
  // Wet mix only engages once the brush is diluted (as in Procreate)
  if (brush.dilution) {
    alpha *= 1 - brush.dilution * 0.75;
    if (brush.attack !== undefined) alpha *= Math.min(1, 0.25 + 0.75 * brush.attack);
    if (brush.charge !== undefined && brush.charge < 1) alpha *= Math.max(0, 1 - d.travelled / (size * (4 + brush.charge * 160)));
  }
  if (brush.falloff && d.travelled > 0) {
    const maxDist = size * 50 * (1.1 - brush.falloff);
    alpha *= Math.max(0, 1 - d.travelled / maxDist);
  }
  const maxO = brush.maxOpacity ?? 1, minO = brush.minOpacity ?? 0;
  alpha = minO + (maxO - minO) * Math.max(0, Math.min(1, alpha));

  // Position offsets: scatter, jitter lateral, jitter linear
  let x = d.x, y = d.y;
  const scat = brush.scatter ?? 0;
  if (scat > 0) {
    x += (rnd() - 0.5) * size * scat * 2;
    y += (rnd() - 0.5) * size * scat * 2;
  }
  if ((brush.jitterLateral || brush.jitterLinear) && (d.dx != null && d.dy != null)) {
    const dist = Math.hypot(d.dx, d.dy) || 1;
    const nx = -d.dy / dist, ny = d.dx / dist;
    const tx = d.dx / dist, ty = d.dy / dist;
    if (brush.jitterLateral) { const lat = (rnd() - 0.5) * size * brush.jitterLateral * 1.5; x += nx * lat; y += ny * lat; }
    if (brush.jitterLinear) { const lin = (rnd() - 0.5) * size * brush.jitterLinear * 1.5; x += tx * lin; y += ty * lin; }
  }

  alpha *= renderModeFactor(brush.renderMode);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  let useTip = tip;
  const pulled = d.color && d.pickup && (brush.pull ?? 0) > 0 ? mixPaint(d.color, d.pickup, (brush.pull ?? 0) * (0.35 + 0.65 * (brush.dilution ?? 0.5))) : null;
  if (d.color && colorDynamic(brush)) useTip = brushTip(brush, jitterColor(brush, pulled ?? d.color, p, d.strokeJitter, rnd), tip.width);
  else if (pulled && pulled !== d.color) useTip = brushTip(brush, pulled, tip.width);

  const grainOn = (brush.grain ?? 0) > 0;
  let depth = brush.grain ?? 0;
  if (grainOn) {
    if (brush.grainMinDepth !== undefined) depth = brush.grainMinDepth * depth + (1 - brush.grainMinDepth) * depth * p;
    if (brush.grainDepthJitter) depth *= 1 - rnd() * brush.grainDepthJitter;
    if (brush.pressureBleed) depth *= 1 - brush.pressureBleed * p * 0.8;
    // Wet Mix grade: diluted paint shows more of the grain at light pressure
    if (brush.grade && brush.dilution) depth = Math.min(1, depth * (1 + brush.grade * brush.dilution * (1.6 - p)));
  }

  const baseCount = brush.shapeCount && brush.shapeCount > 1 ? brush.shapeCount : 1;
  const count = Math.max(1, Math.round(baseCount * (1 - rnd() * (brush.shapeCountJitter ?? 0))));
  const dir = d.dx != null && d.dy != null && (d.dx || d.dy) ? Math.atan2(d.dy, d.dx) : 0;
  for (let c = 0; c < count; c++) {
    const cx = count > 1 ? x + (rnd() - 0.5) * s * 0.5 : x;
    const cy = count > 1 ? y + (rnd() - 0.5) * s * 0.5 : y;
    let rot = ((brush.shapeRotation ?? 0) * Math.PI) / 180 * (brush.shapeFollowStroke ? 1 : 0);
    if (brush.rotateRandom || brush.shapeRandomized) rot = rnd() * Math.PI * 2;
    else if (brush.shapeScatter) rot += (rnd() - 0.5) * Math.PI * 2 * brush.shapeScatter;
    else if (brush.shapeFollowStroke) rot += dir;
    const fx = brush.shapeFlipX && rnd() < 0.5 ? -1 : 1;
    const fy = brush.shapeFlipY && rnd() < 0.5 ? -1 : 1;

    if (!grainOn) {
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      if (fx !== 1 || fy !== 1) ctx.scale(fx, fy);
      ctx.drawImage(useTip, -s / 2, -s / 2, s, s);
      ctx.restore();
      continue;
    }
    // grain: build the dab off-screen, punch the grain through it, then place it
    const n = Math.ceil(s * 1.45) + 2;
    const buf = dabCanvas(n); const bx = buf.getContext('2d')!;
    bx.save(); bx.translate(n / 2, n / 2); if (rot) bx.rotate(rot); if (fx !== 1 || fy !== 1) bx.scale(fx, fy);
    bx.drawImage(useTip, -s / 2, -s / 2, s, s); bx.restore();
    const holes = grainHoles(brush);
    const gs = Math.max(0.05, (brush.grainScale ?? 1)) * (brush.grainMode === 'moving' ? s / 128 : 1) * 1.2;
    const pat = bx.createPattern(holes, 'repeat');
    if (pat) {
      const m = new DOMMatrix();
      // Texturized grain is fixed to the canvas; moving grain rolls along with the stroke.
      const ox = brush.grainMode === 'moving' ? -d.travelled * 0.35 * (1 - (brush.grainZoom ?? 0.5)) : -(cx - n / 2);
      const oy = brush.grainMode === 'moving' ? 0 : -(cy - n / 2);
      let jx = 0, jy = 0;
      if (brush.grainOffsetJitter) { jx = rnd() * 512 * brush.grainOffsetJitter; jy = rnd() * 512 * brush.grainOffsetJitter; }
      m.translateSelf(ox + jx, oy + jy).rotateSelf(brush.grainRotation ?? 0).scaleSelf(gs, gs);
      pat.setTransform(m);
      bx.globalCompositeOperation = 'destination-out';
      bx.globalAlpha = Math.min(1, depth);
      bx.fillStyle = pat;
      bx.fillRect(0, 0, n, n);
      bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(buf, 0, 0, n, n, cx - n / 2, cy - n / 2, n, n);
  }

  return s;
}

/** Small preview stroke for the brush library list. */
export function drawBrushPreview(canvas: HTMLCanvasElement, brush: BrushDef, color = '#1c1c1e') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tip = brushTip(brush, color);
  const w = canvas.width, h = canvas.height;
  const size = Math.min(h * 0.55, brush.maxSize * 0.5 + 6);
  // Imported minimum sizes are document pixels, not preview pixels.
  const previewBrush = { ...brush, minSize: Math.min(size, size * (brush.minSize ?? 1.5) / Math.max(1, brush.maxSize)) };
  const extent = Math.ceil(size * (2 + (brush.scatter ?? 0) * 2 + .75 * ((brush.jitterLateral ?? 0) + (brush.jitterLinear ?? 0))));
  const surface = document.createElement('canvas');
  surface.width = w + extent * 2; surface.height = h + extent * 2;
  const preview = surface.getContext('2d');
  if (!preview) return;
  let travelled = 0, prev: { x: number; y: number } | null = null;
  for (let t = 0; t <= 1; t += 0.0035) {
    const x = 12 + t * (w - 24);
    const y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.18;
    const dx = prev ? x - prev.x : 0;
    const dy = prev ? y - prev.y : 0;
    if (prev) travelled += Math.hypot(dx, dy);
    prev = { x, y };

    // Taper ends of stroke in both size and opacity so they don't get abruptly cut off
    const edgeTaper = Math.min(1, Math.min(t, 1 - t) / 0.15);
    const smoothTaper = Math.sin((edgeTaper * Math.PI) / 2);
    const pressure = Math.max(0.01, Math.sin(t * Math.PI) * smoothTaper);
    const flowScale = Math.pow(smoothTaper, 1.4);

    stampDab(preview, tip, previewBrush, { x: x + extent, y: y + extent, pressure, travelled, dx, dy }, size * smoothTaper, flowScale);
  }
  // Fit the complete painted bounds, including scattered tips, with a quiet margin.
  const pixels = preview.getImageData(0, 0, surface.width, surface.height).data;
  let left = surface.width, top = surface.height, right = -1, bottom = -1;
  for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
    if ((pixels[(y * surface.width + x) * 4 + 3] ?? 0) > 0) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right >= left && bottom >= top) {
    const bw = right - left + 1, bh = bottom - top + 1;
    const scale = Math.min((w - 12) / bw, (h - 12) / bh);
    ctx.drawImage(surface, left, top, bw, bh, (w - bw * scale) / 2, (h - bh * scale) / 2, bw * scale, bh * scale);
  }
  ctx.globalAlpha = 1;
}

/** Brush name for display: strips pack / author tags (Classic, Deevad, MyPaint, "· Pack" suffixes, bullets). */
export function cleanBrushName(name: string): string {
  const out = (name || '')
    .replace(/\s*[·•∙●]\s*.*$/u, '')
    .replace(/^(?:\s*(?:classic|deevad|mypaint|my paint|kaerhon|ramon|tanda|experimental)\b[\s:/_-]*)+/i, '')
    .replace(/[\s(\[]*(?:classic|deevad|mypaint|my paint)[)\]]*\s*$/i, '')
    .replace(/[·•∙●]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out || (name || '').replace(/[·•∙●]/gu, ' ').trim();
}
