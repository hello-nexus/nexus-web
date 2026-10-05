import { Fan, Lightbulb } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import styles from './LianLiDevicePage.module.scss';

interface CoolingPageLinkProps {
  hint: string;
  onSectionNavigate?: (section: string) => void;
}

/** A device Cooling tab's pointer to the Cooling page, where curves and every fan live. */
export function CoolingPageLink({ hint, onSectionNavigate }: CoolingPageLinkProps) {
  const { t } = useTranslation();
  return (
    <>
      <p className={styles.customNote} data-settings-aside="true">{hint}</p>
      {onSectionNavigate && (
        <div data-settings-aside="true">
          <Button
            className={styles.lightingLink}
            size="sm"
            tone="neutral"
            icon={<Fan size={14} />}
            onClick={() => onSectionNavigate('cooling')}
          >
            {t('devices.coolingPage.go')}
          </Button>
        </div>
      )}
    </>
  );
}

/** A device Cooling tab's tab-row button to the Cooling page, labelled with what it sets there. */
export function CoolingPageShortcut({ onSectionNavigate, anchors }: { onSectionNavigate: DashboardSectionNavigate; anchors?: readonly string[] }) {
  const { t } = useTranslation();
  const label = t('devices.coolingPage.setHint');
  return (
    <Button className={styles.pageShortcutButton} size="sm" tone="neutral" icon={<Fan size={14} />} title={label} onClick={() => onSectionNavigate('cooling', anchors ? { scrollAnchors: anchors } : undefined)}>
      <span className={styles.pageShortcutLabel}>{label}</span>
    </Button>
  );
}

/** A device Lighting tab's tab-row button to the Lighting page, labelled with what it sets there. */
export function LightingPageShortcut({ onSectionNavigate, anchors }: { onSectionNavigate: DashboardSectionNavigate; anchors?: readonly string[] }) {
  const { t } = useTranslation();
  const label = t('devices.lightingPage.setHint');
  return (
    <Button className={styles.pageShortcutButton} size="sm" tone="neutral" icon={<Lightbulb size={14} />} title={label} onClick={() => onSectionNavigate('lighting', anchors ? { scrollAnchors: anchors } : undefined)}>
      <span className={styles.pageShortcutLabel}>{label}</span>
    </Button>
  );
}
