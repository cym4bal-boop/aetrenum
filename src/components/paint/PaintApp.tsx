// @ts-nocheck -- ported as-is from the original project, which used looser type settings.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowLeft, Brush, Check, CircleHelp, Eraser, Eye, EyeOff, FileImage,
  Hand, Layers3, MoreHorizontal, Plus, Redo2, Search, Undo2, X, Download,
  PenLine, Copy, Trash2, Wrench, Wand2, Move, Crop, Type, Play, Pause,
  Film, Lock, Unlock, RotateCw, ImagePlus, Camera, Share2, Settings,
  HelpCircle, Clipboard, ChevronLeft, Pointer, Navigation, ClipboardPaste, Shapes, Grid2X2, ChevronRight,
} from 'lucide-react';
import { applyCanvasEffect, applyLiquify, drawGeometry, floodFill, type LiquifyMode } from './canvas-ops';

type Layer = { id: string; name: string; visible: boolean; locked?: boolean; image?: string };
type AnimationFrame = { id: string; images: Record<string, string>; hold: number; background: boolean };
type Artwork = { id: string; title: string; width: number; height: number; created: number; updated: number; layers: Layer[]; preview?: string; animation?: AnimationFrame[] };
type Tool = 'brush' | 'smudge' | 'eraser' | 'selection';
type Preset = { name: string; color: string; width: number; height: number; detail: string };
type Point = { x: number; y: number };

