import { Lightbulb } from 'lucide-react';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { useTranslation } from '../../../lib/i18n';

interface LightingPageSwitchProps {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  onSectionNavigate?: (section: string) => void;
}

/** Hands a device's LEDs to the Lighting page, or back to the animation configured under it. */
export function LightingPageSwitch({ on, onChange, disabled, onSectionNavigate }: LightingPageSwitchProps) {
  const { t } = useTranslation();
  // The link rides the label line and is only hidden while off, so the row never changes height.
  const link = onSectionNavigate && (
    <span style={{ visibility: on ? 'visible' : 'hidden' }} aria-hidden={!on}>
      <Button
        size="sm"
        tone="neutral"
        icon={<Lightbulb size={14} />}
        disabled={!on}
        tabIndex={on ? 0 : -1}
        onClick={() => onSectionNavigate('lighting')}
      >
        {t('smartLights.colorOnLightingPage')}
      </Button>
    </span>
  );
  return (
    <SettingToggle
      label={t('devices.lightingPage.use')}
      labelSuffix={link}
      description={t('devices.lightingPage.useHint')}
      checked={on}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
