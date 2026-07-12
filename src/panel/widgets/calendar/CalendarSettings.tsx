import type { WidgetSettingsProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import { SettingsSection, SettingsToggle, SettingsSelect } from '../common/SettingsRow/SettingsRow';

export function CalendarSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const showGrid = (widget.config?.showGrid as boolean | undefined) ?? false;
  const weekStart = (widget.config?.weekStart as string | undefined) ?? 'auto';

  return (
    <SettingsSection title={t('panel.widget.calendar.settings.display')}>
      <SettingsToggle
        label={t('panel.widget.calendar.settings.showGrid')}
        checked={showGrid}
        onChange={value => onUpdate({ showGrid: value })}
      />
      <SettingsSelect
        label={t('panel.widget.calendar.settings.weekStart')}
        value={weekStart}
        options={[
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'auto', label: t('panel.widget.calendar.settings.weekStartAuto') },
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'sunday', label: t('panel.widget.calendar.settings.weekStartSunday') },
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'monday', label: t('panel.widget.calendar.settings.weekStartMonday') },
        ]}
        onChange={value => onUpdate({ weekStart: value })}
      />
    </SettingsSection>
  );
}

export default CalendarSettings;
