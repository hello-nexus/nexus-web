import { describe, expect, it } from 'vitest';
import {
  astralCardName,
  clockLeft,
  connectorState,
  fitStage,
  limitText,
  pinState,
  signedDegrees,
  tiltDirection,
  tiltWordKey,
  withCurrentTime,
} from './astralUtils';

const words = { plusSlight: 'plus-slight', plus: 'plus', minusSlight: 'minus-slight', minus: 'minus' };
const limits = { pinLowAmps: 0.01, pinWarnAmps: 9.2, pinCautionAmps: 8.5 };

describe('astralUtils', () => {
  it('signs degrees with a real minus and shows noise as 0.00', () => {
    expect(signedDegrees(0.184)).toBe('+0.18°');
    expect(signedDegrees(-0.62)).toBe('−0.62°');
    expect(signedDegrees(0.004)).toBe('0.00°');
  });

  it('points nowhere below the noise', () => {
    expect(tiltDirection(0.09)).toBe(0);
    expect(tiltDirection(0.1)).toBe(1);
    expect(tiltDirection(-0.3)).toBe(-1);
  });

  it('words a reading: unchanged, mild up to the limit, firm past it', () => {
    expect(tiltWordKey(0.05, 0.5, words, 'same')).toBe('same');
    expect(tiltWordKey(0.3, 0.5, words, 'same')).toBe('plus-slight');
    expect(tiltWordKey(0.51, 0.5, words, 'same')).toBe('plus');
    expect(tiltWordKey(-0.3, 0.5, words, 'same')).toBe('minus-slight');
    expect(tiltWordKey(-0.8, 0.5, words, 'same')).toBe('minus');
  });

  it('colours each pin on its own, as GPU Tweak III does, with a caution step', () => {
    expect(pinState(1.1, limits)).toBe('green');
    expect(pinState(8.5, limits)).toBe('yellow');
    expect(pinState(9.2, limits)).toBe('red');
    // A pin carrying nothing is red too.
    expect(pinState(0, limits)).toBe('red');
    // With the ROG Equalizer the warning rises.
    expect(pinState(12, { ...limits, pinWarnAmps: 17, pinCautionAmps: 16 })).toBe('green');
  });

  it('heads the connector with its worst pin', () => {
    expect(connectorState(['green', 'green'])).toBe('green');
    expect(connectorState(['green', 'yellow'])).toBe('yellow');
    expect(connectorState(['yellow', 'red'])).toBe('red');
  });

  it('writes limits and time left the way the page shows them', () => {
    expect(limitText(12.5)).toBe('12.5');
    expect(limitText(17)).toBe('17');
    expect(clockLeft(59_001)).toBe('1:00');
    expect(clockLeft(5_000)).toBe('0:05');
    expect(clockLeft(-1)).toBe('0:00');
  });

  it('keeps a saved time that is not among the offered ones', () => {
    expect(withCurrentTime([10, 30, 60], 30)).toEqual([10, 30, 60]);
    expect(withCurrentTime([10, 30, 60], 45)).toEqual([10, 30, 45, 60]);
  });

  it('drops the brand its icon already shows from the card name', () => {
    expect(astralCardName('ASUS ROG Astral RTX 5090')).toBe('ROG Astral RTX 5090');
    expect(astralCardName(undefined)).toBe('ROG Astral');
  });

  it('fits a drawing in its stage with the pivot at the centre of its box', () => {
    const extent = { x0: 0, x1: 200, y0: 0, y1: 100, half: 200, pivot: [100, 50] as const };
    const fit = fitStage(extent, 2);
    // The content is centred on the pivot, so the box sits in the middle of the stage.
    expect(fit.x).toBeCloseTo(0.5);
    expect(fit.y).toBeCloseTo(0.5);
    expect(fit.size).toBeGreaterThan(0);
  });
});
