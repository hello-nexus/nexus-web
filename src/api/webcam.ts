// Phone-as-webcam control endpoints + the binary frame stream path. LAN/direct
// only: the service refuses relay dispatches for every /webcam route, so
// callers gate on the live transport (isTunnelActive) before starting capture.

import { fetchService, postService } from './service';

export const WEBCAM_STREAM_PATH = '/webcam/stream';

export type WebcamCodec = 'h264' | 'mjpeg';

// Mirror of WebcamStatusResponse in nexus-service Models/Webcam/WebcamDtos.cs.
export interface WebcamStatus {
  // A start call armed the session and the virtual camera is up.
  active: boolean;
  // A phone stream socket is currently connected.
  streaming: boolean;
  width: number;
  height: number;
  codec: string;
  framesReceived: number;
  lastFrameUnixMs: number;
  // OS-side virtual device name ("Nexus Camera").
  cameraName: string;
}

/**
 * Arm (or re-arm) the session: the service creates the virtual camera and
 * locks the stream format. Frame headers MUST carry these exact dimensions -
 * re-POST on any captured-track change (rotation, camera switch) before
 * sending frames with the new geometry. Null = rejected or unreachable.
 */
export const startWebcam = (width: number, height: number, codec: WebcamCodec) =>
  postService<WebcamStatus>('/webcam/start', { width, height, codec });

export const stopWebcam = () =>
  postService<WebcamStatus>('/webcam/stop', {});

export const fetchWebcamStatus = () =>
  fetchService<WebcamStatus>('/webcam/status');