const DB_NAME = 'aeternum-paint-studio';
const STORE = 'artworks';
const presets: Preset[] = [
  { name: 'Screen Size', color: 'P3', width: 1206, height: 2622, detail: '1206 × 2622 px' },
  { name: 'Untitled Canvas', color: 'P3', width: 1500, height: 500, detail: '1500 × 500 px' },
  { name: 'Untitled Canvas', color: 'P3', width: 16, height: 16, detail: '16 × 16 px' },
  { name: 'Untitled Canvas', color: 'P3', width: 2000, height: 2500, detail: '2000 × 2500 px' },
  { name: 'Square', color: 'sRGB', width: 2048, height: 2048, detail: '2048 × 2048 px' },
  { name: '4K', color: 'sRGB', width: 4096, height: 1714, detail: '4096 × 1714 px' },
  { name: 'A4', color: 'sRGB', width: 2480, height: 3508, detail: '210 × 297 mm' },
  { name: '4 × 6 Photo', color: 'sRGB', width: 1800, height: 1200, detail: '6″ × 4″' },
  { name: 'Paper', color: 'sRGB', width: 2550, height: 3300, detail: '11″ × 8.5″' },
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readArtworks(): Promise<Artwork[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as Artwork[]).sort((a, b) => b.updated - a.updated));
      request.onerror = () => reject(request.error);
    });
  } catch { return []; }
}
async function writeArtwork(artwork: Artwork) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(artwork);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
async function removeArtwork(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeLayer = (index: number): Layer => ({ id: makeId(), name: `Layer ${index}`, visible: true });

function AppHome() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState<'gallery' | 'editor'>('gallery');
  const [project, setProject] = useState<Artwork | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
  const [customWidth, setCustomWidth] = useState('2048');
  const [customHeight, setCustomHeight] = useState('2048');
  const [selectedPreset, setSelectedPreset] = useState(-1);
  const [activeLayerId, setActiveLayerId] = useState('');
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(18);
  const [opacity, setOpacity] = useState(88);
  const [color, setColor] = useState('#3b3935');
  const [colorOpen, setColorOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layerMenu, setLayerMenu] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionTab, setActionTab] = useState<'Add' | 'Canvas' | 'Share' | 'Video' | 'Prefs' | 'Help'>('Add');
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [activeAdjustment, setActiveAdjustment] = useState('');
  const [adjustmentValue, setAdjustmentValue] = useState(48);
  const [liquifyOpen, setLiquifyOpen] = useState(false);
  const [liquifyMode, setLiquifyMode] = useState<LiquifyMode>('Push');
  const [liquifyValues, setLiquifyValues] = useState({ amount: 50, size: 70, pressure: 73, distortion: 36, momentum: 85 });
  const [transformOpen, setTransformOpen] = useState(false);
  const [transformMode, setTransformMode] = useState<'Freeform' | 'Uniform' | 'Distort' | 'Warp'>('Uniform');
  const [transformScale, setTransformScale] = useState(100);
  const [transformSnap, setTransformSnap] = useState(true);
  const [interpolation, setInterpolation] = useState('Bilinear');
  const [quickShapeArmed, setQuickShapeArmed] = useState(false);
  const [quickShapeSnap, setQuickShapeSnap] = useState(true);
  const [quickShapeOpen, setQuickShapeOpen] = useState(false);
  const [quickShape, setQuickShape] = useState<'Line' | 'Ellipse' | 'Rectangle'>('Ellipse');
  const [quickShapeDraft, setQuickShapeDraft] = useState<{ from: Point; to: Point } | null>(null);
  const [actionsMessage, setActionsMessage] = useState('');
  const [drawGuide, setDrawGuide] = useState(false);
  const [guideSettingsOpen, setGuideSettingsOpen] = useState(false);
  const [guideSpacing, setGuideSpacing] = useState(30);
  const [pageAssist, setPageAssist] = useState(false);
  const [referenceEnabled, setReferenceEnabled] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [canvasInfoOpen, setCanvasInfoOpen] = useState(false);
  const [canvasSizeOpen, setCanvasSizeOpen] = useState(false);
  const [canvasOperation, setCanvasOperation] = useState<'Resize' | 'Crop'>('Resize');
  const [resizeWidth, setResizeWidth] = useState('');
  const [resizeHeight, setResizeHeight] = useState('');
  const [textOpen, setTextOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [cloneMode, setCloneMode] = useState(false);
  const [cloneSource, setCloneSource] = useState<Point | null>(null);
  const [colorDrag, setColorDrag] = useState<Point | null>(null);
  const [colorDropTarget, setColorDropTarget] = useState<Point | null>(null);
  const [animationOpen, setAnimationOpen] = useState(false);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationFrameIndex, setAnimationFrameIndex] = useState(0);
  const [frameOptionsOpen, setFrameOptionsOpen] = useState(false);
  const [frameHold, setFrameHold] = useState(0);
  const [frameBackground, setFrameBackground] = useState(false);
  const [appPreferencesOpen, setAppPreferencesOpen] = useState(false);
  const [brushStabilization, setBrushStabilization] = useState(0);
  const [saving, setSaving] = useState(false);
  const [paperSize, setPaperSize] = useState({ width: 800, height: 600 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const paperRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const points = useRef<{ x: number; y: number; pressure: number }[]>([]);
  const history = useRef<Record<string, { undo: string[]; redo: string[] }>>({});
  const clipboard = useRef<string | null>(null);
  const colorDragStart = useRef<Point | null>(null);
  const colorWasDragged = useRef(false);
  const ignoreColorClick = useRef(false);
  const frameTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const activeLayer = project?.layers.find(layer => layer.id === activeLayerId) ?? project?.layers[0];

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try { setArtworks(await readArtworks()); } catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!project || screen !== 'editor') return;
    const element = paperRef.current?.parentElement;
    if (!element) return;
    const measure = () => {
      const padding = window.getComputedStyle(element);
      const maxWidth = Math.max(180, element.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
      const maxHeight = Math.max(180, element.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
      const scale = Math.min(maxWidth / project.width, maxHeight / project.height);
      setPaperSize({ width: Math.round(project.width * scale), height: Math.round(project.height * scale) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [project?.id, project?.width, project?.height, screen]);

  useEffect(() => {
    if (!project || screen !== 'editor') return;
    for (const layer of project.layers) {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) continue;
      canvas.width = project.width;
      canvas.height = project.height;
      if (layer.image) {
        const image = new Image();
        image.onload = () => {
          const context = canvas.getContext('2d');
          context?.clearRect(0, 0, canvas.width, canvas.height);
          context?.drawImage(image, 0, 0, canvas.width, canvas.height);
        };
        image.src = layer.image;
      }
    }
  }, [project?.id, screen]);

  const persist = useCallback((current: Artwork, previewOverride?: string) => {
    setSaving(true);
    const layers = current.layers.map(layer => {
      const canvas = canvasRefs.current[layer.id];
      return canvas ? { ...layer, image: canvas.toDataURL('image/png') } : layer;
    });
    const preview = previewOverride ?? compositePreview(current, layers, canvasRefs.current);
    const next = { ...current, layers, preview, updated: Date.now() };
    setProject(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void writeArtwork(next).then(() => {
        setArtworks(existing => [next, ...existing.filter(item => item.id !== next.id)].sort((a, b) => b.updated - a.updated));
        setSaving(false);
      }).catch(() => setSaving(false));
    }, 150);
  }, []);

  const createArtwork = useCallback((title: string, width: number, height: number) => {
    const next: Artwork = { id: makeId(), title, width, height, created: Date.now(), updated: Date.now(), layers: [makeLayer(1)] };
    setProject(next);
    setActiveLayerId(next.layers[0].id);
    history.current = {};
    void writeArtwork(next).then(() => setArtworks(items => [next, ...items]));
    setScreen('editor');
    setSheetOpen(false);
  }, []);

  const openArtwork = (artwork: Artwork) => {
    setProject(artwork);
    setActiveLayerId(artwork.layers.find(layer => layer.visible)?.id ?? artwork.layers[0]?.id ?? '');
    history.current = {};
    setScreen('editor');
  };

  const commitStroke = useCallback(() => {
    if (!project || !activeLayer) return;
    const canvas = canvasRefs.current[activeLayer.id];
    if (!canvas) return;
    const stack = history.current[activeLayer.id] ?? { undo: [], redo: [] };
    stack.redo = [];
    history.current[activeLayer.id] = stack;
    setHistoryVersion(value => value + 1);
    persist(project);
  }, [project, activeLayer, persist]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
      pressure: event.pressure || 0.5,
    };
  };
  const drawSegment = (context: CanvasRenderingContext2D, from: { x: number; y: number; pressure: number }, to: { x: number; y: number; pressure: number }) => {
    if (tool === 'smudge') {
      const radius = Math.max(3, brushSize * (0.45 + to.pressure * 0.9));
      const offsetX = (to.x - from.x) * 0.75;
      const offsetY = (to.y - from.y) * 0.75;
      context.save();
      context.globalAlpha = opacity / 100 * 0.62;
      context.filter = `blur(${Math.max(0.5, brushSize * 0.08)}px)`;
      context.drawImage(
        context.canvas,
        from.x - radius,
        from.y - radius,
        radius * 2,
        radius * 2,
        from.x - radius + offsetX,
        from.y - radius + offsetY,
        radius * 2,
        radius * 2,
      );
      context.restore();
      return;
    }
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = tool === 'eraser' ? 1 : opacity / 100;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
    context.lineWidth = Math.max(1, brushSize * (0.45 + to.pressure * 0.9));
    context.beginPath();
    context.moveTo(from.x, from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    context.quadraticCurveTo(from.x, from.y, midX, midY);
    context.stroke();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeLayer || activeLayer.locked || tool === 'selection') return;
    const canvas = event.currentTarget;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (cloneMode) {
      if (!cloneSource) {
        setCloneSource(point);
        setActionsMessage('Clone source set. Tap a target area on the canvas.');
        return;
      }
      const radius = Math.max(8, brushSize * 4);
      const scratch = document.createElement('canvas');
      scratch.width = radius * 2;
      scratch.height = radius * 2;
      scratch.getContext('2d')?.drawImage(canvas, cloneSource.x - radius, cloneSource.y - radius, radius * 2, radius * 2, 0, 0, radius * 2, radius * 2);
      const stack = history.current[activeLayer.id] ?? { undo: [], redo: [] };
      stack.undo.push(canvas.toDataURL('image/png'));
      stack.redo = [];
      history.current[activeLayer.id] = stack;
      canvas.getContext('2d')?.drawImage(scratch, point.x - radius, point.y - radius);
      setCloneSource(null);
      setCloneMode(false);
      setActionsMessage('');
      persist(project!);
      return;
    }
    drawing.current = true;
    const stack = history.current[activeLayer.id] ?? { undo: [], redo: [] };
    stack.undo.push(canvas.toDataURL('image/png'));
    if (stack.undo.length > 40) stack.undo.shift();
    stack.redo = [];
    history.current[activeLayer.id] = stack;
    setHistoryVersion(value => value + 1);
    points.current = [point];
    if (quickShapeArmed) {
      setQuickShapeDraft({ from: point, to: point });
      return;
    }
    const context = canvas.getContext('2d');
    if (context && tool !== 'smudge') {
      context.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
      context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      context.globalAlpha = tool === 'eraser' ? 1 : opacity / 100;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(1, brushSize * (0.45 + point.pressure * 0.9) / 2), 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const nativeEvent of coalesced) {
      const rect = event.currentTarget.getBoundingClientRect();
      const next = {
        x: (nativeEvent.clientX - rect.left) * (event.currentTarget.width / rect.width),
        y: (nativeEvent.clientY - rect.top) * (event.currentTarget.height / rect.height),
        pressure: nativeEvent.pressure || 0.5,
      };
      if (quickShapeArmed) {
        const first = points.current[0] ?? next;
        points.current.push(next);
        setQuickShapeDraft({ from: first, to: next });
        continue;
      }
      const previous = points.current[points.current.length - 1];
      if (previous) drawSegment(context, previous, next);
      points.current.push(next);
    }
  };
  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (quickShapeArmed) {
      setQuickShapeArmed(false);
      setQuickShapeOpen(true);
      return;
    }
    commitStroke();
  };
  const undo = () => {
    if (!activeLayer) return;
    const canvas = canvasRefs.current[activeLayer.id];
    const stack = history.current[activeLayer.id];
    if (!canvas || !stack?.undo.length) return;
    stack.redo.push(canvas.toDataURL('image/png'));
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx?.drawImage(image, 0, 0);
      if (project) persist(project);
      setHistoryVersion(v => v + 1);
    };
    image.src = stack.undo.pop()!;
  };
  const redo = () => {
    if (!activeLayer) return;
    const canvas = canvasRefs.current[activeLayer.id];
    const stack = history.current[activeLayer.id];
    if (!canvas || !stack?.redo.length) return;
    stack.undo.push(canvas.toDataURL('image/png'));
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx?.drawImage(image, 0, 0);
      if (project) persist(project);
      setHistoryVersion(v => v + 1);
    };
    image.src = stack.redo.pop()!;
  };

  const rememberLayer = (id: string) => {
    const canvas = canvasRefs.current[id];
    if (!canvas) return;
    const stack = history.current[id] ?? { undo: [], redo: [] };
    stack.undo.push(canvas.toDataURL('image/png'));
    if (stack.undo.length > 40) stack.undo.shift();
    stack.redo = [];
    history.current[id] = stack;
    setHistoryVersion(value => value + 1);
  };
  const saveNow = (next = project) => { if (next) persist(next); };
  const clearLayer = (id: string) => {
    const canvas = canvasRefs.current[id];
    if (!canvas) return;
    rememberLayer(id);
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    saveNow();
  };
  const duplicateLayer = (id: string) => {
    if (!project) return;
    const source = canvasRefs.current[id];
    const layer = project.layers.find(item => item.id === id);
    if (!source || !layer) return;
    const imageData = source.toDataURL('image/png');
    const copy: Layer = { id: makeId(), name: `${layer.name} copy`, visible: true, image: imageData };
    const at = project.layers.findIndex(item => item.id === id);
    const layers = [...project.layers];
    layers.splice(at + 1, 0, copy);
    const next = { ...project, layers };
    setProject(next);
    setActiveLayerId(copy.id);
    setTimeout(() => {
      const target = canvasRefs.current[copy.id];
      if (!target) return;
      target.width = project.width; target.height = project.height;
      const image = new Image();
      image.onload = () => { target.getContext('2d')?.drawImage(image, 0, 0); persist(next); };
      image.src = imageData;
    }, 40);
  };
  const toggleLayerLock = (id: string) => {
    if (!project) return;
    const next = { ...project, layers: project.layers.map(layer => layer.id === id ? { ...layer, locked: !layer.locked } : layer) };
    setProject(next);
    persist(next);
  };
  const reorderLayers = (sourceId: string, targetId: string) => {
    if (!project || sourceId === targetId) return;
    const layers = [...project.layers];
    const from = layers.findIndex(layer => layer.id === sourceId);
    const to = layers.findIndex(layer => layer.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = layers.splice(from, 1);
    layers.splice(to, 0, item);
    const next = { ...project, layers };
    setProject(next);
    persist(next);
  };
  const copyActiveLayer = () => {
    if (!activeLayer) return;
    clipboard.current = canvasRefs.current[activeLayer.id]?.toDataURL('image/png') ?? null;
    setActionsMessage(clipboard.current ? 'Layer copied to the local clipboard.' : 'Nothing to copy yet.');
  };
  const copyCanvas = () => {
    if (!project) return;
    const temp = document.createElement('canvas');
    temp.width = project.width; temp.height = project.height;
    const context = temp.getContext('2d');
    if (!context) return;
    project.layers.forEach(layer => {
      if (layer.visible && canvasRefs.current[layer.id]) context.drawImage(canvasRefs.current[layer.id]!, 0, 0);
    });
    clipboard.current = temp.toDataURL('image/png');
    setActionsMessage('Canvas copied to the local clipboard.');
  };
  const pasteClipboard = () => {
    if (!project || !clipboard.current) { setActionsMessage('The app clipboard is empty. Copy a layer or canvas first.'); return; }
    const imageData = clipboard.current;
    const layer: Layer = { id: makeId(), name: `Pasted ${project.layers.length + 1}`, visible: true };
    const next = { ...project, layers: [...project.layers, layer] };
    setProject(next);
    setActiveLayerId(layer.id);
    setTimeout(() => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      const image = new Image();
      image.onload = () => {
        canvas.getContext('2d')?.drawImage(image, 0, 0, project.width, project.height);
        persist(next);
      };
      image.src = imageData;
    }, 40);
  };
  const cutActiveLayer = () => {
    copyActiveLayer();
    if (activeLayer) clearLayer(activeLayer.id);
    setActionsMessage('Layer cut. Paste to place it on a new layer.');
  };
  const addImageFile = (file?: File) => {
    if (!file || !project) return;
    const image = new Image();
    image.onload = () => {
      const layer: Layer = { id: makeId(), name: file.name.replace(/\.[^.]+$/, '') || 'Inserted image', visible: true };
      const next = { ...project, layers: [...project.layers, layer] };
      setProject(next);
      setActiveLayerId(layer.id);
      setTimeout(() => {
        const canvas = canvasRefs.current[layer.id];
        if (!canvas) return;
        canvas.getContext('2d')?.drawImage(image, 0, 0, project.width, project.height);
        persist(next);
      }, 40);
      setActionsMessage('Image added on a new layer.');
    };
    image.onerror = () => setActionsMessage('This file could not be opened as an image.');
    image.src = URL.createObjectURL(file);
  };
  const applyText = () => {
    if (!project || !textDraft.trim()) return;
    const layer = { id: makeId(), name: 'Text', visible: true };
    const next = { ...project, layers: [...project.layers, layer] };
    setProject(next);
    setActiveLayerId(layer.id);
    setTimeout(() => {
      const canvas = canvasRefs.current[layer.id];
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.fillStyle = color;
      ctx.font = `${Math.max(28, brushSize * 4)}px "DM Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(textDraft, project.width * .12, project.height * .5, project.width * .76);
      persist(next);
    }, 40);
    setTextOpen(false);
    setActionsMessage('Text added on a new layer.');
  };
  const applyCanvasSize = () => {
    if (!project) return;
    const width = Math.max(16, Math.min(8192, Math.round(Number(resizeWidth) || project.width)));
    const height = Math.max(16, Math.min(8192, Math.round(Number(resizeHeight) || project.height)));
    project.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      rememberLayer(layer.id);
      const temp = document.createElement('canvas');
      temp.width = canvas.width; temp.height = canvas.height;
      temp.getContext('2d')?.drawImage(canvas, 0, 0);
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      if (canvasOperation === 'Crop') {
        const sx = Math.max(0, (temp.width - width) / 2);
        const sy = Math.max(0, (temp.height - height) / 2);
        const sw = Math.min(width, temp.width);
        const sh = Math.min(height, temp.height);
        context.drawImage(temp, sx, sy, sw, sh, Math.max(0, (width - sw) / 2), Math.max(0, (height - sh) / 2), sw, sh);
      } else context.drawImage(temp, 0, 0, temp.width, temp.height, 0, 0, width, height);
    });
    const next = { ...project, width, height };
    setProject(next);
    persist(next);
    setCanvasSizeOpen(false);
  };
  const flipCanvas = (horizontal: boolean) => {
    if (!project) return;
    project.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      rememberLayer(layer.id);
      const temp = document.createElement('canvas');
      temp.width = canvas.width; temp.height = canvas.height;
      temp.getContext('2d')?.drawImage(canvas, 0, 0);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height);
      context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      context.drawImage(temp, 0, 0);
      context.restore();
    });
    persist(project);
    setActionsMessage(`Canvas flipped ${horizontal ? 'horizontally' : 'vertically'}.`);
  };
  const makeFrame = (current = project): AnimationFrame | null => {
    if (!current) return null;
    const images: Record<string, string> = {};
    current.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (canvas) images[layer.id] = canvas.toDataURL('image/png');
    });
    return { id: makeId(), images, hold: frameHold, background: frameBackground };
  };
  const addAnimationFrame = (duplicate = false) => {
    if (!project) return;
    const frame = duplicate && project.animation?.[animationFrameIndex]
      ? { ...project.animation[animationFrameIndex], id: makeId() }
      : makeFrame();
    if (!frame) return;
    const animation = [...(project.animation ?? []), frame];
    const next = { ...project, animation };
    setProject(next);
    setAnimationFrameIndex(animation.length - 1);
    persist(next);
  };
  const showAnimationFrame = (frame: AnimationFrame, index: number) => {
    if (!project) return;
    setAnimationFrameIndex(index);
    project.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      const image = new Image();
      image.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      if (frame.images[layer.id]) image.src = frame.images[layer.id];
    });
    setFrameHold(frame.hold);
    setFrameBackground(frame.background);
  };
  const deleteAnimationFrame = () => {
    if (!project?.animation || project.animation.length <= 1) return;
    const animation = project.animation.filter((_, index) => index !== animationFrameIndex);
    const next = { ...project, animation };
    setProject(next);
    setAnimationFrameIndex(Math.max(0, animationFrameIndex - 1));
    persist(next);
  };
  useEffect(() => {
    if (!animationPlaying || !project?.animation?.length) return;
    frameTimer.current = window.setInterval(() => {
      const nextIndex = (animationFrameIndex + 1) % project.animation!.length;
      showAnimationFrame(project.animation![nextIndex], nextIndex);
    }, Math.max(100, (project.animation[animationFrameIndex]?.hold || 6) * 100));
    return () => window.clearInterval(frameTimer.current);
  }, [animationPlaying, animationFrameIndex, project?.animation]);

  const openAnimation = () => {
    if (project && !project.animation?.length) {
      const first = makeFrame();
      if (first) setProject({ ...project, animation: [first] });
    }
    setAnimationOpen(true);
    setActionTab('Video');
    setActionsOpen(true);
  };
  const applyQuickShape = () => {
    if (!project || !activeLayer || !quickShapeDraft) return;
    const canvas = canvasRefs.current[activeLayer.id];
    if (!canvas) return;
    let { from, to } = quickShapeDraft;
    if (quickShapeSnap && quickShape === 'Line') {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
    } else if (quickShapeSnap && quickShape !== 'Line') {
      const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      to = { x: from.x + Math.sign(to.x - from.x || 1) * side, y: from.y + Math.sign(to.y - from.y || 1) * side };
    }
    drawGeometry(canvas.getContext('2d')!, from, to, quickShape, color, brushSize, opacity);
    const stack = history.current[activeLayer.id] ?? { undo: [], redo: [] };
    stack.redo = [];
    history.current[activeLayer.id] = stack;
    persist(project);
    setQuickShapeDraft(null);
    setQuickShapeOpen(false);
    setHistoryVersion(value => value + 1);
  };
  const applySelectedAdjustment = () => {
    if (!activeLayer || !activeAdjustment) return;
    const canvas = canvasRefs.current[activeLayer.id];
    if (!canvas) return;
    rememberLayer(activeLayer.id);
    applyCanvasEffect(canvas, activeAdjustment, adjustmentValue);
    saveNow();
    setAdjustmentsOpen(false);
    setActionsMessage(`${activeAdjustment} applied to ${activeLayer.name}.`);
  };
  const selectAdjustment = (name: string) => {
    if (name === 'Liquify') { setAdjustmentsOpen(false); setLiquifyOpen(true); return; }
    if (name === 'Clone') {
      setAdjustmentsOpen(false);
      setCloneMode(true);
      setCloneSource(null);
      setActionsMessage('Tap a source point, then tap a destination to clone.');
      return;
    }
    setActiveAdjustment(name);
    setAdjustmentValue(48);
  };
  const applyLiquifyNow = () => {
    if (!activeLayer) return;
    const canvas = canvasRefs.current[activeLayer.id];
    if (!canvas) return;
    rememberLayer(activeLayer.id);
    applyLiquify(canvas, liquifyMode, liquifyValues);
    saveNow();
    setLiquifyOpen(false);
    setActionsMessage(`${liquifyMode} liquify applied.`);
  };
  const applyTransform = () => {
    if (!project || !activeLayer) return;
    const canvas = canvasRefs.current[activeLayer.id];
    if (!canvas) return;
    rememberLayer(activeLayer.id);
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    temp.getContext('2d')?.drawImage(canvas, 0, 0);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = (transformSnap ? Math.round(transformScale / 5) * 5 : transformScale) / 100;
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    if (transformMode === 'Warp') context.transform(1, 0, (scale - 1) * .5, 1, 0, 0);
    else if (transformMode === 'Distort') context.scale(scale, 2 - scale);
    else context.scale(scale, scale);
    context.imageSmoothingEnabled = interpolation !== 'Nearest neighbor';
    context.drawImage(temp, -canvas.width / 2, -canvas.height / 2);
    context.restore();
    saveNow();
    setTransformOpen(false);
  };
  const updateFrameSettings = (hold: number, background: boolean) => {
    setFrameHold(hold);
    setFrameBackground(background);
    if (!project?.animation?.[animationFrameIndex]) return;
    const animation = project.animation.map((frame, index) => index === animationFrameIndex ? { ...frame, hold, background } : frame);
    const next = { ...project, animation };
    setProject(next);
    persist(next);
  };
  const performCanvasAction = (action: string) => {
    switch (action) {
      case 'Crop & Resize': setCanvasOperation('Resize'); setResizeWidth(String(project?.width ?? 2048)); setResizeHeight(String(project?.height ?? 2048)); setCanvasSizeOpen(true); break;
      case 'Flip horizontal': flipCanvas(true); break;
      case 'Flip vertical': flipCanvas(false); break;
      case 'Canvas information': setCanvasInfoOpen(true); break;
      case 'Animation Assist': if (project) { setProject({ ...project, animation: project.animation ?? [] }); openAnimation(); } break;
      case 'Page Assist': setPageAssist(value => !value); break;
      case 'Drawing Guide': setDrawGuide(value => !value); break;
      case 'Edit Drawing Guide': setDrawGuide(true); setGuideSettingsOpen(true); break;
      case 'Reference': setReferenceEnabled(value => !value); break;
    }
  };
  const onColorPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    colorDragStart.current = point;
    colorWasDragged.current = false;
    setColorDrag(point);
    setColorDropTarget(null);
  };
  const onColorPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!colorDragStart.current) return;
    const point = { x: event.clientX, y: event.clientY };
    const delta = Math.hypot(point.x - colorDragStart.current.x, point.y - colorDragStart.current.y);
    if (delta > 9) colorWasDragged.current = true;
    if (!colorWasDragged.current) return;
    setColorDrag(point);
    const rect = paperRef.current?.getBoundingClientRect();
    if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) setColorDropTarget(point);
    else setColorDropTarget(null);
  };
  const onColorPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!colorDragStart.current) return;
    const rect = paperRef.current?.getBoundingClientRect();
    const inside = !!rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (colorWasDragged.current && inside && rect && activeLayer && !activeLayer.locked) {
      const canvas = canvasRefs.current[activeLayer.id];
      if (canvas) {
        rememberLayer(activeLayer.id);
        const x = (event.clientX - rect.left) * canvas.width / rect.width;
        const y = (event.clientY - rect.top) * canvas.height / rect.height;
        floodFill(canvas, x, y, color, 38);
        saveNow();
      }
    } else if (!colorWasDragged.current) setColorOpen(true);
    if (colorWasDragged.current) ignoreColorClick.current = true;
    colorDragStart.current = null;
    colorWasDragged.current = false;
    setColorDrag(null);
    setColorDropTarget(null);
  };

  const setLayerVisibility = (id: string) => {
    if (!project) return;
    const layers = project.layers.map(layer => layer.id === id ? { ...layer, visible: !layer.visible } : layer);
    const updated = { ...project, layers };
    setProject(updated);
    if (id === activeLayerId && !layers.find(layer => layer.id === id)?.visible) {
      const replacement = layers.find(layer => layer.visible);
      if (replacement) setActiveLayerId(replacement.id);
    }
    persist(updated);
  };
  const addLayer = () => {
    if (!project) return;
    const layer = makeLayer(project.layers.length + 1);
    const next = { ...project, layers: [...project.layers, layer] };
    canvasRefs.current[layer.id] = null;
    setProject(next);
    setActiveLayerId(layer.id);
    setTimeout(() => {
      const canvas = canvasRefs.current[layer.id];
      if (canvas) { canvas.width = project.width; canvas.height = project.height; }
    }, 0);
  };
  const renameLayer = (id: string, name: string) => {
    if (!project || !name.trim()) return;
    const next = { ...project, layers: project.layers.map(layer => layer.id === id ? { ...layer, name: name.trim() } : layer) };
    setProject(next);
    persist(next);
  };
  const deleteLayer = (id: string) => {
    if (!project || project.layers.length < 2) return;
    const nextLayers = project.layers.filter(layer => layer.id !== id);
    const next = { ...project, layers: nextLayers };
    setProject(next);
    setActiveLayerId(nextLayers[nextLayers.length - 1].id);
    delete canvasRefs.current[id];
    persist(next);
  };
  const exportPng = () => {
    if (!project) return;
    const output = document.createElement('canvas');
    output.width = project.width;
    output.height = project.height;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fffefa';
    ctx.fillRect(0, 0, output.width, output.height);
    project.layers.forEach(layer => {
      if (layer.visible && canvasRefs.current[layer.id]) ctx.drawImage(canvasRefs.current[layer.id]!, 0, 0);
    });
    const link = document.createElement('a');
    link.download = `${project.title.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'aeternum-artwork'}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
  };
  const returnToGallery = () => {
    if (project) persist(project);
    setLayersOpen(false);
    setColorOpen(false);
    setScreen('gallery');
    setProject(null);
    void refresh();
  };
  const toggleArtworkSelection = (id: string) => {
    setSelectedArtworkIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  };
  const deleteSelectedArtworks = async () => {
    const ids = [...selectedArtworkIds];
    await Promise.all(ids.map(id => removeArtwork(id).catch(() => undefined)));
    setArtworks(items => items.filter(item => !ids.includes(item.id)));
    setSelectedArtworkIds([]);
    setSelecting(false);
  };
  const renameProject = (title: string) => {
    if (!project) return;
    const next = { ...project, title };
    setProject(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void writeArtwork(next).then(() => setArtworks(items => items.map(item => item.id === next.id ? next : item))), 250);
  };
  const filtered = useMemo(() => artworks.filter(item => item.title.toLowerCase().includes(search.toLowerCase())), [artworks, search]);
  const hasUndo = !!(activeLayer && history.current[activeLayer.id]?.undo.length);
  const hasRedo = !!(activeLayer && history.current[activeLayer.id]?.redo.length);
  void historyVersion;

  if (screen === 'editor' && project) {
    return (
      <main className="editor" aria-label="Aeternum Paint editor">
        <div className="float-toolbar" role="toolbar" aria-label="Drawing tools">
          <div className="tool-main-row">
            <button className={`tool-button ${tool === 'brush' ? 'active' : ''}`} title="Paint" aria-label="Brush tool" onClick={() => setTool('brush')} data-testid="tool-brush"><Brush size={20} /></button>
            <button className={`tool-button ${tool === 'smudge' ? 'active' : ''}`} title="Smudge" aria-label="Smudge tool" onClick={() => setTool('smudge')} data-testid="tool-smudge"><Pointer size={21} fill="currentColor" /></button>
            <button className={`tool-button ${tool === 'eraser' ? 'active' : ''}`} title="Erase" aria-label="Eraser tool" onClick={() => setTool('eraser')} data-testid="tool-eraser"><Eraser size={21} fill="currentColor" /></button>
            <button className={`tool-button ${layersOpen ? 'active' : ''}`} title="Layers" aria-label="Manage layers" onClick={() => setLayersOpen(true)} data-testid="button-open-layers"><Copy size={20} fill="currentColor" /></button>
            <button className="tool-button color-tool" title="Tap to choose color; drag onto the canvas to fill" aria-label="Selected color: tap to open picker or drag to fill canvas" style={{ backgroundColor: color }}
              onPointerDown={onColorPointerDown} onPointerMove={onColorPointerMove} onPointerUp={onColorPointerUp}
              onPointerCancel={() => { colorDragStart.current = null; setColorDrag(null); setColorDropTarget(null); }}
              onClick={() => { if (ignoreColorClick.current) { ignoreColorClick.current = false; return; } setColorOpen(true); }}
              data-testid="button-color" />
          </div>
          <div className="tool-sub-row">
            <button className="tool-button plain" aria-label="Return to gallery" title="Gallery" onClick={returnToGallery} data-testid="button-gallery"><ChevronLeft size={24} /></button>
            <button className="tool-button sub" aria-label="Actions" title="Actions" onClick={() => { setActionTab('Add'); setActionsOpen(true); }} data-testid="button-actions"><Wrench size={17} /></button>
            <button className={`tool-button sub ${adjustmentsOpen ? 'active' : ''}`} aria-label="Adjustments" title="Adjustments" onClick={() => setAdjustmentsOpen(true)} data-testid="button-adjustments"><Wand2 size={17} /></button>
            <button className={`tool-button sub ${tool === 'selection' ? 'active' : ''}`} aria-label="Selection" title="Selection" onClick={() => setTool('selection')} data-testid="tool-selection"><span className="select-glyph">S</span></button>
            <button className={`tool-button sub ${transformOpen ? 'active' : ''}`} aria-label="Transform" title="Transform" onClick={() => setTransformOpen(true)} data-testid="button-transform"><Navigation size={16} fill="currentColor" style={{ transform: 'rotate(90deg)' }} /></button>
          </div>
        </div>
        <div className="editor-controls" aria-label="Brush settings">
          <div className="vertical-control" title={`Brush size ${brushSize}`}><input aria-label="Brush size" type="range" min="1" max="100" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} data-testid="slider-brush-size" /></div>
          <div className="vertical-control" title={`Opacity ${opacity}%`}><input aria-label="Brush opacity" type="range" min="5" max="100" value={opacity} onChange={event => setOpacity(Number(event.target.value))} data-testid="slider-opacity" /></div>
        </div>
        <div className="canvas-stage">
          <div className="paper" ref={paperRef} style={{ width: paperSize.width, height: paperSize.height }} data-testid="canvas-paper">
            {drawGuide && <div className="canvas-guide" style={{ backgroundSize: `${guideSpacing}px ${guideSpacing}px` }} aria-hidden="true" />}
            {pageAssist && <div className="page-assist-grid" aria-hidden="true" />}
            {referenceEnabled && referenceUrl && <img className="reference-overlay" src={referenceUrl} alt="Reference image overlay" />}
            {project.layers.map(layer => (
              <canvas key={layer.id} ref={element => { canvasRefs.current[layer.id] = element; }} width={project.width} height={project.height}
                style={{ display: layer.visible ? 'block' : 'none', pointerEvents: layer.id === activeLayer?.id ? 'auto' : 'none', zIndex: project.layers.indexOf(layer) }}
                onPointerDown={layer.id === activeLayer?.id ? onPointerDown : undefined}
                onPointerMove={layer.id === activeLayer?.id ? onPointerMove : undefined}
                onPointerUp={layer.id === activeLayer?.id ? onPointerUp : undefined}
                onPointerCancel={layer.id === activeLayer?.id ? onPointerUp : undefined}
                aria-label={`${layer.name} drawing surface`} data-testid={`canvas-layer-${layer.id}`} />
            ))}
            {quickShapeDraft && <svg className="shape-preview" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="none" aria-hidden="true">
              {quickShape === 'Line' && <line x1={quickShapeDraft.from.x} y1={quickShapeDraft.from.y} x2={quickShapeDraft.to.x} y2={quickShapeDraft.to.y} />}
              {quickShape === 'Rectangle' && <rect x={Math.min(quickShapeDraft.from.x, quickShapeDraft.to.x)} y={Math.min(quickShapeDraft.from.y, quickShapeDraft.to.y)} width={Math.abs(quickShapeDraft.from.x - quickShapeDraft.to.x)} height={Math.abs(quickShapeDraft.from.y - quickShapeDraft.to.y)} />}
              {quickShape === 'Ellipse' && <ellipse cx={(quickShapeDraft.from.x + quickShapeDraft.to.x) / 2} cy={(quickShapeDraft.from.y + quickShapeDraft.to.y) / 2} rx={Math.abs(quickShapeDraft.from.x - quickShapeDraft.to.x) / 2} ry={Math.abs(quickShapeDraft.from.y - quickShapeDraft.to.y) / 2} />}
            </svg>}
            {colorDropTarget && colorDrag && <div className="color-drop-mark" style={{ left: colorDropTarget.x - (paperRef.current?.getBoundingClientRect().left ?? 0), top: colorDropTarget.y - (paperRef.current?.getBoundingClientRect().top ?? 0) }}><span style={{ background: color }} /></div>}
          </div>
        </div>
        {colorDrag && <div className="drag-color-chip" style={{ left: colorDrag.x, top: colorDrag.y, background: color }} aria-hidden="true" />}
        <div className="brush-label" hidden>{actionsMessage || (activeLayer?.locked ? 'Layer locked' : `${tool[0].toUpperCase()}${tool.slice(1)} · ${brushSize}px · ${opacity}%`)}</div>
        <input id="insert-image-file" className="hidden-file" type="file" accept="image/*" onChange={event => { addImageFile(event.target.files?.[0]); event.target.value = ''; }} />
        <input id="insert-photo-file" className="hidden-file" type="file" accept="image/*" capture="environment" onChange={event => { addImageFile(event.target.files?.[0]); event.target.value = ''; }} />
        <input id="reference-image-file" className="hidden-file" type="file" accept="image/*" onChange={event => {
          const file = event.target.files?.[0];
          if (file) { setReferenceUrl(URL.createObjectURL(file)); setReferenceEnabled(true); }
          event.target.value = '';
        }} />
        {layersOpen && <LayersSheet project={project} activeLayerId={activeLayer?.id ?? ''} onClose={() => setLayersOpen(false)} onAdd={addLayer} onActive={setActiveLayerId} onVisibility={setLayerVisibility} onRename={renameLayer} onDelete={deleteLayer} onLock={toggleLayerLock} onDuplicate={duplicateLayer} onClear={clearLayer} onReorder={reorderLayers} canvasRefs={canvasRefs.current} />}
        {colorOpen && <ColorPicker color={color} onChange={setColor} onClose={() => setColorOpen(false)} />}
        {actionsOpen && <ActionsSheet tab={actionTab} onTab={setActionTab} onClose={() => setActionsOpen(false)} message={actionsMessage} guide={drawGuide} reference={referenceEnabled} pageAssist={pageAssist}
          onAction={action => {
            if (action === 'Insert a file' || action === 'Insert a photo' || action === 'Take a photo') {
              document.getElementById(action === 'Take a photo' ? 'insert-photo-file' : 'insert-image-file')?.click();
            } else if (action === 'Add text') { setTextDraft(''); setTextOpen(true); }
            else if (action === 'Undo') undo();
            else if (action === 'Redo') redo();
            else if (action === 'QuickShape') { setActionsOpen(false); setQuickShapeArmed(value => !value); setTool('brush'); }
            else if (action === 'Liquify') { setActionsOpen(false); setLiquifyOpen(true); }
            else if (action === 'Cut') cutActiveLayer();
            else if (action === 'Copy') copyActiveLayer();
            else if (action === 'Copy canvas') copyCanvas();
            else if (action === 'Paste') pasteClipboard();
            else if (action === 'Share' || action === 'Export PNG') exportPng();
            else if (action === 'Animation Assist') openAnimation();
            else if (action === 'Reference') { if (!referenceUrl) document.getElementById('reference-image-file')?.click(); else setReferenceEnabled(value => !value); }
            else if (action === 'Canvas information') setCanvasInfoOpen(true);
            else if (action === 'Prefs') setAppPreferencesOpen(true);
            else if (action === 'Help') setActionsMessage('Draw on the canvas, drag the color dot to fill, and use Actions for canvas tools.');
            else performCanvasAction(action);
          }}
          onExport={exportPng}
          onVideo={() => { setActionsOpen(false); openAnimation(); }}
          onPrefs={() => { setActionsOpen(false); setAppPreferencesOpen(true); }}
          onHelp={() => setActionsMessage('Aeternum Paint keeps artwork on this device. Drag the color control onto the canvas to flood-fill.') }
          clipboardReady={!!clipboard.current}
          animationFrames={project.animation ?? []}
          animationIndex={animationFrameIndex}
          animationPlaying={animationPlaying}
          onPlay={() => setAnimationPlaying(value => !value)}
          onFrame={showAnimationFrame}
          onAddFrame={() => addAnimationFrame()}
          onDuplicateFrame={() => addAnimationFrame(true)}
          onDeleteFrame={deleteAnimationFrame}
          onFrameOptions={() => setFrameOptionsOpen(true)} />}
        {adjustmentsOpen && <AdjustmentsSheet active={activeAdjustment} value={adjustmentValue} onValue={setAdjustmentValue} onSelect={selectAdjustment} onApply={applySelectedAdjustment} onClose={() => setAdjustmentsOpen(false)} />}
        {activeAdjustment && adjustmentsOpen && <div className="adjustment-toolbar"><strong>{activeAdjustment}</strong><label>Amount <input type="range" min="0" max="100" value={adjustmentValue} onChange={event => setAdjustmentValue(Number(event.target.value))} /></label><button onClick={applySelectedAdjustment}>Apply</button></div>}
        {liquifyOpen && <LiquifySheet mode={liquifyMode} onMode={setLiquifyMode} values={liquifyValues} onValues={setLiquifyValues} onApply={applyLiquifyNow} onCancel={() => setLiquifyOpen(false)} />}
        {transformOpen && <TransformSheet mode={transformMode} onMode={setTransformMode} scale={transformScale} onScale={setTransformScale} snap={transformSnap} onSnap={setTransformSnap} interpolation={interpolation} onInterpolation={setInterpolation} onApply={applyTransform} onClose={() => setTransformOpen(false)} />}
        {quickShapeOpen && <QuickShapeSheet shape={quickShape} snap={quickShapeSnap} onSnap={setQuickShapeSnap} onShape={setQuickShape} onApply={applyQuickShape} onClose={() => { setQuickShapeOpen(false); setQuickShapeDraft(null); }} />}
        {canvasSizeOpen && <CanvasSizeSheet mode={canvasOperation} width={resizeWidth} height={resizeHeight} onWidth={setResizeWidth} onHeight={setResizeHeight} onMode={setCanvasOperation} onApply={applyCanvasSize} onClose={() => setCanvasSizeOpen(false)} />}
        {canvasInfoOpen && <InfoSheet project={project} onClose={() => setCanvasInfoOpen(false)} />}
        {guideSettingsOpen && <GuideSheet spacing={guideSpacing} onSpacing={setGuideSpacing} onClose={() => setGuideSettingsOpen(false)} />}
        {textOpen && <TextSheet value={textDraft} onChange={setTextDraft} onApply={applyText} onClose={() => setTextOpen(false)} />}
        {frameOptionsOpen && <FrameOptionsSheet hold={frameHold} background={frameBackground} onChange={updateFrameSettings} onDuplicate={() => addAnimationFrame(true)} onDelete={deleteAnimationFrame} onClose={() => setFrameOptionsOpen(false)} />}
        {appPreferencesOpen && <PreferencesSheet stabilization={brushStabilization} onStabilization={setBrushStabilization} onClose={() => setAppPreferencesOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="studio-shell">
      <div className="studio-content">
        <section className="gallery-wrap">
          <header className="topline">
            <div className="brand"><div className="brand-mark"><PenLine size={17} /></div><span className="brand-name">Aeternum Paint</span></div>
            <div className="top-note">A small studio for the things you make</div>
          </header>
          <div className="gallery-heading">
            <div><h1>Aeternum Paint</h1><p className="gallery-subtitle">Your drawings, right here.</p></div>
            <div className="gallery-actions">
              <label className="search-box"><Search size={17} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a canvas" aria-label="Search artwork" data-testid="input-search-artwork" /></label>
              <button className="pill-button" onClick={() => setSheetOpen(true)} data-testid="button-new-canvas"><Plus size={18} />New canvas</button>
            </div>
          </div>
          <div className="gallery-meta"><span>{search ? `Results for “${search}”` : 'RECENT WORK'}</span><span>{artworks.length} {artworks.length === 1 ? 'canvas' : 'canvases'}</span></div>
          {loading ? (
            <div className="art-grid" aria-label="Loading artworks">{[0,1,2,3].map(item => <div key={item} className="art-thumb" style={{ background: 'linear-gradient(110deg,#e8e4dd 25%,#f4f0e8 38%,#e8e4dd 60%)', backgroundSize: '200% 100%' }} />)}</div>
          ) : loadFailed ? (
            <div className="empty-gallery"><CircleHelp size={30} /><h2>Your gallery couldn't open</h2><p>Your drawings stay on this device. Try opening them again.</p><button className="pill-button" onClick={() => void refresh()} data-testid="button-retry-gallery">Try again</button></div>
          ) : filtered.length ? (
            <div className="art-grid">
              {filtered.map(artwork => (
                <button className="art-card" key={artwork.id} onClick={() => selecting ? toggleArtworkSelection(artwork.id) : openArtwork(artwork)} data-testid={`card-artwork-${artwork.id}`}>
                  <div className="art-thumb">
                    {artwork.preview ? <img src={artwork.preview} alt={`${artwork.title} artwork preview`} /> : <div className="thumb-placeholder"><PenLine size={26} /></div>}
                    {selectedArtworkIds.includes(artwork.id) && <span className="selection-mark"><Check size={16} /></span>}
                  </div>
                  <div className="art-info"><div><div className="art-title">{artwork.title || 'Untitled Artwork'}</div><div className="art-dim">{artwork.width} × {artwork.height}px</div></div><span className="art-kebab" aria-hidden="true"><MoreHorizontal size={18} /></span></div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-gallery">
              <div className="brand-mark"><PenLine size={18} /></div>
              <h2>{search ? 'Nothing by that name, yet.' : 'A blank page is a beginning.'}</h2>
              <p>{search ? 'Try another title, or clear your search.' : 'Make a small space for a big idea.'}</p>
              {search ? <button className="pill-button" onClick={() => setSearch('')} data-testid="button-clear-search">Clear search</button> : <button className="pill-button" onClick={() => setSheetOpen(true)} data-testid="button-start-drawing"><Plus size={17} />Start drawing</button>}
            </div>
          )}
        </section>
        <div className="bottom-create" aria-label="Gallery actions">
          <button title={selecting ? 'Done selecting' : 'Select artworks'} aria-label={selecting ? 'Done selecting artworks' : 'Select artworks'} onClick={() => { setSelecting(value => !value); setSelectedArtworkIds([]); }} data-testid="button-select-artwork">{selecting ? <X size={19} /> : <Check size={19} />}</button>
          <button title="New canvas" aria-label="New canvas" onClick={() => setSheetOpen(true)} data-testid="button-sheet-create"><FileImage size={19} /></button>
          <button title="Import artwork" aria-label="Import artwork" onClick={() => document.getElementById('import-artwork')?.click()} data-testid="button-import"><Copy size={18} /></button>
          <input id="import-artwork" type="file" accept="image/png,image/jpeg" hidden onChange={event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const image = new Image();
            image.onload = () => {
              const width = Math.min(image.naturalWidth, 4096);
              const height = Math.min(image.naturalHeight, 4096);
              const imported: Artwork = { id: makeId(), title: file.name.replace(/\.[^.]+$/, ''), width, height, created: Date.now(), updated: Date.now(), layers: [makeLayer(1)], preview: undefined };
              setProject(imported);
              setActiveLayerId(imported.layers[0].id);
              setScreen('editor');
              setTimeout(() => {
                const canvas = canvasRefs.current[imported.layers[0].id];
                if (canvas) {
                  canvas.width = width; canvas.height = height;
                  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
                  setTimeout(() => persist(imported), 80);
                }
              }, 120);
            };
            image.src = URL.createObjectURL(file);
            event.target.value = '';
          }} />
        </div>
        <button className="create-round" title="Create canvas" aria-label="Create canvas" onClick={() => setSheetOpen(true)} data-testid="button-create-fab"><Plus size={23} /></button>
      </div>
      {selecting && selectedArtworkIds.length > 0 && <button className="selection-delete" onClick={() => void deleteSelectedArtworks()} data-testid="button-delete-selected"><Trash2 size={16} />Delete {selectedArtworkIds.length} {selectedArtworkIds.length === 1 ? 'artwork' : 'artworks'}</button>}
      {sheetOpen && <NewCanvasSheet onClose={() => setSheetOpen(false)} onCreate={createArtwork} customWidth={customWidth} customHeight={customHeight} setCustomWidth={setCustomWidth} setCustomHeight={setCustomHeight} selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset} />}
    </main>
  );
}

function compositePreview(project: Artwork, layers: Layer[], refs: Record<string, HTMLCanvasElement | null>) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 500 / project.width, 500 / project.height);
  canvas.width = Math.max(1, Math.round(project.width * scale));
  canvas.height = Math.max(1, Math.round(project.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  layers.forEach(layer => {
    const item = refs[layer.id];
    if (layer.visible && item) context.drawImage(item, 0, 0, canvas.width, canvas.height);
  });
  return canvas.toDataURL('image/jpeg', 0.82);
}

function NewCanvasSheet({ onClose, onCreate, customWidth, customHeight, setCustomWidth, setCustomHeight, selectedPreset, setSelectedPreset }: {
  onClose: () => void; onCreate: (title: string, width: number, height: number) => void; customWidth: string; customHeight: string;
  setCustomWidth: (value: string) => void; setCustomHeight: (value: string) => void; selectedPreset: number; setSelectedPreset: (value: number) => void;
}) {
  const createPreset = (preset: Preset, index: number) => { setSelectedPreset(index); onCreate(preset.name === 'Screen Size' ? 'Untitled Artwork' : preset.name === 'Untitled Canvas' ? 'Untitled Artwork' : preset.name, preset.width, preset.height); };
  const createCustom = () => {
    const width = Math.max(16, Math.min(8192, Math.floor(Number(customWidth) || 0)));
    const height = Math.max(16, Math.min(8192, Math.floor(Number(customHeight) || 0)));
    if (width >= 16 && height >= 16) onCreate('Untitled Artwork', width, height);
  };
  return (
    <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="new-canvas-title">
        <div className="sheet-handle" />
        <header className="sheet-head"><h2 id="new-canvas-title">New canvas</h2><button className="icon-button" onClick={onClose} aria-label="Close new canvas sheet" data-testid="button-close-new-canvas"><X size={18} /></button></header>
        <div className="preset-list">
          {presets.map((preset, index) => <button key={`${preset.name}-${preset.width}`} className={`preset-row ${selectedPreset === index ? 'selected' : ''}`} onClick={() => createPreset(preset, index)} data-testid={`button-preset-${index}`}>
            <span className="preset-label">{preset.name}</span><span className="preset-detail"><span>{preset.color}</span><span>{preset.detail}</span></span>
          </button>)}
        </div>
        <div className="custom-size">
          <p className="custom-title">Make a custom size</p>
          <div className="dimension-fields">
            <label>Width (px)<input type="number" min="16" max="8192" value={customWidth} onChange={event => setCustomWidth(event.target.value)} aria-label="Custom canvas width" data-testid="input-custom-width" /></label>
            <label>Height (px)<input type="number" min="16" max="8192" value={customHeight} onChange={event => setCustomHeight(event.target.value)} aria-label="Custom canvas height" data-testid="input-custom-height" /></label>
            <button className="pill-button" onClick={createCustom} data-testid="button-create-custom">Create</button>
          </div>
        </div>
        <p className="sheet-footer">Your canvases are stored privately on this device.</p>
      </section>
    </div>
  );
}

function LayersSheet({ project, activeLayerId, onClose, onAdd, onActive, onVisibility, onRename, onDelete, onLock, onDuplicate, onClear, onReorder, canvasRefs }: {
  project: Artwork; activeLayerId: string; onClose: () => void; onAdd: () => void; onActive: (id: string) => void;
  onVisibility: (id: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
  onLock: (id: string) => void; onDuplicate: (id: string) => void; onClear: (id: string) => void; onReorder: (source: string, target: string) => void;
  canvasRefs: Record<string, HTMLCanvasElement | null>;
}) {
  const [menuId, setMenuId] = useState('');
  const [renameId, setRenameId] = useState('');
  return <>
    <div className="panel-overlay" onClick={onClose} />
    <section className="layers-panel" role="dialog" aria-modal="true" aria-label="Layers">
      <div className="sheet-handle" />
      <header className="layer-head"><h2>Layers</h2><div className="layer-actions">
        <div className="layer-menu">
          <button className="icon-button" aria-label="More layer actions" onClick={() => setMenuId(menuId === 'menu' ? '' : 'menu')} data-testid="button-layer-menu"><MoreHorizontal size={19} /></button>
          {menuId === 'menu' && <div className="menu-pop">
            <button onClick={() => { setRenameId(activeLayerId); setMenuId(''); }}>Rename</button>
            <button onClick={() => { onLock(activeLayerId); setMenuId(''); }}>{project.layers.find(layer => layer.id === activeLayerId)?.locked ? 'Unlock' : 'Lock'}</button>
            <button onClick={() => { onDuplicate(activeLayerId); setMenuId(''); }}>Duplicate</button>
            <button onClick={() => { onClear(activeLayerId); setMenuId(''); }}>Clear</button>
            <button onClick={() => { onDelete(activeLayerId); setMenuId(''); }}>Delete layer</button>
          </div>}
        </div>
        <button className="icon-button" aria-label="Add layer" onClick={onAdd} data-testid="button-add-layer"><Plus size={20} /></button>
      </div></header>
      {project.layers.slice().reverse().map(layer => <div key={layer.id} className={`layer-row ${activeLayerId === layer.id ? 'active' : ''}`} onClick={() => onActive(layer.id)} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', layer.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onReorder(event.dataTransfer.getData('text/plain'), layer.id); }} data-testid={`row-layer-${layer.id}`}>
        <div className="layer-preview">{canvasRefs[layer.id] && <canvas ref={element => {
          if (!element || !canvasRefs[layer.id]) return;
          const source = canvasRefs[layer.id]!;
          element.width = 150; element.height = 94;
          element.getContext('2d')?.drawImage(source, 0, 0, 150, 94);
        }} />}</div>
        {renameId === layer.id ? <input autoFocus className="layer-name" defaultValue={layer.name} aria-label="Rename layer" onBlur={event => { onRename(layer.id, event.target.value); setRenameId(''); }} onKeyDown={event => { if (event.key === 'Enter') { onRename(layer.id, event.currentTarget.value); setRenameId(''); } }} onClick={event => event.stopPropagation()} data-testid={`input-layer-name-${layer.id}`} /> :
          <button className="layer-name" onClick={event => { event.stopPropagation(); setRenameId(layer.id); }} aria-label={`Rename ${layer.name}`} data-testid={`button-rename-layer-${layer.id}`}>{layer.name}</button>}
        <button className="layer-vis" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={event => { event.stopPropagation(); onVisibility(layer.id); }} data-testid={`button-visibility-${layer.id}`}>{layer.visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
        {activeLayerId === layer.id && <span aria-label={layer.locked ? 'Layer locked' : 'Normal blend mode'} style={{ fontSize: 10, marginRight: 3 }}>{layer.locked ? 'L' : 'N'}</span>}
      </div>)}
      {project.layers.find(layer => layer.id === activeLayerId) && <div className="layer-action-strip">
        <button onClick={() => onLock(activeLayerId)} data-testid="button-lock-layer">{project.layers.find(layer => layer.id === activeLayerId)?.locked ? <Unlock size={15} /> : <Lock size={15} />}{project.layers.find(layer => layer.id === activeLayerId)?.locked ? 'Unlock' : 'Lock'}</button>
        <button onClick={() => onDuplicate(activeLayerId)} data-testid="button-duplicate-layer"><Copy size={15} />Duplicate</button>
        <button className="clear-layer" onClick={() => onClear(activeLayerId)} data-testid="button-clear-layer"><X size={15} />Clear</button>
      </div>}
      <div className="layer-row" style={{ opacity: .7 }}><div className="layer-preview" /><span className="layer-name">Background color</span><Check size={16} /></div>
      <p className="sheet-footer">Tap a layer to draw on it. Press its name to rename.</p>
    </section>
  </>;
}

type ActionTab = 'Add' | 'Canvas' | 'Share' | 'Video' | 'Prefs' | 'Help';
function ActionsSheet({ tab, onTab, onClose, onAction, message, clipboardReady, guide, reference, pageAssist, animationFrames, animationIndex, animationPlaying, onPlay, onFrame, onAddFrame, onDuplicateFrame, onDeleteFrame, onFrameOptions }: {
  tab: ActionTab; onTab: (tab: ActionTab) => void; onClose: () => void; onAction: (action: string) => void; onExport: () => void;
  onVideo: () => void; onPrefs: () => void; onHelp: () => void; message: string; clipboardReady: boolean; guide: boolean; reference: boolean; pageAssist: boolean;
  animationFrames: AnimationFrame[]; animationIndex: number; animationPlaying: boolean; onPlay: () => void;
  onFrame: (frame: AnimationFrame, index: number) => void; onAddFrame: () => void; onDuplicateFrame: () => void; onDeleteFrame: () => void; onFrameOptions: () => void;
}) {
  const tabs: ActionTab[] = ['Add', 'Canvas', 'Share', 'Video', 'Prefs', 'Help'];
  const groups: Record<ActionTab, string[][]> = {
    Add: [['Undo', 'Redo', 'QuickShape', 'Liquify'], ['Insert a file', 'Insert a photo', 'Take a photo', 'Add text'], ['Cut', 'Copy', 'Copy canvas', 'Paste']],
    Canvas: [['Crop & Resize'], ['Animation Assist', 'Page Assist', 'Drawing Guide', 'Edit Drawing Guide'], ['Reference'], ['Flip horizontal', 'Flip vertical'], ['Canvas information']],
    Share: [['Export PNG', 'Copy canvas']],
    Video: [],
    Prefs: [['Prefs']],
    Help: [['Help']],
  };
  const switches = (action: string) => action === 'Animation Assist' ? animationFrames.length > 0 : action === 'Page Assist' ? pageAssist : action === 'Drawing Guide' ? guide : action === 'Reference' ? reference : false;
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="actions-sheet" role="dialog" aria-modal="true" aria-label="Actions">
      <div className="sheet-handle" />
      <header className="actions-heading"><h2>Actions</h2><button className="icon-button" onClick={onClose} aria-label="Close Actions" data-testid="button-close-actions"><X size={18} /></button></header>
      <div className="action-tabs" role="tablist" aria-label="Action categories">
        {tabs.map((item, index) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'selected' : ''} onClick={() => onTab(item)} data-testid={`tab-actions-${item.toLowerCase()}`}>
          <span className="action-tab-icon">{index === 0 ? <Plus size={18} /> : index === 1 ? <Crop size={18} /> : index === 2 ? <Share2 size={18} /> : index === 3 ? <Film size={18} /> : index === 4 ? <Settings size={18} /> : <HelpCircle size={18} />}</span>{item}
        </button>)}
      </div>
      {tab === 'Video' ? <div className="video-assist">
        <div className="video-controls">
          <button className="icon-button" onClick={onPlay} aria-label={animationPlaying ? 'Pause animation' : 'Play animation'} data-testid="button-animation-play">{animationPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
          <div className="video-frame-count">{animationFrames.length} {animationFrames.length === 1 ? 'frame' : 'frames'}</div>
          <button className="icon-button" onClick={onFrameOptions} aria-label="Frame options" data-testid="button-frame-options"><MoreHorizontal size={19} /></button>
          <button className="icon-button" onClick={onAddFrame} aria-label="Add frame" data-testid="button-add-frame"><Plus size={20} /></button>
        </div>
        <div className="timeline-strip">
          {animationFrames.map((frame, index) => <button key={frame.id} className={`timeline-frame ${index === animationIndex ? 'current' : ''}`} onClick={() => onFrame(frame, index)} aria-label={`Show frame ${index + 1}`} data-testid={`button-frame-${index}`}>
            <span>{index + 1}</span><small>{frame.hold ? `${(frame.hold / 10).toFixed(1)}s` : 'None'}</small>
          </button>)}
          {!animationFrames.length && <span className="timeline-empty">Add a frame to begin the animation.</span>}
        </div>
        <div className="frame-shortcuts"><button onClick={onDuplicateFrame} disabled={!animationFrames.length} data-testid="button-duplicate-frame"><Copy size={15} />Duplicate frame</button><button onClick={onDeleteFrame} disabled={animationFrames.length <= 1} data-testid="button-delete-frame"><Trash2 size={15} />Delete frame</button></div>
        <p className="sheet-footer">Tap a frame to edit it. Frames are stored with this artwork.</p>
      </div> : tab === 'Prefs' ? <div className="action-groups"><button className="action-row" onClick={() => onAction('Prefs')}><Settings size={17} />Preferences<ChevronRight size={16} /></button></div> :
        tab === 'Help' ? <div className="help-copy"><HelpCircle size={22} /><h3>Keep making.</h3><p>Draw with the floating tools. Drag the color control onto a closed shape to fill it. Actions holds canvas, import, and animation tools.</p><button className="action-row" onClick={() => onAction('Help')}>Drawing help<ChevronRight size={16} /></button></div> :
          <div className="action-groups">
            {groups[tab].map((group, groupIndex) => <div className="action-group" key={`${tab}-${groupIndex}`}>
              {group.map(action => {
                const isToggle = ['Animation Assist', 'Page Assist', 'Drawing Guide', 'Reference'].includes(action);
                const isDisabled = action === 'Paste' && !clipboardReady;
                return <button className={`action-row ${isDisabled ? 'disabled' : ''}`} key={action} disabled={isDisabled} onClick={() => onAction(action)} data-testid={`action-${action.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                  <span>{action === 'Edit Drawing Guide' && !guide ? <span className="disabled-copy">Edit Drawing Guide</span> : action}</span>
                  {isToggle ? <span className={`toggle-control ${switches(action) ? 'on' : ''}`} aria-hidden="true"><i /></span> : action === 'Crop & Resize' || action === 'Canvas information' ? <ChevronRight size={16} /> : action === 'Export PNG' ? <Download size={16} /> : null}
                </button>;
              })}
            </div>)}
            {message && <p className="action-feedback" role="status">{message}</p>}
          </div>}
      {tab === 'Canvas' && <div className="action-footer-note">{message || 'Canvas dimensions and visual guides affect this artwork.'}</div>}
    </section>
  </div>;
}

const adjustmentNames = [
  'Hue, Saturation, Brightness', 'Color Balance', 'Curves', 'Gradient Map',
  'Gaussian Blur', 'Motion Blur', 'Perspective Blur', 'Noise', 'Sharpen', 'Bloom',
  'Glitch', 'Halftone', 'Chromatic Aberration', 'Liquify', 'Clone',
];
function AdjustmentsSheet({ active, value, onValue, onSelect, onApply, onClose }: {
  active: string; value: number; onValue: (value: number) => void; onSelect: (name: string) => void; onApply: () => void; onClose: () => void;
}) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="actions-sheet adjustments-sheet" role="dialog" aria-modal="true" aria-label="Adjustments">
      <div className="sheet-handle" /><header className="actions-heading"><h2>Adjustments</h2><button className="icon-button" onClick={onClose} aria-label="Close adjustments"><X size={18} /></button></header>
      <div className="adjustment-list">
        {adjustmentNames.map((name, index) => <button key={name} className={`action-row ${active === name ? 'selected' : ''} ${[4,7,13].includes(index) ? 'group-start' : ''}`} onClick={() => onSelect(name)} data-testid={`adjustment-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{name}<ChevronRight size={15} /></button>)}
      </div>
      {active && active !== 'Liquify' && active !== 'Clone' && <div className="adjustment-controls"><strong>{active}</strong><label>Amount <span>{value}%</span><input type="range" min="0" max="100" value={value} onChange={event => onValue(Number(event.target.value))} aria-label={`${active} amount`} /></label><button className="primary-action" onClick={onApply}>Apply adjustment</button></div>}
      <p className="sheet-footer">Changes affect the selected layer and can be undone.</p>
    </section>
  </div>;
}

const liquifyModes: LiquifyMode[] = ['Push', 'Twirl Right', 'Twirl Left', 'Pinch', 'Expand', 'Crystals', 'Edge', 'Reconstruct'];
function LiquifySheet({ mode, onMode, values, onValues, onApply, onCancel }: {
  mode: LiquifyMode; onMode: (mode: LiquifyMode) => void; values: { amount: number; size: number; pressure: number; distortion: number; momentum: number };
  onValues: (values: { amount: number; size: number; pressure: number; distortion: number; momentum: number }) => void; onApply: () => void; onCancel: () => void;
}) {
  const [chooseMode, setChooseMode] = useState(false);
  const slider = (key: keyof typeof values, label: string) => <label className="setting-slider" key={key}><span>{label}</span><b>{values[key] === 100 ? 'Max' : `${values[key]}%`}</b><input type="range" min="0" max="100" value={values[key]} onChange={event => onValues({ ...values, [key]: Number(event.target.value) })} aria-label={`${label} setting`} /></label>;
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="liquify-sheet" role="dialog" aria-modal="true" aria-label="Liquify settings">
      <div className="sheet-handle" /><header className="actions-heading"><h2>Liquify</h2><button className="icon-button blue-check" onClick={onApply} aria-label="Apply liquify" data-testid="button-apply-liquify"><Check size={21} /></button></header>
      <div className="liquify-choice">
        <button className="mode-choice" onClick={() => setChooseMode(value => !value)} aria-expanded={chooseMode} data-testid="button-liquify-mode"><Wand2 size={17} />{mode}<ChevronRight size={17} /></button>
        <button className="mode-reset" onClick={() => onValues({ amount: 50, size: 70, pressure: 73, distortion: 36, momentum: 85 })} data-testid="button-liquify-reset">Reset</button>
      </div>
      {chooseMode && <div className="liquify-mode-list">{liquifyModes.map(item => <button key={item} className={item === mode ? 'chosen' : ''} onClick={() => { onMode(item); setChooseMode(false); }} data-testid={`liquify-mode-${item.toLowerCase().replace(/\s+/g, '-')}`}>{item}{item === mode && <Check size={16} />}</button>)}</div>}
      <div className="setting-list">{slider('amount', 'Amount')}{slider('size', 'Size')}{slider('pressure', 'Pressure')}{slider('distortion', 'Distortion')}{slider('momentum', 'Momentum')}</div>
      <div className="sheet-actions"><button onClick={onCancel}>Cancel</button><button className="primary-action" onClick={onApply}>Apply to layer</button></div>
    </section>
  </div>;
}

function TransformSheet({ mode, onMode, scale, onScale, snap, onSnap, interpolation, onInterpolation, onApply, onClose }: {
  mode: 'Freeform' | 'Uniform' | 'Distort' | 'Warp'; onMode: (mode: 'Freeform' | 'Uniform' | 'Distort' | 'Warp') => void;
  scale: number; onScale: (value: number) => void; snap: boolean; onSnap: (value: boolean) => void; interpolation: string; onInterpolation: (value: string) => void; onApply: () => void; onClose: () => void;
}) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="transform-sheet" role="dialog" aria-modal="true" aria-label="Transform">
      <div className="sheet-handle" /><div className="segmented-control">{(['Freeform', 'Uniform', 'Distort', 'Warp'] as const).map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => onMode(item)} data-testid={`transform-${item.toLowerCase()}`}>{item}</button>)}</div>
      <label className="setting-slider">Scale <b>{scale}%</b><input type="range" min="20" max="180" value={scale} onChange={event => onScale(Number(event.target.value))} aria-label="Transform scale" /></label>
      <button className="action-row" onClick={() => onSnap(!snap)} data-testid="toggle-transform-snap">Snap {snap ? 'On · 15°' : 'Off'}<span className={`toggle-control ${snap ? 'on' : ''}`}><i /></span></button>
      {mode === 'Distort' && <label className="setting-slider">Width <b>{scale}%</b><input type="range" min="20" max="180" value={scale} onChange={event => onScale(Number(event.target.value))} aria-label="Transform width" /></label>}
      {mode === 'Warp' && <p className="sheet-footer">Warp applies a gentle horizontal perspective shift to the active layer.</p>}
      <label className="select-setting">Interpolation<select value={interpolation} onChange={event => onInterpolation(event.target.value)} aria-label="Interpolation method"><option>Bilinear</option><option>Bicubic</option><option>Nearest neighbor</option></select></label>
      <div className="sheet-actions"><button onClick={onClose}>Cancel</button><button className="primary-action" onClick={onApply} data-testid="button-apply-transform">Apply transform</button></div>
    </section>
  </div>;
}

function QuickShapeSheet({ shape, snap, onSnap, onShape, onApply, onClose }: { shape: 'Line' | 'Ellipse' | 'Rectangle'; snap: boolean; onSnap: (value: boolean) => void; onShape: (shape: 'Line' | 'Ellipse' | 'Rectangle') => void; onApply: () => void; onClose: () => void }) {
  return <div className="overlay quickshape-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="quickshape-sheet" role="dialog" aria-modal="true" aria-label="QuickShape editing">
      <div className="sheet-handle" /><header className="actions-heading"><div><h2>QuickShape</h2><p>{shape}</p></div><button className="icon-button blue-check" onClick={onApply} aria-label="Apply QuickShape" data-testid="button-apply-quickshape"><Check size={20} /></button></header>
      <div className="shape-options">{(['Line', 'Ellipse', 'Rectangle'] as const).map(item => <button key={item} className={item === shape ? 'selected' : ''} onClick={() => onShape(item)} data-testid={`quickshape-${item.toLowerCase()}`}>{item === 'Line' ? 'Line' : item === 'Ellipse' ? 'Ellipse' : 'Rectangle'}</button>)}</div>
      <button className="action-row" onClick={() => onSnap(!snap)}>Snap angles <span className={`toggle-control ${snap ? 'on' : ''}`}><i /></span></button>
      <div className="sheet-actions"><button onClick={onClose}>Cancel</button><button className="primary-action" onClick={onApply}>Apply shape</button></div>
    </section>
  </div>;
}

function CanvasSizeSheet({ mode, width, height, onMode, onWidth, onHeight, onApply, onClose }: {
  mode: 'Resize' | 'Crop'; width: string; height: string; onMode: (mode: 'Resize' | 'Crop') => void; onWidth: (value: string) => void; onHeight: (value: string) => void; onApply: () => void; onClose: () => void;
}) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Crop and resize canvas">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Crop &amp; Resize</h2><button className="icon-button" onClick={onClose} aria-label="Close crop and resize"><X size={18} /></button></header>
    <div className="segmented-control"><button className={mode === 'Crop' ? 'selected' : ''} onClick={() => onMode('Crop')}>Crop</button><button className={mode === 'Resize' ? 'selected' : ''} onClick={() => onMode('Resize')}>Resize</button></div>
    <p className="panel-hint">{mode === 'Crop' ? 'Crop is centered; new pixels are removed from the edges.' : 'Resize scales every layer to the new canvas dimensions.'}</p>
    <div className="dimension-fields"><label>Width (px)<input type="number" value={width} onChange={event => onWidth(event.target.value)} /></label><label>Height (px)<input type="number" value={height} onChange={event => onHeight(event.target.value)} /></label></div>
    <div className="sheet-actions"><button onClick={onClose}>Cancel</button><button className="primary-action" onClick={onApply} data-testid="button-apply-canvas-size">Apply</button></div>
  </section></div>;
}

function InfoSheet({ project, onClose }: { project: Artwork; onClose: () => void }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Canvas information">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Canvas information</h2><button className="icon-button" onClick={onClose} aria-label="Close canvas information"><X size={18} /></button></header>
    <dl className="info-list"><div><dt>Name</dt><dd>{project.title}</dd></div><div><dt>Dimensions</dt><dd>{project.width} × {project.height} px</dd></div><div><dt>Layers</dt><dd>{project.layers.length}</dd></div><div><dt>Animation frames</dt><dd>{project.animation?.length ?? 0}</dd></div><div><dt>Storage</dt><dd>On this device</dd></div></dl>
  </section></div>;
}

function TextSheet({ value, onChange, onApply, onClose }: { value: string; onChange: (value: string) => void; onApply: () => void; onClose: () => void }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Add text">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Add text</h2><button className="icon-button" onClick={onClose} aria-label="Close add text"><X size={18} /></button></header>
    <label className="text-entry">Text<input value={value} onChange={event => onChange(event.target.value)} placeholder="Write something" autoFocus data-testid="input-add-text" /></label>
    <p className="panel-hint">Text is placed on a new editable layer using the current color.</p>
    <div className="sheet-actions"><button onClick={onClose}>Cancel</button><button className="primary-action" onClick={onApply} disabled={!value.trim()} data-testid="button-apply-text">Add text layer</button></div>
  </section></div>;
}

function FrameOptionsSheet({ hold, background, onChange, onDuplicate, onDelete, onClose }: { hold: number; background: boolean; onChange: (hold: number, background: boolean) => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet frame-options" role="dialog" aria-modal="true" aria-label="Frame options">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Frame options</h2><button className="icon-button" onClick={onClose} aria-label="Close frame options"><X size={18} /></button></header>
    <label className="setting-slider">Hold duration <b>{hold ? `${(hold / 10).toFixed(1)} s` : 'None'}</b><input type="range" min="0" max="50" step="1" value={hold} onChange={event => onChange(Number(event.target.value), background)} aria-label="Frame hold duration" /></label>
    <button className="action-row" onClick={onDuplicate}>Duplicate</button><button className="action-row" onClick={onDelete}>Delete</button>
    <button className="action-row" onClick={() => onChange(hold, !background)}>Background <span className={`toggle-control ${background ? 'on' : ''}`}><i /></span></button>
  </section></div>;
}

function GuideSheet({ spacing, onSpacing, onClose }: { spacing: number; onSpacing: (value: number) => void; onClose: () => void }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Drawing guide">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Drawing guide</h2><button className="icon-button" onClick={onClose} aria-label="Close drawing guide"><X size={18} /></button></header>
    <label className="setting-slider">Grid size <b>{spacing}px</b><input type="range" min="8" max="120" value={spacing} onChange={event => onSpacing(Number(event.target.value))} aria-label="Grid size" /></label>
  </section></div>;
}

function PreferencesSheet({ stabilization, onStabilization, onClose }: { stabilization: number; onStabilization: (value: number) => void; onClose: () => void }) {
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet compact-sheet" role="dialog" aria-modal="true" aria-label="Preferences">
    <div className="sheet-handle" /><header className="actions-heading"><h2>Preferences</h2><button className="icon-button" onClick={onClose} aria-label="Close preferences"><X size={18} /></button></header>
    <label className="setting-slider">Brush stabilization <b>{stabilization}%</b><input type="range" min="0" max="90" value={stabilization} onChange={event => onStabilization(Number(event.target.value))} aria-label="Brush stabilization" /></label>
    <p className="panel-hint">A higher value smooths quick strokes while keeping pressure response.</p>
  </section></div>;
}

function ColorPicker({ color, onChange, onClose }: { color: string; onChange: (color: string) => void; onClose: () => void }) {
  const swatches = ['#3b3935','#e76c5b','#e6a54a','#7b9a7c','#779eb1','#c7a7a0','#454c72','#d7d2c8','#ffffff','#171717'];
  const setFromWheel = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hue = ((Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 360) % 360);
    onChange(`hsl(${Math.round(hue)}, 75%, 52%)`);
  };
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="color-panel" role="dialog" aria-modal="true" aria-label="Color picker">
      <header className="sheet-head"><h3>Colors</h3><button className="icon-button" onClick={onClose} aria-label="Close colors" data-testid="button-close-colors"><X size={18} /></button></header>
      <p className="custom-title">A small palette to begin</p>
      <div className="color-wheel" onClick={setFromWheel} role="button" aria-label="Choose hue from color wheel" data-testid="color-wheel" />
      <div className="color-swatches">{swatches.map(swatch => <button key={swatch} className="swatch" style={{ background: swatch }} aria-label={`Choose ${swatch}`} onClick={() => onChange(swatch)} data-testid={`swatch-${swatch.slice(1)}`} />)}</div>
      <div className="hex-row"><span style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: '0 0 0 1px #d5d0c7' }} /><input aria-label="Hex color value" value={color.startsWith('#') ? color : '#6d8c9c'} onChange={event => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) onChange(event.target.value); }} data-testid="input-hex-color" /><button className="pill-button" onClick={onClose} data-testid="button-apply-color">Done</button></div>
    </section>
  </div>;
}

export default AppHome;
