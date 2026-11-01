/* Per-canvas undo/redo persistence. History entries hold raw ImageData in memory;
 *  they are stored as PNG blobs (one per touched layer rect) so they survive
 *  leaving the canvas without exploding the database size. */
import type { LayerMeta } from './doc';
import { canvasToBlob, loadImage, openDatabase, HISTORY_STORE } from './storage';

export type Rect = { x: number; y: number; w: number; h: number };
export type HistPixels = { rect: Rect; data: ImageData };
export type HistEntry = { metas: LayerMeta[]; activeId: string; bg: string; bgVisible: boolean; pixels: Map<string, HistPixels> };

type StoredPixels = { id: string; rect: Rect; blob: Blob };
type StoredEntry = { metas: LayerMeta[]; activeId: string; bg: string; bgVisible: boolean; pixels: StoredPixels[] };
type StoredHistory = { id: string; undo: StoredEntry[]; redo: StoredEntry[] };

/** Undo depth the user asked for: 10000 steps, kept per canvas and never cleared. */
export const HISTORY_LIMIT = 10000;
const MAX_UNDO = HISTORY_LIMIT;
const MAX_REDO = HISTORY_LIMIT;

const packedEntries = new WeakMap<HistEntry, Promise<StoredEntry>>();

/** Entries are immutable snapshots; retain encoded PNGs across undo/redo moves. */
export function packEntry(e: HistEntry): Promise<StoredEntry> {
  const cached = packedEntries.get(e);
  if (cached) return cached;
  const pending = encodeEntry(e).catch((error) => {
    packedEntries.delete(e); // quota/transient failures must remain retryable
    throw error;
  });
  packedEntries.set(e, pending);
  return pending;
}

async function encodeEntry(e: HistEntry): Promise<StoredEntry> {
  const pixels: StoredPixels[] = [];
  for (const [id, p] of e.pixels) {
    const c = document.createElement('canvas');
    c.width = p.rect.w; c.height = p.rect.h;
    c.getContext('2d')!.putImageData(p.data, 0, 0);
    pixels.push({ id, rect: p.rect, blob: await canvasToBlob(c) });
  }
  return { metas: e.metas, activeId: e.activeId, bg: e.bg, bgVisible: e.bgVisible, pixels };
}

async function unpackEntry(s: StoredEntry): Promise<HistEntry> {
  const pixels = new Map<string, HistPixels>();
  for (const p of s.pixels) {
    try {
      const img = await loadImage(p.blob);
      const c = document.createElement('canvas');
      c.width = p.rect.w; c.height = p.rect.h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, p.rect.w, p.rect.h);
      pixels.set(p.id, { rect: p.rect, data: ctx.getImageData(0, 0, p.rect.w, p.rect.h) });
    } catch { /* skip a broken snapshot */ }
  }
  const entry = { metas: s.metas, activeId: s.activeId, bg: s.bg, bgVisible: s.bgVisible, pixels };
  packedEntries.set(entry, Promise.resolve(s));
  return entry;
}

type SaveJob = {
  undo: HistEntry[]; redo: HistEntry[]; version: number;
  timer?: ReturnType<typeof setTimeout>; waiters: Array<() => void>;
};
const pendingSaves = new Map<string, SaveJob>();
const versions = new Map<string, number>();
const writeQueues = new Map<string, Promise<void>>();

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 750 });
    else setTimeout(resolve, 0);
  });
}

/** Serialise writes/deletes per canvas; deletion cannot race an older save. */
function queueWrite(id: string, work: () => Promise<void>): Promise<void> {
  const next = (writeQueues.get(id) ?? Promise.resolve()).then(work).catch(() => {});
  writeQueues.set(id, next);
  void next.then(() => { if (writeQueues.get(id) === next) writeQueues.delete(id); });
  return next;
}

export function saveHistory(id: string, undo: HistEntry[], redo: HistEntry[]): Promise<void> {
  let job = pendingSaves.get(id);
  if (!job) {
    job = { undo: [], redo: [], version: 0, waiters: [] };
    pendingSaves.set(id, job);
  }
  job.undo = undo.slice(-MAX_UNDO);
  job.redo = redo.slice(-MAX_REDO);
  job.version = (versions.get(id) ?? 0) + 1;
  versions.set(id, job.version);
  clearTimeout(job.timer);
  const completion = new Promise<void>((resolve) => job!.waiters.push(resolve));
  const snapshot = job;
  job.timer = setTimeout(() => {
    pendingSaves.delete(id);
    void persistHistory(id, snapshot).finally(() => snapshot.waiters.forEach((resolve) => resolve()));
  }, 180);
  return completion;
}

async function persistHistory(id: string, job: SaveJob) {
  try {
    const pack = async (entries: HistEntry[]) => {
      const result: StoredEntry[] = [];
      for (const entry of entries) {
        if (versions.get(id) !== job.version) return null;
        // Yield before every new snapshot rather than scheduling 10,000 PNGs at once.
        if (!packedEntries.has(entry)) await idle();
        if (versions.get(id) !== job.version) return null;
        result.push(await packEntry(entry));
      }
      return result;
    };
    const undo = await pack(job.undo);
    const redo = await pack(job.redo);
    if (!undo || !redo) return;
    await queueWrite(id, async () => {
      if (versions.get(id) !== job.version) return;
      const db = await openDatabase();
      if (versions.get(id) !== job.version) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).put({ id, undo, redo });
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    });
  } catch { /* history is best-effort */ }
}

export async function loadHistory(id: string): Promise<{ undo: HistEntry[]; redo: HistEntry[] } | null> {
  try {
    const db = await openDatabase();
    const stored = await new Promise<StoredHistory | undefined>((resolve, reject) => {
      const request = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(id);
      request.onsuccess = () => resolve(request.result as StoredHistory | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!stored) return null;
    return {
      undo: await Promise.all(stored.undo.map(unpackEntry)),
      redo: await Promise.all(stored.redo.map(unpackEntry)),
    };
  } catch {
    return null;
  }
}

export async function clearHistory(id: string) {
  versions.set(id, (versions.get(id) ?? 0) + 1);
  const pending = pendingSaves.get(id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(id);
    pending.waiters.forEach((resolve) => resolve());
  }
  await queueWrite(id, async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  });
}

/** Raw (packed) history record, used by the .arnm file format. */
export type PackedHistory = { undo: StoredEntry[]; redo: StoredEntry[] };
export async function readPackedHistory(id: string): Promise<PackedHistory | null> {
  try {
    const db = await openDatabase();
    const s = await new Promise<StoredHistory | undefined>((resolve, reject) => {
      const r = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(id);
      r.onsuccess = () => resolve(r.result as StoredHistory | undefined);
      r.onerror = () => reject(r.error);
    });
    return s ? { undo: s.undo, redo: s.redo } : null;
  } catch { return null; }
}
export async function writePackedHistory(id: string, h: PackedHistory) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const r = db.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).put({ id, ...h });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
