import { useTranslation } from '../../../lib/i18n';
import { AppPicker } from '../common/AppPicker';
import type { WidgetSettingsProps } from '../types';
import { SettingsRow, SettingsSelect } from './SettingsRow';

export function MacrosSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const title = widget.config?.title?.s ?? '';
  const action = widget.config?.action?.s ?? 'url';
  const url = widget.config?.url?.s ?? '';
  const shortcut = widget.config?.shortcut?.s ?? '';
  const icon = widget.config?.icon?.s ?? '';
  const appId = widget.config?.appId?.s ?? '';

  const actionOptions = [
    { value: 'url', label: t('panel.settings.url') },
    { value: 'shortcut', label: t('panel.settings.shortcut') },
    { value: 'app', label: t('panel.settings.app') },
  ];

  return (
    <>
      <SettingsRow label={t('panel.settings.title')}>
        <input
          type="text"
          value={title}
          onChange={e => onUpdate({ title: { s: e.target.value } })}
        />
      </SettingsRow>

      <SettingsSelect
        label={t('panel.settings.action')}
        value={action}
        options={actionOptions}
        onChange={v => onUpdate({ action: { s: v } })}
      />

      {action === 'url' && (
        <SettingsRow label={t('panel.settings.url')}>
          <input
            type="text"
            value={url}
            placeholder="https://example.com"
            onChange={e => onUpdate({ url: { s: e.target.value } })}
          />
        </SettingsRow>
      )}

      {action === 'shortcut' && (
        <SettingsRow label={t('panel.settings.shortcut')}>
          <input
            type="text"
            value={shortcut}
            placeholder="ctrl+c"
            onChange={e => onUpdate({ shortcut: { s: e.target.value } })}
          />
        </SettingsRow>
      )}

      {action === 'app' && (
        <AppPicker
          selectedId={appId}
          onSelect={app => onUpdate({
            appId: { s: app.id },
            title: { s: title || app.name },
          })}
        />
      )}

      {action !== 'app' && (
        <SettingsRow label={t('panel.settings.icon')}>
          <input
            type="text"
            value={icon}
            onChange={e => onUpdate({ icon: { s: e.target.value } })}
          />
        </SettingsRow>
      )}
    </>
  );
}
