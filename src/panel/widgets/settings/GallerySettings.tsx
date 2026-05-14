import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection } from './SettingsRow';
import styles from './GallerySettings.module.scss';

const MODE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'slideshow', label: 'Slideshow' },
];

const INTERVAL_OPTIONS = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
];

export function GallerySettings({ widget, onUpdate }: WidgetSettingsProps) {
  const mode = ((widget.config?.mode as string | undefined) ?? 'single');
  const interval = String(((widget.config?.interval as number | undefined) ?? 10));
  const urls = ((widget.config?.urls as string | undefined) ?? '');

  return (
    <div className={styles.settings}>
      <SettingsSection title="Display">
        <SettingsSelect
          label="Mode"
          value={mode}
          options={MODE_OPTIONS}
          onChange={v => onUpdate({ mode: v })}
        />
        {mode === 'slideshow' && (
          <SettingsSelect
            label="Interval"
            value={interval}
            options={INTERVAL_OPTIONS}
            onChange={v => onUpdate({ interval: Number(v) })}
          />
        )}
      </SettingsSection>
      <SettingsSection title="Images">
        <div className={styles.urlsRow}>
          <label className={styles.urlsLabel}>Image URLs (one per line)</label>
          <textarea
            className={styles.textarea}
            value={urls}
            onChange={e => onUpdate({ urls: e.target.value })}
            placeholder={'https://example.com/image1.jpg\nhttps://example.com/image2.jpg'}
            rows={6}
            spellCheck={false}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

export default GallerySettings;
