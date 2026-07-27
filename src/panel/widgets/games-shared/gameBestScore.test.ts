import { describe, it, expect, beforeEach } from 'vitest';
import { getBestScore, getBestScoreAcross, recordBestScore } from './gameBestScore';

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

  it('reports the highest across several game types', () => {
    recordBestScore('snake-easy', 10);
    recordBestScore('snake-medium', 25);
    recordBestScore('snake-hard', 15);
    expect(getBestScoreAcross(['snake-easy', 'snake-medium', 'snake-hard'])).toBe(25);
  });

  it('reports 0 across untouched game types', () => {
    expect(getBestScoreAcross(['snake-easy', 'snake-medium', 'snake-hard'])).toBe(0);
  });
});
