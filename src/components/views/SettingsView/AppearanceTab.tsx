import { useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CalendarDays, Clock, Hash } from 'lucide-react';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { Select } from '../../common/Select/Select';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { ThemeTab } from './ThemeTab';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import {
  DATE_FORMATS, DEFAULT_CUSTOM_DATE_FORMAT, formatDate,
  type TimeFormat, type NumberFormat, type DateFormat,
} from '../../../lib/units';
import styles from './SettingsView.module.scss';

export interface AppearanceTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
}

export function AppearanceTab({ settings, updateGeneral }: AppearanceTabProps) {
  const { t } = useTranslation();
  // Specimen for the format list: a day above twelve keeps day-first and
  // month-first patterns distinct.
  const dateSample = new Date(new Date().getFullYear(), 11, 31);
  const dateFormat = settings.general.dateFormat;
  // Remembers the last custom pattern seen this visit (including one that
  // arrives after mount), so System -> Custom restores it.
  const [lastCustomDate, setLastCustomDate] = useState<DateFormat>(DEFAULT_CUSTOM_DATE_FORMAT);
  if (dateFormat !== 'system' && dateFormat !== lastCustomDate) setLastCustomDate(dateFormat);

  return (
    <div className={styles.tabPanel}>
      <SettingsSection title={t('settings.theme')}>
        <ThemeTab settings={settings} updateGeneral={updateGeneral} />
      </SettingsSection>

      <SettingsSection title={t('settings.units.title')}>
        <SettingRow label={t('settings.units.time.label')} anchorId="set-time-format" icon={<Clock />} iconLeading="subtle">
          <ChipGroup
            ariaLabel={t('settings.units.time.label')}
            activeKey={settings.general.timeFormat}
            onChange={k => updateGeneral({ timeFormat: k as TimeFormat })}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- time format enum value
              { key: 'system', label: t('settings.units.system') },
              // eslint-disable-next-line i18next/no-literal-string -- time format enum value
              { key: '12h', label: t('settings.units.time.h12') },
              // eslint-disable-next-line i18next/no-literal-string -- time format enum value
              { key: '24h', label: t('settings.units.time.h24') },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('settings.units.number.label')} anchorId="set-number-format" icon={<Hash />} iconLeading="subtle">
          <ChipGroup
            ariaLabel={t('settings.units.number.label')}
            activeKey={settings.general.numberFormat}
            onChange={k => updateGeneral({ numberFormat: k as NumberFormat })}
            options={[
              // eslint-disable-next-line i18next/no-literal-string -- number format enum value
              { key: 'system', label: t('settings.units.system') },
              // eslint-disable-next-line i18next/no-literal-string -- number format specimen
              { key: 'dot', label: '1,234.56' },
              // eslint-disable-next-line i18next/no-literal-string -- number format specimen
              { key: 'comma', label: '1.234,56' },
            ]}
          />
        </SettingRow>
        {/* One box child: the pattern list belongs to this row, so it must not
            pick up the box's row divider. */}
        <div className={styles.dateFormatGroup}>
          <SettingRow label={t('settings.units.date.label')} anchorId="set-date-format" icon={<CalendarDays />} iconLeading="subtle">
            <ChipGroup
              ariaLabel={t('settings.units.date.label')}
              // eslint-disable-next-line i18next/no-literal-string -- date format source key
              activeKey={dateFormat === 'system' ? 'system' : 'custom'}
              onChange={k => updateGeneral({ dateFormat: k === 'system' ? 'system' : lastCustomDate })}
              options={[
                // eslint-disable-next-line i18next/no-literal-string -- date format source key
                { key: 'system', label: t('settings.units.system') },
                // eslint-disable-next-line i18next/no-literal-string -- date format source key
                { key: 'custom', label: t('settings.units.custom') },
              ]}
            />
          </SettingRow>
          {dateFormat !== 'system' && (
            <div className={styles.dateFormatRow}>
              <Select
                ariaLabel={t('settings.units.date.label')}
                value={dateFormat}
                onChange={v => updateGeneral({ dateFormat: v as DateFormat })}
                options={DATE_FORMATS.filter(f => f !== 'system').map(f => ({ value: f, label: formatDate(dateSample, f) }))}
              />
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
