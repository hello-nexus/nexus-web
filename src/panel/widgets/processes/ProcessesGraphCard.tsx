import { useLayoutEffect, useMemo, useState } from 'react';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import { formatMemoryMb } from '../../../lib/formatMemory';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers, type NumberFormat } from '../../../lib/units';
import { formatRate } from '../monitoring/page/shared';
import { PERF_HISTORY_SAMPLES } from '../common/panelHistoryConfig';
import { ProcessIcon } from '../monitoring/page/ProcessIcon';
import type { ProcessRow } from './processesData';
import {
  RESOURCE_LABEL_KEYS,
  resourceDomain,
  rowValue,
  topRowsFor,
  type ResourceKey,
} from './processesResources';
import styles from './ProcessesGraphCard.module.scss';

// Shared with ProcessesWidget so a card's list and the raw list page stay at
// one density; published to the stylesheet as --proc-row-h.
const ROW_HEIGHT_PX = 26;

// Memory is the one resource whose system figure and per-process figure carry
// different units: the frame reports a percentage of RAM, a row reports MB.
function formatSystemValue(resource: ResourceKey, value: number, numberFormat: NumberFormat): string {
  if (resource === 'io') return formatRate(value, numberFormat);
  return localizeNumbers(`${value.toFixed(1)}%`, numberFormat);
}

function formatRowValue(resource: ResourceKey, value: number, numberFormat: NumberFormat): string {
  if (resource === 'io') return formatRate(value, numberFormat);
  if (resource === 'memory') return formatMemoryMb(value, numberFormat);
  return localizeNumbers(`${value.toFixed(1)}%`, numberFormat);
}

/**
 * One immersive card: the resource's system-wide filled-line graph on top, its
 * heaviest processes below. The list never scrolls - it takes however many
 * whole rows the bottom half can show.
 */
export function ProcessesGraphCard({ resource, value, history, rows, numberFormat, showRows }: {
  resource: ResourceKey;
  value: number;
  history: readonly number[];
  rows: readonly ProcessRow[];
  numberFormat: NumberFormat;
  /** False where the platform reports no per-process figure for this resource
   *  (GPU off Windows): the graph then takes the whole card rather than
   *  sitting above a permanently empty list. */
  showRows: boolean;
}) {
  const { t } = useTranslation();
  // Sparkline memoizes on the array identity; a fresh copy per render would
  // recompute the path on every frame.
  const values = useMemo(() => [...history], [history]);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const fitCount = useRowsThatFit(listEl);
  const top = showRows ? topRowsFor(resource, rows, fitCount) : [];

  return (
    <div
      className={styles.card}
      data-graph-only={showRows ? undefined : 'true'}
      style={{ '--proc-row-h': `${ROW_HEIGHT_PX}px` } as React.CSSProperties}
    >
      <div className={styles.head}>
        <span className={styles.label}>{t(RESOURCE_LABEL_KEYS[resource])}</span>
        <span className={styles.value}>{formatSystemValue(resource, value, numberFormat)}</span>
      </div>
      <div className={styles.chart}>
        <Sparkline
          values={values}
          domain={resourceDomain(resource)}
          sampleCount={PERF_HISTORY_SAMPLES}
          color="var(--panel-accent-glow)"
          // eslint-disable-next-line i18next/no-literal-string -- CSS color variable
          strokeColor="var(--panel-accent)"
          strokeWidth={2}
          padding={2}
          showFill
          width="100%"
          viewWidth={240}
          height={96}
          className={styles.spark}
        />
      </div>
      {showRows && (
        <div className={styles.rows} ref={setListEl}>
          {top.map(row => (
            <div className={styles.row} key={row.name}>
              <ProcessIcon name={row.name} />
              <span className={styles.name}>{row.name}</span>
              <span className={styles.rowValue}>
                {formatRowValue(resource, rowValue(resource, row) ?? 0, numberFormat)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Whole rows the card's bottom half can show. Measured, because a card is a
 *  different height on a Y70, a phone, and the desktop simulator. */
function useRowsThatFit(el: HTMLDivElement | null): number {
  const [count, setCount] = useState(4);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setCount(Math.max(1, Math.floor(h / ROW_HEIGHT_PX)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return count;
}
