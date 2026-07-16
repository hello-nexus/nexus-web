import type { NetworkData } from '../../../../hooks/useNetworkMonitor';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { VitalsStrip, type Vital } from './VitalsStrip';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import { formatRate } from './shared';

export function NetworkTab({ network }: { network: NetworkData }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();

  const vitals: Vital[] = [
    { label: t('monitoring.history.download'), value: formatRate(network.totalRateIn, numberFormat) },
    { label: t('monitoring.history.upload'), value: formatRate(network.totalRateOut, numberFormat) },
  ];

  const items: ProcessListItem[] = network.series.map(s => ({
    name: s.name === 'Other' ? t('monitoring.other') : s.name,
    color: s.color,
    current: s.current,
    values: s.values,
  }));

  return (
    <>
      <VitalsStrip vitals={vitals} />
      <ProcessListSection items={items} formatValue={v => formatRate(v, numberFormat)} />
    </>
  );
}
