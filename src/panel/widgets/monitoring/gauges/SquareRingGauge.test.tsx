import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { designFillsRoundFrame, designKeysForSlot } from '../perfSlots';
import { designIsFill } from '../perfDomain';
import { GAUGE_DESIGNS, GAUGE_DESIGN_KEYS, GAUGE_DESIGN_LABELS } from './index';
import { DESIGN_ICONS } from './DesignIcons';
import { CORNER_RADIUS, PATH_LENGTH, RING_STROKE, progressDash, squareRingShape } from './squareRingGeometry';
import { SquareRingGauge } from './SquareRingGauge';

const props = {
  value: 50, rawValue: 50, formatted: '50 %', label: 'CPU', history: [], maxValue: 100, historyDomain: [0, 100] as [number, number],
};

describe('squareRing registry', () => {
  it('is registered wherever Ring is', () => {
    expect(GAUGE_DESIGNS.squareRing).toBe(SquareRingGauge);
    expect(GAUGE_DESIGN_LABELS.squareRing).toBe('Square Ring');
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
      const fill = container.querySelector('path[class*="fillRing"]')!;
      expect(fill.getAttribute('stroke-dasharray')).toBe(dash);
    }
  });

  it('keeps the Ring stylesheet stroke equal to the shared constant', () => {
    const scss = readFileSync(resolve(process.cwd(), 'src/panel/widgets/monitoring/gauges/CaterpillarGauge.module.scss'), 'utf8');
    expect(scss).toContain(`stroke-width: ${RING_STROKE};`);
  });

  it('reveals a graded stroke through a dash mask over the segments', () => {
    const gradient = { id: 'g', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
    const { container } = render(<SquareRingGauge {...props} value={50} gradient={gradient} />);
    const mask = container.querySelector('mask#g-square path')!;
    const [dash, gap] = mask.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    const offset = Number(mask.getAttribute('stroke-dashoffset'));
    expect(offset).toBeLessThan(0);
    expect(dash).toBeCloseTo(50 + 2 * offset, 6);
    expect(gap).toBe(PATH_LENGTH);
    expect(container.querySelectorAll('g[mask] path')).toHaveLength(40);
    expect(container.querySelector('path[class*="fillRing"]')).toBeNull();
  });

  it('keeps the square shape for a square or unmeasured slot', () => {
    const square = squareRingShape(180, 180);
    expect(squareRingShape()).toEqual(square);
    expect([square.width, square.height]).toEqual([100, 100]);
    expect(square.path.startsWith('M 50 6.5 H ')).toBe(true);
  });

  it('stretches only the straight edges of a wide slot', () => {
    const wide = squareRingShape(200, 100);
    expect([wide.width, wide.height]).toEqual([200, 100]);
    expect(wide.path.startsWith('M 100 6.5 H ')).toBe(true);
    expect(wide.path).toContain(`H ${200 - 6.5 - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1 193.5 `);
    expect(wide.path).toContain(`V ${100 - 6.5 - CORNER_RADIUS}`);
    const square = squareRingShape(100, 100);
    expect(wide.perimeter - square.perimeter).toBeCloseTo(2 * 100, 6);
  });

  it('stretches only the straight edges of a tall slot', () => {
    const tall = squareRingShape(100, 200);
    expect([tall.width, tall.height]).toEqual([100, 200]);
    expect(tall.path.startsWith('M 50 6.5 H ')).toBe(true);
    expect(tall.path).toContain(`V ${200 - 6.5 - CORNER_RADIUS}`);
    expect(tall.perimeter - squareRingShape().perimeter).toBeCloseTo(2 * 100, 6);
  });

  it('keeps the corner radius the same at every aspect', () => {
    for (const shape of [squareRingShape(), squareRingShape(200, 100), squareRingShape(100, 200)]) {
      expect(shape.path).toContain(`A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 1`);
    }
  });
});
