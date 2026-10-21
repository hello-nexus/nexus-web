import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLedFrame, type LedFrame } from '../../../../lib/ledFrameStore';
import { identifyPhase, subscribeIdentify } from '../../../../lib/identifyFlash';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import { isStaticFill } from '../../../../types/lighting';
import { isPaletteKey } from '../../../../types/lightingPalette';
import { cardEnabledLedCount } from './zoneUtils';
import { type StackSlot } from '../../../../lib/stackSlots';
import { ledSample, sampleBox, sampleSpot } from '../../../../lib/ledSampling';
import { getScenePoints } from '../../../../lib/scene/scenePointsStore';
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

const stripCells = (device: LightingDevice) => Math.max(1, Math.min(cardEnabledLedCount(device) || 1, MAX_CELLS));

/** A strip cell held on a colour by the LED map. */
type LockedCell = readonly [cell: number, color: string];
const NO_LOCKED_CELLS: readonly LockedCell[] = [];

/** The cells LED-map colours land on, read off the service's position-binned columns. */
export function lockedCells(device: LightingDevice): readonly LockedCell[] {
  const columns = device.ledColorStrip;
  if (!columns?.length) return NO_LOCKED_CELLS;
  const cells = stripCells(device);
  const out: LockedCell[] = [];
  for (let c = 0; c < cells; c++) {
    // The x paintLook samples this cell at.
    const x = cells === 1 ? 0.5 : c / (cells - 1);
    const color = columns[Math.min(columns.length - 1, Math.floor(x * columns.length))];
    if (color) out.push([c, color]);
  }
  return out;
}

function paint(
  canvas: HTMLCanvasElement,
  device: LightingDevice,
  slot: StackSlot | null | undefined,
  frame: LedFrame,
  pick: LedPick | undefined,
  pattern: HTMLImageElement | null,
  fullscreen: boolean,
  pickOnly: boolean,
  locks: readonly LockedCell[],
): void {
  // The device's own bytes are what the hardware gets, so they are the strip
  // whenever the frame carries them; identify still outranks them.
  if (!(identifyPhase(device.id) === null && paintDeviceBytes(canvas, device, frame))) {
    paintLook(canvas, device, slot, frame, pick, pattern, fullscreen, pickOnly);
  }
  if (locks.length > 0 && identifyPhase(device.id) === null) paintLockedCells(canvas, device, locks);
}

/**
 * The device's own LED bytes from the output frame, before brightness. One
 * cell per strip cell, sampled along the LED order (a matrix device reads in
 * wiring order, which is the order the service and the hardware use). False
 * when the frame carries no bytes for it (no frame index, relay connection,
 * lighting off), so the caller falls back to sampling the canvas.
 */
