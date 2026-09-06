// Sticker layer of the `ui-avatar` immersive view: the placed stickers drawn
// over the 3D stage, and - in sticker mode - the drag / pinch / twist / remove
// gestures that edit them. Outside sticker mode the layer is pointer-inert so
// orbit drags still reach the canvas underneath.
//
// Gesture geometry is in avatarStickers.ts; this file only owns pointer
// bookkeeping and the DOM. Pointers are tracked on the LAYER (not per
// sticker) so a second finger landing anywhere on the stage joins the
// active sticker's gesture, which is how a pinch on a small sticker actually
// happens on a touch panel.

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { getTokenSync } from '../../api/auth';
import {
  applyGesture, resolveStickerSrc, stickerBasePx,
  type AvatarSticker, type GestureStart, type Point, type StickerPlacement,
} from './avatarStickers';

interface AvatarStickerLayerProps {
  stickers: AvatarSticker[];
  placements: StickerPlacement[];
  editing: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The whole set after a gesture settles or a sticker is removed. */
  onChange: (next: StickerPlacement[]) => void;
}

interface ActiveGesture {
  id: string;
  start: GestureStart;
  a: { pointerId: number; at: Point };
  b: { pointerId: number; at: Point } | null;
  /** Stage box at gesture start, in viewport px (the immersive body is CSS-scaled). */
  w: number;
  h: number;
  live: StickerPlacement;
}

const layerBase: CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 2,
};
const imgStyle: CSSProperties = {
  width: '100%', height: '100%', objectFit: 'contain', display: 'block',
  userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none',
};

export function AvatarStickerLayer({ stickers, placements, editing, selectedId, onSelect, onChange }: AvatarStickerLayerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const [live, setLive] = useState<StickerPlacement | null>(null);
  const [basePx, setBasePx] = useState(0);
  const token = getTokenSync();
  const srcById = new Map(stickers.map((s) => [s.id, resolveStickerSrc(s.src, token)]));

  // Base sticker size follows the stage box in the layer's own CSS px (the
  // transform-scaled immersive body reports the same numbers to layout).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setBasePx(stickerBasePx(el.clientWidth, el.clientHeight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Leaving sticker mode mid-gesture drops the gesture where it is.
  useEffect(() => {
    if (editing) return;
    gestureRef.current = null;
    setLive(null);
  }, [editing]);

  const pointOf = useCallback((e: ReactPointerEvent): Point => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    const at = pointOf(e);
    const g = gestureRef.current;
    if (g) {
      // Second finger joins the running gesture; the pinch/twist starts from
      // the placement as it is NOW, so nothing jumps on the first move.
      if (g.b || e.pointerId === g.a.pointerId) return;
      g.start = { placement: g.live, a: g.a.at, b: at };
      g.b = { pointerId: e.pointerId, at };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      e.preventDefault();
      return;
    }
    const hit = (e.target as Element | null)?.closest?.('[data-sticker-id]') as HTMLElement | null;
    const id = hit?.dataset.stickerId;
    const placement = id ? placements.find((p) => p.id === id) : undefined;
    if (!placement) {
      onSelect(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    gestureRef.current = {
      id: placement.id,
      start: { placement, a: at },
      a: { pointerId: e.pointerId, at },
      b: null,
      w: r.width,
      h: r.height,
      live: placement,
    };
    onSelect(placement.id);
    setLive(placement);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  }, [editing, placements, pointOf, onSelect]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const at = pointOf(e);
    if (e.pointerId === g.a.pointerId) g.a = { ...g.a, at };
    else if (g.b && e.pointerId === g.b.pointerId) g.b = { ...g.b, at };
    else return;
    g.live = applyGesture(g.start, g.a.at, g.b?.at, g.w, g.h);
    setLive(g.live);
    e.preventDefault();
  }, [pointOf]);

  const endPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const isA = e.pointerId === g.a.pointerId;
    const isB = g.b !== null && e.pointerId === g.b.pointerId;
    if (!isA && !isB) return;
    if (g.b) {
      // One finger lifted: continue as a plain drag from the current state.
      const remaining = isA ? g.b : g.a;
      g.a = remaining;
      g.b = null;
      g.start = { placement: g.live, a: remaining.at };
      return;
    }
    gestureRef.current = null;
    setLive(null);
    onChange(placements.map((p) => (p.id === g.id ? g.live : p)));
  }, [placements, onChange]);

  const remove = useCallback((id: string) => {
    gestureRef.current = null;
    setLive(null);
    onSelect(null);
    onChange(placements.filter((p) => p.id !== id));
  }, [placements, onChange, onSelect]);

  // Always mounted (even empty) so the size measurement above is live by the
  // time sticker mode adds the first placement; the empty layer is
  // pointer-inert and paints nothing.
  const layerStyle: CSSProperties = {
    ...layerBase,
    pointerEvents: editing ? 'auto' : 'none',
    touchAction: editing ? 'none' : undefined,
  };

  return (
    <div
      ref={rootRef}
      style={layerStyle}
      data-avatar-stickers={editing ? 'editing' : 'view'}
      data-panel-no-sheet-swipe={editing ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {placements.map((stored) => {
        const p = live && live.id === stored.id ? live : stored;
        const src = srcById.get(p.sticker);
        if (!src || basePx === 0) return null;
        const selected = editing && selectedId === p.id;
        const style: CSSProperties = {
          position: 'absolute',
          left: `${p.x * 100}%`,
          top: `${p.y * 100}%`,
          width: basePx,
          height: basePx,
          marginLeft: -basePx / 2,
          marginTop: -basePx / 2,
          transform: `rotate(${p.r}deg) scale(${p.s})`,
          pointerEvents: editing ? 'auto' : 'none',
          touchAction: 'none',
          cursor: editing ? 'grab' : undefined,
          outline: selected ? '2px dashed rgba(255,255,255,0.75)' : undefined,
          outlineOffset: selected ? 4 : undefined,
          borderRadius: 6,
          filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
        };
        return (
          <div key={p.id} data-sticker-id={p.id} style={style}>
            <img src={src} alt="" draggable={false} style={imgStyle} />
            {selected && (
              <button
                type="button"
                aria-label={t('sdk.avatar.stickerRemove')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => remove(p.id)}
                style={{
                  position: 'absolute', top: -12, right: -12, width: 28, height: 28,
                  borderRadius: 14, border: 0, padding: 0,
                  background: 'var(--danger, #e5484d)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  // Counter the sticker's own scale so the target stays finger-sized.
                  transform: `scale(${1 / p.s})`, transformOrigin: 'center',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
