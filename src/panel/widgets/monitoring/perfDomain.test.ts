import { describe, expect, it } from 'vitest';
import { chartDomainForScale, defaultFixedMax, designSupportsScale, niceStep, relativeHistoryDomain, staticMaxForDevice } from './perfDomain';

describe('designSupportsScale', () => {
  it('supports only sparkline and line', () => {
    expect(designSupportsScale('sparkline')).toBe(true);
    expect(designSupportsScale('line')).toBe(true);
    expect(designSupportsScale('bar')).toBe(false);
  });
});

describe('chartDomainForScale', () => {
  it('returns [0, staticMax] verbatim on fixed scale with no overrides, regardless of device/type', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed')).toEqual([0, 100]);
    expect(chartDomainForScale('motherboard', 1.2, [], 2, 'fixed', undefined, 'Voltage')).toEqual([0, 2]);
  });

  it('fixed honors an explicit fixedMin/fixedMax user override', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, 10, 80)).toEqual([10, 80]);
  });

  it('fixed falls back to fixedDefaultMax (not staticMax) when overrides are absent', () => {
    expect(chartDomainForScale('gpu', 8000, [], 16000, 'fixed', undefined, undefined, undefined, undefined, 32000)).toEqual([0, 32000]);
  });

  it('fixed falls back to staticMax when fixedDefaultMax is absent or non-positive', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, undefined, undefined, 0)).toEqual([0, 100]);
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, undefined, undefined, -5)).toEqual([0, 100]);
  });

  it('an inverted or degenerate min/max override falls back to [0, fixedDefaultMax]', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, 80, 10)).toEqual([0, 100]);
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, 50, 50)).toEqual([0, 100]);
  });

  it('a non-positive fixedMax override is ignored in favor of fixedDefaultMax', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed', undefined, undefined, 10, 0)).toEqual([10, 100]);
  });

  it('clamps a stale min/max override into [0, dmax] when it outlives a device/sensor swap to a smaller ceiling', () => {
    // Fixed [2000, 15000] set on a GPU Memory sensor (dmax 16000); the slot
    // swaps to a 0-100 CPU Load sensor (dmax 100) without clearing the override.
    expect(chartDomainForScale('cpu', 30, [], 100, 'fixed', undefined, undefined, 2000, 15000, 100)).toEqual([0, 100]);
  });

  it('leaves an override untouched when both bounds already fit inside dmax', () => {
    expect(chartDomainForScale('cpu', 30, [], 100, 'fixed', undefined, undefined, 20, 80, 100)).toEqual([20, 80]);
  });

  it('clamps only the bound that exceeds dmax, keeping the other as-is', () => {
    expect(chartDomainForScale('cpu', 30, [], 100, 'fixed', undefined, undefined, 20, 15000, 100)).toEqual([20, 100]);
  });

  it('clamps a negative min up to 0', () => {
    expect(chartDomainForScale('cpu', 30, [], 100, 'fixed', undefined, undefined, -50, 80, 100)).toEqual([0, 80]);
  });
});

describe('staticMaxForDevice - network', () => {
  it('returns a 1 Gbps ceiling in the sensor\'s own bytes/sec unit, not the percent-scale fallback', () => {
    expect(staticMaxForDevice('network', undefined, 'Rate')).toBe(125_000_000);
  });
});

