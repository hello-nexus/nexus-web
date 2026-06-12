// Wire format for one /webcam/stream binary message: a fixed little-endian
// header followed by the codec payload. Pure byte assembly - no DOM media
// APIs - so the protocol stays unit-testable. Keep in lockstep with
// WebcamSession.TryParseFrame in nexus-service src/Webcam/WebcamSession.cs.

export const WEBCAM_PROTOCOL_VERSION = 0x01;

/** Header bytes: version, flags, width, height, timestamp. */
export const WEBCAM_HEADER_BYTES = 10;

const KEYFRAME_FLAG = 0x01;
const CODEC_SHIFT = 1;

// flags bits 1-2.
export const WIRE_CODEC_H264 = 0;
export const WIRE_CODEC_MJPEG = 1;
export type WireCodec = typeof WIRE_CODEC_H264 | typeof WIRE_CODEC_MJPEG;

export interface WebcamFrameHeader {
  width: number;
  height: number;
  // Wraps to u32 on the wire.
  timestampMs: number;
  keyframe: boolean;
  codec: WireCodec;
}

/** Header alone; see packFrame for the full message. */
export function buildFrameHeader(header: WebcamFrameHeader): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(WEBCAM_HEADER_BYTES);
  writeHeader(bytes, header);
  return bytes;
}

/** One complete wire message: header + payload in a single buffer. */
export function packFrame(header: WebcamFrameHeader, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(WEBCAM_HEADER_BYTES + payload.length);
  writeHeader(bytes, header);
  bytes.set(payload, WEBCAM_HEADER_BYTES);
  return bytes;
}

function writeHeader(out: Uint8Array, header: WebcamFrameHeader): void {
  const view = new DataView(out.buffer, out.byteOffset);
  view.setUint8(0, WEBCAM_PROTOCOL_VERSION);
  view.setUint8(1, (header.keyframe ? KEYFRAME_FLAG : 0) | (header.codec << CODEC_SHIFT));
  view.setUint16(2, header.width, true);
  view.setUint16(4, header.height, true);
  view.setUint32(6, header.timestampMs >>> 0, true);
}
