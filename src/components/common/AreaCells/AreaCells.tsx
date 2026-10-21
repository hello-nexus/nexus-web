import { memo, useMemo } from 'react';
import { areaCellPolygons } from '../../../lib/areaCells';
import styles from './AreaCells.module.scss';

/**
 * The cells Area sampling gives each LED, outlined over the unit square of the box it fills. One SVG, so a frame's
 * worth of cells is a single element; the stroke stays a fixed width however the frame is scaled. A locked LED's
 * outline wears its color.
 */
export const AreaCells = memo(function AreaCells({ cells, locked, className, style }: {
  cells: readonly (readonly number[])[];
  locked?: ReadonlyMap<number, string>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const polys = useMemo(() => areaCellPolygons(cells), [cells]);
  return (
    <svg
      className={className ? `${styles.cells} ${className}` : styles.cells}
      style={style}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {polys.map(p => {
        const lock = locked?.get(p.index);
        return <polygon key={p.index} points={p.points} className={styles.cell} style={lock ? { stroke: lock } : undefined} />;
      })}
    </svg>
  );
});
