import { describe, expect, it } from 'vitest';
import { formatMultiplier, lift, liveLedBytes, snapMultiplier, KEY_REACTION_EFFECTS } from './keyReactionsUtils';

describe('multipliers', () => {
  it('formats and snaps to the step grid', () => {
    expect(formatMultiplier(1)).toBe('1x');
    expect(formatMultiplier(1.5)).toBe('1.5x');
    expect(formatMultiplier(0.25)).toBe('0.25x');
    expect(snapMultiplier(1.4999999)).toBe(1.5);
    expect(snapMultiplier(0.26)).toBe(0.25);
  });

  it('lists ten distinct effects', () => {
    expect(new Set(KEY_REACTION_EFFECTS).size).toBe(10);
  });
});

describe('liveLedBytes', () => {
  const devices = new Map([[3, new Uint8Array(6)], [4, new Uint8Array(2)]]);

  it('returns the section matching the frame index', () => {
    expect(liveLedBytes(devices, 3, 2)).toBe(devices.get(3));
  });

  it('is null when the section is absent or shorter than the LED count', () => {
    expect(liveLedBytes(devices, 9, 2)).toBeNull();
    expect(liveLedBytes(devices, 4, 2)).toBeNull();
    expect(liveLedBytes(devices, 3, 0)).toBeNull();
  });
});

describe('lift', () => {
  it('keeps the brighter of the channel and the floor', () => {
    expect(lift(0, 40)).toBe(40);
    expect(lift(200, 40)).toBe(200);
  });
});
