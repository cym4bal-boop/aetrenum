/** Presentation-only fill reveal. The committed layer and undo pixels stay atomic. */
export const FILL_WAVE_DURATION = 1100;
export function waveRadius(progress: number, maximum: number) {
  const t = Math.max(0, Math.min(1, progress));
  return maximum * (1 - Math.pow(1 - t, 2));
}
export function createFillWave(base: HTMLCanvasElement, final: HTMLCanvasElement, x: number, y: number) {
  const canvas = document.createElement('canvas');
  canvas.width = base.width; canvas.height = base.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const result = document.createElement('canvas');
  result.width = final.width; result.height = final.height;
  const resultContext = result.getContext('2d');
  if (!resultContext) return null;
  resultContext.drawImage(final, 0, 0);
  const maximum = Math.hypot(Math.max(x, canvas.width - x), Math.max(y, canvas.height - y)) + 2;
  return {
    canvas,
    draw(progress: number) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(base, 0, 0);
      context.save();
      context.beginPath(); context.arc(x, y, waveRadius(progress, maximum), 0, Math.PI * 2); context.clip();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(result, 0, 0); context.restore();
    },
  };
}