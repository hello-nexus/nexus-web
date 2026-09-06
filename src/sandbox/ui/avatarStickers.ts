// Pure helpers for the `ui-avatar` immersive extras: coercing the worker's
// `stream` / `stickers` / `placements` props into trusted shapes, resolving a
// sticker's image URL, and the pointer-gesture geometry behind sticker mode.
// No React/DOM so all of it is unit testable.

export interface AvatarStream { embed: string; open?: string; label?: string }
export interface AvatarSticker { id: string; src: string }
/** Centre `x`/`y` as 0..1 of the stage box, `s` a multiplier of the base
 *  sticker size, `r` rotation in degrees. */
export interface StickerPlacement { id: string; sticker: string; x: number; y: number; s: number; r: number }

/** Stage fraction (of the shorter side) one unscaled sticker spans. */
export const STICKER_BASE_FRACTION = 0.24;
export const STICKER_MIN_SCALE = 0.35;
export const STICKER_MAX_SCALE = 3;
/** Hard cap on placed stickers, so a runaway worker cannot flood the stage. */
export const STICKER_MAX_COUNT = 40;

// Embeds are iframes into a third-party player, so only known player hosts
// are accepted - the service CSP frame-src mirrors this list.
const EMBED_HOSTS = ['https://www.youtube.com/embed/', 'https://www.youtube-nocookie.com/embed/'];
const HTTPS = /^https:\/\/[^\s/]+/i;

export function parseStream(raw: unknown): AvatarStream | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const embed = typeof o.embed === 'string' ? o.embed.trim() : '';
  const host = EMBED_HOSTS.find((h) => embed.startsWith(h));
  if (!host || embed.length <= host.length) return null;
  const open = typeof o.open === 'string' && HTTPS.test(o.open) ? o.open : undefined;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : undefined;
  return { embed, open, label };
}

const STICKER_ID = /^[A-Za-z0-9_.-]{1,64}$/;

export function parseStickers(raw: unknown): AvatarSticker[] {
  if (!Array.isArray(raw)) return [];
  const out: AvatarSticker[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, src } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !STICKER_ID.test(id) || seen.has(id)) continue;
    if (typeof src !== 'string' || !isStickerSrcAllowed(src)) continue;
    seen.add(id);
    out.push({ id, src });
  }
  return out;
}

/** data:image, blob and same-origin app-asset routes only: the service CSP
 *  img-src admits no third-party host, so an https sticker would render blank
 *  on every service-served surface. */
export function isStickerSrcAllowed(src: string): boolean {
  return /^(data:image\/|blob:)/i.test(src) || src.startsWith('/apps-api/installed/');
}

/** An <img> cannot carry a Bearer header, so a same-origin asset URL takes the
 *  session token on the query string - the same scheme the app icon uses. */
export function resolveStickerSrc(src: string, token: string | null): string {
  if (!src.startsWith('/')) return src;
  if (!token) return src;
  return `${src}${src.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function clampScale(s: number): number {
  return clamp(s, STICKER_MIN_SCALE, STICKER_MAX_SCALE);
}

/** Drops malformed entries, unknown stickers and duplicates; clamps the rest
 *  back onto the stage so a stale persisted set can never place one offscreen. */
export function parsePlacements(raw: unknown, stickers: AvatarSticker[]): StickerPlacement[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(stickers.map((s) => s.id));
  const seen = new Set<string>();
  const out: StickerPlacement[] = [];
  for (const item of raw) {
    if (out.length >= STICKER_MAX_COUNT) break;
    if (!item || typeof item !== 'object') continue;
    const { id, sticker, x, y, s, r } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !STICKER_ID.test(id) || seen.has(id)) continue;
    if (typeof sticker !== 'string' || !known.has(sticker)) continue;
    if (!finite(x) || !finite(y) || !finite(s) || !finite(r)) continue;
    seen.add(id);
    out.push({ id, sticker, x: clamp(x, 0, 1), y: clamp(y, 0, 1), s: clampScale(s), r: normalizeDeg(r) });
  }
  return out;
}

export function normalizeDeg(r: number): number {
  const m = r % 360;
  return m > 180 ? m - 360 : m <= -180 ? m + 360 : m;
}

export interface Point { x: number; y: number }

/** Gesture start snapshot: the placement plus the finger(s) that grabbed it. */
export interface GestureStart {
  placement: StickerPlacement;
  a: Point;
  b?: Point;
}

/**
 * The placement a gesture has dragged/pinched/twisted to. One finger
 * translates; two fingers scale by the change in their distance, rotate by
 * the change in their angle, and translate by the drift of their midpoint,
 * all relative to where the gesture started so nothing jumps on the first
 * move. Coordinates are stage pixels; `w`/`h` is the stage box.
 */
export function applyGesture(start: GestureStart, a: Point, b: Point | undefined, w: number, h: number): StickerPlacement {
  const p0 = start.placement;
  if (w <= 0 || h <= 0) return p0;
  if (!start.b || !b) {
    const dx = a.x - start.a.x;
    const dy = a.y - start.a.y;
    return { ...p0, x: clamp(p0.x + dx / w, 0, 1), y: clamp(p0.y + dy / h, 0, 1) };
  }
  const d0 = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  const d1 = Math.hypot(b.x - a.x, b.y - a.y);
  const ang0 = Math.atan2(start.b.y - start.a.y, start.b.x - start.a.x);
  const ang1 = Math.atan2(b.y - a.y, b.x - a.x);
  const mid0 = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const s = d0 > 0 ? clampScale(p0.s * (d1 / d0)) : p0.s;
  const r = normalizeDeg(p0.r + ((ang1 - ang0) * 180) / Math.PI);
  return {
    ...p0,
    x: clamp(p0.x + (mid1.x - mid0.x) / w, 0, 1),
    y: clamp(p0.y + (mid1.y - mid0.y) / h, 0, 1),
    s,
    r,
  };
}

/** Where a freshly added sticker lands: stage centre, unscaled, with a small
 *  random tilt so a pile of the same sticker reads as a pile. */
export function newPlacement(sticker: string, rand: () => number = Math.random): StickerPlacement {
  const id = `st-${Date.now().toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`;
  return { id, sticker, x: 0.5, y: 0.5, s: 1, r: Math.round((rand() * 2 - 1) * 12) };
}

export function stickerBasePx(w: number, h: number): number {
  return Math.max(24, Math.round(Math.min(w, h) * STICKER_BASE_FRACTION));
}
