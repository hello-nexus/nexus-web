/**
 * Per-widget "advanced mode" toggle, used by the lighting + cooling widgets.
 *
 * `widget.config.advancedMode` (boolean) overrides the global
 * `ui.widgetAdvancedMode`; when unset, falls back to the global default.
 * `true` = full rich UI (animation/mirror/static buttons on lighting;
 * chart + chips on cooling). `false` = the default glanceable
 * center-icon-with-arrows layout.
 */
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsSection, SettingsToggle } from './SettingsRow/SettingsRow';

/** `labelKey` lets a widget name the toggle for what it does; the saved key stays `advancedMode`. */
export function AdvancedModeSettings({ widget, onUpdate, labelKey = 'panel.widget.advancedMode' }: WidgetSettingsProps & { labelKey?: string }) {
  const { t } = useTranslation();
  const { settings: ui } = useUiSettings();
  const override = widget.config?.advancedMode;
  const checked = typeof override === 'boolean' ? override : ui.widgetAdvancedMode;
  return (
    <SettingsSection>
      <SettingsToggle
        label={t(labelKey)}
        checked={checked}
        onChange={value => onUpdate({ ...widget.config, advancedMode: value })}
      />
    </SettingsSection>
  );
}

export default AdvancedModeSettings;

/**
 * Effective advanced-mode flag: per-widget override beats the global default.
 */
export function resolveAdvancedMode(
  widgetConfig: Record<string, unknown> | undefined,
  globalDefault: boolean,
): boolean {
  const override = widgetConfig?.advancedMode;
  return typeof override === 'boolean' ? override : globalDefault;
}
