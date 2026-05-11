import { PerfSlot } from './PerformanceWidget';
import { DEFAULT_SLOTS, isMicroLayout, resolvedSlotCountForSize } from './perfSlots';
import type { DeviceKey } from './perfSlots';
import type { GaugeDesignKey } from './gauges';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useSensors } from '../../../hooks/useSensors';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import type { WidgetProps } from '../types';
import { buildNetworkSensors } from './networkSensors';
import { MicroMonitoringWidget } from './MicroMonitoringWidget';
import styles from './MonitoringImmersive.module.scss';

/**
 * Renders one immersive cell per configured monitoring slot - each
 * cell shows a single sensor at full size so the graphs don't stack
 * inside one card. Reads sensors via the same useSensors hook the
 * tile uses, so state is shared across views (no reset on tap-to-
 * immersive).
 *
 * 1 slot   -> 1 cell, centered on the page.
 * 2 slots  -> 2 cells, stacked portrait / side-by-side landscape.
 * 4 slots  -> paginates (2 cells per page on phone).
 */
export function MonitoringImmersive({ widget, immersiveGrid }: WidgetProps) {
  const slotCount = resolvedSlotCountForSize(widget.size, widget.config?.slotCount?.n);
  const isMicro = isMicroLayout(widget.size, slotCount);

  const slotConfigs = Array.from({ length: slotCount }, (_, i) => ({
    device: (widget.config?.[`slot${i}_device`]?.s as DeviceKey) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu',
    sensorName: widget.config?.[`slot${i}_sensor`]?.s ?? DEFAULT_SLOTS[i]?.sensor ?? '',
    design: (widget.config?.[`slot${i}_design`]?.s as GaugeDesignKey) ?? DEFAULT_SLOTS[i]?.design ?? 'sparkline',
  }));

  const microDevice = widget.config?.micro_device?.s as DeviceKey | undefined;
  const usesFps = isMicro
    ? microDevice === 'fps'
    : slotConfigs.some(s => s.device === 'fps');
  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(s => s.device === 'network');
  // Hooks must run on every render regardless of mode - see PerformanceWidget
  // for the rationale.
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);

  if (isMicro) {
    return (
      <ImmersiveLayout
        cells={[<div className={styles.slotCell} key="micro"><MicroMonitoringWidget widget={widget} count={slotCount} /></div>]}
        gridColumns={immersiveGrid?.columns ?? 4}
        gridRows={immersiveGrid?.rows ?? 8}
      />
    );
  }

  const cells = slotConfigs.map(({ device, sensorName, design }, i) => (
    <div className={styles.slotCell} key={`${i}-${device}-${sensorName}`}>
      <PerfSlot
        sensors={sensors}
        fpsSensors={fpsSensors}
        networkSensors={networkSensors}
        device={device}
        sensorName={sensorName}
        design={design}
      />
    </div>
  ));

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}
