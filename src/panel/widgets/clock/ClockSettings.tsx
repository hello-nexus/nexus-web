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
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import type { WidgetSettingsProps } from '../types';
import { CLOCK_DESIGNS } from '../clock/designs';
import { SettingsRow, SettingsToggle, SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { useTranslation } from '../../../lib/i18n';
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
  const { t } = useTranslation();
  const currentDesign = ((widget.config?.design as string | undefined) ?? 'digital');
  const format = ((widget.config?.format as string | undefined) ?? '24h');
  const showSeconds = ((widget.config?.showSeconds as boolean | undefined) ?? false);
  const showDate = ((widget.config?.showDate as boolean | undefined) ?? true);
  const useAccentColor = ((widget.config?.useAccentColor as boolean | undefined) ?? false);
  const timezone = ((widget.config?.timezone as string | undefined) ?? '');

  const setDesign = (key: string) => {
    onUpdate({ design: key });
  };

  const setFormat = (value: string) => {
    onUpdate({ format: value });
  };

  const setShowSeconds = (checked: boolean) => {
    onUpdate({ showSeconds: checked });
  };

  const setShowDate = (checked: boolean) => {
    onUpdate({ showDate: checked });
  };

  const setUseAccentColor = (checked: boolean) => {
    onUpdate({ useAccentColor: checked });
  };

  const setTimezone = (value: string) => {
    onUpdate({ timezone: value || null });
  };

  return (
    <div className={styles.container}>
      <SettingsSection title={t('panel.widget.clock.settings.design')}>
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

      <SettingsSection title={t('panel.widget.clock.settings.display')}>
        <SettingsSelect
          label={t('panel.widget.clock.settings.timeFormat')}
          value={format}
          options={[
            // eslint-disable-next-line i18next/no-literal-string -- enum value
            { value: '24h', label: t('panel.widget.clock.settings.format24h') },
            // eslint-disable-next-line i18next/no-literal-string -- enum value
            { value: '12h', label: t('panel.widget.clock.settings.format12h') },
          ]}
          onChange={setFormat}
        />
        <SettingsToggle
          label={t('panel.widget.clock.settings.showSeconds')}
          checked={showSeconds}
          onChange={setShowSeconds}
        />
        <SettingsToggle
          label={t('panel.widget.clock.settings.showDate')}
          checked={showDate}
          onChange={setShowDate}
        />
        <SettingsToggle
          label={t('panel.widget.clock.settings.useAccentColor')}
          checked={useAccentColor}
          onChange={setUseAccentColor}
        />
      </SettingsSection>

      <SettingsSection title={t('panel.widget.clock.settings.timezone')}>
        <SettingsRow label={t('panel.widget.clock.settings.timezone')}>
          <input
            type="text"
            className={styles.textInput}
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            placeholder={t('panel.widget.clock.settings.timezoneAuto')}
            spellCheck={false}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default ClockSettings;
