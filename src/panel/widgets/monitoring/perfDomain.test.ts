import { describe, expect, it } from 'vitest';
import { chartDomainForScale, designSupportsScale, relativeHistoryDomain } from './perfDomain';

describe('designSupportsScale', () => {
  it('supports only sparkline and line', () => {
    expect(designSupportsScale('sparkline')).toBe(true);
    expect(designSupportsScale('line')).toBe(true);
    expect(designSupportsScale('bar')).toBe(false);
  });
});

describe('chartDomainForScale', () => {
  it('returns [0, staticMax] verbatim on fixed scale, regardless of device/type', () => {
    expect(chartDomainForScale('cpu', 42, [], 100, 'fixed')).toEqual([0, 100]);
    expect(chartDomainForScale('motherboard', 1.2, [], 2, 'fixed', undefined, 'Voltage')).toEqual([0, 2]);
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
