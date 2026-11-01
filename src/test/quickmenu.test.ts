import { expect, it } from 'vitest';
import { DEFAULT_QUICK, activeProfile, clampCentre, quickReducer, sanitizeQuick } from '@/components/paint/quickmenu';

it('has six buttons per profile', () => {
  expect(activeProfile(DEFAULT_QUICK).slots).toHaveLength(6);
});
it('reassigns one button of the active profile only', () => {
  const s = quickReducer(quickReducer(DEFAULT_QUICK, { type: 'create', id: 'b', name: 'Inking' }), { type: 'assign', slot: 2, action: 'fit' });
  expect(activeProfile(s).slots[2]).toBe('fit');
  expect(s.profiles.find((p) => p.id === 'default')!.slots[2]).toBe('copy');
});
it('creates, renames, switches and deletes profiles but never the last one', () => {
  let s = quickReducer(DEFAULT_QUICK, { type: 'create', id: 'b' });
  expect(s.active).toBe('b');
  s = quickReducer(s, { type: 'rename', id: 'b', name: 'Painting' });
  expect(s.profiles.find((p) => p.id === 'b')!.name).toBe('Painting');
  s = quickReducer(s, { type: 'switch', id: 'default' });
  expect(s.active).toBe('default');
  s = quickReducer(s, { type: 'delete', id: 'default' });
  expect(s.profiles).toHaveLength(1);
  expect(quickReducer(s, { type: 'delete', id: 'b' }).profiles).toHaveLength(1);
});
it('repairs bad saved data', () => {
  const s = sanitizeQuick({ active: 'x', profiles: [{ id: 'x', name: 'X', slots: ['undo', 'nope'] }] });
  expect(s.profiles[0]!.slots).toHaveLength(6);
  expect(s.profiles[0]!.slots[0]).toBe('undo');
});
it('keeps the menu on screen', () => {
  expect(clampCentre(0, 0, 100, 400, 800)).toEqual({ x: 112, y: 112 });
});
it('ships the Procreate Pocket default six', () => {
  expect(activeProfile(DEFAULT_QUICK).slots).toEqual(['new-layer', 'flip-h', 'copy', 'merge-down', 'clear-layer', 'flip-v']);
  expect(activeProfile(DEFAULT_QUICK).name).toBe('QuickMenu 1');
});
it('a new profile has No Action on all six buttons and is named QuickMenu 2', () => {
  const s = quickReducer(DEFAULT_QUICK, { type: 'create', id: 'n' });
  expect(activeProfile(s).slots).toEqual(Array(6).fill('none'));
  expect(activeProfile(s).name).toBe('QuickMenu 2');
});
