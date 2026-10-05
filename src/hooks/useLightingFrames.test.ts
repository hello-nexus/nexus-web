import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { parseFrame, useLightingFrames } from './useLightingFrames';
import { subscribeLedFrame, type LedFrame } from '../lib/ledFrameStore';

vi.mock('../api/lighting', () => ({
  lightingOutputUrl: () => Promise.resolve('ws://localhost:9400/lighting/output'),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

// v3 frame: 0x03, width/height little-endian, then width*height RGB bytes.
function frame(w: number, h: number, fill: number): ArrayBuffer {
  const bytes = new Uint8Array(5 + w * h * 3);
  bytes[0] = 0x03;
  bytes[1] = w & 0xff; bytes[2] = w >> 8;
  bytes[3] = h & 0xff; bytes[4] = h >> 8;
  bytes.fill(fill, 5);
  return bytes.buffer;
}

describe('useLightingFrames', () => {
  const realWebSocket = globalThis.WebSocket;
  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });
  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
  });

  it('publishes every frame to the store without re-rendering per frame', async () => {
    let renders = 0;
    const { result, unmount } = renderHook(() => { renders++; return useLightingFrames(); });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.onopen?.());
    expect(result.current).toEqual({ connected: true, live: false });

    const rendersBeforeFrames = renders;
    act(() => {
      for (let i = 0; i < 30; i++) socket.onmessage?.({ data: frame(4, 2, i) });
    });

    // The first canvas frame flips live once; the other 29 cause no render.
    expect(result.current).toEqual({ connected: true, live: true });
    expect(renders - rendersBeforeFrames).toBe(1);
    // A subscriber is handed the store's current frame on subscribe.
    const seen: LedFrame[] = [];
    const unsubscribe = subscribeLedFrame(f => seen.push(f));
    const last = seen[0];
    expect(last.w).toBe(4);
    expect(last.h).toBe(2);
    expect(last.pixels?.[0]).toBe(29);

    unsubscribe();
    unmount();
    expect(socket.closed).toBe(true);
  });

  it('stays empty and opens no socket while disabled', async () => {
    const { result } = renderHook(() => useLightingFrames(false));
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(result.current).toEqual({ connected: false, live: false });
  });
});

// v3 frame with device sections appended after the canvas.
function frameWithDevices(w: number, h: number, devices: { index: number; rgb: number[] }[]): Uint8Array {
  const sections = devices.flatMap(d => {
    const leds = d.rgb.length / 3;
    return [d.index, leds & 0xff, leds >> 8, ...d.rgb];
  });
  const bytes = new Uint8Array(5 + w * h * 3 + 1 + sections.length);
  bytes[0] = 0x03;
  bytes[1] = w & 0xff; bytes[2] = w >> 8;
  bytes[3] = h & 0xff; bytes[4] = h >> 8;
  bytes[5 + w * h * 3] = devices.length;
  bytes.set(sections, 5 + w * h * 3 + 1);
  return bytes;
}

describe('parseFrame device sections', () => {
  it('returns each device section keyed by its index as a view over the buffer', () => {
    const bytes = frameWithDevices(2, 1, [
      { index: 0, rgb: [1, 2, 3] },
      { index: 7, rgb: [10, 20, 30, 40, 50, 60] },
    ]);
    const parsed = parseFrame(bytes);
    expect(parsed.canvasW).toBe(2);
    expect(parsed.canvasPixels).toHaveLength(6);
    expect([...parsed.devices.keys()]).toEqual([0, 7]);
    expect([...(parsed.devices.get(7) ?? [])]).toEqual([10, 20, 30, 40, 50, 60]);
    expect(parsed.devices.get(0)?.buffer).toBe(bytes.buffer);
  });

  it('has no devices when the count is zero or the frame ends at the canvas', () => {
    expect(parseFrame(frameWithDevices(2, 1, [])).devices.size).toBe(0);
    const canvasOnly = frame(2, 1, 5);
    expect(parseFrame(new Uint8Array(canvasOnly)).devices.size).toBe(0);
  });

  it('keeps the sections that fit when the frame is truncated', () => {
    const bytes = frameWithDevices(1, 1, [
      { index: 1, rgb: [1, 2, 3] },
      { index: 2, rgb: [4, 5, 6] },
    ]);
    const parsed = parseFrame(bytes.subarray(0, bytes.length - 2));
    expect([...parsed.devices.keys()]).toEqual([1]);
  });

  it('ignores v2 frames', () => {
    const parsed = parseFrame(new Uint8Array([0x02, 0, 0, 0, 0, 0]));
    expect(parsed.canvasPixels).toBeNull();
    expect(parsed.devices.size).toBe(0);
  });
});
