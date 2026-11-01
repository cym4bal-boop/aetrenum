// Hand-drawn SF-Symbols-style glyphs used by the toolbar so it matches the reference UI.
import { useId } from 'react';

type P = { size?: number; className?: string };

export function BrushGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.6 2.2c.5-.4 1.2.2.8.8l-8.3 10.6-1.9-1.9L20.6 2.2Z" />
      <path d="M10.4 12.6l1.9 1.9c-.4 2.1-1.9 3.6-3.9 3.6-.9 0-1.4.4-1.9 1.3-.8 1.4-2.3 2.4-4.6 2.5 1.2-1.4 1.2-2.7 1.4-4 .4-2.5 2.2-4.4 4.9-4.9.8-.1 1.5-.2 2.2-.4Z" />
    </svg>
  );
}

export function SmudgeGlyph({ size = 24, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.2 2.4c.9-.6 2-.3 2.5.5l3.4 5.5c.6 1 .3 2.2-.6 2.8l-2.8 1.8.6 1c.5.9.4 2-.3 2.7l-2.6 2.7c-.5.5-1.1.7-1.8.6l-3.3-.5c-.6-.1-1.1.1-1.5.6L5.6 22.6c-.4.5-1.1.4-1.4-.1L2.5 20c-.3-.4-.2-1 .2-1.3l2.1-1.9c.4-.4.6-1 .4-1.6l-.6-2.4c-.2-.8 0-1.6.6-2.1L14.2 2.4Z" />
    </svg>
  );
}

export function EraserGlyph({ size = 24, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M15.7 3.2c.8-.6 1.9-.5 2.5.3l3.1 3.7c.6.8.5 1.9-.2 2.5L11 18.6 4.6 11l11.1-7.8Z" />
      <path d="M3.6 11.8l6.4 7.6-1.3 1c-.8.6-1.9.5-2.5-.3l-3.4-4c-.7-.8-.6-2 .2-2.6l.6-1.7Z" opacity=".85" />
    </svg>
  );
}

export function LayersGlyph({ size = 24, className }: P) {
  const id = `layers-cut-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  /* Front box erases the area it covers — plus a thin gap — out of the back box,
     so the two layers read as separate sheets with no outline. */
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <rect x="1.6" y="7" width="15.4" height="15.4" rx="4.3" fill="#000" />
        </mask>
      </defs>
      <rect x="8.2" y="2.8" width="13" height="13" rx="3.2" fill="currentColor" mask={`url(#${id})`} />
      <rect x="2.8" y="8.2" width="13" height="13" rx="3.2" fill="currentColor" />
    </svg>
  );
}

export function WrenchGlyph({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.2 6.1a.6.6 0 0 0-1-.3l-2.7 2.7-2.6-.5-.5-2.6 2.7-2.7a.6.6 0 0 0-.3-1 5.6 5.6 0 0 0-6.7 7.1L2.8 16.1a2.3 2.3 0 1 0 3.2 3.2l7.3-7.3a5.6 5.6 0 0 0 7.9-5.9Z" />
    </svg>
  );
}

export function WandGlyph({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.6 7.9a1.3 1.3 0 0 1 1.8 0l.1.1a1.3 1.3 0 0 1 0 1.8L5.3 21a1.3 1.3 0 0 1-1.8 0l-.1-.1a1.3 1.3 0 0 1 0-1.8L14.6 7.9Z" />
      <path d="M17.3 1.8l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6ZM10.5 2.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4.4-1ZM20.8 9l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4.4-1Z" />
    </svg>
  );
}

export function SelectGlyph({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.5 4.5h-9l7 7-7 8h9" />
    </svg>
  );
}

export function ArrowGlyph({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.6 2.6c.5-.2 1 .3.8.8l-5.5 16.9c-.2.6-1 .6-1.3.1l-2.6-5.2-8.1 6.5a1 1 0 0 1-1.4-1.4l6.5-8.1-5.2-2.6c-.6-.3-.5-1.1.1-1.3L20.6 2.6Z" />
    </svg>
  );
}

export function DotsGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="4.5" cy="12" r="2.3" /><circle cx="12" cy="12" r="2.3" /><circle cx="19.5" cy="12" r="2.3" />
    </svg>
  );
}

export function CheckCircleGlyph({ size = 26, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.6" /><path d="M7.6 12.4l3 3 5.8-6.4" />
    </svg>
  );
}

export function DocGlyph({ size = 26, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
      <path d="M6.6 2.6h6.6l5.3 5.3v11.4a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V4.8a2.2 2.2 0 0 1 2.2-2.2Z" /><path d="M13 2.8v4.4a1 1 0 0 0 1 1h4.4" />
    </svg>
  );
}

export function PhotosGlyph({ size = 28, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="6.5" width="19.5" height="14.5" rx="2.4" />
      <path d="M3 17V5.4A2.4 2.4 0 0 1 5.4 3h15.4" />
      <path d="M6.6 19.6l5.6-5.7 3.6 3.6 2.4-2.4 6.3 5.2" fill="currentColor" stroke="none" />
      <circle cx="20.4" cy="10.6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusGlyph({ size = 26, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M12 3.5v17M3.5 12h17" />
    </svg>
  );
}

