import { useMemo, useState } from 'react';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { Select } from '../../../../components/common/Select/Select';
import { Sparkline } from '../../../../components/common/Sparkline/Sparkline';
import { useTranslation } from '../../../../lib/i18n';
import styles from './ProcessListSection.module.scss';

export interface ProcessListItem {
  name: string;
  color: string;
  current: number;
  values: number[];
  /** Optional inline secondary text after the value (e.g. GPU VRAM). */
  secondary?: string;
}

type SortMode = 'usage' | 'name';

export interface ProcessListSectionProps {
  items: readonly ProcessListItem[];
  formatValue: (value: number) => string;
}

const SPARKLINE_SAMPLES = 30;

/**
 * The live per-process list shown below the history hero chart on each
 * metric tab: search + sort over a flat row list, each row a name, a mini
 * live sparkline, and the current value (plus an optional secondary value).
 * Shared by the cpu/memory/gpu/network tabs - data source and formatting are
 * the caller's concern, this component only searches, sorts, and renders.
 */
export function ProcessListSection({ items, formatValue }: ProcessListSectionProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('usage');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? items.filter(i => i.name.toLowerCase().includes(needle)) : items;
    return [...filtered].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.current - a.current));
  }, [items, query, sort]);

  const sortOptions = [
    { value: 'usage', label: t('monitoring.history.process.sortUsage') },
    { value: 'name', label: t('monitoring.history.process.sortName') },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('monitoring.history.process.searchPlaceholder')}
        />
        <Select
          value={sort}
          onChange={v => setSort(v as SortMode)}
          options={sortOptions}
          ariaLabel={t('monitoring.history.process.sortAriaLabel')}
        />
      </div>
      {visible.length === 0 ? (
        <div className={styles.empty}>{t('monitoring.ranked.empty')}</div>
      ) : (
        <div className={styles.rows}>
          {visible.map(item => (
            <div key={item.name} className={styles.row}>
              <span className={styles.dot} style={{ background: item.color }} />
              <span className={styles.name}>{item.name}</span>
              <Sparkline
                className={styles.sparkline}
                values={item.values}
                width={64}
                height={20}
                color={item.color}
                sampleCount={SPARKLINE_SAMPLES}
              />
              <span className={styles.value}>{formatValue(item.current)}</span>
              {item.secondary && <span className={styles.secondary}>{item.secondary}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
