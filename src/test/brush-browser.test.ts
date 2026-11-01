import { describe, expect, it } from 'vitest';
import { browseBrushes, recordRecent, toggleFavorite, visibleBrushCategories } from '../components/paint/brush-browser';
import { getBrushDef } from '../components/paint/brushes';

const a = { ...getBrushDef('studio-pen'), id: 'a', name: 'Chalk', category: 'Pastels' };
const b = { ...a, id: 'b', name: 'Oil Paint', category: 'Oils' };
const state = { recent: ['a', 'b'], favorites: ['b'] };
describe('brush browsing', () => {
  it('puts the latest picked brush first without duplicates', () => {
    expect(recordRecent(state, 'b').recent).toEqual(['b', 'a']);
  });
  it('adds and removes favorites independently of recents', () => {
    expect(toggleFavorite(state, 'a')).toEqual({ recent: ['a', 'b'], favorites: ['b', 'a'] });
    expect(toggleFavorite(state, 'b').favorites).toEqual([]);
  });
  it('hides empty categories and includes populated custom categories', () => {
    expect(visibleBrushCategories([a, b], ['Pens', 'Pastels'])).toEqual(['Pastels', 'Oils']);
  });
  it('searches the whole library regardless of selected category', () => {
    expect(browseBrushes([a, b], 'Pastels', ' OIL ', state).map((brush) => brush.id)).toEqual(['b']);
  });
  it('reads recent and favorite tabs in saved order and ignores missing brushes', () => {
    expect(browseBrushes([a, b], 'Recent', '', { ...state, recent: ['b', 'deleted', 'a'] }).map((brush) => brush.id)).toEqual(['b', 'a']);
    expect(browseBrushes([a, b], 'Favorites', '', state).map((brush) => brush.id)).toEqual(['b']);
  });
});