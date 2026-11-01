import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';

/** iOS-style floating bottom sheet with a grab handle; drag the handle to resize or dismiss. */
export function Sheet({ children, onClose, dim = false, className = '', label, height, modal = true }: {
  children: ReactNode;
  onClose: () => void;
  dim?: boolean;
  className?: string;
  label: string;
  height?: string;
  modal?: boolean;
}) {
  const [drag, setDrag] = useState<{ ty: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resized, setResized] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const start = useRef<{ y: number; height: number; time: number; delta: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  };
  // a single tap on the canvas closes open windows (modal sheets only)
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (!modal) return;
    const onTap = () => closeRef.current();
    window.addEventListener('pp-close-windows', onTap);
    return () => window.removeEventListener('pp-close-windows', onTap);
  }, [modal]);
  const down = (e: PointerEvent) => {
    if (!sheet.current || closing) return;
    start.current = { y: e.clientY, height: sheet.current.getBoundingClientRect().height, time: performance.now(), delta: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  // Continuous resize: the top edge follows the finger while it can grow, then the
  // whole sheet glides with the finger once the height is clamped — no snaps.
  const move = (e: PointerEvent) => {
    const g = start.current;
    if (!g) return;
    const delta = e.clientY - g.y;
    g.delta = delta;
    const maxH = window.innerHeight - 50;
    const raw = g.height - delta;
    setResized(Math.max(180, Math.min(maxH, raw)));
    const ty = raw > maxH ? delta + maxH - g.height : raw < 180 ? delta : 0;
    setDrag(ty ? { ty } : null);
  };
  const up = (e: PointerEvent) => {
    const gesture = start.current;
    if (!gesture) return;
    start.current = null;
    if (e.type !== 'pointercancel') {
      if (gesture.delta < -30) {
        setResized(Math.min(window.innerHeight - 50, Math.round(window.innerHeight * 0.88)));
      } else if (gesture.delta > 90 || (gesture.delta > 35 && gesture.delta / Math.max(1, performance.now() - gesture.time) > .65)) {
        close();
      }
    }
    setDragging(false);
    setDrag(null);
  };
  return createPortal(
    <>
      {modal && <div className={`pp-scrim ${className.includes('pp-nested-menu') ? 'pp-nested-scrim' : ''} ${dim ? 'pp-scrim-dim' : ''} ${closing ? 'pp-scrim-closing' : ''}`} aria-hidden="true" onClick={dim ? close : undefined} />}
      <section
        ref={sheet}
        role="dialog"
        aria-label={label}
        className={`pp-sheet ${className} ${closing ? 'pp-sheet-closing' : ''} ${dragging ? 'pp-sheet-dragging' : ''}`}
        style={{
          transform: !closing && drag ? `translateY(${drag.ty}px)` : undefined,
          height: resized !== null ? `${resized}px` : (height && height !== 'auto' ? height : 'auto'),
          minHeight: resized !== null ? 0 : undefined,
          maxHeight: resized !== null ? undefined : 'min(88dvh, 760px)',
        }}
        onWheel={(e) => {
          if (e.deltaY > 15 && resized === null && height === '50dvh') {
            setResized(Math.min(window.innerHeight - 50, Math.round(window.innerHeight * 0.88)));
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
      >
        <Button variant="paint" size="paint" className="pp-handle-zone" aria-label={`Resize ${label}`} title="Drag, swipe up, or tap to expand"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onClick={() => {
            if (height === '50dvh' || height === 'auto') {
              setResized((prev) => (prev !== null ? null : Math.min(window.innerHeight - 50, Math.round(window.innerHeight * 0.88))));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const current = sheet.current?.getBoundingClientRect().height ?? 300;
              setResized(Math.max(180, Math.min(window.innerHeight - 50, current + (e.key === 'ArrowUp' ? 60 : -60))));
            }
          }}>
          <div className="pp-handle" />
        </Button>
        {children}
      </section>
    </>, document.body
  );
}
