import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsRow } from './SettingsRow';

export function TwitchSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const channel = widget.config?.channel?.s ?? '';

  return (
    <SettingsRow label={t('panel.settings.channel')}>
      <input
        type="text"
        value={channel}
        placeholder="channel_name"
        onChange={e => onUpdate({ channel: { s: e.target.value } })}
      />
    </SettingsRow>
  );
}
