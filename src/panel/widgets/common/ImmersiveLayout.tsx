import { useMemo, useState, type ReactNode } from 'react';
import { PanelPager } from '../../chrome/PanelPager';
import { PanelPageIndicator } from '../../chrome/PanelPageIndicator';
import styles from './ImmersiveLayout.module.scss';

interface ImmersiveLayoutProps {
  // One entry per 4x4 cell the widget wants to expose. By default the LAST
  // cell on each page grows to fill the remaining length of the panel and
  // earlier cells stay pinned to a 4x4 footprint (lighting/media); with
  // `fillLast={false}` every cell is a fixed 4x4 (monitoring's equal tiles).
  cells: ReactNode[];
  // Runtime grid info from useRuntimePanelGrid. Drives orientation, how many
  // 4x4 cells fit per page, and the fixed-cell size (4 rows / 4 cols of it).
  gridColumns: number;
  gridRows: number;
  // When false, no cell grows - every cell is a fixed 4x4 tile and the group
  // centers on the page. Default true (last cell fills).
  fillLast?: boolean;
  // How many 4x4 cells occupy one immersive page. Defaults to the panel
  // grid's fit:
  //   4 cols x 8 rows  -> 2 (stacked vertically)
  //   8 cols x 4 rows  -> 2 (side by side)
  //   4 cols x 12 rows -> 3 (Y70 portrait)
  //   4 cols x 6 rows  -> 2 (phone portrait with the browser URL bar visible)
  cellsPerPage?: number;
}

export function ImmersiveLayout({
  cells,
  gridColumns,
  gridRows,
  fillLast = true,
  cellsPerPage,
}: ImmersiveLayoutProps) {
  const orientation: 'portrait' | 'landscape' =
    gridRows >= gridColumns ? 'portrait' : 'landscape';
  // Cells per page along the long axis. With fillLast the last cell absorbs the
  // partial remainder, so a page holds ceil(long/4): the fixed cells at a true
  // 4x4 plus one fill cell taking what is left. floor would drop the fill cell
  // to its own page when the long axis is not a multiple of 4 - e.g. a phone
  // portrait at 4x6 (the runtime grid loses a row pair to the browser URL bar):
  // floor(6/4)=1 splits a 2-cell widget across 2 pages, ceil(6/4)=2 keeps it on
  // one. A no-op where the long axis is a multiple of 4 (8/12/16; the Q60's 4
  // stays at 1 per page). The all-fixed case (fillLast=false) needs a full 4x4
  // per cell, so it floors.
  const longAxis = Math.max(gridColumns, gridRows);
  const fitPerPage = cellsPerPage
    ?? Math.max(1, fillLast ? Math.ceil(longAxis / 4) : Math.floor(longAxis / 4));

  // Length of one fixed 4x4 cell as a FRACTION of the immersive page: 4 grid
  // rows tall in portrait, 4 grid columns wide in landscape. A row-count ratio
  // (not a px size from the grid) is deliberate - the immersive render area
  // lives in a --panel-scale-zoomed space where the grid's device-px cell
  // sizes don't map 1:1, but `4 / rows` of the page is a true 4x4 at any zoom.
  // The last cell flex-grows into whatever is left over.
  const fixedBasis = orientation === 'portrait'
    ? `${(400 / Math.max(gridRows, 1)).toFixed(4)}%`
    : `${(400 / Math.max(gridColumns, 1)).toFixed(4)}%`;

  const pages = useMemo(() => {
    const out: { id: string; cells: ReactNode[] }[] = [];
    for (let i = 0; i < cells.length; i += fitPerPage) {
      out.push({ id: `imm-${i}`, cells: cells.slice(i, i + fitPerPage) });
    }
    return out.length ? out : [{ id: 'imm-empty', cells: [] }];
  }, [cells, fitPerPage]);

  const [activeIndex, setActiveIndex] = useState(0);

  // Single page: no pager chrome.
  if (pages.length <= 1) {
    return <ImmersivePage cells={pages[0].cells} orientation={orientation} fixedBasis={fixedBasis} fillLast={fillLast} />;
  }

  // Multi-page: horizontal swipe between pages, dot indicator at bottom.
  // Same gesture vocabulary as the main panel pager.
  return (
    <div className={styles.pagerContainer}>
      <PanelPager
        pages={pages}
        activeIndex={Math.min(activeIndex, pages.length - 1)}
        onActiveChange={setActiveIndex}
        renderPage={(page) => (
          <ImmersivePage cells={page.cells} orientation={orientation} fixedBasis={fixedBasis} fillLast={fillLast} />
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
  fixedBasis,
  fillLast,
}: {
  cells: ReactNode[];
  orientation: 'portrait' | 'landscape';
  fixedBasis: string;
  fillLast: boolean;
}) {
  return (
    <div
      className={styles.layout}
      data-orientation={orientation}
      data-cells={cells.length}
      data-fixed={fillLast ? undefined : 'true'}
    >
      {cells.map((cell, idx) => (
        <ImmersiveCell key={idx} fill={fillLast && idx === cells.length - 1} basis={fixedBasis}>
          {cell}
        </ImmersiveCell>
      ))}
    </div>
  );
}

/**
 * One immersive cell. The fill cell (last on the page) grows to take the
 * leftover length; every other cell is pinned to one 4x4 block via `basis`.
 */
export function ImmersiveCell({ children, fill, basis }: { children: ReactNode; fill?: boolean; basis?: string }) {
  return (
    <div
      className={styles.cell}
      data-fill={fill ? 'true' : undefined}
      style={fill ? undefined : { flexBasis: basis }}
    >
      {children}
    </div>
  );
}
