import { Fragment } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import type { LianLiFansState } from '../../../api/lianli-wireless';
import { buildLianLiWirelessCoolingChains, WIRELESS_CHANNEL_PREFIX } from './lianliWirelessCoolingUtils';
import { fanTypeKey } from './LianLiWirelessFansTab';
import { CoolingFanRow, useCoolingChannels } from './CoolingFanRow';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { LianLiFlexFanProfileSection, flexFanModeLabel, useLianLiFlexProfiles } from './LianLiFlexFanProfile';
import type { DashboardSectionNavigate } from '../../../panel/engine/panelLayoutHelpers';
import { useTranslation } from '../../../lib/i18n';
import rowStyles from './CoolingFanRow.module.scss';

interface LianLiWirelessCoolingTabProps {
  state: LianLiFansState | null;
  /** Id prefix of the family's channels in the cooling list. */
  channelPrefix?: string;
  /** Wired LCD Flex fans: each unit also gets its fan profile section. */
  flex?: boolean;
  onSectionNavigate?: DashboardSectionNavigate;
}

/**
 * Cooling tab: a read-only line per port of every bound fan chain with its
 * live RPM and how it is driven. Every setting lives on the Cooling page.
 */
export function LianLiWirelessCoolingTab({ state, channelPrefix = WIRELESS_CHANNEL_PREFIX, flex = false, onSectionNavigate }: LianLiWirelessCoolingTabProps) {
  const { t } = useTranslation();
  const { channels, curves } = useCoolingChannels();
  const chains = buildLianLiWirelessCoolingChains(state?.fans ?? [], channels, channelPrefix);
  const profiles = useLianLiFlexProfiles(flex ? chains.map(c => c.mac) : []);
  const known = Object.values(profiles.byMac);

  return (
    <>
      {flex && known.length > 1 && (
        <SettingsSection title={t('devices.lianli-flex.allFansSection')} boxClassName={rowStyles.rows}>
          <SettingToggle
            label={t('devices.lianli-flex.mbSyncAll')}
            description={t('devices.lianli-flex.mbSyncAllHint')}
            checked={known.every(d => d.mbSync)}
            mixed={known.some(d => d.mbSync) && !known.every(d => d.mbSync)}
            onChange={on => { void profiles.commitAllMbSync(on); }}
          />
        </SettingsSection>
      )}
      {chains.map(chain => (
        <Fragment key={chain.mac}>
        <SettingsSection
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
              modeLabel={profiles.byMac[chain.mac] ? flexFanModeLabel(t, profiles.byMac[chain.mac]) : undefined}
            />
          ))}
        </SettingsSection>
        {flex && profiles.byMac[chain.mac] && (
          <LianLiFlexFanProfileSection
            mac={chain.mac}
            title={t(`devices.lianli-wireless.${fanTypeKey(chain.fanType)}` as Parameters<typeof t>[0])}
            data={profiles.byMac[chain.mac]}
            profiles={profiles}
            onSectionNavigate={onSectionNavigate}
          />
        )}
        </Fragment>
      ))}
    </>
  );
}
