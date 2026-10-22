import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from '../../lib/i18n';
import { sizeToSpan } from '../engine/grid';
import { readCellMetrics } from '../engine/panelLayoutHelpers';
import type { FreeformCorner } from '../engine/freeformResize';
import type { PanelWidget } from '../types';
import styles from './FreeformResizeFrame.module.scss';

const CORNERS: readonly FreeformCorner[] = ['tl', 'tr', 'bl', 'br'];
const CORNER_LABEL_KEY: Record<FreeformCorner, string> = {
  tl: 'panel.freeform.handle.topLeft',
  tr: 'panel.freeform.handle.topRight',
  bl: 'panel.freeform.handle.bottomLeft',
  br: 'panel.freeform.handle.bottomRight',
};
// A corner press that travels less than this has not started a drag.
const DRAG_SLOP_PX = 4;

const ARROW_STEP: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface Press { gesture: FreeformCorner; x: number; y: number; moved: boolean; }

/** Resize chrome for the selected widget: a handle on each corner. Every other press falls through to the tile, so a body drag is the regular drag. */
export function FreeformResizeFrame({
  widget,
  label,
  room,
  touch = false,
  hover = false,
  onBegin,
  onUpdate,
  onStep,
  onEnd,
  onCancel,
  onExit,
}: {
  widget: PanelWidget;
  label: string;
  // Shown on a mouse hover rather than in resize mode: no halo around the tile.
  hover?: boolean;
  // Touch panels get larger grab areas.
  touch?: boolean;
  // Corners that can reach another span; the others take no drag.
  room: Record<FreeformCorner, boolean>;
  onBegin: () => boolean;
  onUpdate: (corner: FreeformCorner, dCols: number, dRows: number, lockRatio?: boolean) => void;
  // One keyboard step of a corner to the next snap span.
  onStep: (corner: FreeformCorner, stepCols: number, stepRows: number) => void;
  onEnd: () => void;
  // The frame unmounted mid-gesture: drop it without committing a draft built on a stale layout.
  onCancel: () => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const pressRef = useRef<Press | null>(null);
  const span = sizeToSpan(widget.size);

  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => () => {
    if (pressRef.current) {
      pressRef.current = null;
      onCancelRef.current();
    }
  }, []);

  const startPress = (gesture: FreeformCorner) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    if (!room[gesture]) return;
    if (!onBegin()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressRef.current = { gesture, x: event.clientX, y: event.clientY, moved: false };
  };

  const movePress = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    press.moved = true;
    const metrics = readCellMetrics(event.currentTarget.closest<HTMLElement>('[data-surface]'));
    if (!metrics) return;
    onUpdate(press.gesture, dx / (metrics.cellSize + metrics.gap), dy / (metrics.rowSize + metrics.gap), event.shiftKey);
  };

  const endPress = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    event.stopPropagation();
    onEnd();
  };

  const cancelPress = () => {
    if (!pressRef.current) return;
    pressRef.current = null;
    onEnd();
  };

  const keyStep = (gesture: FreeformCorner) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onExit();
      return;
    }
    const step = ARROW_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    if (!onBegin()) return;
    onStep(gesture, step[0], step[1]);
    onEnd();
  };

  const handlers = (gesture: FreeformCorner) => ({
    onPointerDown: startPress(gesture),
    onPointerMove: movePress,
    onPointerUp: endPress,
    onPointerCancel: cancelPress,
    onKeyDown: keyStep(gesture),
    // A grab never counts as a click on the tile or the panel behind it.
    onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
  });

  return (
    <div
      data-freeform-frame=""
      data-touch={touch ? 'true' : undefined}
      data-freeform-widget={widget.id}
      data-hover={hover ? 'true' : undefined}
      className={styles.frame}
      role="group"
      aria-label={t('panel.freeform.frame', { name: label })}
      style={{
        gridColumn: `${widget.col + 1} / span ${span.cols}`,
        gridRow: `${widget.row + 1} / span ${span.rows}`,
      } as CSSProperties}
    >
      {CORNERS.map(corner => (
        <button
          key={corner}
          type="button"
          className={styles.handle}
          data-corner={corner}
          data-room={room[corner] ? 'true' : 'false'}
          aria-label={t(CORNER_LABEL_KEY[corner], { name: label })}
          {...handlers(corner)}
        />
      ))}
    </div>
  );
}
