import { describe, expect, it } from 'vitest';
import baseline from './__fixtures__/widgetSizeBaseline.json';
import { panelWidgetSizeOptions, type PanelSurface, type PanelWidgetSizeMode } from '../types';
import { PROBE_CASES, PROBE_LEGACY_CASES, PROBE_STORED, probeLayout } from './widgetSizeProbe';

// The fixture was recorded from the layout code before the Widget scale work (origin/main at d901228dd) by
// running widgetSizeProbe against it. An upgrade must never change what an existing panel draws, so every
// stored value a record could hold, and no stored value at all, still has to resolve to the recorded layout.
const recorded = baseline.sizes as Record<string, unknown>;
const recordedLegacy = baseline.legacy as Record<string, unknown>;

describe('stored Widget size renders as it did before the Widget scale work', () => {
  it('records every probe case', () => {
    expect(Object.keys(recorded)).toHaveLength(PROBE_CASES.length * PROBE_STORED.length);
    expect(Object.keys(recordedLegacy)).toHaveLength(PROBE_LEGACY_CASES.length);
  });

  it.each(PROBE_CASES.map(c => [c.id, c] as const))('%s', (_id, c) => {
    const now: Record<string, unknown> = {};
    const was: Record<string, unknown> = {};
    for (const stored of PROBE_STORED) {
      const key = `${c.id}|${stored ?? 'none'}`;
      now[key] = probeLayout(c, stored);
      was[key] = recorded[key];
    }
    expect(now).toEqual(was);
  });
});

describe('a record with only a retired gridSlots resolves to the layout it had', () => {
  it.each(PROBE_LEGACY_CASES.map(c => [c.id, c] as const))('%s', (id, c) => {
    expect(probeLayout(c, undefined)).toEqual(recordedLegacy[id]);
  });
});

// The sizes each panel's picker could write before the Widget scale work, by surface and family.
const WRITTEN_BEFORE: ReadonlyArray<readonly [PanelSurface, string | undefined, readonly PanelWidgetSizeMode[]]> = [
  ['q60', undefined, ['large', 'small']],
  ['monitor', 'icue-link-lcd5', ['large', 'small']],
  ['lcd-wide', 'lianli-hydroshift2-curve', ['large', 'small']],
  ['lcd-square', 'asus-glacial-lcd', ['large', 'small']],
  ['monitor', 'lianli-screen88', ['large', 'small']],
  ['monitor', 'hyte-y60', ['large', 'small']],
  ['monitor', undefined, ['large', 'small', 'xsmall']],
];

describe('the slider keeps a stop for every size a panel could store', () => {
  it.each(WRITTEN_BEFORE.map(([surface, family, written]) => [`${surface}/${family ?? '-'}`, surface, family, written] as const))('%s', (_id, surface, family, written) => {
    const options = panelWidgetSizeOptions(surface, family)!;
    // The default (nothing stored) is the 100% stop.
    expect(options.percentLabels?.[options.default]).toBe(100);
    const labels = written.map(mode => options.percentLabels?.[mode]);
    expect(labels.every(label => label !== undefined)).toBe(true);
    // No two older sizes share a label.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('labels each older size by how its column count compares with the default', () => {
    const label = (surface: PanelSurface, family: string | undefined, mode: PanelWidgetSizeMode) => panelWidgetSizeOptions(surface, family)!.percentLabels?.[mode];
    // A forced two columns against a default of four is 200%.
    expect(label('monitor', 'lianli-screen88', 'large')).toBe(200);
    expect(label('monitor', 'hyte-y60', 'large')).toBe(200);
    expect(label('monitor', 'icue-link-lcd5', 'large')).toBe(200);
    expect(label('monitor', undefined, 'large')).toBe(200);
    expect(label('monitor', undefined, 'xsmall')).toBe(50);
    // A device whose default is its one tile keeps the tile at 100% and the grid at 50%.
    expect([label('q60', undefined, 'large'), label('q60', undefined, 'small')]).toEqual([100, 50]);
  });
});
