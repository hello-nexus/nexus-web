import { useState } from 'react';
import { ColorPickerWithPresets } from '../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { ChipGroup } from '../../components/common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingSlider, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../lib/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS, THEME_MODES, type ThemeMode } from '../../lib/settings';
import type { EffectState } from '../../types/lighting';
import {
  PANEL_BACKGROUND_EFFECTS,
  PANEL_BACKGROUND_FROST_STEP,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundDefault,
  panelBackgroundPresets,
  resolvePanelBackground,
  type PanelBackdrop,
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
  // What renders behind the widgets. Only kiosk-hosted panels (y70 /
  // monitor) offer anything but 'theme'.
  backdrop: PanelBackdrop;
  backgroundEffectState: EffectState;
  backgroundMediaId: string | null;
  backgroundMediaType: 'static' | 'animated' | null;
  backgroundMediaAlpha: boolean;
  // Frosted-glass blur over the background layer (shader / media / wallpaper),
  // percent 0-100 (see DEFAULT_PANEL_BACKGROUND_FROST).
  backgroundFrost: number;
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
  onBackdropCommit: (backdrop: PanelBackdrop) => void;
  onBackgroundEffectCommit: (effect: string) => void;
  onBackgroundTemplateCommit: (template: number) => void;
  onBackgroundEffectStatePreview: (state: EffectState) => void;
  onBackgroundEffectStateCommit: (state: EffectState) => void;
  onBackgroundOpacityPreview: (opacity: number) => void;
  onBackgroundOpacityCommit: (opacity: number) => void;
  onBackgroundMediaCommit: (mediaId: string | null, type: 'static' | 'animated' | null, alpha: boolean) => void;
  onBackgroundFrostPreview: (percent: number) => void;
  onBackgroundFrostCommit: (percent: number) => void;
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
  /** Show the backdrop selector. Kiosk-hosted surfaces (y70 / monitor) only:
   * the wallpaper and see-through modes need a desktop behind the panel. */
  showBackdropSelector?: boolean;
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
  onBackdropCommit,
  onBackgroundEffectCommit,
  onBackgroundTemplateCommit,
  onBackgroundEffectStatePreview,
  onBackgroundEffectStateCommit,
  onBackgroundOpacityPreview,
  onBackgroundOpacityCommit,
  onBackgroundMediaCommit,
  onBackgroundFrostPreview,
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
  showBackdropSelector = false,
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
  // Frost blurs whatever the page itself paints, so it applies to the
  // redrawn wallpaper and to a shader/media layer. In see-through mode the
  // page paints nothing and backdrop-filter has nothing to sample.
  const frostApplies = theme.backdrop === 'wallpaper'
    || (theme.backdrop === 'theme' && theme.backgroundMode !== 'solid');
  // Built outside the JSX so the option keys read as data, matching the other
  // ChipGroup call sites (the i18n lint rule scans JSX only).
  const backdropOptions = [
    { key: 'theme', label: label('panel.settings.backdrop.theme', 'Theme') },
    { key: 'wallpaper', label: label('panel.settings.backdrop.wallpaper', 'Wallpaper') },
    { key: 'desktop', label: label('panel.settings.backdrop.desktop', 'Desktop') },
  ];
  const backdropDescription = theme.backdrop === 'desktop'
    ? label('panel.settings.backdrop.desktop.desc', 'The live desktop shows through, animated wallpapers included.')
    : theme.backdrop === 'wallpaper'
      ? label('panel.settings.backdrop.wallpaper.desc', 'Redraws your desktop wallpaper behind the widgets')
      : label('panel.settings.backdrop.theme.desc', "The panel's own background");

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

  // Normal flow for solid and media, inside the sticky dock for shader mode so
  // it pins while the effect grid scrolls. The two positions mean React
  // remounts this on a switch into or out of shader, which drops keyboard
  // focus - the same shape the Tabs version had.
  const backgroundModeChips = (
    <ChipGroup
      fullWidth
      options={[
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

  // Opacity of whatever sits behind the widgets over the theme's dark/light
  // backdrop: the solid colour / shader / media layer, the redrawn wallpaper,
  // or the desktop itself. Applies to every backdrop, so it renders outside
  // the theme-only gate below.
  const backgroundOpacitySlider = (
    <SettingSlider
      editable
      trackFill
      label={label('panel.settings.backgroundOpacity', 'Background Opacity')}
      description={label('panel.settings.backgroundOpacity.desc', 'Dims the backdrop')}
      descriptionBelow
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
            <ChipGroup
              options={THEME_MODES.map(mode => ({
                key: mode,
                label: t(`settings.theme.${mode}`) || (mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'),
              }))}
              activeKey={theme.themeMode}
              onChange={key => onThemeModeCommit(key as ThemeMode)}
              ariaLabel={label('settings.theme', 'Theme')}
              fullWidth
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
              allowCustom
            />
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={label('devices.y70.theme.background', 'Background')} boxClassName={styles.backgroundBox}>
        {/* Single aside child so the box adds no row dividers between the
            opacity slider, mode tabs, and the mode content. */}
        <div className={styles.backgroundContent} data-settings-aside>
          {showBackdropSelector && (
            <SettingRow
              label={label('panel.settings.backdrop', 'Backdrop')}
              description={backdropDescription}
              descriptionBelow
            >
              <ChipGroup
                ariaLabel={label('panel.settings.backdrop', 'Backdrop')}
                activeKey={theme.backdrop}
                onChange={key => onBackdropCommit(key as PanelBackdrop)}
                options={backdropOptions}
              />
            </SettingRow>
          )}
          {/* Frost and opacity stay visible under every backdrop, which
              hides the theme-only mode controls below. */}
          <SettingSlider
            // Slider does not forward `disabled` to the editable value, whose
            // display span is focusable - gate it here or a keyboard user can
            // still commit through a disabled control.
            editable={frostApplies}
            trackFill
            disabled={!frostApplies}
            label={label('panel.settings.backgroundFrost', 'Frosted glass')}
            description={label('panel.settings.backgroundFrost.desc', 'Improves clarity on busy backdrops')}
            descriptionBelow
            value={theme.backgroundFrost}
            min={0}
            max={100}
            step={PANEL_BACKGROUND_FROST_STEP}
            formatValue={v => `${v}%`}
            onChange={(v, commit) => {
              if (commit) onBackgroundFrostCommit(v);
              else onBackgroundFrostPreview(v);
            }}
            onCommit={onBackgroundFrostCommit}
          />
          {theme.backdrop === 'desktop' ? null : backgroundOpacitySlider}
          {theme.backdrop !== 'theme' ? null : (
          <>
          {theme.backgroundMode === 'solid' ? (
            <>
              {backgroundModeChips}
              <ColorPickerWithPresets
                value={resolvePanelBackground(theme.backgroundColor, theme.backgroundColorLight, resolvedThemeMode)}
                presets={panelBackgroundPresets(resolvedThemeMode)}
                fallback={panelBackgroundDefault(resolvedThemeMode)}
                onPreview={onBackgroundPreview}
                onCommit={onBackgroundCommit}
                allowCustom
              />
            </>
          ) : theme.backgroundMode === 'media' ? (
            <>
              {backgroundModeChips}
              <BackgroundMediaPicker
                deviceId={deviceId ?? ''}
                activeId={theme.backgroundMediaId}
                deviceAspect={deviceAspect}
                deviceW={deviceW ?? Math.round(deviceAspect * 1280)}
                deviceH={deviceH ?? 1280}
                onSelect={(mediaId, type, alpha) => onBackgroundMediaCommit(mediaId, type, alpha)}
              />
            </>
          ) : (
            <>
              <div className={styles.backgroundDock}>
                {backgroundModeChips}
                <BackgroundEffectPreview
                  effect={backgroundEffect}
                  template={backgroundTemplate}
                  effectState={theme.backgroundEffectState}
                />
                <ChipGroup
                  fullWidth
                  options={[
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
