/** Shared corner-only snapping for the draggable toolbar and layers panel.
 *  Panels never seat at edge or screen centers — only the four corners. */
export type Seat = { x: number; y: number; l: boolean; r: boolean; t: boolean; b: boolean };

export function cornerSnap(
  p: { x: number; y: number }, w: number, h: number, vw: number, vh: number, M = 14,
  prefer?: { left?: boolean; top?: boolean },
): Seat {
  const cx = p.x + w / 2, cy = p.y + h / 2;
  const left = prefer?.left ?? cx <= vw / 2, top = prefer?.top ?? cy <= vh / 2;
  const x = Math.max(M, Math.min(vw - M - w, left ? M : vw - M - w));
  const y = Math.max(M, Math.min(vh - M - h, top ? M : vh - M - h));
  return { x, y, l: left, r: !left, t: top, b: !top };
}
