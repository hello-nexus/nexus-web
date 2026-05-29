import { useEffect, useMemo, useState } from 'react';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { EffectTemplateSelector } from '../../components/common/EffectTemplateSelector/EffectTemplateSelector';
import { ColorPickerWithPresets } from '../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { Slider } from '../../components/common/Slider/Slider';
import { Tabs } from '../../components/common/Tabs/Tabs';
import { Toggle } from '../../components/common/Toggle/Toggle';
import { fetchServiceBlob } from '../../api/service';
import { effectThumbnailPath } from '../../api/lighting';
import { useTranslation } from '../../lib/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS, THEME_MODES, type ThemeMode } from '../../lib/settings';
import { EFFECT_CATEGORIES, categoryOf, type EffectCategory } from '../../types/lighting';
import {
  PANEL_BACKGROUND_EFFECTS,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundTemplate,
  panelBackgroundDefault,
  panelBackgroundPresets,
  panelBackgroundState,
  resolvePanelBackground,
  type PanelBackgroundMode,
} from '../panelBackground';
import styles from './PanelThemeSettings.module.scss';

export type ResolvedPanelThemeMode = 'dark' | 'light';

export interface PanelThemeSettingsState {
  appThemeMode: ThemeMode;
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
  widgetOpacity: number;
  widgetLabels: boolean;
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
  onBackgroundOpacityPreview: (opacity: number) => void;
  onBackgroundOpacityCommit: (opacity: number) => void;
  onWidgetOpacityPreview: (opacity: number) => void;
  onWidgetOpacityCommit: (opacity: number) => void;
  onWidgetLabelsCommit: (enabled: boolean) => void;
  /** Hide the widget-labels toggle entirely. Single-widget surfaces (q-series)
   * lock labels off, so there's nothing for the user to choose. */
  hideWidgetLabelsToggle?: boolean;
}

type AnimationFilter = EffectCategory | 'all';

const PANEL_ANIMATION_FILTERS: readonly AnimationFilter[] = [
  'all',
  ...EFFECT_CATEGORIES.filter(category => category !== 'audio'),
];

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
  onBackgroundOpacityPreview,
  onBackgroundOpacityCommit,
  onWidgetOpacityPreview,
  onWidgetOpacityCommit,
  onWidgetLabelsCommit,
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

  return (
    <div className={styles.themePanel}>
      <div className={styles.themeSection}>
        <div className={styles.themeSectionTitle}>{label('panel.settings.widgets', 'Widgets')}</div>
        {!hideWidgetLabelsToggle && (
          <div className={styles.themeToggleRow}>
            <span>{label('panel.settings.widgetLabels', 'Widget labels')}</span>
            <Toggle
              checked={theme.widgetLabels}
              onChange={onWidgetLabelsCommit}
              ariaLabel={label('panel.settings.widgetLabels', 'Widget labels')}
            />
          </div>
        )}
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
      </div>

      <div className={styles.themeSection}>
        <div className={styles.themeSectionTitle}>{t('settings.theme') || 'Theme'}</div>
        <div className={styles.themeToggleRow}>
          <span>{syncWithDesktopLabel}</span>
          <Toggle
            checked={theme.themeSyncWithDesktop}
            onChange={onThemeSyncCommit}
            ariaLabel={syncWithDesktopLabel}
          />
        </div>
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
      </div>

      <div className={styles.themeSection}>
        <div className={styles.themeSectionTitle}>{t('devices.y70.theme.accent') || 'Accent Color'}</div>
        <div className={styles.themeToggleRow}>
          <span>{syncWithDesktopLabel}</span>
          <Toggle
            checked={theme.accentSyncWithDesktop}
            onChange={onAccentSyncCommit}
            ariaLabel={syncWithDesktopLabel}
          />
        </div>
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

      <div className={styles.themeSection}>
        <div className={styles.themeSectionTitle}>{t('devices.y70.theme.background') || 'Background'}</div>
        <Tabs
          variant="pill"
          tabs={[
            { key: 'solid', label: label('panel.settings.backgroundMode.solid', 'Solid') },
            { key: 'shader', label: label('panel.settings.backgroundMode.animations', 'Animations') },
          ]}
          activeKey={theme.backgroundMode}
          onChange={key => onBackgroundModeCommit(key as PanelBackgroundMode)}
          ariaLabel={label('panel.settings.backgroundMode', 'Background mode')}
          className={styles.backgroundModeTabs}
        />

        {theme.backgroundMode === 'solid' ? (
          <ColorPickerWithPresets
            value={resolvePanelBackground(theme.backgroundColor, theme.backgroundColorLight, resolvedThemeMode)}
            presets={panelBackgroundPresets(resolvedThemeMode)}
            fallback={panelBackgroundDefault(resolvedThemeMode)}
            onPreview={onBackgroundPreview}
            onCommit={onBackgroundCommit}
          />
        ) : (
          <div className={styles.backgroundShaderControls}>
            {/* Preset (colour template) picker at the top of the block. */}
            <EffectTemplateSelector
              className={styles.backgroundTemplateRow}
              slots={Array.from({ length: 4 }, (_, index) => panelBackgroundState(backgroundEffect, index))}
              activeIndex={backgroundTemplate}
              onSelect={onBackgroundTemplateCommit}
              ariaLabel={label('panel.settings.animationTemplates', 'Animation templates')}
              buttonAriaLabelPrefix={label('panel.settings.animationTemplate', 'Animation template')}
            />

            {/* Opacity sits just above the category chips. */}
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

            {/* Category chips + the vertical-scrolling animation grid. */}
            <PanelAnimationPicker
              effect={backgroundEffect}
              onSelect={onBackgroundEffectCommit}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PanelAnimationPicker({
  effect,
  onSelect,
}: {
  effect: string;
  onSelect: (effect: string) => void;
}) {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const [filter, setFilter] = useState<AnimationFilter>('all');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (const fx of PANEL_BACKGROUND_EFFECTS) {
        const blob = await fetchServiceBlob(effectThumbnailPath(fx.key));
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setThumbs(prev => ({ ...prev, [fx.key]: url }));
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const visible = useMemo(
    () => filter === 'all'
      ? PANEL_BACKGROUND_EFFECTS
      : PANEL_BACKGROUND_EFFECTS.filter(fx => categoryOf(fx.key) === filter),
    [filter],
  );

  return (
    <div className={styles.animationPicker}>
      <div className={styles.animationCategoryChips}>
        {PANEL_ANIMATION_FILTERS.map(item => (
          <button
            key={item}
            type="button"
            className={`${styles.animationCategoryChip} ${filter === item ? styles.animationCategoryChipActive : ''}`}
            onClick={() => setFilter(item)}
          >
            {t(`lighting.category.${item}`)}
          </button>
        ))}
      </div>
      <div
        className={styles.animationScroller}
        data-panel-scrollable="true"
        aria-label={label('panel.settings.animationEffects', 'Animation effects')}
      >
        {visible.map(fx => (
          <div key={fx.key} className={styles.animationCardFrame}>
            <EffectCard
              overlay
              dataEffectKey={fx.key}
              label={t(fx.labelKey)}
              thumbUrl={thumbs[fx.key] ?? null}
              active={fx.key === effect}
              onClick={() => onSelect(fx.key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
