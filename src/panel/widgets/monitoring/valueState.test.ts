import { describe, it, expect } from 'vitest';
import { gaugeValueStateAttrs } from './valueColor';
import { DEFAULT_GAUGE_GRADIENT } from '../../theme/gaugeGradient';

describe('gaugeValueStateAttrs', () => {
  it('marks the top two stops as warn and critical and nothing below', () => {
    expect(gaugeValueStateAttrs(DEFAULT_GAUGE_GRADIENT, 0.2)).toEqual({});
    expect(gaugeValueStateAttrs(DEFAULT_GAUGE_GRADIENT, 0.6)).toEqual({ 'data-value-state': 'warn' });
    expect(gaugeValueStateAttrs(DEFAULT_GAUGE_GRADIENT, 0.9)).toEqual({ 'data-value-state': 'critical' });
  });

  it('handles a single stop and an empty list', () => {
    expect(gaugeValueStateAttrs([{ at: 0.5, color: '#ff0000' }], 0.6)).toEqual({ 'data-value-state': 'critical' });
    expect(gaugeValueStateAttrs([], 1)).toEqual({});
  });
});
