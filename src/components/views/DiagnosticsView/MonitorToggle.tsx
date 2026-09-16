import { useId } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Toggle } from '../../common/Toggle/Toggle';
import styles from './DiagnosticsView.module.scss';

interface MonitorToggleProps {
  monitored: boolean;
  onChange: (monitored: boolean) => void;
  /** Switch only, for dense rows; the label moves to the accessible name. */
  compact?: boolean;
}

/** "Monitor" switch a diagnostics device card or row carries; off = the
 *  device is on the ignore list and stays out of health. */
export function MonitorToggle({ monitored, onChange, compact = false }: MonitorToggleProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const label = t('diagnostics.monitor.label');
  if (compact) {
    return <Toggle checked={monitored} onChange={onChange} ariaLabel={label} />;
  }
  return (
    <span className={styles.monitorToggle}>
      <span id={labelId} className={styles.monitorLabel}>{label}</span>
      <Toggle checked={monitored} onChange={onChange} ariaLabelledBy={labelId} />
    </span>
  );
}
