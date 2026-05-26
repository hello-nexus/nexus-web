import { useEffect, useState } from 'react';
import { ColorPickerWithPresets } from '../../common/ColorPickerWithPresets/ColorPickerWithPresets';
import { useTranslation } from '../../../lib/i18n';
import {
  PRESET_ACCENTS, THEME_MODES,
  applyAccentColor, applyThemeMode, watchSystemTheme,
  type NexusSettings, type ThemeMode,
} from '../../../lib/settings';
import styles from './SettingsView.module.scss';

export interface ThemeTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
}

export function ThemeTab({ settings, updateGeneral }: ThemeTabProps) {
  const { t } = useTranslation();
  const [liveAccent, setLiveAccent] = useState(settings.general.accentColor);

  useEffect(() => {
    // Sync local "live preview" state when the persisted settings change
    // from elsewhere (sidebar profile switch, settings sync, etc). Can't be
    // derived because the color picker also writes liveAccent locally
    // during a drag-preview gesture without committing to settings yet.
     
    setLiveAccent(settings.general.accentColor);
  }, [settings.general.accentColor]);

  const handleThemeChange = (mode: ThemeMode) => {
    updateGeneral({ themeMode: mode });
    applyThemeMode(mode);
    watchSystemTheme(mode);
  };

  const handleAccentPreview = (hex: string) => {
    setLiveAccent(hex);
    applyAccentColor(hex);
  };

  const handleAccentCommit = (hex: string) => {
    setLiveAccent(hex);
    updateGeneral({ accentColor: hex });
    applyAccentColor(hex);
  };

  return (
    <div className={styles.tabPanel}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('settings.theme')}</span>
        <div className={styles.themeOptions}>
          {THEME_MODES.map(mode => (
            <label key={mode} className={styles.themeOption}>
              <input
                type="radio"
                name="theme"
                value={mode}
                checked={settings.general.themeMode === mode}
                onChange={() => handleThemeChange(mode)}
                className={styles.themeRadio}
              />
              <span className={styles.themeLabel}>{t(`settings.theme.${mode}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.accentSection}>
        <span className={styles.rowLabel}>{t('settings.accent')}</span>
        <ColorPickerWithPresets
          value={liveAccent}
          presets={PRESET_ACCENTS}
          onPreview={handleAccentPreview}
          onCommit={handleAccentCommit}
        />
      </div>
    </div>
  );
}
