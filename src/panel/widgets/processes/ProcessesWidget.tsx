import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ListX } from 'lucide-react';
import { pingService } from '../../../api/service';
import { formatMemoryMb } from '../../../lib/formatMemory';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { ProcessIcon } from '../monitoring/page/ProcessIcon';
import { compareItems } from '../monitoring/page/processRanking';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { PROCESSES_PREVIEW } from './processesPreviewData';
import {
  DEFAULT_COLUMN,
  defaultDirectionFor,
  PROCESS_COLUMNS,
  rankableFor,
  resolveRefreshSeconds,
  sortModeForColumn,
  type ProcessColumn,
  type SortDirection,
} from './processesData';
import { useProcessRows } from './useProcessRows';
import styles from './ProcessesWidget.module.scss';

// Published to the stylesheet as a custom property and used to work out how
// many rows fit, so the two cannot drift into a half-clipped last row.
const ROW_HEIGHT_PX = 26;

// Rows rendered before the first measurement lands. Uncapped here would mount
// a row - and so fire a ProcessIcon fetch - for every running process.
const INITIAL_FIT_CAP = 24;

const COLUMN_LABEL_KEYS: Record<ProcessColumn, string> = {
  name: 'panel.processes.col.name',
  cpu: 'panel.processes.col.cpu',
  gpu: 'panel.processes.col.gpu',
  ram: 'panel.processes.col.ram',
};

/**
 * Task-Manager-style process list: icon + name, then CPU / GPU / RAM. Numbers
 * only, no per-row sparkline.
 *
 * Rows come from the monitoring store's live frame - the same by-name
 * aggregation the Monitoring page's process list reads - re-sorted every frame
 * so the tile's clipped top-N stays true.
 *
 * The tile shows only the rows that fit whole and never scrolls; the immersive
 * view is the scrollable one, and mounts every row.
 */
