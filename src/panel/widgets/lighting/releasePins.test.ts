import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPins, setPins } from '../../../api/lighting';
import { releaseAllPins } from './releasePins';

vi.mock('../../../api/lighting', () => ({
  fetchPins: vi.fn(),
  setPins: vi.fn(() => Promise.resolve(true)),
}));

describe('releaseAllPins', () => {
  beforeEach(() => {
    vi.mocked(setPins).mockClear();
    vi.mocked(setPins).mockImplementation(() => Promise.resolve(true));
  });

  it('unpins every pinned id in one write', async () => {
    vi.mocked(fetchPins).mockResolvedValue({ a: { kind: 'mirror' }, b: { kind: 'mirror' } });
    await releaseAllPins();
    expect(setPins).toHaveBeenCalledTimes(1);
    expect(setPins).toHaveBeenCalledWith(['a', 'b'], null);
  });

  it('writes nothing when no pin exists or the read failed', async () => {
    vi.mocked(fetchPins).mockResolvedValue({});
    await releaseAllPins();
    vi.mocked(fetchPins).mockResolvedValue(null);
    await releaseAllPins();
    expect(setPins).not.toHaveBeenCalled();
  });

  it('resolves when the write throws', async () => {
    vi.mocked(fetchPins).mockResolvedValue({ a: { kind: 'mirror' } });
    vi.mocked(setPins).mockImplementation(() => Promise.reject(new Error('x')));
    await expect(releaseAllPins()).resolves.toBeUndefined();
  });
});
