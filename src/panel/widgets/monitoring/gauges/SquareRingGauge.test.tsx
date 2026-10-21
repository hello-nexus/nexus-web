import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const scss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'CaterpillarGauge.module.scss'), 'utf8');
    expect(scss).toContain(`stroke-width: ${RING_STROKE};`);
  });

  it.each([10, 50, 97, 99])('draws the graded mask as the ungraded dash at %i%%', (percent) => {
    const gradient = { id: 'd', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
    const graded = render(<SquareRingGauge {...props} value={percent} gradient={gradient} />).container;
    const plain = render(<SquareRingGauge {...props} value={percent} />).container;
    const mask = graded.querySelector('mask#d-square path')!;
    expect(mask.getAttribute('stroke-dasharray')).toBe(plain.querySelector('path[class*="fillRing"]')!.getAttribute('stroke-dasharray'));
    expect(mask.getAttribute('stroke-dashoffset')).toBeNull();
    expect(mask.getAttribute('stroke-linecap')).toBe('round');
    expect(mask.getAttribute('stroke-width')).toBe(String(RING_STROKE));
  });

  it('closes a complete graded stroke as the whole path', () => {
    const gradient = { id: 'c', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
    const { container } = render(<SquareRingGauge {...props} value={100} gradient={gradient} />);
    const mask = container.querySelector('mask#c-square path')!;
    expect(mask.getAttribute('stroke-linecap')).toBe('butt');
    expect(mask.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('colors the start cap with the first color until the caps meet, then underlays the seam', () => {
    const gradient = { id: 's', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
    const segmentColors = (c: HTMLElement) => Array.from(c.querySelectorAll('g[mask] path:not([data-seam]):not([data-start-cap])')).map(p => p.getAttribute('stroke'));
    const early = render(<SquareRingGauge {...props} value={10} gradient={gradient} />).container;
    expect(early.querySelector('path[data-seam]')).toBeNull();
    expect(early.querySelector('path[data-start-cap]')!.getAttribute('stroke')).toBe(segmentColors(early)[0]);
    for (const value of [98, 99, 100]) {
      const late = render(<SquareRingGauge {...props} value={value} gradient={gradient} />).container;
      const colors = segmentColors(late);
      expect(late.querySelector('path[data-start-cap]')).toBeNull();
      expect(late.querySelector('path[data-seam]')!.getAttribute('stroke')).toBe(colors[colors.length - 1]);
    }
  });

  it('reveals a graded stroke through a dash mask over the segments', () => {
    const gradient = { id: 'g', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
    const { container } = render(<SquareRingGauge {...props} value={50} gradient={gradient} />);
    const mask = container.querySelector('mask#g-square path')!;
    const [dash, gap] = mask.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    const offset = Number(mask.getAttribute('stroke-dashoffset'));
    expect(mask.getAttribute('stroke-width')).toBe(String(RING_STROKE));
    expect(offset).toBe(0);
    expect(dash).toBe(50);
    expect(gap).toBe(50);
    const segments = container.querySelectorAll('g[mask] path:not([data-start-cap])');
    expect(segments).toHaveLength(40);
    segments.forEach(seg => expect(Number(seg.getAttribute('stroke-width'))).toBeGreaterThan(RING_STROKE));
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

  describe('measured slot', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('stretches the viewBox and the mask cap to the measured box', () => {
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
      const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
      const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
      const gradient = { id: 'm', stops: [{ at: 0, color: '#33cc88' }, { at: 1, color: '#ee4444' }] };
      const { container } = render(<SquareRingGauge {...props} value={98} gradient={gradient} />);
      width.mockRestore();
      height.mockRestore();
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 200 100');
      // Closing starts one stroke short of the end: later on the longer
      // perimeter, so 98% still has its start cap patch there but not on a square.
      expect(container.querySelector('path[data-start-cap]')).not.toBeNull();
      const square = render(<SquareRingGauge {...props} value={98} gradient={{ ...gradient, id: 'q' }} />).container;
      expect(square.querySelector('path[data-start-cap]')).toBeNull();
    });
  });
});
