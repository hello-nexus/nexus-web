import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeeb } from './useKeeb';
import {
  type KeebMacro,
  type KeebSettings,
  type KeyboardState,
  type SetLayerKeyBody,
  type SetLayerKeyResponse,
  type SetMacroResponse,
  getKeebMacro,
  getKeebSettings,
  getKeebState,
  resetKeebLayer,
  setKeebFirmwareLighting,
  setKeebGameMode,
  setKeebLayerKey,
  setKeebMacro,
  setKeebPassiveLighting,
  setKeebRotary,
} from '../api/keeb';

vi.mock('../api/keeb', () => ({
  getKeebMacro: vi.fn(),
  getKeebSettings: vi.fn(),
  getKeebState: vi.fn(),
  resetKeebLayer: vi.fn(),
  setKeebFirmwareLighting: vi.fn(),
  setKeebGameMode: vi.fn(),
  setKeebLayerKey: vi.fn(),
  setKeebMacro: vi.fn(),
  setKeebPassiveLighting: vi.fn(),
  setKeebRotary: vi.fn(),
}));

const mockState = vi.mocked(getKeebState);
const mockSettings = vi.mocked(getKeebSettings);
const mockSetKey = vi.mocked(setKeebLayerKey);
const mockReset = vi.mocked(resetKeebLayer);
const mockGetMacro = vi.mocked(getKeebMacro);
const mockSetMacro = vi.mocked(setKeebMacro);
const mockFw = vi.mocked(setKeebFirmwareLighting);
const mockPassive = vi.mocked(setKeebPassiveLighting);
const mockGameMode = vi.mocked(setKeebGameMode);
const mockRotary = vi.mocked(setKeebRotary);

function makeState(over: Partial<KeyboardState> = {}): KeyboardState {
  return {
    isConnected: true,
    profile: 1,
    layout: 'ANSI',
    layer: 0,
    keys: [[{ mode: 'StandardKey', function: 'A', input: null }]],
    ...over,
  };
}

function makeSettings(over: Partial<KeebSettings> = {}): KeebSettings {
  return {
    shiftKeyDisabled: false,
    windowsKeyDisabled: false,
    altF4Disabled: false,
    altTabDisabled: false,
    animationMode: 'Wave',
    speed: 'Medium',
    direction: 'Left',
    brightness: 50,
    keyReactive: false,
    keyReactiveMask: false,
    keyReactiveMode: 'Single',
    keyReactiveColor: { r: 255, g: 0, b: 0, a: 255 },
    ...over,
  };
}

// Drain the microtask queue inside act so resolved fetch/write chains land.
const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

// Fire due fake timers (the poll interval) and settle the resulting fetches.
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
}

