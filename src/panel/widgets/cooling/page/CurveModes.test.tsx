import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurveCard, computeCurveSpeed } from './CurveEditor';
import { newCurve } from '../../../../types/cooling';
import type { CurveDef } from '../../../../types/cooling';
import type { FanChannel, TemperatureSource } from '../../../../api/cooling';

vi.mock('../../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/i18n')>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

// The trigger, sync and auto modes mirror the service's curve engine. These
// pin the preview math the editor shows and that each mode renders its own
// controls, since a mode whose controls never render is invisible rather than
// broken.

function stubSvgGeometry() {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 140, width: 400, height: 140,
    toJSON: () => ({}),
  } as DOMRect);
}

const SOURCE: TemperatureSource = { id: 'cpu', name: 'Core', category: 'CPU', value: 50 };

function source(value: number): TemperatureSource[] {
  return [{ ...SOURCE, value }];
}

function channel(id: string, dutyPercent: number): FanChannel {
  return { id, name: id, dutyPercent, rpm: 900, mode: 'Curve' };
}

function curveOf(type: CurveDef['type'], patch: Partial<CurveDef> = {}): CurveDef {
  return { ...newCurve('c1'), type, sourceId: 'cpu', ...patch };
}

describe('computeCurveSpeed - trigger', () => {
  const curve = curveOf('trigger', {
    trigger: { responseTime: 3, idleTemp: 40, loadTemp: 60, idleSpeed: 30, loadSpeed: 80 },
  });

  it('reads idle below the idle threshold', () => {
    expect(computeCurveSpeed(curve, source(35), [curve])).toBe(30);
  });

  it('reads load above the load threshold', () => {
    expect(computeCurveSpeed(curve, source(70), [curve])).toBe(80);
  });

  it('settles to the nearer side inside the band', () => {
    expect(computeCurveSpeed(curve, source(45), [curve])).toBe(30);
    expect(computeCurveSpeed(curve, source(55), [curve])).toBe(80);
  });

  it('reads zero without a source', () => {
    expect(computeCurveSpeed(curve, [], [curve])).toBe(0);
  });
});

describe('computeCurveSpeed - auto', () => {
  const curve = curveOf('auto', {
    auto: { responseTime: 5, idleTemp: 40, loadTemp: 80, minSpeed: 20, maxSpeed: 100, step: 5, deadband: 2 },
  });

  it('sits at the minimum at or below idle', () => {
    expect(computeCurveSpeed(curve, source(40), [curve])).toBe(20);
    expect(computeCurveSpeed(curve, source(30), [curve])).toBe(20);
  });

  it('ramps between idle and the target', () => {
    expect(computeCurveSpeed(curve, source(60), [curve])).toBe(60);
  });

  it('sits at the maximum at or above the target', () => {
    expect(computeCurveSpeed(curve, source(90), [curve])).toBe(100);
  });
});

describe('computeCurveSpeed - sync', () => {
  it('mirrors the followed fan', () => {
    const curve = curveOf('sync', { sync: { sourceChannelId: 'fan-a', offset: 0, proportional: false } });
    expect(computeCurveSpeed(curve, [], [curve], new Set(), [channel('fan-a', 45)])).toBe(45);
  });

  it('adds an offset in points', () => {
    const curve = curveOf('sync', { sync: { sourceChannelId: 'fan-a', offset: 10, proportional: false } });
    expect(computeCurveSpeed(curve, [], [curve], new Set(), [channel('fan-a', 45)])).toBe(55);
  });

  it('scales when proportional', () => {
    const curve = curveOf('sync', { sync: { sourceChannelId: 'fan-a', offset: -20, proportional: true } });
    expect(computeCurveSpeed(curve, [], [curve], new Set(), [channel('fan-a', 50)])).toBe(40);
  });

  it('clamps to the duty range', () => {
    const curve = curveOf('sync', { sync: { sourceChannelId: 'fan-a', offset: 40, proportional: false } });
    expect(computeCurveSpeed(curve, [], [curve], new Set(), [channel('fan-a', 90)])).toBe(100);
  });

  it('reads zero when the followed fan is gone', () => {
    const curve = curveOf('sync', { sync: { sourceChannelId: 'missing', offset: 0, proportional: false } });
    expect(computeCurveSpeed(curve, [], [curve], new Set(), [channel('fan-a', 45)])).toBe(0);
  });
});

describe('computeCurveSpeed - mix subtract', () => {
  it('subtracts the later members from the first', () => {
    const a = { ...curveOf('flat'), id: 'a', flat: { speed: 80 } };
    const b = { ...curveOf('flat'), id: 'b', flat: { speed: 30 } };
    const mix = curveOf('mix', { id: 'm', mix: { responseTime: 1, curveIds: ['a', 'b'], fn: 'subtract' } });
    expect(computeCurveSpeed(mix, [], [a, b, mix])).toBe(50);
  });
});

describe('curve editor controls per mode', () => {
  beforeEach(() => {
    stubSvgGeometry();
  });

  function renderCard(curve: CurveDef, channels: FanChannel[] = []) {
    return render(
      <CurveCard
        curve={curve}
        allCurves={[curve]}
        sources={[SOURCE]}
        channels={channels}
        onChange={() => {}}
        onDelete={() => {}}
      />,
    );
  }

  it('renders both trigger bands', () => {
    renderCard(curveOf('trigger'));
    expect(screen.getByText('cooling.curve.trigger.temp')).toBeInTheDocument();
    expect(screen.getByText('cooling.curve.trigger.speed')).toBeInTheDocument();
  });

  it('renders the auto step and deadband controls', () => {
    renderCard(curveOf('auto'));
    expect(screen.getByText('cooling.curve.auto.step')).toBeInTheDocument();
    expect(screen.getByText('cooling.curve.auto.deadband')).toBeInTheDocument();
  });

  it('offers the fans a sync curve can follow', () => {
    renderCard(curveOf('sync'), [channel('fan-a', 40), channel('fan-b', 60)]);
    expect(screen.getByText('cooling.curve.sync.source')).toBeInTheDocument();
    expect(screen.getByText('cooling.curve.sync.offset')).toBeInTheDocument();
  });

  it('drops the temperature source row for sync, which has none', () => {
    renderCard(curveOf('sync'), [channel('fan-a', 40)]);
    expect(screen.queryByText('cooling.curve.source')).not.toBeInTheDocument();
  });

  it('keeps the temperature source row for trigger and auto', () => {
    renderCard(curveOf('trigger'));
    expect(screen.getByText('cooling.curve.source')).toBeInTheDocument();
  });
});
