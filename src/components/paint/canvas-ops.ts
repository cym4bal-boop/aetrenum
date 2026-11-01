// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { renderAdjustment } from './adjust-fx';
import { normalizeParams } from './adjust-defs';

export type LiquifyMode = 'Push' | 'Twirl Right' | 'Twirl Left' | 'Pinch' | 'Expand' | 'Crystals' | 'Edge' | 'Reconstruct';

export function resolveColor(value: string) {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const context = probe.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
}

export function floodFill(canvas: HTMLCanvasElement, x: number, y: number, color: string, tolerance = 34) {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const width = canvas.width;
  const height = canvas.height;
  const startX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const startY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const start = (startY * width + startX) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const fill = resolveColor(color);
  if (target.every((channel, i) => Math.abs(channel - fill[i]) < 2)) return false;
  const matches = (index: number) => {
    const alphaDiff = Math.abs(data[index + 3] - target[3]);
    if (alphaDiff > Math.max(28, tolerance)) return false;
    if (target[3] < 10) return data[index + 3] < 28;
    const alphaScale = target[3] / 255;
    return Math.abs(data[index] - target[0]) <= tolerance * alphaScale + 10 &&
      Math.abs(data[index + 1] - target[1]) <= tolerance * alphaScale + 10 &&
      Math.abs(data[index + 2] - target[2]) <= tolerance * alphaScale + 10;
  };
  const visited = new Uint8Array(width * height);
  const spans: number[] = [startX, startY];
  const writePixel = (pixel: number) => {
    const alpha = fill[3] / 255;
    data[pixel] = fill[0];
    data[pixel + 1] = fill[1];
    data[pixel + 2] = fill[2];
    data[pixel + 3] = Math.round(255 * alpha);
  };
  while (spans.length) {
    const sy = spans.pop()!;
    let sx = spans.pop()!;
    let offset = sy * width + sx;
    while (sx >= 0 && !visited[offset] && matches(offset * 4)) { sx--; offset--; }
    sx++;
    let reachAbove = false;
    let reachBelow = false;
    for (let px = sx; px < width; px++) {
      const cell = sy * width + px;
      const index = cell * 4;
      if (visited[cell] || !matches(index)) break;
      visited[cell] = 1;
      writePixel(index);
      if (sy > 0) {
        const above = cell - width;
        const matchesAbove = !visited[above] && matches(above * 4);
        if (matchesAbove && !reachAbove) spans.push(px, sy - 1);
        reachAbove = matchesAbove;
      }
      if (sy + 1 < height) {
        const below = cell + width;
        const matchesBelow = !visited[below] && matches(below * 4);
        if (matchesBelow && !reachBelow) spans.push(px, sy + 1);
        reachBelow = matchesBelow;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return true;
}

export function drawGeometry(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, shape: 'Line' | 'Ellipse' | 'Rectangle', color: string, width: number, opacity: number) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.globalAlpha = opacity / 100;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (shape === 'Line') {
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  } else {
    const left = Math.min(from.x, to.x);
    const top = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);
    if (shape === 'Ellipse') context.ellipse(left + w / 2, top + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
    else context.rect(left, top, w, h);
  }
  context.stroke();
  context.restore();
}

export function applyCanvasEffect(canvas: HTMLCanvasElement, name: string, value: number, params?: any) {
  // Procreate Pocket 5 adjustments: the layer value is the swipe amount
  renderAdjustment(canvas, name, { ...normalizeParams(name, params), amount: Math.max(0, Math.min(100, value)) });
}

export function applyLiquify(canvas: HTMLCanvasElement, mode: LiquifyMode, values: { amount: number; size: number; pressure: number; distortion: number; momentum: number }) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const input = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  const source = input.data;
  const target = output.data;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(8, Math.min(width, height) * values.size / 100);
  const strength = values.amount / 100 * values.pressure / 100;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    let sx = x;
    let sy = y;
    const influence = Math.max(0, 1 - dist / radius);
    if (influence > 0) {
      if (mode === 'Twirl Right' || mode === 'Twirl Left') {
        const direction = mode === 'Twirl Right' ? 1 : -1;
        const angle = direction * strength * influence * (1 + values.distortion / 100) * 4;
        sx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
        sy = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
      } else if (mode === 'Pinch' || mode === 'Expand' || mode === 'Push') {
        const factor = mode === 'Expand' ? 1 + strength * influence : 1 - strength * influence * (mode === 'Push' ? .6 : 1);
        sx = cx + dx * factor;
        sy = cy + dy * factor;
      } else if (mode === 'Crystals' || mode === 'Edge') {
        const cell = Math.max(3, radius / (mode === 'Edge' ? 8 : 16));
        sx = Math.round(x / cell) * cell;
        sy = Math.round(y / cell) * cell;
      } else if (mode === 'Reconstruct') {
        sx = x * (1 - strength * influence) + cx * strength * influence;
        sy = y * (1 - strength * influence) + cy * strength * influence;
      }
    }
    const ix = Math.max(0, Math.min(width - 1, Math.round(sx)));
    const iy = Math.max(0, Math.min(height - 1, Math.round(sy)));
    const from = (iy * width + ix) * 4;
    const to = (y * width + x) * 4;
    target[to] = source[from]; target[to + 1] = source[from + 1]; target[to + 2] = source[from + 2]; target[to + 3] = source[from + 3];
  }
  context.putImageData(output, 0, 0);
}

function clamp(value: number) { return Math.max(0, Math.min(255, value)); }
