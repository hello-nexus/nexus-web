import { WifiOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './WidgetOfflineState.module.scss';

/**
 * Shared "the feed is unreachable" state for widgets that need the internet to
 * show anything. A widget renders it once its fetch has settled with no data
 * at all. `compact` drops the label for a cell too small to read one.
 * `label` replaces the default text with a more specific reason.
 */
export function WidgetOfflineState({ compact = false, label: labelOverride }: { compact?: boolean; label?: string }) {
  const { t } = useTranslation();
  const label = labelOverride ?? t('panel.widget.offline');
  return (
    <div className={styles.offline}>
      {/* Compact has no visible label, so the glyph carries the name itself. */}
      <WifiOff
        className={styles.icon} strokeWidth={1.5}
        role="img" aria-label={compact ? label : undefined}
      />
      {!compact && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export default WidgetOfflineState;
