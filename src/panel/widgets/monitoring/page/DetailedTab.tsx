import { useCallback, useMemo } from 'react';
import classNames from 'classnames';
import type { HardwareSensor, useSensors } from '../../../../hooks/useSensors';
import { useSensorExtras, type ExtrasComponent } from '../../../../hooks/useSensorExtras';
import { useTranslation } from '../../../../lib/i18n';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import { DetailSection } from './parts';
import styles from '../MonitoringPage.module.scss';

export function DetailedTab({ sensors }: { sensors: ReturnType<typeof useSensors> }) {
  const { t } = useTranslation();
  const extras = useSensorExtras(true);
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

  // Storage section synthesizes per-drive capacity rows from the storage map
  // (drive letters / mount points) and joins any LHM storage sensors that were
  // already on the topic.
  const storageAllSensors = useMemo<HardwareSensor[]>(() => {
    return [
      ...Object.entries(sensors.storageComponents).flatMap(([mount, sc]) =>
        sc.sensors?.map(s => ({ ...s, id: s.id || `sc-${mount}-${s.name}` })) ?? [
          { id: `sc-${mount}-used`, name: `${mount} Used`, type: 'Data', value: 0, units: 'GB', formatted: sc.usedSpace, parent: { id: mount, name: mount } },
          { id: `sc-${mount}-free`, name: `${mount} Free`, type: 'Data', value: 0, units: 'GB', formatted: sc.freeSpace, parent: { id: mount, name: mount } },
          { id: `sc-${mount}-usage`, name: `${mount} Usage`, type: 'Level', value: 0, units: '%', formatted: sc.usedPercentage, parent: { id: mount, name: mount } },
        ]
      ),
      ...sensors.storageSensors,
    ];
  }, [sensors.storageComponents, sensors.storageSensors]);

  type Entry = { id: string; title: string; subtitle?: string; sensors: HardwareSensor[] };

  const entries: Entry[] = [];
  if (sensors.cpu.length > 0)
    entries.push({ id: 'cpu', title: t('monitoring.detailed.cpu'), subtitle: sensors.cpuModel, sensors: sensors.cpu });
  if (sensors.gpu.length > 0)
    entries.push({ id: 'gpu', title: t('monitoring.detailed.gpu'), subtitle: sensors.gpuModels[0], sensors: sensors.gpu });
  if (sensors.memory.length > 0)
    entries.push({ id: 'memory', title: t('monitoring.detailed.memory'), subtitle: sensors.memoryTotal, sensors: sensors.memory });
  if (storageAllSensors.length > 0)
    entries.push({ id: 'storage', title: t('monitoring.detailed.storage'), sensors: storageAllSensors });
  if (sensors.motherboard.length > 0 || sensors.motherboardModel)
    entries.push({
      id: 'motherboard',
      title: t('monitoring.detailed.system'),
      subtitle: sensors.motherboardModel,
      sensors: sensors.motherboard,
    });

  // Extras: one section per discovered hardware. Hides automatically when a
  // family has zero entries (e.g. desktops with no battery).
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
  pushExtras('battery', t('monitoring.detailed.battery'), extras.batteries);
  pushExtras('psu', t('monitoring.detailed.psu'), extras.psus);
  pushExtras('cooler', t('monitoring.detailed.cooler'), extras.coolers);
  pushExtras('nic', t('monitoring.detailed.nic'), extras.nics);
  pushExtras('nvme', t('monitoring.detailed.nvme'), extras.nvmeStorage);
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
