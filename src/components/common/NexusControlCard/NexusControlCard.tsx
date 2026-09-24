import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Toggle } from '../Toggle/Toggle';
import styles from './NexusControlCard.module.scss';

interface NexusControlCardProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  /** Leading icon; defaults to the Link2 glyph (Nexus Control's own icon). */
  icon?: ReactNode;
  /** Row label; defaults to `devices.nexusControl`. */
  label?: string;
}

/**
 * Label + toggle in a card, matching the DevicesPage device-card control
 * group treatment (same label, same toggle) so the on/off switch reads as
 * the same control wherever it appears. Used by DevicePage's NexusControlOff
 * gate (curated devices and a promoted monitor with Nexus Control off) and
 * FeatureDisabled's re-enable toggle (icon/label overridden per feature).
 */
export function NexusControlCard({ checked, disabled, onChange, icon, label }: NexusControlCardProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('devices.nexusControl');
  return (
    <div className={styles.controlCard}>
      <span className={styles.controlLabel}>{icon ?? <Link2 size={13} aria-hidden />}{resolvedLabel}</span>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} ariaLabel={resolvedLabel} />
    </div>
  );
}
