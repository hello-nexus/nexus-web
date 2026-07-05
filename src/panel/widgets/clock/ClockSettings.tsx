import { useState } from 'react';
import {
  Binary,
  ChevronDown,
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
import { TimezonePicker } from './TimezonePicker';
import { humanizeTimeZone, safeTimeZone } from './timezones';
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
  const [tzOpen, setTzOpen] = useState(false);
  const currentDesign = ((widget.config?.design as string | undefined) ?? 'digital');
  const format = ((widget.config?.format as string | undefined) ?? '24h');
  const showSeconds = ((widget.config?.showSeconds as boolean | undefined) ?? false);
  const showDate = ((widget.config?.showDate as boolean | undefined) ?? true);
  const useAccentColor = ((widget.config?.useAccentColor as boolean | undefined) ?? false);
  // safeTimeZone discards a stale invalid value (saved by an older build's
  // free-text field) so the trigger shows Auto instead of a broken string.
  const timezone = safeTimeZone(widget.config?.timezone as string | undefined) ?? null;

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

  const setTimezone = (value: string | null) => {
    onUpdate({ timezone: value });
    setTzOpen(false);
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
          <button
            type="button"
            className={styles.tzTrigger}
            onClick={() => setTzOpen(open => !open)}
            aria-expanded={tzOpen}
          >
            <span className={styles.tzValue}>
              {timezone ? humanizeTimeZone(timezone) : t('panel.widget.clock.settings.timezoneAuto')}
            </span>
            <ChevronDown size={14} className={styles.tzChevron} aria-hidden={true} />
          </button>
        </SettingsRow>
        {tzOpen && (
          <div data-settings-aside="true">
            <TimezonePicker value={timezone} onChange={setTimezone} />
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

export default ClockSettings;
