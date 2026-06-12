// Capture half of the phone-as-webcam engine: getUserMedia -> WebCodecs H.264
// (MJPEG canvas fallback) -> webcamStreamer. One module-level session is
// shared by every mounted camera view (the grid tile stays mounted under the
// immersive overlay, so two instances render the same capture); components
// subscribe via useSyncExternalStore. Capture starts ONLY from an explicit
// user start() and stops on stop(), a fatal error, page hide, or when the
// last camera view unmounts (widget removed while live).

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { startWebcam, stopWebcam, WEBCAM_STREAM_PATH, type WebcamCodec } from '../../../api/webcam';
import { resolveAuthWs } from '../../../api/service';
import { cameraConfigKey, RESOLUTION_DIMS, type CameraConfig } from './cameraConfig';
import { createWebcamStreamer, type WebcamStreamer } from './webcamStreamer';

export type CameraPhase = 'idle' | 'starting' | 'streaming' | 'error';

export type CameraErrorReason = 'permission' | 'noCamera' | 'unsupported' | 'start' | 'connection';

export interface CameraCaptureState {
  phase: CameraPhase;
  error: CameraErrorReason | null;
  codec: WebcamCodec | null;
  // OS-side virtual device name reported by /webcam/start ("Nexus Camera").
  cameraName: string;
  // Live preview source while capturing.
  stream: MediaStream | null;
}

export interface CameraCaptureApi {
  state: CameraCaptureState;
  start(): void;
  stop(): void;
}

export const CAMERA_IDLE_STATE: CameraCaptureState = {
  phase: 'idle',
  error: null,
  codec: null,
  cameraName: '',
  stream: null,
};

const FALLBACK_FPS = 30;
const KEYFRAME_INTERVAL_S = 2;
// Realtime: drop at the source instead of queueing into latency.
const ENCODE_QUEUE_LIMIT = 2;
const MJPEG_MAX_FPS = 15;
const JPEG_QUALITY = 0.7;
// Encoded bits per source pixel per frame, clamped to a sane streaming band.
const H264_BITS_PER_PIXEL = 0.08;
const H264_MIN_BITRATE = 1_000_000;
const H264_MAX_BITRATE = 8_000_000;
// Debounces unmount/remount churn (re-keyed tiles, StrictMode) before the
// zero-subscriber privacy stop kicks in.
const RELEASE_GRACE_MS = 1000;

// --- shared store ---------------------------------------------------------

const listeners = new Set<() => void>();
let state: CameraCaptureState = CAMERA_IDLE_STATE;

