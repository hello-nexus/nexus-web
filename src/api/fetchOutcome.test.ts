import { describe, expect, it } from 'vitest';
import { classifyFetchOutcome } from './fetchOutcome';

describe('classifyFetchOutcome', () => {
  it('is ok whenever data resolved, regardless of status', () => {
    expect(classifyFetchOutcome({}, 200, true)).toBe('ok');
    expect(classifyFetchOutcome({}, 200, false)).toBe('ok');
  });

  it('falls back to the mock on a 404 when a mock is available (dev build)', () => {
    expect(classifyFetchOutcome(null, 404, true)).toBe('mockFallback');
  });

  it('reports unsupported on a 404 with no mock available (production build) - not an error', () => {
    expect(classifyFetchOutcome(null, 404, false)).toBe('unsupported');
  });

  it('is a real error on any other failing status, mock or not', () => {
    expect(classifyFetchOutcome(null, 500, true)).toBe('error');
    expect(classifyFetchOutcome(null, 500, false)).toBe('error');
    expect(classifyFetchOutcome(null, 0, false)).toBe('error');
  });
});
