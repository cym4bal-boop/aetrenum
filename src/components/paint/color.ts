// Pure color helpers shared by the color sheet, the brush engine and ColorDrop.
export type HSV = { h: number; s: number; v: number }; // h 0-360, s/v 0-1
/** Reversible square HSV coordinates mapped into a circular picker. */
export function discPoint(s: number, v: number, radius: number) {
  const x = clamp(s) * 2 - 1, y = 1 - clamp(v) * 2;
  const length = Math.hypot(x, y);
  const scale = length ? Math.max(Math.abs(x), Math.abs(y)) / length : 0;
  return { x: x * scale * radius, y: y * scale * radius };
}
export function discValues(x: number, y: number, radius: number) {
  const length = Math.hypot(x, y);
  const max = Math.max(Math.abs(x), Math.abs(y));
  const scale = max ? Math.min(1, length / radius) / max : 0;
  return { s: clamp((x * scale + 1) / 2), v: clamp((1 - y * scale) / 2) };
}
export type RGB = { r: number; g: number; b: number }; // 0-255

export function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB) {
  const p = (x: number) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: HSV) => rgbToHex(hsvToRgb(hsv));

export type HarmonyMode = 'Complementary' | 'Split Complementary' | 'Analogous' | 'Triadic' | 'Tetradic';
export const harmonyModes: HarmonyMode[] = ['Complementary', 'Split Complementary', 'Analogous', 'Triadic', 'Tetradic'];

/** Hue offsets (degrees) of the companion colors for each harmony mode. */
export function harmonyOffsets(mode: HarmonyMode): number[] {
  switch (mode) {
    case 'Complementary': return [180];
    case 'Split Complementary': return [150, 210];
    case 'Analogous': return [-30, 30];
    case 'Triadic': return [120, 240];
    case 'Tetradic': return [90, 180, 270];
  }
}

export function harmonyColors(base: HSV, mode: HarmonyMode): HSV[] {
  return harmonyOffsets(mode).map((o) => ({ ...base, h: (((base.h + o) % 360) + 360) % 360 }));
}

export function isValidHex(value: string) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}