function setState(patch: Partial<CameraCaptureState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CameraCaptureState {
  return state;
}

// --- session runtime ------------------------------------------------------

interface SessionRuntime {
  // Bumped on every stop; in-flight async steps compare and bail.
  generation: number;
  configKey: string;
  stream: MediaStream | null;
  streamer: WebcamStreamer | null;
  encoder: VideoEncoder | null;
  reader: ReadableStreamDefaultReader<VideoFrame> | null;
  fallbackVideo: HTMLVideoElement | null;
  rvfcHandle: number | null;
  canvas: HTMLCanvasElement | null;
  armedWidth: number;
  armedHeight: number;
  fps: number;
  rearming: boolean;
  forceKeyframe: boolean;
  framesSinceKey: number;
  convertInFlight: boolean;
  lastJpegMs: number;
  everStreamed: boolean;
}

const runtime: SessionRuntime = {
  generation: 0,
  configKey: '',
  stream: null,
  streamer: null,
  encoder: null,
  reader: null,
  fallbackVideo: null,
  rvfcHandle: null,
  canvas: null,
  armedWidth: 0,
  armedHeight: 0,
  fps: FALLBACK_FPS,
  rearming: false,
  forceKeyframe: false,
  framesSinceKey: 0,
  convertInFlight: false,
  lastJpegMs: 0,
  everStreamed: false,
};

// WICG mediacapture-transform; not in lib.dom yet.
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => {
  readable: ReadableStream<VideoFrame>;
};

function trackProcessorCtor(): TrackProcessorCtor | undefined {
  return (globalThis as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor;
}

// --- session control ------------------------------------------------------

async function startSession(config: CameraConfig): Promise<void> {
  if (state.phase === 'starting' || state.phase === 'streaming') return;
  const gen = ++runtime.generation;
  runtime.configKey = cameraConfigKey(config);
  runtime.everStreamed = false;
  setState({ phase: 'starting', error: null, codec: null, cameraName: '', stream: null });

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    failSession('unsupported');
    return;
  }

  const ideal = RESOLUTION_DIMS[config.resolution];
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(config.deviceId ? { deviceId: { exact: config.deviceId } } : {}),
        width: { ideal: ideal.width },
        height: { ideal: ideal.height },
      },
    });
  } catch (err) {
    if (gen !== runtime.generation) return;
    failSession(getUserMediaError(err));
    return;
  }
  if (gen !== runtime.generation) {
    for (const t of stream.getTracks()) t.stop();
    return;
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    for (const t of stream.getTracks()) t.stop();
    failSession('noCamera');
    return;
  }
  runtime.stream = stream;

  const settings = track.getSettings();
  const width = settings.width ?? ideal.width;
  const height = settings.height ?? ideal.height;
  runtime.armedWidth = width;
  runtime.armedHeight = height;
  runtime.fps = settings.frameRate ?? FALLBACK_FPS;

  let codec = await resolveActiveCodec(config.codec, width, height, runtime.fps);
  if (gen !== runtime.generation) return;
  if (!codec) {
    failSession('unsupported');
    return;
  }
  // Client-side H.264 support is not enough: the service refuses codecs its
  // platform sink cannot take (Linux passthrough is MJPEG-only). On auto,
  // probe-arm and drop to MJPEG instead of failing; the streamer re-arms.
  if (codec === 'h264' && config.codec === 'auto') {
    const probe = await startWebcam(width, height, 'h264');
    if (gen !== runtime.generation) {
      // Stop raced the probe; release the armed camera.
      if (probe !== null) void stopWebcam();
      return;
    }
    if (probe === null) codec = 'mjpeg';
  }
  setState({ codec, stream });

  // Camera physically lost / OS revoked mid-session.
  track.addEventListener('ended', () => {
    if (gen !== runtime.generation) return;
    failSession('connection');
  });

  const streamer = createWebcamStreamer({
    onPhase: phase => {
      if (gen !== runtime.generation) return;
      if (phase === 'streaming') {
        runtime.everStreamed = true;
        setState({ phase: 'streaming' });
      } else if (phase === 'arming' || phase === 'connecting') {
        setState({ phase: 'starting' });
      } else if (phase === 'failed') {
        failSession(runtime.everStreamed ? 'connection' : 'start');
      }
    },
    onNeedKeyframe: () => {
      runtime.forceKeyframe = true;
    },
  }, {
    arm: async (w, h, c) => {
      const res = await startWebcam(w, h, c);
      if (res && gen === runtime.generation) setState({ cameraName: res.cameraName });
      return res !== null;
    },
    disarm: () => stopWebcam(),
    connect: async () => {
      const ws = new WebSocket(await resolveAuthWs(WEBCAM_STREAM_PATH));
      ws.binaryType = 'arraybuffer';
      return ws;
    },
  });
  runtime.streamer = streamer;
  void streamer.start(width, height, codec);
  if (gen !== runtime.generation) return;

  registerPageHideStop();
  if (codec === 'h264') startH264Pipeline(gen, track);
  else startMjpegPipeline(gen, track);
}

function stopSession(): void {
  const streamer = runtime.streamer;
  teardownRuntime();
  streamer?.stop();
  setState(CAMERA_IDLE_STATE);
}

function failSession(reason: CameraErrorReason): void {
  const streamer = runtime.streamer;
  teardownRuntime();
  streamer?.stop();
  setState({ phase: 'error', error: reason, stream: null, codec: null });
}

