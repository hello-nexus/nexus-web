import { describe, expect, it } from 'vitest';
import { mockProcessIcon } from './processIconMock';

describe('mockProcessIcon', () => {
  it('resolves a curated known process name to an SVG blob', () => {
    const blob = mockProcessIcon('chrome.exe');
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/svg+xml');
  });

  it('returns null for a name outside the curated set, matching the real 404 contract', () => {
    expect(mockProcessIcon('SomeRandomApp.exe')).toBeNull();
  });
});
