import { describe, expect, it } from 'vitest';
import { canonicalPanelRecord, type PanelDeviceRecord } from './panel';
import { canonicalPanelSurface, surfaceSupportsMountOrientation } from '../panel/types';

const layout = { layoutSchemaVersion: 2, surface: 'kraken', pages: [{ id: 'p', widgets: [{ id: 'w', type: 'clock', size: '2x2round', col: 0, row: 0 }] }] };

function legacyRecord(over: Record<string, unknown> = {}): PanelDeviceRecord {
  return {
    id: 'rec1',
    displayName: 'NZXT Kraken LCD',
    firstSeenAt: 0,
    lastSeenAt: 1,
    accentColor: '#abc',
    layout,
    capabilities: { surface: 'kraken', touch: false, cssWidth: 640, cssHeight: 640, dpr: 1, ...over },
  } as unknown as PanelDeviceRecord;
}

describe('canonicalPanelRecord', () => {
  it('reads a record stored under the retired kraken surface as lcd-round with its family and density', () => {
    const record = canonicalPanelRecord(legacyRecord());

    expect(record.capabilities).toMatchObject({ surface: 'lcd-round', family: 'nzxt-kraken', dpi: 240, cssWidth: 640, cssHeight: 640, dpr: 1 });
  });

  it('keeps the layout, personalization and identity untouched', () => {
    const before = legacyRecord();
    const record = canonicalPanelRecord(before);

    expect(record.id).toBe('rec1');
    expect(record.accentColor).toBe('#abc');
    expect(record.layout).toBe(before.layout);
    expect(before.capabilities?.surface).toBe('kraken');
  });

  it('never overrides a family or density the record already carries', () => {
    const record = canonicalPanelRecord(legacyRecord({ family: 'nzxt-kraken', dpi: 300 }));

    expect(record.capabilities).toMatchObject({ family: 'nzxt-kraken', dpi: 300 });
  });

  it('returns every other record as the same object', () => {
    const lcd = { id: 'a', capabilities: { surface: 'lcd-round', family: 'corsair-link-lcd' } } as unknown as PanelDeviceRecord;
    const bare = { id: 'b' } as unknown as PanelDeviceRecord;

    expect(canonicalPanelRecord(lcd)).toBe(lcd);
    expect(canonicalPanelRecord(bare)).toBe(bare);
    expect(canonicalPanelRecord(null)).toBeNull();
  });
});

describe('canonicalPanelSurface', () => {
  it('maps only the retired kraken value', () => {
    expect(canonicalPanelSurface('kraken')).toBe('lcd-round');
    expect(canonicalPanelSurface('lcd-round')).toBe('lcd-round');
    expect(canonicalPanelSurface('y70')).toBe('y70');
    expect(canonicalPanelSurface(undefined)).toBeUndefined();
  });
});

describe('surfaceSupportsMountOrientation', () => {
  it('excludes the Kraken, whose transport has no orientation filter', () => {
    expect(surfaceSupportsMountOrientation('lcd-round', 'nzxt-kraken')).toBe(false);
    expect(surfaceSupportsMountOrientation('lcd-round', 'lianli-galahad2-lcd')).toBe(true);
    expect(surfaceSupportsMountOrientation('lcd-round')).toBe(true);
    expect(surfaceSupportsMountOrientation('y70')).toBe(false);
  });
});
