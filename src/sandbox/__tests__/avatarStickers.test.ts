import { describe, it, expect } from 'vitest';
import {
  applyGesture, clampScale, isStickerSrcAllowed, newPlacement, normalizeDeg,
  parsePlacements, parseStickers, parseStream, resolveStickerSrc, stickerBasePx,
  STICKER_MAX_COUNT, STICKER_MAX_SCALE, STICKER_MIN_SCALE,
} from '../ui/avatarStickers';

const stickers = [{ id: 'star', src: '/apps-api/installed/com.x.y/asset/assets/stickers/star.png' }, { id: 'moon', src: 'data:image/png;base64,AAAA' }];
const at = (id: string, sticker = 'star', extra: Partial<{ x: number; y: number; s: number; r: number }> = {}) =>
  ({ id, sticker, x: 0.5, y: 0.5, s: 1, r: 0, ...extra });

describe('parseStream', () => {
  it('accepts only the allowlisted embed hosts', () => {
    expect(parseStream({ embed: 'https://www.youtube.com/embed/abc123def45?autoplay=1' })?.embed).toContain('/embed/abc123def45');
    expect(parseStream({ embed: 'https://www.youtube-nocookie.com/embed/abc123def45' })).not.toBeNull();
    expect(parseStream({ embed: 'https://evil.example/embed/abc123def45' })).toBeNull();
    expect(parseStream({ embed: 'http://www.youtube.com/embed/abc123def45' })).toBeNull();
    expect(parseStream({ embed: 'https://www.youtube.com/watch?v=abc123def45' })).toBeNull();
  });

  it('keeps only an https open URL and a non-empty label', () => {
    const s = parseStream({ embed: 'https://www.youtube.com/embed/abc123def45', open: 'javascript:alert(1)', label: '  ' });
    expect(s).toEqual({ embed: 'https://www.youtube.com/embed/abc123def45', open: undefined, label: undefined });
    expect(parseStream({ embed: 'https://www.youtube.com/embed/abc123def45', open: 'https://www.youtube.com/watch?v=a', label: 'Watch' }))
      .toMatchObject({ open: 'https://www.youtube.com/watch?v=a', label: 'Watch' });
  });

  it('rejects non-objects', () => {
    expect(parseStream(null)).toBeNull();
    expect(parseStream('https://www.youtube.com/embed/abc123def45')).toBeNull();
  });
});

describe('parseStickers', () => {
  it('keeps well-formed unique entries with allowed sources', () => {
    expect(parseStickers([
      ...stickers,
      { id: 'star', src: '/apps-api/installed/com.x.y/asset/assets/dup.png' },
      { id: 'bad id!', src: '/apps-api/installed/com.x.y/asset/x.png' },
      { id: 'https', src: 'https://cdn.example/x.png' },
      { id: 'http', src: 'http://cdn.example/x.png' },
      { id: 'asset', src: '/apps-api/installed/com.x.y/asset/assets/s.png' },
      { id: 'other', src: '/panel/anything.png' },
      null, 'str',
    ])).toEqual([...stickers, { id: 'asset', src: '/apps-api/installed/com.x.y/asset/assets/s.png' }]);
  });

  it('allows data:image, blob and app-asset routes only', () => {
    expect(isStickerSrcAllowed('https://a/b.png')).toBe(false);
    expect(isStickerSrcAllowed('data:image/webp;base64,AA')).toBe(true);
    expect(isStickerSrcAllowed('blob:http://localhost/x')).toBe(true);
    expect(isStickerSrcAllowed('/apps-api/installed/com.a.b/asset/x.png')).toBe(true);
    expect(isStickerSrcAllowed('data:text/html,<b>')).toBe(false);
    expect(isStickerSrcAllowed('/api/anything')).toBe(false);
  });

  it('attaches the session token to same-origin asset URLs only', () => {
    expect(resolveStickerSrc('/apps-api/installed/a/asset/x.png', 't k')).toBe('/apps-api/installed/a/asset/x.png?token=t%20k');
    expect(resolveStickerSrc('/apps-api/installed/a/asset/x.png?v=2', 'tok')).toBe('/apps-api/installed/a/asset/x.png?v=2&token=tok');
    expect(resolveStickerSrc('/apps-api/installed/a/asset/x.png', null)).toBe('/apps-api/installed/a/asset/x.png');
    expect(resolveStickerSrc('data:image/png;base64,AA', 'tok')).toBe('data:image/png;base64,AA');
  });
});

