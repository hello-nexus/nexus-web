import type { ReactNode } from 'react';
import styles from './SpecList.module.scss';

export interface SpecListRow {
  key: string;
  label: ReactNode;
  value: ReactNode;
}

// A machine's parts as zebra label/value rows (device cards, benchmark
// hardware); a long value wraps instead of truncating.
export function SpecList({ rows, className }: { rows: SpecListRow[]; className?: string }) {
  return (
    <dl className={`${styles.list} ${className ?? ''}`}>
      {rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <dt className={styles.label}>{row.label}</dt>
          <dd className={styles.value}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
