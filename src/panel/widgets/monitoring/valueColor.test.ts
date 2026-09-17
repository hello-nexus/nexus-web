import { describe, expect, it } from 'vitest';
import {
  gradeFraction,
  gradedAccentVars,
  mixHex,
  PERCENT_COOL_PCT,
  PERCENT_WARN_PCT,
  rampColorAt,
  sensorSupportsValueColor,
  temperatureStops,
  tempKindFor,
  valueColorStops,
  cssColorToHex,
  type GaugeRamp,
} from './valueColor';

const THRESHOLDS = { cpuC: 90, gpuC: 85, storageC: 70, ramC: 60 };
const RAMP: GaugeRamp = { accent: '#2563eb', warn: '#f59e0b', bad: '#ef4444', mode: 'dark' };

describe('sensorSupportsValueColor', () => {
  it('takes the percent family and temperature', () => {
    for (const type of ['Load', 'Control', 'Level', 'Temperature']) {
      expect(sensorSupportsValueColor(type)).toBe(true);
    }
  });

  it('leaves fan, clock, network and fps on the plain accent', () => {
    for (const type of ['Fan', 'Clock', 'Voltage', 'Data', 'Rate', 'Framerate', 'FrameTime', undefined]) {
      expect(sensorSupportsValueColor(type)).toBe(false);
    }
  });
});

describe('tempKindFor', () => {
  it('maps each device to its diagnostics limit', () => {
    expect(tempKindFor('cpu', 'CPU Package')).toBe('cpu');
    expect(tempKindFor('gpu', 'GPU Hot Spot')).toBe('gpu');
    expect(tempKindFor('smart', 'Temperature')).toBe('storage');
    expect(tempKindFor('memoryModule', 'Temperature')).toBe('ram');
    expect(tempKindFor('motherboard', 'VRM')).toBe('other');
  });

  it('reads the Quick summary sensor by its canonical name', () => {
    expect(tempKindFor('quick', 'CPU Temperature')).toBe('cpu');
    expect(tempKindFor('quick', 'GPU Temperature')).toBe('gpu');
    expect(tempKindFor('quick', 'Memory Usage')).toBe('ram');
  });
});

describe('temperatureStops', () => {
  it('anchors on the diagnostics limit, amber 20C below, accent at half', () => {
    expect(temperatureStops('cpu', THRESHOLDS)).toEqual([45, 70, 90]);
    expect(temperatureStops('gpu', THRESHOLDS)).toEqual([42.5, 65, 85]);
    expect(temperatureStops('storage', THRESHOLDS)).toEqual([35, 50, 70]);
    expect(temperatureStops('ram', THRESHOLDS)).toEqual([30, 40, 60]);
  });

  it('follows a user-lowered limit', () => {
    expect(temperatureStops('cpu', { ...THRESHOLDS, cpuC: 70 })).toEqual([35, 50, 70]);
  });

  it('refuses a degenerate limit rather than inverting the ramp', () => {
    expect(temperatureStops('cpu', { ...THRESHOLDS, cpuC: 0 })).toBeNull();
    expect(temperatureStops('cpu', { ...THRESHOLDS, cpuC: 2 })).toBeNull();
  });
});

describe('valueColorStops', () => {
  it('holds the accent to half load, then ramps to red at 100', () => {
    expect(valueColorStops('cpu', 'Load', 'CPU Total', 'adaptive', 0, 100, THRESHOLDS))
      .toEqual([PERCENT_COOL_PCT, PERCENT_WARN_PCT, 100]);
  });

  it('colours an adaptive temperature over its absolute limit, not the observed window', () => {
    // domain [0, 50] is what a cool CPU's adaptive history gives; the ramp ignores it.
    expect(valueColorStops('cpu', 'Temperature', 'CPU Package', 'adaptive', 0, 50, THRESHOLDS))
      .toEqual([45, 70, 90]);
  });

  it('colours a fixed range across the typed window, amber at its midpoint', () => {
    expect(valueColorStops('cpu', 'Temperature', 'CPU Package', 'fixed', 40, 80, THRESHOLDS))
      .toEqual([40, 60, 80]);
  });

  it('has no ramp for a sensor outside the percent/temperature families', () => {
    expect(valueColorStops('fan', 'Fan', 'Fan #1', 'adaptive', 0, 2500, THRESHOLDS)).toBeNull();
    expect(valueColorStops('fps', 'Framerate', 'FPS', 'fixed', 0, 240, THRESHOLDS)).toBeNull();
  });

  it('has no ramp for an inverted fixed window', () => {
    expect(valueColorStops('cpu', 'Load', 'CPU Total', 'fixed', 80, 80, THRESHOLDS)).toBeNull();
  });
});

