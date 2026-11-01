import { cleanBrushName, type BrushDef } from './brushes';

export type BrushBrowserState = { recent: string[]; favorites: string[] };
const KEY = 'pp.brushBrowser';
export function readBrushBrowser(): BrushBrowserState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const ids = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
    return { recent: ids(saved.recent), favorites: ids(saved.favorites) };
  } catch { return { recent: [], favorites: [] }; }
}
export function saveBrushBrowser(state: BrushBrowserState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* unavailable storage */ }
}
export function recordRecent(state: BrushBrowserState, id: string): BrushBrowserState {
  return { ...state, recent: [id, ...state.recent.filter((item) => item !== id)] };
}
export function toggleFavorite(state: BrushBrowserState, id: string): BrushBrowserState {
  return { ...state, favorites: state.favorites.includes(id) ? state.favorites.filter((item) => item !== id) : [...state.favorites, id] };
}
export function visibleBrushCategories(library: BrushDef[], categories: string[]): string[] {
  return [...new Set([...categories, ...library.map((b) => b.category)])].filter((cat) => library.some((b) => b.category === cat));
}
export function browseBrushes(library: BrushDef[], category: string, query: string, state: BrushBrowserState): BrushDef[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle) return library.filter((b) => `${cleanBrushName(b.name)} ${b.category}`.toLocaleLowerCase().includes(needle));
  if (category === 'Recent' || category === 'Favorites') {
    const ids = category === 'Recent' ? state.recent : state.favorites;
    return ids.flatMap((id) => { const brush = library.find((b) => b.id === id); return brush ? [brush] : []; });
  }
  return library.filter((b) => b.category === category);
}