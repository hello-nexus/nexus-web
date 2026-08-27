// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildFrameHeader,
  packFrame,
  WEBCAM_HEADER_BYTES,
  WEBCAM_PROTOCOL_VERSION,
  WIRE_CODEC_H264,
  WIRE_CODEC_MJPEG,
} from './webcamProtocol';

describe('buildFrameHeader', () => {
  it('lays out version, flags, LE dimensions, and LE timestamp', () => {
    const header = buildFrameHeader({
      width: 1280,
      height: 720,
      timestampMs: 0x01020304,
      keyframe: true,
      codec: WIRE_CODEC_H264,
    });

    expect(header).toHaveLength(WEBCAM_HEADER_BYTES);
    expect(header[0]).toBe(WEBCAM_PROTOCOL_VERSION);
    // keyframe bit set, h264 codec bits zero.
    expect(header[1]).toBe(0b001);
    // u16 LE width / height.
    expect([header[2], header[3]]).toEqual([0x00, 0x05]);
    expect([header[4], header[5]]).toEqual([0xd0, 0x02]);
    // u32 LE timestamp.
    expect([header[6], header[7], header[8], header[9]]).toEqual([0x04, 0x03, 0x02, 0x01]);
  });

  it('encodes the codec in flags bits 1-2 independent of the keyframe bit', () => {
    expect(buildFrameHeader({ width: 1, height: 1, timestampMs: 0, keyframe: false, codec: WIRE_CODEC_MJPEG })[1])
      .toBe(0b010);
    expect(buildFrameHeader({ width: 1, height: 1, timestampMs: 0, keyframe: true, codec: WIRE_CODEC_MJPEG })[1])
      .toBe(0b011);
    expect(buildFrameHeader({ width: 1, height: 1, timestampMs: 0, keyframe: false, codec: WIRE_CODEC_H264 })[1])
      .toBe(0b000);
  });

  it('wraps the timestamp to u32', () => {
    const header = buildFrameHeader({
      width: 1,
      height: 1,
      timestampMs: 2 ** 32 + 7,
      keyframe: false,
      codec: WIRE_CODEC_H264,
    });
    expect([header[6], header[7], header[8], header[9]]).toEqual([0x07, 0x00, 0x00, 0x00]);
  });
});

describe('packFrame', () => {
  it('appends the payload directly after the header', () => {
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const info = { width: 640, height: 480, timestampMs: 42, keyframe: true, codec: WIRE_CODEC_MJPEG } as const;

    const frame = packFrame(info, payload);

    expect(frame).toHaveLength(WEBCAM_HEADER_BYTES + payload.length);
    expect(Array.from(frame.subarray(0, WEBCAM_HEADER_BYTES))).toEqual(Array.from(buildFrameHeader(info)));
    expect(Array.from(frame.subarray(WEBCAM_HEADER_BYTES))).toEqual([0xaa, 0xbb, 0xcc]);
  });
});
