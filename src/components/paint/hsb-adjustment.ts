/** HSV/HSB adjustment, not HSL lightness; preserves the pixel alpha upstream. */
export function adjustHsbPixel(r: number, g: number, b: number, hue: number, saturation: number, brightness: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const maximum = Math.max(rn, gn, bn), minimum = Math.min(rn, gn, bn), delta = maximum - minimum;
  let h = 0;
  if (delta > 0) {
    if (maximum === rn) h = ((gn - bn) / delta) % 6;
    else if (maximum === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
  }
  h = ((h + hue) % 360 + 360) % 360;
  const s = Math.max(0, Math.min(1, (maximum > 0 ? delta / maximum : 0) * (1 + saturation / 100)));
  const change = brightness / 100;
  const v = Math.max(0, Math.min(1, change >= 0 ? maximum + (1 - maximum) * change : maximum * (1 + change)));
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
}