/** Releases media + pipeline resources; the streamer is the caller's to stop. */
function teardownRuntime(): void {
  runtime.generation += 1;
  void runtime.reader?.cancel().catch(() => { /* already torn down */ });
  runtime.reader = null;
  if (runtime.fallbackVideo) {
    if (runtime.rvfcHandle !== null) {
      runtime.fallbackVideo.cancelVideoFrameCallback(runtime.rvfcHandle);
    }
    runtime.fallbackVideo.srcObject = null;
  }
  runtime.fallbackVideo = null;
  runtime.rvfcHandle = null;
  if (runtime.encoder && runtime.encoder.state !== 'closed') runtime.encoder.close();
  runtime.encoder = null;
  runtime.streamer = null;
  for (const t of runtime.stream?.getTracks() ?? []) t.stop();
  runtime.stream = null;
  runtime.canvas = null;
  runtime.rearming = false;
  runtime.forceKeyframe = false;
  runtime.framesSinceKey = 0;
  runtime.convertInFlight = false;
  runtime.lastJpegMs = 0;
}

function getUserMediaError(err: unknown): CameraErrorReason {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'noCamera';
  return 'start';
}

// --- codec selection ------------------------------------------------------

async function resolveActiveCodec(
  setting: CameraConfig['codec'],
  width: number,
  height: number,
  fps: number,
): Promise<WebcamCodec | null> {
  if (setting === 'mjpeg') return 'mjpeg';
  const h264 = await h264EncodeSupported(width, height, fps);
  if (h264) return 'h264';
  return setting === 'auto' ? 'mjpeg' : null;
}

async function h264EncodeSupported(width: number, height: number, fps: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const res = await VideoEncoder.isConfigSupported(buildEncoderConfig(width, height, fps));
    return res.supported === true;
  } catch {
    return false;
  }
}

function buildEncoderConfig(width: number, height: number, fps: number): VideoEncoderConfig {
  return {
    codec: avcCodecString(width, height),
    width,
    height,
    framerate: fps,
    bitrate: h264Bitrate(width, height, fps),
    latencyMode: 'realtime',
    avc: { format: 'annexb' },
  };
}

function avcCodecString(width: number, height: number): string {
  // Constrained Baseline; the level steps up for full-HD frames.
  const hd = RESOLUTION_DIMS['720p'];
  return width * height > hd.width * hd.height ? 'avc1.42E028' : 'avc1.42E01F';
}

function h264Bitrate(width: number, height: number, fps: number): number {
  const raw = Math.round(width * height * fps * H264_BITS_PER_PIXEL);
  return Math.min(H264_MAX_BITRATE, Math.max(H264_MIN_BITRATE, raw));
}

// --- H.264 pipeline -------------------------------------------------------

function startH264Pipeline(gen: number, track: MediaStreamTrack): void {
  const encoder = new VideoEncoder({
    output: chunk => {
      if (gen !== runtime.generation) return;
      const payload = new Uint8Array(chunk.byteLength);
      chunk.copyTo(payload);
      const sent = runtime.streamer?.send(payload, {
        keyframe: chunk.type === 'key',
        timestampMs: Math.round(chunk.timestamp / 1000),
      });
      // A skipped delta breaks every later delta's reference chain - the
      // next frame must restart from a keyframe.
      if (sent === false) runtime.forceKeyframe = true;
    },
    error: () => {
      if (gen !== runtime.generation) return;
      failSession('connection');
    },
  });
  encoder.configure(buildEncoderConfig(runtime.armedWidth, runtime.armedHeight, runtime.fps));
  runtime.encoder = encoder;
  runtime.forceKeyframe = true;
  runtime.framesSinceKey = 0;

  const ctor = trackProcessorCtor();
  if (ctor) {
    const reader = new ctor({ track }).readable.getReader();
    runtime.reader = reader;
    void (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || gen !== runtime.generation) {
          value?.close();
          return;
        }
        encodeVideoFrame(gen, value);
      }
    })().catch(() => { /* reader cancelled on teardown */ });
    return;
  }

  // No track processor: sample the preview element per rendered video frame
  // and lift each sample into a VideoFrame via an ImageBitmap.
  startFallbackLoop(gen, (video, timestampUs) => {
    // Single-flight: at most one bitmap conversion live at a time.
    if (runtime.convertInFlight) return;
    runtime.convertInFlight = true;
    createImageBitmap(video).then(bitmap => {
      runtime.convertInFlight = false;
      if (gen !== runtime.generation) {
        bitmap.close();
        return;
      }
      const frame = new VideoFrame(bitmap, { timestamp: timestampUs });
      bitmap.close();
      encodeVideoFrame(gen, frame);
    }, () => {
      runtime.convertInFlight = false;
    });
  });
}

