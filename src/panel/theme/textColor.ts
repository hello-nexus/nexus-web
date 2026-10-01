import { useEffect, type CSSProperties, type RefObject } from 'react';
import { shaderDrewThisFrame } from '../../hooks/useShaderRenderer';

export const TEXT_COLOR_MODES = ['adaptive', 'theme', 'custom'] as const;
export type TextColorMode = (typeof TEXT_COLOR_MODES)[number];
export const DEFAULT_CUSTOM_TEXT_COLOR = '#ffffff';

export function normalizeTextColorMode(value?: string | null): TextColorMode {
  return TEXT_COLOR_MODES.includes(value as TextColorMode) ? value as TextColorMode : 'adaptive';
}

/**
 * Widget-grid variables for 'custom' mode: every text tier takes the colour,
 * and --panel-ink-accent(-shadow) repaints the widget text that is otherwise accent.
 */
export function customTextVars(hex: string): CSSProperties {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim()) ?? /^#?([0-9a-f]{6})$/i.exec(DEFAULT_CUSTOM_TEXT_COLOR)!;
  const full = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  const color = `#${full.toLowerCase()}`;
  return {
    '--text': color,
    '--text-dim': `rgba(${r}, ${g}, ${b}, 0.6)`,
    '--separator': `rgba(${r}, ${g}, ${b}, 0.12)`,
    '--gauge-track': `rgba(${r}, ${g}, ${b}, 0.2)`,
    '--panel-ink-accent': color,
    '--panel-ink-accent-shadow': `rgba(${r}, ${g}, ${b}, 0.45)`,
  } as CSSProperties;
}

/** The text a widget needs: 'light' is white ink, 'dark' is black. */
export type Ink = 'light' | 'dark';

type Rgba = [number, number, number, number];

export interface SampleGrid {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

// White and black text have equal WCAG contrast against this luminance.
const CROSSOVER = 0.179;
// A moving background hovers around the crossover; the band stops the ink flickering.
const HYSTERESIS = 0.04;
const GRID_COLUMNS = 32;
const TICK_MS = 1000;
// Frames a tick waits for a paced shader to draw before it skips; a covered shader never draws.
const SHADER_WAIT_FRAMES = 30;

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** WCAG relative luminance of an sRGB colour, integer channels 0-255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

export function pickInk(luminance: number, previous: Ink | null): Ink {
  const threshold = previous === 'light'
    ? CROSSOVER + HYSTERESIS
    : previous === 'dark' ? CROSSOVER - HYSTERESIS : CROSSOVER;
  return luminance > threshold ? 'dark' : 'light';
}

/**
 * Mean luminance of a region of the grid (cell units, clamped) with the card's
 * translucent fill composited over it. Null when the region misses the grid.
 */
export function regionLuminance(
  grid: SampleGrid,
  x0: number, y0: number, x1: number, y1: number,
  fill: Rgba,
): number | null {
  const cx0 = Math.max(0, Math.floor(x0));
  const cy0 = Math.max(0, Math.floor(y0));
  const cx1 = Math.min(grid.width, Math.ceil(x1));
  const cy1 = Math.min(grid.height, Math.ceil(y1));
  if (cx1 <= cx0 || cy1 <= cy0) return null;
  const [fr, fg, fb, fa] = fill;
  const keep = 1 - fa;
  let sum = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      const i = (y * grid.width + x) * 4;
      sum += relativeLuminance(
        Math.round(fr * fa + grid.data[i] * keep),
        Math.round(fg * fa + grid.data[i + 1] * keep),
        Math.round(fb * fa + grid.data[i + 2] * keep),
      );
    }
  }
  return sum / ((cx1 - cx0) * (cy1 - cy0));
}

type BackdropMedia = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

interface Box { x: number; y: number; w: number; h: number }

interface LayerDraw {
  alpha: number;
  box: Box;
  fill?: string;
  dest?: Box;
  bitmap?: Promise<ImageBitmap | null>;
}

