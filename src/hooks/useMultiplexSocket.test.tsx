import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMultiplexConnection } from './useMultiplexSocket';

vi.mock('../api/service', () => ({
  resolveAuthWs: vi.fn(async (path: string) => `ws://test.local${path}`),
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  url: string;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event('close'));
  }

  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event('close'));
  }
}

describe('useMultiplexConnection reconnect schedule', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses exponential backoff capped at 60s and resets on a successful open', async () => {
    const { result } = renderHook(() => useMultiplexConnection(true));
    // Allow the initial async resolveAuthWs() to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(1);

    // Sequence of expected delays for closes 1..6: 5s, 10s, 20s, 40s, 60s, 60s.
    const expectedDelays = [5000, 10000, 20000, 40000, 60000, 60000];
    for (const delay of expectedDelays) {
      const lastBeforeClose = FakeWebSocket.instances.length;
      const ws = FakeWebSocket.instances[lastBeforeClose - 1];
      act(() => {
        ws.triggerClose();
      });
      // Just below the expected delay: no new socket yet.
      await act(async () => {
        vi.advanceTimersByTime(delay - 1);
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(lastBeforeClose);
      // Crossing the delay triggers a new connect (which awaits resolveAuthWs).
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(lastBeforeClose + 1);
    }

    // Successful open resets backoff: next close should schedule at 5s, not 60s.
    const lastWs = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    act(() => {
      lastWs.readyState = FakeWebSocket.OPEN;
      lastWs.onopen?.(new Event('open'));
    });
    expect(result.current?.connected).toBe(true);

    const beforeReset = FakeWebSocket.instances.length;
    act(() => {
      lastWs.triggerClose();
    });
    expect(result.current?.connected).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(4999);
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(beforeReset);
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(beforeReset + 1);
  });

  it('reconnect() resets backoff and reconnects immediately', async () => {
    const { result } = renderHook(() => useMultiplexConnection(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(FakeWebSocket.instances.length).toBe(1);

    // Fail twice to advance the schedule.
    for (const delay of [5000, 10000]) {
      const before = FakeWebSocket.instances.length;
      act(() => {
        FakeWebSocket.instances[before - 1].triggerClose();
      });
      await act(async () => {
        vi.advanceTimersByTime(delay);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(FakeWebSocket.instances.length).toBe(before + 1);
    }

    const beforeReconnect = FakeWebSocket.instances.length;
    await act(async () => {
      result.current?.reconnect();
      await Promise.resolve();
      await Promise.resolve();
    });
    // reconnect() short-circuits the pending timer and creates a fresh socket.
    expect(FakeWebSocket.instances.length).toBe(beforeReconnect + 1);
  });
});
