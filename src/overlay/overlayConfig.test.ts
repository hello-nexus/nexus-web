import { describe, expect, it } from 'vitest';
import type { OverlayWidgetDto } from '../api/overlay';
import { mergeWidgetConfig } from './overlayConfig';

const base: OverlayWidgetDto[] = [
  { id: 'a', type: 'weather', size: '2x2', monitor: 0, col: 0, row: 0, config: { unit: 'F', animatedSky: false } },
  { id: 'b', type: 'clock', size: '2x2', monitor: 0, col: 2, row: 0 },
];

describe('mergeWidgetConfig', () => {
  it('keeps untouched keys and returns the full config to persist', () => {
    const { layout, merged } = mergeWidgetConfig(base, 'a', { animatedSky: true });
    expect(merged).toEqual({ unit: 'F', animatedSky: true });
    expect(layout[0].config).toEqual(merged);
    expect(layout[1]).toBe(base[1]);
  });

  it('returns the merge synchronously for a widget with no config', () => {
    expect(mergeWidgetConfig(base, 'b', { x: 1 }).merged).toEqual({ x: 1 });
  });

  it('returns null for an unknown id', () => {
    expect(mergeWidgetConfig(base, 'zz', { x: 1 }).merged).toBeNull();
  });
});
