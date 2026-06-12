import { describe, expect, it } from 'vitest';
import type { MappingArtifact } from '../../../../api/lighting';
import {
  artifactPreviewDots,
  collapseToRanges,
  expandRanges,
  looksLikeMappingArtifact,
  previewDotRadius,
  sanitizeFileName,
} from './mappingUtils';

describe('collapseToRanges', () => {
  it('returns empty for no indices', () => {
    expect(collapseToRanges([])).toEqual([]);
  });

  it('wraps a single index into a one-element range', () => {
    expect(collapseToRanges([3])).toEqual([{ start: 3, end: 3 }]);
  });

  it('collapses contiguous runs and keeps gaps separate', () => {
    expect(collapseToRanges([0, 1, 2, 5, 7, 8])).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 5 },
      { start: 7, end: 8 },
    ]);
  });

  it('sorts and de-duplicates unordered input', () => {
    expect(collapseToRanges([8, 2, 1, 2, 0, 7, 8])).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 8 },
    ]);
  });

  it('accepts a Set (the editor selection shape)', () => {
    expect(collapseToRanges(new Set([10, 11, 12]))).toEqual([{ start: 10, end: 12 }]);
  });
});

describe('expandRanges', () => {
  it('round-trips through collapseToRanges', () => {
    const indices = [0, 1, 2, 5, 7, 8, 9, 42];
    expect(expandRanges(collapseToRanges(indices))).toEqual(indices);
  });

  it('skips inverted ranges and de-duplicates overlapping ones', () => {
    expect(expandRanges([
      { start: 5, end: 3 },
      { start: 0, end: 2 },
      { start: 1, end: 3 },
    ])).toEqual([0, 1, 2, 3]);
  });
});

const artifact: MappingArtifact = {
  schemaVersion: 1,
  name: 'Test layout',
  device: { key: 'usb:1b1c:0c1a' },
  zones: [
    {
      zoneIndex: 0,
      leds: [
        { i: 0, u: 0.5, v: 0.1 },
        { i: 1, u: 1.5, v: -0.2 },
        { i: 2, u: 0.25, v: 0.75 },
      ],
      disabled: [2],
      groups: [],
    },
  ],
};

describe('artifactPreviewDots', () => {
  it('maps zone 0 LEDs to clamped dots and flags disabled indices', () => {
    expect(artifactPreviewDots(artifact)).toEqual([
      { i: 0, u: 0.5, v: 0.1, disabled: false },
      { i: 1, u: 1, v: 0, disabled: false },
      { i: 2, u: 0.25, v: 0.75, disabled: true },
    ]);
  });

  it('returns empty for null / zone-less artifacts', () => {
    expect(artifactPreviewDots(null)).toEqual([]);
    expect(artifactPreviewDots({ ...artifact, zones: [] })).toEqual([]);
  });

  it('treats missing disabled list as none disabled', () => {
    const noDisabled: MappingArtifact = {
      ...artifact,
      zones: [{ zoneIndex: 0, leds: [{ i: 0, u: 0.5, v: 0.5 }] }],
    };
    expect(artifactPreviewDots(noDisabled)).toEqual([
      { i: 0, u: 0.5, v: 0.5, disabled: false },
    ]);
  });

  it('zeroes non-numeric coordinates instead of dropping the dot', () => {
    const broken = {
      ...artifact,
      zones: [{ zoneIndex: 0, leds: [{ i: 0, u: 'x', v: 0.5 }] }],
    } as unknown as MappingArtifact;
    expect(artifactPreviewDots(broken)).toEqual([
      { i: 0, u: 0, v: 0.5, disabled: false },
    ]);
  });
});

describe('previewDotRadius', () => {
  it('shrinks as the LED count grows', () => {
    const small = previewDotRadius(10);
    const medium = previewDotRadius(100);
    const large = previewDotRadius(300);
    expect(small).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(large);
  });
});

describe('looksLikeMappingArtifact', () => {
  it('accepts a well-formed artifact', () => {
    expect(looksLikeMappingArtifact(artifact)).toBe(true);
  });

  it('rejects primitives, null, and shape mismatches', () => {
    expect(looksLikeMappingArtifact(null)).toBe(false);
    expect(looksLikeMappingArtifact('nope')).toBe(false);
    expect(looksLikeMappingArtifact({ schemaVersion: '1', name: 'x', zones: [] })).toBe(false);
    expect(looksLikeMappingArtifact({ schemaVersion: 1, name: 'x' })).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('replaces filesystem-hostile characters', () => {
    expect(sanitizeFileName('Corsair LL120 / ring?')).toBe('Corsair LL120 - ring-');
  });

  it('falls back to a stub for empty names', () => {
    expect(sanitizeFileName('   ')).toBe('layout');
  });
});
