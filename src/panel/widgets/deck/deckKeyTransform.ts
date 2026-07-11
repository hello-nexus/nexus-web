// Per-model pixel transform a rendered key bitmap needs before it matches
// what the physical hardware expects on the wire. Pure pixel-array math (no
// canvas) so it is unit-testable without a real rendering context; see
// applyKeyTransform's tests for exact byte-level expectations.

export type DeckKeyTransform = 'none' | 'flipBoth' | 'mirrorXRot90';

// Gen-1 Mini family ships upside-down + mirrored relative to the drawn
// image (elgato-streamdeck crate src/info.rs ImageMode); everything else in
// the button-only catalog (§1 of the streamdeck plan) is flip-both, except
// the screenless Pedal. The Mini family needs a counterclockwise rotation
// (rotate90Ccw below), confirmed against a physical Mini.
const MIRROR_ROT90_MODELS = new Set(['mini', 'minimk2', 'minidiscord', 'minimk2module']);
const NO_TRANSFORM_MODELS = new Set(['pedal']);

function normalizeModelKey(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Resolve the wire transform for a model name from the /streamdeck/decks DTO. */
export function transformForModel(model: string): DeckKeyTransform {
  const key = normalizeModelKey(model);
  if (MIRROR_ROT90_MODELS.has(key)) return 'mirrorXRot90';
  if (NO_TRANSFORM_MODELS.has(key)) return 'none';
  return 'flipBoth';
}

/**
 * The /streamdeck/decks DTO's `transform` field is server-authoritative when
 * present; the model-name derivation is only a fallback for a service build
 * that predates the field.
 */
export function resolveDeckKeyTransform(model: string, explicit?: DeckKeyTransform): DeckKeyTransform {
  return explicit ?? transformForModel(model);
}

export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, row-major, top-down
}

function rotate180(img: RawImage): RawImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const pixels = width * height;
  for (let i = 0; i < pixels; i++) {
    const srcOffset = i * 4;
    const dstOffset = (pixels - 1 - i) * 4;
    out[dstOffset] = data[srcOffset];
    out[dstOffset + 1] = data[srcOffset + 1];
    out[dstOffset + 2] = data[srcOffset + 2];
    out[dstOffset + 3] = data[srcOffset + 3];
  }
  return { width, height, data: out };
}

function mirrorX(img: RawImage): RawImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const dstOffset = (y * width + (width - 1 - x)) * 4;
      out[dstOffset] = data[srcOffset];
      out[dstOffset + 1] = data[srcOffset + 1];
      out[dstOffset + 2] = data[srcOffset + 2];
      out[dstOffset + 3] = data[srcOffset + 3];
    }
  }
  return { width, height, data: out };
}

// Counterclockwise 90 degree rotation: (x, y) in the source lands at
// (y, width-1-x) in the destination, so the output is height x width.
function rotate90Ccw(img: RawImage): RawImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const outWidth = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const dstX = y;
      const dstY = width - 1 - x;
      const dstOffset = (dstY * outWidth + dstX) * 4;
      out[dstOffset] = data[srcOffset];
      out[dstOffset + 1] = data[srcOffset + 1];
      out[dstOffset + 2] = data[srcOffset + 2];
      out[dstOffset + 3] = data[srcOffset + 3];
    }
  }
  return { width: outWidth, height: width, data: out };
}

/** Apply a model's wire transform to a freshly-painted (unrotated) key bitmap. */
export function applyKeyTransform(img: RawImage, transform: DeckKeyTransform): RawImage {
  switch (transform) {
    case 'none': return img;
    case 'flipBoth': return rotate180(img);
    case 'mirrorXRot90': return rotate90Ccw(mirrorX(img));
  }
}
