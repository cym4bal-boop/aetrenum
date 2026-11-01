import presets from './painter-brushes.json';
import { brushLibrary, pristineSupplied, cleanBrushName, personalBrushIds } from './brushes';
import { translateCustomJsonBrush, translateMyPaintBrush } from './brush-translator';

const PACKS: Record<string, { label: string; author?: string }> = {
  classic: { label: 'Classic', author: 'MyPaint' },
  deevad: { label: 'Deevad', author: 'David Revoy' },
  experimental: { label: 'Experimental', author: 'MyPaint' },
  kaerhon_v1: { label: 'Kaerhon', author: 'Kaerhon' },
  ramon: { label: 'Ramon', author: 'Ramón Miranda' },
  tanda: { label: 'Tanda', author: 'Tanda' },
};

const RULES: [RegExp, string][] = [
  [/eraser/, 'Erasers'],
  [/blur|blend|smudge|smear|knife.*smudg|colorless|only.?water|mostly.?water|pick.?and.?drag/, 'Blending'],
  [/water.?colou?r|watercolor|wash|fringe|bleed|wet.?paper|salt|water/, 'Watercolor'],
  [/callig|lettering|script|split.?nib|fountain|dip.?pen|oval|slant/, 'Calligraphy'],
  [/pencil|sketch|hatch|shade[dr]?$|shader|subtle|^b.?pencil|\b[0-9]?[hb]\b/, 'Sketching'],
  [/charcoal/, 'Charcoals'],
  [/chalk|pastel|crayon|waxy/, 'Pastels'],
  [/marker|highlighter|felt/, 'Markers'],
  [/airbrush|airbruch|airsmudge|glow|bokeh|beamlight|soft$|irregular|smoke|cloud/, 'Airbrushing'],
  [/spray|splatter|splash|backsplash|sand.?blast|blot|drip|stains?|particul|stardust|sparkler|flecks|debris/, 'Spraypaints'],
  [/gouache/, 'Gouache'],
  [/oil|acrylic|impasto|filbert|thick|rake|palette.?knife|loaded.?knife|^knife|bulk|modelling|roller|stucco|varnish|glazed/, 'Oils'],
  [/ink|inker|liner|pen|ballpen|pixel|monoline|1pixel|rigger|pointy|kabura|signature|gel|technical|sting|delayed|taper/, 'Inks'],
  [/grid|halftone|screentone|tone|dot|dash|lines|checker|squares|circles|bricks|wood|denim|cordaroy|cloth|fiber|grunge|texture|noise|grain|scratch|newspaper|dirty|sponge|pebbles|cut.?out|cracked|chemical|burn|combustion|raised/, 'Textures'],
  [/grass|leaves|fur|hair|vine|willow|floral|roses|pistil|stars|arrow|ribbon|tube|twisty|flame|chain|sewing|track|dna|bubble|meat|savory|curvy|doodle|scribble|wet.?direction/, 'Elements'],
  [/paint|brush|round|flat|bar|detail|impression|puant|fill|bristle|dry|basic|rough|classic|wet|opaque/, 'Paints'],
];

/** Sorts a bundled brush into a real library category by its name. */
export function categorizeSupplied(name: string): string {
  const n = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return 'Custom';
}

const pretty = (s: string) => s.replace(/\.(myb|json)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** Installs the provided Painter JSON brush pack into the library.
 *  Brushes the user already edited/overwrote keep their saved version. */
let installed = false;
export function installSuppliedLibrary() {
  if (installed) return 0;
  installed = true;
  // Keep personal imports and copies, replacing the previous supplied/default library.
  const personal = brushLibrary.filter((b) => personalBrushIds.has(b.id));
  brushLibrary.splice(0, brushLibrary.length, ...personal);
  let n = 0;
  for (const preset of presets as { path: string; kind: string; data: Record<string, unknown> }[]) {
    const id = `pack2-${preset.kind}-${preset.path.replace(/[^a-z0-9]/gi, '-')}`;
    if (brushLibrary.some((b) => b.id === id)) continue;
    const parts = preset.path.split('/');
    const file = parts.at(-1) ?? preset.path;
    if (preset.kind === 'mypaint') {
      const pack = PACKS[parts[1] ?? ''] ?? { label: 'MyPaint' };
      const brush = translateMyPaintBrush({ ...preset.data, parent_brush_name: '' }, file);
      const base = pretty(file);
      brushLibrary.push({ ...brush, id, name: base, ...(pack.author ? { author: pack.author } : {}), category: categorizeSupplied(base) });
    } else {
      const brush = translateCustomJsonBrush(preset.data, file);
      brushLibrary.push({ ...brush, id, name: cleanBrushName(brush.name || pretty(file)), category: categorizeSupplied(brush.name || file) });
    }
    pristineSupplied.add(id);
    n++;
  }
  return n;
}
