/* Gallery order + Procreate-style stacks. The gallery keeps its own order so
 * opening or editing a canvas never moves it; new canvases appear first. */
export type Entry = { t: 'a'; id: string } | { t: 's'; id: string; name: string; items: string[] };

export const entryKey = (e: Entry) => (e.t === 'a' ? e.id : `stack:${e.id}`);

/** Drops deleted artworks, removes empty stacks and puts unknown (new) artworks first. */
export function normalize(order: Entry[], ids: string[]): Entry[] {
  const live = new Set(ids);
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const e of order) {
    if (e.t === 'a') {
      if (live.has(e.id) && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
    } else {
      const items = e.items.filter((id) => live.has(id) && !seen.has(id));
      items.forEach((id) => seen.add(id));
      if (items.length) out.push({ ...e, items });
    }
  }
  const fresh = ids.filter((id) => !seen.has(id)).map((id): Entry => ({ t: 'a', id }));
  return [...fresh, ...out];
}

/** Moves the entry with `key` so it ends up at `index`. */
export function moveEntry(order: Entry[], key: string, index: number): Entry[] {
  const from = order.findIndex((e) => entryKey(e) === key);
  if (from < 0) return order;
  const next = [...order];
  const [m] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, m!);
  return next;
}

/** Drops `dragKey` onto `targetKey`: two artworks make a new stack, an artwork joins
 *  a stack, and a dragged stack pours its artworks into the target. */
export function stackOnto(order: Entry[], dragKey: string, targetKey: string, newId: string): Entry[] {
  if (dragKey === targetKey) return order;
  const drag = order.find((e) => entryKey(e) === dragKey);
  const target = order.find((e) => entryKey(e) === targetKey);
  if (!drag || !target) return order;
  const moving = drag.t === 'a' ? [drag.id] : drag.items;
  const rest = order.filter((e) => e !== drag);
  return rest.map((e) => {
    if (e !== target) return e;
    if (e.t === 's') return { ...e, items: [...e.items, ...moving] };
    return { t: 's', id: newId, name: 'Stack', items: [e.id, ...moving] } as Entry;
  });
}

/** Takes an artwork out of a stack and places it right after the stack. */
export function unstack(order: Entry[], stackId: string, artId: string): Entry[] {
  const idx = order.findIndex((e) => e.t === 's' && e.id === stackId);
  if (idx < 0) return order;
  const s = order[idx] as Extract<Entry, { t: 's' }>;
  const items = s.items.filter((id) => id !== artId);
  const next = [...order];
  next.splice(idx, 1, ...(items.length ? [{ ...s, items }] : []), { t: 'a', id: artId });
  return next;
}

export function reorderInStack(order: Entry[], stackId: string, artId: string, index: number): Entry[] {
  return order.map((e) => {
    if (e.t !== 's' || e.id !== stackId) return e;
    const items = e.items.filter((id) => id !== artId);
    items.splice(Math.max(0, Math.min(items.length, index)), 0, artId);
    return { ...e, items };
  });
}

export function renameStack(order: Entry[], stackId: string, name: string): Entry[] {
  return order.map((e) => (e.t === 's' && e.id === stackId ? { ...e, name } : e));
}

/** Fits one stacked canvas inside the stack's box at its OWN aspect ratio (centred),
 *  so a wide canvas under a tall one never takes the top canvas's shape. */
export function fitSheet(artW: number, artH: number, boxW: number, boxH: number) {
  const r = Math.max(1, artW) / Math.max(1, artH);
  const br = boxW / Math.max(1, boxH);
  const w = r >= br ? boxW : boxH * r;
  const h = r >= br ? boxW / r : boxH;
  return { left: (boxW - w) / 2, top: (boxH - h) / 2, width: w, height: h };
}
