import { describe, expect, it } from 'vitest';
import type { LedMapEntry, MappingArtifact } from '../../../../api/lighting';
import {
  artifactPreviewDots,
  buildLedMapSaveBody,
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

describe('buildLedMapSaveBody', () => {
  const entry = (index: number, over: Partial<LedMapEntry> = {}): LedMapEntry => ({
    index,
    u: 0.5,
    v: 0.5,
    name: `LED ${index}`,
    zoneType: 'linear',
    isCustom: false,
    disabled: false,
    ...over,
  });
  const baseArgs = {
    rectRatio: 16 / 9,
    loadedRatio: 16 / 9,
    groups: [],
    groupsEdited: false,
  };

  it('skips mapping-disabled LEDs that the user never touched', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [entry(0, { disabled: true, isCustom: false })],
      defaults: [entry(0)],
    });
    expect(body.overrides).toEqual([]);
  });

  it('skips mapping-positioned LEDs that the user never touched', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [entry(0, { u: 0.1, v: 0.9, isCustom: false })],
      defaults: [entry(0)],
    });
    expect(body.overrides).toEqual([]);
  });

  it('round-trips a user-disabled LED so the parked state survives reload', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [entry(0, { disabled: true, isCustom: true })],
      defaults: [entry(0)],
    });
    expect(body.overrides).toEqual([{ ledIndex: 0, u: 0.5, v: 0.5, disabled: true }]);
  });

  it('saves user-moved LEDs and drops user LEDs parked back at the default spot', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [
        entry(0, { u: 0.2, v: 0.3, isCustom: true }),
        entry(1, { isCustom: true }),
      ],
      defaults: [entry(0), entry(1)],
    });
    expect(body.overrides).toEqual([{ ledIndex: 0, u: 0.2, v: 0.3 }]);
  });

  it('sends a zero aspect ratio when the ratio matches the loaded value', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [],
      defaults: [],
      rectRatio: 2,
      loadedRatio: 2,
    });
    expect(body.aspectRatio).toBe(0);
  });

  it('sends the live aspect ratio once it diverges from the loaded value', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [],
      defaults: [],
      rectRatio: 2,
      loadedRatio: 16 / 9,
    });
    expect(body.aspectRatio).toBe(2);
  });

  it('omits the groups field entirely when the user did not edit groups', () => {
    const body = buildLedMapSaveBody({
      ...baseArgs,
      leds: [],
      defaults: [],
      groups: [{ name: 'Fan 1', ranges: [{ start: 0, end: 3 }] }],
    });
    expect('groups' in body).toBe(false);
  });

  it('sends the group list, even an empty one, after a session edit', () => {
    const edited = buildLedMapSaveBody({
      ...baseArgs,
      leds: [],
      defaults: [],
      groups: [{ name: 'Fan 1', ranges: [{ start: 0, end: 3 }] }],
      groupsEdited: true,
    });
    expect(edited.groups).toEqual([{ name: 'Fan 1', ranges: [{ start: 0, end: 3 }] }]);

    const cleared = buildLedMapSaveBody({
      ...baseArgs,
      leds: [],
      defaults: [],
      groups: [],
      groupsEdited: true,
    });
    expect(cleared.groups).toEqual([]);
  });
});
