import { useEffect, useRef } from 'react';

/** Linear 0..1 channels, ready for a vec3 uniform. */
export type PaletteColor = [number, number, number];

export const LIVE_PALETTE_SIZE = 4;

// Art is decoded into this square before bucketing: enough samples for four
// colours while keeping getImageData trivial on the Q-series.
const SAMPLE_EDGE = 32;
const MIN_DISTANCE = 0.2;

function luminance([r, g, b]: PaletteColor): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distance(a: PaletteColor, b: PaletteColor): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function shade([r, g, b]: PaletteColor, k: number): PaletteColor {
  return k >= 1
    ? [r + (1 - r) * (k - 1), g + (1 - g) * (k - 1), b + (1 - b) * (k - 1)]
    : [r * k, g * k, b * k];
}

/**
 * Picks `count` distinct colours from RGBA pixels, darkest first. Buckets are
 * scored by coverage weighted toward saturation, so a small vivid accent beats
 * a large grey field; near-black and near-white only win when nothing else
 * exists. Returns [] for an image with no opaque pixels.
 */
export function extractArtPalette(data: ArrayLike<number>, count = LIVE_PALETTE_SIZE): PaletteColor[] {
  const sums = new Map<number, [number, number, number, number]>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const sum = sums.get(key);
    if (sum) { sum[0] += r; sum[1] += g; sum[2] += b; sum[3] += 1; }
    else sums.set(key, [r, g, b, 1]);
  }

  const scored = [...sums.values()].map(([r, g, b, n]) => {
    const color: PaletteColor = [r / n / 255, g / n / 255, b / n / 255];
    const max = Math.max(...color);
    const min = Math.min(...color);
    const saturation = max > 0 ? (max - min) / max : 0;
    const extreme = max < 0.1 || min > 0.9 ? 0.15 : 1;
    return { color, score: n * (0.15 + saturation) ** 2 * extreme };
  }).sort((a, b) => b.score - a.score);

  const picked: PaletteColor[] = [];
  for (const { color } of scored) {
    if (picked.every(p => distance(p, color) >= MIN_DISTANCE)) picked.push(color);
    if (picked.length === count) break;
  }
  if (picked.length === 0) return [];

  // Monochrome art: fill the missing stops with shades of what was found.
  const seed = picked[0];
  const shades = [0.35, 1.45, 0.65, 1.2];
  for (let i = 0; picked.length < count; i++) picked.push(shade(seed, shades[i % shades.length]));

  return picked.sort((a, b) => luminance(a) - luminance(b));
}

function decodePalette(url: string): Promise<PaletteColor[]> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_EDGE;
      canvas.height = SAMPLE_EDGE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }
      ctx.drawImage(img, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
      try {
        resolve(extractArtPalette(ctx.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

// The effects were tuned against a saturated, full-brightness rainbow, so each
// stop keeps the art's hue but is lifted to full value and a stronger
// saturation; pastel art otherwise renders as beige.
export function vividStop([r, g, b]: PaletteColor): PaletteColor {
  const max = Math.max(r, g, b);
  if (max < 0.02) return [0.5, 0.5, 0.5];
  const [nr, ng, nb] = [r / max, g / max, b / max];
  const min = Math.min(nr, ng, nb);
  const sat = 1 - min;
  if (sat < 0.02) return [nr, ng, nb];
  const floor = 1 - Math.min(1, sat * 1.5 + 0.1);
  const lift = (c: number) => floor + ((c - min) / sat) * (1 - floor);
  return [lift(nr), lift(ng), lift(nb)];
}

/**
 * Album-art palette as the shader renderer's `paletteRef`. `artUrl` null means
 * the current track's art is still loading: the previous track's stops hold, so
 * the renderer eases track to track. An empty string means the track has no
 * art, and the preset colours apply.
 */
export function useArtPaletteStops(artUrl: string | null): React.RefObject<Float32Array | null> {
  const ref = useRef<Float32Array | null>(null);
  useEffect(() => {
    if (artUrl === null) return;
    if (!artUrl) { ref.current = null; return; }
    let cancelled = false;
    decodePalette(artUrl).then(colors => {
      if (!cancelled) ref.current = colors.length ? Float32Array.from(colors.map(vividStop).flat()) : null;
    });
    return () => { cancelled = true; };
  }, [artUrl]);
  return ref;
}
