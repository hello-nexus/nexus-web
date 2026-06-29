import type { ReactNode } from 'react';
import { Card } from '../../../components/common/Card/Card';
import styles from './BenchmarkPage.module.scss';

// A labelled spec tile (icon + uppercase label + value) shown both in the
// Run tab's "your system" grid and per-subsystem on the results page.
export function SpecBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className={styles.specBlock}>
      <div className={styles.specInner}>
        <span className={styles.specIcon}>{icon}</span>
        <span className={styles.specLabel}>{label}</span>
        <span className={styles.specValue} title={value}>{value || '-'}</span>
      </div>
    </Card>
  );
}
