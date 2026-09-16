import { useTranslation } from '../../../lib/i18n';
import { Toggle } from '../../common/Toggle/Toggle';

interface MonitorToggleProps {
  monitored: boolean;
  onChange: (monitored: boolean) => void;
}

/** Monitor switch a diagnostics device card or row carries, beside its status
 *  badge; off = the device is on the ignore list and stays out of health. */
export function MonitorToggle({ monitored, onChange }: MonitorToggleProps) {
  const { t } = useTranslation();
  return <Toggle checked={monitored} onChange={onChange} ariaLabel={t('diagnostics.monitor.label')} />;
}
