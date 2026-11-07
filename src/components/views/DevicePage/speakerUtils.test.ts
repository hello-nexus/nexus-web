import { describe, expect, it } from 'vitest';
import { hzLabel, parseNumber, signedDb, snapDb, testOrder, typedDb, volMax, volOf } from './speakerUtils';
import { EQ_TRACK_PX, eqPos } from './SpeakerEqSlider';

describe('speakerUtils', () => {
  it('labels bands the way G HUB does', () => {
    expect(hzLabel(48)).toBe('48');
    expect(hzLabel(1000)).toBe('1K');
    expect(hzLabel(16000)).toBe('16K');
  });

  it('signs gains', () => {
    expect(signedDb(3)).toBe('+3');
    expect(signedDb(-4.5)).toBe('-4.5');
    expect(signedDb(0)).toBe('0');
  });

  it('reads typed numbers the ways people write them', () => {
    expect(parseNumber('+3')).toBe(3);
    expect(parseNumber('-4,5')).toBe(-4.5);
    expect(parseNumber('2 dB')).toBe(2);
    expect(parseNumber('−6')).toBe(-6);
    expect(parseNumber('abc')).toBeNull();
  });

  it('keeps a typed gain within the range, to a tenth', () => {
    expect(typedDb('99', -20, 6)).toBe(6);
    expect(typedDb('-30', -20, 6)).toBe(-20);
    expect(typedDb('1.26', -20, 6)).toBe(1.3);
    expect(typedDb('x', -20, 6)).toBeNull();
  });

  it('snaps a dragged gain to half steps', () => {
    expect(snapDb(1.3, -20, 6)).toBe(1.5);
    expect(snapDb(-20.4, -20, 6)).toBe(-20);
  });

  it('shows channel gains as VOL, up to the speaker maximum', () => {
    expect(volOf(1)).toBe(10);
    expect(volOf(1.15)).toBe(12);
    expect(volOf(undefined)).toBe(10);
    expect(volMax(2)).toBe(20);
  });

  it('tests the speakers clockwise from the front left, the bass last', () => {
    expect(testOrder(['frontLeft', 'frontRight', 'center', 'subwoofer'])).toEqual([0, 2, 1, 3]);
  });

  it('puts 0 dB, the top and the bottom where the thumb sits at those gains', () => {
    expect(eqPos(6, -20, 6)).toBe(7);
    expect(eqPos(-20, -20, 6)).toBe(EQ_TRACK_PX - 7);
    expect(eqPos(0, -20, 6)).toBeCloseTo(7 + (6 / 26) * (EQ_TRACK_PX - 14));
  });
});
