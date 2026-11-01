vi.mock('@/components/paint/storage', () => ({
  canvasToBlob: vi.fn(async () => new Blob(['png'])),
  loadImage: vi.fn(), openDatabase: vi.fn(), HISTORY_STORE: 'history',
}));
import { canvasToBlob } from '@/components/paint/storage';
import { HISTORY_LIMIT, packEntry } from '@/components/paint/history-store';
const snapshot = () => ({ metas: [], activeId: 'layer', bg: '#fff', bgVisible: true,
  pixels: new Map([['layer', { rect: { x: 0, y: 0, w: 1, h: 1 }, data: {} as ImageData }]]) });
describe('history packing', () => {
  it('retains 10,000 steps', () => expect(HISTORY_LIMIT).toBe(10000));
  it('encodes each object once, including concurrent requests, but encodes new objects', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ putImageData() {} }) }) });
    const entry = snapshot();
    const before = vi.mocked(canvasToBlob).mock.calls.length;
    const [a,b] = await Promise.all([packEntry(entry), packEntry(entry)]);
    expect(a).toBe(b);
    await packEntry(entry);
    expect(vi.mocked(canvasToBlob).mock.calls.length - before).toBe(1);
    await packEntry(snapshot());
    expect(vi.mocked(canvasToBlob).mock.calls.length - before).toBe(2);
  });
  it('retries failed encodings', async () => {
    const entry = snapshot();
    vi.mocked(canvasToBlob).mockRejectedValueOnce(new Error('temporary'));
    await expect(packEntry(entry)).rejects.toThrow('temporary');
    await expect(packEntry(entry)).resolves.toBeDefined();
  });
});
