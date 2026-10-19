import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { moveRegion, resolveRegion, type SquareRegion } from './squareRegion';
import styles from './SquareRegionPicker.module.scss';

const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.05;

interface SquareRegionPickerProps {
  /** Width over height of the display the square sits on. */
  aspect: number;
  region: SquareRegion;
  ariaLabel: string;
  /** While dragging or stepping. */
  onPreview: (region: SquareRegion) => void;
  /** When the move ends. */
  onCommit: (region: SquareRegion) => void;
  /** The picture of the display, drawn under the square. */
  children?: ReactNode;
}

/** A display with a square drawn on it that can be dragged, or moved with the arrow keys. */
export function SquareRegionPicker({ aspect, region, ariaLabel, onPreview, onCommit, children }: SquareRegionPickerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: SquareRegion; latest: SquareRegion } | null>(null);
  const r = resolveRegion(region, aspect);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: region, latest: region };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = stageRef.current?.getBoundingClientRect();
    if (!drag || !box || box.width === 0 || box.height === 0) return;
    drag.latest = moveRegion(drag.origin, aspect, (e.clientX - drag.startX) / box.width, (e.clientY - drag.startY) / box.height);
    onPreview(drag.latest);
  };
  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) onCommit(drag.latest);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onCommit(moveRegion(region, aspect, d[0], d[1]));
  };

  return (
    <div ref={stageRef} className={styles.stage} data-settings-aside="true">
      <span className={styles.ratio} style={{ paddingBottom: `${100 / aspect}%` }} />
      <div className={styles.content}>{children}</div>
      <div
        className={styles.region}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(r.x * 100)}
        aria-valuetext={`${Math.round(r.x * 100)}, ${Math.round(r.y * 100)}`}
        style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
