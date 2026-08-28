import { useEffect, useState } from 'react';
import { pingService } from '../../../api/service';
import { getMonitoringFrame } from '../../../lib/monitoringStore';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import type { WidgetProps } from '../types';
import { ProcessesGraphCard } from './ProcessesGraphCard';
import { ProcessesWidget } from './ProcessesWidget';
import { resolveRefreshSeconds } from './processesData';
import {
  RESOURCE_HISTORY_KEYS,
  RESOURCE_KEYS,
  systemValue,
  type ResourceKey,
} from './processesResources';
import { useProcessRows } from './useProcessRows';
import styles from './ProcessesTouch.module.scss';

/**
 * Immersive view. Graph cards first - one per resource, each charting the
 * system-wide figure over the shared 60 s history with that resource's
 * heaviest processes beneath it - then the full scrollable list as the last
 * page. ImmersiveLayout decides how many cards fit a page, so a Y70 landscape
 * shows all four at once and a phone pages through them.
 *
 * Left on ImmersiveLayout's default fillLast, so the list - alone on its own
 * page - takes the full height instead of sitting in a pinned 4x4. The graph
 * pages are unaffected wherever the cards divide the long axis exactly, which
 * is every surface that fits a whole number of them.
 */
export function ProcessesTouch({ widget, surface, deviceTouch, immersiveGrid }: WidgetProps) {
  const { numberFormat } = useUnitPrefs();

  const [platform, setPlatform] = useState('');
  useEffect(() => {
    let cancelled = false;
    pingService().then(p => {
      if (!cancelled && p?.platform) setPlatform(p.platform);
    });
    return () => { cancelled = true; };
  }, []);
  const showGpu = platform === 'windows';

  const refreshFrames = resolveRefreshSeconds(widget.config?.refreshSeconds);
  const rows = useProcessRows(refreshFrames, showGpu);
  const frame = getMonitoringFrame();

  // One hook per resource, fixed order, so the count never varies between
  // renders. Each pushes its sample into the shared per-key buffer and reads
  // the same buffer back, so a card re-mounting keeps its history.
  const cpu = useResourceSeries('cpu', frame, rows);
  const gpu = useResourceSeries('gpu', frame, rows);
  const memory = useResourceSeries('memory', frame, rows);
  const io = useResourceSeries('io', frame, rows);
  const series = { cpu, gpu, memory, io };

  // A resource with no per-process figures renders graph-only rather than
  // sitting above a permanently empty list.
  const hasRows: Record<ResourceKey, boolean> = {
    cpu: true,
    gpu: showGpu,
    memory: true,
    io: rows.some(r => r.io !== undefined),
  };

  const cards = RESOURCE_KEYS.map(resource => (
    <div className={styles.cell} key={resource}>
      <ProcessesGraphCard
        resource={resource}
        value={series[resource].value}
        history={series[resource].history}
        rows={rows}
        numberFormat={numberFormat}
        showRows={hasRows[resource]}
      />
    </div>
  ));

  const list = (
    <div className={styles.cell} key="list">
      <ProcessesWidget widget={widget} surface={surface} deviceTouch={deviceTouch} immersive />
    </div>
  );

  return (
    <ImmersiveLayout
      cells={[...cards, list]}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

function useResourceSeries(
  resource: ResourceKey,
  frame: ReturnType<typeof getMonitoringFrame>,
  rows: Parameters<typeof systemValue>[2],
): { value: number; history: readonly number[] } {
  const value = systemValue(resource, frame, rows);
  return { value, history: useSharedSensorHistory(RESOURCE_HISTORY_KEYS[resource], value) };
}

export default ProcessesTouch;
