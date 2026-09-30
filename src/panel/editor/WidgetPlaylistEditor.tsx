import { SettingSelect, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../lib/i18n';
import { SLIDESHOW_INTERVALS, slideshowIntervalLabel } from '../slideshow/slideshow';
import type { PanelWidgetPlaylist } from '../types';
import styles from './WidgetPlaylistEditor.module.scss';

export interface WidgetPlaylistEditorProps {
  playlist: PanelWidgetPlaylist;
  onChange: (patch: Partial<PanelWidgetPlaylist>) => void;
}

/** Timing for a single-widget panel's playlist; the catalog below it picks and orders the widgets. */
export function WidgetPlaylistEditor({ playlist, onChange }: WidgetPlaylistEditorProps) {
  const { t, language } = useTranslation();
  return (
    <div className={styles.root}>
      <SettingSelect
        label={t('slideshow.interval')}
        value={String(playlist.interval)}
        options={SLIDESHOW_INTERVALS.map(seconds => ({
          value: String(seconds),
          label: slideshowIntervalLabel(t, language, seconds),
        }))}
        onChange={value => onChange({ interval: Number(value) })}
      />
      <SettingToggle
        label={t('slideshow.shuffle')}
        checked={playlist.shuffle}
        onChange={shuffle => onChange({ shuffle })}
      />
      <p className={styles.hint}>{t('panel.playlist.hint')}</p>
    </div>
  );
}
