import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ readArtworks: vi.fn(), writeArtwork: vi.fn() }));
vi.mock('@/components/paint/storage', () => ({ ...storage }));
vi.mock('@/components/paint/Editor', () => ({ Editor: () => null }));
vi.mock('@/components/paint/Gallery', () => ({ Gallery: ({ artworks, loading }: { artworks: unknown[]; loading: boolean }) => <div data-testid="gallery">{loading ? 'loading' : artworks.length}</div> }));
vi.mock('@/components/paint/supplied-library', () => ({ installSuppliedLibrary: () => 0 }));
vi.mock('@/components/paint/settings', () => ({ applyTheme: () => {} }));
import Studio from '@/components/paint/Studio';

beforeEach(() => { vi.clearAllMocks(); });
it('keeps an empty gallery empty after the last canvas is deleted and the app restarts', async () => {
  storage.readArtworks.mockResolvedValue([]);
  const first = render(<Studio />);
  await waitFor(() => expect(first.getByTestId('gallery')).toHaveTextContent('0'));
  first.unmount();
  const restarted = render(<Studio />);
  await waitFor(() => expect(restarted.getByTestId('gallery')).toHaveTextContent('0'));
  expect(storage.writeArtwork).not.toHaveBeenCalled();
});