import { PerfSlot } from './MonitoringWidget';
import { DEFAULT_SLOTS, defaultSlotDesign, isExtrasBackedDevice, isMicroLayout, microRowDevice, resolvedSlotLayout, resolveSlotDesign } from './perfSlots';
import type { DeviceKey, SlotLayout } from './perfSlots';
import type { PanelWidget } from '../../types';
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

interface ImmersiveSlot {
  device: DeviceKey;
  sensorName: string;
  design: GaugeDesignKey;
  scale: ScaleMode;
  fixedMin?: number;
  fixedMax?: number;
  valueColor: boolean;
}

const IMMERSIVE_TILE = { cols: 4, rows: 2 };

// A Micro widget renders its bars as one widget, so it stays a single cell.
type ImmersiveEntry =
  | { kind: 'slot'; slot: ImmersiveSlot }
  | { kind: 'micro'; widget: PanelWidget; count: number; devices: DeviceKey[] };

function slotsOf(widget: PanelWidget, layout: SlotLayout): ImmersiveSlot[] {
  return Array.from({ length: layout.count }, (_, i) => ({
    device: ((widget.config?.[`slot${i}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[i]?.device ?? 'cpu'),
    sensorName: ((widget.config?.[`slot${i}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[i]?.sensor ?? ''),
    design: resolveSlotDesign(
      widget.size,
      layout,
      i,
      ((widget.config?.[`slot${i}_design`] as GaugeDesignKey | undefined) ?? defaultSlotDesign(widget.size, i)),
    ),
    // Carried so a cell grades against the same window the tile does; without
    // the range a Fixed slot would colour off the absolute limits instead.
    scale: ((widget.config?.[`slot${i}_scale`] as ScaleMode | undefined) ?? DEFAULT_SCALE_MODE),
    fixedMin: widget.config?.[`slot${i}_min`] as number | undefined,
    fixedMax: widget.config?.[`slot${i}_max`] as number | undefined,
    valueColor: (widget.config?.[`slot${i}_valueColor`] as boolean | undefined) ?? false,
  }));
}

// The opened widget first, then every other monitoring widget on its page in
// reading order. A sensor shown twice gets one cell, keeping the first design.
export function immersiveEntries(widget: PanelWidget, pageWidgets: PanelWidget[] | undefined): ImmersiveEntry[] {
  const sources = [widget, ...(pageWidgets ?? []).filter(w => w.type === widget.type && w.id !== widget.id)];
  const entries: ImmersiveEntry[] = [];
  const seen = new Set<string>();
  for (const w of sources) {
    const layout = resolvedSlotLayout(w.size, w.config);
    if (isMicroLayout(w.size, layout.count, layout.hero)) {
      const devices = Array.from({ length: layout.count }, (_, i) => microRowDevice(w.config, i));
      entries.push({ kind: 'micro', widget: w, count: layout.count, devices });
      continue;
    }
    for (const slot of slotsOf(w, layout)) {
      const key = `${slot.device}::${slot.sensorName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ kind: 'slot', slot });
    }
  }
  return entries;
}

// One tile per entry from immersiveEntries; shares useSensors state with the
// panel tiles, so history does not reset on tap-to-immersive.
export function MonitoringTouch({ widget, pageWidgets, immersiveGrid }: WidgetProps) {
  const entries = immersiveEntries(widget, pageWidgets);
  const devices = entries.flatMap(e => (e.kind === 'slot' ? [e.slot.device] : e.devices));
  const usesFps = devices.includes('fps');
  const usesNetwork = devices.includes('network');
  const usesExtras = devices.some(isExtrasBackedDevice);
  // Hooks must run on every render regardless of mode (see MonitoringWidget).
  const sensors = useSensors(true);
  const fpsSensors = useFpsSensors(usesFps);
  const network = useNetworkMonitor(usesNetwork);
  const networkSensors = buildNetworkSensors(network);
  const extras = useSensorExtras(usesExtras);
  const gaugeGradient = usePanelGaugeGradient();

  const cells = entries.map((entry, i) => {
    if (entry.kind === 'micro') {
      return (
        <div className={styles.slotCell} key={`micro-${entry.widget.id}`}>
          <MicroMonitoringWidget widget={entry.widget} count={entry.count} />
        </div>
      );
    }
    const { device, sensorName, design, scale, fixedMin, fixedMax, valueColor } = entry.slot;
    return (
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
    );
  });

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
      tile={IMMERSIVE_TILE}
    />
  );
}
