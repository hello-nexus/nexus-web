import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebcamStreamer,
  SEND_BUFFER_LIMIT_BYTES,
  type StreamerSocketLike,
  type WebcamStreamerPhase,
} from './webcamStreamer';
import { WEBCAM_HEADER_BYTES, WEBCAM_PROTOCOL_VERSION } from './webcamProtocol';

class FakeSocket implements StreamerSocketLike {
  bufferedAmount = 0;
  sent: Uint8Array[] = [];
  closed = false;
  private listeners: Record<'open' | 'close' | 'error', Array<() => void>> = {
    open: [], close: [], error: [],
  };

  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void {
    this.listeners[type].push(listener);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  fire(type: 'open' | 'close' | 'error'): void {
    for (const l of [...this.listeners[type]]) l();
  }
}

function makeHarness(deps?: Partial<Parameters<typeof createWebcamStreamer>[1]>) {
  const phases: WebcamStreamerPhase[] = [];
  const onNeedKeyframe = vi.fn();
  const sockets: FakeSocket[] = [];
  const fullDeps = {
    arm: vi.fn(async () => true),
    disarm: vi.fn(async () => null),
    connect: vi.fn(async () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }),
    ...deps,
  };
  const streamer = createWebcamStreamer(
    { onPhase: p => phases.push(p), onNeedKeyframe },
    fullDeps,
  );
  return { streamer, phases, onNeedKeyframe, deps: fullDeps, sockets };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function headerOf(frame: Uint8Array) {
  const view = new DataView(frame.buffer, frame.byteOffset);
  return {
    version: view.getUint8(0),
    keyframe: (view.getUint8(1) & 0b001) !== 0,
    codec: (view.getUint8(1) >> 1) & 0b11,
    width: view.getUint16(2, true),
    height: view.getUint16(4, true),
    timestampMs: view.getUint32(6, true),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createWebcamStreamer', () => {
  it('arms with the captured format, then streams once the socket opens', async () => {
    const h = makeHarness();
    await h.streamer.start(1280, 720, 'h264');
    await flushMicrotasks();

    expect(h.deps.arm).toHaveBeenCalledWith(1280, 720, 'h264');
    expect(h.phases).toEqual(['arming', 'connecting']);

    h.sockets[0].fire('open');
    expect(h.phases).toEqual(['arming', 'connecting', 'streaming']);
    expect(h.onNeedKeyframe).toHaveBeenCalledTimes(1);
  });

  it('fails without dialing the socket when the initial arm is rejected', async () => {
    const h = makeHarness({ arm: vi.fn(async () => false) });
    await h.streamer.start(1280, 720, 'h264');

    expect(h.phases).toEqual(['arming', 'failed']);
    expect(h.deps.connect).not.toHaveBeenCalled();
  });

  it('drops sends until streaming, then stamps the armed geometry into each frame', async () => {
    const h = makeHarness();
    await h.streamer.start(640, 480, 'mjpeg');
    await flushMicrotasks();

    expect(h.streamer.send(new Uint8Array([1]), { keyframe: true, timestampMs: 5 })).toBe(false);

    h.sockets[0].fire('open');
    expect(h.streamer.send(new Uint8Array([1, 2]), { keyframe: true, timestampMs: 5 })).toBe(true);

    const frame = h.sockets[0].sent[0];
    expect(frame).toHaveLength(WEBCAM_HEADER_BYTES + 2);
    expect(headerOf(frame)).toEqual({
      version: WEBCAM_PROTOCOL_VERSION,
      keyframe: true,
      codec: 1,
      width: 640,
      height: 480,
      timestampMs: 5,
    });
  });

  it('skips delta frames under backpressure but always lets keyframes through', async () => {
    const h = makeHarness();
    await h.streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    h.sockets[0].fire('open');

    h.sockets[0].bufferedAmount = SEND_BUFFER_LIMIT_BYTES + 1;
    expect(h.streamer.send(new Uint8Array([1]), { keyframe: false, timestampMs: 1 })).toBe(false);
    expect(h.streamer.send(new Uint8Array([2]), { keyframe: true, timestampMs: 2 })).toBe(true);
    expect(h.sockets[0].sent).toHaveLength(1);
  });

  it('rearm pauses sends, re-POSTs start, then resumes keyed with the new geometry', async () => {
    let releaseArm: ((ok: boolean) => void) | undefined;
    const arm = vi.fn()
      .mockImplementationOnce(async () => true)
      .mockImplementationOnce(() => new Promise<boolean>(resolve => { releaseArm = resolve; }));
    const h = makeHarness({ arm });
    await h.streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    h.sockets[0].fire('open');

    const rearmDone = h.streamer.rearm(720, 1280);
    expect(h.streamer.send(new Uint8Array([1]), { keyframe: true, timestampMs: 1 })).toBe(false);

    releaseArm!(true);
    await rearmDone;

    expect(arm).toHaveBeenLastCalledWith(720, 1280, 'h264');
    expect(h.onNeedKeyframe).toHaveBeenCalledTimes(2);
    expect(h.streamer.send(new Uint8Array([2]), { keyframe: true, timestampMs: 2 })).toBe(true);
    expect(headerOf(h.sockets[0].sent[0])).toMatchObject({ width: 720, height: 1280 });
  });

  it('re-arms and reconnects with backoff after the socket drops', async () => {
    vi.useFakeTimers();
    const h = makeHarness();
    await h.streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    h.sockets[0].fire('open');

    h.sockets[0].fire('close');
    expect(h.streamer.send(new Uint8Array([1]), { keyframe: true, timestampMs: 1 })).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(h.deps.arm).toHaveBeenCalledTimes(2);
    expect(h.deps.connect).toHaveBeenCalledTimes(2);

    h.sockets[1].fire('open');
    expect(h.phases[h.phases.length - 1]).toBe('streaming');
    expect(h.onNeedKeyframe).toHaveBeenCalledTimes(2);
    expect(h.streamer.send(new Uint8Array([2]), { keyframe: true, timestampMs: 2 })).toBe(true);
  });

  it('reconnects when the kept socket drops after a rearm', async () => {
    vi.useFakeTimers();
    const { streamer, deps, sockets, phases } = makeHarness();
    await streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    sockets[0].fire('open');

    // Rearm keeps the live socket (epoch bumps, socket survives).
    await streamer.rearm(720, 1280);
    await flushMicrotasks();
    expect(phases.at(-1)).toBe('streaming');

    // The kept socket dropping later must still schedule a reconnect.
    sockets[0].fire('close');
    expect(streamer.send(new Uint8Array(1), { keyframe: true, timestampMs: 0 })).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    await flushMicrotasks();
    expect(deps.connect.mock.calls.length).toBeGreaterThan(1);
  });

  it('closes a dialed socket whose open arrives after stop', async () => {
    const { streamer, sockets } = makeHarness();
    await streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    streamer.stop();
    sockets[0].fire('open');
    expect(sockets[0].closed).toBe(true);
  });

  it('stop closes the socket, disarms, and cancels pending reconnects', async () => {
    vi.useFakeTimers();
    const h = makeHarness();
    await h.streamer.start(1280, 720, 'h264');
    await flushMicrotasks();
    h.sockets[0].fire('open');

    h.streamer.stop();
    expect(h.sockets[0].closed).toBe(true);
    expect(h.deps.disarm).toHaveBeenCalledTimes(1);
    expect(h.phases[h.phases.length - 1]).toBe('idle');

    // A late close event from the dying socket must not resurrect anything.
    h.sockets[0].fire('close');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.deps.connect).toHaveBeenCalledTimes(1);
    expect(h.streamer.send(new Uint8Array([1]), { keyframe: true, timestampMs: 1 })).toBe(false);
  });
});
