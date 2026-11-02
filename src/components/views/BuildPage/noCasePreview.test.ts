import { beforeEach, describe, expect, it } from 'vitest';
import { loadNoCasePreview, saveNoCasePreview } from './noCasePreview';

describe('noCasePreview', () => {
  beforeEach(() => localStorage.clear());

  it('has nothing until one is saved', () => {
    expect(loadNoCasePreview()).toBeNull();
  });

  it('round-trips the bytes, including a large image', async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(saveNoCasePreview(bytes.buffer)).toBe(true);
    const blob = loadNoCasePreview()!;
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('reports a refusal from storage instead of throwing', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('full'); };
    try {
      expect(saveNoCasePreview(new ArrayBuffer(4))).toBe(false);
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