describe('parsePlacements', () => {
  it('drops unknown stickers, duplicates and malformed numbers, clamps the rest', () => {
    expect(parsePlacements([
      at('a'),
      at('a', 'moon'),
      at('b', 'nope'),
      at('c', 'moon', { x: 2, y: -1, s: 99, r: 725 }),
      { id: 'd', sticker: 'star', x: 'x', y: 0, s: 1, r: 0 },
      { id: 'e', sticker: 'star', x: 0, y: 0, s: Number.NaN, r: 0 },
    ], stickers)).toEqual([
      at('a'),
      at('c', 'moon', { x: 1, y: 0, s: STICKER_MAX_SCALE, r: 5 }),
    ]);
  });

  it('caps the count', () => {
    const many = Array.from({ length: STICKER_MAX_COUNT + 5 }, (_, i) => at(`p${i}`));
    expect(parsePlacements(many, stickers)).toHaveLength(STICKER_MAX_COUNT);
  });

  it('returns an empty set for a non-array', () => {
    expect(parsePlacements(undefined, stickers)).toEqual([]);
  });
});

describe('gesture geometry', () => {
  const w = 400;
  const h = 800;

  it('one finger translates by the drag, in stage fractions', () => {
    const start = { placement: at('a'), a: { x: 100, y: 100 } };
    const next = applyGesture(start, { x: 140, y: 20 }, undefined, w, h);
    expect(next.x).toBeCloseTo(0.6);
    expect(next.y).toBeCloseTo(0.4);
    expect(next.s).toBe(1);
    expect(next.r).toBe(0);
  });

  it('a drag cannot leave the stage', () => {
    const start = { placement: at('a'), a: { x: 0, y: 0 } };
    expect(applyGesture(start, { x: -5000, y: 5000 }, undefined, w, h)).toMatchObject({ x: 0, y: 1 });
  });

  it('two fingers scale by distance ratio and rotate by the angle change, from where they started', () => {
    const start = { placement: at('a'), a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
    // Same fingers, no movement: nothing changes on the first move.
    expect(applyGesture(start, { x: 100, y: 100 }, { x: 200, y: 100 }, w, h)).toEqual(at('a'));
    // Spread to twice the distance and twist a quarter turn.
    const next = applyGesture(start, { x: 150, y: 0 }, { x: 150, y: 200 }, w, h);
    expect(next.s).toBeCloseTo(2);
    expect(next.r).toBeCloseTo(90);
    // Midpoint drifted from (150,100) to (150,100): position holds.
    expect(next.x).toBeCloseTo(0.5);
    expect(next.y).toBeCloseTo(0.5);
  });

  it('two-finger scale is clamped to the allowed range', () => {
    const start = { placement: at('a'), a: { x: 100, y: 100 }, b: { x: 110, y: 100 } };
    expect(applyGesture(start, { x: 0, y: 100 }, { x: 400, y: 100 }, w, h).s).toBe(STICKER_MAX_SCALE);
    const wide = { placement: at('a'), a: { x: 0, y: 100 }, b: { x: 400, y: 100 } };
    expect(applyGesture(wide, { x: 199, y: 100 }, { x: 201, y: 100 }, w, h).s).toBe(STICKER_MIN_SCALE);
  });

  it('a zero-size stage leaves the placement untouched', () => {
    const start = { placement: at('a'), a: { x: 0, y: 0 } };
    expect(applyGesture(start, { x: 50, y: 50 }, undefined, 0, 0)).toEqual(at('a'));
  });

  it('helpers clamp and normalize', () => {
    expect(clampScale(0)).toBe(STICKER_MIN_SCALE);
    expect(clampScale(10)).toBe(STICKER_MAX_SCALE);
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-190)).toBe(170);
    expect(stickerBasePx(682, 2560)).toBe(Math.round(682 * 0.24));
    expect(stickerBasePx(10, 10)).toBe(24);
  });

  it('a new placement lands centred with a small tilt and a unique id', () => {
    const a = newPlacement('star', () => 0.999);
    const b = newPlacement('star', () => 0.001);
    expect(a).toMatchObject({ sticker: 'star', x: 0.5, y: 0.5, s: 1 });
    expect(Math.abs(a.r)).toBeLessThanOrEqual(12);
    expect(Math.abs(b.r)).toBeLessThanOrEqual(12);
    expect(a.id).not.toBe(b.id);
  });
});
