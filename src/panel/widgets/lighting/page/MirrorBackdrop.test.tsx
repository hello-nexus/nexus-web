import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MirrorBackdrop } from './MirrorBackdrop';

const tunnel = vi.hoisted(() => ({ active: false }));
const paint = vi.hoisted(() => vi.fn());

vi.mock('../../../../api/lighting', () => ({
  screenPreviewUrl: () => Promise.resolve('ws://localhost:9400/lighting/screen/preview'),
}));
vi.mock('../../../../api/service', () => ({ isTunnelActive: () => tunnel.active }));
vi.mock('../../../../lib/ledFrame', () => ({ paintLedFrame: paint }));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  binaryType = 'blob';
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWebSocket.instances.push(this); }
  close() { this.closed = true; }
}

function frame(w: number, h: number): ArrayBuffer {
  const bytes = new Uint8Array(5 + w * h * 3 + 1);
  bytes[0] = 0x03;
  bytes[1] = w & 0xff; bytes[2] = w >> 8;
  bytes[3] = h & 0xff; bytes[4] = h >> 8;
  return bytes.buffer;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('MirrorBackdrop', () => {
  const realWebSocket = globalThis.WebSocket;
  beforeEach(() => {
    FakeWebSocket.instances = [];
    paint.mockClear();
    tunnel.active = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });
  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
  });

  it('opens the preview socket while mounted, paints frames, and closes on unmount', async () => {
    const { unmount } = render(<MirrorBackdrop />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toContain('/lighting/screen/preview');
    paint.mockClear();
    act(() => socket.onmessage?.({ data: frame(4, 2) }));
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0][2]).toBe(4);
    expect(paint.mock.calls[0][3]).toBe(2);
    unmount();
    expect(socket.closed).toBe(true);
  });

  it('closes while the page is hidden and reconnects when visible again', async () => {
    render(<MirrorBackdrop />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => setVisibility('hidden'));
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
  });

  it('opens no socket when it starts hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    render(<MirrorBackdrop />);
    await act(async () => { await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('opens no socket over a sealed tunnel', async () => {
    tunnel.active = true;
    render(<MirrorBackdrop />);
    await act(async () => { await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('reconnects after an ordinary close', async () => {
    render(<MirrorBackdrop />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].onclose?.({ code: 1006 }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 3500 });
  });

  it('renders nothing and stops retrying when the service reports no capture source', async () => {
    const { container } = render(<MirrorBackdrop />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(container.querySelector('canvas')).not.toBeNull();
    act(() => FakeWebSocket.instances[0].onclose?.({ code: 4503 }));
    expect(container.querySelector('canvas')).toBeNull();
    // A page that hides and shows again must not retry either.
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await act(async () => { await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
