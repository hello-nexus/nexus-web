import { useState } from 'react';
import { ColorPickerWithPresets } from '../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { Slider } from '../../components/common/Slider/Slider';
import { Tabs } from '../../components/common/Tabs/Tabs';
import { SectionHeader } from '../../components/common/SectionHeader/SectionHeader';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../lib/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS, THEME_MODES, type ThemeMode } from '../../lib/settings';
import type { EffectState } from '../../types/lighting';
import {
  PANEL_BACKGROUND_EFFECTS,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundDefault,
  panelBackgroundPresets,
  resolvePanelBackground,
  type PanelBackgroundMode,
} from '../background/panelBackground';
import { BackgroundEffectPreview } from '../widgets/lighting/effecteditor/BackgroundEffectPreview';
import { usePanelBackgroundEffectController } from '../widgets/lighting/effecteditor/usePanelBackgroundEffectController';
import { AnimateCategoryChips, AnimateGrid, type AnimateFilter } from '../widgets/lighting/page/AnimateGrid';
import { EffectControls } from '../widgets/lighting/page/EffectControls';
import styles from './PanelThemeSettings.module.scss';

export type ResolvedPanelThemeMode = 'dark' | 'light';

export interface PanelThemeSettingsState {
  appThemeMode: ThemeMode;
  // Desktop app's resolved theme from prefs.theme.resolvedThemeMode. '' when the
  // service/desktop hasn't published one; sync mode then falls back to
  // appThemeMode. Concrete value here = follow the desktop OS, not the panel's.
  appResolvedThemeMode: '' | ResolvedPanelThemeMode;
  themeSyncWithDesktop: boolean;
  themeMode: ThemeMode;
  appAccentColor: string;
  accentSyncWithDesktop: boolean;
  accentColor: string;
  backgroundColor: string;
  backgroundColorLight: string;
  backgroundMode: PanelBackgroundMode;
  backgroundEffect: string;
  backgroundTemplate: number;
  backgroundOpacity: number;
  backgroundEffectState: EffectState;
  widgetOpacity: number;
  widgetLabels: boolean;
  widgetBlur: boolean;
}

export interface PanelThemeSettingsProps {
  theme: PanelThemeSettingsState;
  resolvedThemeMode: ResolvedPanelThemeMode;
  onThemeSyncCommit: (synced: boolean) => void;
  onThemeModeCommit: (mode: ThemeMode) => void;
  onAccentSyncCommit: (synced: boolean) => void;
  onAccentPreview: (hex: string) => void;
  onAccentCommit: (hex: string) => void;
  onBackgroundPreview: (hex: string) => void;
  onBackgroundCommit: (hex: string) => void;
  onBackgroundModeCommit: (mode: PanelBackgroundMode) => void;
  onBackgroundEffectCommit: (effect: string) => void;
  onBackgroundTemplateCommit: (template: number) => void;
  onBackgroundEffectStatePreview: (state: EffectState) => void;
  onBackgroundEffectStateCommit: (state: EffectState) => void;
  onBackgroundOpacityPreview: (opacity: number) => void;
  onBackgroundOpacityCommit: (opacity: number) => void;
  onWidgetOpacityPreview: (opacity: number) => void;
  onWidgetOpacityCommit: (opacity: number) => void;
  onWidgetLabelsCommit: (enabled: boolean) => void;
  onWidgetBlurCommit: (enabled: boolean) => void;
  /** Hide the widget-labels toggle. Single-widget surfaces (q-series) lock
   * labels off. */
  hideWidgetLabelsToggle?: boolean;
}

