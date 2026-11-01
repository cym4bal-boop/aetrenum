/** Browser-safe binary plist reader for Procreate NSKeyedArchiver settings. */
export function readBrushArchive(bytes: Uint8Array): Record<string, unknown> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  if (text.decode(bytes.slice(0, 8)) !== 'bplist00' || bytes.length < 40) throw new Error('Unsupported brush settings archive');
  const uint = (at: number, length: number) => {
    if (length > 8 || at < 0 || at + length > bytes.length) throw new Error('Invalid plist offset');
    let value = 0;
    for (let i = 0; i < length; i++) value = value * 256 + (bytes[at + i] ?? 0);
    if (!Number.isSafeInteger(value)) throw new Error('Plist integer exceeds safe range');
    return value;
  };
  const trailer = bytes.length - 32;
  const offsetSize = bytes[trailer + 6] ?? 0;
  const refSize = bytes[trailer + 7] ?? 0;
  const count = uint(trailer + 8, 8);
  const root = uint(trailer + 16, 8);
  const table = uint(trailer + 24, 8);
  if (!count || count > 50000 || !refSize || !offsetSize) throw new Error('Invalid plist table');
  const cache = new Map<number, unknown>();
  const read = (id: number, depth = 0): any => {
    if (depth > 40 || id >= count) throw new Error('Invalid plist reference');
    if (cache.has(id)) return cache.get(id);
    let at = uint(table + id * offsetSize, offsetSize);
    const marker = bytes[at++] ?? 0;
    const type = marker >> 4;
    let length = marker & 15;
    if ([4, 5, 6, 10, 13].includes(type) && length === 15) {
      const sizeMarker = bytes[at++] ?? 0;
      if (sizeMarker >> 4 !== 1) throw new Error('Invalid plist length');
      const size = 2 ** (sizeMarker & 15); length = uint(at, size); at += size;
    }
    if (length > bytes.length) throw new Error('Invalid plist length');
    let value: unknown;
    if (type === 0) value = marker === 9 ? true : marker === 8 ? false : null;
    else if (type === 1) value = uint(at, 2 ** length);
    else if (type === 2) value = length === 2 ? view.getFloat32(at) : view.getFloat64(at);
    else if (type === 4) value = bytes.slice(at, at + length);
    else if (type === 5) value = text.decode(bytes.slice(at, at + length));
    else if (type === 6) { let str = ''; for (let i = 0; i < length; i++) str += String.fromCharCode(view.getUint16(at + i * 2)); value = str; }
    else if (type === 8) value = { uid: uint(at, length + 1) };
    else if (type === 10) value = Array.from({ length }, (_, i) => read(uint(at + i * refSize, refSize), depth + 1));
    else if (type === 13) {
      const obj: Record<string, unknown> = Object.create(null);
      for (let i = 0; i < length; i++) obj[String(read(uint(at + i * refSize, refSize), depth + 1))] = read(uint(at + (length + i) * refSize, refSize), depth + 1);
      value = obj;
    } else throw new Error('Unsupported plist value');
    cache.set(id, value); return value;
  };
  const archive = read(root);
  // plain (non-keyed) plists such as brushset.plist are returned as-is
  if (!archive || typeof archive !== 'object' || !Array.isArray(archive.$objects)) return archive ?? {};
  const objects = archive.$objects;
  const resolve = (value: any, depth = 0): any => {
    if (depth > 30) return undefined;
    if (value && typeof value === 'object' && 'uid' in value) return resolve(objects[value.uid], depth + 1);
    if (Array.isArray(value)) return value.map((v) => resolve(v, depth + 1));
    if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
      const out: Record<string, unknown> = Object.create(null);
      for (const [key, v] of Object.entries(value)) if (key !== '$class') out[key] = resolve(v, depth + 1);
      return out;
    }
    return value;
  };
  return resolve(archive.$top.root);
}