function encodeVideoFrame(gen: number, frame: VideoFrame): void {
  try {
    if (gen !== runtime.generation || runtime.rearming) return;
    const width = frame.codedWidth;
    const height = frame.codedHeight;
    if (width === 0 || height === 0) return;
    if (width !== runtime.armedWidth || height !== runtime.armedHeight) {
      void handleGeometryChange(gen, width, height);
      return;
    }
    const encoder = runtime.encoder;
    if (!encoder || encoder.state !== 'configured') return;
    if (encoder.encodeQueueSize > ENCODE_QUEUE_LIMIT) return;
    const keyInterval = Math.max(1, Math.round(runtime.fps * KEYFRAME_INTERVAL_S));
    const key = runtime.forceKeyframe || runtime.framesSinceKey >= keyInterval;
    encoder.encode(frame, { keyFrame: key });
    if (key) {
      runtime.forceKeyframe = false;
      runtime.framesSinceKey = 1;
    } else {
      runtime.framesSinceKey += 1;
    }
  } finally {
    frame.close();
  }
}

/** Rotation / source switch: re-arm the service, reconfigure, resume keyed. */
async function handleGeometryChange(gen: number, width: number, height: number): Promise<void> {
  runtime.rearming = true;
  runtime.armedWidth = width;
  runtime.armedHeight = height;
  if (runtime.encoder && runtime.encoder.state === 'configured') {
    // reset() drops queued old-geometry outputs so nothing encoded before the
    // switch can ride out under a re-armed header.
    runtime.encoder.reset();
    runtime.encoder.configure(buildEncoderConfig(width, height, runtime.fps));
  }
  await runtime.streamer?.rearm(width, height);
  if (gen !== runtime.generation) return;
  runtime.rearming = false;
  runtime.forceKeyframe = true;
}

// --- MJPEG pipeline -------------------------------------------------------

function startMjpegPipeline(gen: number, track: MediaStreamTrack): void {
  const ctor = trackProcessorCtor();
  if (ctor) {
    const reader = new ctor({ track }).readable.getReader();
    runtime.reader = reader;
    void (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || gen !== runtime.generation) {
          value?.close();
          return;
        }
        sendJpegFrame(gen, value, value.codedWidth, value.codedHeight);
        value.close();
      }
    })().catch(() => { /* reader cancelled on teardown */ });
    return;
  }

  startFallbackLoop(gen, video => {
    sendJpegFrame(gen, video, video.videoWidth, video.videoHeight);
  });
}

