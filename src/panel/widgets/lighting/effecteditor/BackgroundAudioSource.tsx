import { SettingSelect } from '../../../../components/common/SettingRow/SettingRow';
import { useLightingAudioOutput } from '../../../../hooks/useLightingAudioOutput';
import { useTranslation } from '../../../../lib/i18n';

/** The capture source the LED audio effects listen to; one setting for both. Windows only: the macOS capture takes the whole system mix. */
export function BackgroundAudioSource() {
  const { t } = useTranslation();
  const audioOutput = useLightingAudioOutput(true);
  return (
    <SettingSelect
      label={t('lighting.audioOutput.label')}
      value={audioOutput.value}
      options={audioOutput.options}
      onChange={audioOutput.select}
    />
  );
}
