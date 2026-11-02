import { describe, expect, it } from 'vitest';
import { scaledSize } from './DrawingImage';

describe('scaledSize', () => {
  it('keeps a square square', () => expect(scaledSize(1024, 1024, 200)).toEqual({ width: 200, height: 200 }));
  it('keeps a wide picture wide', () => expect(scaledSize(1600, 800, 400)).toEqual({ width: 400, height: 200 }));
  it('keeps a tall picture tall and never reaches zero', () => {
    expect(scaledSize(500, 1000, 100)).toEqual({ width: 100, height: 200 });
    expect(scaledSize(4000, 1, 10)).toEqual({ width: 10, height: 1 });
  });
});
