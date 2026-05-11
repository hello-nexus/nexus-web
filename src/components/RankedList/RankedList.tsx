import type { ReactNode } from 'react';
import { useTranslation } from '../../lib/i18n';
import styles from './RankedList.module.scss';

export interface RankedItem {
  name: string;
  color: string;
  value: number;
}

interface RankedListProps {
  title: string;
  subtitle: ReactNode;
  items: readonly RankedItem[];
  formatValue: (value: number) => string;
  emptyMessage?: string;
}

export function RankedList({ title, subtitle, items, formatValue, emptyMessage }: RankedListProps) {
  const { t } = useTranslation();
  const maxVal = Math.max(...items.filter(s => s.name !== 'Other').map(s => s.value), 0.1);

  return (
    <div className={styles.rankedList}>
      <div className={styles.rankedHeader}>
        <span className={styles.rankedTitle}>{title}</span>
        <span className={styles.rankedSubtitle}>{subtitle}</span>
      </div>
      {items.length === 0 && emptyMessage && (
        <div className={styles.rankedEmpty}>{emptyMessage}</div>
      )}
      {items.map((s, i) => {
        const isOther = s.name === 'Other';
        return (
          <div key={s.name} className={`${styles.rankedRow} ${isOther ? styles.otherRow : ''}`}>
            <span className={styles.rank}>{isOther ? '' : i + 1}</span>
            <span className={styles.dot} style={{ background: s.color }} />
            <span className={styles.name}>{isOther ? t('monitoring.other') : s.name}</span>
            <span className={styles.bar}>
              <span
                className={styles.barFill}
                style={{
                  width: `${Math.min(100, (s.value / maxVal) * 100)}%`,
                  background: s.color,
                }}
              />
            </span>
            <span className={styles.val}>{formatValue(s.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
