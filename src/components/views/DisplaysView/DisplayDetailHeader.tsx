import { LayoutDashboard, Star } from 'lucide-react';
import type { TopologyDisplay } from '../../../api/displays';
import { useTranslation } from '../../../lib/i18n';
import { Badge } from '../../../components/common/Badge/Badge';
import { Button } from '../../../components/common/Button/Button';
import { displaySubtitle } from './displaySubtitle';
import styles from './DisplaysView.module.scss';

interface DisplayDetailHeaderProps {
  display: TopologyDisplay;
  // Same cross-link as the device cards: navigates to the panel's editor page.
  onDeviceSelect: (deviceKey: string) => void;
}

/** Name on the left; panel and primary chips and the editor shortcut grouped on the right. */
export function DisplayDetailHeader({ display, onDeviceSelect }: DisplayDetailHeaderProps) {
  const { t } = useTranslation();
  const subtitle = displaySubtitle(display);
  const editorKey = display.isY70
    ? 'panel-device:y70'
    : display.assignedPanelDeviceId ? `panel-display:${display.assignedPanelDeviceId}` : null;
  return (
    <div className={styles.detailHeader}>
      <div className={styles.detailTitle}>
        <span className={styles.detailName}>{display.name}</span>
        {subtitle && <span className={styles.detailSub}>{subtitle}</span>}
      </div>
      <div className={styles.headerActions}>
        {editorKey && (
          <Badge filled size="small" color="var(--accent)" icon={<LayoutDashboard size={14} />} label={display.isY70 ? t('displays.panel.activeAuto') : t('displays.panel.active')} />
        )}
        {display.isPrimary && (
          <Badge size="small" icon={<Star size={12} />} label={t('displays.primary')} />
        )}
        {editorKey && (
          <Button type="button" tone="neutral" size="sm" onClick={() => onDeviceSelect(editorKey)}>
            {t('displays.panel.open')}
          </Button>
        )}
      </div>
    </div>
  );
}
