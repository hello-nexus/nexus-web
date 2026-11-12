import { useTranslation } from '../../../lib/i18n';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { Toggle } from '../../common/Toggle/Toggle';
import styles from './DiagnosticsView.module.scss';

interface ComponentMonitorSwitchProps {
  setting: 'diagnosticsComponentRam' | 'diagnosticsComponentSystem';
  labelKey: string;
}

/** Labelled on/off switch for a whole-component health check, on that component's own tab. */
export function ComponentMonitorSwitch({ setting, labelKey }: ComponentMonitorSwitchProps) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  return (
    <label className={styles.componentSwitch}>
      <span>{t(labelKey)}</span>
      <Toggle checked={settings[setting]} onChange={v => update({ [setting]: v })} ariaLabel={t(labelKey)} />
    </label>
  );
}
