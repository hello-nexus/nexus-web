import styles from '../MonitoringPage.module.scss';

export interface Vital {
  label: string;
  value: string;
}

/**
 * A row of compact stat cards (usage / temp / power / clock ...) shown above the
 * CPU and GPU tab charts. Auto-fits to the available width; no bottom margin so
 * it sits at the same gap as the charts below it (the tab container owns the gap).
 */
export function VitalsStrip({ vitals }: { vitals: Vital[] }) {
  if (vitals.length === 0) return null;
  return (
    <div className={styles.vitals}>
      {vitals.map(v => (
        <div key={v.label} className={styles.vital}>
          <span className={styles.vitalValue}>{v.value}</span>
          <span className={styles.vitalLabel}>{v.label}</span>
        </div>
      ))}
    </div>
  );
}
