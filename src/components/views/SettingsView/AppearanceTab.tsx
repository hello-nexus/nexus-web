import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { Clock, Hash } from 'lucide-react';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { ThemeTab } from './ThemeTab';
import { useTranslation } from '../../../lib/i18n';
import type { NexusSettings } from '../../../lib/settings';
import type { TimeFormat, NumberFormat } from '../../../lib/units';
import styles from './SettingsView.module.scss';

export interface AppearanceTabProps {
  settings: NexusSettings;
  updateGeneral: (patch: Partial<NexusSettings['general']>) => void;
}

export function AppearanceTab({ settings, updateGeneral }: AppearanceTabProps) {
  const { t } = useTranslation();

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
      </SettingsSection>
    </div>
  );
}