function sendJpegFrame(gen: number, source: CanvasImageSource, width: number, height: number): void {
  if (runtime.rearming || runtime.convertInFlight) return;
  if (width === 0 || height === 0) return;
  if (width !== runtime.armedWidth || height !== runtime.armedHeight) {
    void handleGeometryChange(gen, width, height);
    return;
  }
  const minIntervalMs = 1000 / Math.min(Math.max(runtime.fps, 1), MJPEG_MAX_FPS);
  const now = performance.now();
  if (now - runtime.lastJpegMs < minIntervalMs) return;
  runtime.lastJpegMs = now;

  const canvas = runtime.canvas ?? document.createElement('canvas');
  runtime.canvas = canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(source, 0, 0, width, height);

  runtime.convertInFlight = true;
  canvas.toBlob(blob => {
    if (!blob || gen !== runtime.generation) {
      runtime.convertInFlight = false;
      return;
    }
    void blob.arrayBuffer().then(buf => {
      runtime.convertInFlight = false;
      if (gen !== runtime.generation) return;
      runtime.streamer?.send(new Uint8Array(buf), {
        // Every JPEG is self-contained.
        keyframe: true,
        timestampMs: Math.round(now),
      });
    }, () => {
      runtime.convertInFlight = false;
    });
  }, 'image/jpeg', JPEG_QUALITY);
}

// --- shared fallback sampler ----------------------------------------------

function startFallbackLoop(
  gen: number,
  onFrame: (video: HTMLVideoElement, timestampUs: number) => void,
): void {
  const video = document.createElement('video');
  // No track processor AND no per-frame callback: nothing can sample frames.
  if (typeof video.requestVideoFrameCallback !== 'function') {
    failSession('unsupported');
    return;
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = runtime.stream;
  runtime.fallbackVideo = video;
  try {
    const playing = video.play();
    if (playing) void playing.catch(() => { /* surfaced via no frames */ });
  } catch { /* jsdom / detached element */ }

  const tick = (_now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
    if (gen !== runtime.generation || runtime.fallbackVideo !== video) return;
    onFrame(video, Math.round(meta.mediaTime * 1_000_000));
    runtime.rvfcHandle = video.requestVideoFrameCallback(tick);
  };
  runtime.rvfcHandle = video.requestVideoFrameCallback(tick);
}

// --- lifecycle plumbing ----------------------------------------------------

let pageHideRegistered = false;

function registerPageHideStop(): void {
  if (pageHideRegistered || typeof window === 'undefined') return;
  pageHideRegistered = true;
  // The service tears the virtual camera down shortly after the stream drops,
  // so a best-effort local stop is enough here.
  window.addEventListener('pagehide', () => {
    if (state.phase === 'starting' || state.phase === 'streaming') stopSession();
  });
}

let mountedViews = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function retainView(): void {
  mountedViews += 1;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function releaseView(): void {
  mountedViews -= 1;
  if (mountedViews > 0 || releaseTimer !== null) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    if (mountedViews === 0 && (state.phase === 'starting' || state.phase === 'streaming')) {
      stopSession();
    }
  }, RELEASE_GRACE_MS);
}

/** Settings changed while live: restart the capture with the new config. */
function maybeRestartForConfig(config: CameraConfig): void {
  if (state.phase !== 'starting' && state.phase !== 'streaming') return;
  if (cameraConfigKey(config) === runtime.configKey) return;
  stopSession();
  void startSession(config);
}

// --- hook -------------------------------------------------------------------

export function useCameraCapture(config: CameraConfig): CameraCaptureApi {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { deviceId, resolution, codec } = config;
  const stableConfig = useMemo(
    () => ({ deviceId, resolution, codec }),
    [deviceId, resolution, codec],
  );

  useEffect(() => {
    retainView();
    return releaseView;
  }, []);

  // Live-applies camera / resolution / codec edits from the settings sheet.
  useEffect(() => {
    maybeRestartForConfig(stableConfig);
  }, [stableConfig]);

  const start = useCallback(() => {
    void startSession(stableConfig);
  }, [stableConfig]);

  const stop = useCallback(() => {
    stopSession();
  }, []);

  return { state: snapshot, start, stop };
}

/** Test-only: drop the shared session back to idle between cases. */
export function resetCameraCaptureForTests(): void {
  const streamer = runtime.streamer;
  teardownRuntime();
  streamer?.stop();
  mountedViews = 0;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  state = CAMERA_IDLE_STATE;
  for (const l of listeners) l();
}
