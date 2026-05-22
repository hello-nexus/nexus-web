import { useTranslation } from '../../../lib/i18n';
import { AppPicker } from '../common/AppPicker';
import type { WidgetSettingsProps } from '../types';
import { SettingsRow, SettingsSelect } from '../common/SettingsRow/SettingsRow';

export function MacrosSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const title = ((widget.config?.title as string | undefined) ?? '');
  const action = ((widget.config?.action as string | undefined) ?? 'url');
  const url = ((widget.config?.url as string | undefined) ?? '');
  const shortcut = ((widget.config?.shortcut as string | undefined) ?? '');
  const icon = ((widget.config?.icon as string | undefined) ?? '');
  const appId = ((widget.config?.appId as string | undefined) ?? '');

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
          onChange={e => onUpdate({ title: e.target.value })}
        />
      </SettingsRow>

      <SettingsSelect
        label={t('panel.settings.action')}
        value={action}
        options={actionOptions}
        onChange={v => onUpdate({ action: v })}
      />

      {action === 'url' && (
        <SettingsRow label={t('panel.settings.url')}>
          <input
            type="text"
            value={url}
            placeholder="https://example.com"
            onChange={e => onUpdate({ url: e.target.value })}
          />
        </SettingsRow>
      )}

      {action === 'shortcut' && (
        <SettingsRow label={t('panel.settings.shortcut')}>
          <input
            type="text"
            value={shortcut}
            placeholder="ctrl+c"
            onChange={e => onUpdate({ shortcut: e.target.value })}
          />
        </SettingsRow>
      )}

      {action === 'app' && (
        <AppPicker
          selectedId={appId}
          onSelect={app => onUpdate({
            appId: app.id,
            title: title || app.name,
          })}
        />
      )}

      {action !== 'app' && (
        <SettingsRow label={t('panel.settings.icon')}>
          <input
            type="text"
            value={icon}
            onChange={e => onUpdate({ icon: e.target.value })}
          />
        </SettingsRow>
      )}
    </>
  );
}
