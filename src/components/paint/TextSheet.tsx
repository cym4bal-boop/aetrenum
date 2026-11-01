import { useEffect, useRef, useState } from 'react';
import { Check, Download, Keyboard, X } from 'lucide-react';
import { Sheet } from './Sheet';
import { googleFonts, importFont, loadFamily, loadPreviewFonts, restoreCustomFonts, weightName, type FontDef, type TextDraft } from './text';

/* Procreate-style text window: Typeface / Design / Attributes tabs, with
 * cancel, keyboard, import-font and apply buttons on top. */
export function TextSheet({ draft, onChange, onCancel, onApply, onNotice }: {
  draft: TextDraft;
  onChange: (d: TextDraft) => void;
  onCancel: () => void;
  onApply: () => void;
  onNotice: (m: string) => void;
}) {
  const [tab, setTab] = useState<'type' | 'design' | 'attr'>('type');
  const [custom, setCustom] = useState<FontDef[]>([]);
  const [typing, setTyping] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const fonts = [...custom, ...googleFonts];
  const cur = fonts.find((f) => f.family === draft.family) ?? googleFonts[0]!;
  useEffect(() => { loadPreviewFonts(); void restoreCustomFonts().then(setCustom); }, []);
  useEffect(() => { loadFamily(cur); }, [cur]);
  const set = (p: Partial<TextDraft>) => onChange({ ...draft, ...p });
  const pick = (f: FontDef) => {
    loadFamily(f);
    const w = f.weights.includes(draft.weight) ? draft.weight : f.weights.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a));
    set({ family: f.family, weight: w });
  };
  const range = (label: string, key: 'size' | 'tracking' | 'leading' | 'opacity', min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label className="pp-range-row compact"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={draft[key]} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<TextDraft>)} />
      <b>{fmt(draft[key])}</b></label>
  );
  const toggle = (label: string, key: 'caps' | 'underline' | 'outline') => (
    <button type="button" className={`pp-text-toggle ${draft[key] ? 'on' : ''}`} aria-pressed={draft[key]} onClick={() => set({ [key]: !draft[key] } as Partial<TextDraft>)}>{label}</button>
  );
  return (
    <Sheet modal={false} label="Add text" className="pp-bottombar pp-text-sheet" onClose={onCancel}>
      <div className="pp-text-top">
        <button type="button" className="pp-text-btn" aria-label="Cancel text" onClick={onCancel}><X size={22} /></button>
        <span className="pp-text-spacer" />
        <button type="button" className={`pp-text-btn ${typing ? 'on' : ''}`} aria-label="Edit text" aria-pressed={typing} onClick={() => setTyping((v) => !v)}><Keyboard size={22} /></button>
        <button type="button" className="pp-text-btn" aria-label="Import font" onClick={() => fileRef.current?.click()}><Download size={21} /></button>
        <button type="button" className="pp-text-btn primary" aria-label="Add text to canvas" onClick={onApply}><Check size={22} strokeWidth={2.6} /></button>
        <input ref={fileRef} hidden type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          void importFont(f).then((def) => { setCustom((c) => [def, ...c.filter((x) => x.family !== def.family)]); set({ family: def.family, weight: 400 }); onNotice(`${def.family} imported`); })
            .catch(() => onNotice('That font file could not be read'));
        }} />
      </div>
      {typing && <textarea className="pp-text-input" autoFocus value={draft.value} aria-label="Text" onChange={(e) => set({ value: e.target.value })} rows={2} />}
      <div className="pp-text-tabs" role="tablist">
        {([['type', 'Typeface'], ['design', 'Design'], ['attr', 'Attributes']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'type' && (
        <div className="pp-text-type">
          <div className="pp-text-col" role="listbox" aria-label="Typeface">
            {fonts.map((f) => (
              <button key={f.family} type="button" role="option" aria-selected={f.family === draft.family} className={f.family === draft.family ? 'on' : ''}
                style={{ fontFamily: `"${f.family}", sans-serif` }} onClick={() => pick(f)}>{f.family}</button>
            ))}
          </div>
          <div className="pp-text-col" role="listbox" aria-label="Style">
            {cur.weights.map((w) => (
              <button key={w} type="button" role="option" aria-selected={w === draft.weight} className={w === draft.weight ? 'on' : ''}
                style={{ fontFamily: `"${cur.family}", sans-serif`, fontWeight: w }} onClick={() => set({ weight: w })}>{weightName[w] ?? w}</button>
            ))}
          </div>
        </div>
      )}
      {tab === 'design' && (
        <div className="pp-text-pane">
          {range('Size', 'size', 8, 1200, 1, (v) => `${v}px`)}
          {range('Tracking', 'tracking', -50, 200, 1, (v) => `${v}`)}
          {range('Leading', 'leading', 0.6, 3, 0.05, (v) => v.toFixed(2))}
          {range('Opacity', 'opacity', 0.05, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
        </div>
      )}
      {tab === 'attr' && (
        <div className="pp-text-pane">
          <div className="pp-text-row">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" className={`pp-text-toggle ${draft.align === a ? 'on' : ''}`} aria-pressed={draft.align === a} onClick={() => set({ align: a })}>{a[0]!.toUpperCase() + a.slice(1)}</button>
            ))}
          </div>
          <div className="pp-text-row">{toggle('All caps', 'caps')}{toggle('Underline', 'underline')}{toggle('Outline', 'outline')}</div>
        </div>
      )}
    </Sheet>
  );
}