describe('gradeFraction', () => {
  const stops = [45, 70, 90] as const;

  it('clamps outside the ramp', () => {
    expect(gradeFraction(20, stops)).toBe(0);
    expect(gradeFraction(45, stops)).toBe(0);
    expect(gradeFraction(95, stops)).toBe(1);
    expect(gradeFraction(Number.NaN, stops)).toBe(0);
  });

  it('puts the amber stop at the halfway point', () => {
    expect(gradeFraction(70, stops)).toBe(0.5);
    expect(gradeFraction(57.5, stops)).toBeCloseTo(0.25);
    expect(gradeFraction(80, stops)).toBeCloseTo(0.75);
  });
});

describe('rampColorAt', () => {
  it('lands exactly on each anchor', () => {
    expect(rampColorAt(RAMP, 0)).toBe('#2563eb');
    expect(rampColorAt(RAMP, 0.5)).toBe('#f59e0b');
    expect(rampColorAt(RAMP, 1)).toBe('#ef4444');
  });

  it('holds the accent untouched over most of the cool leg', () => {
    expect(rampColorAt(RAMP, 0.1)).toBe('#2563eb');
    expect(rampColorAt(RAMP, 0.35)).toBe('#2563eb');
    expect(rampColorAt(RAMP, 0.36)).not.toBe('#2563eb');
  });

  it('blends the warm half channel by channel', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(rampColorAt(RAMP, 0.75)).toBe('#f27128');
  });
});

describe('gradedAccentVars', () => {
  it('overrides the whole panel-accent family the gauges paint from', () => {
    const vars = gradedAccentVars(RAMP, 1);
    expect(Object.keys(vars).sort()).toEqual([
      '--panel-accent', '--panel-accent-glow', '--panel-accent-shadow',
      '--panel-accent-soft', '--panel-accent-text',
    ]);
    // #ef4444 is hue 0; hsl, never color-mix (the Q60 panel is Chromium 83).
    expect(vars['--panel-accent']).toMatch(/^hsl\(0\.0,/);
    expect(JSON.stringify(vars)).not.toContain('color-mix');
  });

  it('keeps the untouched accent at the cool end', () => {
    expect(cssColorToHex(gradedAccentVars(RAMP, 0)['--panel-accent'])).toBe('#2563eb');
  });
});

describe('cssColorToHex', () => {
  it('reads the forms the accent and status tokens resolve to', () => {
    expect(cssColorToHex('#2563EB')).toBe('#2563eb');
    expect(cssColorToHex('  #abc ')).toBe('#aabbcc');
    expect(cssColorToHex('rgb(37, 99, 235)')).toBe('#2563eb');
    expect(cssColorToHex('rgba(37, 99, 235, 0.45)')).toBe('#2563eb');
    expect(cssColorToHex('hsl(221.2, 83.2%, 53.3%)')).toBe('#2563eb');
    expect(cssColorToHex('hsla(221.2, 83.2%, 53.3%, 0.45)')).toBe('#2563eb');
  });

  it('returns null for anything it cannot parse, so the caller keeps its fallback', () => {
    expect(cssColorToHex('')).toBeNull();
    expect(cssColorToHex('var(--accent)')).toBeNull();
    expect(cssColorToHex('color-mix(in srgb, red 40%, transparent)')).toBeNull();
  });
});
