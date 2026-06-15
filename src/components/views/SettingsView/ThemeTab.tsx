import { useEffect, useState } from 'react';
import { ColorPickerWithPresets } from '../../common/ColorPickerWithPresets/ColorPickerWithPresets';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { Tabs } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import { hostSupportsGlass } from '../../../app/windowActions';
import {
  PRESET_ACCENTS, THEME_MODES, BACKGROUND_MODES,
  applyAccentColor, applyThemeMode, applyBackgroundMode, watchSystemTheme,
  type NexusSettings, type ThemeMode, type BackgroundMode, type AccentSource,
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

  const handleBackgroundChange = (mode: BackgroundMode) => {
    updateGeneral({ backgroundMode: mode });
    applyBackgroundMode(mode);
  };

  // Hide 'glass' where the host can't render translucency (Linux / browser).
  // The stored value is left untouched so a Windows/macOS app shell still gets
  // real glass; here a persisted 'glass' just reads as 'flat' (its actual
  // render) so the picker shows a coherent selection.
  const supportsGlass = hostSupportsGlass();
  const backgroundModes = supportsGlass
    ? BACKGROUND_MODES
    : BACKGROUND_MODES.filter(mode => mode !== 'glass');
  const backgroundActiveKey =
    !supportsGlass && settings.general.backgroundMode === 'glass'
      ? 'flat'
      : settings.general.backgroundMode;

  const handleAccentSourceChange = (source: AccentSource) => {
    if (source === 'system') {
      // SystemAccentSync re-applies the OS accent off the source change.
      updateGeneral({ accentSource: 'system' });
    } else {
      updateGeneral({ accentSource: 'custom' });
      applyAccentColor(liveAccent);
    }
  };

  const handleAccentPreview = (hex: string) => {
    setLiveAccent(hex);
    applyAccentColor(hex);
  };

  const handleAccentCommit = (hex: string) => {
    setLiveAccent(hex);
    // Picking a colour switches off the system-accent tracking.
    updateGeneral({ accentColor: hex, accentSource: 'custom' });
    applyAccentColor(hex);
  };

  return (
    <>
      <SettingRow label={t('settings.theme')}>
        <Tabs
          ariaLabel={t('settings.theme')}
          activeKey={settings.general.themeMode}
          onChange={k => handleThemeChange(k as ThemeMode)}
          tabs={THEME_MODES.map(mode => ({ key: mode, label: t(`settings.theme.${mode}`) }))}
        />
      </SettingRow>

      <SettingRow label={t('settings.background')}>
        <Tabs
          ariaLabel={t('settings.background')}
          activeKey={backgroundActiveKey}
          onChange={k => handleBackgroundChange(k as BackgroundMode)}
          tabs={backgroundModes.map(mode => ({ key: mode, label: t(`settings.background.${mode}`) }))}
        />
      </SettingRow>

      <SettingRow label={t('settings.accent')}>
        <Tabs
          ariaLabel={t('settings.accent')}
          activeKey={settings.general.accentSource}
          onChange={k => handleAccentSourceChange(k as AccentSource)}
          tabs={[
            // eslint-disable-next-line i18next/no-literal-string -- accent source enum value
            { key: 'system', label: t('settings.accent.system') },
            // eslint-disable-next-line i18next/no-literal-string -- accent source enum value
            { key: 'custom', label: t('settings.accent.custom') },
          ]}
        />
      </SettingRow>
      {settings.general.accentSource === 'custom' && (
        <div className={styles.accentPickerRow}>
          <div className={styles.accentPicker}>
            <ColorPickerWithPresets
              value={liveAccent}
              presets={PRESET_ACCENTS}
              onPreview={handleAccentPreview}
              onCommit={handleAccentCommit}
            />
          </div>
        </div>
      )}
    </>
  );
}
