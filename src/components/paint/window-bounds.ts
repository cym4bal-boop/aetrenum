export function constrainWindow(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number, margin = 6) {
  return {
    x: Math.max(margin, Math.min(Math.max(margin, viewportWidth - width - margin), x)),
    y: Math.max(margin, Math.min(Math.max(margin, viewportHeight - height - margin), y)),
  };
}