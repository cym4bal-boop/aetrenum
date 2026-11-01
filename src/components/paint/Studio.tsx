import { useEffect, useRef, useState } from 'react';
import { Editor } from './Editor';
import { installSuppliedLibrary } from './supplied-library';

// bundled MyPaint / Deevad / JSON brush packs, sorted into library categories
if (typeof window !== 'undefined') installSuppliedLibrary();
import { Gallery } from './Gallery';
import { applyTheme } from './settings';
import { canvasToBlob, clampSize, downloadBlob, loadImage, makeId, readArtworks, removeArtwork, writeArtwork, type Artwork } from './storage';
import { clearBackups } from './backups';
import { clearHistory } from './history-store';
import { composite, ctx2d, makeCanvas, type LayerState } from './doc';
import { importAny } from './formats';


type Rect = { left: number; top: number; width: number; height: number };

/** Procreate-style zoom veil: expands the tapped thumbnail into the editor, or shrinks back on exit. */
function Veil({ mode, rect, src, onDone }: { mode: 'open' | 'close'; rect: Rect; src?: string | undefined; onDone: () => void }) {
  const [go, setGo] = useState(false);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const t1 = window.setTimeout(() => setFade(true), mode === 'open' ? 400 : 80);
    const t2 = window.setTimeout(onDone, mode === 'open' ? 640 : 540);
    return () => { cancelAnimationFrame(r); window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const full = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const target = mode === 'open' ? full : rect;
  const start = mode === 'open' ? rect : full;
  const s = go ? target : start;
  return (
    <div className={`pp-open-veil ${fade ? 'pp-veil-fade' : ''}`} style={{ left: s.left, top: s.top, width: s.width, height: s.height }}>
      {src && <img src={src} alt="" />}
    </div>
  );
}

export default function Studio() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Artwork | null>(null);
  const [error, setError] = useState('');
  const [veil, setVeil] = useState<null | { mode: 'open' | 'close'; rect: Rect; src?: string | undefined }>(null);
  const openRect = useRef<Rect | null>(null);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Dark mode + accent color must be applied on app start, not only inside the editor,
  // so the theme survives a restart and shows on the gallery too.
  useEffect(() => { applyTheme(); }, []);
  useEffect(() => {
    void import('./supplied-library').then(({ installSuppliedLibrary }) => installSuppliedLibrary());
  }, []);

  useEffect(() => {
    void readArtworks().then((list) => {
      setArtworks(list);
    }).catch(() => setError('Could not open your gallery. Please try again.')).finally(() => setLoading(false));
  }, []);
  const update = (artwork: Artwork) => setArtworks((items) => [artwork, ...items.filter((a) => a.id !== artwork.id)].sort((a, b) => b.updated - a.updated));
  const persist = async (artwork: Artwork) => { await writeArtwork(artwork); update(artwork); };
  const perform = (task: () => Promise<void>) => { setError(''); void task().catch(() => setError('Could not save this change. Please try again.')); };

  const open = (a: Artwork, rect?: Rect) => {
    if (rect) openRect.current = rect;
    setCurrent(a);
    if (openRect.current && !reduced()) setVeil({ mode: 'open', rect: openRect.current, src: a.preview });
  };
  const exit = (a: Artwork) => {
    update(a);
    setCurrent(null);
    let rect = openRect.current;
    if (!rect) {
      const w = window.innerWidth, h = window.innerHeight;
      rect = { left: w / 2 - 90, top: h / 2 - 90, width: 180, height: 180 };
    }
    if (!reduced()) setVeil({ mode: 'close', rect, src: a.preview });
  };

  const create = (w: number, h: number, title = 'Untitled Artwork') => {
    const now = Date.now();
    const artwork: Artwork = { id: makeId(), title, ...clampSize(w, h), created: now, updated: now, background: '#ffffff', backgroundVisible: true, layers: [{ id: makeId(), name: 'Layer 1', visible: true }] };
    perform(async () => { await persist(artwork); open(artwork); });
  };
  const share = async (ids: string[]) => {
    for (const a of artworks.filter((item) => ids.includes(item.id))) {
      const layers: LayerState[] = [];
      for (const l of a.layers) {
        const canvas = makeCanvas(a.width, a.height);
        if (l.image) ctx2d(canvas).drawImage(await loadImage(l.image), 0, 0, a.width, a.height);
        layers.push({ ...l, canvas, opacity: l.opacity ?? 1, blend: l.blend ?? 'source-over', locked: l.locked ?? false, alphaLock: l.alphaLock ?? false });
      }
      const out = makeCanvas(a.width, a.height);
      composite(ctx2d(out), layers, a.background ?? '#ffffff', a.backgroundVisible ?? true);
      downloadBlob(await canvasToBlob(out), `${a.title}.png`);
    }
  };

  return <>
    {current ? <Editor key={current.id} artwork={current} onSaved={persist} onExit={exit} /> :
      <Gallery artworks={artworks} loading={loading} onOpen={open} onCreate={create}
        onImport={(files) => { setError(''); void (async () => {
          for (const file of Array.from(files)) {
            try {
              const { artwork, extras } = await importAny(file);
              if (extras?.palettes?.length) {
                try {
                  const cur = JSON.parse(localStorage.getItem('pp.palettes') ?? '[]') as { id: string }[];
                  const ids = new Set(cur.map((p) => p.id));
                  localStorage.setItem('pp.palettes', JSON.stringify([...cur, ...extras.palettes.filter((p) => !ids.has(p.id))]));
                } catch { /* ignore */ }
              }
              await persist(artwork);
            } catch { setError(`Couldn’t open “${file.name}”.`); }
          }
        })(); }}
        onDelete={(ids) => perform(async () => { for (const id of ids) { await removeArtwork(id); void clearBackups(id); void clearHistory(id); } setArtworks((items) => items.filter((a) => !ids.includes(a.id))); })}
        onDuplicate={(ids) => perform(async () => { for (const a of artworks.filter((item) => ids.includes(item.id))) { const now = Date.now(); await persist({ ...a, id: makeId(), title: `${a.title} copy`, created: now, updated: now, layers: a.layers.map((l) => ({ ...l, id: makeId() })) }); } })}
        onRename={(id, title) => { const a = artworks.find((item) => item.id === id); if (a) perform(() => persist({ ...a, title, updated: Date.now() })); }}
        onRestore={(a) => perform(() => persist(a))}
        onShare={(ids) => perform(() => share(ids))} />}
    {veil && <Veil mode={veil.mode} rect={veil.rect} src={veil.src} onDone={() => setVeil(null)} />}
    {error && <div role="alert" className="pp-toast" onClick={() => setError('')}>{error}</div>}
  </>;
}
