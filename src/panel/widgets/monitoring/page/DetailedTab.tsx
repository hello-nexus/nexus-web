import { useCallback, useState } from 'react';
import type { useSensors } from '../../../../hooks/useSensors';
import { useSensorExtras, type ExtrasComponent } from '../../../../hooks/useSensorExtras';
import { useSystemSpecs } from '../../../../hooks/useSystemSpecs';
import { useTranslation } from '../../../../lib/i18n';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { DetailSection } from './parts';
import { filterDetailedEntries, type DetailedEntry } from './detailedSearch';
import styles from '../MonitoringPage.module.scss';

export function DetailedTab({ sensors }: { sensors: ReturnType<typeof useSensors> }) {
  const { t } = useTranslation();
  const extras = useSensorExtras(true);
  // Memory brand/model comes from the system-specs query (CIM Win32_PhysicalMemory),
  // not the sensor stream - the LHM memory node has no manufacturer/part info.
  const { specs } = useSystemSpecs(true);
  const { settings, update } = useUiSettings();

  const [query, setQuery] = useState('');

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

  const entries: DetailedEntry[] = [];

  // Multiple units of one kind get numbered suffixes; the unit's model name
  // rides in the subtitle. Filtered below with every other section, so a
  // family with zero entries (e.g. a desktop with no battery) contributes
  // nothing to the list.
  const pushExtras = (kind: string, label: string, list: ExtrasComponent[]) => {
    list.forEach((c, i) => {
      entries.push({
        id: `${kind}/${c.id || i}`,
        title: list.length > 1 ? `${label} ${i + 1}` : label,
        subtitle: c.name,
        sensors: c.sensors,
      });
    });
  };

  entries.push({ id: 'cpu', title: t('monitoring.detailed.cpu'), subtitle: sensors.cpuModel, sensors: sensors.cpu });
  entries.push({ id: 'gpu', title: t('monitoring.detailed.gpu'), subtitle: sensors.gpuModel, sensors: sensors.gpu });
  entries.push({ id: 'memory', title: t('monitoring.detailed.memory'), subtitle: specs?.memory, sensors: sensors.memory });
  // One section per DIMM (temperature, capacity, SPD timings), headed by its
  // part number. Empty when the platform can't reach SMBus/SPD (e.g. a VM).
  pushExtras('memoryModule', t('monitoring.detailed.memoryModule'), extras.memoryModules);
  // One section per physical storage drive (NVMe + SATA), headed by its model.
  // extras.nvmeStorage is every HardwareType.Storage device LHM reports, each
  // carrying its own sensors.
  pushExtras('storage', t('monitoring.detailed.storage'), extras.nvmeStorage);
  entries.push({
    id: 'motherboard',
    title: t('monitoring.detailed.system'),
    subtitle: sensors.motherboardModel,
    sensors: sensors.motherboard,
  });

  pushExtras('battery', t('monitoring.detailed.battery'), extras.batteries);
  pushExtras('psu', t('monitoring.detailed.psu'), extras.psus);
  pushExtras('cooler', t('monitoring.detailed.cooler'), extras.coolers);
  pushExtras('ec', t('monitoring.detailed.ec'), extras.embeddedControllers);

  // Single gate for every section: a header never renders over an empty body.
  const populated = entries.filter(entry => entry.sensors.length > 0);

  // A search opens every section so a match is never folded away, and the
  // fold toggles stay put until it is cleared.
  const searching = query.trim().length > 0;
  const visibleEntries = searching ? filterDetailedEntries(populated, query, groupTypeLabel) : populated;
  const searchIsCollapsed = useCallback(() => false, []);
  const noop = useCallback(() => {}, []);

  return (
    <div className={styles.detailedRoot}>
      <SearchInput
        className={styles.detailedSearch}
        value={query}
        onChange={setQuery}
        placeholder={t('monitoring.detailed.searchPlaceholder')}
      />
      {searching && visibleEntries.length === 0 && (
        <p className={styles.detailedSearchEmpty} role="status">{t('monitoring.detailed.noMatches')}</p>
      )}
      {visibleEntries.map(entry => (
        <DetailSection
          key={entry.id}
          id={entry.id}
          title={entry.title}
          subtitle={entry.subtitle}
          sensors={entry.sensors}
          isCollapsed={searching ? searchIsCollapsed : isCollapsed}
          onToggle={searching ? noop : onToggle}
          groupTypeLabel={groupTypeLabel}
        />
      ))}
    </div>
  );
}