function effectiveOpacity(el: HTMLElement, root: HTMLElement): number {
  let alpha = 1;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
    alpha *= Number(getComputedStyle(node).opacity);
  }
  return alpha;
}

function mediaKey(media: BackdropMedia | null): string {
  if (media instanceof HTMLImageElement) return `${media.currentSrc}:${media.naturalWidth}`;
  return '';
}

// Source crop and destination box for the media the way its object-fit paints it.
function placeMedia(media: BackdropMedia, box: Box): { src: Box; dest: Box } | null {
  if (media instanceof HTMLCanvasElement) {
    return media.width && media.height ? { src: { x: 0, y: 0, w: media.width, h: media.height }, dest: box } : null;
  }
  if (media instanceof HTMLVideoElement && media.readyState < 2) return null;
  const nw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const nh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!nw || !nh) return null;
  const full = { x: 0, y: 0, w: nw, h: nh };
  const fit = getComputedStyle(media).objectFit;
  if (fit === 'fill') return { src: full, dest: box };
  if (fit === 'contain') {
    const scale = Math.min(box.w / nw, box.h / nh);
    const w = nw * scale;
    const h = nh * scale;
    return { src: full, dest: { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h } };
  }
  const scale = Math.max(box.w / nw, box.h / nh);
  const w = box.w / scale;
  const h = box.h / scale;
  return { src: { x: (nw - w) / 2, y: (nh - h) / 2, w, h }, dest: box };
}

class BackdropSampler {
  private ctx: CanvasRenderingContext2D | null = null;
  private colorCtx: CanvasRenderingContext2D | null = null;
  private colors = new Map<string, Rgba>();
  private stillKey = '';
  private stillGrid: SampleGrid | null = null;
  private taintedKey = '';

  /** Any CSS colour the engine understands, as RGBA; unparseable reads transparent. */
  color(css: string): Rgba {
    const hit = this.colors.get(css);
    if (hit) return hit;
    if (!this.colorCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      this.colorCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.colorCtx;
    if (!ctx) return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const rgba: Rgba = [d[0], d[1], d[2], d[3] / 255];
    this.colors.set(css, rgba);
    return rgba;
  }

  /**
   * The panel's background rasterized to the sample grid, or null when it
   * cannot be read. Must start inside a frame callback: createImageBitmap
   * snapshots a WebGL canvas when called, and outside the frame that drew it
   * the canvas reads back cleared.
   */
  async grid(root: HTMLElement, rect: DOMRect): Promise<SampleGrid | null> {
    const base = getComputedStyle(root).backgroundColor;
    // See-through: the desktop behind the window is not readable from the page.
    if (this.color(base)[3] === 0) return null;
    const width = GRID_COLUMNS;
    const height = Math.max(1, Math.min(GRID_COLUMNS * 4, Math.round(GRID_COLUMNS * rect.height / rect.width)));
    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-panel-bg-layer]'), el => {
      const media = el.querySelector<BackdropMedia>('img, video, canvas');
      return { el, alpha: effectiveOpacity(el, root), media, fill: media ? '' : getComputedStyle(el).backgroundColor };
    }).filter(layer => layer.alpha > 0);
    const moving = layers.some(l => l.media instanceof HTMLVideoElement || l.media instanceof HTMLCanvasElement);
    const key = [base, width, height, ...layers.map(l => `${l.alpha}|${mediaKey(l.media)}|${l.fill}`)].join(';');
    if (!moving && key === this.stillKey && this.stillGrid) return this.stillGrid;
    if (key === this.taintedKey) return null;

    const sx = width / rect.width;
    const sy = height / rect.height;
    const draws = layers.map(({ el, alpha, media, fill }): LayerDraw | null => {
      const r = el.getBoundingClientRect();
      const box = { x: (r.left - rect.left) * sx, y: (r.top - rect.top) * sy, w: r.width * sx, h: r.height * sy };
      if (!media) return { alpha, box, fill };
      const place = placeMedia(media, box);
      if (!place) return null;
      const { src, dest } = place;
      // Resizing inside createImageBitmap keeps a video frame's full-size readback off the main thread.
      const bitmap = createImageBitmap(media, src.x, src.y, src.w, src.h, {
        resizeWidth: Math.max(1, Math.round(dest.w)),
        resizeHeight: Math.max(1, Math.round(dest.h)),
        resizeQuality: 'pixelated',
      }).catch(() => null);
      return { alpha, box, dest, bitmap };
    });
    const bitmaps = await Promise.all(draws.map(d => d?.bitmap ?? null));

    if (!this.ctx) {
      this.ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.ctx;
    if (!ctx) {
      bitmaps.forEach(b => b?.close());
      return null;
    }
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    draws.forEach((draw, i) => {
      if (!draw) return;
      ctx.globalAlpha = draw.alpha;
      const bitmap = bitmaps[i];
      if (draw.fill) {
        ctx.fillStyle = draw.fill;
        ctx.fillRect(draw.box.x, draw.box.y, draw.box.w, draw.box.h);
      } else if (bitmap && draw.dest) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(draw.box.x, draw.box.y, draw.box.w, draw.box.h);
        ctx.clip();
        ctx.drawImage(bitmap, draw.dest.x, draw.dest.y, draw.dest.w, draw.dest.h);
        ctx.restore();
      }
      bitmap?.close();
    });
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, width, height).data;
    } catch {
      // Cross-origin media tainted the canvas for good; start clean, and skip this backdrop until it changes.
      this.ctx = null;
      this.taintedKey = key;
      return null;
    }
    const grid = { data, width, height };
    this.stillKey = moving ? '' : key;
    this.stillGrid = moving ? null : grid;
    return grid;
  }
}

