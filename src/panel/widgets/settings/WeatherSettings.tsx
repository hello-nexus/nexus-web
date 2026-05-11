import type { WidgetSettingsProps } from '../types';
import { SettingsSelect, SettingsSection, SettingsToggle } from './SettingsRow';

export function WeatherSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const rawUnit = widget.config?.unit?.s;
  const unit = rawUnit === 'C' || rawUnit === 'F' ? rawUnit : 'auto';
  const showCondition = widget.config?.showCondition?.b ?? true;
  const showLocation = widget.config?.showLocation?.b ?? true;
  const showDetails = widget.config?.showDetails?.b ?? true;

  return (
    <>
      <SettingsSection title="Units">
        <SettingsSelect
          label="Temperature"
          value={unit}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'C', label: 'Celsius' },
            { value: 'F', label: 'Fahrenheit' },
          ]}
          onChange={value => onUpdate({ unit: { s: value } })}
        />
      </SettingsSection>

      <SettingsSection title="Display">
        <SettingsToggle
          label="Condition"
          checked={showCondition}
          onChange={checked => onUpdate({ showCondition: { b: checked } })}
        />
        <SettingsToggle
          label="Location"
          checked={showLocation}
          onChange={checked => onUpdate({ showLocation: { b: checked } })}
        />
        <SettingsToggle
          label="Humidity and wind"
          checked={showDetails}
          onChange={checked => onUpdate({ showDetails: { b: checked } })}
        />
      </SettingsSection>
    </>
  );
}

export default WeatherSettings;
