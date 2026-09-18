import { PerfSlot } from './MonitoringWidget';
import { DEFAULT_DESIGN, DEFAULT_SLOTS, isExtrasBackedDevice, isMicroLayout, resolvedSlotLayout, resolveSlotDesign } from './perfSlots';
import type { DeviceKey } from './perfSlots';
import type { GaugeDesignKey } from './gauges';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useSensors } from '../../../hooks/useSensors';
import { useSensorExtras } from '../../../hooks/useSensorExtras';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import type { WidgetProps } from '../types';
import { buildNetworkSensors } from './networkSensors';
import { DEFAULT_SCALE_MODE, type ScaleMode } from './perfDomain';
import { MicroMonitoringWidget } from './MicroMonitoringWidget';
import { usePanelGaugeGradient } from '../common/PanelGaugeGradientContext';
import styles from './MonitoringTouch.module.scss';

/**
 * One immersive cell per configured monitoring slot, each showing a single
 * sensor at full size. Reads sensors via the same useSensors hook the tile
 * uses, so state is shared across views (no reset on tap-to-immersive).
 *
 * 1 slot   -> 1 cell, centered on the page.
 * 2 slots  -> 2 cells, stacked portrait / side-by-side landscape, centered.
 * 4 slots  -> all on one page where the panel is tall enough (Y70), else
 *             paginates (2 cells per page on phone).
 */
export function MonitoringTouch({ widget, immersiveGrid }: WidgetProps) {
  const layout = resolvedSlotLayout(widget.size, widget.config);
  const slotCount = layout.count;
  const isMicro = isMicroLayout(widget.size, slotCount, layout.hero);

  const slotConfigs = Array.from({ length: slotCount }, (_, i) => ({
    device: ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu'),
    sensorName: ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? ''),
    design: resolveSlotDesign(
      widget.size,
      layout,
      i,
      ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? DEFAULT_SLOTS[i]?.design ?? DEFAULT_DESIGN),
    ),
    // Carried so a cell grades against the same window the tile does; without
    // the range a Fixed slot would colour off the absolute limits instead.
    scale: ((widget.config?.[`slot${i}_scale`] as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE),
    fixedMin: widget.config?.[`slot${i}_min`] as number | undefined,
    fixedMax: widget.config?.[`slot${i}_max`] as number | undefined,
    valueColor: (widget.config?.[`slot${i}_valueColor`] as boolean | undefined) ?? false,
  }));

  const microDevice = widget.config?.micro_device as DeviceKey | undefined;
  const usesFps = isMicro
    ? microDevice === 'fps'
    : slotConfigs.some(s => s.device === 'fps');
  const usesNetwork = isMicro
    ? microDevice === 'network'
    : slotConfigs.some(s => s.device === 'network');
  const usesExtras = isMicro
    ? isExtrasBackedDevice(microDevice ?? 'cpu')
    : slotConfigs.some(s => isExtrasBackedDevice(s.device));
  // Hooks must run on every render regardless of mode (see MonitoringWidget).
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const extras = useSensorExtras(usesExtras);
  const gaugeGradient = usePanelGaugeGradient();

  if (isMicro) {
    return (
      <ImmersiveLayout
        cells={[<div className={styles.slotCell} key="micro"><MicroMonitoringWidget widget={widget} count={slotCount} /></div>]}
        gridColumns={immersiveGrid?.columns ?? 4}
        gridRows={immersiveGrid?.rows ?? 8}
      />
    );
  }

  const cells = slotConfigs.map(({ device, sensorName, design, scale, fixedMin, fixedMax, valueColor }, i) => (
    <div className={styles.slotCell} key={`${i}-${device}-${sensorName}`}>
      <PerfSlot
        sensors={sensors}
        fpsSensors={fpsSensors}
        networkSensors={networkSensors}
        extras={extras}
        device={device}
        sensorName={sensorName}
        design={design}
        scale={scale}
        fixedMin={fixedMin}
        fixedMax={fixedMax}
        valueColor={valueColor}
        gaugeGradient={gaugeGradient}
      />
    </div>
  ));

  // Each tile prefers a 4x4 footprint but may compress to a 3-unit floor (see
  // ImmersiveLayout's flex-shrink) so a tall panel fits the whole set on one
  // page: Y70 portrait (12 rows) -> 4 tiles/page = the full set; a phone
  // (~8 rows) -> 2/page and paginates the rest.
  const longAxis = Math.max(immersiveGrid?.columns ?? 4, immersiveGrid?.rows ?? 8);
  const cellsPerPage = Math.max(1, Math.floor(longAxis / 3));

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
      fillLast={false}
      cellsPerPage={cellsPerPage}
    />
  );
}
