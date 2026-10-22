import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetchWithStatus = vi.fn();
let topicFrame: (data: unknown) => void = () => {};
vi.mock('../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, _enabled: boolean, cb: (data: unknown) => void) => { topicFrame = cb; },
}));
vi.mock('./service', () => ({
  authFetchWithStatus: (...a: unknown[]) => authFetchWithStatus(...a),
  fetchService: vi.fn(),
}));

import { fetchService } from './service';
import { putHotkey, setHotkeysSuspended, useHotkeys, type HotkeysState } from './hotkeys';

const ok = (state: unknown) => ({ response: { json: async () => state }, status: 200 });
const empty: HotkeysState = { supported: true, platform: 'macos', suspended: false, bindings: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setHotkeysSuspended', () => {
  it('sends calls one at a time, in order, so a resume cannot overtake a suspend', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    authFetchWithStatus.mockImplementation(async (_path: string, opts: { body: { suspended: boolean } }) => {
      order.push(`start:${opts.body.suspended}`);
      if (opts.body.suspended) await new Promise<void>(r => { releaseFirst = r; });
      order.push(`end:${opts.body.suspended}`);
      return ok(empty);
    });
    const a = setHotkeysSuspended(true);
    const b = setHotkeysSuspended(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start:true']);
    releaseFirst();
    await Promise.all([a, b]);
    expect(order).toEqual(['start:true', 'end:true', 'start:false', 'end:false']);
  });

  it('keeps going after a failed call', async () => {
    authFetchWithStatus.mockResolvedValueOnce({ response: null, status: 0 }).mockResolvedValueOnce(ok(empty));
    await setHotkeysSuspended(true);
    await expect(setHotkeysSuspended(false)).resolves.toEqual({ ok: true, state: empty });
  });
});

describe('putHotkey', () => {
  it('returns the service message on a refusal', async () => {
    authFetchWithStatus.mockResolvedValue({ response: { json: async () => ({ error: true, msg: 'invalid combo' }) }, status: 400 });
    const res = await putHotkey({ id: 'x', combo: 'k', enabled: true, target: { kind: 'action', action: { type: 'hotkey', keys: 'a' } } });
    expect(res).toEqual({ ok: false, msg: 'invalid combo', code: undefined });
  });

  it('carries a stable error code when the service sends one', async () => {
    authFetchWithStatus.mockResolvedValue({ response: { json: async () => ({ error: true, msg: 'x', code: 'tooMany' }) }, status: 409 });
    const res = await putHotkey({ id: 'x', combo: 'k', enabled: true, target: { kind: 'action', action: { type: 'hotkey', keys: 'a' } } });
    expect(res).toMatchObject({ ok: false, code: 'tooMany' });
  });
});

describe('useHotkeys', () => {
  it('lets a topic frame that lands first win over a GET that arrives late', async () => {
    let resolveGet: (v: HotkeysState) => void = () => {};
    vi.mocked(fetchService).mockImplementation(() => new Promise(r => { resolveGet = r as (v: HotkeysState) => void; }));
    const { result } = renderHook(() => useHotkeys(true));
    const newer: HotkeysState = { ...empty, suspended: true };
    act(() => topicFrame(newer));
    await act(async () => { resolveGet({ ...empty, suspended: false }); });
    expect(result.current.state?.suspended).toBe(true);
    expect(result.current.loaded).toBe(true);
  });

  it('starts over from a fresh GET after being disabled and enabled again', async () => {
    vi.mocked(fetchService).mockResolvedValue(empty);
    const { result, rerender } = renderHook(({ on }) => useHotkeys(on), { initialProps: { on: true } });
    await vi.waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => topicFrame({ ...empty, suspended: true }));
    rerender({ on: false });
    vi.mocked(fetchService).mockResolvedValue({ ...empty, platform: 'linux' });
    rerender({ on: true });
    await vi.waitFor(() => expect(result.current.state?.platform).toBe('linux'));
  });

  it('adopts the GET when no frame has arrived', async () => {
    vi.mocked(fetchService).mockResolvedValue({ ...empty, platform: 'windows' });
    const { result } = renderHook(() => useHotkeys(true));
    await vi.waitFor(() => expect(result.current.state?.platform).toBe('windows'));
  });
});
