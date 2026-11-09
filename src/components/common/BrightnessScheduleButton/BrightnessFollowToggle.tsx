import { useTranslation } from '../../../lib/i18n';
import { SettingToggle } from '../SettingRow/SettingRow';
import { BrightnessScheduleButton } from './BrightnessScheduleButton';

/** How a brightness control binds to the one universal schedule. */
export interface BrightnessScheduleBinding {
  scheduleOn: boolean;
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  onOpen: () => void;
}

/** The shared sun button, accented while the schedule is on and this control follows it. */
export function BrightnessSun({ binding }: { binding: BrightnessScheduleBinding }) {
  const { t } = useTranslation();
  const following = binding.scheduleOn && binding.follows;
  return (
    <BrightnessScheduleButton
      active={following}
      canOpen
      onOpen={binding.onOpen}
      status={!binding.scheduleOn ? t('lighting.schedule.now.off')
        : following ? t('lighting.schedule.follow.deviceFollowing')
          : t('lighting.schedule.marker.notFollowing')}
    />
  );
}

/** The per-device "Follow brightness schedule" setting row. Inert while the schedule is off. */
export function BrightnessFollowToggle({ binding }: { binding: BrightnessScheduleBinding }) {
  const { t } = useTranslation();
  return (
    <SettingToggle
      label={t('lighting.schedule.follow.deviceLabel')}
      description={binding.scheduleOn ? t('lighting.schedule.follow.deviceDescription') : t('lighting.schedule.follow.needsSchedule')}
      checked={binding.scheduleOn && binding.follows}
      disabled={!binding.scheduleOn}
      onChange={binding.onFollowsChange}
    />
  );
}
