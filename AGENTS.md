<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Paint app rules
- The layers bar is always placed with left/top in screen px and scales from its top-left corner; size maths use base width x pinch scale, never a mid-transition bounding box (keeps the drag box equal to the visible bar).
- Selected-state highlights in the paint UI are drawn with `::before` because a global reset strips backgrounds from `.pp-button`.
- Gallery startup only reads saved artworks and never seeds canvases; deleted ids are tombstoned and never-opened empty records are purged on read, so a late autosave or old build can't resurrect a canvas.
- All brush formats enter through importBrushFile (content-sniffed) and the shared sanitizer; Procreate keys resolve through alias lists plus fuzzy matching because key names vary across Procreate versions, and supplied shapes use CDN asset pointers to keep tip geometry without bundling binaries.
- Colour sheet dimensions derive from measured content width and viewport space; the palette remains below picker and history, avoiding fixed-width overflow.
- Brush browsing uses a shared pure filter and ID-based Recent/Favorites preferences alongside existing device-local brush storage, keeping imported brushes searchable without duplicating definitions.
- Adjustment maths live in adjust-fx.ts and catalogue/defaults in adjust-defs.ts; destructive adjustments and adjustment layers render through the same applyCanvasEffect(value = swipe %) so both always match.
- Adjustment layers are a target of the same adjustment UI as destructive adjustments (canvas swipe, tap for Adjustment Actions); they are never paintable.
- QuickMenu state goes through the pure quickReducer in quickmenu.ts (profiles of six slots), so assignments/profiles stay testable and valid.
- Brush dabs take a seeded rng; strokes record their dabs so the end taper replays the identical stroke on release.
- Live text layers keep their TextDraft in LayerMeta.text and block painting until explicitly rasterized.
- Bundled pack brushes name built-in heads/textures without images; brush-heads.ts generates them procedurally and the engine stamps those canvases synchronously, so previews never wait on image decode.
- Undo/redo stacks persist to IndexedDB after every push/undo/redo, but only after the stored history has loaded, so an early save can't overwrite it.
