import { useEffect, useState } from 'react';
import type { WidgetSettingsProps } from '../types';
import { SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
import { readCameraConfig, type CameraResolution } from './cameraConfig';
import styles from './CameraSettings.module.scss';

const RESOLUTIONS: CameraResolution[] = ['720p', '1080p'];

interface CameraOption {
  value: string;
  label: string;
}

// Codec 'auto' resolves at start time: H.264 when VideoEncoder accepts the
// config, MJPEG otherwise. The sheet only stores the preference.
export function CameraSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const config = readCameraConfig(widget.config);
  const [cameras, setCameras] = useState<CameraOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Labels stay empty until the user has granted camera access once; the
    // numbered fallback keeps the picker usable before that.
    navigator.mediaDevices?.enumerateDevices?.().then(devices => {
      if (cancelled) return;
      const inputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(inputs.map((d, i) => ({
        value: d.deviceId,
        label: d.label || t('panel.widget.camera.settings.cameraFallback', { n: i + 1 }),
      })));
    }).catch(() => { /* picker keeps only the default entry */ });
    return () => { cancelled = true; };
  }, [t]);

  const cameraOptions: CameraOption[] = [
    { value: '', label: t('panel.widget.camera.settings.defaultCamera') },
    ...cameras.filter(c => c.value !== ''),
  ];
  // A persisted id whose device is gone still has to render as a valid option.
  if (config.deviceId && !cameraOptions.some(c => c.value === config.deviceId)) {
    cameraOptions.push({ value: config.deviceId, label: config.deviceId });
  }

  return (
    <div className={styles.settings}>
      <SettingsSection title={t('panel.widget.camera.settings.title')}>
        <SettingsSelect
          label={t('panel.widget.camera.settings.camera')}
          value={config.deviceId}
          options={cameraOptions}
          onChange={v => onUpdate({ deviceId: v })}
        />
        <SettingsSelect
          label={t('panel.widget.camera.settings.resolution')}
          value={config.resolution}
          options={RESOLUTIONS.map(r => ({ value: r, label: r }))}
          onChange={v => onUpdate({ resolution: v })}
        />
        <SettingsSelect
          label={t('panel.widget.camera.settings.codec')}
          value={config.codec}
          options={[
            // eslint-disable-next-line i18next/no-literal-string -- codec enum value
            { value: 'auto', label: t('panel.widget.camera.settings.codecAuto') },
            // eslint-disable-next-line i18next/no-literal-string -- codec enum value
            { value: 'h264', label: 'H.264' },
            // eslint-disable-next-line i18next/no-literal-string -- codec enum value
            { value: 'mjpeg', label: 'MJPEG' },
          ]}
          onChange={v => onUpdate({ codec: v })}
        />
      </SettingsSection>
    </div>
  );
}

export default CameraSettings;
