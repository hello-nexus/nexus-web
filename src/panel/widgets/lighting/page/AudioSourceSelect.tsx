import { Select } from '../../../../components/common/Select/Select';
import { useLightingAudioOutput } from '../../../../hooks/useLightingAudioOutput';
import { useTranslation } from '../../../../lib/i18n';

/** The service-wide capture source for audio-reactive effects. Every mounted copy reads and writes the same setting and follows the service's lighting topic. */
export function AudioSourceSelect({ className }: { className?: string }) {
  const { t } = useTranslation();
  const audioOutput = useLightingAudioOutput(true);
  return (
    <Select
      className={className}
      value={audioOutput.value}
      options={audioOutput.options}
      onChange={audioOutput.select}
      ariaLabel={t('lighting.audioOutput.label')}
      height={26}
    />
  );
}
