import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsToggle } from './SettingsRow';

export function LightingSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const showControls = widget.config?.showControls?.b ?? true;

  return (
    <SettingsToggle
      label={t('panel.settings.showControls')}
      checked={showControls}
      onChange={checked => onUpdate({ showControls: { b: checked } })}
    />
  );
}

export default LightingSettings;