export function GearGlyph({ size = 24, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M19.94 9.57 L22.54 10.14 A10.7 10.7 0 0 1 22.54 13.86 L19.94 14.43 A8.3 8.3 0 0 1 19.33 15.90 L20.76 18.14 A10.7 10.7 0 0 1 18.14 20.76 L15.90 19.33 A8.3 8.3 0 0 1 14.43 19.94 L13.86 22.54 A10.7 10.7 0 0 1 10.14 22.54 L9.57 19.94 A8.3 8.3 0 0 1 8.10 19.33 L5.86 20.76 A10.7 10.7 0 0 1 3.24 18.14 L4.67 15.90 A8.3 8.3 0 0 1 4.06 14.43 L1.46 13.86 A10.7 10.7 0 0 1 1.46 10.14 L4.06 9.57 A8.3 8.3 0 0 1 4.67 8.10 L3.24 5.86 A10.7 10.7 0 0 1 5.86 3.24 L8.10 4.67 A8.3 8.3 0 0 1 9.57 4.06 L10.14 1.46 A10.7 10.7 0 0 1 13.86 1.46 L14.43 4.06 A8.3 8.3 0 0 1 15.90 4.67 L18.14 3.24 A10.7 10.7 0 0 1 20.76 5.86 L19.33 8.10 A8.3 8.3 0 0 1 19.94 9.57 ZM12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
    </svg>
  );
}

export function CardGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.5 6h15A2.5 2.5 0 0 1 22 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5v-7A2.5 2.5 0 0 1 4.5 6Zm.5 3v1.6h14V9H5Z" />
      <path d="M5 3.6h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TabDiscGlyph({ size = 22, className }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><circle cx="12" cy="12" r="9" /></svg>;
}
export function TabClassicGlyph({ size = 22, className }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4.5" /></svg>;
}
export function TabHarmonyGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M3 4.5l7.5 7.5L3 19.5M10.5 12H22" />
    </svg>
  );
}
export function TabValueGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M3 8h18M3 16h18" /><circle cx="9" cy="8" r="2.4" fill="currentColor" /><circle cx="15" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}
export function TabPalettesGlyph({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (r < 2 ? <rect key={`${r}${c}`} x={2.5 + c * 7} y={5 + r * 7} width="5.6" height="5.6" rx="1.4" /> : null)))}
    </svg>
  );
}

/* Adjustment glyphs (stroke style to match the menu grids) */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function AdjustGlyph({ name, size = 22, className }: P & { name: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', className, 'aria-hidden': true } as const;
  switch (name) {
    case 'HSB':
      return (
        <svg {...common} {...S}>
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none" />
          <circle cx="7" cy="17" r="2.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'Color Balance':
      return (
        <svg {...common} {...S}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'Curves':
      return (
        <svg {...common} {...S}>
          <path d="M3 20C7 20 6 4 12 4s7 12 9 12" />
          <path d="M3 3v18h18" opacity=".45" />
        </svg>
      );
    case 'Gradient Map':
      return (
        <svg {...common} {...S}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
          <path d="M3.5 20.5 20.5 3.5" />
          <path d="M3.5 12 12 3.5M12 20.5 20.5 12" opacity=".45" />
        </svg>
      );
    case 'Gaussian Blur':
      return (
        <svg {...common} {...S}>
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="6.4" opacity=".5" />
          <circle cx="12" cy="12" r="9.4" opacity=".25" />
        </svg>
      );
    case 'Motion Blur':
      return (
        <svg {...common} {...S}>
          <path d="M4 8h13M7 12h13M4 16h13" opacity=".9" />
          <path d="M17 8h3M20 12h1M17 16h3" opacity=".4" />
        </svg>
      );
    case 'Perspective Blur':
      return (
        <svg {...common} {...S}>
          <path d="M3.5 5.5 20.5 9M3.5 12h17M3.5 18.5 20.5 15" />
          <path d="M3.5 5.5v13" opacity=".45" />
        </svg>
      );
    case 'Noise':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="5.5" cy="6" r="1.5" /><circle cx="12" cy="4.5" r="1.2" /><circle cx="18.5" cy="7" r="1.6" />
          <circle cx="8.5" cy="12" r="1.7" /><circle cx="15.5" cy="12.5" r="1.2" /><circle cx="5" cy="18" r="1.3" />
          <circle cx="12" cy="19" r="1.6" /><circle cx="19" cy="17.5" r="1.4" />
        </svg>
      );
    case 'Sharpen':
      return (
        <svg {...common} {...S}>
          <path d="M12 3 21 20H3Z" />
          <path d="M12 9.5 16.6 18H7.4Z" opacity=".45" />
        </svg>
      );
    case 'Bloom':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="12" cy="7" r="3" opacity=".85" /><circle cx="7.5" cy="14.5" r="3" opacity=".6" /><circle cx="16.5" cy="14.5" r="3" opacity=".6" />
        </svg>
      );
    case 'Glitch':
      return (
        <svg {...common} {...S}>
          <path d="M3 7h7l4 4h7M3 12h4l3 3h11M3 17h8" />
        </svg>
      );
    case 'Halftone':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="6" cy="6" r="2.4" /><circle cx="12" cy="6" r="1.7" /><circle cx="18" cy="6" r="1.1" />
          <circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="0.9" />
          <circle cx="6" cy="18" r="1.1" /><circle cx="12" cy="18" r="0.9" /><circle cx="18" cy="18" r="0.7" />
        </svg>
      );
    case 'Clone':
      return (
        <svg {...common} {...S}>
          <circle cx="8" cy="8" r="4.5" />
          <circle cx="16" cy="16" r="4.5" fill="currentColor" stroke="none" />
          <path d="M11 11l2 2" strokeDasharray="1.5 1.5" />
        </svg>
      );
    case 'Chromatic Aberration':
      return (
        <svg {...common} {...S}>
          <circle cx="9.5" cy="12" r="6.5" opacity=".55" />
          <circle cx="14.5" cy="12" r="6.5" opacity=".55" />
        </svg>
      );
    default:
      return null;
  }
}
