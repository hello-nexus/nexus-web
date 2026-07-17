import { useState } from 'react';
import { ChipGroup } from '../../components/common/ChipGroup/ChipGroup';
import { ColorPickerWithPresets } from '../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { Tabs } from '../../components/common/Tabs/Tabs';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingSlider, SettingToggle } from '../../components/common/SettingRow/SettingRow';
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
  type PanelBackgroundFrost,
  type PanelBackgroundMode,
} from '../background/panelBackground';
import { BackgroundEffectPreview } from '../widgets/lighting/effecteditor/BackgroundEffectPreview';
import { usePanelBackgroundEffectController } from '../widgets/lighting/effecteditor/usePanelBackgroundEffectController';
import { usePanelBackgroundUsage } from '../../hooks/usePanelBackgroundUsage';
import { AnimateGrid } from '../widgets/lighting/page/AnimateGrid';
import { EffectControls } from '../widgets/lighting/page/EffectControls';
import { BackgroundMediaPicker } from '../background/BackgroundMediaPicker';
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
  // Per-shader preset selection for this panel (effect key → preset index).
  // backgroundTemplate is the active shader's entry; this holds every shader's.
  backgroundTemplates: Record<string, number>;
  backgroundOpacity: number;
  // False = no background at all: kiosk-hosted panels (y70 / monitor) render
  // fully transparent and the Windows desktop shows through the widgets.
  backgroundEnabled: boolean;
  backgroundEffectState: EffectState;
  backgroundMediaId: string | null;
  backgroundMediaType: 'static' | 'animated' | null;
  // Frosted-glass blur over the background layer (shader / media / wallpaper).
  backgroundFrost: PanelBackgroundFrost;
  widgetOpacity: number;
  widgetLabels: boolean;
  // Percent 0-100 (see defaultPanelWidgetPadding, PANEL_WIDGET_PADDING_MAX_RATIO).
  widgetPadding: number;
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
  onBackgroundEnabledCommit: (enabled: boolean) => void;
  onBackgroundEffectCommit: (effect: string) => void;
  onBackgroundTemplateCommit: (template: number) => void;
  onBackgroundEffectStatePreview: (state: EffectState) => void;
  onBackgroundEffectStateCommit: (state: EffectState) => void;
  onBackgroundOpacityPreview: (opacity: number) => void;
  onBackgroundOpacityCommit: (opacity: number) => void;
  onBackgroundMediaCommit: (mediaId: string | null, type: 'static' | 'animated' | null) => void;
  onBackgroundFrostCommit: (level: PanelBackgroundFrost) => void;
  onWidgetOpacityPreview: (opacity: number) => void;
  onWidgetOpacityCommit: (opacity: number) => void;
  onWidgetLabelsCommit: (enabled: boolean) => void;
  onWidgetPaddingPreview: (percent: number) => void;
  onWidgetPaddingCommit: (percent: number) => void;
  /** Show the media background tab. All display-backed surfaces support it; the
   * embedded desktop deck never renders theme backgrounds (PanelApp gates on
   * !embedded || simulator), so desktop hides it. Tunneled panels also hide it:
   * media import is LAN-only (postServiceForm fails closed off-LAN). */
  showMediaTab?: boolean;
  /** Device aspect ratio (W/H) forwarded to the media cropper. */
  deviceAspect?: number;
  /** Device native pixel width for the import conversion. */
  deviceW?: number;
  /** Device native pixel height for the import conversion. */
  deviceH?: number;
  /** Hide the widget-labels toggle. Single-widget surfaces (q-series) lock
   * labels off. */
  hideWidgetLabelsToggle?: boolean;
  /** Hide the widget opacity + padding controls. Single-widget surfaces
   * (q-series) force the tile fully transparent, so they don't apply. */
  hideWidgetChromeControls?: boolean;
  /** This panel's device id, excluded from the "used by a panel" badge so its
   * own background never badges itself. */
  deviceId?: string | null;
  /** Show the background on/off toggle. Kiosk-hosted surfaces (y70 / monitor)
   * only: off renders the page transparent so the desktop shows through. */
  showBackgroundToggle?: boolean;
}

