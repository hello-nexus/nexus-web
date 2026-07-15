import { Link } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Toggle } from '../Toggle/Toggle';
import styles from './NexusControlCard.module.scss';

interface NexusControlCardProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

/**
 * Label + toggle in a card, matching the DevicesPage device-card control
 * group treatment (same label, same toggle) so the on/off switch reads as
 * the same control wherever it appears. Used by DevicePage's NexusControlOff
 * gate (curated devices and a promoted monitor with Nexus Control off).
 */
export function NexusControlCard({ checked, disabled, onChange }: NexusControlCardProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.controlCard}>
      <span className={styles.controlLabel}><Link size={13} aria-hidden />{t('devices.nexusControl')}</span>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} ariaLabel={t('devices.nexusControl')} />
    </div>
  );
}
