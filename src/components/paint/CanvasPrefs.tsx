/* Canvas-only settings (Actions → Prefs inside a canvas): rendering, workflow and
 * brush behaviour. Each section has its own reset, plus one for everything. */
import { CurveGraph, PrefCycle, PrefSection, PrefSlider, PrefToggle, ResetButton } from './PrefsUI';
import { resetPrefs, writePrefs, type Prefs } from './settings';

const RENDER: (keyof Prefs)[] = ['lowLatency', 'colorMode', 'gamma', 'deepColor'];
const WORKFLOW: (keyof Prefs)[] = ['rotateCanvas', 'showLayerChanges', 'edgeDetect', 'layerNameSpeed'];
const GESTURES: (keyof Prefs)[] = ['gTapUndo', 'gTapRedo', 'gScrubClear', 'gSwipeCopy', 'gFullscreen', 'gQuickPinch', 'quickMenuGesture', 'quickMenu'];
const BRUSH: (keyof Prefs)[] = ['drawCursor', 'shapeDetection', 'curvePressure', 'curveVelocity', 'curveTilt'];

export function CanvasPrefs({ prefs, onPrefs }: { prefs: Prefs; onPrefs: (p: Prefs) => void }) {
  const set = (patch: Partial<Prefs>) => onPrefs(writePrefs(patch));
  return (
    <div className="pp-canvas-prefs">
      <PrefSection label="QuickMenu">
        <PrefToggle label="QuickMenu (double tap)" on={prefs.quickMenu} onChange={(v) => set({ quickMenu: v })} />
      </PrefSection>
      <PrefSection label="Rendering">
        <PrefCycle label="Low-Latency Mode" value={prefs.lowLatency} options={['active', 'off'] as const} onChange={(v) => set({ lowLatency: v })} />
        <PrefCycle label="Color mode" value={prefs.colorMode} options={['standard', 'vivid', 'muted'] as const} onChange={(v) => set({ colorMode: v })} />
        <PrefToggle label="Gamma correction (sRGB)" on={prefs.gamma} onChange={(v) => set({ gamma: v })} />
        <PrefToggle label="Deep color (64-bit)" on={prefs.deepColor} onChange={(v) => set({ deepColor: v })} />
        <ResetButton label="Reset rendering" onReset={() => onPrefs(resetPrefs(RENDER))} />
      </PrefSection>
      <PrefSection label="Workflow">
        <PrefToggle label="Rotate canvas" on={prefs.rotateCanvas} onChange={(v) => set({ rotateCanvas: v })} />
        <PrefToggle label="Show layer changes" on={prefs.showLayerChanges} onChange={(v) => set({ showLayerChanges: v })} />
        <PrefToggle label="ColorDrop edge detection" on={prefs.edgeDetect} onChange={(v) => set({ edgeDetect: v })} />
        <PrefSlider label="Layer name scroll speed" value={prefs.layerNameSpeed} min={0} max={120} onChange={(v) => set({ layerNameSpeed: v })} />
        <ResetButton label="Reset workflow" onReset={() => onPrefs(resetPrefs(WORKFLOW))} />
      </PrefSection>
      <PrefSection label="Gesture controls">
        <PrefToggle label="Two-finger tap: undo (hold to repeat)" on={prefs.gTapUndo} onChange={(v) => set({ gTapUndo: v })} />
        <PrefToggle label="Three-finger tap: redo (hold to repeat)" on={prefs.gTapRedo} onChange={(v) => set({ gTapRedo: v })} />
        <PrefToggle label="Three-finger scrub: clear layer" on={prefs.gScrubClear} onChange={(v) => set({ gScrubClear: v })} />
        <PrefToggle label="Three-finger swipe down: Copy & Paste" on={prefs.gSwipeCopy} onChange={(v) => set({ gSwipeCopy: v })} />
        <PrefToggle label="Four-finger tap: full screen" on={prefs.gFullscreen} onChange={(v) => set({ gFullscreen: v })} />
        <PrefToggle label="Fit to screen gesture (quick pinch)" on={prefs.gQuickPinch} onChange={(v) => set({ gQuickPinch: v })} />
        <PrefCycle label="QuickMenu" value={prefs.quickMenuGesture} options={['three-swipe-up', 'four-hold', 'off'] as const} onChange={(v) => set({ quickMenuGesture: v })} />
        <ResetButton label="Reset gestures" onReset={() => onPrefs(resetPrefs(GESTURES))} />
      </PrefSection>
      <PrefSection label="Brush settings">
        <PrefToggle label="Draw cursor" on={prefs.drawCursor} onChange={(v) => set({ drawCursor: v })} />
        <PrefToggle label="Shape detection" on={prefs.shapeDetection} onChange={(v) => set({ shapeDetection: v })} />
        <div className="pp-preset pp-set-row pp-set-curves-row"><span className="pp-preset-name">Global curves</span></div>
        <div className="pp-curves">
          <CurveGraph label="Pressure" kind={prefs.curvePressure} onChange={(v) => set({ curvePressure: v })} />
          <CurveGraph label="Velocity" kind={prefs.curveVelocity} onChange={(v) => set({ curveVelocity: v })} />
          <CurveGraph label="Tilt" kind={prefs.curveTilt} onChange={(v) => set({ curveTilt: v })} />
        </div>
        <ResetButton label="Reset brush settings" onReset={() => onPrefs(resetPrefs(BRUSH))} />
      </PrefSection>
      <ResetButton label="Reset all canvas settings" onReset={() => onPrefs(resetPrefs([...RENDER, ...WORKFLOW, ...GESTURES, ...BRUSH]))} />
    </div>
  );
}

/** CSS filter the view applies for the chosen color mode (display only, never baked into pixels). */
export const colorModeFilter = (m: Prefs['colorMode']) => (m === 'vivid' ? 'saturate(1.22) contrast(1.04)' : m === 'muted' ? 'saturate(.72)' : 'none');
