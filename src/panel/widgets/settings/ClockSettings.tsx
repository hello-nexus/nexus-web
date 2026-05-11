import {
  Binary,
  CircleDot,
  Clock3,
  FlipHorizontal,
  Hash,
  RotateCw,
  ScanLine,
  type LucideIcon,
} from 'lucide-react';
import { IconLabelButton } from '../../../components/IconLabelButton/IconLabelButton';
import type { WidgetSettingsProps } from '../types';
import { CLOCK_DESIGNS } from '../clock/designs';
import { SettingsRow, SettingsToggle, SettingsSection, SettingsSelect } from './SettingsRow';
import styles from './ClockSettings.module.scss';

const DESIGN_KEYS = Object.keys(CLOCK_DESIGNS);
const DESIGN_ICONS: Record<string, LucideIcon> = {
  digital: Hash,
  analog: Clock3,
  splitflap: FlipHorizontal,
  rolling: RotateCw,
  led: ScanLine,
  dots: CircleDot,
  matrix: Binary,
};

export function ClockSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const currentDesign = widget.config?.design?.s ?? 'digital';
  const format = widget.config?.format?.s ?? '24h';
  const showSeconds = widget.config?.showSeconds?.b ?? false;
  const showDate = widget.config?.showDate?.b ?? true;
  const useAccentColor = widget.config?.useAccentColor?.b ?? false;
  const timezone = widget.config?.timezone?.s ?? '';

  const setDesign = (key: string) => {
    onUpdate({ design: { s: key } });
  };

  const setFormat = (value: string) => {
    onUpdate({ format: { s: value } });
  };

  const setShowSeconds = (checked: boolean) => {
    onUpdate({ showSeconds: { b: checked } });
  };

  const setShowDate = (checked: boolean) => {
    onUpdate({ showDate: { b: checked } });
  };

  const setUseAccentColor = (checked: boolean) => {
    onUpdate({ useAccentColor: { b: checked } });
  };

  const setTimezone = (value: string) => {
    onUpdate({ timezone: { s: value || undefined } });
  };

  return (
    <div className={styles.container}>
      <SettingsSection title="Design">
        <div className={styles.designRow}>
          {DESIGN_KEYS.map(key => {
            const Icon = DESIGN_ICONS[key];
            return (
              <IconLabelButton
                key={key}
                className={styles.designBtn}
                active={key === currentDesign}
                icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                label={CLOCK_DESIGNS[key].label}
                onPress={() => setDesign(key)}
              />
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Display">
        <SettingsSelect
          label="Time format"
          value={format}
          options={[
            { value: '24h', label: '24-hour' },
            { value: '12h', label: '12-hour' },
          ]}
          onChange={setFormat}
        />
        <SettingsToggle
          label="Show seconds"
          checked={showSeconds}
          onChange={setShowSeconds}
        />
        <SettingsToggle
          label="Show date"
          checked={showDate}
          onChange={setShowDate}
        />
        <SettingsToggle
          label="Use accent color"
          checked={useAccentColor}
          onChange={setUseAccentColor}
        />
      </SettingsSection>

      <SettingsSection title="Timezone">
        <SettingsRow label="Timezone">
          <input
            type="text"
            className={styles.textInput}
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            placeholder="Auto (local)"
            spellCheck={false}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default ClockSettings;