export function ProcessesWidget({ widget, immersive }: WidgetProps & { immersive?: boolean }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const preview = usePanelPreview();

  // Per-process GPU is Windows-only (GpuProcessMonitor is #if WINDOWS), so the
  // column is dropped elsewhere rather than left permanently blank. An
  // unresolved ping reads as empty, so the column appears rather than vanishes.
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    pingService().then(p => {
      if (!cancelled && p?.platform) setPlatform(p.platform);
    });
    return () => { cancelled = true; };
  }, [preview]);
  const showGpu = platform === 'windows';

  // Seconds map 1:1 onto frames: the service broadcasts at a fixed 1 Hz.
  const refreshFrames = resolveRefreshSeconds(widget.config?.refreshSeconds);
  // Mounted in preview too (a store read, no network); the fixture replaces it.
  const live = useProcessRows(refreshFrames, showGpu && !preview);
  const rows = preview ? PROCESSES_PREVIEW : live;

  const [column, setColumn] = useState<ProcessColumn>(DEFAULT_COLUMN);
  const [direction, setDirection] = useState<SortDirection>(() => defaultDirectionFor(DEFAULT_COLUMN));

  // Tapping the active column flips its direction; tapping another switches to
  // it at that column's own natural direction.
  function pressColumn(next: ProcessColumn) {
    if (next === column) {
      setDirection(d => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setColumn(next);
    setDirection(defaultDirectionFor(next));
  }

  // Sorted fresh every frame rather than through the Monitoring page's
  // anchor-holding updateRanking: that deliberately never reorders a row on a
  // value change, which suits an uncapped scrolling list but would freeze this
  // tile's clipped top-N at whatever it held on mount, so a process that
  // spikes could never rise into view.
  const ordered = useMemo(() => {
    const ranked = rankableFor(rows, column).sort((a, b) => compareItems(a, b, sortModeForColumn(column)));
    // compareItems ranks one way per mode (metrics descending, names A-Z).
    return direction === defaultDirectionFor(column) ? ranked : ranked.reverse();
  }, [rows, column, direction]);

  const [rowsEl, setRowsEl] = useState<HTMLDivElement | null>(null);
  const { fitCount, scrollbarWidth } = useRowsMetrics(rowsEl, immersive);
  // The tile shows whole rows only; immersive takes the lot and scrolls.
  const shown = immersive ? ordered : ordered.slice(0, fitCount);

  const visibleColumns = PROCESS_COLUMNS.filter(c => c !== 'gpu' || showGpu);

  // Formatted here, not inside Row, so Row's memo compares strings and an
  // unchanged row skips re-rendering.
  const cells = shown.map(row => ({
    name: row.name,
    // The icon endpoint is a fetch per name, which the catalog preview forbids.
    showIcon: !preview,
    cpuText: localizeNumbers(`${row.cpu.toFixed(1)}%`, numberFormat),
    gpuText: showGpu ? localizeNumbers(`${(row.gpu ?? 0).toFixed(1)}%`, numberFormat) : undefined,
    ramText: formatMemoryMb(row.memMb, numberFormat),
  }));

  // The empty state drops the grid entirely, so no track can differ between it
  // and the populated layout.
  if (ordered.length === 0) {
    return (
      <div className={`${styles.processes} ${styles.isEmpty}`}>
        <div className={styles.empty}>
          <ListX className={styles.emptyIcon} aria-hidden />
          <span>{t('panel.processes.empty')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.processes}
      data-gpu={showGpu ? 'true' : undefined}
      data-immersive={immersive ? 'true' : undefined}
      style={{
        '--proc-row-h': `${ROW_HEIGHT_PX}px`,
        '--proc-sb-w': `${scrollbarWidth}px`,
      } as React.CSSProperties}
      role="table"
    >
      <div className={styles.header} role="row">
        {visibleColumns.map(c => (
          <div
            key={c}
            className={styles.headerCell}
            role="columnheader"
            aria-sort={c === column ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            <button type="button" className={styles.headerButton} onClick={() => pressColumn(c)}>
              <span className={styles.headerLabel}>{t(COLUMN_LABEL_KEYS[c])}</span>
              {c === column && (direction === 'asc'
                ? <ChevronUp className={styles.sortIcon} aria-hidden />
                : <ChevronDown className={styles.sortIcon} aria-hidden />)}
            </button>
          </div>
        ))}
      </div>
      <div className={styles.rows} ref={setRowsEl} role="rowgroup">
        {cells.map(cell => <Row key={cell.name} {...cell} />)}
      </div>
    </div>
  );
}

interface RowsMetrics {
  /** Whole rows the row area can show; MAX_SAFE_INTEGER when uncapped. */
  fitCount: number;
  /** What the scrollbar consumes here - 0 on overlay-scrollbar platforms,
   *  nonzero on Windows. Read rather than assumed, because the header has to
   *  reserve the same amount to keep its headings over the numbers. */
  scrollbarWidth: number;
}

/**
 * Measures the row area. Measured rather than derived from the widget size:
 * the same 4x4 tile is a different pixel height per surface. Takes the element
 * rather than a ref because the row container only mounts once rows exist, so
 * a ref would still read null on the effect's single run.
 */
function useRowsMetrics(el: HTMLDivElement | null, immersive?: boolean): RowsMetrics {
  const [metrics, setMetrics] = useState<RowsMetrics>({
    fitCount: INITIAL_FIT_CAP,
    scrollbarWidth: 0,
  });

  const measure = useCallback((node: HTMLDivElement, capped: boolean) => {
    const h = node.clientHeight;
    // Immersive is genuinely uncapped - it scrolls the whole list. A capped
    // container with no measurable height (display:none ancestor) holds the
    // initial cap rather than going uncapped, so it cannot mount a row per
    // running process.
    const fitCount = !capped
      ? Number.MAX_SAFE_INTEGER
      : h > 0 ? Math.max(1, Math.floor(h / ROW_HEIGHT_PX)) : INITIAL_FIT_CAP;
    const scrollbarWidth = Math.max(0, node.offsetWidth - node.clientWidth);
    setMetrics(prev => (prev.fitCount === fitCount && prev.scrollbarWidth === scrollbarWidth
      ? prev
      : { fitCount, scrollbarWidth }));
  }, []);

  useLayoutEffect(() => {
    if (!el) return;
    const capped = !immersive;
    measure(el, capped);
    // jsdom has no ResizeObserver; the measure above still runs.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure(el, capped));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, immersive, measure]);

  return metrics;
}

interface RowProps {
  name: string;
  showIcon: boolean;
  cpuText: string;
  /** Undefined where there is no per-process GPU source; the cell is dropped. */
  gpuText?: string;
  ramText: string;
}

const Row = memo(function Row({ name, showIcon, cpuText, gpuText, ramText }: RowProps) {
  return (
    <div className={styles.row} role="row">
      <span className={styles.nameCell} role="cell">
        <ProcessIcon name={showIcon ? name : undefined} />
        <span className={styles.name}>{name}</span>
      </span>
      <span className={styles.value} role="cell">{cpuText}</span>
      {gpuText !== undefined && <span className={styles.value} role="cell">{gpuText}</span>}
      <span className={styles.value} role="cell">{ramText}</span>
    </div>
  );
});

export default ProcessesWidget;
