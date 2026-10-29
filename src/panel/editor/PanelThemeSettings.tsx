import { useState, type ReactNode } from 'react';
import { ColorPickerWithPresets } from '../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { ChipGroup } from '../../components/common/ChipGroup/ChipGroup';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../lib/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS, THEME_MODES, type ThemeMode } from '../../lib/settings';
import { DEFAULT_CUSTOM_TEXT_COLOR, type TextColorMode } from '../theme/textColor';
import { DEFAULT_PANEL_FONT, systemFontFamily, type PanelFont } from '../theme/panelFont';
import { buildPanelFontOptions } from '../theme/panelFontOptions';
import { loadRecentSystemFonts, pushRecentSystemFont } from '../theme/recentSystemFonts';
import { loadSystemFonts, useSystemFonts } from '../theme/systemFontsCache';
import type { EffectState } from '../../types/lighting';
import type { GaugeGradientStop } from '../theme/gaugeGradient';
import {
  PANEL_BACKGROUND_EFFECTS,
  PANEL_BACKGROUND_EFFECTS_WITH_AUDIO,
  PANEL_BACKGROUND_FROST_STEP,
  PANEL_WIDGET_PADDING_STEP,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundDefault,
  panelBackgroundState,
  panelBackgroundPresets,
  resolveBackgroundDrawing,
  resolvePanelBackground,
  type PanelBackdrop,
  type PanelBackgroundMode,
} from '../background/panelBackground';
import { BackgroundEffectPreview } from '../widgets/lighting/effecteditor/BackgroundEffectPreview';
import { usePanelBackgroundEffectController } from '../widgets/lighting/effecteditor/usePanelBackgroundEffectController';
import { usePanelBackgroundUsage } from '../../hooks/usePanelBackgroundUsage';
import { SearchInput } from '../../components/common/SearchInput/SearchInput';
import { AnimateGrid } from '../widgets/lighting/page/AnimateGrid';
import { EffectControls } from '../widgets/lighting/page/EffectControls';
import { BackgroundMediaPicker } from '../background/BackgroundMediaPicker';
import { Notice } from '../../components/common/Notice/Notice';
import styles from './PanelThemeSettings.module.scss';

export type ResolvedPanelThemeMode = 'dark' | 'light';

/** The media background's slideshow group, edited as one patch. */
export interface PanelSlideshowSettings {
  enabled: boolean;
  /** Seconds per slide (one of SLIDESHOW_INTERVALS). */
  interval: number;
  shuffle: boolean;
  /** A video slide plays whole before the next, repeating to cover the interval. */
  finishVideos: boolean;
}

/** Which of the editor's sections to render: the desktop device page splits
 * them across its Theme and Background tabs, the on-device sheet stacks all. */
export type PanelThemeSettingsSection = 'all' | 'theme' | 'background';

export interface PanelThemeSettingsState {
  appThemeMode: ThemeMode;
  // Host OS theme from prefs.theme.resolvedThemeMode, published by the service.
  // '' when not published; a synced panel on 'system' then resolves against its
  // own device. Only consulted while appThemeMode is 'system'.
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
  // Media mode cycles the whole library instead of holding backgroundMediaId,
  // which is then the slide it starts from.
  backgroundSlideshow: boolean;
  backgroundSlideshowInterval: number;
  backgroundSlideshowShuffle: boolean;
  backgroundSlideshowFinishVideos: boolean;
  // Asset ids in grid / in-order play order; unlisted assets follow, oldest first.
  backgroundMediaOrder: string[];
  // Frosted-glass blur over the background layer (shader / media / wallpaper),
  // percent 0-100 (see DEFAULT_PANEL_BACKGROUND_FROST).
  backgroundFrost: number;
  // Off: immersive views show the panel background instead of a solid colour.
  immersiveBackdrop: boolean;
  widgetOpacity: number;
  widgetLabels: boolean;
  // Percent 0-100 (see defaultPanelWidgetPadding, PANEL_WIDGET_PADDING_MAX_RATIO).
  widgetPadding: number;
  textColorMode: TextColorMode;
  // Hex for 'custom'; empty falls back to DEFAULT_CUSTOM_TEXT_COLOR.
  textColor: string;
  // Null is the app font.
  font: PanelFont | null;
  // Stops for the value-coloured monitoring gauges (see gaugeGradient.ts).
  gaugeGradient: GaugeGradientStop[];
}

