/* Pure helpers for the layer list. Layers are stored flat, top first; a group's
 * children follow it directly in the array and point at it with `parent`.
 * Groups nest one level deep (Procreate-style folders). */
export type TreeItem = { id: string; kind?: 'pixel' | 'adjust' | 'group'; parent?: string; collapsed?: boolean };

export const isGroup = (l: TreeItem) => l.kind === 'group';

/** Index range [start, end) of an item plus its children. */
export function blockRange<T extends TreeItem>(list: T[], id: string): [number, number] {
  const start = list.findIndex((l) => l.id === id);
  if (start < 0) return [-1, -1];
  let end = start + 1;
  if (isGroup(list[start]!)) while (end < list.length && list[end]!.parent === id) end++;
  return [start, end];
}

/** Rows shown in the layers bar (children of collapsed groups are hidden). */
export function visibleRows<T extends TreeItem>(list: T[]): T[] {
  const collapsed = new Set(list.filter((l) => isGroup(l) && l.collapsed).map((l) => l.id));
  return list.filter((l) => !l.parent || !collapsed.has(l.parent));
}

/** Children of a parent (undefined = top level), top first. */
export function childrenOf<T extends TreeItem>(list: T[], parent?: string): T[] {
  return list.filter((l) => (l.parent ?? undefined) === parent);
}

/**
 * Moves the row at visible index `from` so it lands at visible index `to`.
 * The row adopts a parent from its new neighbourhood: dropped right under an
 * open group header it joins that group; next to a child it joins the child's
 * group; elsewhere it becomes top level. Groups never nest.
 */
export function moveRow<T extends TreeItem>(list: T[], from: number, to: number): T[] {
  const rows = visibleRows(list);
  const item = rows[from];
  if (!item || from === to) return list;
  const [s, e] = blockRange(list, item.id);
  const block = list.slice(s, e);
  const rest = [...list.slice(0, s), ...list.slice(e)];
  const restRows = visibleRows(rest);
  // the visible row the item is dropped after (null = very top)
  const target = Math.max(0, Math.min(to, restRows.length));
  const above = target > 0 ? restRows[target - 1] : null;
  let parent: string | undefined;
  let insertAt: number;
  if (!above) { parent = undefined; insertAt = 0; }
  else if (isGroup(above) && !above.collapsed) { parent = above.id; insertAt = rest.indexOf(above) + 1; }
  else if (isGroup(above)) { parent = above.parent; insertAt = blockRange(rest, above.id)[1]; }
  else { parent = above.parent; insertAt = rest.indexOf(above) + 1; }
  if (isGroup(item) && parent) {
    // a group can't go inside another group: place it after that group's block
    insertAt = blockRange(rest, parent)[1];
    parent = undefined;
  }
  const head = { ...block[0]!, parent } as T;
  const moved = [head, ...block.slice(1)];
  return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
}