function clearInks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-ink]').forEach(el => { delete el.dataset.ink; });
}

function applyInks(root: HTMLElement, grid: SampleGrid | null, sampler: BackdropSampler) {
  if (!grid) {
    clearInks(root);
    return;
  }
  const rect = root.getBoundingClientRect();
  const sx = grid.width / rect.width;
  const sy = grid.height / rect.height;
  root.querySelectorAll<HTMLElement>('[data-panel-grid] .panel-card').forEach(card => {
    // The card's parent also holds its label strip, which sits on the same backdrop.
    const host = card.parentElement;
    if (!host) return;
    const r = card.getBoundingClientRect();
    // Cards on the pager's other pages sit whole panel widths away; fold them
    // back so their ink is ready before a swipe lands.
    let left = r.left - rect.left;
    if (left >= rect.width || left + r.width <= 0) left -= Math.floor(left / rect.width) * rect.width;
    const top = r.top - rect.top;
    const luminance = regionLuminance(
      grid,
      left * sx, top * sy, (left + r.width) * sx, (top + r.height) * sy,
      sampler.color(getComputedStyle(card).backgroundColor),
    );
    if (luminance == null) return;
    const prev = host.dataset.ink;
    const ink = pickInk(luminance, prev === 'light' || prev === 'dark' ? prev : null);
    if (prev !== ink) host.dataset.ink = ink;
  });
}

/** Stamps each widget with the ink that reads best on the background behind it, once a second. */
export function useAutoTextColor(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return undefined;
    const sampler = new BackdropSampler();
    let frame = 0;
    let busy = false;
    let stopped = false;
    let waited = 0;
    const tick = (ts: number) => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      if (busy || rect.width < 1 || rect.height < 1) return;
      const shader = root.querySelector<HTMLCanvasElement>('[data-panel-bg-layer][data-ready="true"] canvas');
      if (shader && !shaderDrewThisFrame(shader, ts)) {
        if (++waited < SHADER_WAIT_FRAMES) frame = requestAnimationFrame(tick);
        else waited = 0;
        return;
      }
      waited = 0;
      busy = true;
      void sampler.grid(root, rect).then(grid => {
        if (!stopped) applyInks(root, grid, sampler);
      }).finally(() => { busy = false; });
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => {
      if (!frame) frame = requestAnimationFrame(tick);
    }, TICK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      cancelAnimationFrame(frame);
      clearInks(root);
    };
  }, [rootRef, enabled]);
}
