import { describe, expect, it } from 'vitest';
import type { FanChannel } from '../../../api/cooling';
import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';
import { coolingFanStatus, excludedFanLinks } from './coolingFanState';

const channel = (over: Partial<FanChannel>): FanChannel => ({ id: 'hw/fan/1', name: 'Fan', dutyPercent: 50, rpm: 900, mode: 'Auto', seriesId: 'hw_fan_1', ...over });
const fanRule = (seriesId: string): SensorAlertRule => ({
  id: `builtin:fan:${seriesId}`, enabled: true, builtIn: 'fanSpeed',
  sensor: { category: 'builtin', id: `fan:${seriesId}`, name: 'Fan', type: 'Fan', parentName: '' },
  low: null, high: null, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, notifyMobile: false, showInHealth: true, repeatMinutes: 0,
});

describe('coolingFanStatus', () => {
  it('is null for a controlled fan that reports speed', () => {
    expect(coolingFanStatus(channel({}))).toBeNull();
    expect(coolingFanStatus(channel({ controlled: true }))).toBeNull();
  });
  it('flags control off', () => {
    expect(coolingFanStatus(channel({ controlled: false }))).toBe('notControlled');
  });
  it('flags a calibrated-unresponsive fan with no RPM, but not one that reports RPM now', () => {
    expect(coolingFanStatus(channel({ classification: 'Unresponsive', rpm: 0 }))).toBe('notResponding');
    expect(coolingFanStatus(channel({ classification: 'Unresponsive', rpm: 400 }))).toBeNull();
  });
  it('lets control off win over unresponsive', () => {
    expect(coolingFanStatus(channel({ controlled: false, classification: 'Unresponsive', rpm: 0 }))).toBe('notControlled');
  });
});

describe('excludedFanLinks', () => {
  it('joins fan entries to channels by series id and keeps only the excluded ones', () => {
    const channels = [
      channel({ id: 'a', seriesId: 's_a', controlled: false }),
      channel({ id: 'b', seriesId: 's_b' }),
      channel({ id: 'c', seriesId: 's_c', classification: 'Unresponsive', rpm: 0 }),
    ];
    const links = excludedFanLinks([fanRule('s_a'), fanRule('s_b'), fanRule('s_c'), fanRule('s_none')], channels);
    expect([...links.entries()]).toEqual([
      ['builtin:fan:s_a', { status: 'notControlled', channelId: 'a' }],
      ['builtin:fan:s_c', { status: 'notResponding', channelId: 'c' }],
    ]);
  });
  it('ignores non-fan entries and is empty without channels', () => {
    const temp = { ...fanRule('s_a'), id: 'builtin:cpu', builtIn: 'cpuTemp' as const };
    expect(excludedFanLinks([temp], [channel({ seriesId: 'cpu', controlled: false })]).size).toBe(0);
    expect(excludedFanLinks([fanRule('s_a')], []).size).toBe(0);
  });
});
