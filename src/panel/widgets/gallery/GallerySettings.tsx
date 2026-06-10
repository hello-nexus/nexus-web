import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
import styles from './GallerySettings.module.scss';

const INTERVAL_SECONDS = [5, 10, 15, 30, 60];

// Per-instance display settings only. The image sources are per-system
// shared and managed on the gallery page, never from the edit sheet.
export function GallerySettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const mode = ((widget.config?.mode as string | undefined) ?? 'single');
  const interval = String(((widget.config?.interval as number | undefined) ?? 10));

  return (
    <div className={styles.settings}>
      <SettingsSection title={t('gallery.settings.title')}>
        <SettingsSelect
          label={t('gallery.settings.mode')}
          value={mode}
          options={[
            { value: 'single', label: t('gallery.settings.single') },
            { value: 'slideshow', label: t('gallery.settings.slideshow') },
          ]}
          onChange={v => onUpdate({ mode: v })}
        />
        {mode === 'slideshow' && (
          <SettingsSelect
            label={t('gallery.settings.interval')}
            value={interval}
            options={INTERVAL_SECONDS.map(s => ({
              value: String(s),
              label: t('gallery.settings.intervalSeconds', { seconds: s }),
            }))}
            onChange={v => onUpdate({ interval: Number(v) })}
          />
        )}
      </SettingsSection>
    </div>
  );
}

export default GallerySettings;
