import type { WidgetSettingsProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { SettingsSection, SettingsSelect, SettingsToggle, SettingsHint } from '../common/SettingsRow/SettingsRow';
import { MEDIA_VISUALIZER_EFFECTS, normalizeVisualizerEffect, visualizerLabelKey } from './mediaVisualizers';
import { MEDIA_VOLUME_MODES, normalizeVolumeMode } from './mediaVolumeTarget';
import styles from './MediaSettings.module.scss';

export function MediaSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const visualizer = widget.config?.visualizer === true;
  const effect = normalizeVisualizerEffect(widget.config?.visualizerEffect);
  const volumeMode = normalizeVolumeMode(widget.config?.volumeTarget);
  const deviceId = typeof widget.config?.volumeDeviceId === 'string' ? widget.config.volumeDeviceId : '';
  const deviceName = typeof widget.config?.volumeDeviceName === 'string' ? widget.config.volumeDeviceName : '';
  const { outputs } = useAudioDevices(volumeMode === 'output');

  const deviceOptions = [
    { value: '', label: t('panel.media.volumeTarget.systemDefault') },
    ...outputs.map(d => ({ value: d.id, label: d.name })),
  ];
  // An unplugged pick stays selected under the name captured when it was chosen.
  if (deviceId && !outputs.some(d => d.id === deviceId)) {
    deviceOptions.push({ value: deviceId, label: deviceName || deviceId });
  }

  return (
    <div className={styles.container}>
      <SettingsSection title={t('panel.media.visualizer.label')}>
        <SettingsToggle
          label={t('panel.media.visualizer.startOn')}
          checked={visualizer}
          onChange={value => onUpdate({ visualizer: value })}
        />
        <SettingsSelect
          label={t('panel.media.visualizer.effect')}
          value={effect}
          options={MEDIA_VISUALIZER_EFFECTS.map(key => ({ value: key, label: t(visualizerLabelKey(key)) }))}
          onChange={value => onUpdate({ visualizerEffect: value })}
        />
        <SettingsHint>{t('panel.media.visualizer.hint')}</SettingsHint>
      </SettingsSection>
      <SettingsSection title={t('panel.media.volumeTarget.label')}>
        <SettingsSelect
          label={t('panel.media.volumeTarget.mode')}
          value={volumeMode}
          options={MEDIA_VOLUME_MODES.map(mode => ({ value: mode, label: t(`panel.media.volumeTarget.${mode}`) }))}
          onChange={value => onUpdate({ volumeTarget: value })}
        />
        {volumeMode === 'output' && (
          <SettingsSelect
            label={t('panel.media.volumeTarget.device')}
            value={deviceId}
            options={deviceOptions}
            onChange={value => onUpdate({
              volumeDeviceId: value,
              volumeDeviceName: outputs.find(d => d.id === value)?.name ?? '',
            })}
          />
        )}
        <SettingsHint>{t(`panel.media.volumeTarget.hint.${volumeMode}`)}</SettingsHint>
      </SettingsSection>
    </div>
  );
}

export default MediaSettings;
