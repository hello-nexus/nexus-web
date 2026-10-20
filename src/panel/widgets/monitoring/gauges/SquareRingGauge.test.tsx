import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { designFillsRoundFrame, designKeysForSlot } from '../perfSlots';
import { designIsFill } from '../perfDomain';
import { GAUGE_DESIGNS, GAUGE_DESIGN_KEYS, GAUGE_DESIGN_LABELS } from './index';
import { DESIGN_ICONS } from './DesignIcons';
import { CORNER_RADIUS, PATH_LENGTH, RING_STROKE, progressDash } from './squareRingGeometry';
import { SquareRingGauge } from './SquareRingGauge';

const props = {
  value: 50, rawValue: 50, formatted: '50 %', label: 'CPU', history: [], maxValue: 100, historyDomain: [0, 100] as [number, number],
};

describe('squareRing registry', () => {
  it('is registered wherever Ring is', () => {
    expect(GAUGE_DESIGNS.squareRing).toBe(SquareRingGauge);
    expect(GAUGE_DESIGN_LABELS.squareRing).toBe('Square ring');
    expect(DESIGN_ICONS.squareRing).toBeDefined();
    expect(designIsFill('squareRing')).toBe(designIsFill('caterpillar'));
    for (const size of ['2x2', '2x2round', '4x4'] as const) {
      expect(designKeysForSlot(size, { count: 1, hero: false }, 0)).toContain('squareRing');
    }
    expect(GAUGE_DESIGN_KEYS).toContain('squareRing');
  });

  it('does not fill the round frame', () => {
    expect(designFillsRoundFrame('2x2round', 'caterpillar')).toBe(true);
    expect(designFillsRoundFrame('2x2round', 'squareRing')).toBe(false);
  });
});

describe('squareRing geometry', () => {
  it('keeps both the outer and inner corners rounded', () => {
    expect(CORNER_RADIUS).toBeGreaterThan(RING_STROKE / 2);
  });

  it('draws progress dashes along the normalized path', () => {
    expect(progressDash(0)).toBe(`0 ${PATH_LENGTH}`);
    expect(progressDash(50)).toBe(`50 ${PATH_LENGTH - 50}`);
    expect(progressDash(100)).toBe(`${PATH_LENGTH} 0`);
    expect(progressDash(250)).toBe(progressDash(100));
  });

  it('renders the progress stroke for the value', () => {
    for (const [value, dash] of [[0, '0 100'], [50, '50 50'], [100, '100 0']] as const) {
      const { container } = render(<SquareRingGauge {...props} value={value} />);
      const fill = container.querySelectorAll('path')[1];
      expect(fill.getAttribute('stroke-dasharray')).toBe(dash);
    }
  });
});
