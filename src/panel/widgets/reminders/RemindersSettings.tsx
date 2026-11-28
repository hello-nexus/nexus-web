import type { WidgetSettingsProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import { useReminders } from '../../../hooks/useReminders';
import { SettingsSection, SettingsSelect, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import { SMART_NAME_KEYS } from './reminderIcons';
import { DEFAULT_SELECTION_KEY, resolveSelection, SMART_LISTS, selectionKey } from './reminderLogic';

export function RemindersSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const { lists } = useReminders();
  const config = widget.config;
  const grid = config?.viewMode === 'grid';
  const selection = resolveSelection(config?.list, lists);
  const showCompleted = config?.showCompleted === true;

  const options = [
    ...SMART_LISTS.map(id => ({ value: `smart:${id}`, label: t(SMART_NAME_KEYS[id]) })),
    ...lists.map(l => ({ value: l.id, label: l.name })),
  ];

  return (
    <SettingsSection title={t('reminders.settings.display')}>
      <SettingsSelect
        label={t('reminders.settings.view')}
        value={grid ? 'grid' : 'list'}
        options={[
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'list', label: t('reminders.settings.view.list') },
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'grid', label: t('reminders.settings.view.grid') },
        ]}
        onChange={value => onUpdate({ viewMode: value })}
      />
      {!grid && (
        <SettingsSelect
          label={t('reminders.settings.list')}
          value={selectionKey(selection) || DEFAULT_SELECTION_KEY}
          options={options}
          onChange={value => onUpdate({ list: value })}
        />
      )}
      {!grid && (
        <SettingsToggle
          label={t('reminders.settings.showCompleted')}
          checked={showCompleted}
          disabled={selection.kind === 'smart'}
          onChange={value => onUpdate({ showCompleted: value })}
        />
      )}
    </SettingsSection>
  );
}

export default RemindersSettings;
