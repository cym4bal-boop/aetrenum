/* Canvas backups for the Restore menu. A backup is a full artwork snapshot saved
 *  when the editor is left after changes were made. Kept per canvas, newest first. */
import { openDatabase, BACKUP_STORE, type Artwork } from './storage';

export type Backup = { key: string; artworkId: string; ts: number; title: string; preview?: string | undefined; snapshot: Artwork };

const MAX_BACKUPS = 10;

export async function saveBackup(snapshot: Artwork) {
  try {
    const db = await openDatabase();
    const backup: Backup = {
      key: `${snapshot.id}:${Date.now()}`,
      artworkId: snapshot.id,
      ts: Date.now(),
      title: snapshot.title,
      preview: snapshot.preview,
      snapshot,
    };
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(BACKUP_STORE, 'readwrite').objectStore(BACKUP_STORE).put(backup);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await pruneBackups(snapshot.id);
  } catch { /* backups are best-effort */ }
}

export async function listBackups(artworkId: string): Promise<Backup[]> {
  try {
    const db = await openDatabase();
    const all = await new Promise<Backup[]>((resolve, reject) => {
      const request = db.transaction(BACKUP_STORE, 'readonly').objectStore(BACKUP_STORE).getAll();
      request.onsuccess = () => resolve(request.result as Backup[]);
      request.onerror = () => reject(request.error);
    });
    return all.filter((b) => b.artworkId === artworkId).sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function deleteBackup(key: string) {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(BACKUP_STORE, 'readwrite').objectStore(BACKUP_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* ignore */ }
}

export async function clearBackups(artworkId: string) {
  const all = await listBackups(artworkId);
  for (const b of all) await deleteBackup(b.key);
}

async function pruneBackups(artworkId: string) {
  const all = await listBackups(artworkId);
  for (const b of all.slice(MAX_BACKUPS)) await deleteBackup(b.key);
}
