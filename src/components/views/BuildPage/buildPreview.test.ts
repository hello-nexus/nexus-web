import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/systemPreview', () => ({
  putSystemPreview: vi.fn(),
  notifySystemPreviewChanged: vi.fn(),
}));

import { notifySystemPreviewChanged, putSystemPreview } from '../../../api/systemPreview';
import { relayPreviewSave } from './buildPreview';

describe('relayPreviewSave', () => {
  beforeEach(() => vi.resetAllMocks());

  it('stores the png for the case and signals the widget', async () => {
    vi.mocked(putSystemPreview).mockResolvedValue(true);
    const png = new Uint8Array([1, 2, 3]).buffer;
    expect(await relayPreviewSave('hyte-y70', png)).toBe(true);
    expect(putSystemPreview).toHaveBeenCalledWith('hyte-y70', png);
    expect(notifySystemPreviewChanged).toHaveBeenCalledTimes(1);
  });

  it('does not signal when the service refused it', async () => {
    vi.mocked(putSystemPreview).mockResolvedValue(false);
    expect(await relayPreviewSave('hyte-y70', new ArrayBuffer(8))).toBe(false);
    expect(notifySystemPreviewChanged).not.toHaveBeenCalled();
  });

  it('rejects a non-buffer, empty, or over-2MB png without calling the service', async () => {
    expect(await relayPreviewSave('c', 'nope')).toBe(false);
    expect(await relayPreviewSave('c', new ArrayBuffer(0))).toBe(false);
    expect(await relayPreviewSave('c', new ArrayBuffer(2 * 1024 * 1024 + 1))).toBe(false);
    expect(putSystemPreview).not.toHaveBeenCalled();
  });

  it('accepts a png of exactly 2 MB', async () => {
    vi.mocked(putSystemPreview).mockResolvedValue(true);
    expect(await relayPreviewSave('c', new ArrayBuffer(2 * 1024 * 1024))).toBe(true);
  });
});