function paintDeviceBytes(canvas: HTMLCanvasElement, device: LightingDevice, frame: LedFrame): boolean {
  if (device.frameIndex === undefined) return false;
  const bytes = frame.devices?.get(device.frameIndex);
  const leds = bytes ? Math.floor(bytes.length / 3) : 0;
  if (!bytes || leds === 0) return false;
  const cells = stripCells(device);
  if (canvas.width !== cells) canvas.width = cells;
  if (canvas.height !== 1) canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  // Same dimming the canvas path mirrors from the service.
  const scale = Math.min(1, Math.max(0, (device.brightness ?? 100) / 100));
  const img = ctx.createImageData(cells, 1);
  const d = img.data;
  for (let i = 0; i < cells; i++) {
    const led = cells === 1 ? 0 : Math.round((i * (leds - 1)) / (cells - 1));
    const o = i * 4;
    d[o] = bytes[led * 3] * scale;
    d[o + 1] = bytes[led * 3 + 1] * scale;
    d[o + 2] = bytes[led * 3 + 2] * scale;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

/** LED-map colours outrank every look, as on the hardware. */
function paintLockedCells(canvas: HTMLCanvasElement, device: LightingDevice, locks: readonly LockedCell[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.min(1, Math.max(0, (device.brightness ?? 100) / 100));
  for (const [c, color] of locks) {
    // Brightness scales toward black, as the service applies it.
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(c, 0, 1, 1);
    ctx.globalAlpha = scale;
    ctx.fillStyle = color;
    ctx.fillRect(c, 0, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function paintLook(
  canvas: HTMLCanvasElement,
  device: LightingDevice,
  slot: StackSlot | null | undefined,
  frame: LedFrame,
  pick: LedPick | undefined,
  pattern: HTMLImageElement | null,
  fullscreen: boolean,
  pickOnly: boolean,
): void {
  const cells = stripCells(device);
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

  // Static assigns per device, so there is no shared canvas to fall back to:
  // a device with no assignment of its own is showing nothing in particular,
  // and sampling the effect frame would state a colour it is not wearing.
  const { pixels, w, h } = frame;
  if (pickOnly || !pixels || w === 0 || h === 0) {
    ctx.clearRect(0, 0, cells, 1);
    return;
  }

  const img = ctx.createImageData(cells, 1);
  const d = img.data;
  // In the 3D view the hardware samples where the camera puts each LED, so the readout does too.
  const scenePts = fullscreen ? undefined : getScenePoints(device.id);
  if (scenePts && scenePts.length >= 2) {
    const leds = scenePts.length / 2;
    for (let i = 0; i < cells; i++) {
      const led = cells === 1 ? 0 : Math.round((i * (leds - 1)) / (cells - 1));
      const cx = scenePts[led * 2];
      const cy = scenePts[led * 2 + 1];
      const o = i * 4;
      d[o + 3] = 255;
      if (Number.isNaN(cx)) continue;
      // The same spot mean the engine reads at an LED.
      const [r, g, b] = sampleSpot({ pixels, w, h }, { sx: (cx / CW) * w, sy: (cy / CH) * h, halfW: Infinity, halfH: Infinity });
      d[o] = r * scale;
      d[o + 1] = g * scale;
      d[o + 2] = b * scale;
    }
    ctx.putImageData(img, 0, 0);
    return;
  }
  // Static evaluates every device as if its frame filled the canvas, so a
  // pattern reads end to end on each device (a box mean over its slice of it).
  // Other modes read the spot at each LED along the centerline of the device's
  // part of its frame (its stack slot, else the whole frame), turned about the
  // frame center - the positions and the read the engine uses.
  const leds = Math.max(1, device.ledCount);
  const frameView = { pixels, w, h };
  for (let i = 0; i < cells; i++) {
    const led = cells === 1 ? 0 : Math.round((i * (leds - 1)) / (cells - 1));
    const at = ledSample(device, led, leds, w, h, { fullFrame: fullscreen, slot });
    const [r, g, b] = fullscreen ? sampleBox(frameView, at) : sampleSpot(frameView, at);
    const o = i * 4;
    d[o] = r * scale;
    d[o + 1] = g * scale;
    d[o + 2] = b * scale;
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
export const DeviceLedStrip = memo(function DeviceLedStrip({ device, slot, pick, fullscreen, pickOnly }: { device: LightingDevice; slot?: StackSlot | null; pick?: LedPick; fullscreen?: boolean; pickOnly?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read through refs so a device refetch (new object identity, same values)
  // does not tear down and rebuild the subscription.
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  const pickOnlyRef = useRef(pickOnly);
  pickOnlyRef.current = pickOnly;
  // Last frame delivered, so a pattern that decodes between frames can repaint
  // without waiting for the next one (there is none while lighting is held).
  const frameRef = useRef<LedFrame>(EMPTY_FRAME);
  // Worked out per device refetch, so a frame only fills the cells it lists.
  const locks = useMemo(() => lockedCells(device), [device]);
  const locksRef = useRef(locks);
  locksRef.current = locks;

  // The picked pattern's own render. The effect grid has already fetched this
  // exact blob for its tile, so a pick costs no extra request.
  // Palette picks and flat fills carry their colour outright; only a pattern
  // needs its rendered thumbnail to read from.
  const isPattern = !!pick && !isStaticFill(pick.key) && !isPaletteKey(pick.key);
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
    if (el) paint(el, deviceRef.current, slotRef.current, frameRef.current, pickRef.current, patternRef.current, !!fullscreenRef.current, !!pickOnlyRef.current, locksRef.current);
  }), []);

  useEffect(() => subscribeLedFrame(frame => {
    frameRef.current = frame;
    const el = ref.current;
    if (el) paint(el, deviceRef.current, slotRef.current, frame, pickRef.current, patternRef.current, !!fullscreenRef.current, !!pickOnlyRef.current, locksRef.current);
  }), []);

  // A pick or a decoded pattern lands between frames, so repaint immediately
  // instead of waiting for the next one.
  // brightness is in the deps because it scales the paint: with no frames
  // arriving (a per-device surface) nothing else would ever repaint it.
  useEffect(() => {
    const el = ref.current;
    if (el) paint(el, deviceRef.current, slot, frameRef.current, pick, pattern, !!fullscreen, !!pickOnly, locks);
  }, [pick, pattern, fullscreen, pickOnly, device.brightness, slot, locks]);

  return <canvas ref={ref} className={styles.ledStrip} aria-hidden />;
});
