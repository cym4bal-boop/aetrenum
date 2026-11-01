/* QuickMenu (Procreate Pocket): six pill buttons around a central profile button.
 * Tap a button to run it (menu closes); press-and-hold to open Set Action.
 * Tap the centre for the QuickMenu profile list: + adds a profile with No Action,
 * tap a profile to select it, double-tap its title to rename, hold it to delete. */
import { useEffect, useRef, useState } from 'react';
import { activeProfile, clampCentre, QUICK_ACTION_IDS, QUICK_ACTIONS, quickReducer, readQuick, SLOT_COUNT, writeQuick, type QuickAction, type QuickOp, type QuickState } from './quickmenu';
import './quickmenu.css';

// slot positions (top, upper right, lower right, bottom, lower left, upper left), in px from the centre
const POS: [number, number][] = [[0, -98], [146, -50], [146, 50], [0, 98], [-146, 50], [-146, -50]];

export function QuickMenu({ x, y, onRun, onClose }: { x: number; y: number; onRun: (a: QuickAction) => void; onClose: () => void }) {
  const [state, setState] = useState<QuickState>(() => readQuick());
  const [picking, setPicking] = useState<number | null>(null);
  const [profiles, setProfiles] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [closing, setClosing] = useState<null | number>(null);
  const [hot, setHot] = useState<number>(-1);
  const slotAt = (cx: number, cy: number) => { const el = document.elementFromPoint(cx, cy)?.closest('[data-qm-slot]') as HTMLElement | null; return el ? Number(el.dataset['qmSlot']) : -1; };
  const hold = useRef<{ timer: number; fired: boolean } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const prof = activeProfile(state);
  const c = clampCentre(x, y, 150, window.innerWidth, window.innerHeight, 64);

  const apply = (op: QuickOp) => setState((s) => { const n = quickReducer(s, op); writeQuick(n); return n; });
  const close = (run?: QuickAction, slot = -1) => {
    if (closing !== null) return;
    setClosing(slot);
    // run instantly so the action never waits on the exit animation
    if (run && run !== 'none') onRun(run);
    window.setTimeout(onClose, 160);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startHold = (fn: () => void) => {
    const h = { timer: 0, fired: false };
    h.timer = window.setTimeout(() => { h.fired = true; fn(); }, 480);
    hold.current = h;
  };
  const endHold = () => { const h = hold.current; hold.current = null; if (h) window.clearTimeout(h.timer); return h; };
  const panelOpen = picking !== null || profiles;
  const panelW = Math.min(300, window.innerWidth - 24);

  return (
    <div className={`pp-qm ${closing !== null ? 'is-closing' : ''}`} role="dialog" aria-label="QuickMenu"
      onPointerUp={(e) => { if (e.target !== e.currentTarget || panelOpen) return; const i = slotAt(e.clientX, e.clientY); if (i >= 0) close(prof.slots[i], i); }}
      onPointerMove={(e) => { if (panelOpen || closing !== null) return; const i = slotAt(e.clientX, e.clientY); if (i !== hot) { setHot(i); if (i >= 0) { try { navigator.vibrate?.(6); } catch { /* ignore */ } } } }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { if (panelOpen) { setPicking(null); setProfiles(false); setRenaming(null); } else close(); } }}>
      <div className="pp-qm-ring" style={{ left: c.x, top: c.y }}>
        {prof.slots.slice(0, SLOT_COUNT).map((a, i) => (
          <button key={i} type="button" data-qm-slot={i} className={`pp-qm-btn ${hot === i ? 'is-hot' : ''} ${closing === i || picking === i ? 'is-chosen' : ''} ${a === 'none' ? 'is-empty' : ''}`}
            style={{ '--qx': `${POS[i]![0]}px`, '--qy': `${POS[i]![1]}px`, animationDelay: `${i * 22}ms` } as React.CSSProperties}
            aria-label={`${QUICK_ACTIONS[a]} (hold to change)`}
            onPointerDown={() => startHold(() => { setProfiles(false); setPicking(i); })}
            onPointerUp={() => { const h = endHold(); if (h && !h.fired && !panelOpen) close(a, i); }}
            onPointerLeave={() => { endHold(); }}
            onContextMenu={(e) => e.preventDefault()}>
            <span>{QUICK_ACTIONS[a]}</span>
          </button>
        ))}
        <button type="button" className="pp-qm-hub" aria-label={`${prof.name}. Tap to choose a QuickMenu profile.`} onClick={() => { setPicking(null); setProfiles((v) => !v); }}>
          <span>{prof.name}</span>
        </button>
      </div>

      {panelOpen && (
        <div className="pp-qm-panel" style={{ width: panelW, left: Math.max(12, Math.min(window.innerWidth - panelW - 12, c.x - panelW / 2)), top: Math.max(12, Math.min(window.innerHeight - 352, c.y - 150)) }}
          onPointerDown={(e) => e.stopPropagation()}>
          {picking !== null ? <>
            <header><h3>Set Action</h3></header>
            <div className="pp-qm-list">
              {QUICK_ACTION_IDS.map((id) => (
                <button key={id} type="button" className={prof.slots[picking] === id ? 'on' : ''} onClick={() => { apply({ type: 'assign', slot: picking, action: id }); setPicking(null); }}>{QUICK_ACTIONS[id]}</button>
              ))}
            </div>
          </> : <>
            <header><h3>QuickMenu</h3>
              <button type="button" className="pp-qm-add" aria-label="Add QuickMenu profile" onClick={() => apply({ type: 'create' })}>
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </button>
            </header>
            <div className="pp-qm-list">
              {state.profiles.map((p) => renaming === p.id ? (
                <input key={p.id} autoFocus className="pp-qm-rename" value={draft} aria-label="Profile name" onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { apply({ type: 'rename', id: p.id, name: draft }); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
              ) : (
                <button key={p.id} type="button" className={p.id === state.active ? 'on' : ''}
                  onPointerDown={() => startHold(() => { if (state.profiles.length > 1 && window.confirm(`Delete ${p.name}?`)) apply({ type: 'delete', id: p.id }); })}
                  onPointerUp={() => {
                    const h = endHold(); if (h?.fired) return;
                    const now = performance.now(), prev = lastTap.current;
                    if (prev && prev.id === p.id && now - prev.t < 380) { lastTap.current = null; setDraft(p.name); setRenaming(p.id); return; }
                    lastTap.current = { id: p.id, t: now };
                    apply({ type: 'switch', id: p.id });
                  }}
                  onPointerLeave={() => endHold()}
                  onContextMenu={(e) => e.preventDefault()}>{p.name}</button>
              ))}
            </div>
            <p className="pp-qm-hint">Double-tap a title to rename · hold to delete</p>
          </>}
        </div>
      )}
    </div>
  );
}
