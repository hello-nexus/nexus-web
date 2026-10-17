import { useId } from 'react';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import pageStyles from '../LightingPage.module.scss';
import styles from './ParamToggle.module.scss';

/** An on/off effect parameter (stored as 0 or 1) as the app's switch, labeled on the left. */
export function ParamToggle({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className={styles.row}>
      <span id={id} className={pageStyles.paramEnumLabel}>{label}</span>
      <Toggle checked={value >= 0.5} onChange={on => onChange(on ? 1 : 0)} ariaLabelledBy={id} />
    </div>
  );
}
