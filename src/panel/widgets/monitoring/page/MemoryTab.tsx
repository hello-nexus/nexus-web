import type { useProcessMonitor } from '../../../../hooks/useProcessMonitor';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import { formatMemoryMb } from '../../../../lib/formatMemory';

export function MemoryTab({ memSeries }: {
  memSeries: ReturnType<typeof useProcessMonitor>['memSeries'];
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();

  const items: ProcessListItem[] = memSeries.map(s => ({
    name: s.name === 'Other' ? t('monitoring.other') : s.name,
    color: s.color,
    current: s.current,
    values: s.values,
  }));

  return (
    <ProcessListSection items={items} formatValue={v => formatMemoryMb(v, numberFormat)} />
  );
}
