import { Button } from '../../common/Button/Button';
import { Notice } from '../../common/Notice/Notice';
import { useFeatureFlags, useUiSettingsUpdateSafe } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';

/// Page-top notice for the Keeb page while the master Lighting switch is off.
/// The service drops the keyboard's device-setting writes (wheel assignment,
/// firmware lighting, Game Mode) in that state, so the page says so and offers
/// the switch. Renders nothing while Lighting is on.
export function KeebLightingOffNotice() {
  const { t } = useTranslation();
  const lightingOn = useFeatureFlags().lighting;
  const update = useUiSettingsUpdateSafe();
  if (lightingOn) return null;
  return (
    <Notice
      tone="info"
      role="status"
      actions={(
        <Button size="sm" tone="neutral" onClick={() => update({ featureLightingEnabled: true })}>
          {t('keeb.lightingOffEnable')}
        </Button>
      )}
    >
      {t('keeb.lightingOff')}
    </Notice>
  );
}
