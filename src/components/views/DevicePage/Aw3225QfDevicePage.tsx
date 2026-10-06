import { Crosshair } from 'lucide-react';
import type { Aw3225QfCrosshairConfig } from '../../../api/aw3225qf';
import { useAw3225QfCrosshair } from '../../../hooks/useAw3225QfCrosshair';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { Select } from '../../common/Select/Select';
import { Toggle } from '../../common/Toggle/Toggle';
import { useTranslation } from '../../../lib/i18n';
import styles from './Aw3225QfDevicePage.module.scss';

const typeNames = ['dot', 'crossSmall', 'crossLarge', 'barSmall', 'barMedium', 'barLarge', 'thruSmall', 'thruMedium', 'thruLarge', 'squareSmall', 'squareMedium', 'squareLarge'];
const colorNames = ['off', 'black', 'white', 'red', 'blue', 'green'];
const maskNames = ['static', 'adaptive', 'dynamic'];
const CROSSHAIR_TAB = 'crosshair';

export function Aw3225QfDevicePage() {
  const { t } = useTranslation();
  const { status, config, busy, readFailed, apply } = useAw3225QfCrosshair();
  const disabled = busy || readFailed || !status?.connected || !!status.error;

  const select = (key: keyof Aw3225QfCrosshairConfig, value: string) => {
    const next = { ...config, [key]: Number(value) };
    if (!disabled && status) void apply(status.enabled, next);
  };

  const optionList = (names: string[], kind: string) => names.map((name, value) => ({
    value: String(value), label: t(`devices.aw3225qf.${kind}.${name}`),
  }));

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand and model name
        title="Alienware AW3225QF"
        tabs={[{ key: CROSSHAIR_TAB, label: t('devices.aw3225qf.tab'), icon: <Crosshair size={14} /> }]}
        activeTab={CROSSHAIR_TAB}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.aw3225qf.title')} boxClassName={styles.sectionBox}>
          <SettingRow label={t('devices.aw3225qf.enabled')}>
            <Toggle checked={status?.enabled ?? false} disabled={disabled} ariaLabel={t('devices.aw3225qf.enabled')} onChange={enabled => void apply(enabled, config)} />
          </SettingRow>
          <SettingRow label={t('devices.aw3225qf.style')}>
            <Select value={String(config.type)} onChange={value => select('type', value)} options={optionList(typeNames, 'type')} disabled={disabled} ariaLabel={t('devices.aw3225qf.style')} />
          </SettingRow>
          <SettingRow label={t('devices.aw3225qf.color')}>
            <Select value={String(config.color)} onChange={value => select('color', value)} options={optionList(colorNames, 'colorOption')} disabled={disabled} ariaLabel={t('devices.aw3225qf.color')} />
          </SettingRow>
          <SettingRow label={t('devices.aw3225qf.mask')}>
            <Select value={String(config.maskControl)} onChange={value => select('maskControl', value)} options={optionList(maskNames, 'maskOption')} disabled={disabled} ariaLabel={t('devices.aw3225qf.mask')} />
          </SettingRow>
        </SettingsSection>
        {status?.error && <p className={styles.hint}>{status.error}</p>}
        {readFailed && <p className={styles.hint}>{t('devices.aw3225qf.readFailed')}</p>}
      </div>
    </div>
  );
}
