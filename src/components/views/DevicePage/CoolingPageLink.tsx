import { Fan } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
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

/** A device Cooling tab's tab-row shortcut: what the Cooling page sets, then a button to it. */
export function CoolingPageShortcut({ onSectionNavigate }: { onSectionNavigate: (section: string) => void }) {
  const { t } = useTranslation();
  const hint = t('devices.coolingPage.setHint');
  return (
    <>
      <span className={styles.coolingShortcutHint} title={hint}>{hint}</span>
      <Button className={styles.coolingShortcutButton} size="sm" tone="neutral" icon={<Fan size={14} />} onClick={() => onSectionNavigate('cooling')}>
        {t('cooling.title')}
      </Button>
    </>
  );
}
