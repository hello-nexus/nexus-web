import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection, SettingsToggle } from '../common/SettingsRow/SettingsRow';

export function WeatherSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const rawUnit = widget.config?.unit as string | undefined;
  const unit = rawUnit === 'C' || rawUnit === 'F' ? rawUnit : 'auto';
  const showCondition = (widget.config?.showCondition as boolean | undefined) ?? true;
  const showLocation = (widget.config?.showLocation as boolean | undefined) ?? true;
  const showDetails = (widget.config?.showDetails as boolean | undefined) ?? true;

  return (
    <>
      <SettingsSection title={t('panel.widget.weather.settings.units')}>
        <SettingsSelect
          label={t('panel.widget.weather.settings.temperature')}
          value={unit}
          options={[
            // eslint-disable-next-line i18next/no-literal-string -- enum value
            { value: 'auto', label: t('panel.widget.weather.settings.auto') },
            { value: 'C', label: t('panel.widget.weather.settings.celsius') },
            { value: 'F', label: t('panel.widget.weather.settings.fahrenheit') },
          ]}
          onChange={value => onUpdate({ unit: value })}
        />
      </SettingsSection>

      <SettingsSection title={t('panel.widget.weather.settings.display')}>
        <SettingsToggle
          label={t('panel.widget.weather.settings.condition')}
          checked={showCondition}
          onChange={checked => onUpdate({ showCondition: checked })}
        />
        <SettingsToggle
          label={t('panel.widget.weather.settings.location')}
          checked={showLocation}
          onChange={checked => onUpdate({ showLocation: checked })}
        />
        <SettingsToggle
          label={t('panel.widget.weather.settings.humidityAndWind')}
          checked={showDetails}
          onChange={checked => onUpdate({ showDetails: checked })}
        />
      </SettingsSection>
    </>
  );
}

export default WeatherSettings;
