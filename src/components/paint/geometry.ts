// @ts-nocheck -- strict index checks relaxed for canvas pixel code.
// QuickShape recognition: decide what a held stroke should snap to.
export type Pt = { x: number; y: number };
export type QuickShapeResult =
  | { kind: 'line'; from: Pt; to: Pt }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; circle: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | null;

export function pathLength(points: Pt[]) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Returns the shape a stroke most resembles, or null when it is too short. */
export function detectShape(points: Pt[]): QuickShapeResult {
  if (points.length < 3) return null;
  const len = pathLength(points);
  if (len < 12) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  // Nearly straight: endpoints span almost the whole path.
  if (chord / len > 0.86) return { kind: 'line', from: first, to: last };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX, h = maxY - minY;
  const cx = minX + w / 2, cy = minY + h / 2;
  // Closed shape: see whether points hug the bounding box corners (rectangle) or not (ellipse).
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  const diag = Math.hypot(w, h) || 1;
  const cornerHits = corners.filter(([x, y]) => points.some((p) => Math.hypot(p.x - x, p.y - y) < diag * 0.09)).length;
  if (cornerHits >= 3) return { kind: 'rect', x: minX, y: minY, w, h };
  const ratio = Math.min(w, h) / (Math.max(w, h) || 1);
  return { kind: 'ellipse', cx, cy, rx: w / 2, ry: h / 2, circle: ratio > 0.85 };
}
