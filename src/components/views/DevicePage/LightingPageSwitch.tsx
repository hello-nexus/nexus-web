import { Lightbulb } from 'lucide-react';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

interface LightingPageSwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  onSectionNavigate?: (section: string) => void;
}

/** Hands a device's LEDs to the Lighting page, or back to the animation configured under it. */
export function LightingPageSwitch({ on, onChange, disabled, onSectionNavigate }: LightingPageSwitchProps) {
  const { t } = useTranslation();
  return (
    <>
      <SettingToggle
        label={t('devices.lightingPage.use')}
        description={t('devices.lightingPage.useHint')}
        checked={on}
        onChange={onChange}
        disabled={disabled}
      />
      {on && onSectionNavigate && (
        <div data-settings-aside="true">
          <Button
            className={styles.lightingLink}
            size="sm"
            tone="neutral"
            icon={<Lightbulb size={14} />}
            onClick={() => onSectionNavigate('lighting')}
          >
            {t('smartLights.colorOnLightingPage')}
          </Button>
        </div>
      )}
    </>
  );
}
