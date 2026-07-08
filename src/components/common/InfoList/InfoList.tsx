import type { ReactNode } from 'react';
import styles from './InfoList.module.scss';

/*
 * InfoList: a bounded widget of label/value rows, one line per field. Label
 * on the left in mono/uppercase, value on the right in primary text. Wrap
 * InfoRow children in an InfoList for the bordered surface; otherwise use
 * InfoRow standalone inside any other container.
 */
export function InfoList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${styles.list} ${className ?? ''}`}>{children}</div>;
}

export type InfoRowTone = 'default' | 'accent' | 'good' | 'warn' | 'bad' | 'dim';

const TONE_CLASS: Record<InfoRowTone, string> = {
  default: '',
  accent: styles.valueAccent,
  good: styles.valueGood,
  warn: styles.valueWarn,
  bad: styles.valueBad,
  dim: styles.valueDim,
};

export interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: InfoRowTone;
  /** Capitalize the value (first letter uppercase) for category-style copy. */
  capitalize?: boolean;
}

export function InfoRow({ label, value, tone = 'default', capitalize }: InfoRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${TONE_CLASS[tone]} ${capitalize ? styles.valueCapitalize : ''}`}>
        {value}
      </span>
    </div>
  );
}
