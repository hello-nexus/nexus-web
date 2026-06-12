import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsRow } from '../common/SettingsRow/SettingsRow';

export function IFrameSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const url = ((widget.config?.url as string | undefined) ?? '');

  return (
    <SettingsRow label={t('panel.settings.url')}>
      <input
        type="text"
        value={url}
        // eslint-disable-next-line i18next/no-literal-string -- URL format hint
        placeholder="https://example.com"
        onChange={e => onUpdate({ url: e.target.value })}
      />
    </SettingsRow>
  );
}