function ackFor(state: KeyboardState): SetLayerKeyResponse {
  return { state, wroteDevice: true };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

// Mount enabled and settle the initial fetch.
async function renderKeeb() {
  const utils = renderHook(() => useKeeb(true));
  await flush();
  return utils;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockState.mockResolvedValue(makeState());
  mockSettings.mockResolvedValue(makeSettings());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useKeeb', () => {
  it('fetches state and settings on mount and toggles loading', async () => {
    const st = deferred<KeyboardState | null>();
    mockState.mockReturnValueOnce(st.promise);

    const { result } = renderHook(() => useKeeb(true));

    // In flight: loading is up, state is still the empty placeholder.
    expect(result.current.loading).toBe(true);
    expect(result.current.state.isConnected).toBe(false);
    expect(result.current.settings).toBeNull();
    expect(mockState).toHaveBeenCalledWith(0);
    expect(mockSettings).toHaveBeenCalledTimes(1);

    const server = makeState();
    await act(async () => { st.resolve(server); });
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.state).toStrictEqual(server);
    expect(result.current.settings).toEqual(makeSettings());
  });

  it('polls for fresh state on the poll interval', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    const next = makeState({ profile: 2 });
    mockState.mockResolvedValue(next);
    await advance(1500);

    expect(mockState).toHaveBeenCalledTimes(2);
    expect(result.current.state).toStrictEqual(next);

    await advance(1500);
    expect(mockState).toHaveBeenCalledTimes(3);
  });

  it('suppresses the poll while a write is in flight and resumes after it settles', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    const write = deferred<boolean>();
    mockRotary.mockReturnValue(write.promise);
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.saveRotary({ left: 'Volume', right: 'Zoom' });
    });

    await advance(1500);
    await advance(1500);
    // The interval fired twice but no fetch went out while the write was pending.
    expect(mockState).toHaveBeenCalledTimes(1);
    expect(mockSettings).toHaveBeenCalledTimes(1);

    let ok = false;
    await act(async () => {
      write.resolve(true);
      ok = await pending;
    });
    expect(ok).toBe(true);

    // Write settled successfully: polling resumes, no resync was needed.
    await advance(1500);
    expect(mockState).toHaveBeenCalledTimes(2);
  });

  it('setKey applies the optimistic cell immediately and adopts the server state on ack', async () => {
    const { result } = await renderKeeb();

    const ack = makeState({ profile: 9 });
    const write = deferred<SetLayerKeyResponse | null>();
    mockSetKey.mockReturnValue(write.promise);

    const body: SetLayerKeyBody = { x: 0, y: 0, func: 'B', mode: 'MediaKey' };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.setKey(body); });

    // Optimistic: the cell flips before the POST resolves.
    expect(result.current.state.keys).toEqual([[{ mode: 'MediaKey', function: 'B', input: null }]]);
    expect(mockSetKey).toHaveBeenCalledWith(0, body);

    let ok = false;
    await act(async () => {
      write.resolve(ackFor(ack));
      ok = await pending;
    });
    await flush();

    expect(ok).toBe(true);
    // The server-returned authoritative state replaced the optimistic one.
    expect(result.current.state).toStrictEqual(ack);
    // Success: no resync fetch beyond the initial one.
    expect(mockState).toHaveBeenCalledTimes(1);
  });

  it('setKey failure returns false, resyncs, and reverts to the server state', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    mockSetKey.mockResolvedValue(null);
    const reverted = makeState({ profile: 5 });
    mockState.mockResolvedValue(reverted);

    const body: SetLayerKeyBody = { x: 0, y: 0, func: 'B', mode: 'MediaKey' };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.setKey(body); });
    expect(result.current.state.keys).toEqual([[{ mode: 'MediaKey', function: 'B', input: null }]]);

    let ok = true;
    await act(async () => { ok = await pending; });
    await flush();

    expect(ok).toBe(false);
    // The resync fetch fired once the failed write settled.
    expect(mockState).toHaveBeenCalledTimes(2);
    expect(result.current.state).toStrictEqual(reverted);
    expect(result.current.state.keys).toEqual([[{ mode: 'StandardKey', function: 'A', input: null }]]);
  });

  it('resetLayer optimistically clears the keys and resyncs on failure', async () => {
    const { result } = await renderKeeb();
    expect(result.current.state.keys).not.toEqual([]);

    mockReset.mockResolvedValue(null);
    const reverted = makeState({ profile: 3 });
    mockState.mockResolvedValue(reverted);

    let pending!: Promise<boolean>;
    act(() => { pending = result.current.resetLayer(); });
    expect(result.current.state.keys).toEqual([]);
    expect(mockReset).toHaveBeenCalledWith(0);

    let ok = true;
    await act(async () => { ok = await pending; });
    await flush();

    expect(ok).toBe(false);
    expect(mockState).toHaveBeenCalledTimes(2);
    expect(result.current.state).toStrictEqual(reverted);
  });

  it('saveFirmwareLighting merges optimistic settings and returns the api result', async () => {
    const { result } = await renderKeeb();
    mockFw.mockResolvedValue(true);

    const body = {
      animationMode: 'Ripple',
      speed: 'Fast',
      direction: 'Right',
      brightness: 80,
    };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveFirmwareLighting(body); });

    // Optimistic merge before the POST resolves.
    expect(result.current.settings).toMatchObject(body);

    let ok = false;
    await act(async () => { ok = await pending; });
    await flush();

    expect(ok).toBe(true);
    expect(mockFw).toHaveBeenCalledWith(body);
    // Success: no resync fetch beyond the initial one.
    expect(mockSettings).toHaveBeenCalledTimes(1);
  });

  it('savePassiveLighting failure resyncs settings back to server truth', async () => {
    const { result } = await renderKeeb();
    mockPassive.mockResolvedValue(false);

    const body = {
      keyReactive: true,
      keyReactiveMask: true,
      keyReactiveMode: 'Ripple',
      keyReactiveColor: { r: 0, g: 255, b: 0, a: 255 },
    };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.savePassiveLighting(body); });
    expect(result.current.settings).toMatchObject(body);

    let ok = true;
    await act(async () => { ok = await pending; });
    await flush();

    expect(ok).toBe(false);
    // The resync refetched settings and rolled the optimistic merge back.
    expect(mockSettings).toHaveBeenCalledTimes(2);
    expect(result.current.settings).toEqual(makeSettings());
  });

  it('saveGameMode maps the body onto the settings field names', async () => {
    const { result } = await renderKeeb();
    mockGameMode.mockResolvedValue(true);

    const body = { altF4: true, altTab: true, shiftTab: true, windowsKey: true };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveGameMode(body); });

    expect(result.current.settings).toMatchObject({
      altF4Disabled: true,
      altTabDisabled: true,
      shiftKeyDisabled: true,
      windowsKeyDisabled: true,
    });

    let ok = false;
    await act(async () => { ok = await pending; });
    expect(ok).toBe(true);
    expect(mockGameMode).toHaveBeenCalledWith(body);
  });

  it('saveRotary passes through, and a failure schedules the resync', async () => {
    const { result } = await renderKeeb();
    mockRotary.mockResolvedValueOnce(true);

    const body = { left: 'Volume', right: 'Zoom' };
    let okRotary = false;
    await act(async () => { okRotary = await result.current.saveRotary(body); });
    expect(okRotary).toBe(true);
    expect(mockRotary).toHaveBeenCalledWith(body);
    expect(mockState).toHaveBeenCalledTimes(1);

    mockRotary.mockResolvedValueOnce(false);
    let okFail = true;
    await act(async () => { okFail = await result.current.saveRotary(body); });
    await flush();
    expect(okFail).toBe(false);
    // The failed write scheduled a resync fetch.
    expect(mockState).toHaveBeenCalledTimes(2);
  });

  it('saveMacro returns the acked macro and suppresses the poll while in flight', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    const write = deferred<SetMacroResponse | null>();
    mockSetMacro.mockReturnValue(write.promise);
    let pending!: Promise<SetMacroResponse | null>;
    act(() => { pending = result.current.saveMacro(2, []); });
    expect(mockSetMacro).toHaveBeenCalledWith(2, []);

    await advance(1500);
    await advance(1500);
    // The interval fired twice but no fetch went out while the save was pending.
    expect(mockState).toHaveBeenCalledTimes(1);
    expect(mockSettings).toHaveBeenCalledTimes(1);

    const resp: SetMacroResponse = {
      macro: { index: 2, keys: [] }, truncated: false, droppedKeys: [], wroteDevice: true,
    };
    let saved: SetMacroResponse | null = null;
    await act(async () => {
      write.resolve(resp);
      saved = await pending;
    });
    expect(saved).toBe(resp);

    // Acked: polling resumes, no resync was needed.
    await advance(1500);
    expect(mockState).toHaveBeenCalledTimes(2);
  });

  it('saveMacro null triggers the state/settings resync', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    mockSetMacro.mockResolvedValue(null);
    let saved: SetMacroResponse | null = {
      macro: { index: 0, keys: [] }, truncated: false, droppedKeys: [], wroteDevice: true,
    };
    await act(async () => { saved = await result.current.saveMacro(1, []); });
    await flush();

    expect(saved).toBeNull();
    // The failed write scheduled an immediate refetch of state + settings.
    expect(mockState).toHaveBeenCalledTimes(2);
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });

  it('loadMacro passes through and does NOT suppress polling', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    const read = deferred<KeebMacro | null>();
    mockGetMacro.mockReturnValue(read.promise);
    let pending!: Promise<KeebMacro | null>;
    act(() => { pending = result.current.loadMacro(3); });
    expect(mockGetMacro).toHaveBeenCalledWith(3);

    // A poll lands while the read is still in flight.
    await advance(1500);
    expect(mockState).toHaveBeenCalledTimes(2);

    const macro: KeebMacro = { index: 3, keys: [] };
    let loaded: KeebMacro | null = null;
    await act(async () => {
      read.resolve(macro);
      loaded = await pending;
    });
    expect(loaded).toBe(macro);
  });

  it('stops polling after unmount', async () => {
    const { unmount } = await renderKeeb();
    expect(mockState).toHaveBeenCalledTimes(1);

    unmount();
    await advance(1500 * 3);

    expect(mockState).toHaveBeenCalledTimes(1);
    expect(mockSettings).toHaveBeenCalledTimes(1);
  });

  it('setLayer refetches with the requested layer', async () => {
    const { result } = await renderKeeb();
    expect(mockState).toHaveBeenLastCalledWith(0);

    await act(async () => { result.current.setLayer(2); });
    await flush();

    expect(result.current.layer).toBe(2);
    expect(mockState).toHaveBeenLastCalledWith(2);
  });

  it('does not adopt a setKey ack after the user switched layers', async () => {
    const { result } = await renderKeeb();

    const write = deferred<SetLayerKeyResponse | null>();
    mockSetKey.mockReturnValue(write.promise);
    const body: SetLayerKeyBody = { x: 0, y: 0, func: 'B', mode: 'MediaKey' };
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.setKey(body); });

    // The user switches layers while the write is in flight (the poll for
    // layer 2 stays suppressed until the write settles).
    const layer2 = makeState({ layer: 2 });
    mockState.mockResolvedValue(layer2);
    await act(async () => { result.current.setLayer(2); });
    await flush();

    // The stale ack (a layer-0 board) resolves; it must not repaint layer 2.
    const staleAck = makeState({ keys: [[{ mode: 'MediaKey', function: 'StaleAck', input: null }]] });
    await act(async () => {
      write.resolve(ackFor(staleAck));
      await pending;
    });
    await flush();
    expect(result.current.state).not.toBe(staleAck);
    expect(result.current.state.keys[0]?.[0]?.function).not.toBe('StaleAck');

    // The next poll paints the real layer-2 board.
    await advance(1500);
    expect(result.current.state).toStrictEqual(layer2);
  });

  it('discards a poll that started before a write completed', async () => {
    const { result } = await renderKeeb();

    // Next poll hangs in flight, carrying pre-write data.
    const stalePoll = deferred<KeyboardState | null>();
    mockState.mockReturnValueOnce(stalePoll.promise);
    await advance(1500);

    // A write lands while that poll is still out: server acks with the
    // post-write layer state.
    const acked = makeState({ keys: [[{ mode: 'MediaKey', function: 'VolumeUp', input: null }]] });
    mockSetKey.mockResolvedValueOnce(ackFor(acked));
    const body: SetLayerKeyBody = { x: 0, y: 0, func: 'VolumeUp', mode: 'MediaKey', input: null };
    await act(async () => { await result.current.setKey(body); });
    expect(result.current.state.keys[0][0].function).toBe('VolumeUp');

    // The stale poll resolves with the pre-write mapping; it must not
    // clobber the acked state.
    await act(async () => { stalePoll.resolve(makeState()); });
    await flush();

    expect(result.current.state.keys[0][0].function).toBe('VolumeUp');
  });
});
