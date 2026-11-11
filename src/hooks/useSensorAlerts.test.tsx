import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorAlertRule, SensorAlertState } from '../api/diagnosticsAlerts';
import { carryValues, useSensorAlerts } from './useSensorAlerts';

const h = vi.hoisted(() => ({
  frame: null as null | ((data: unknown) => void),
  fetchSensorAlerts: vi.fn(),
  updateSensorAlert: vi.fn(),
  resetBuiltInSensorAlerts: vi.fn(),
  acknowledgeSensorAlert: vi.fn(),
}));

vi.mock('../api/diagnosticsAlerts', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/diagnosticsAlerts')>()),
  fetchSensorAlerts: h.fetchSensorAlerts,
  updateSensorAlert: h.updateSensorAlert,
  resetBuiltInSensorAlerts: h.resetBuiltInSensorAlerts,
  acknowledgeSensorAlert: h.acknowledgeSensorAlert,
}));
vi.mock('./useMultiplexSocket', () => ({
  useMultiplex: () => ({ connected: true }),
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    if (topic === 'diagnostics/alerts' && enabled) h.frame = cb;
  },
}));

const rule = (id: string, over: Partial<SensorAlertRule> = {}): SensorAlertRule => ({
  id, enabled: true,
  sensor: { category: 'cpu', id: 'cpu/temp/0', name: id, type: 'Temperature', parentName: 'CPU' },
  low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
  notifyDesktop: true, showInHealth: true, repeatMinutes: 0, builtIn: null, ...over,
});
const state = (ruleId: string, over: Partial<SensorAlertState> = {}): SensorAlertState => (
  { ruleId, state: 'ok', value: 50, acknowledged: false, ...over }
);
const ok = <T,>(data: T) => ({ ok: true, status: 200, data });

const builtIn = rule('builtin-cpu', { builtIn: 'cpuTemp', high: 90 });
const user = rule('r1');

async function mount(liveValues = false) {
  h.fetchSensorAlerts.mockResolvedValue(ok({ rules: [builtIn, user], states: [state('builtin-cpu')] }));
  const view = renderHook(() => useSensorAlerts(true, liveValues));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateSensorAlert.mockResolvedValue(ok(null));
});
afterEach(() => { vi.useRealTimers(); });

describe('useSensorAlerts', () => {
  it('counts only user rules toward the cap', async () => {
    const builtIns = Array.from({ length: 5 }, (_, i) => rule(`builtin:gpu-temp:${i}`, { builtIn: 'gpuTemp' }));
    const users = Array.from({ length: 19 }, (_, i) => rule(`u${i}`));
    h.fetchSensorAlerts.mockResolvedValue(ok({ rules: [...builtIns, ...users], states: [] }));
    const { result } = renderHook(() => useSensorAlerts(true, false));
    await act(async () => {});
    expect(result.current.rules).toHaveLength(24);
    expect(result.current.atLimit).toBe(false);
  });

  it('drops the queued write of a reset built-in but keeps the edit of a user rule', async () => {
    const { result } = await mount();
    let releaseFirst: (v: unknown) => void = () => {};
    h.updateSensorAlert.mockImplementationOnce(() => new Promise(res => { releaseFirst = res; }));
    h.resetBuiltInSensorAlerts.mockResolvedValue(ok({ rules: [{ ...builtIn, high: 85 }, user], states: [] }));
    // One write in flight and a newer one queued behind it, for each rule.
    act(() => {
      result.current.save({ ...builtIn, high: 99 });
      result.current.save({ ...builtIn, high: 98 });
      result.current.save({ ...user, high: 70 });
    });
    const calls = h.updateSensorAlert.mock.calls.length;
    let reset: Promise<boolean> = Promise.resolve(false);
    act(() => { reset = result.current.resetBuiltIns('builtin-cpu'); });
    await act(async () => { releaseFirst(ok(null)); await reset; });
    const written = h.updateSensorAlert.mock.calls.slice(calls).map(c => c[0]);
    expect(written.some(r => r.id === 'builtin-cpu')).toBe(false);
    expect(h.updateSensorAlert.mock.calls.some(c => c[0].id === 'r1' && c[0].high === 70)).toBe(true);
    expect(result.current.rules.find(r => r.id === 'builtin-cpu')?.high).toBe(85);
    expect(result.current.rules.find(r => r.id === 'r1')?.high).toBe(70);
  });

  it('acknowledge clears the ended fields along with raising the flag', async () => {
    const { result } = await mount();
    act(() => {
      h.frame?.({ states: [state('builtin-cpu', { endedAt: '2026-11-10T22:00:00Z', endedPeak: 95, endedThreshold: 90, endedDirection: 'above' })] });
    });
    h.acknowledgeSensorAlert.mockResolvedValue(ok(null));
    await act(async () => { await result.current.acknowledge('builtin-cpu'); });
    expect(result.current.states[0]).toMatchObject({ acknowledged: true, endedAt: null, endedPeak: null, endedThreshold: null, endedDirection: null });
  });

  it('applies the limit the service stored when it clamped a built-in write', async () => {
    const { result } = await mount();
    h.updateSensorAlert.mockResolvedValue(ok({ ...builtIn, high: 105 }));
    await act(async () => { result.current.save({ ...builtIn, high: 140 }); });
    expect(result.current.rules.find(r => r.id === 'builtin-cpu')?.high).toBe(105);
  });

  it('re-reads the states on a timer so a built-in reading keeps moving between frames', async () => {
    vi.useFakeTimers();
    const { result } = await mount(true);
    h.fetchSensorAlerts.mockResolvedValue(ok({ rules: [builtIn, user], states: [state('builtin-cpu', { value: 63 })] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.states[0].value).toBe(63);
  });

  it('does not poll without liveValues', async () => {
    vi.useFakeTimers();
    await mount(false);
    const calls = h.fetchSensorAlerts.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(h.fetchSensorAlerts.mock.calls.length).toBe(calls);
  });

  it('keeps the last reading when a frame pushed after an edit carries no value', async () => {
    const { result } = await mount();
    expect(result.current.states[0].value).toBe(50);
    await act(async () => { result.current.save({ ...builtIn, severity: 'act' }); });
    act(() => { h.frame?.({ states: [state('builtin-cpu', { value: null })] }); });
    expect(result.current.states[0].value).toBe(50);
    act(() => { h.frame?.({ states: [state('builtin-cpu', { value: 61 })] }); });
    expect(result.current.states[0].value).toBe(61);
  });
});

describe('carryValues', () => {
  it('fills a missing value from the previous state, but not for a lost sensor or an unknown rule', () => {
    const prev = [state('a', { value: 40 }), state('b', { value: 41 }), state('c', { value: 42 })];
    const next = [state('a', { value: null }), state('b', { value: null, state: 'unavailable' }), state('d', { value: null })];
    const out = carryValues(prev, next);
    expect(out.map(s => s.value)).toEqual([40, null, null]);
  });
});
