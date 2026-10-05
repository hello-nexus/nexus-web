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
  return (
    <>
      <p className={styles.customNote} data-settings-aside="true">{hint}</p>
      {onSectionNavigate && (
        <div data-settings-aside="true">
          <CoolingPageButton className={styles.lightingLink} onSectionNavigate={onSectionNavigate} />
        </div>
      )}
    </>
  );
}

/** "Go to Cooling", for a device Cooling tab to pin in its tab row. */
export function CoolingPageButton({ onSectionNavigate, className }: {
  onSectionNavigate: (section: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      className={className}
      size="sm"
      tone="neutral"
      icon={<Fan size={14} />}
      onClick={() => onSectionNavigate('cooling')}
    >
      {t('devices.coolingPage.go')}
    </Button>
  );
}
