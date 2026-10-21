import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceLedStrip } from './DeviceLedStrip';
import { clearLedFrame, publishLedFrame } from '../../../../lib/ledFrameStore';
import type { LightingDevice } from '../../../../api/lighting';

vi.mock('../../../../hooks/useEffectThumbnail', () => ({
  useEffectThumbnail: () => null,
}));

// jsdom ships no canvas backend, so the draw calls are the observable
// behaviour: putImageData means "sampled the shared frame", fillRect means
// "painted this device's own colour", clearRect alone means "showed nothing".
const ctx = {
  fillStyle: '', globalAlpha: 1, imageSmoothingEnabled: true,
  fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
  putImageData: vi.fn(),
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};

const device: LightingDevice = {
  id: 'a', name: 'Strip', ledsOn: true, ledCount: 4,
  canvasX: 0, canvasY: 0, canvasW: 1000, canvasH: 600, canvasRotation: 0,
};

function publishRed() {
  const px = new Uint8Array(3 * 4);
  for (let i = 0; i < 4; i++) px[i * 3] = 255;
  publishLedFrame(px, 2, 2);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  ctx.fillRect.mockClear();
  ctx.clearRect.mockClear();
  ctx.putImageData.mockClear();
});
afterEach(() => { clearLedFrame(); vi.restoreAllMocks(); });

describe('DeviceLedStrip', () => {
  it('samples the shared canvas by default', () => {
    publishRed();
    render(<DeviceLedStrip device={device} fullscreen />);
    expect(ctx.putImageData).toHaveBeenCalled();
  });

  // Static assigns per device: a card with no assignment of its own is showing
  // nothing in particular. The shared frame is retained at module scope, so
  // sampling it would paint a colour the device is not wearing - and frozen,
  // since a per-device surface publishes no further frames.
  it('stays blank with no pick when the surface is per-device', () => {
    publishRed();
    render(<DeviceLedStrip device={device} fullscreen pickOnly />);
    expect(ctx.putImageData).not.toHaveBeenCalled();
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it('still paints the device its own pick when there is one', () => {
    publishRed();
    const pick = { key: 'flat:blue-3', hex: '#0000ff', slot: 0, version: '1' };
    render(<DeviceLedStrip device={device} fullscreen pickOnly pick={pick} />);
    expect(ctx.putImageData).not.toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#0000ff');
  });

  it('reads each cell as its area box mean when Area sampling is on', () => {
    // Top row white, bottom row black; one box per row.
    const px = new Uint8Array(3 * 4);
    px.fill(255, 0, 6);
    publishLedFrame(px, 2, 2);
    const area: LightingDevice = { ...device, ledCount: 2, areaSampling: true, areaBoxes: [0, 0, 1, 0.5, 0, 0.5, 1, 1] };
    render(<DeviceLedStrip device={area} />);
    const out = ctx.putImageData.mock.calls.at(-1)![0].data as Uint8ClampedArray;
    expect([...out]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  describe('real device bytes', () => {
    const withIndex: LightingDevice = { ...device, frameIndex: 7 };
    // 4 LEDs: red, green, blue, white.
    const bytes = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const lastImage = () => ctx.putImageData.mock.calls.at(-1)![0].data as Uint8ClampedArray;

    it('paints every strip from its device bytes in LED order, locked or not', () => {
      publishLedFrame(new Uint8Array(3 * 4), 2, 2, new Map([[7, bytes]]));
      render(<DeviceLedStrip device={withIndex} />);
      expect([...lastImage()]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    });

    it('prefers the bytes over the canvas, a pick and the per-device blank', () => {
      publishRed();
      publishLedFrame(new Uint8Array(3 * 4).fill(9), 2, 2, new Map([[7, bytes]]));
      render(<DeviceLedStrip device={withIndex} fullscreen pickOnly pick={{ key: 'flat:blue-3', hex: '#0000ff', slot: 0, version: '1' }} />);
      expect(lastImage()[0]).toBe(255);
      expect(lastImage()[1]).toBe(0);
      expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it('applies the device brightness', () => {
      publishLedFrame(null, 0, 0, new Map([[7, bytes]]));
      render(<DeviceLedStrip device={{ ...withIndex, brightness: 50 }} />);
      expect(lastImage()[0]).toBe(128);
    });

    it('reads a matrix device in wiring order, evenly across its LEDs', () => {
      // 96 LEDs, each tagged by its own index in the red channel.
      const keys = new Uint8Array(96 * 3);
      for (let i = 0; i < 96; i++) keys[i * 3] = i;
      publishLedFrame(null, 0, 0, new Map([[7, keys]]));
      render(<DeviceLedStrip device={{ ...withIndex, ledCount: 96 }} />);
      const reds = Array.from({ length: 24 }, (_, c) => lastImage()[c * 4]);
      expect(reds[0]).toBe(0);
      expect(reds[23]).toBe(95);
      expect([...reds].sort((a, b) => a - b)).toEqual(reds);
    });

    it('falls back to sampling the canvas when the frame has no bytes for it', () => {
      publishRed();
      render(<DeviceLedStrip device={withIndex} />);
      expect([...lastImage().slice(0, 4)]).toEqual([255, 0, 0, 255]);
    });

    it('falls back when the device has no frame index', () => {
      publishLedFrame(new Uint8Array(3 * 4).fill(9), 2, 2, new Map([[7, bytes]]));
      render(<DeviceLedStrip device={device} />);
      expect([...lastImage().slice(0, 3)]).toEqual([9, 9, 9]);
    });
  });
});
