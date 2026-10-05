import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import type { LianLiWirelessState } from '../../../api/lianli-wireless';
import { buildLianLiWirelessCoolingChains } from './lianliWirelessCoolingUtils';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { CoolingFanRow, useCoolingChannels } from './CoolingFanRow';
import { useTranslation } from '../../../lib/i18n';
import rowStyles from './CoolingFanRow.module.scss';

interface LianLiWirelessCoolingTabProps {
  state: LianLiWirelessState | null;
}

/**
 * Cooling tab: a read-only line per port of every bound fan chain with its
 * live RPM and how it is driven. Every setting lives on the Cooling page.
 */
export function LianLiWirelessCoolingTab({ state }: LianLiWirelessCoolingTabProps) {
  const { t } = useTranslation();
  const { channels, curves } = useCoolingChannels();
  const chains = buildLianLiWirelessCoolingChains(state?.fans ?? [], channels);

  return (
    <>
      {chains.map(chain => (
        <SettingsSection
          key={chain.mac}
          title={t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<typeof t>[0])}
          boxClassName={rowStyles.rows}
        >
          {chain.ports.map(p => (
            <CoolingFanRow
              key={p.port}
              label={t('devices.lianli-wireless.fanN', { n: p.port + 1 })}
              rpm={p.rpm}
              rpmUnavailable={p.rpmUnavailable}
              channel={p.channel}
              curves={curves}
            />
          ))}
        </SettingsSection>
      ))}
    </>
  );
}