describe('niceStep', () => {
  it('picks the nearest 1/2/5-times-power-of-ten step, roughly 100 steps across the axis', () => {
    expect(niceStep(2)).toBe(0.02);
    expect(niceStep(6000)).toBe(50);
    expect(niceStep(16000)).toBe(200);
  });

  it('keeps step 1 for the common 0-100 percent ceiling', () => {
    expect(niceStep(100)).toBe(1);
  });

  it('falls back to 1 for a non-positive or non-finite ceiling', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
});

describe('defaultFixedMax', () => {
  it('prefers the sensor theoreticalMaximum when present and positive', () => {
    const sensor = { id: 'x', name: 'GPU Memory Used', type: 'SmallData', value: 8000, units: 'MB', formatted: '8000 MB', theoreticalMaximum: 16000, parent: { id: 'gpu', name: 'GPU' } };
    expect(defaultFixedMax('gpu', sensor)).toBe(16000);
  });

  it('falls back to staticMaxForDevice when the sensor has no theoreticalMaximum', () => {
    const sensor = { id: 'x', name: 'Fan 1', type: 'Fan', value: 1200, units: 'RPM', formatted: '1200 RPM', parent: { id: 'mobo', name: 'Motherboard' } };
    expect(defaultFixedMax('motherboard', sensor)).toBe(2500);
  });

  it('falls back to staticMaxForDevice using nameFallback when the sensor is undefined', () => {
    expect(defaultFixedMax('fps', undefined, 'Frame Time')).toBe(50);
    expect(defaultFixedMax('fps', undefined, 'FPS')).toBe(240);
  });

  it('network sensors carry no theoreticalMaximum, so it falls back to the 1 Gbps ceiling', () => {
    const sensor = { id: 'network-total', name: 'Network Total', type: 'Rate', value: 5_000_000, units: 'B/s', formatted: '5 MB/s', parent: { id: 'network', name: 'Network' } };
    expect(defaultFixedMax('network', sensor)).toBe(125_000_000);
  });
});

describe('relativeHistoryDomain - existing devices unchanged', () => {
  it('cpu/gpu/memory/storage stretch to the observed max on a 25-wide percent grid, floored at 25, capped at 100', () => {
    expect(relativeHistoryDomain('cpu', 10, [], 100)).toEqual([0, 25]);
    expect(relativeHistoryDomain('cpu', 60, [], 100)).toEqual([0, 75]);
    expect(relativeHistoryDomain('cpu', 100, [], 100)).toEqual([0, 100]);
  });

  it('fan stretches on a 500-wide grid floored at 1200', () => {
    expect(relativeHistoryDomain('fan', 800, [], 2500)).toEqual([0, 1200]);
    expect(relativeHistoryDomain('fan', 1900, [], 2500)).toEqual([0, 2000]);
  });

  it('fps floors at 60/30-step; Frame Time floors at 20/10-step', () => {
    expect(relativeHistoryDomain('fps', 45, [], 240, 'FPS')).toEqual([0, 60]);
    expect(relativeHistoryDomain('fps', 100, [], 240, 'FPS')).toEqual([0, 120]);
    expect(relativeHistoryDomain('fps', 5, [], 50, 'Frame Time')).toEqual([0, 20]);
    expect(relativeHistoryDomain('fps', 25, [], 50, 'Frame Time')).toEqual([0, 30]);
  });

  it('network adopts the passed-in staticMax as-is', () => {
    expect(relativeHistoryDomain('network', 12345, [], 16384)).toEqual([0, 16384]);
  });
});

describe('relativeHistoryDomain - motherboard is type-aware', () => {
  it('Fan-typed motherboard sensors use the same domain as the fan device', () => {
    expect(relativeHistoryDomain('motherboard', 800, [], 2500, undefined, 'Fan')).toEqual([0, 1200]);
    expect(relativeHistoryDomain('motherboard', 1900, [], 2500, undefined, 'Fan')).toEqual([0, 2000]);
  });

  it('Temperature-typed motherboard sensors floor at 50 (not 25) and cap at 100', () => {
    expect(relativeHistoryDomain('motherboard', 10, [], 100, undefined, 'Temperature')).toEqual([0, 50]);
    expect(relativeHistoryDomain('motherboard', 60, [], 100, undefined, 'Temperature')).toEqual([0, 75]);
    expect(relativeHistoryDomain('motherboard', 130, [], 100, undefined, 'Temperature')).toEqual([0, 100]);
  });

  it('Load/Control/Level-typed motherboard sensors use the standard percent domain', () => {
    expect(relativeHistoryDomain('motherboard', 10, [], 100, undefined, 'Load')).toEqual([0, 25]);
    expect(relativeHistoryDomain('motherboard', 60, [], 100, undefined, 'Control')).toEqual([0, 75]);
    expect(relativeHistoryDomain('motherboard', 40, [], 100, undefined, 'Level')).toEqual([0, 50]);
  });

  it('Voltage/Clock/other motherboard sensors stretch to the observed max with no percent ceiling', () => {
    expect(relativeHistoryDomain('motherboard', 1.25, [], 2, undefined, 'Voltage')).toEqual([0, 2]);
    expect(relativeHistoryDomain('motherboard', 4700, [], 6000, undefined, 'Clock')).toEqual([0, 4700]);
  });
});

describe('relativeHistoryDomain - non-percent cpu/gpu/memory sensors are type-aware', () => {
  it('SmallData GPU Memory Used (MB) stretches to the observed max instead of clamping to 100', () => {
    expect(relativeHistoryDomain('gpu', 8000, [], 16000, 'GPU Memory Used', 'SmallData')).toEqual([0, 8000]);
    expect(relativeHistoryDomain('gpu', 1400, [1000, 1400], 16000, 'GPU Memory Used', 'SmallData')).toEqual([0, 1400]);
  });

  it('Data memory sensors (GB) stretch past 100 too', () => {
    expect(relativeHistoryDomain('memory', 12.5, [], 32, 'Memory Used', 'Data')).toEqual([0, 13]);
  });

  it('Load- and Temperature-typed cpu/gpu sensors still clamp to the 100 percent ceiling', () => {
    expect(relativeHistoryDomain('gpu', 90, [], 100, 'GPU Core', 'Load')).toEqual([0, 100]);
    expect(relativeHistoryDomain('gpu', 45, [], 100, 'GPU Core', 'Temperature')).toEqual([0, 50]);
  });
});
