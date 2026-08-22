import { memo, useEffect, useRef, useState } from 'react';
import { subscribeLedFrame, type LedFrame } from '../../../../lib/ledFrameStore';
import { identifyPhase, subscribeIdentify } from '../../../../lib/identifyFlash';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import { isStaticFill } from '../../../../types/lighting';
import { cardEnabledLedCount } from './zoneUtils';
import type { LightingDevice } from '../../../../api/lighting';
import styles from '../LightingPage.module.scss';

/**
 * A device's own Static selection. Fills carry their colour outright; patterns
 * need the preset slot too, since that is what the rendered look belongs to.
 */
export interface LedPick {
  key: string;
  hex: string;
  slot: number;
  version: string;
}

// Effect-canvas coordinate space the device rects are expressed in, matching
// DeviceCanvas and the engine's own sampling.
const CW = 1000;
const CH = 600;
// Upper bound on drawn cells: a 104-LED keyboard reads the same as 24 in a
// strip this size, and the sample loop stays cheap on every frame.
const MAX_CELLS = 24;

const EMPTY_FRAME: LedFrame = { pixels: null, w: 0, h: 0, seq: 0 };

function paint(
  canvas: HTMLCanvasElement,
  device: LightingDevice,
  frame: LedFrame,
  pick: LedPick | undefined,
  pattern: HTMLImageElement | null,
  fullscreen: boolean,
): void {
  const cells = Math.max(1, Math.min(cardEnabledLedCount(device) || 1, MAX_CELLS));
  if (canvas.width !== cells) canvas.width = cells;
  if (canvas.height !== 1) canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Per-device brightness is applied after sampling in the service, so mirror
  // it here or a dimmed device would read at full strength.
  const scale = Math.min(1, Math.max(0, (device.brightness ?? 100) / 100));

  // Identify outranks both: while it runs, the hardware is blinking white and
  // ignoring the frame, so the readout shows the blink, not the look beneath.
  const flash = identifyPhase(device.id);
  if (flash !== null) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash ? '#fff' : '#000';
    ctx.fillRect(0, 0, cells, 1);
    return;
  }

  // A per-device pick outranks the effect canvas, matching what the override
  // does on the hardware.
  if (pick) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cells, 1);
    ctx.globalAlpha = scale;
    if (pattern) {
      // A pattern has no single colour: point-sample its midline across the
      // full width, which is how Static evaluates a device (frame stretched to
      // the canvas corners). Smoothing off so each LED reads one texel rather
      // than a blur of its neighbours, matching the engine's point sample.
      ctx.imageSmoothingEnabled = false;
      const row = Math.floor(pattern.naturalHeight / 2);
      ctx.drawImage(pattern, 0, row, pattern.naturalWidth, 1, 0, 0, cells, 1);
    } else {
      ctx.fillStyle = pick.hex;
      ctx.fillRect(0, 0, cells, 1);
    }
    ctx.globalAlpha = 1;
    return;
  }

  const { pixels, w, h } = frame;
  if (!pixels || w === 0 || h === 0) {
    ctx.clearRect(0, 0, cells, 1);
    return;
  }

  const img = ctx.createImageData(cells, 1);
  const d = img.data;
  // Static evaluates every device as if its frame filled the canvas, so a
  // pattern reads end to end on each device instead of the slice its rect
  // happens to cover. Other modes sample the rect's midline, left to right,
  // the axis a strip is wired along.
  const x0 = fullscreen ? 0 : device.canvasX;
  const span = fullscreen ? CW : device.canvasW;
  const midY = fullscreen ? CH / 2 : device.canvasY + device.canvasH / 2;
  const vy = Math.min(h - 1, Math.max(0, Math.round((midY / CH) * h)));
  for (let i = 0; i < cells; i++) {
    const t = cells === 1 ? 0.5 : i / (cells - 1);
    const ux = Math.min(w - 1, Math.max(0, Math.round(((x0 + t * span) / CW) * w)));
    const s = (vy * w + ux) * 3;
    const o = i * 4;
    d[o] = pixels[s] * scale;
    d[o + 1] = pixels[s + 1] * scale;
    d[o + 2] = pixels[s + 2] * scale;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Live LED readout on a device card: one cell per LED, sampled from the same
 * effect canvas the preview draws. It subscribes to the shared frame store
 * rather than taking the frame as a prop, so a 30 fps stream never re-renders
 * the device list. The card decides whether a readout exists at all; a dark or
 * un-driven device does not mount this.
 */
export const DeviceLedStrip = memo(function DeviceLedStrip({ device, pick, fullscreen }: { device: LightingDevice; pick?: LedPick; fullscreen?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read through refs so a device refetch (new object identity, same values)
  // does not tear down and rebuild the subscription.
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  // Last frame delivered, so a pattern that decodes between frames can repaint
  // without waiting for the next one (there is none while lighting is held).
  const frameRef = useRef<LedFrame>(EMPTY_FRAME);

  // The picked pattern's own render. The effect grid has already fetched this
  // exact blob for its tile, so a pick costs no extra request.
  const isPattern = !!pick && !isStaticFill(pick.key);
  const thumbUrl = useEffectThumbnail(pick?.key ?? '', pick?.slot ?? 0, pick?.version ?? '0', !isPattern, true);
  const [pattern, setPattern] = useState<HTMLImageElement | null>(null);
  const patternRef = useRef<HTMLImageElement | null>(null);
  patternRef.current = pattern;

  useEffect(() => {
    if (!thumbUrl) {
      setPattern(null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setPattern(img); };
    img.src = thumbUrl;
    return () => { cancelled = true; };
  }, [thumbUrl]);

  useEffect(() => subscribeIdentify(() => {
    const el = ref.current;
    if (el) paint(el, deviceRef.current, frameRef.current, pickRef.current, patternRef.current, !!fullscreenRef.current);
  }), []);

  useEffect(() => subscribeLedFrame(frame => {
    frameRef.current = frame;
    const el = ref.current;
    if (el) paint(el, deviceRef.current, frame, pickRef.current, patternRef.current, !!fullscreenRef.current);
  }), []);

  // A pick or a decoded pattern lands between frames, so repaint immediately
  // instead of waiting for the next one.
  useEffect(() => {
    const el = ref.current;
    if (el) paint(el, deviceRef.current, frameRef.current, pick, pattern, !!fullscreen);
  }, [pick, pattern, fullscreen]);

  return <canvas ref={ref} className={styles.ledStrip} aria-hidden />;
});
