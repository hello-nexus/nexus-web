import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { ScreenPreviewCanvas } from './ScreenPreviewCanvas';

const tunnel = vi.hoisted(() => ({ active: false }));
const paint = vi.hoisted(() => vi.fn());

vi.mock('../../../api/lighting', () => ({
  screenPreviewUrl: () => Promise.resolve('ws://localhost:9400/lighting/screen/preview'),
}));
vi.mock('../../../api/service', () => ({ isTunnelActive: () => tunnel.active }));
vi.mock('../../../lib/ledFrame', () => ({ paintLedFrame: paint }));

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


describe('ScreenPreviewCanvas', () => {
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

  it('reports the size of each painted frame and takes the class it is given', async () => {
    const onSize = vi.fn();
    const { container } = render(<ScreenPreviewCanvas className="shape" onSize={onSize} />);
    expect(container.querySelector('canvas')).toHaveClass('shape');
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].onmessage?.({ data: frame(4, 2) }));
    expect(onSize).toHaveBeenCalledWith(4, 2);
  });

  it('calls onUnavailable once when the service has no capture source', async () => {
    const onUnavailable = vi.fn();
    const { container } = render(<ScreenPreviewCanvas onUnavailable={onUnavailable} />);
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].onclose?.({ code: 4503 }));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(container.querySelector('canvas')).toBeNull();
  });
});
