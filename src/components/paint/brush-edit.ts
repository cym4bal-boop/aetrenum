import type { BrushDef } from './brushes';

/** A saved edit never replaces a supplied/built-in original. */
export function editableBrushCopy(brush: BrushDef, timestamp = Date.now()): BrushDef {
  return brush.id.startsWith('custom-') ? { ...brush } : {
    ...brush, id: `custom-${brush.id}-${timestamp}`, name: `${brush.name} copy`,
  };
}