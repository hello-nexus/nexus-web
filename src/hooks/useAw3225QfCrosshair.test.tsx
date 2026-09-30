import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Aw3225QfCrosshairStatus } from '../api/aw3225qf';
import { useAw3225QfCrosshair } from './useAw3225QfCrosshair';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), push: vi.fn() }));
vi.mock('../api/aw3225qf', () => ({ getAw3225QfCrosshair: mocks.get, setAw3225QfCrosshair: mocks.set }));
vi.mock('../components/common/Toast/Toast', () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock('../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const initial: Aw3225QfCrosshairStatus = {
  connected: true, enabled: true, activeEngine: 6, displayId: 'monitor1',
  config: { type: 0, color: 2, maskControl: 0 }, error: '',
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.get.mockResolvedValue(initial);
  mocks.set.mockResolvedValue(initial);
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

async function mount() {
  const hook = renderHook(() => useAw3225QfCrosshair());
  await act(async () => { await Promise.resolve(); });
  return hook;
}

describe('AW3225QF crosshair synchronization', () => {
  it('polls engine changes made through the monitor OSD', async () => {
    const hook = await mount();
    expect(hook.result.current.status?.enabled).toBe(true);
    mocks.get.mockResolvedValue({ ...initial, enabled: false, activeEngine: 0 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(hook.result.current.status?.enabled).toBe(false);
    expect(hook.result.current.config).toEqual(initial.config);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('restores the saved selection and actual engine after a failed write', async () => {
    const hook = await mount();
    mocks.set.mockResolvedValue({ ...initial, error: 'Could not set the crosshair.' });
    mocks.get.mockResolvedValue({ ...initial, enabled: false, activeEngine: 0 });
    await act(async () => { await hook.result.current.apply(true, { ...initial.config, type: 5 }); });
    expect(hook.result.current.config.type).toBe(0);
    expect(hook.result.current.status?.enabled).toBe(false);
    expect(hook.result.current.busy).toBe(false);
    expect(mocks.push).toHaveBeenCalledOnce();
  });

  it('keeps the previous selection if both writing and recovery fail', async () => {
    const hook = await mount();
    mocks.set.mockResolvedValue(null);
    mocks.get.mockResolvedValue(null);
    await act(async () => { await hook.result.current.apply(true, { ...initial.config, color: 3 }); });
    expect(hook.result.current.config).toEqual(initial.config);
    expect(hook.result.current.readFailed).toBe(true);
    expect(hook.result.current.busy).toBe(false);
  });

  it('ignores a poll response that started before a write', async () => {
    const hook = await mount();
    let resolvePoll!: (value: Aw3225QfCrosshairStatus) => void;
    mocks.get.mockReturnValueOnce(new Promise<Aw3225QfCrosshairStatus>(resolve => { resolvePoll = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const changed = { ...initial, config: { ...initial.config, type: 5 } };
    mocks.set.mockResolvedValue(changed);
    await act(async () => { await hook.result.current.apply(true, changed.config); });
    await act(async () => { resolvePoll(initial); await Promise.resolve(); });
    expect(hook.result.current.config.type).toBe(5);
  });

  it('recovers from a failed read on the next poll', async () => {
    mocks.get.mockResolvedValueOnce(null);
    const hook = await mount();
    expect(hook.result.current.readFailed).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(hook.result.current.readFailed).toBe(false);
    expect(hook.result.current.status?.connected).toBe(true);
  });

  it('prevents duplicate writes and stops polling after unmount', async () => {
    const hook = await mount();
    let resolveWrite!: (value: Aw3225QfCrosshairStatus) => void;
    mocks.set.mockReturnValueOnce(new Promise<Aw3225QfCrosshairStatus>(resolve => { resolveWrite = resolve; }));
    let write!: Promise<void>;
    act(() => { write = hook.result.current.apply(true, initial.config); });
    await act(async () => { await hook.result.current.apply(false, initial.config); });
    expect(mocks.set).toHaveBeenCalledOnce();
    hook.unmount();
    resolveWrite(initial);
    await write;
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.get).toHaveBeenCalledOnce();
  });
});
