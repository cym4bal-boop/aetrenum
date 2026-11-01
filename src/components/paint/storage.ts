// IndexedDB persistence for artworks. Layers are stored as PNG blobs (older saves used data URLs).
export type BlendMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge'
  | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue'
  | 'saturation' | 'color' | 'luminosity' | 'lighter';

export type StoredLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity?: number; // 0-1
  blend?: BlendMode;
  locked?: boolean;
  alphaLock?: boolean;
  kind?: 'pixel' | 'adjust' | 'group';
  parent?: string;
  collapsed?: boolean;
  clip?: boolean;
  adjust?: { name: string; value: number; params?: Record<string, unknown> };
  image?: Blob | string;
};

export type Artwork = {
  id: string;
  title: string;
  width: number;
  height: number;
  created: number;
  updated: number;
  background?: string;
  backgroundVisible?: boolean;
  layers: StoredLayer[];
  preview?: string;
  palette?: string[];
  /** Canvas paper texture id (see textures.ts) and its strength 0-1 */
  texture?: { id: string; strength: number } | null;
  /** Active selection outline, kept by the .arnm format */
  selection?: { outlines: { x: number; y: number }[][]; inverted: boolean } | null;
};

const DB_NAME = 'aeternum-paint-studio';
const STORE = 'artworks';
export const HISTORY_STORE = 'history';
export const BACKUP_STORE = 'backups';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(HISTORY_STORE)) request.result.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(BACKUP_STORE)) request.result.createObjectStore(BACKUP_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* Deleted artwork ids are remembered so a late autosave (or an old build that
 * seeded starter canvases) can never bring a deleted canvas back. */
const TOMBSTONES = 'pp.deletedArtworks';
export function deletedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TOMBSTONES) ?? '[]') as string[]); } catch { return new Set(); }
}
function rememberDeleted(id: string) {
  try { const s = deletedIds(); s.add(id); localStorage.setItem(TOMBSTONES, JSON.stringify([...s].slice(-500))); } catch { /* ignore */ }
}

/** An untouched placeholder record: never opened/saved (no preview) and no painted layer. */
export function isGhostArtwork(a: Artwork): boolean {
  return !a.preview && !(a.layers ?? []).some((l) => !!l.image);
}

export async function readArtworks(): Promise<Artwork[]> {
  try {
    const db = await openDatabase();
    const all = await new Promise<Artwork[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as Artwork[]);
      request.onerror = () => reject(request.error);
    });
    const dead = deletedIds();
    const keep: Artwork[] = [];
    for (const a of all) {
      if (dead.has(a.id) || isGhostArtwork(a)) { void removeArtwork(a.id).catch(() => undefined); continue; }
      keep.push(a);
    }
    return keep.sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

export async function writeArtwork(artwork: Artwork) {
  if (deletedIds().has(artwork.id)) return; // deleted canvases stay deleted
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(artwork);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeArtwork(id: string) {
  rememberDeleted(id);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => { resolve(img); if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = reject;
    img.src = url;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Largest side we allow for a canvas, keeps memory in check on phones. */
export const MAX_SIDE = 4096;
export function clampSize(w: number, h: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Builds a new artwork from an imported image file. */
export async function artworkFromImage(file: Blob, title = 'Untitled Artwork'): Promise<Artwork> {
  const img = await loadImage(file);
  const { width, height } = clampSize(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d')!.drawImage(img, 0, 0, width, height);
  const blob = await canvasToBlob(c);
  const p = document.createElement('canvas');
  // Gallery previews stay sharp when zoomed: keep a high-res copy instead of a tiny thumbnail.
  const s = Math.min(1, 1400 / Math.max(width, height));
  p.width = Math.round(width * s); p.height = Math.round(height * s);
  const pc = p.getContext('2d')!;
  pc.fillStyle = '#ffffff'; pc.fillRect(0, 0, p.width, p.height);
  pc.drawImage(c, 0, 0, p.width, p.height);
  const now = Date.now();
  return {
    id: makeId(), title, width, height, created: now, updated: now,
    background: '#ffffff', backgroundVisible: true,
    layers: [{ id: makeId(), name: 'Inserted Image', visible: true, opacity: 1, blend: 'source-over', image: blob }],
    preview: p.toDataURL('image/jpeg', 0.95),
  };
}