export function PanelThemeSettings({
  theme,
  resolvedThemeMode,
  deviceId,
  onThemeSyncCommit,
  onThemeModeCommit,
  onAccentSyncCommit,
  onAccentPreview,
  onAccentCommit,
  onBackgroundPreview,
  onBackgroundCommit,
  onBackgroundModeCommit,
  onBackgroundEnabledCommit,
  onBackgroundEffectCommit,
  onBackgroundTemplateCommit,
  onBackgroundEffectStatePreview,
  onBackgroundEffectStateCommit,
  onBackgroundOpacityPreview,
  onBackgroundOpacityCommit,
  onBackgroundMediaCommit,
  onBackgroundFrostCommit,
  onWidgetOpacityPreview,
  onWidgetOpacityCommit,
  onWidgetLabelsCommit,
  onWidgetPaddingPreview,
  onWidgetPaddingCommit,
  showMediaTab = false,
  deviceAspect = 9 / 16,
  deviceW,
  deviceH,
  hideWidgetLabelsToggle = false,
  hideWidgetChromeControls = false,
  showBackgroundToggle = false,
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
  const widgetPaddingLabel = label('panel.settings.widgetPadding', 'Widget padding');
  // Frost renders over the wallpaper and the shader / media layers; solid mode
  // has no frost pass, so the control disables there.
  const frostApplies = (showBackgroundToggle && !theme.backgroundEnabled)
    || theme.backgroundMode !== 'solid';

  // Options | Effect tab and chip-filter state, owned here (not by the
  // EffectEditor shell) so the preview + tab bars + chips can sit in one
  // sticky dock while the grid / controls scroll with the page.
  const [editorTab, setEditorTab] = useState<'options' | 'effect'>('options');

  // The same Options | Effect editing surface as the immersive lighting view,
  // here targeting this panel's per-device background effect (animate-only).
  const backgroundController = usePanelBackgroundEffectController({
    effect: backgroundEffect,
    template: backgroundTemplate,
    templatesByEffect: theme.backgroundTemplates,
    effectState: theme.backgroundEffectState,
    onSelectEffect: onBackgroundEffectCommit,
    onTemplateSelect: onBackgroundTemplateCommit,
    onPreview: onBackgroundEffectStatePreview,
    onCommit: onBackgroundEffectStateCommit,
  });

  // Cross-panel usage drives the "used by a panel" badge on the grid + presets,
  // excluding this panel so its own selection never badges itself.
  const panelUsage = usePanelBackgroundUsage(deviceId);

  // Rendered in normal flow for solid mode, inside the sticky dock for shader
  // mode (one instance keeps the pill state/animation continuous).
  const backgroundModeTabs = (
    <Tabs
      fullWidth
      tabs={[
        // eslint-disable-next-line i18next/no-literal-string -- background-mode enum id
        { key: 'solid', label: label('panel.settings.backgroundMode.solid', 'Solid') },
        // eslint-disable-next-line i18next/no-literal-string -- background-mode enum id
        { key: 'shader', label: label('panel.settings.backgroundMode.animations', 'Animations') },
        // eslint-disable-next-line i18next/no-literal-string -- background-mode enum id
        ...(showMediaTab ? [{ key: 'media', label: label('panel.settings.backgroundMode.media', 'Media') }] : []),
      ]}
      activeKey={theme.backgroundMode}
      onChange={key => onBackgroundModeCommit(key as PanelBackgroundMode)}
      ariaLabel={label('panel.settings.backgroundMode', 'Background mode')}
    />
  );

  // Opacity of the solid colour / shader / media / wallpaper layer over the
  // theme's dark/light backdrop; applies to every mode including wallpaper
  // see-through, so it renders outside the wallpaper-mode gate below.
  const backgroundOpacitySlider = (
    <SettingSlider
      editable
      trackFill
      label={label('panel.settings.backgroundOpacity', 'Background Opacity')}
      value={backgroundOpacityPercent}
      min={0}
      max={100}
      step={1}
      formatValue={v => `${v}%`}
      onChange={(v, commit) => {
        const next = v / 100;
        if (commit) onBackgroundOpacityCommit(next);
        else onBackgroundOpacityPreview(next);
      }}
      onCommit={v => onBackgroundOpacityCommit(v / 100)}
    />
  );

  return (
    <div className={styles.themePanel}>
      {(!hideWidgetLabelsToggle || !hideWidgetChromeControls) && (
        <SettingsSection title={label('panel.settings.widgets', 'Widgets')} boxClassName={styles.themeBox}>
          {!hideWidgetLabelsToggle && (
            <SettingToggle
              label={label('panel.settings.widgetLabels', 'Widget labels')}
              checked={theme.widgetLabels}
              onChange={onWidgetLabelsCommit}
            />
          )}
          {!hideWidgetChromeControls && (
            <SettingSlider
              editable
              trackFill
              label={label('panel.settings.widgetOpacity', 'Widget opacity')}
              value={widgetOpacityPercent}
              min={0}
              max={100}
              step={1}
              formatValue={v => `${v}%`}
              onChange={(v, commit) => {
                const next = v / 100;
                if (commit) onWidgetOpacityCommit(next);
                else onWidgetOpacityPreview(next);
              }}
              onCommit={v => onWidgetOpacityCommit(v / 100)}
            />
          )}
          {!hideWidgetChromeControls && (
            <SettingSlider
              editable
              trackFill
              label={widgetPaddingLabel}
              value={theme.widgetPadding}
              min={0}
              max={100}
              step={1}
              formatValue={v => `${v}%`}
              onChange={(v, commit) => {
                if (commit) onWidgetPaddingCommit(v);
                else onWidgetPaddingPreview(v);
              }}
              onCommit={onWidgetPaddingCommit}
            />
          )}
        </SettingsSection>
      )}

      <SettingsSection title={label('settings.theme', 'Theme')} boxClassName={styles.themeBox}>
        <div className={styles.toggleReveal}>
          <SettingToggle
            label={syncWithDesktopLabel}
            checked={theme.themeSyncWithDesktop}
            onChange={onThemeSyncCommit}
          />
          {!theme.themeSyncWithDesktop && (
            <Tabs
              tabs={THEME_MODES.map(mode => ({
                key: mode,
                label: t(`settings.theme.${mode}`) || (mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'),
              }))}
              activeKey={theme.themeMode}
              onChange={key => onThemeModeCommit(key as ThemeMode)}
              ariaLabel={label('settings.theme', 'Theme')}
              className={styles.themeModeTabs}
            />
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={label('devices.y70.theme.accent', 'Accent Color')} boxClassName={styles.themeBox}>
        <div className={styles.toggleReveal}>
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
        </div>
      </SettingsSection>

      <SettingsSection title={label('devices.y70.theme.background', 'Background')} boxClassName={styles.backgroundBox}>
        {/* Single aside child so the box adds no row dividers between the
            opacity slider, mode tabs, and the mode content. */}
        <div className={styles.backgroundContent} data-settings-aside>
          {showBackgroundToggle && (
            // Inverted view of backgroundEnabled: the wire field is
            // "background on"; only this control reads as "wallpaper on".
            // A null wire value resolves per capability (wallpaper-capable
            // panels default to wallpaper) - see resolvePanelBackgroundEnabled.
            <SettingToggle
              label={label('panel.settings.backgroundWallpaper', 'Use wallpaper for background')}
              description={label('panel.settings.backgroundWallpaper.desc', 'Shows the desktop wallpaper behind the widgets')}
              checked={!theme.backgroundEnabled}
              onChange={useWallpaper => onBackgroundEnabledCommit(!useWallpaper)}
            />
          )}
          {/* Frost and opacity stay visible (and active) in wallpaper mode,
              which hides the mode controls below. */}
          <SettingRow label={label('panel.settings.backgroundFrost', 'Frosted glass')} disabled={!frostApplies}>
            <ChipGroup
              options={[
                // eslint-disable-next-line i18next/no-literal-string -- frost-level enum id
                { key: 'none', label: label('panel.settings.backgroundFrost.none', 'None'), disabled: !frostApplies },
                // eslint-disable-next-line i18next/no-literal-string -- frost-level enum id
                { key: 'light', label: label('panel.settings.backgroundFrost.light', 'Light'), disabled: !frostApplies },
                // eslint-disable-next-line i18next/no-literal-string -- frost-level enum id
                { key: 'heavy', label: label('panel.settings.backgroundFrost.heavy', 'Heavy'), disabled: !frostApplies },
              ]}
              activeKey={theme.backgroundFrost}
              onChange={key => onBackgroundFrostCommit(key as PanelBackgroundFrost)}
              ariaLabel={label('panel.settings.backgroundFrost', 'Frosted glass')}
            />
          </SettingRow>
          {backgroundOpacitySlider}
          {showBackgroundToggle && !theme.backgroundEnabled ? null : (
          <>
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
          ) : theme.backgroundMode === 'media' ? (
            <>
              {backgroundModeTabs}
              <BackgroundMediaPicker
                deviceId={deviceId ?? ''}
                activeId={theme.backgroundMediaId}
                deviceAspect={deviceAspect}
                deviceW={deviceW ?? Math.round(deviceAspect * 1280)}
                deviceH={deviceH ?? 1280}
                onSelect={(mediaId, type) => onBackgroundMediaCommit(mediaId, type)}
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
                  fullWidth
                  tabs={[
                    // eslint-disable-next-line i18next/no-literal-string -- editor tab id
                    { key: 'options', label: t('lighting.editor.options') },
                    // eslint-disable-next-line i18next/no-literal-string -- editor tab id
                    { key: 'effect', label: t('lighting.rightPane.effect') },
                  ]}
                  activeKey={editorTab}
                  onChange={key => setEditorTab(key as 'options' | 'effect')}
                  ariaLabel={t('lighting.rightPane.label')}
                />
              </div>
              {editorTab === 'options' ? (
                <AnimateGrid
                  effect={backgroundEffect}
                  onSelect={onBackgroundEffectCommit}
                  effects={PANEL_BACKGROUND_EFFECTS}
                  slotFor={backgroundController.slotFor}
                  versionFor={backgroundController.versionFor}
                  rgbActiveEffect={backgroundController.rgbActiveEffect}
                  panelEffects={panelUsage.effects}
                />
              ) : (
                <EffectControls
                  effect={backgroundController.effect}
                  state={backgroundController.state}
                  bundle={backgroundController.bundle}
                  canReset={backgroundController.canReset}
                  onTemplateSelect={backgroundController.onTemplateSelect}
                  onChange={backgroundController.onChange}
                  onCommit={backgroundController.onCommit}
                  onReset={backgroundController.onReset}
                  rgbActiveSlot={backgroundController.rgbActiveSlot}
                  panelSlots={panelUsage.slotsByEffect.get(backgroundController.effect)}
                />
              )}
            </>
          )}
          </>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