const OPTIONS_TAB = 'options';

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
  onBackgroundSlideshowCommit: (patch: Partial<PanelSlideshowSettings>) => void;
  onBackgroundMediaOrderCommit: (ids: string[]) => void;
  onBackgroundFrostPreview: (percent: number) => void;
  onBackgroundFrostCommit: (percent: number) => void;
  onImmersiveBackdropCommit: (enabled: boolean) => void;
  onWidgetOpacityPreview: (opacity: number) => void;
  onWidgetOpacityCommit: (opacity: number) => void;
  onWidgetLabelsCommit: (enabled: boolean) => void;
  onWidgetPaddingPreview: (percent: number) => void;
  onWidgetPaddingCommit: (percent: number) => void;
  onTextColorModeCommit: (mode: TextColorMode) => void;
  onTextColorPreview: (hex: string) => void;
  onTextColorCommit: (hex: string) => void;
  onFontCommit: (font: PanelFont | null) => void;
  /** List installed host fonts under the bundled ones. Only for panels rendered on this PC's own OS. */
  showSystemFonts?: boolean;
  /** Show the media background tab. All display-backed surfaces support it; the
   * embedded desktop deck never renders theme backgrounds (PanelApp gates on
   * !embedded || simulator), so desktop hides it. Tunneled panels also hide it:
   * media import is LAN-only (postServiceForm fails closed off-LAN). */
  showMediaTab?: boolean;
  /** Device aspect ratio (W/H) forwarded to the media cropper. */
  deviceAspect?: number;
  /** Round display: media tiles are drawn as circles, as the preview shows the panel. */
  roundDisplay?: boolean;
  /** Device native pixel width for the import conversion. */
  deviceW?: number;
  /** Device native pixel height for the import conversion. */
  deviceH?: number;
  /** Extra row rendered directly under Widget padding in the Widgets section (the per-device widget scale slider). */
  widgetScaleRow?: ReactNode;
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
  /** Show the immersive background toggle. Immersive views exist only on touch
   * screens, so non-touch displays hide it. */
  showImmersiveBackdrop?: boolean;
  sections?: PanelThemeSettingsSection;
  /** Show a search field above the background animation grid. Desktop dashboard only. */
  showEffectSearch?: boolean;
  /** Name of the focus mode holding this panel on a plain background right now, if any. */
  backgroundHeldBy?: string | null;
  /** panelAudioReactiveAllowed for the surface being edited. Off offers no audio effects. */
  audioReactive?: boolean;
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
  onBackgroundSlideshowCommit,
  onBackgroundMediaOrderCommit,
  onBackgroundFrostPreview,
  onBackgroundFrostCommit,
  onImmersiveBackdropCommit,
  onWidgetOpacityPreview,
  onWidgetOpacityCommit,
  onWidgetLabelsCommit,
  onWidgetPaddingPreview,
  onWidgetPaddingCommit,
  onTextColorModeCommit,
  onTextColorPreview,
  onTextColorCommit,
  onFontCommit,
  showMediaTab = false,
  showSystemFonts = false,
  deviceAspect = 9 / 16,
  roundDisplay = false,
  deviceW,
  deviceH,
  hideWidgetLabelsToggle = false,
  hideWidgetChromeControls = false,
  widgetScaleRow = null,
  showBackdropSelector = false,
  showEffectSearch = false,
  showImmersiveBackdrop = true,
  sections = 'all',
  backgroundHeldBy = null,
  audioReactive = false,
}: PanelThemeSettingsProps) {
  const showTheme = sections !== 'background';
  const showBackground = sections !== 'theme';
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const syncWithDesktopLabel = t('panel.settings.syncWithDesktop') || 'Sync with desktop';
  // What this surface draws. A stored audio effect it cannot play shows the
  // default, and the options below edit that, never the stored effect's template.
  const storedBackgroundEffect = normalizePanelBackgroundEffect(theme.backgroundEffect);
  const drawnBackground = resolveBackgroundDrawing(
    storedBackgroundEffect,
    normalizePanelBackgroundTemplate(theme.backgroundTemplate),
    theme.backgroundEffectState,
    audioReactive,
  );
  const backgroundEffect = drawnBackground.effect;
  const backgroundTemplate = drawnBackground.template;
  const backgroundEffectState = drawnBackground.effectState ?? panelBackgroundState(backgroundEffect, backgroundTemplate);
  const backgroundSubstituted = backgroundEffect !== storedBackgroundEffect;
  const backgroundOpacityPercent = Math.round(theme.backgroundOpacity * 100);
  const widgetOpacityPercent = Math.round(theme.widgetOpacity * 100);
  const widgetPaddingLabel = label('panel.settings.widgetPadding', 'Widget padding');
  // Frost blurs whatever the page itself paints, so it applies to the
  // redrawn wallpaper and to a shader/media layer. In see-through mode the
  // page paints nothing, so the host blurs the desktop behind the cards.
  const frostApplies = theme.backdrop === 'wallpaper'
    || theme.backdrop === 'desktop'
    || (theme.backdrop === 'theme' && theme.backgroundMode !== 'solid');
  // Built outside the JSX so the option keys read as data, matching the other
  // ChipGroup call sites (the i18n lint rule scans JSX only).
  const backdropOptions = [
    { key: 'theme', label: label('panel.settings.backdrop.theme', 'Theme') },
    { key: 'wallpaper', label: label('panel.settings.backdrop.wallpaper', 'Wallpaper') },
    { key: 'desktop', label: label('panel.settings.backdrop.desktop', 'Desktop') },
  ];
  const textColorOptions = [
    { key: 'adaptive', label: label('panel.settings.textColor.adaptive', 'Adaptive') },
    { key: 'theme', label: label('panel.settings.textColor.theme', 'Theme') },
    { key: 'custom', label: label('panel.settings.textColor.custom', 'Custom') },
  ];
  const [recentFonts, setRecentFonts] = useState<string[]>(loadRecentSystemFonts);
  const systemFonts = useSystemFonts(showSystemFonts && showTheme);
  const fontOptions = buildPanelFontOptions(
    showSystemFonts
      ? { status: systemFonts.status, families: systemFonts.families, onLoad: () => { void loadSystemFonts(); } }
      : null,
    theme.font,
    {
      bundled: label('panel.settings.font.bundled', 'Bundled'),
      system: label('panel.settings.font.system', 'System'),
      recent: t('search.section.recent') || 'Recent',
      load: label('panel.settings.font.system.load', 'Load system fonts'),
      loading: label('panel.settings.font.system.loading', 'Loading system fonts'),
      empty: label('panel.settings.font.system.empty', 'No system fonts found'),
    },
    recentFonts,
  );
  const textColorDescription = theme.textColorMode === 'custom'
    ? label('panel.settings.textColor.custom.desc', 'One color for all widget text, accent text included')
    : theme.textColorMode === 'theme'
      ? label('panel.settings.textColor.theme.desc', 'Follows the light or dark theme')
      : label('panel.settings.textColor.adaptive.desc', 'White or black on each widget, whichever reads best on the background');
  const backdropDescription = theme.backdrop === 'desktop'
    ? label('panel.settings.backdrop.desktop.desc', 'The live desktop shows through, animated wallpapers included.')
    : theme.backdrop === 'wallpaper'
      ? label('panel.settings.backdrop.wallpaper.desc', 'Redraws your desktop wallpaper behind the widgets')
      : label('panel.settings.backdrop.theme.desc', "The panel's own background");

  // Options | Effect tab and chip-filter state, owned here (not by the
  // EffectEditor shell) so the preview + tab bars + chips can sit in one
  // sticky dock while the grid / controls scroll with the page.
  const [editorTab, setEditorTab] = useState<'options' | 'effect'>('options');
  const [effectQuery, setEffectQuery] = useState('');
  const visibleEditorTab = backgroundSubstituted ? OPTIONS_TAB : editorTab;

  // The same Options | Effect editing surface as the immersive lighting view,
  // here targeting this panel's per-device background effect (animate-only).
  const backgroundController = usePanelBackgroundEffectController({
    effect: backgroundEffect,
    template: backgroundTemplate,
    templatesByEffect: theme.backgroundTemplates,
    effectState: backgroundEffectState,
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
      description={label('panel.settings.backgroundOpacity.desc', 'Dims the background')}
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
      {showTheme && (!hideWidgetLabelsToggle || !hideWidgetChromeControls || widgetScaleRow) && (
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
              step={PANEL_WIDGET_PADDING_STEP}
              formatValue={v => `${v}%`}
              onChange={(v, commit) => {
                if (commit) onWidgetPaddingCommit(v);
                else onWidgetPaddingPreview(v);
              }}
              onCommit={onWidgetPaddingCommit}
            />
          )}
          {widgetScaleRow}
        </SettingsSection>
      )}

      {showTheme && (
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
      )}

      {showTheme && (
      <SettingsSection title={label('panel.settings.text', 'Text')} boxClassName={styles.themeBox}>
        <div className={styles.toggleReveal}>
          <SettingRow
            label={label('panel.settings.textColor', 'Text color')}
            description={textColorDescription}
            descriptionBelow
          >
            <ChipGroup
              ariaLabel={label('panel.settings.textColor', 'Text color')}
              activeKey={theme.textColorMode}
              onChange={key => onTextColorModeCommit(key as TextColorMode)}
              options={textColorOptions}
            />
          </SettingRow>
          {theme.textColorMode === 'custom' && (
            <ColorPickerWithPresets
              value={theme.textColor || DEFAULT_CUSTOM_TEXT_COLOR}
              presets={PRESET_ACCENTS}
              fallback={DEFAULT_CUSTOM_TEXT_COLOR}
              onPreview={onTextColorPreview}
              onCommit={onTextColorCommit}
              allowCustom
            />
          )}
        </div>
        <SettingSelect
          label={label('panel.settings.font', 'Font')}
          value={theme.font ?? DEFAULT_PANEL_FONT}
          options={fontOptions}
          onChange={value => {
            const family = systemFontFamily(value);
            if (family) setRecentFonts(pushRecentSystemFont(family));
            onFontCommit(value === DEFAULT_PANEL_FONT ? null : value as PanelFont);
          }}
        />
      </SettingsSection>
      )}

      {showTheme && (
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
      )}

      {showBackground && (
        <SettingsSection title={label('devices.y70.theme.background', 'Background')} boxClassName={styles.backgroundBox}>
          {/* Single aside child so the box adds no row dividers between the
              opacity slider, mode tabs, and the mode content. */}
          <div className={styles.backgroundContent} data-settings-aside>
            {backgroundHeldBy && (
              <Notice tone="info" role="status">{label('panel.settings.backgroundHeldByFocus', '{mode} is showing a plain background right now. Your background comes back when it ends.').replace('{mode}', () => backgroundHeldBy)}</Notice>
            )}
            {showBackdropSelector && (
              <SettingRow
                label={label('panel.settings.backdrop', 'Rendering')}
                description={backdropDescription}
                descriptionBelow
              >
                <ChipGroup
                  ariaLabel={label('panel.settings.backdrop', 'Rendering')}
                  activeKey={theme.backdrop}
                  onChange={key => onBackdropCommit(key as PanelBackdrop)}
                  options={backdropOptions}
                />
              </SettingRow>
            )}
            {showImmersiveBackdrop && (
              <SettingToggle
                label={label('panel.settings.immersiveBackdrop', 'Immersive background')}
                description={label('panel.settings.immersiveBackdrop.desc', 'Turn off to see your background through immersive views')}
                checked={theme.immersiveBackdrop}
                onChange={onImmersiveBackdropCommit}
              />
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
              description={label('panel.settings.backgroundFrost.desc', 'Improves clarity on busy backgrounds')}
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
                  round={roundDisplay}
                  deviceW={deviceW ?? Math.round(deviceAspect * 1280)}
                  deviceH={deviceH ?? 1280}
                  onSelect={(mediaId, type, alpha) => onBackgroundMediaCommit(mediaId, type, alpha)}
                  slideshow={{
                    enabled: theme.backgroundSlideshow,
                    interval: theme.backgroundSlideshowInterval,
                    shuffle: theme.backgroundSlideshowShuffle,
                    finishVideos: theme.backgroundSlideshowFinishVideos,
                  }}
                  onSlideshowChange={onBackgroundSlideshowCommit}
                  order={theme.backgroundMediaOrder}
                  onOrderChange={onBackgroundMediaOrderCommit}
                />
              </>
            ) : (
              <>
                <div className={styles.backgroundDock}>
                  {backgroundModeChips}
                  <BackgroundEffectPreview
                    effect={backgroundEffect}
                    template={backgroundTemplate}
                    effectState={backgroundEffectState}
                    audioReactive={audioReactive}
                  />
                  <ChipGroup
                    fullWidth
                    options={[
                      // eslint-disable-next-line i18next/no-literal-string -- editor tab id
                      { key: 'options', label: t('lighting.editor.options') },
                      // eslint-disable-next-line i18next/no-literal-string -- editor tab id
                      ...(backgroundSubstituted ? [] : [{ key: 'effect', label: t('lighting.rightPane.effect') }]),
                    ]}
                    activeKey={visibleEditorTab}
                    onChange={key => setEditorTab(key as 'options' | 'effect')}
                    ariaLabel={t('lighting.rightPane.label')}
                  />
                  {showEffectSearch && (backgroundSubstituted || editorTab === 'options') && (
                    <SearchInput
                      value={effectQuery}
                      onChange={setEffectQuery}
                      placeholder={t('lighting.effects.search')}
                      ariaLabel={t('lighting.effects.search')}
                    />
                  )}
                </div>
                {backgroundSubstituted || editorTab === 'options' ? (
                  <AnimateGrid
                    effect={backgroundEffect}
                    onSelect={onBackgroundEffectCommit}
                    effects={audioReactive ? PANEL_BACKGROUND_EFFECTS_WITH_AUDIO : PANEL_BACKGROUND_EFFECTS}
                    query={showEffectSearch ? effectQuery : undefined}
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
      )}
    </div>
  );
}
