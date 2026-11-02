import { describe, expect, it } from 'vitest';
import { controlSide } from './channelLayoutUtils';

describe('controlSide', () => {
  it('puts a control above near the center line and outward otherwise', () => {
    expect(controlSide(0)).toBe('top');
    expect(controlSide(-0.5)).toBe('left');
    expect(controlSide(0.5)).toBe('right');
  });
});
