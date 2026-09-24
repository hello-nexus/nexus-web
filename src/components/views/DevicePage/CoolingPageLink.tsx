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
