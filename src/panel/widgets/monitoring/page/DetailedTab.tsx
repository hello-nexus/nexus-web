import { useCallback } from 'react';
import classNames from 'classnames';
import type { HardwareSensor, useSensors } from '../../../../hooks/useSensors';
import { useSensorExtras, type ExtrasComponent } from '../../../../hooks/useSensorExtras';
import { useSystemSpecs } from '../../../../hooks/useSystemSpecs';
import { useTranslation } from '../../../../lib/i18n';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import { DetailSection } from './parts';
import styles from '../MonitoringPage.module.scss';

export function DetailedTab({ sensors }: { sensors: ReturnType<typeof useSensors> }) {
  const { t } = useTranslation();
  const extras = useSensorExtras(true);
  // Memory brand/model comes from the system-specs query (CIM Win32_PhysicalMemory),
  // not the sensor stream — the LHM memory node has no manufacturer/part info.
  const { specs } = useSystemSpecs(true);
  const { settings, update } = useUiSettings();

  const collapsed = settings.monitoringDetailedCollapsed;
  const isCollapsed = useCallback((id: string) => collapsed.includes(id), [collapsed]);
  const onToggle = useCallback((id: string) => {
    const next = collapsed.includes(id)
      ? collapsed.filter(x => x !== id)
      : [...collapsed, id];
    update({ monitoringDetailedCollapsed: next });
  }, [collapsed, update]);

  const groupTypeLabel = useCallback((type: string) => {
    const key = `monitoring.detailed.group.${type.toLowerCase()}`;
    const translated = t(key);
    // Fall back to the raw LHM type name when the locale string is missing.
    return translated === key ? type : translated;
  }, [t]);

  type Entry = { id: string; title: string; subtitle?: string; sensors: HardwareSensor[] };

  const entries: Entry[] = [];

  // One section per discovered hardware unit. Hides automatically when a family
  // has zero entries (e.g. desktops with no battery). Multiple units of one kind
  // get numbered suffixes; the unit's model name rides in the subtitle.
  const pushExtras = (kind: string, label: string, list: ExtrasComponent[]) => {
    list.forEach((c, i) => {
      if (c.sensors.length === 0) return;
      entries.push({
        id: `${kind}/${c.id || i}`,
        title: list.length > 1 ? `${label} ${i + 1}` : label,
        subtitle: c.name,
        sensors: c.sensors,
      });
    });
  };

  if (sensors.cpu.length > 0)
    entries.push({ id: 'cpu', title: t('monitoring.detailed.cpu'), subtitle: sensors.cpuModel, sensors: sensors.cpu });
  if (sensors.gpu.length > 0)
    entries.push({ id: 'gpu', title: t('monitoring.detailed.gpu'), subtitle: sensors.gpuModels[0], sensors: sensors.gpu });
  if (sensors.memory.length > 0)
    entries.push({ id: 'memory', title: t('monitoring.detailed.memory'), subtitle: specs?.memory, sensors: sensors.memory });
  // One section per physical storage drive (NVMe + SATA), headed by its model.
  // extras.nvmeStorage is every HardwareType.Storage device LHM reports, each
  // carrying its own sensors.
  pushExtras('storage', t('monitoring.detailed.storage'), extras.nvmeStorage);
  if (sensors.motherboard.length > 0 || sensors.motherboardModel)
    entries.push({
      id: 'motherboard',
      title: t('monitoring.detailed.system'),
      subtitle: sensors.motherboardModel,
      sensors: sensors.motherboard,
    });

  pushExtras('battery', t('monitoring.detailed.battery'), extras.batteries);
  pushExtras('psu', t('monitoring.detailed.psu'), extras.psus);
  pushExtras('cooler', t('monitoring.detailed.cooler'), extras.coolers);
  pushExtras('nic', t('monitoring.detailed.nic'), extras.nics);
  pushExtras('ec', t('monitoring.detailed.ec'), extras.embeddedControllers);

  return (
    <div className={classNames(styles.detailedRoot, 'pageConstrained')}>
      {entries.map(entry => (
        <DetailSection
          key={entry.id}
          id={entry.id}
          title={entry.title}
          subtitle={entry.subtitle}
          sensors={entry.sensors}
          collapsed={isCollapsed(entry.id)}
          onToggle={onToggle}
          groupTypeLabel={groupTypeLabel}
        />
      ))}
    </div>
  );
}
