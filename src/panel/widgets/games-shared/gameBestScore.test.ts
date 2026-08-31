import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBestScore, recordBestScore } from './gameBestScore';

describe('gameBestScore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 0 when unset', () => {
    expect(getBestScore('snake-easy')).toBe(0);
  });

  it('records a new best', () => {
    expect(recordBestScore('snake-easy', 12)).toBe(12);
    expect(getBestScore('snake-easy')).toBe(12);
  });

  it('keeps the higher score on a lower attempt', () => {
    recordBestScore('block', 500);
    expect(recordBestScore('block', 100)).toBe(500);
    expect(getBestScore('block')).toBe(500);
  });

  it('keeps separate bests per game type', () => {
    recordBestScore('snake-easy', 10);
    recordBestScore('snake-hard', 40);
    expect(getBestScore('snake-easy')).toBe(10);
    expect(getBestScore('snake-hard')).toBe(40);
  });

  it('reads 0 instead of throwing when storage access is blocked', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    expect(getBestScore('snake-easy')).toBe(0);
    getItemSpy.mockRestore();
  });

  it('returns the prior best instead of throwing when a write is blocked', () => {
    recordBestScore('block', 500);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    expect(recordBestScore('block', 900)).toBe(500);
    expect(getBestScore('block')).toBe(500);
    setItemSpy.mockRestore();
  });
});
