import { describe, expect, it } from 'vitest';
import { formatResolution } from './resolutionLabel';

describe('formatResolution', () => {
  it('names 16:9 sizes by their height', () => {
    expect(formatResolution('1920x1080')).toBe('1080p');
    expect(formatResolution('2560x1440')).toBe('1440p');
    expect(formatResolution('3840 × 2160')).toBe('2160p');
  });

  it('keeps both sides for other aspect ratios', () => {
    expect(formatResolution('3440x1440')).toBe('3440×1440');
    expect(formatResolution('2560x1080')).toBe('2560×1080');
  });

  it('passes through anything that is not a size', () => {
    expect(formatResolution('native')).toBe('native');
  });
});
