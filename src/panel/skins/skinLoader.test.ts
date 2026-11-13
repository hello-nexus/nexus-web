import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./pixel.scss');
});

describe('loadSkinStyles', () => {
  it('rejects a failed chunk load and retries it on the next call', async () => {
    let attempts = 0;
    vi.doMock('./pixel.scss', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk load failed');
      return {};
    });
    const { loadSkinStyles } = await import('./skinLoader');
    await expect(loadSkinStyles('pixel')).rejects.toThrow();
    await expect(loadSkinStyles('pixel')).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    // A settled load is not repeated.
    await loadSkinStyles('pixel');
    expect(attempts).toBe(2);
  });
});
