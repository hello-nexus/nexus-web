import { describe, expect, it } from 'vitest';
import { panelSizesForListing, sizesForSurface } from './registry';

const ALL = ['2x2', '4x2', '2x4', '4x4', '2x2round'];

describe('panelSizesForListing', () => {
  it('limits multi-widget panels to gridSizes and adds the forced-grid 2x4 strip', () => {
    expect(panelSizesForListing(ALL, ['4x4']).grid).toEqual(['2x4', '4x4']);
  });

  it('offers every non-reserved size when gridSizes is absent or names none', () => {
    expect(panelSizesForListing(ALL).grid).toEqual(['2x2', '4x2', '2x4', '4x4']);
    expect(panelSizesForListing(ALL, ['8x8']).grid).toEqual(['2x2', '4x2', '2x4', '4x4']);
  });

  it('gives each single-widget panel kind its one size, never limited by gridSizes', () => {
    expect(panelSizesForListing(ALL, ['4x4']).single).toEqual(['2x2', '4x2', '2x4', '2x2round']);
    expect(panelSizesForListing(['2x2', '4x2'], undefined).single).toEqual(['2x2', '4x2']);
    expect(panelSizesForListing(['4x4']).single).toEqual([]);
  });

  it('drops sizes the panel engine does not know, and falls back to 2x2 for none', () => {
    expect(panelSizesForListing(['9x9', '4x4']).grid).toEqual(['4x4']);
    expect(panelSizesForListing([]).grid).toEqual(['2x2']);
  });

  it('agrees with sizesForSurface on a Y70 grid', () => {
    const meta = { sizes: ['2x2', '4x2', '4x4'] as never[], gridSizes: ['4x4'] as never[], touch: false };
    expect(panelSizesForListing(meta.sizes, meta.gridSizes).grid).toEqual(sizesForSurface(meta, 'y70'));
  });
});
