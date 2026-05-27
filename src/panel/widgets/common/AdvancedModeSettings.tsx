/**
 * Per-widget "advanced mode" toggle, used by the lighting + cooling widgets.
 *
 * `widget.config.advancedMode` is an optional override: when set, it takes
 * precedence over the global `ui.widgetAdvancedMode` setting; when unset
 * (the default for a fresh widget), the widget falls back to the global
 * default. This gives each widget instance an override switch without
 * losing the system-wide preference.
 *
 * Stored as a boolean under the key `advancedMode` on the widget's config.
 * `true` = full rich UI (animation/mirror/static buttons on lighting;
 * chart + chips on cooling). `false` = the default glanceable
 * center-icon-with-arrows layout.
 */
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsToggle } from './SettingsRow/SettingsRow';

export function AdvancedModeSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const { settings: ui } = useUiSettings();
  const override = widget.config?.advancedMode;
  const checked = typeof override === 'boolean' ? override : ui.widgetAdvancedMode;
  return (
    <SettingsToggle
      label={t('panel.widget.advancedMode')}
      checked={checked}
      onChange={value => onUpdate({ ...widget.config, advancedMode: value })}
    />
  );
}

export default AdvancedModeSettings;

/**
 * Helper for widgets that read the effective advanced-mode flag. Mirrors
 * the AdvancedModeSettings precedence: per-widget override beats the
 * global default. Use this inside the widget body so the cascade is
 * consistent.
 */
export function resolveAdvancedMode(
  widgetConfig: Record<string, unknown> | undefined,
  globalDefault: boolean,
): boolean {
  const override = widgetConfig?.advancedMode;
  return typeof override === 'boolean' ? override : globalDefault;
}