export function PanelThemeSettings({
  theme,
  resolvedThemeMode,
  onThemeSyncCommit,
  onThemeModeCommit,
  onAccentSyncCommit,
  onAccentPreview,
  onAccentCommit,
  onBackgroundPreview,
  onBackgroundCommit,
  onBackgroundModeCommit,
  onBackgroundEffectCommit,
  onBackgroundTemplateCommit,
  onBackgroundEffectStatePreview,
  onBackgroundEffectStateCommit,
  onBackgroundOpacityPreview,
  onBackgroundOpacityCommit,
  onWidgetOpacityPreview,
  onWidgetOpacityCommit,
  onWidgetLabelsCommit,
  onWidgetBlurCommit,
  hideWidgetLabelsToggle = false,
}: PanelThemeSettingsProps) {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const syncWithDesktopLabel = t('panel.settings.syncWithDesktop') || 'Sync with desktop';
  const backgroundEffect = normalizePanelBackgroundEffect(theme.backgroundEffect);
  const backgroundTemplate = normalizePanelBackgroundTemplate(theme.backgroundTemplate);
  const backgroundOpacityPercent = Math.round(theme.backgroundOpacity * 100);
  const widgetOpacityPercent = Math.round(theme.widgetOpacity * 100);

  // Options | Effect tab and chip-filter state, owned here (not by the
  // EffectEditor shell) so the preview + tab bars + chips can sit in one
  // sticky dock while the grid / controls scroll with the page.
  const [editorTab, setEditorTab] = useState<'options' | 'effect'>('options');
  const [animationFilter, setAnimationFilter] = useState<AnimateFilter>('all');

  // The same Options | Effect editing surface as the immersive lighting view,
  // here targeting this panel's per-device background effect (animate-only).
  const backgroundController = usePanelBackgroundEffectController({
    effect: backgroundEffect,
    template: backgroundTemplate,
    effectState: theme.backgroundEffectState,
    onSelectEffect: onBackgroundEffectCommit,
    onTemplateSelect: onBackgroundTemplateCommit,
    onPreview: onBackgroundEffectStatePreview,
    onCommit: onBackgroundEffectStateCommit,
  });

  // Rendered in normal flow for solid mode, inside the sticky dock for shader
  // mode (one instance keeps the pill state/animation continuous).
  const backgroundModeTabs = (
    <Tabs
      variant="pill"
      fullWidth
      tabs={[
        { key: 'solid', label: label('panel.settings.backgroundMode.solid', 'Solid') },
        { key: 'shader', label: label('panel.settings.backgroundMode.animations', 'Animations') },
      ]}
      activeKey={theme.backgroundMode}
      onChange={key => onBackgroundModeCommit(key as PanelBackgroundMode)}
      ariaLabel={label('panel.settings.backgroundMode', 'Background mode')}
    />
  );

  return (
    <div className={styles.themePanel}>
      <SettingsSection title={label('panel.settings.widgets', 'Widgets')} boxClassName={styles.themeBox}>
        {!hideWidgetLabelsToggle && (
          <SettingToggle
            label={label('panel.settings.widgetLabels', 'Widget labels')}
            checked={theme.widgetLabels}
            onChange={onWidgetLabelsCommit}
          />
        )}
        <SettingToggle
          label={label('panel.settings.widgetBlur', 'Widget blur')}
          checked={theme.widgetBlur}
          onChange={onWidgetBlurCommit}
        />
        <Slider
          orientation="stacked"
          label={label('panel.settings.widgetOpacity', 'Widget opacity')}
          value={widgetOpacityPercent}
          min={0}
          max={100}
          step={1}
          trackFill={widgetOpacityPercent}
          formatValue={v => `${v}%`}
          onChange={(v, commit) => {
            const next = v / 100;
            if (commit) onWidgetOpacityCommit(next);
            else onWidgetOpacityPreview(next);
          }}
          onCommit={v => onWidgetOpacityCommit(v / 100)}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.theme') || 'Theme'} boxClassName={styles.themeBox}>
        <SettingToggle
          label={syncWithDesktopLabel}
          checked={theme.themeSyncWithDesktop}
          onChange={onThemeSyncCommit}
        />
        {!theme.themeSyncWithDesktop && (
          <Tabs
            variant="pill"
            tabs={THEME_MODES.map(mode => ({
              key: mode,
              label: t(`settings.theme.${mode}`) || (mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'),
            }))}
            activeKey={theme.themeMode}
            onChange={key => onThemeModeCommit(key as ThemeMode)}
            ariaLabel={t('settings.theme') || 'Theme'}
            className={styles.themeModeTabs}
          />
        )}
      </SettingsSection>

      <SettingsSection title={t('devices.y70.theme.accent') || 'Accent Color'} boxClassName={styles.themeBox}>
        <SettingToggle
          label={syncWithDesktopLabel}
          checked={theme.accentSyncWithDesktop}
          onChange={onAccentSyncCommit}
        />
        {!theme.accentSyncWithDesktop && (
          <ColorPickerWithPresets
            value={theme.accentColor || theme.appAccentColor}
            presets={PRESET_ACCENTS}
            fallback={theme.appAccentColor || DEFAULT_ACCENT}
            onPreview={onAccentPreview}
            onCommit={onAccentCommit}
          />
        )}
      </SettingsSection>

      {/* Background stays unboxed: a sticky live-preview dock + scrolling
          effect grid, not a simple settings card. Header restyles via the
          shared SectionHeader. */}
      <div className={styles.themeSection}>
        <SectionHeader>{t('devices.y70.theme.background') || 'Background'}</SectionHeader>
        {theme.backgroundMode === 'solid' ? (
          <>
            {backgroundModeTabs}
            <ColorPickerWithPresets
              value={resolvePanelBackground(theme.backgroundColor, theme.backgroundColorLight, resolvedThemeMode)}
              presets={panelBackgroundPresets(resolvedThemeMode)}
              fallback={panelBackgroundDefault(resolvedThemeMode)}
              onPreview={onBackgroundPreview}
              onCommit={onBackgroundCommit}
            />
          </>
        ) : (
          <>
            <div className={styles.backgroundDock}>
              {backgroundModeTabs}
              <BackgroundEffectPreview
                effect={backgroundEffect}
                template={backgroundTemplate}
                effectState={theme.backgroundEffectState}
              />
              <Tabs
                variant="pill"
                fullWidth
                tabs={[
                  { key: 'options', label: t('lighting.editor.options') },
                  { key: 'effect', label: t('lighting.rightPane.effect') },
                ]}
                activeKey={editorTab}
                onChange={key => setEditorTab(key as 'options' | 'effect')}
                ariaLabel={t('lighting.rightPane.label')}
              />
              {editorTab === 'options' && (
                <AnimateCategoryChips
                  effects={PANEL_BACKGROUND_EFFECTS}
                  value={animationFilter}
                  onChange={setAnimationFilter}
                />
              )}
            </div>
            {editorTab === 'options' ? (
              <AnimateGrid
                effect={backgroundEffect}
                onSelect={onBackgroundEffectCommit}
                effects={PANEL_BACKGROUND_EFFECTS}
                filter={animationFilter}
              />
            ) : (
              <>
                <EffectControls
                  effect={backgroundController.effect}
                  state={backgroundController.state}
                  bundle={backgroundController.bundle}
                  canReset={backgroundController.canReset}
                  onTemplateSelect={backgroundController.onTemplateSelect}
                  onChange={backgroundController.onChange}
                  onCommit={backgroundController.onCommit}
                  onReset={backgroundController.onReset}
                />
                <Slider
                  orientation="stacked"
                  label={label('panel.settings.backgroundOpacity', 'Background Opacity')}
                  value={backgroundOpacityPercent}
                  min={0}
                  max={100}
                  step={1}
                  trackFill={backgroundOpacityPercent}
                  formatValue={v => `${v}%`}
                  onChange={(v, commit) => {
                    const next = v / 100;
                    if (commit) onBackgroundOpacityCommit(next);
                    else onBackgroundOpacityPreview(next);
                  }}
                  onCommit={v => onBackgroundOpacityCommit(v / 100)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
