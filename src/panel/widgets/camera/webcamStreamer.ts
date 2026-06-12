// Transport half of the capture engine: arm the service (/webcam/start), keep
// one binary socket to /webcam/stream, and frame outgoing payloads. The
// streamer stamps the ARMED dimensions + codec into every header itself, so a
// frame can never drift from what the service expects; geometry changes go
// through rearm() which re-POSTs start before sends resume. Media capture and
// encoding live in useCameraCapture - this file is DOM-media-free and takes
// its effects (REST + socket) as injectable deps for tests.

import { resolveAuthWs } from '../../../api/service';
import { startWebcam, stopWebcam, WEBCAM_STREAM_PATH, type WebcamCodec } from '../../../api/webcam';
import { packFrame, WIRE_CODEC_H264, WIRE_CODEC_MJPEG, type WireCodec } from './webcamProtocol';

export type WebcamStreamerPhase = 'idle' | 'arming' | 'connecting' | 'streaming' | 'failed';

// Outgoing backlog above which delta frames are skipped; keyframes always go
// out so the decoder can recover the moment the socket drains.
export const SEND_BUFFER_LIMIT_BYTES = 256 * 1024;

// Reconnect backoff bounds while the user keeps the camera on.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

/** Minimal socket surface so tests can substitute a fake; WebSocket satisfies it. */
export interface StreamerSocketLike {
  readonly bufferedAmount: number;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

export interface WebcamStreamerDeps {
  /** POST /webcam/start; false = the service rejected or is unreachable. */
  arm(width: number, height: number, codec: WebcamCodec): Promise<boolean>;
  /** POST /webcam/stop (best effort). */
  disarm(): Promise<unknown>;
  /** Open the authenticated binary stream socket. */
  connect(): Promise<StreamerSocketLike>;
}

export interface WebcamStreamerEvents {
  onPhase(phase: WebcamStreamerPhase): void;
  /** The next encoded frame must be a keyframe (fresh socket / re-arm). */
  onNeedKeyframe(): void;
}

export interface WebcamStreamer {
  start(width: number, height: number, codec: WebcamCodec): Promise<void>;
  /** Captured geometry changed: re-arm, then resume with matching headers. */
  rearm(width: number, height: number): Promise<void>;
  /** True if the frame went out; false = not streaming / backpressure drop. */
  send(payload: Uint8Array, opts: { keyframe: boolean; timestampMs: number }): boolean;
  stop(): void;
}

const WIRE_CODECS: Record<WebcamCodec, WireCodec> = {
  h264: WIRE_CODEC_H264,
  mjpeg: WIRE_CODEC_MJPEG,
};

export function createWebcamStreamer(
  events: WebcamStreamerEvents,
  deps: WebcamStreamerDeps = defaultDeps(),
): WebcamStreamer {
  let active = false;
  let armed = false;
  let sendable = false;
  let socket: StreamerSocketLike | null = null;
  let width = 0;
  let height = 0;
  let codec: WebcamCodec = 'h264';
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by stop() and each (re)arm so stale awaits can't resurrect state.
  let epoch = 0;

  const setPhase = (phase: WebcamStreamerPhase) => events.onPhase(phase);

  function openSocket(myEpoch: number): void {
    if (!active || myEpoch !== epoch) return;
    setPhase('connecting');
    deps.connect().then(ws => {
      if (!active || myEpoch !== epoch) { ws.close(); return; }
      let settled = false;
      ws.addEventListener('open', () => {
        if (!active || myEpoch !== epoch || settled) {
          // Stale dial (stop/rearm raced the handshake): release the socket
          // or it sits open holding the service's single stream slot.
          ws.close();
          return;
        }
        settled = true;
        socket = ws;
        attempt = 0;
        sendable = true;
        setPhase('streaming');
        events.onNeedKeyframe();
      });
      ws.addEventListener('close', () => {
        // Compare live state, not the dial-time epoch: rearm bumps the epoch
        // while keeping this socket, and its close must still reconnect.
        if (!active || socket !== ws) return;
        socket = null;
        sendable = false;
        scheduleReconnect(epoch);
      });
      ws.addEventListener('error', () => ws.close());
    }, () => scheduleReconnect(myEpoch));
  }

  function scheduleReconnect(myEpoch: number): void {
    if (!active || myEpoch !== epoch || reconnectTimer !== null) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      // The service tears the session down shortly after the stream drops, so
      // every reconnect re-arms before dialing the socket again.
      void armThenConnect(myEpoch, /* fatalOnReject */ false);
    }, delay);
  }

  async function armThenConnect(myEpoch: number, fatalOnReject: boolean): Promise<void> {
    if (!active || myEpoch !== epoch) return;
    setPhase('arming');
    const ok = await deps.arm(width, height, codec);
    if (!active || myEpoch !== epoch) return;
    if (!ok) {
      if (fatalOnReject) {
        active = false;
        setPhase('failed');
      } else {
        scheduleReconnect(myEpoch);
      }
      return;
    }
    armed = true;
    openSocket(myEpoch);
  }

  return {
    async start(w, h, c) {
      if (active) return;
      active = true;
      width = w;
      height = h;
      codec = c;
      attempt = 0;
      await armThenConnect(++epoch, true);
    },

    async rearm(w, h) {
      if (!active) return;
      width = w;
      height = h;
      sendable = false;
      const myEpoch = ++epoch;
      setPhase('arming');
      const ok = await deps.arm(width, height, codec);
      if (!active || myEpoch !== epoch) return;
      if (!ok) {
        // Same path as a dropped socket: keep retrying until the user stops.
        scheduleReconnect(myEpoch);
        return;
      }
      armed = true;
      if (socket) {
        sendable = true;
        setPhase('streaming');
        events.onNeedKeyframe();
      } else {
        openSocket(myEpoch);
      }
    },

    send(payload, opts) {
      const ws = socket;
      if (!sendable || !ws) return false;
      if (!opts.keyframe && ws.bufferedAmount > SEND_BUFFER_LIMIT_BYTES) return false;
      ws.send(packFrame({
        width,
        height,
        timestampMs: opts.timestampMs,
        keyframe: opts.keyframe,
        codec: WIRE_CODECS[codec],
      }, payload));
      return true;
    },

    stop() {
      if (!active && !armed) return;
      active = false;
      sendable = false;
      epoch += 1;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
      if (armed) {
        armed = false;
        void deps.disarm();
      }
      setPhase('idle');
    },
  };
}

function defaultDeps(): WebcamStreamerDeps {
  return {
    arm: async (width, height, codec) => (await startWebcam(width, height, codec)) !== null,
    disarm: () => stopWebcam(),
    connect: async () => {
      const ws = new WebSocket(await resolveAuthWs(WEBCAM_STREAM_PATH));
      ws.binaryType = 'arraybuffer';
      return ws;
    },
  };
}
