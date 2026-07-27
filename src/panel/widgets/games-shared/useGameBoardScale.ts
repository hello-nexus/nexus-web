import { useLayoutEffect, useState } from 'react';
import { computeGameCellSize } from './gameBoardScale';

/**
 * Measured cell size (px) that fits a `cols` x `rows` logical game grid
 * inside its container, recomputed on every resize via ResizeObserver.
 * `clientWidth`/`clientHeight` are layout-box sizes, unaffected by the
 * `--panel-scale` CSS transform the immersive overlay body applies - unlike
 * `getBoundingClientRect`, which would read back a transform-scaled (and
 * therefore wrong) box here (see CoolingImmersiveStatus for the same trap).
 *
 * The ref is a callback ref: the board container can remount across game
 * phases (select -> playing -> game over), and a plain ref object would
 * leave a freshly mounted container unobserved.
 */
export function useGameBoardScale(cols: number, rows: number) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [cellSize, setCellSize] = useState(0);

  useLayoutEffect(() => {
    if (!box) return undefined;
    const update = () => {
      setCellSize(computeGameCellSize(box.clientWidth, box.clientHeight, cols, rows));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, cols, rows]);

  return { boardBoxRef: setBox, cellSize };
}
