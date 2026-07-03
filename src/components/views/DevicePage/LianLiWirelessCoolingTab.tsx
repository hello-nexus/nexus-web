import { Placeholder } from '../Placeholder';
import { useTranslation } from '../../../lib/i18n';

export function LianLiWirelessCoolingTab() {
  const { t } = useTranslation();
  return <Placeholder title={t('devices.lianli-wireless.tab.placeholder')} />;
}
