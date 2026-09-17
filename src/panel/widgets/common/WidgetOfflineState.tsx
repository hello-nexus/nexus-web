import { WifiOff } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './WidgetOfflineState.module.scss';

/**
 * Shared "the feed is unreachable" state for widgets that need the internet to
 * show anything. A widget renders it once its fetch has settled with no data
 * at all. `compact` drops the label for a cell too small to read one.
 */
export function WidgetOfflineState({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const label = t('panel.widget.offline');
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
