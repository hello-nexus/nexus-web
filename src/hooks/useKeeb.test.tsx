// useKeeb optimistic-update test. The HID write on the service can take
// several seconds on the real keeb; without an optimistic local update,
// the user clicks a source key, sees nothing change for 2-7s, then the
// new mapping pops in. This test pins the optimistic behaviour: state
// reflects the write BEFORE the POST resolves.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useKeeb } from './useKeeb';
import type { UseKeebApi } from './useKeeb';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Control the POST's resolution so we can assert state changes BEFORE it
// resolves. `resolveWrite` is exposed to the test so it can release the
// blocked promise after the assertions run.
let resolveWrite: (() => void) | null = null;
const writeStarted = vi.fn();

vi.mock('../api/keeb', async () => {
  const actual = await vi.importActual<typeof import('../api/keeb')>('../api/keeb');
  return {
    ...actual,
    // Poll calls — return canonical baseline state.
    getKeebState: async () => ({
      isConnected: true,
      profile: 0,
      layout: 'ANSI',
      layer: 0,
      keys: [],
    }),
    getKeebSettings: async () => null,
    // Write call — never resolves until the test releases it. This is the
    // worst case: a 2-7s HID round-trip on T1. If the UI waited on this,
    // it would feel completely frozen.
    setKeebLayerKey: vi.fn(async () => {
      writeStarted();
      await new Promise<void>(resolve => { resolveWrite = resolve; });
      // Return a fresh state — emulates a successful firmware ack.
      return {
        isConnected: true,
        profile: 0,
        layout: 'ANSI',
        layer: 0,
        keys: [],
      } as import('../api/keeb').KeyboardState;
    }),
  };
});

function Harness({ apiRef }: { apiRef: { current: UseKeebApi | null } }) {
  const api = useKeeb(true);
  apiRef.current = api;
  return null;
}

async function flushMicrotasks() {
  await act(async () => { await Promise.resolve(); });
}

describe('useKeeb — optimistic setKey', () => {
  it('updates state.keys[x][y] synchronously, before the POST resolves', async () => {
    resolveWrite = null;
    writeStarted.mockClear();
    const apiRef: { current: UseKeebApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    // Let the initial poll settle.
    await flushMicrotasks();
    expect(apiRef.current).not.toBeNull();
    const api = apiRef.current!;
    // Pre-condition: no override at (5, 1) yet.
    expect(api.state.keys[5]?.[1]).toBeUndefined();

    // Fire the click handler. We deliberately do NOT await it — the click
    // path is fire-and-forget from the user's POV. The POST inside is
    // blocked indefinitely by the mock.
    let writePromise: Promise<void> | null = null;
    act(() => {
      writePromise = api.setKey({ x: 5, y: 1, func: 'Q', mode: 'StandardKey', input: null });
    });

    // Optimistic update should be visible immediately — even though the
    // POST hasn't resolved.
    expect(apiRef.current!.state.keys[5][1]).toEqual({ mode: 'StandardKey', function: 'Q', input: null });
    expect(writeStarted).toHaveBeenCalledTimes(1);
    expect(resolveWrite).not.toBeNull();

    // Release the POST and let it settle for cleanup.
    resolveWrite!();
    await act(async () => { await writePromise; });
  });

  it('a poll that races a pending write does NOT clobber the optimistic state', async () => {
    resolveWrite = null;
    writeStarted.mockClear();
    const apiRef: { current: UseKeebApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    await flushMicrotasks();

    // Apply optimistic write — POST blocks indefinitely.
    let writePromise: Promise<void> | null = null;
    act(() => {
      writePromise = apiRef.current!.setKey({ x: 5, y: 1, func: 'Z', mode: 'StandardKey', input: null });
    });
    expect(apiRef.current!.state.keys[5][1].function).toBe('Z');

    // Manually trigger a refresh — simulating the 5s background poll firing
    // mid-flight. Because pendingWritesRef > 0, refresh must early-out and
    // NOT overwrite state.keys with the stale firmware read (which still
    // shows the default for (5,1) since our write hasn't been acked).
    await act(async () => { await apiRef.current!.refresh(); });

    expect(apiRef.current!.state.keys[5][1].function).toBe('Z');

    // Cleanup.
    resolveWrite!();
    await act(async () => { await writePromise; });
  });
});
