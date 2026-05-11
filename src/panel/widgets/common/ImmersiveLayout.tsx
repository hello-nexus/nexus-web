import { useMemo, useState, type ReactNode } from 'react';
import { PanelPager } from '../../PanelPager';
import { PanelPageIndicator } from '../../PanelPageIndicator';
import styles from './ImmersiveLayout.module.scss';

interface ImmersiveLayoutProps {
  // One entry per 4x4 cell the widget wants to expose. Each cell is
  // sized to occupy the same area a 4x4 panel widget would in the
  // current runtime grid (4 cols x 4 rows worth of cell-size).
  cells: ReactNode[];
  // Runtime grid info from useRuntimePanelGrid. Lets the layout fit
  // the same number of 4x4 cells per page as the panel grid does.
  gridColumns: number;
  gridRows: number;
  // How many 4x4 cells should occupy one immersive page. Defaults to
  // the panel grid's natural fit:
  //   4 cols x 8 rows  -> 2 (stacked vertically)
  //   8 cols x 4 rows  -> 2 (side by side)
  //   4 cols x 14 rows -> 3 (Y70 portrait)
  cellsPerPage?: number;
  // Centers cells on the page when fewer cells than capacity. Default true.
  center?: boolean;
}

export function ImmersiveLayout({
  cells,
  gridColumns,
  gridRows,
  cellsPerPage,
  center = true,
}: ImmersiveLayoutProps) {
  const orientation: 'portrait' | 'landscape' =
    gridRows >= gridColumns ? 'portrait' : 'landscape';
  const fitPerPage = cellsPerPage
    ?? Math.max(1, Math.floor(Math.max(gridColumns, gridRows) / 4));

  const pages = useMemo(() => {
    const out: { id: string; cells: ReactNode[] }[] = [];
    for (let i = 0; i < cells.length; i += fitPerPage) {
      out.push({ id: `imm-${i}`, cells: cells.slice(i, i + fitPerPage) });
    }
    return out.length ? out : [{ id: 'imm-empty', cells: [] }];
  }, [cells, fitPerPage]);

  const [activeIndex, setActiveIndex] = useState(0);

  // Single-page fast path: no pager chrome, just lay out the cells.
  if (pages.length <= 1) {
    return <ImmersivePage cells={pages[0].cells} orientation={orientation} fitPerPage={fitPerPage} center={center} />;
  }

  // Multi-page: horizontal swipe between pages, dot indicator at the
  // bottom. Same gesture vocabulary as the main panel pager so users
  // navigate the immersive view exactly like they navigate pages.
  return (
    <div className={styles.pagerContainer}>
      <PanelPager
        pages={pages}
        activeIndex={Math.min(activeIndex, pages.length - 1)}
        onActiveChange={setActiveIndex}
        renderPage={(page) => (
          <ImmersivePage cells={page.cells} orientation={orientation} fitPerPage={fitPerPage} center={center} />
        )}
      />
      <div className={styles.indicator}>
        <PanelPageIndicator total={pages.length} active={Math.min(activeIndex, pages.length - 1)} visibilityToken={activeIndex} />
      </div>
    </div>
  );
}

function ImmersivePage({
  cells,
  orientation,
  fitPerPage,
  center,
}: {
  cells: ReactNode[];
  orientation: 'portrait' | 'landscape';
  fitPerPage: number;
  center: boolean;
}) {
  return (
    <div
      className={styles.layout}
      data-orientation={orientation}
      data-cells={cells.length}
      data-center={center && cells.length < fitPerPage ? 'true' : undefined}
    >
      {cells.map((cell, idx) => (
        <ImmersiveCell key={idx}>{cell}</ImmersiveCell>
      ))}
    </div>
  );
}

/**
 * Wraps each cell with consistent padding so per-widget immersive
 * components don't need to program their own padding. Single source
 * of truth - any visual tweak to immersive cell chrome lands here.
 */
export function ImmersiveCell({ children }: { children: ReactNode }) {
  return <div className={styles.cell}>{children}</div>;
}
